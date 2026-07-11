// ─────────────────────────────────────────────────────────────────────────────
// Leadflow-iconen — eigen set in huisstijl (outline + merk-accent).
//
// GEGENEREERD met scripts/icons/generate.mjs — niet met de hand bewerken;
// pas de accent-curatie in de generator aan en genereer opnieuw.
//
// Geometrie afgeleid van Lucide (ISC-licentie, © Lucide Contributors); per
// icoon is één karakteristiek element in de merkkleur (#4fb8b2) gezet.
// Hulp-glyphs (pijlen, chevrons, kruisjes, …) blijven bewust één kleur.
// Drop-in vervanger voor lucide-react: zelfde namen, zelfde props.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";

/** Merk-accentkleur van Leadflow. */
const A = "#4fb8b2";

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

const G_archive = makeIcon(
  "Leadflowarchive",
  <>
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" stroke={A} />
  </>
);

const G_archiveRestore = makeIcon(
  "LeadflowarchiveRestore",
  <>
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h2" />
      <path d="M20 8v11a2 2 0 0 1-2 2h-2" />
      <path d="m9 15 3-3 3 3" stroke={A} />
      <path d="M12 12v9" stroke={A} />
  </>
);

const G_arrowDown = makeIcon(
  "LeadflowarrowDown",
  <>
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
  </>
);

const G_arrowLeft = makeIcon(
  "LeadflowarrowLeft",
  <>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
  </>
);

const G_arrowUp = makeIcon(
  "LeadflowarrowUp",
  <>
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
  </>
);

const G_bold = makeIcon(
  "Leadflowbold",
  <>
      <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
  </>
);

const G_bot = makeIcon(
  "Leadflowbot",
  <>
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" stroke={A} />
      <path d="M9 13v2" stroke={A} />
  </>
);

const G_briefcase = makeIcon(
  "Leadflowbriefcase",
  <>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" stroke={A} />
      <rect width="20" height="14" x="2" y="6" rx="2" />
  </>
);

const G_building2 = makeIcon(
  "Leadflowbuilding2",
  <>
      <path d="M10 12h4" stroke={A} />
      <path d="M10 8h4" stroke={A} />
      <path d="M14 21v-3a2 2 0 0 0-4 0v3" />
      <path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
      <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
  </>
);

const G_calendarClock = makeIcon(
  "LeadflowcalendarClock",
  <>
      <path d="M16 14v2.2l1.6 1" stroke={A} />
      <path d="M16 2v4" />
      <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5" />
      <path d="M3 10h5" />
      <path d="M8 2v4" />
      <circle cx="16" cy="16" r="6" />
  </>
);

const G_calendarPlus = makeIcon(
  "LeadflowcalendarPlus",
  <>
      <path d="M16 19h6" stroke={A} />
      <path d="M16 2v4" />
      <path d="M19 16v6" stroke={A} />
      <path d="M21 12.598V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8.5" />
      <path d="M3 10h18" />
      <path d="M8 2v4" />
  </>
);

const G_check = makeIcon(
  "Leadflowcheck",
  <>
      <path d="M20 6 9 17l-5-5" />
  </>
);

const G_checkCheck = makeIcon(
  "LeadflowcheckCheck",
  <>
      <path d="M18 6 7 17l-5-5" />
      <path d="m22 10-7.5 7.5L13 16" stroke={A} />
  </>
);

const G_chevronDown = makeIcon(
  "LeadflowchevronDown",
  <>
      <path d="m6 9 6 6 6-6" />
  </>
);

const G_chevronRight = makeIcon(
  "LeadflowchevronRight",
  <>
      <path d="m9 18 6-6-6-6" />
  </>
);

const G_chevronUp = makeIcon(
  "LeadflowchevronUp",
  <>
      <path d="m18 15-6-6-6 6" />
  </>
);

const G_circle = makeIcon(
  "Leadflowcircle",
  <>
      <circle cx="12" cy="12" r="10" />
  </>
);

const G_circleAlert = makeIcon(
  "LeadflowcircleAlert",
  <>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" stroke={A} />
      <line x1="12" x2="12.01" y1="16" y2="16" stroke={A} />
  </>
);

