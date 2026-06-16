import { describe, it, expect } from "vitest";
import { nextBatch, injectUnsubFooter, buildListUnsubHeaders } from "./broadcastsLogic";

describe("nextBatch", () => {
  it("geeft tot batchSize ids die nog niet verzonden zijn, in volgorde", () => {
    const all = ["a", "b", "c", "d", "e"];
    const sent = new Set(["a", "c"]);
    expect(nextBatch(all, sent, 2)).toEqual(["b", "d"]);
  });
  it("lege batch als alles verzonden is", () => {
    expect(nextBatch(["a", "b"], new Set(["a", "b"]), 10)).toEqual([]);
  });
});

describe("injectUnsubFooter", () => {
  it("voegt afmeldlink toe vóór </body>", () => {
    const out = injectUnsubFooter("<html><body><p>hoi</p></body></html>", "https://x/u?token=t");
    expect(out).toContain("https://x/u?token=t");
    expect(out.indexOf("token=t")).toBeLessThan(out.indexOf("</body>"));
  });
  it("plakt footer achteraan als er geen </body> is", () => {
    const out = injectUnsubFooter("<p>hoi</p>", "https://x/u?token=t");
    expect(out).toContain("https://x/u?token=t");
    expect(out.startsWith("<p>hoi</p>")).toBe(true);
  });
});

describe("buildListUnsubHeaders", () => {
  it("zet List-Unsubscribe + One-Click POST header", () => {
    const h = buildListUnsubHeaders("https://x/unsubscribe?token=t");
    expect(h["List-Unsubscribe"]).toBe("<https://x/unsubscribe?token=t>");
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});
