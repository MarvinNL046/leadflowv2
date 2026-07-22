// Geparametriseerde generator voor de wetry-suite iconensets (frostwork-stijl:
// outline + merk-accent per app). Gebruik:
//   node gen-icons2.mjs <mapFile> <pkgIconsDir> <outFile> <accentHex> <appNaam>
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const [, , MAP_FILE, PKG, OUT, ACCENT_HEX, APP] = process.argv;
const MAP = JSON.parse(readFileSync(MAP_FILE, "utf8"));

// Accent-curatie — gedeeld over de suite; per glyph de node-indices die in de
// merkkleur komen. Niet vermeld = geen accent (bewust: hulp-glyphs).
const ACCENT_NODES = {
  archive: [2], "archive-restore": [3, 4], award: [0], "badge-check": [1],
  ban: [1], bell: [0], "bell-off": [2], "bell-ring": [1, 3], "book-open": [0],
  bot: [4, 5], boxes: [9, 10, 11], briefcase: [0], "building-2": [0, 1],
  calendar: [0, 1], "calendar-clock": [0], "calendar-days": [4, 5, 6, 7, 8, 9],
  "calendar-plus": [0, 2], camera: [1], "check-check": [1],
  "circle-alert": [1, 2], "circle-arrow-down": [1, 2], "circle-arrow-up": [1, 2],
  "circle-check": [1], "circle-pause": [1, 2], "circle-play": [0],
  "circle-question-mark": [1, 2], "circle-x": [1, 2], clipboard: [0],
  "clipboard-check": [2], "clipboard-list": [2, 3, 4, 5], clock: [1],
  container: [3, 4], copy: [1], "credit-card": [1], cylinder: [0],
  download: [0, 2], droplets: [1], eraser: [1], euro: [0, 1],
  "external-link": [0, 1], eye: [1], "eye-off": [3], "file-down": [2, 3],
  "file-pen-line": [0], "file-plus-2": [2, 3], "file-text": [2, 3, 4],
  gauge: [0], globe: [1, 2], "id-card": [3], image: [1], "image-plus": [0, 1],
  inbox: [0], info: [1, 2], kanban: [1], layers: [0],
  "layout-dashboard": [1, 3], "life-buoy": [5], "link-2": [2],
  "link-2-off": [3], "list-checks": [3, 4], lock: [1], "log-out": [0, 1],
  mail: [0], "map-pin": [1], "map-pin-off": [2], megaphone: [2],
  monitor: [1, 2], "mouse-pointer-click": [0, 1, 2, 3], "octagon-x": [0, 2],
  package: [2, 3], pause: [0], pencil: [1], percent: [1, 2],
  "phone-incoming": [0, 1], "phone-missed": [0, 1], "phone-off": [1],
  "phone-outgoing": [0, 1], plug: [1, 3], printer: [2], "qr-code": [1],
  receipt: [0, 1], recycle: [2], "refresh-cw": [1, 3], repeat: [0, 2],
  "rotate-ccw": [1], route: [2], save: [2], scale: [1, 3], "search-x": [0, 1],
  send: [0], settings: [1], "shield-alert": [1, 2], "shield-check": [1],
  "shopping-cart": [0, 1], smartphone: [1], snowflake: "all",
  sparkles: [1, 2, 3], "sticky-note": [1], store: [1], tags: [2],
  "thermometer-snowflake": [0, 1, 3, 5, 6, 7], "thumbs-down": [1],
  "trash-2": [0, 1], "triangle-alert": [1, 2], upload: [0, 1], user: [1],
  "user-plus": [2, 3], users: [1, 2], wallet: [0], workflow: [2],
};

function parseNodes(glyph) {
  // Beide lucide-formaten: nieuw (__iconNode export) en oud (inline array).
  for (const ext of [".mjs", ".js"]) {
    let src;
    try {
      src = readFileSync(join(PKG, glyph + ext), "utf8");
    } catch {
      continue;
    }
    const m =
      src.match(/const __iconNode = (\[[\s\S]*?\]);\nconst /) ||
      src.match(/createLucideIcon\("[^"]+",\s*(\[[\s\S]*?\])\s*\);/);
    if (!m) throw new Error("geen iconNode in " + glyph);
    return eval(m[1]);
  }
  throw new Error("bestand niet gevonden: " + glyph);
}

function attrsToJsx(attrs, accent) {
  const out = [];
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "key") continue;
    out.push(`${k}="${v}"`);
  }
  if (accent) out.push(`stroke={A}`);
  return out.join(" ");
}

const glyphs = [...new Set(Object.values(MAP))].sort();
const glyphComponents = [];
for (const glyph of glyphs) {
  const nodes = parseNodes(glyph);
  const spec = ACCENT_NODES[glyph];
  const children = nodes
    .map(([tag, attrs], i) => {
      const accent = spec === "all" || (Array.isArray(spec) && spec.includes(i));
      return `      <${tag} ${attrsToJsx(attrs, accent)} />`;
    })
    .join("\n");
  const compName = "G_" + glyph.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
  glyphComponents.push({ compName, jsx: children });
}

const exportLines = Object.entries(MAP)
  .map(([name, glyph]) => {
    const compName = "G_" + glyph.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
    return `export const ${name} = ${compName};`;
  })
  .join("\n");

const file = `// ─────────────────────────────────────────────────────────────────────────────
// ${APP}-iconen — eigen set in huisstijl (outline + merk-accent).
//
// GEGENEREERD met scripts/icons/generate.mjs — niet met de hand bewerken;
// pas de accent-curatie in de generator aan en genereer opnieuw.
//
// Geometrie afgeleid van Lucide (ISC-licentie, © Lucide Contributors); per
// icoon is één karakteristiek element in de merkkleur (${ACCENT_HEX}) gezet.
// Hulp-glyphs (pijlen, chevrons, kruisjes, …) blijven bewust één kleur.
// Drop-in vervanger voor lucide-react: zelfde namen, zelfde props.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";

/** Merk-accentkleur van ${APP}. */
const A = "${ACCENT_HEX}";

export type BrandIconProps = Omit<
  React.SVGProps<SVGSVGElement>,
  "ref" | "size"
> & {
  size?: number | string;
};

/** Component-type van een icoon (drop-in voor lucide's LucideIcon). */
export type LucideIcon = React.ComponentType<BrandIconProps>;

function makeIcon(
  displayName: string,
  children: React.ReactNode
): LucideIcon {
  function Icon({
    size = 24,
    className,
    strokeWidth = 2,
    ...rest
  }: BrandIconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
        {...rest}
      >
        {children}
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}

${glyphComponents
  .map(
    ({ compName, jsx }) => `const ${compName} = makeIcon(
  "${APP}${compName.slice(2)}",
  <>
${jsx}
  </>
);`
  )
  .join("\n\n")}

// ── Publieke exports (zelfde namen als lucide-react) ────────────────────────
${exportLines}
`;

writeFileSync(OUT, file);
console.log("geschreven:", OUT, "—", glyphs.length, "glyphs,", Object.keys(MAP).length, "exports");