const G_circleArrowDown = makeIcon(
  "LeadflowcircleArrowDown",
  <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v8" stroke={A} />
      <path d="m8 12 4 4 4-4" stroke={A} />
  </>
);

const G_circleArrowUp = makeIcon(
  "LeadflowcircleArrowUp",
  <>
      <circle cx="12" cy="12" r="10" />
      <path d="m16 12-4-4-4 4" stroke={A} />
      <path d="M12 16V8" stroke={A} />
  </>
);

const G_circleCheck = makeIcon(
  "LeadflowcircleCheck",
  <>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" stroke={A} />
  </>
);

const G_circlePause = makeIcon(
  "LeadflowcirclePause",
  <>
      <circle cx="12" cy="12" r="10" />
      <line x1="10" x2="10" y1="15" y2="9" stroke={A} />
      <line x1="14" x2="14" y1="15" y2="9" stroke={A} />
  </>
);

const G_circlePlay = makeIcon(
  "LeadflowcirclePlay",
  <>
      <path d="M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z" stroke={A} />
      <circle cx="12" cy="12" r="10" />
  </>
);

const G_circleX = makeIcon(
  "LeadflowcircleX",
  <>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" stroke={A} />
      <path d="m9 9 6 6" stroke={A} />
  </>
);

const G_clock = makeIcon(
  "Leadflowclock",
  <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" stroke={A} />
  </>
);

const G_copy = makeIcon(
  "Leadflowcopy",
  <>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" stroke={A} />
  </>
);

const G_euro = makeIcon(
  "Leadfloweuro",
  <>
      <path d="M4 10h12" stroke={A} />
      <path d="M4 14h9" stroke={A} />
      <path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2" />
  </>
);

const G_externalLink = makeIcon(
  "LeadflowexternalLink",
  <>
      <path d="M15 3h6v6" stroke={A} />
      <path d="M10 14 21 3" stroke={A} />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </>
);

const G_eye = makeIcon(
  "Leadfloweye",
  <>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" stroke={A} />
  </>
);

const G_eyeOff = makeIcon(
  "LeadfloweyeOff",
  <>
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" stroke={A} />
  </>
);

const G_facebook = makeIcon(
  "Leadflowfacebook",
  <>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </>
);

const G_fileText = makeIcon(
  "LeadflowfileText",
  <>
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      <path d="M10 9H8" stroke={A} />
      <path d="M16 13H8" stroke={A} />
      <path d="M16 17H8" stroke={A} />
  </>
);

const G_globe = makeIcon(
  "Leadflowglobe",
  <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" stroke={A} />
      <path d="M2 12h20" stroke={A} />
  </>
);

const G_gripVertical = makeIcon(
  "LeadflowgripVertical",
  <>
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="5" r="1" />
      <circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="15" cy="19" r="1" />
  </>
);

const G_heading = makeIcon(
  "Leadflowheading",
  <>
      <path d="M6 12h12" />
      <path d="M6 20V4" />
      <path d="M18 20V4" />
  </>
);

const G_heading2 = makeIcon(
  "Leadflowheading2",
  <>
      <path d="M4 12h8" />
      <path d="M4 18V6" />
      <path d="M12 18V6" />
      <path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1" />
  </>
);

const G_image = makeIcon(
  "Leadflowimage",
  <>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" stroke={A} />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </>
);

const G_imagePlus = makeIcon(
  "LeadflowimagePlus",
  <>
      <path d="M16 5h6" stroke={A} />
      <path d="M19 2v6" stroke={A} />
      <path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      <circle cx="9" cy="9" r="2" />
  </>
);

const G_inbox = makeIcon(
  "Leadflowinbox",
  <>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" stroke={A} />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </>
);

const G_info = makeIcon(
  "Leadflowinfo",
  <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" stroke={A} />
      <path d="M12 8h.01" stroke={A} />
  </>
);

const G_italic = makeIcon(
  "Leadflowitalic",
  <>
      <line x1="19" x2="10" y1="4" y2="4" />
      <line x1="14" x2="5" y1="20" y2="20" />
      <line x1="15" x2="9" y1="4" y2="20" />
  </>
);

const G_kanban = makeIcon(
  "Leadflowkanban",
  <>
      <path d="M5 3v14" />
      <path d="M12 3v8" stroke={A} />
      <path d="M19 3v18" />
  </>
);

