/** Volgende batch contact-ids die nog geen verzonden message hebben. */
export function nextBatch(
  allIds: string[],
  sentIds: Set<string>,
  batchSize: number,
): string[] {
  const out: string[] = [];
  for (const id of allIds) {
    if (sentIds.has(id)) continue;
    out.push(id);
    if (out.length >= batchSize) break;
  }
  return out;
}

/** Injecteer de afmeld-footer net vóór </body> (of plak achteraan). */
export function injectUnsubFooter(html: string, unsubUrl: string): string {
  const footer =
    `<hr style="margin-top:32px;border:none;border-top:1px solid #e4e4e7">` +
    `<p style="font-size:12px;color:#71717a;text-align:center;margin-top:12px">` +
    `Je ontvangt deze mail omdat je klant of aanvrager bent bij StayCool Airco. ` +
    `<a href="${unsubUrl}" style="color:#71717a">Afmelden</a></p>`;
  const idx = html.toLowerCase().lastIndexOf("</body>");
  if (idx === -1) return html + footer;
  return html.slice(0, idx) + footer + html.slice(idx);
}

/** RFC 8058 one-click unsubscribe headers (Gmail/Yahoo bulk-sender vereiste). */
export function buildListUnsubHeaders(unsubUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
