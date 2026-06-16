/**
 * Block-based e-mail content model + pure renderer. De visuele builder bewerkt
 * een array EmailBlock (JSON); deze module rendert dat naar e-mail-veilige HTML
 * (inline styles, tabel-vrij maar simpele block-elementen). De HTML wordt daarna
 * door `emailShell.ts` in de branded template gewikkeld. Pure functies → zelfde
 * output in client-preview én Convex-verzending.
 */

export type Align = "left" | "center" | "right";
export type BlockType = "heading" | "text" | "button" | "image" | "divider";

export type EmailBlock =
  | { id: string; type: "heading"; props: { text: string; align: Align } }
  | { id: string; type: "text"; props: { content: string; align: Align } }
  | { id: string; type: "button"; props: { text: string; url: string; align: Align; bgColor: string; textColor: string } }
  | { id: string; type: "image"; props: { src: string; alt: string; width: number; align: Align } }
  | { id: string; type: "divider"; props: { color: string; thickness: number } };

/** Nieuw blok met zinnige defaults. `id` wordt door de caller (client) gegeven
 *  (bv. crypto.randomUUID()), zodat deze module deterministisch/puur blijft. */
export function createBlock(type: BlockType, id: string): EmailBlock {
  switch (type) {
    case "heading": return { id, type, props: { text: "Nieuwe kop", align: "left" } };
    case "text": return { id, type, props: { content: "Typ hier je tekst…", align: "left" } };
    case "button": return { id, type, props: { text: "Plan je afspraak", url: "https://staycoolairco.nl", align: "left", bgColor: "#2080C0", textColor: "#ffffff" } };
    case "image": return { id, type, props: { src: "", alt: "", width: 100, align: "center" } };
    case "divider": return { id, type, props: { color: "#e6eaef", thickness: 1 } };
  }
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : "#";
}
function safeAlign(a: unknown): "left" | "center" | "right" {
  return a === "center" || a === "right" ? a : "left";
}
function safeColor(c: string, fallback: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : fallback;
}
function clampWidth(w: number): number {
  const n = Number(w);
  if (Number.isNaN(n)) return 100;
  return Math.max(10, Math.min(100, Math.round(n)));
}

export function renderBlockToHtml(block: EmailBlock): string {
  switch (block.type) {
    case "heading": {
      const { text, align } = block.props;
      return `<h2 style="margin:0 0 14px;font-size:22px;font-weight:700;color:#1f2733;line-height:1.3;text-align:${safeAlign(align)}">${esc(text)}</h2>`;
    }
    case "text": {
      const { content, align } = block.props;
      const lines = esc(content).split("\n").join("<br>");
      return `<p style="margin:0 0 14px;text-align:${safeAlign(align)}">${lines}</p>`;
    }
    case "button": {
      const { text, url, align, bgColor, textColor } = block.props;
      const bg = safeColor(bgColor, "#2080C0");
      const fg = safeColor(textColor, "#ffffff");
      return `<div style="text-align:${safeAlign(align)};margin:8px 0 18px"><a href="${esc(safeUrl(url))}" style="display:inline-block;background:${bg};color:${fg};padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-family:Arial,Helvetica,sans-serif">${esc(text)}</a></div>`;
    }
    case "image": {
      const { src, alt, width, align } = block.props;
      if (!src) return "";
      return `<div style="text-align:${safeAlign(align)};margin:0 0 16px"><img src="${esc(safeUrl(src))}" alt="${esc(alt)}" style="width:${clampWidth(width)}%;max-width:100%;height:auto;border-radius:8px;display:inline-block" /></div>`;
    }
    case "divider": {
      const { color, thickness } = block.props;
      const c = safeColor(color, "#e6eaef");
      const t = Math.max(1, Math.min(8, Math.round(Number(thickness) || 1)));
      return `<hr style="border:none;border-top:${t}px solid ${c};margin:16px 0" />`;
    }
  }
}

export function renderBlocksToHtml(blocks: EmailBlock[]): string {
  return blocks.map(renderBlockToHtml).join("");
}
