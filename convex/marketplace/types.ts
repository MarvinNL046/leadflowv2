import { v } from "convex/values";

/**
 * Marketplace shared validators + pure data (ported from v1
 * src/lib/marketplace/types.ts).
 *
 * The `v.union(v.literal(...))` validators are imported by
 * `convex/schema.ts` (table columns) AND by the marketplace mutations
 * (arg validation). `ALL_NICHES`, `NICHES_WITH_SUBSERVICES` and the
 * label maps are pure TS used by intake validation + UI.
 */

// ── Marketplace niche union (48 values; was pgEnum "marketplace_niche").
// thuisbatterij IS already present — no new value. Reuse everywhere a
// scalar niche appears; for jsonb string[] arrays use v.string() elements
// and validate ⊆ this union in the mutation layer (lossless ETL of stale
// values).
export const marketplaceNiche = v.union(
	v.literal("verhuizen"),
	v.literal("dakdekker"),
	v.literal("stukadoor"),
	v.literal("schilder"),
	v.literal("elektricien"),
	v.literal("ongedierte"),
	v.literal("glaszetter"),
	v.literal("tegelzetter"),
	v.literal("timmerman"),
	v.literal("loodgieter"),
	v.literal("architect"),
	v.literal("glazenwasser"),
	v.literal("zonwering"),
	v.literal("rioolservice"),
	v.literal("schoorsteenveger"),
	v.literal("slotenmaker"),
	v.literal("klusjesman"),
	v.literal("klusser"),
	v.literal("installateur"),
	v.literal("zonnepanelen"),
	v.literal("warmtepomp"),
	v.literal("cv_ketel"),
	v.literal("waterontharder"),
	v.literal("isolatie"),
	v.literal("kozijnen"),
	v.literal("laadpaal"),
	v.literal("ventilatie"),
	v.literal("airco"),
	v.literal("vloerverwarming"),
	v.literal("thuisbatterij"),
	v.literal("alarmsysteem"),
	v.literal("asbest"),
	v.literal("gietvloer"),
	v.literal("verbouwing"),
	v.literal("traprenovatie"),
	v.literal("dakkapel"),
	v.literal("vochtbestrijding"),
	v.literal("badkamer_verbouwen"),
	v.literal("aanbouw"),
	v.literal("gevelwerk"),
	v.literal("tuinadvies"),
	v.literal("hovenier"),
	v.literal("stratenmaker"),
	v.literal("serre"),
	v.literal("garagedeur"),
	v.literal("hekwerk"),
	v.literal("carport"),
	v.literal("veranda"),
);

export const marketplaceServiceType = v.union(
	v.literal("install"),
	v.literal("repair"),
	v.literal("maintain"),
);

export const marketplaceSegment = v.union(v.literal("b2c"), v.literal("b2b"));

export const marketplaceLeadScore = v.union(
	v.literal("high"),
	v.literal("medium"),
	v.literal("low"),
);

// ── Type aliases derived from the validators ────────────────────────────
export type Niche =
	| "verhuizen"
	| "dakdekker"
	| "stukadoor"
	| "schilder"
	| "elektricien"
	| "ongedierte"
	| "glaszetter"
	| "tegelzetter"
	| "timmerman"
	| "loodgieter"
	| "architect"
	| "glazenwasser"
	| "zonwering"
	| "rioolservice"
	| "schoorsteenveger"
	| "slotenmaker"
	| "klusjesman"
	| "klusser"
	| "installateur"
	| "zonnepanelen"
	| "warmtepomp"
	| "cv_ketel"
	| "waterontharder"
	| "isolatie"
	| "kozijnen"
	| "laadpaal"
	| "ventilatie"
	| "airco"
	| "vloerverwarming"
	| "thuisbatterij"
	| "alarmsysteem"
	| "asbest"
	| "gietvloer"
	| "verbouwing"
	| "traprenovatie"
	| "dakkapel"
	| "vochtbestrijding"
	| "badkamer_verbouwen"
	| "aanbouw"
	| "gevelwerk"
	| "tuinadvies"
	| "hovenier"
	| "stratenmaker"
	| "serre"
	| "garagedeur"
	| "hekwerk"
	| "carport"
	| "veranda";

export type ServiceType = "install" | "repair" | "maintain";
export type Segment = "b2c" | "b2b";
export type LeadScore = "high" | "medium" | "low";
export type JobSize = "s" | "m" | "l" | "xl";
export type BuyerIntention = "yes" | "unknown" | "no";

/**
 * All 48 supported marketplace niches, grouped by category. Grouping is
 * pure TS — the column stores only the niche itself; the category is
 * presentational. Admin/buyer UIs use NICHE_CATEGORIES to render grouped
 * selects.
 */
