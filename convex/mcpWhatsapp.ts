import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * MCP-server voor de WhatsApp-gesprekken van het zakelijke nummer.
 *
 * Waarom: Gmail en Agenda zijn voor AI-assistenten leesbaar via connectors,
 * WhatsApp niet — Meta biedt geen lees-API voor een account. Maar de
 * berichten van het ZAKELIJKE nummer staan al in leadflow (voidfix-webhook
 * slaat inbound én outbound op). Deze server legt daar het
 * connector-protocol (MCP, Streamable HTTP) overheen, zodat zowel Claude
 * (custom connector) als ChatGPT (developer mode) ze kan lezen — één server,
 * twee assistenten, want beide spreken MCP.
 *
 * Auth: de sleutel zit als laatste padsegment in de URL
 * (/mcp/whatsapp/<MCP_WA_KEY>). Connector-UI's kunnen geen eigen headers
 * meesturen zonder volledige OAuth, en een geheim pad is voor read-only
 * meelezen het juiste gewicht. De sleutel staat in de env, niet in de code.
 *
 * Read-only by design: er is geen tool om te versturen. Meelezen is iets
 * anders dan een assistent die namens het bedrijf appt.
 *
 * Protocol: JSON-RPC 2.0 over POST, met kale JSON-antwoorden (dat mag binnen
 * Streamable HTTP; SSE is optioneel en hier bewust weggelaten). GET geeft
 * 405 — ook conform de spec.
 */

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
};

const TOOLS = [
  {
    name: "whatsapp_recente_gesprekken",
    description:
      "De recentste WhatsApp-gesprekken van het zakelijke nummer: per klant het laatste bericht, met naam waar bekend. Gebruik dit als startpunt.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximaal aantal gesprekken (standaard 15, max 50).",
        },
      },
    },
  },
  {
    name: "whatsapp_gesprek",
    description:
      "Het volledige gesprek met één telefoonnummer, oudste bericht eerst. Accepteert Nederlandse (06…) en internationale notatie.",
    inputSchema: {
      type: "object",
      properties: {
        telefoon: { type: "string", description: "Telefoonnummer van de klant." },
        limit: {
          type: "number",
          description: "Maximaal aantal berichten (standaard 50, max 200).",
        },
      },
      required: ["telefoon"],
    },
  },
  {
    name: "whatsapp_zoeken",
    description:
      "Vrij zoeken in de tekst van recente WhatsApp-berichten (bijv. een naam, adres of onderwerp).",
    inputSchema: {
      type: "object",
      properties: {
        tekst: { type: "string", description: "Zoekterm." },
        limit: { type: "number", description: "Maximaal aantal treffers (max 50)." },
      },
      required: ["tekst"],
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

function fmtTijd(ms: number): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(ms));
}

export const mcpEndpoint = httpAction(async (ctx, request) => {
  const key = process.env.MCP_WA_KEY;
  const segment = new URL(request.url).pathname.split("/").filter(Boolean).pop();
  if (!key || key.length < 16 || segment !== key) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  if (request.method === "GET") {
    // Geen SSE-stream in deze server; de spec staat 405 hiervoor toe.
    return new Response(null, { status: 405 });
  }

  let rpc: JsonRpcRequest;
  try {
    rpc = await request.json();
  } catch {
    return jsonResponse(rpcError(null, -32700, "Parse error"), 400);
  }
  const { id, method, params } = rpc;

  // Notificaties (geen id) beantwoorden we met een lege 202.
  if (id === undefined && method?.startsWith("notifications/")) {
    return new Response(null, { status: 202 });
  }

  if (method === "initialize") {
    return jsonResponse(
      rpcResult(id, {
        protocolVersion:
          (params?.protocolVersion as string | undefined) ?? "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "leadflow-whatsapp", version: "1.0.0" },
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
    return jsonResponse(
      rpcResult(id, {
        content: [{ type: "text", text: "Workspace niet gevonden." }],
        isError: true,
      }),
    );
  }

  try {
    let tekst: string;
    if (naam === "whatsapp_recente_gesprekken") {
      const uit = await ctx.runQuery(internal.mcpWhatsappData.recenteGesprekken, {
        workspaceId,
        limit: typeof args.limit === "number" ? args.limit : 15,
      });
      tekst =
        uit.gesprekken.length === 0
          ? "Geen WhatsApp-gesprekken gevonden."
          : uit.gesprekken
              .map(
                (g) =>
                  `${g.naam ?? "Onbekend"} (${g.telefoon}) — ${fmtTijd(g.laatsteBerichtOp)} ${
                    g.laatsteRichting === "inbound" ? "van klant" : "van ons"
                  }: ${g.laatsteTekst}`,
              )
              .join("\n");
    } else if (naam === "whatsapp_gesprek") {
      const uit = await ctx.runQuery(internal.mcpWhatsappData.gesprek, {
        workspaceId,
        telefoon: String(args.telefoon ?? ""),
        limit: typeof args.limit === "number" ? args.limit : 50,
      });
      const kop = uit.naam !== null ? `Gesprek met ${uit.naam}:\n` : "";
      tekst =
        uit.berichten.length === 0
          ? "Geen berichten gevonden voor dit nummer."
          : kop +
            uit.berichten
              .map(
                (b) =>
                  `[${fmtTijd(b.op)}] ${b.richting === "inbound" ? "Klant" : "Wij"}: ${b.tekst}${
                    b.media !== undefined ? ` [${b.media}]` : ""
                  }`,
              )
              .join("\n") +
            (uit.opmerking !== undefined ? `\n(${uit.opmerking})` : "");
    } else if (naam === "whatsapp_zoeken") {
      const uit = await ctx.runQuery(internal.mcpWhatsappData.zoeken, {
        workspaceId,
        tekst: String(args.tekst ?? ""),
        limit: typeof args.limit === "number" ? args.limit : 20,
      });
      tekst =
        uit.treffers.length === 0
          ? `Geen treffers. ${uit.opmerking ?? ""}`
          : uit.treffers
              .map(
                (t) =>
                  `${fmtTijd(t.op)} · ${t.naam ?? "Onbekend"} (${t.telefoon}) ${
                    t.richting === "inbound" ? "van klant" : "van ons"
                  }: ${t.tekst}`,
              )
              .join("\n") + `\n(${uit.opmerking})`;
    } else {
      return jsonResponse(rpcError(id, -32602, `Onbekende tool: ${naam}`));
    }
    return jsonResponse(
      rpcResult(id, { content: [{ type: "text", text: tekst }] }),
    );
  } catch (err) {
    console.error("[mcp-whatsapp] tool faalde:", err);
    return jsonResponse(
      rpcResult(id, {
        content: [{ type: "text", text: "Er ging iets mis bij het ophalen." }],
        isError: true,
      }),
    );
  }
});
