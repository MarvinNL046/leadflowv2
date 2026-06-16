import { describe, it, expect, beforeAll } from "vitest";
import { signUnsubToken, verifyUnsubToken } from "./unsubscribeToken";

beforeAll(() => {
  // 32 bytes hex — zelfde formaat als ENCRYPTION_KEY in productie
  process.env.ENCRYPTION_KEY = "a".repeat(64);
});

describe("unsubscribe token", () => {
  it("roundtrip: verify geeft originele contactId terug", async () => {
    const token = await signUnsubToken("contact_123");
    expect(await verifyUnsubToken(token)).toBe("contact_123");
  });

  it("afgewezen bij geknoeide handtekening", async () => {
    const token = await signUnsubToken("contact_123");
    const [id, sig] = token.split(".");
    const tamperedSig = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect(await verifyUnsubToken(`${id}.${tamperedSig}`)).toBeNull();
  });

  it("afgewezen bij rommel-input", async () => {
    expect(await verifyUnsubToken("niet-een-token")).toBeNull();
    expect(await verifyUnsubToken("")).toBeNull();
  });
});
