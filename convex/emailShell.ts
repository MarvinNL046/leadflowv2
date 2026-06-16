/**
 * Branded, responsive, inline-styled e-mail-shell. Wrapt de door de gebruiker
 * opgestelde content (`contentHtml`) in een StayCool-template: blauwe header,
 * witte card, nette typografie, footer met afmeldlink. Tabel-gebaseerd + inline
 * styles → werkt in Gmail/Apple Mail/Outlook/mobiel. Pure functie (geen imports)
 * zodat de live-preview (client) en de verzending (Convex) exact hetzelfde
 * renderen. Single source of truth voor de afmeld-footer.
 */
export function renderEmailShell(
  contentHtml: string,
  opts: { companyName: string; unsubUrl: string; previewText?: string },
): string {
  const { companyName, unsubUrl, previewText = "" } = opts;
  const brandBlue = "#2080C0";
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const company = esc(companyName);
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${company}</title>
<style>
  @media only screen and (max-width:600px){
    .sc-container{width:100%!important}
    .sc-pad{padding-left:20px!important;padding-right:20px!important}
  }
  .sc-content h2{font-size:21px;font-weight:700;margin:0 0 12px;color:#1f2733;line-height:1.3}
  .sc-content h3{font-size:17px;font-weight:700;margin:0 0 10px;color:#1f2733}
  .sc-content p{margin:0 0 14px}
  .sc-content a{color:#2080C0}
  .sc-content a[data-cta]{color:#ffffff!important}
  .sc-content ul,.sc-content ol{margin:0 0 14px;padding-left:22px}
  .sc-content li{margin:0 0 6px}
  .sc-content img{max-width:100%;height:auto;border-radius:8px}
  .sc-content strong{font-weight:700}
</style>
</head>
<body style="margin:0;padding:0;background:#eef2f5;-webkit-font-smoothing:antialiased;">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">${esc(previewText)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f5;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" class="sc-container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.08);">
      <tr><td style="background:${brandBlue};padding:22px 32px;">
        <span style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:.2px;">${company}</span>
      </td></tr>
      <tr><td class="sc-pad sc-content" style="padding:32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#1f2733;">
        ${contentHtml}
      </td></tr>
      <tr><td class="sc-pad" style="padding:22px 32px;border-top:1px solid #e6eaef;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#8a94a6;text-align:center;">
        Je ontvangt deze mail omdat je klant of aanvrager bent bij ${company}.<br>
        <a href="${unsubUrl}" style="color:#8a94a6;text-decoration:underline;">Afmelden voor deze mails</a>
      </td></tr>
    </table>
    <table role="presentation" class="sc-container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;"><tr><td style="padding:14px 32px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#aab2c0;">${company}</td></tr></table>
  </td></tr>
</table>
</body>
</html>`;
}