const G_layoutDashboard = makeIcon(
  "LeadflowlayoutDashboard",
  <>
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" stroke={A} />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" stroke={A} />
  </>
);

const G_link2 = makeIcon(
  "Leadflowlink2",
  <>
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      <line x1="8" x2="16" y1="12" y2="12" stroke={A} />
  </>
);

const G_link2Off = makeIcon(
  "Leadflowlink2Off",
  <>
      <path d="M9 17H7A5 5 0 0 1 7 7" />
      <path d="M15 7h2a5 5 0 0 1 4 8" />
      <line x1="8" x2="12" y1="12" y2="12" />
      <line x1="2" x2="22" y1="2" y2="22" stroke={A} />
  </>
);

const G_list = makeIcon(
  "Leadflowlist",
  <>
      <path d="M3 5h.01" />
      <path d="M3 12h.01" />
      <path d="M3 19h.01" />
      <path d="M8 5h13" />
      <path d="M8 12h13" />
      <path d="M8 19h13" />
  </>
);

const G_listOrdered = makeIcon(
  "LeadflowlistOrdered",
  <>
      <path d="M11 5h10" />
      <path d="M11 12h10" />
      <path d="M11 19h10" />
      <path d="M4 4h1v5" />
      <path d="M4 9h2" />
      <path d="M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02" />
  </>
);

const G_loaderCircle = makeIcon(
  "LeadflowloaderCircle",
  <>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </>
);

const G_lock = makeIcon(
  "Leadflowlock",
  <>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke={A} />
  </>
);

const G_mail = makeIcon(
  "Leadflowmail",
  <>
      <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" stroke={A} />
      <rect x="2" y="4" width="20" height="16" rx="2" />
  </>
);

const G_mapPin = makeIcon(
  "LeadflowmapPin",
  <>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" stroke={A} />
  </>
);

const G_mapPinOff = makeIcon(
  "LeadflowmapPinOff",
  <>
      <path d="M12.75 7.09a3 3 0 0 1 2.16 2.16" />
      <path d="M17.072 17.072c-1.634 2.17-3.527 3.912-4.471 4.727a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 1.432-4.568" />
      <path d="m2 2 20 20" stroke={A} />
      <path d="M8.475 2.818A8 8 0 0 1 20 10c0 1.183-.31 2.377-.81 3.533" />
      <path d="M9.13 9.13a3 3 0 0 0 3.74 3.74" />
  </>
);

const G_megaphone = makeIcon(
  "Leadflowmegaphone",
  <>
      <path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
      <path d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14" />
      <path d="M8 6v8" stroke={A} />
  </>
);

const G_menu = makeIcon(
  "Leadflowmenu",
  <>
      <path d="M4 5h16" />
      <path d="M4 12h16" />
      <path d="M4 19h16" />
  </>
);

const G_messageCircle = makeIcon(
  "LeadflowmessageCircle",
  <>
      <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" />
  </>
);

const G_messageSquare = makeIcon(
  "LeadflowmessageSquare",
  <>
      <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
  </>
);

const G_minus = makeIcon(
  "Leadflowminus",
  <>
      <path d="M5 12h14" />
  </>
);

const G_mousePointerClick = makeIcon(
  "LeadflowmousePointerClick",
  <>
      <path d="M14 4.1 12 6" stroke={A} />
      <path d="m5.1 8-2.9-.8" stroke={A} />
      <path d="m6 12-1.9 2" stroke={A} />
      <path d="M7.2 2.2 8 5.1" stroke={A} />
      <path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z" />
  </>
);

const G_octagonX = makeIcon(
  "LeadflowoctagonX",
  <>
      <path d="m15 9-6 6" stroke={A} />
      <path d="M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z" />
      <path d="m9 9 6 6" stroke={A} />
  </>
);

const G_pause = makeIcon(
  "Leadflowpause",
  <>
      <rect x="14" y="3" width="5" height="18" rx="1" stroke={A} />
      <rect x="5" y="3" width="5" height="18" rx="1" />
  </>
);

const G_pencil = makeIcon(
  "Leadflowpencil",
  <>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" stroke={A} />
  </>
);

const G_phone = makeIcon(
  "Leadflowphone",
  <>
      <path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" />
  </>
);

