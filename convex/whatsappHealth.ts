import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { VOIDFIX_WA_BASE } from "./lib/voidfix";

// ─────────────────────────────────────────────────────────────────────────────
// Bewaking van de WhatsApp-koppeling (Voidfix).
//
// AANLEIDING: de sessie is rond 16 juli 2026 stilgevallen en dat is vijf weken
// niemand opgevallen. In de database bleef `isActive: true` staan en
// `lastSeenAt` stond bevroren op 5 juni, want de enige statuscontrole die
// bestond (integrations.checkWhatsappStatus) draait alleen wanneer iemand de
// instellingenpagina opent. Ondertussen liepen sms en e-mail gewoon door, dus
// aan het aantal binnenkomende berichten was ook niets te zien.
//
// Deze module vraagt periodiek de echte sessiestatus op bij Voidfix, schrijft
// die weg, en stuurt een mail zodra de koppeling van verbonden naar verbroken
// gaat. De mail gaat naar EMAIL_ALERTS_TO, of anders naar EMAIL_FROM.
//
// De alarmmail komt hoogstens eens per ALERT_COOLDOWN_MS, zodat een sessie die
// dagenlang neerligt niet elk kwartier een mail oplevert.
// ─────────────────────────────────────────────────────────────────────────────

const ALERT_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 uur

type SessieStand = {
  workspaceId: Id<"workspaces">;
  sessionId: string;
  phoneNumber: string;
  isActive: boolean;
  lastSeenAt: number | null;
  lastAlertAt: number | null;
};

export const alleSessies = internalQuery({
  args: {},
  handler: async (ctx): Promise<SessieStand[]> => {
    const rijen = await ctx.db.query("whatsappWebConfig").collect();
    return rijen.map((c) => ({
      workspaceId: c.workspaceId,
      sessionId: c.sessionId,
      phoneNumber: c.phoneNumber,
      isActive: c.isActive,
      lastSeenAt: c.lastSeenAt ?? null,
      lastAlertAt: c.lastAlertAt ?? null,
    }));
  },
});

export const legStandVast = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    isActive: v.boolean(),
    phoneNumber: v.optional(v.string()),
    alerted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const rij = await ctx.db
      .query("whatsappWebConfig")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .first();
    if (!rij) return;
    await ctx.db.patch(rij._id, {
      isActive: args.isActive,
      // lastSeenAt is "voor het laatst aantoonbaar verbonden geweest" en mag
      // dus alleen vooruit lopen als de sessie ook echt verbonden is.
      ...(args.isActive ? { lastSeenAt: Date.now() } : {}),
      ...(args.phoneNumber ? { phoneNumber: args.phoneNumber } : {}),
      ...(args.alerted ? { lastAlertAt: Date.now() } : {}),
    });
  },
});

async function stuurAlarmmail(
  telefoon: string,
  status: string,
  lastSeenAt: number | null,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const from = process.env.EMAIL_FROM ?? "LeadFlow <noreply@wetryleadflow.com>";
  const to = process.env.EMAIL_ALERTS_TO ?? from.replace(/^.*<|>$/g, "");

  const sinds = lastSeenAt
    ? new Date(lastSeenAt).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })
    : "onbekend";

  const tekst =
    `De WhatsApp-koppeling van LeadFlow is verbroken.\n\n` +
    `Telefoonnummer: +${telefoon}\n` +
    `Status bij Voidfix: ${status}\n` +
    `Laatst verbonden: ${sinds}\n\n` +
    `Zolang dit zo staat komen WhatsApp-berichten van leads NIET in LeadFlow ` +
    `binnen. Ze komen wel gewoon op de telefoon aan, maar het gesprek wordt ` +
    `niet vastgelegd en de AI-opvolging slaat dit kanaal over.\n\n` +
    `Herstellen: open LeadFlow > Instellingen > Integraties > WhatsApp en scan ` +
    `de QR-code opnieuw met de bedrijfstelefoon.\n\n` +
    `Deze melding komt hoogstens eens per 12 uur.`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: "WhatsApp-koppeling verbroken — leads komen niet binnen",
        text: tekst,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const legStandVastOpSessie = internalMutation({
  args: {
    sessionId: v.string(),
    isActive: v.boolean(),
    phoneNumber: v.optional(v.string()),
    alerted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const rij = (await ctx.db.query("whatsappWebConfig").collect()).find(
      (c) => c.sessionId === args.sessionId,
    );
    // Onbekende sessie: Voidfix kent negen sessies van vroegere koppelpogingen
    // en stuurt daar ook events voor. Alleen de sessie die in LeadFlow staat
    // telt; de rest negeren we stil.
    if (!rij) return { bekend: false };
    await ctx.db.patch(rij._id, {
      isActive: args.isActive,
      ...(args.isActive ? { lastSeenAt: Date.now() } : {}),
      ...(args.phoneNumber ? { phoneNumber: args.phoneNumber } : {}),
      ...(args.alerted ? { lastAlertAt: Date.now() } : {}),
    });
    return { bekend: true, lastAlertAt: rij.lastAlertAt ?? null };
  },
});

