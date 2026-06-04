/**
 * Symmetrische encryptie-at-rest voor secrets (Meta access-tokens etc.).
 *
 * Gebruikt de Web Crypto API (`crypto.subtle`) — die werkt in Convex' V8
 * default-runtime, dus GEEN `"use node"` nodig. Wel: `crypto.getRandomValues`
 * (voor de IV) is non-deterministisch, dus encryptie MAG ALLEEN in een
 * `action` / `httpAction` draaien, NIET in een query/mutation. Decryptie
 * gebruikt geen randomness en mag overal, maar we doen het in de actie vlak
 * voordat de token de deur uit gaat naar de Graph API.
 *
 * Sleutel: `ENCRYPTION_KEY` env-var = 64 hex-chars (32 bytes / AES-256).
 *   genereer: `openssl rand -hex 32`
 *   zet:      `npx convex env set ENCRYPTION_KEY <hex>` (+ `--prod`)
 *
 * Formaat opgeslagen blob: `v1:<hex(iv ‖ ciphertext+authTag)>`.
 * De `v1:`-prefix maakt legacy-plaintext detecteerbaar: `decryptSecret` geeft
 * een waarde zónder prefix ongewijzigd terug, zodat bestaande (pre-encryptie)
 * rows blijven werken tot ze opnieuw geschreven worden (= Meta opnieuw koppelen).
 */

const PREFIX = "v1:";
const IV_BYTES = 12; // AES-GCM standaard nonce-lengte

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, "0");
  }
  return s;
}

async function getKey(): Promise<CryptoKey> {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "ENCRYPTION_KEY ontbreekt of is geen 64-hex (32 bytes). " +
        "Genereer met `openssl rand -hex 32` en zet via `npx convex env set ENCRYPTION_KEY <hex>`.",
    );
  }
  return crypto.subtle.importKey(
    "raw",
    hexToBytes(hex),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Versleutel een plaintext-secret. ALLEEN aanroepen vanuit een action/httpAction. */
export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const cipher = new Uint8Array(cipherBuf);
  const blob = new Uint8Array(iv.length + cipher.length);
  blob.set(iv, 0);
  blob.set(cipher, iv.length);
  return PREFIX + bytesToHex(blob);
}

/**
 * Ontsleutel een blob. Legacy-tolerant: een waarde zonder `v1:`-prefix wordt
 * als plaintext behandeld en ongewijzigd teruggegeven (pre-encryptie rows).
 */
export async function decryptSecret(blob: string): Promise<string> {
  if (!blob.startsWith(PREFIX)) {
    return blob; // legacy plaintext — nog niet ge-encrypt
  }
  const raw = hexToBytes(blob.slice(PREFIX.length));
  const iv = raw.slice(0, IV_BYTES);
  const cipher = raw.slice(IV_BYTES);
  const key = await getKey();
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipher,
  );
  return new TextDecoder().decode(plainBuf);
}

/** True als de waarde al ge-encrypt is (heeft de versie-prefix). */
export function isEncrypted(blob: string | undefined | null): boolean {
  return typeof blob === "string" && blob.startsWith(PREFIX);
}