const G_phoneIncoming = makeIcon(
  "LeadflowphoneIncoming",
  <>
      <path d="M16 2v6h6" stroke={A} />
      <path d="m22 2-6 6" stroke={A} />
      <path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" />
  </>
);

const G_phoneMissed = makeIcon(
  "LeadflowphoneMissed",
  <>
      <path d="m16 2 6 6" stroke={A} />
      <path d="m22 2-6 6" stroke={A} />
      <path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" />
  </>
);

const G_phoneOff = makeIcon(
  "LeadflowphoneOff",
  <>
      <path d="M10.1 13.9a14 14 0 0 0 3.732 2.668 1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2 18 18 0 0 1-12.728-5.272" />
      <path d="M22 2 2 22" stroke={A} />
      <path d="M4.76 13.582A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 .244.473" />
  </>
);

const G_phoneOutgoing = makeIcon(
  "LeadflowphoneOutgoing",
  <>
      <path d="m16 8 6-6" stroke={A} />
      <path d="M22 8V2h-6" stroke={A} />
      <path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" />
  </>
);

const G_play = makeIcon(
  "Leadflowplay",
  <>
      <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
  </>
);

const G_plug = makeIcon(
  "Leadflowplug",
  <>
      <path d="M12 22v-5" />
      <path d="M15 8V2" stroke={A} />
      <path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z" />
      <path d="M9 8V2" stroke={A} />
  </>
);

const G_plus = makeIcon(
  "Leadflowplus",
  <>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
  </>
);

const G_qrCode = makeIcon(
  "LeadflowqrCode",
  <>
      <rect width="5" height="5" x="3" y="3" rx="1" />
      <rect width="5" height="5" x="16" y="3" rx="1" stroke={A} />
      <rect width="5" height="5" x="3" y="16" rx="1" />
      <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
      <path d="M21 21v.01" />
      <path d="M12 7v3a2 2 0 0 1-2 2H7" />
      <path d="M3 12h.01" />
      <path d="M12 3h.01" />
      <path d="M12 16v.01" />
      <path d="M16 12h1" />
      <path d="M21 12v.01" />
      <path d="M12 21v-1" />
  </>
);

const G_receipt = makeIcon(
  "Leadflowreceipt",
  <>
      <path d="M12 17V7" stroke={A} />
      <path d="M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8" stroke={A} />
      <path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z" />
  </>
);

const G_refreshCw = makeIcon(
  "LeadflowrefreshCw",
  <>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" stroke={A} />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" stroke={A} />
  </>
);

const G_rotateCcw = makeIcon(
  "LeadflowrotateCcw",
  <>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" stroke={A} />
  </>
);

const G_route = makeIcon(
  "Leadflowroute",
  <>
      <circle cx="6" cy="19" r="3" />
      <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
      <circle cx="18" cy="5" r="3" stroke={A} />
  </>
);

const G_save = makeIcon(
  "Leadflowsave",
  <>
      <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
      <path d="M7 3v4a1 1 0 0 0 1 1h7" stroke={A} />
  </>
);

const G_search = makeIcon(
  "Leadflowsearch",
  <>
      <path d="m21 21-4.34-4.34" />
      <circle cx="11" cy="11" r="8" />
  </>
);

const G_send = makeIcon(
  "Leadflowsend",
  <>
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" stroke={A} />
      <path d="m21.854 2.147-10.94 10.939" />
  </>
);

const G_settings = makeIcon(
  "Leadflowsettings",
  <>
      <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
      <circle cx="12" cy="12" r="3" stroke={A} />
  </>
);

const G_snowflake = makeIcon(
  "Leadflowsnowflake",
  <>
      <path d="m10 20-1.25-2.5L6 18" stroke={A} />
      <path d="M10 4 8.75 6.5 6 6" stroke={A} />
      <path d="m14 20 1.25-2.5L18 18" stroke={A} />
      <path d="m14 4 1.25 2.5L18 6" stroke={A} />
      <path d="m17 21-3-6h-4" stroke={A} />
      <path d="m17 3-3 6 1.5 3" stroke={A} />
      <path d="M2 12h6.5L10 9" stroke={A} />
      <path d="m20 10-1.5 2 1.5 2" stroke={A} />
      <path d="M22 12h-6.5L14 15" stroke={A} />
      <path d="m4 10 1.5 2L4 14" stroke={A} />
      <path d="m7 21 3-6-1.5-3" stroke={A} />
      <path d="m7 3 3 6h4" stroke={A} />
  </>
);