/**
 * Verwerkt een session-status-webhook van Voidfix.
 *
 * De kwartiercron is de vangnet-controle; deze route maakt het onmiddellijk.
 * Statussen die Voidfix gebruikt: CONNECTED/WORKING = verbonden, STOPPED,
 * FAILED en SCAN_QR_CODE = niet verbonden. Bij een status die we niet kennen
 * doen we niets: liever een kwartier later goed dan nu verkeerd.
 */
export const meldSessieStatus = internalAction({
  args: {
    sessionId: v.string(),
    status: v.optional(v.string()),
    isConnected: v.optional(v.boolean()),
    phoneNumber: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ verwerkt: boolean; gemaild: boolean }> => {
    const st = (args.status ?? "").toUpperCase();
    const verbonden = new Set(["CONNECTED", "WORKING", "AUTHENTICATED", "READY"]);
    const verbroken = new Set(["STOPPED", "FAILED", "SCAN_QR_CODE", "DISCONNECTED", "TIMEOUT"]);

    let isActive: boolean;
    if (typeof args.isConnected === "boolean") isActive = args.isConnected;
    else if (verbonden.has(st)) isActive = true;
    else if (verbroken.has(st)) isActive = false;
    else {
      console.warn("[whatsapp-health] onbekende sessiestatus:", args.status);
      return { verwerkt: false, gemaild: false };
    }

    const res: { bekend: boolean; lastAlertAt?: number | null } =
      await ctx.runMutation(internal.whatsappHealth.legStandVastOpSessie, {
        sessionId: args.sessionId,
        isActive,
        phoneNumber: args.phoneNumber,
      });
    if (!res.bekend) return { verwerkt: false, gemaild: false };

    const magMailen =
      !isActive &&
      (res.lastAlertAt == null || Date.now() - res.lastAlertAt > ALERT_COOLDOWN_MS);
    let gemaild = false;
    if (magMailen) {
      gemaild = await stuurAlarmmail(args.phoneNumber ?? "onbekend", st || "verbroken", null);
      if (gemaild) {
        await ctx.runMutation(internal.whatsappHealth.legStandVastOpSessie, {
          sessionId: args.sessionId,
          isActive,
          alerted: true,
        });
      }
    }
    return { verwerkt: true, gemaild };
  },
});

/**
 * Vraagt per workspace de sessiestatus op bij Voidfix, legt die vast en
 * alarmeert bij een overgang van verbonden naar verbroken.
 *
 * Bewust géén alarm wanneer Voidfix zelf onbereikbaar is: dat zegt iets over
 * Voidfix of het netwerk, niet over de koppeling, en zou vals alarm geven bij
 * elke korte storing. De stand blijft dan staan zoals hij stond.
 */
export const controleerSessies = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    gecontroleerd: number;
    verbroken: number;
    gemaild: number;
    onbereikbaar: number;
  }> => {
    const apiKey = process.env.VOIDFIX_API_KEY;
    const sessies: SessieStand[] = await ctx.runQuery(
      internal.whatsappHealth.alleSessies,
      {},
    );
    if (!apiKey || sessies.length === 0) {
      return { gecontroleerd: 0, verbroken: 0, gemaild: 0, onbereikbaar: 0 };
    }

    let verbroken = 0;
    let gemaild = 0;
    let onbereikbaar = 0;

    for (const s of sessies) {
      let json: {
        success?: boolean;
        data?: {
          isConnected?: boolean;
          phoneNumber?: string | null;
          status?: string | null;
        };
        isConnected?: boolean;
        phoneNumber?: string | null;
        status?: string | null;
      };
      try {
        const res = await fetch(
          `${VOIDFIX_WA_BASE}/api/external/session-status/${encodeURIComponent(s.sessionId)}`,
          { headers: { "X-API-Key": apiKey } },
        );
        json = JSON.parse(await res.text());
      } catch {
        // Voidfix onbereikbaar → stand ongemoeid laten, maar WEL terugmelden.
        // Een mislukte controle die als "alles in orde" terugkomt is precies
        // de stille fout die deze bewaker moet voorkomen.
        onbereikbaar++;
        continue;
      }
      if (json.success === false) {
        onbereikbaar++;
        continue;
      }

      const data = json.data ?? json;
      const isConnected = Boolean(data.isConnected);
      const status = data.status ?? (isConnected ? "CONNECTED" : "ONBEKEND");
      // Voidfix stuurt null voor een sessie die nog niet gescand is; Convex
      // accepteert bij v.optional() wel "afwezig" maar geen null.
      const tel = data.phoneNumber ?? undefined;

      const magMailen =
        !isConnected &&
        (s.lastAlertAt === null || Date.now() - s.lastAlertAt > ALERT_COOLDOWN_MS);

      let gemaildNu = false;
      if (magMailen) {
        gemaildNu = await stuurAlarmmail(tel ?? s.phoneNumber, status, s.lastSeenAt);
        if (gemaildNu) gemaild++;
      }
      if (!isConnected) verbroken++;

      await ctx.runMutation(internal.whatsappHealth.legStandVast, {
        workspaceId: s.workspaceId,
        isActive: isConnected,
        phoneNumber: tel,
        alerted: gemaildNu,
      });
    }

    return { gecontroleerd: sessies.length, verbroken, gemaild, onbereikbaar };
  },
});
