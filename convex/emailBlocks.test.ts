import { describe, it, expect } from "vitest";
import { createBlock, renderBlockToHtml, renderBlocksToHtml, type EmailBlock } from "./emailBlocks";

describe("createBlock", () => {
  it("maakt elk bloktype met defaults + meegegeven id", () => {
    expect(createBlock("heading", "a").type).toBe("heading");
    expect(createBlock("button", "b").props).toMatchObject({ url: "https://staycoolairco.nl" });
    expect((createBlock("text", "c") as any).id).toBe("c");
  });
});

describe("renderBlockToHtml", () => {
  it("heading: escapet + zet text-align", () => {
    const h = renderBlockToHtml({ id: "1", type: "heading", props: { text: "<b>Hoi</b>", align: "center" } });
    expect(h).toContain("text-align:center");
    expect(h).toContain("&lt;b&gt;Hoi&lt;/b&gt;");
  });
  it("text: newlines → <br>", () => {
    const t = renderBlockToHtml({ id: "1", type: "text", props: { content: "regel1\nregel2", align: "left" } });
    expect(t).toContain("regel1<br>regel2");
  });
  it("button: javascript: url → #, ongeldige kleur → default", () => {
    const b = renderBlockToHtml({ id: "1", type: "button", props: { text: "Klik", url: "javascript:alert(1)", align: "left", bgColor: "red; evil", textColor: "#fff" } });
    expect(b).toContain('href="#"');
    expect(b).toContain("background:#2080C0");
    expect(b).not.toContain("evil");
  });
  it("image: lege src → lege string", () => {
    expect(renderBlockToHtml({ id: "1", type: "image", props: { src: "", alt: "", width: 100, align: "center" } })).toBe("");
  });
  it("image: width clamp 10-100", () => {
    const img = renderBlockToHtml({ id: "1", type: "image", props: { src: "https://x/a.png", alt: "a", width: 500, align: "center" } });
    expect(img).toContain("width:100%");
  });
  it("divider rendert hr", () => {
    expect(renderBlockToHtml({ id: "1", type: "divider", props: { color: "#ccc", thickness: 2 } })).toContain("border-top:2px solid #ccc");
  });
});

describe("renderBlocksToHtml", () => {
  it("voegt blokken samen in volgorde", () => {
    const blocks: EmailBlock[] = [
      { id: "1", type: "heading", props: { text: "Kop", align: "left" } },
      { id: "2", type: "text", props: { content: "Body", align: "left" } },
    ];
    const html = renderBlocksToHtml(blocks);
    expect(html.indexOf("Kop")).toBeLessThan(html.indexOf("Body"));
  });
});
