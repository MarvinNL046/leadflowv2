/**
 * Stateless afmeldtoken: base64url(contactId) + "." + base64url(HMAC-SHA256).
 * HMAC-sleutel = ENCRYPTION_KEY (zelfde 32-byte hex als crypto.ts). Geen
 * opslag/sessie nodig — werkt ook maanden na verzending. Web Crypto, dus
 * draait in Convex' V8-runtime én in vitest (Node 20 global crypto).
 */

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

let cachedKey: { hex: string; key: Promise<CryptoKey> } | null = null;

function hmacKey(): Promise<CryptoKey> {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("ENCRYPTION_KEY ontbreekt of is geen 64-hex (32 bytes).");
  }
  if (cachedKey?.hex === hex) return cachedKey.key;
  const key = crypto.subtle.importKey(
    "raw",
    hexToBytes(hex),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  cachedKey = { hex, key };
  return key;
}

export async function signUnsubToken(contactId: string): Promise<string> {
  const key = await hmacKey();
  const idBytes = new TextEncoder().encode(contactId);
  const sigBuf = await crypto.subtle.sign("HMAC", key, idBytes);
  return `${b64urlEncode(idBytes)}.${b64urlEncode(new Uint8Array(sigBuf))}`;
}

/** Geeft contactId terug bij geldige handtekening, anders null. */
export async function verifyUnsubToken(token: string): Promise<string | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [idPart, sigPart] = parts;
    if (!idPart || !sigPart) return null;
    const idBytes = b64urlDecode(idPart);
    const sigBytes = b64urlDecode(sigPart);
    const key = await hmacKey();
    const ok = await crypto.subtle.verify("HMAC", key, sigBytes, idBytes);
    if (!ok) return null;
    return new TextDecoder().decode(idBytes);
  } catch {
    return null;
  }
}
