"use node";
/**
 * Google Calendar-koppeling (service account, zelfde credentials als
 * afspraken-v2). Quick win: bij "Opgenomen → afspraak ingepland" met
 * datum wordt automatisch het adviesgesprek-event in de bedrijfsagenda
 * gezet. Env vars (per deployment): GOOGLE_CALENDAR_ID,
 * GOOGLE_CALENDAR_CLIENT_EMAIL, GOOGLE_CALENDAR_PRIVATE_KEY.
 */
import { createSign } from "node:crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { buildAppointmentEvent } from "./googleCalendarLogic";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/calendar";

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Service-account JWT → OAuth2 access token. */
async function getAccessToken(
  clientEmail: string,
  privateKey: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = b64url(signer.sign(privateKey.replace(/\\n/g, "\n")));
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token request faalde: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/**
 * Maakt het adviesgesprek-event aan en zet een bevestigings-note op het
 * contact. Faalt de agenda-call, dan komt er een waarschuwings-note —
 * de CRM-flow zelf is dan al gewoon doorgegaan (fire-and-forget via
 * scheduler).
 */
export const createAppointmentEvent = internalAction({
  args: {
    contactId: v.id("contacts"),
    startMs: v.number(),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    city: v.optional(v.string()),
    street: v.optional(v.string()),
    houseNumber: v.optional(v.string()),
    houseNumberAddition: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    const clientEmail = process.env.GOOGLE_CALENDAR_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_CALENDAR_PRIVATE_KEY;
    if (!calendarId || !clientEmail || !privateKey) {
      console.log(
        "googleCalendar: env vars ontbreken — agenda-event overgeslagen",
      );
      return;
    }

    const event = buildAppointmentEvent(
      {
        name: args.name,
        phone: args.phone,
        email: args.email,
        city: args.city,
        street: args.street,
        houseNumber: args.houseNumber,
        houseNumberAddition: args.houseNumberAddition,
      },
      args.startMs,
    );

    try {
      const token = await getAccessToken(clientEmail, privateKey);
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        },
      );
      if (!res.ok) {
        throw new Error(`Calendar insert faalde: ${res.status} ${await res.text()}`);
      }
      const created = (await res.json()) as { htmlLink?: string };
      const when = new Date(args.startMs).toLocaleString("nl-NL", {
        timeZone: "Europe/Amsterdam",
        dateStyle: "short",
        timeStyle: "short",
      });
      await ctx.runMutation(internal.contacts.addSystemNote, {
        contactId: args.contactId,
        body: `📅 Adviesgesprek in agenda gezet: ${when}${created.htmlLink ? `\n${created.htmlLink}` : ""}`,
      });
    } catch (err) {
      console.error("googleCalendar: event aanmaken mislukt", err);
      await ctx.runMutation(internal.contacts.addSystemNote, {
        contactId: args.contactId,
        body: "⚠️ Agenda-event kon niet automatisch worden aangemaakt — plan de afspraak handmatig in de agenda.",
      });
    }
  },
});