export const NICHE_CATEGORIES = {
	energie: {
		label: "Energie & duurzaamheid",
		niches: [
			"zonnepanelen",
			"warmtepomp",
			"cv_ketel",
			"waterontharder",
			"isolatie",
			"kozijnen",
			"laadpaal",
			"ventilatie",
			"airco",
			"vloerverwarming",
			"thuisbatterij",
		],
	},
	huis: {
		label: "Huis & verbouwing",
		niches: [
			"alarmsysteem",
			"asbest",
			"gietvloer",
			"verbouwing",
			"traprenovatie",
			"dakkapel",
			"vochtbestrijding",
			"badkamer_verbouwen",
			"aanbouw",
			"gevelwerk",
		],
	},
	vakmannen: {
		label: "Vakmannen",
		niches: [
			"verhuizen",
			"dakdekker",
			"stukadoor",
			"schilder",
			"elektricien",
			"ongedierte",
			"glaszetter",
			"tegelzetter",
			"timmerman",
			"loodgieter",
			"architect",
			"glazenwasser",
			"zonwering",
			"rioolservice",
			"schoorsteenveger",
			"slotenmaker",
			"klusjesman",
			"klusser",
			"installateur",
		],
	},
	tuin: {
		label: "Tuin & advies",
		niches: [
			"tuinadvies",
			"hovenier",
			"stratenmaker",
			"serre",
			"garagedeur",
			"hekwerk",
			"carport",
			"veranda",
		],
	},
} as const;

export type NicheCategoryKey = keyof typeof NICHE_CATEGORIES;

export const ALL_NICHES: Niche[] = Object.values(NICHE_CATEGORIES).flatMap(
	(c) => c.niches as unknown as Niche[],
);

/**
 * Human-readable label for a niche. Used everywhere in UI so we don't
 * sprinkle niche→label switch-cases across components.
 */
export const NICHE_LABELS: Record<Niche, string> = {
	// Energie
	zonnepanelen: "Zonnepanelen",
	warmtepomp: "Warmtepomp",
	cv_ketel: "CV-ketel",
	waterontharder: "Waterontharder",
	isolatie: "Isolatie",
	kozijnen: "Kozijnen",
	laadpaal: "Laadpaal",
	ventilatie: "Ventilatie",
	airco: "Airco",
	vloerverwarming: "Vloerverwarming",
	thuisbatterij: "Thuisbatterij",
	// Huis
	alarmsysteem: "Alarmsysteem",
	asbest: "Asbest",
	gietvloer: "Gietvloer",
	verbouwing: "Verbouwing",
	traprenovatie: "Traprenovatie",
	dakkapel: "Dakkapel",
	vochtbestrijding: "Vochtbestrijding",
	badkamer_verbouwen: "Badkamer verbouwen",
	aanbouw: "Aanbouw",
	gevelwerk: "Gevelwerk",
	// Vakmannen
	verhuizen: "Verhuizen",
	dakdekker: "Dakdekker",
	stukadoor: "Stukadoor",
	schilder: "Schilder",
	elektricien: "Elektricien",
	ongedierte: "Ongediertebestrijding",
	glaszetter: "Glaszetter",
	tegelzetter: "Tegelzetter",
	timmerman: "Timmerman",
	loodgieter: "Loodgieter",
	architect: "Architect",
	glazenwasser: "Glazenwasser",
	zonwering: "Zonwering",
	rioolservice: "Rioolservice",
	schoorsteenveger: "Schoorsteenveger",
	slotenmaker: "Slotenmaker",
	klusjesman: "Klusjesman",
	klusser: "Klusser",
	installateur: "Installateur",
	// Tuin
	tuinadvies: "Tuinadvies",
	hovenier: "Hovenier",
	stratenmaker: "Stratenmaker",
	serre: "Serre",
	garagedeur: "Garagedeur",
	hekwerk: "Hekwerk",
	carport: "Carport",
	veranda: "Veranda",
};

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
	install: "Installeren",
	repair: "Repareren",
	maintain: "Onderhouden",
};

export const SEGMENT_LABELS: Record<Segment, string> = {
	b2c: "Particulier",
	b2b: "Zakelijk",
};

/**
 * Niches that actually have a meaningful install/repair/maintain divide.
 * Used by intake (to validate serviceType) and UI (to hide the selector
 * for niches like "verhuizen" or "architect" where it makes no sense).
 * Stored as a Set for O(1) membership checks at intake.
 */
export const NICHES_WITH_SUBSERVICES: Set<Niche> = new Set([
	"airco",
	"zonnepanelen",
	"warmtepomp",
	"cv_ketel",
	"laadpaal",
	"ventilatie",
	"vloerverwarming",
	"thuisbatterij",
	"isolatie",
	"waterontharder",
	"alarmsysteem",
	"kozijnen",
]);

export function nicheHasSubservices(niche: Niche): boolean {
	return NICHES_WITH_SUBSERVICES.has(niche);
}

// ── JobSize / BuyerIntention guards (ported from v1 lead-detail.ts) ──────
export const JOB_SIZES: readonly JobSize[] = ["s", "m", "l", "xl"];
export const BUYER_INTENTIONS: readonly BuyerIntention[] = [
	"yes",
	"unknown",
	"no",
];

export function isJobSize(value: unknown): value is JobSize {
	return typeof value === "string" && (JOB_SIZES as string[]).includes(value);
}

export function isBuyerIntention(value: unknown): value is BuyerIntention {
	return (
		typeof value === "string" &&
		(BUYER_INTENTIONS as string[]).includes(value)
	);
}
