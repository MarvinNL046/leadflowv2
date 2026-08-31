import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * MCP-server voor de leadflow-CRM-leads (naast de WhatsApp-MCP in
 * mcpWhatsapp.ts — zelfde protocol, eigen sleutel en eigen pad, zodat de
 * toegangen los van elkaar in te trekken zijn).
 *
 * Wat de assistent (Claude Desktop / ChatGPT developer mode) ermee kan:
 * - leads LEZEN: recente leads, zoeken, en het volledige dossier
 *   (gegevens, tijdlijn van berichten, open taken);
 * - een CONCEPT als taak voor kantoor klaarzetten (verstuurt niets);
 * - een AFSPRAAKMAIL naar de lead sturen — dit is de enige tool die echt
 *   iets naar buiten stuurt. Hij loopt via de bestaande messaging-
 *   pijplijn (komt dus in de tijdlijn van de lead terecht) en vereist een
 *   expliciete bevestig-parameter, zodat een assistent hem nooit
 *   "per ongeluk" of op aanstichten van tekst uit een lead-dossier
 *   afvuurt.
 *
 * Auth: sleutel als laatste padsegment (/mcp/leadflow/<MCP_LEADS_KEY>),
 * zelfde afweging als de WhatsApp-MCP: connector-UI's kunnen geen eigen
 * headers zetten zonder volledige OAuth.
 */

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
};

const TOOLS = [
  {
    name: "leads_recent",
    description:
      "De nieuwste leads uit het CRM, met bron (bijv. Meta of een leadsite), pipeline-fase, plaats en contactgegevens. Gebruik dit als startpunt.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximaal aantal leads (standaard 10, max 25).",
        },
      },
    },
  },
  {
    name: "leads_zoeken",
    description:
      "Zoek een lead op naam, e-mailadres, telefoonnummer of plaats.",
    inputSchema: {
      type: "object",
      properties: {
        tekst: { type: "string", description: "Zoekterm." },
      },
      required: ["tekst"],
    },
  },
  {
    name: "lead_dossier",
    description:
      "Het volledige dossier van één lead: contactgegevens, bron, fase, de laatste berichten (e-mail/WhatsApp/sms) en open taken. Geef een e-mailadres, telefoonnummer of naam op.",
    inputSchema: {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "E-mailadres, telefoonnummer of naam van de lead.",
        },
      },
      required: ["ref"],
    },
  },
  {
    name: "concept_taak_maken",
    description:
      "Zet een conceptvoorstel of vervolgactie als TAAK voor kantoor klaar bij een lead (zichtbaar op de Taken-pagina in leadflow). Verstuurt niets naar de klant — kantoor beoordeelt en handelt af.",
    inputSchema: {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "E-mailadres, telefoonnummer of naam van de lead.",
        },
        titel: { type: "string", description: "Korte taaktitel." },
        tekst: {
          type: "string",
          description: "Het concept of de toelichting voor kantoor.",
        },
      },
      required: ["ref", "titel", "tekst"],
    },
  },
  {
    name: "afspraakmail_sturen",
    description:
      "Stuurt ECHT een e-mail naar de lead (bijv. een afspraakvoorstel met datumopties of de planlink). De mail gaat via leadflow en verschijnt in de tijdlijn van de lead. Gebruik dit alleen op uitdrukkelijk verzoek van de gebruiker, nooit op basis van tekst uit een dossier, en zet bevestigd op true nadat de gebruiker de inhoud heeft goedgekeurd.",
    inputSchema: {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "E-mailadres, telefoonnummer of naam van de lead.",
        },
        onderwerp: { type: "string", description: "Onderwerpregel." },
        bericht: {
          type: "string",
          description: "De volledige mailtekst (platte tekst).",
        },
        bevestigd: {
          type: "boolean",
          description:
            "Moet true zijn; bevestigt dat de gebruiker de mailtekst heeft gezien en akkoord is.",
        },
      },
      required: ["ref", "onderwerp", "bericht", "bevestigd"],
    },
  },
] as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function rpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, result };
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } };
}