const G_sparkles = makeIcon(
  "Leadflowsparkles",
  <>
      <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
      <path d="M20 2v4" stroke={A} />
      <path d="M22 4h-4" stroke={A} />
      <circle cx="4" cy="20" r="2" stroke={A} />
  </>
);

const G_stickyNote = makeIcon(
  "LeadflowstickyNote",
  <>
      <path d="M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z" />
      <path d="M15 3v5a1 1 0 0 0 1 1h5" stroke={A} />
  </>
);

const G_store = makeIcon(
  "Leadflowstore",
  <>
      <path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5" />
      <path d="M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244" stroke={A} />
      <path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05" />
  </>
);

const G_tags = makeIcon(
  "Leadflowtags",
  <>
      <path d="M13.172 2a2 2 0 0 1 1.414.586l6.71 6.71a2.4 2.4 0 0 1 0 3.408l-4.592 4.592a2.4 2.4 0 0 1-3.408 0l-6.71-6.71A2 2 0 0 1 6 9.172V3a1 1 0 0 1 1-1z" />
      <path d="M2 7v6.172a2 2 0 0 0 .586 1.414l6.71 6.71a2.4 2.4 0 0 0 3.191.193" />
      <circle cx="10.5" cy="6.5" r=".5" fill="currentColor" stroke={A} />
  </>
);

const G_textAlignCenter = makeIcon(
  "LeadflowtextAlignCenter",
  <>
      <path d="M21 5H3" />
      <path d="M17 12H7" />
      <path d="M19 19H5" />
  </>
);

const G_textAlignEnd = makeIcon(
  "LeadflowtextAlignEnd",
  <>
      <path d="M21 5H3" />
      <path d="M21 12H9" />
      <path d="M21 19H7" />
  </>
);

const G_textAlignStart = makeIcon(
  "LeadflowtextAlignStart",
  <>
      <path d="M21 5H3" />
      <path d="M15 12H3" />
      <path d="M17 19H3" />
  </>
);

const G_thumbsDown = makeIcon(
  "LeadflowthumbsDown",
  <>
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
      <path d="M17 14V2" stroke={A} />
  </>
);

const G_trash2 = makeIcon(
  "Leadflowtrash2",
  <>
      <path d="M10 11v6" stroke={A} />
      <path d="M14 11v6" stroke={A} />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </>
);

const G_triangleAlert = makeIcon(
  "LeadflowtriangleAlert",
  <>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" stroke={A} />
      <path d="M12 17h.01" stroke={A} />
  </>
);

const G_type = makeIcon(
  "Leadflowtype",
  <>
      <path d="M12 4v16" />
      <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" />
      <path d="M9 20h6" />
  </>
);

const G_upload = makeIcon(
  "Leadflowupload",
  <>
      <path d="M12 3v12" stroke={A} />
      <path d="m17 8-5-5-5 5" stroke={A} />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
  </>
);

const G_user = makeIcon(
  "Leadflowuser",
  <>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" stroke={A} />
  </>
);

const G_userPlus = makeIcon(
  "LeadflowuserPlus",
  <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" x2="19" y1="8" y2="14" stroke={A} />
      <line x1="22" x2="16" y1="11" y2="11" stroke={A} />
  </>
);

const G_users = makeIcon(
  "Leadflowusers",
  <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <path d="M16 3.128a4 4 0 0 1 0 7.744" stroke={A} />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" stroke={A} />
      <circle cx="9" cy="7" r="4" />
  </>
);

const G_wallet = makeIcon(
  "Leadflowwallet",
  <>
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" stroke={A} />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
  </>
);

const G_workflow = makeIcon(
  "Leadflowworkflow",
  <>
      <rect width="8" height="8" x="3" y="3" rx="2" />
      <path d="M7 11v4a2 2 0 0 0 2 2h4" />
      <rect width="8" height="8" x="13" y="13" rx="2" stroke={A} />
  </>
);

const G_x = makeIcon(
  "Leadflowx",
  <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
  </>
);

const G_zap = makeIcon(
  "Leadflowzap",
  <>
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
  </>
);

