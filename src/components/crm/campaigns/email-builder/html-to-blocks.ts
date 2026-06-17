import type { EmailBlock, Align } from "../../../../../convex/emailBlocks";

function alignOf(el: HTMLElement): Align {
  const ta = (el.style && el.style.textAlign) || "";
  return ta === "center" || ta === "right" ? ta : "left";
}

/** Zet template-body-HTML om naar blokken (fallback voor templates zonder bodyBlocks). */
export function htmlToBlocks(html: string): EmailBlock[] {
  if (!html || !html.trim()) return [];
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, "text/html");
  const root = doc.getElementById("__root");
  if (!root) return [];
  const blocks: EmailBlock[] = [];
  const newId = () => crypto.randomUUID();
  for (const node of Array.from(root.children)) {
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();
    const cta = el.querySelector('a[data-cta]') as HTMLAnchorElement | null;
    if (cta) {
      blocks.push({ id: newId(), type: "button", props: { text: cta.textContent || "Knop", url: cta.getAttribute("href") || "#", align: alignOf(el), bgColor: "#2080C0", textColor: "#ffffff" } });
    } else if (tag === "H1" || tag === "H2" || tag === "H3") {
      blocks.push({ id: newId(), type: "heading", props: { text: el.textContent || "", align: alignOf(el) } });
    } else if (tag === "HR") {
      blocks.push({ id: newId(), type: "divider", props: { color: "#e6eaef", thickness: 1 } });
    } else if (tag === "IMG") {
      blocks.push({ id: newId(), type: "image", props: { src: el.getAttribute("src") || "", alt: el.getAttribute("alt") || "", width: 100, align: "center" } });
    } else if (tag === "UL" || tag === "OL") {
      const items = Array.from(el.querySelectorAll("li")).map((li) => "• " + (li.textContent || "")).join("\n");
      if (items.trim()) blocks.push({ id: newId(), type: "text", props: { content: items, align: alignOf(el) } });
    } else {
      // P, DIV, etc → tekstblok. <br> → newline.
      const tmp = doc.createElement("div");
      tmp.innerHTML = el.innerHTML.replace(/<br\s*\/?>/gi, "\n");
      const text = tmp.textContent || "";
      if (text.trim()) blocks.push({ id: newId(), type: "text", props: { content: text, align: alignOf(el) } });
    }
  }
  return blocks;
}