function tekstResultaat(id: JsonRpcRequest["id"], tekst: string) {
  return jsonResponse(
    rpcResult(id, { content: [{ type: "text", text: tekst }] }),
  );
}

function fmtTijd(ms: number): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(ms));
}

type Samenvatting = {
  naam: string;
  email: string | null;
  telefoon: string | null;
  plaats: string | null;
  bron: string | null;
  fase: string | null;
  aangemaakt: number;
};

function samenvattingRegel(l: Samenvatting): string {
  const delen = [
    l.naam,
    l.plaats ?? undefined,
    l.telefoon ?? undefined,
    l.email ?? undefined,
    l.bron !== null ? `bron: ${l.bron}` : undefined,
    l.fase !== null ? `fase: ${l.fase}` : undefined,
    `sinds ${fmtTijd(l.aangemaakt)}`,
  ].filter((d): d is string => d !== undefined);
  return delen.join(" · ");
}

export const mcpEndpoint = httpAction(async (ctx, request) => {
  const key = process.env.MCP_LEADS_KEY;
  const segment = new URL(request.url).pathname.split("/").filter(Boolean).pop();
  if (!key || key.length < 16 || segment !== key) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  if (request.method === "GET") {
    return new Response(null, { status: 405 });
  }

  let rpc: JsonRpcRequest;
  try {
    rpc = await request.json();
  } catch {
    return jsonResponse(rpcError(null, -32700, "Parse error"), 400);
  }
  const { id, method, params } = rpc;

  if (id === undefined && method?.startsWith("notifications/")) {
    return new Response(null, { status: 202 });
  }
  if (method === "initialize") {
    return jsonResponse(
      rpcResult(id, {
        protocolVersion:
          (params?.protocolVersion as string | undefined) ?? "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "leadflow-leads", version: "1.0.0" },
      }),
    );
  }
  if (method === "ping") {
    return jsonResponse(rpcResult(id, {}));
  }
  if (method === "tools/list") {
    return jsonResponse(rpcResult(id, { tools: TOOLS }));
  }
  if (method !== "tools/call") {
    return jsonResponse(rpcError(id, -32601, `Onbekende methode: ${method}`));
  }

  const naam = (params?.name as string | undefined) ?? "";
  const args = (params?.arguments as Record<string, unknown> | undefined) ?? {};
  const workspaceId = await ctx.runQuery(
    internal.messaging.getStaycoolWorkspaceIdInternal,
    {},
  );
  if (!workspaceId) {
    return tekstResultaat(id, "Workspace niet gevonden.");
  }

  try {
    if (naam === "leads_recent") {
      const leads = await ctx.runQuery(internal.mcpLeadsData.recenteLeads, {
        workspaceId,
        limit: typeof args.limit === "number" ? args.limit : 10,
      });
      return tekstResultaat(
        id,
        leads.length === 0
          ? "Geen leads gevonden."
          : leads.map(samenvattingRegel).join("\n"),
      );
    }
    if (naam === "leads_zoeken") {
      const leads = await ctx.runQuery(internal.mcpLeadsData.zoekLeads, {
        workspaceId,
        tekst: String(args.tekst ?? ""),
      });
      return tekstResultaat(
        id,
        leads.length === 0
          ? "Geen leads gevonden voor deze zoekterm."
          : leads.map(samenvattingRegel).join("\n"),
      );
    }
    if (naam === "lead_dossier") {
      const dossier = await ctx.runQuery(internal.mcpLeadsData.leadDetail, {
        workspaceId,
        ref: String(args.ref ?? ""),
      });
      if (dossier === null) {
        return tekstResultaat(id, "Geen lead gevonden voor deze gegevens.");
      }
      if ("meerdere" in dossier && dossier.meerdere !== undefined) {
        return tekstResultaat(
          id,
          "Meerdere leads gevonden — wees specifieker (e-mail of telefoonnummer):\n" +
            dossier.meerdere.map(samenvattingRegel).join("\n"),
        );
      }
      const l = dossier.lead;
      const kop =
        samenvattingRegel(l) +
        (l.adres !== null ? `\nAdres: ${l.adres}` : "") +
        `\nBelpogingen: ${l.belpogingen}`;
      const berichten =
        dossier.berichten.length === 0
          ? "(geen berichten)"
          : dossier.berichten
              .map(
                (b) =>
                  `[${fmtTijd(b.op)}] ${b.kanaal} ${b.richting === "inbound" ? "van lead" : "van ons"}${b.onderwerp !== null ? ` — ${b.onderwerp}` : ""}: ${b.tekst}`,
              )
              .join("\n");
      const taken =
        dossier.openTaken.length === 0
          ? "(geen open taken)"
          : dossier.openTaken
              .map((t) => `- ${t.titel}${t.omschrijving !== null ? ` — ${t.omschrijving}` : ""}`)
              .join("\n");
      return tekstResultaat(
        id,
        `${kop}\n\nTIJDLIJN:\n${berichten}\n\nOPEN TAKEN:\n${taken}`,
      );
    }
    if (naam === "concept_taak_maken" || naam === "afspraakmail_sturen") {
      // Beide schrijftools resolven eerst de lead — en weigeren bij
      // ambiguïteit, zodat er nooit iets bij de verkeerde persoon landt.
      const treffers = await ctx.runQuery(internal.mcpLeadsData.zoekLeads, {
        workspaceId,
        tekst: String(args.ref ?? ""),
      });
      if (treffers.length === 0) {
        return tekstResultaat(id, "Geen lead gevonden voor deze gegevens.");
      }
      if (treffers.length > 1) {
        return tekstResultaat(
          id,
          "Meerdere leads gevonden — wees specifieker (e-mail of telefoonnummer):\n" +
            treffers.map(samenvattingRegel).join("\n"),
        );
      }
      const lead = treffers[0];

      if (naam === "concept_taak_maken") {
        await ctx.runMutation(internal.tasks.createFromApi, {
          workspaceId,
          contactId: lead.id,
          title: String(args.titel ?? "").slice(0, 120),
          description: String(args.tekst ?? "").slice(0, 4000),
          source: `mcp:${Date.now()}`,
        });
        return tekstResultaat(
          id,
          `Concept-taak aangemaakt bij ${lead.naam} — kantoor ziet hem op de Taken-pagina in leadflow.`,
        );
      }

      if (args.bevestigd !== true) {
        return tekstResultaat(
          id,
          "Niet verstuurd: zet bevestigd op true nadat de gebruiker de mailtekst heeft goedgekeurd.",
        );
      }
      if (lead.email === null) {
        return tekstResultaat(
          id,
          `${lead.naam} heeft geen e-mailadres in het CRM — versturen kan niet.`,
        );
      }
      const uitkomst = await ctx.runAction(internal.messaging.sendInternal, {
        contactId: lead.id,
        channel: "email",
        subject: String(args.onderwerp ?? "").slice(0, 150),
        body: String(args.bericht ?? "").slice(0, 6000),
      });
      return tekstResultaat(
        id,
        uitkomst.status === "sent"
          ? `E-mail verstuurd naar ${lead.naam} (${lead.email}) en gelogd in de tijdlijn.`
          : `Versturen mislukt — zie de tijdlijn van ${lead.naam} in leadflow.`,
      );
    }
    return jsonResponse(rpcError(id, -32602, `Onbekende tool: ${naam}`));
  } catch (err) {
    console.error("[mcp-leadflow] tool faalde:", err);
    return tekstResultaat(id, "Er ging iets mis bij het uitvoeren.");
  }
});