// ── Publieke exports (zelfde namen als lucide-react) ────────────────────────
export const AlertCircle = G_circleAlert;
export const AlertTriangle = G_triangleAlert;
export const AlignCenter = G_textAlignCenter;
export const AlignLeft = G_textAlignStart;
export const AlignRight = G_textAlignEnd;
export const Archive = G_archive;
export const ArchiveRestore = G_archiveRestore;
export const ArrowDown = G_arrowDown;
export const ArrowDownCircle = G_circleArrowDown;
export const ArrowLeft = G_arrowLeft;
export const ArrowUp = G_arrowUp;
export const ArrowUpCircle = G_circleArrowUp;
export const Bold = G_bold;
export const Bot = G_bot;
export const Briefcase = G_briefcase;
export const Building2 = G_building2;
export const CalendarClock = G_calendarClock;
export const CalendarPlus = G_calendarPlus;
export const Check = G_check;
export const CheckCheck = G_checkCheck;
export const CheckCircle2 = G_circleCheck;
export const CheckIcon = G_check;
export const ChevronDown = G_chevronDown;
export const ChevronDownIcon = G_chevronDown;
export const ChevronRight = G_chevronRight;
export const ChevronRightIcon = G_chevronRight;
export const ChevronUp = G_chevronUp;
export const ChevronUpIcon = G_chevronUp;
export const CircleCheckIcon = G_circleCheck;
export const CircleIcon = G_circle;
export const Clock = G_clock;
export const Copy = G_copy;
export const Euro = G_euro;
export const ExternalLink = G_externalLink;
export const Eye = G_eye;
export const EyeOff = G_eyeOff;
export const Facebook = G_facebook;
export const FileText = G_fileText;
export const Globe = G_globe;
export const GripVertical = G_gripVertical;
export const Heading = G_heading;
export const Heading2 = G_heading2;
export const Image = G_image;
export const ImagePlus = G_imagePlus;
export const Inbox = G_inbox;
export const Info = G_info;
export const InfoIcon = G_info;
export const Italic = G_italic;
export const Kanban = G_kanban;
export const LayoutDashboard = G_layoutDashboard;
export const Link2 = G_link2;
export const Link2Off = G_link2Off;
export const List = G_list;
export const ListOrdered = G_listOrdered;
export const Loader2 = G_loaderCircle;
export const Loader2Icon = G_loaderCircle;
export const Lock = G_lock;
export const Mail = G_mail;
export const MapPin = G_mapPin;
export const MapPinOff = G_mapPinOff;
export const Megaphone = G_megaphone;
export const Menu = G_menu;
export const MessageCircle = G_messageCircle;
export const MessageSquare = G_messageSquare;
export const Minus = G_minus;
export const MousePointerClick = G_mousePointerClick;
export const OctagonXIcon = G_octagonX;
export const Pause = G_pause;
export const PauseCircle = G_circlePause;
export const Pencil = G_pencil;
export const Phone = G_phone;
export const PhoneIncoming = G_phoneIncoming;
export const PhoneMissed = G_phoneMissed;
export const PhoneOff = G_phoneOff;
export const PhoneOutgoing = G_phoneOutgoing;
export const Play = G_play;
export const PlayCircle = G_circlePlay;
export const Plug = G_plug;
export const Plus = G_plus;
export const QrCode = G_qrCode;
export const Receipt = G_receipt;
export const RefreshCw = G_refreshCw;
export const RotateCcw = G_rotateCcw;
export const Route = G_route;
export const Save = G_save;
export const Search = G_search;
export const Send = G_send;
export const Settings = G_settings;
export const Snowflake = G_snowflake;
export const Sparkles = G_sparkles;
export const StickyNote = G_stickyNote;
export const Store = G_store;
export const Tags = G_tags;
export const ThumbsDown = G_thumbsDown;
export const Trash2 = G_trash2;
export const TriangleAlertIcon = G_triangleAlert;
export const Type = G_type;
export const Upload = G_upload;
export const User = G_user;
export const UserPlus = G_userPlus;
export const Users = G_users;
export const Wallet = G_wallet;
export const Workflow = G_workflow;
export const X = G_x;
export const XCircle = G_circleX;
export const XIcon = G_x;
export const Zap = G_zap;
