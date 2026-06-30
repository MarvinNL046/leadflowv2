/**
 * Marketplace regions — 1:1 mapping of HomeDeal's regional structure.
 *
 * Three-level hierarchy: Netherlands → Region (20) → City (~130) →
 * postcode ranges. Each city has one or more 4-digit postcode ranges.
 *
 * Intake uses this to derive (region, city) from a lead's postcode.
 * Buyers pick regions in their preferences; the feed filters by those.
 *
 * Data source: HomeDeal seller dashboard (2026-04-22). Six regions
 * were collapsed in the source — their top-level cities are added as
 * placeholder single-city entries so they can be picked; expand with
 * sub-cities when we have the data.
 */

export interface CityRange {
  /** Inclusive 4-digit postcode range. E.g. [1800, 1879] covers 1800-1879. */
  from: number;
  to: number;
}

export interface MarketplaceCity {
  name: string;
  ranges: CityRange[];
}

export interface MarketplaceRegion {
  /** Unique across all regions — also used as the value stored on leads. */
  name: string;
  cities: MarketplaceCity[];
}

export const REGIONS: MarketplaceRegion[] = [
  {
    name: "Alkmaar",
    cities: [
      { name: "Alkmaar", ranges: [{ from: 1800, to: 1879 }] },
      { name: "Castricum", ranges: [{ from: 1900, to: 1939 }] },
      { name: "Den Helder", ranges: [{ from: 1780, to: 1789 }] },
      { name: "Enkhuizen", ranges: [{ from: 1600, to: 1619 }] },
      { name: "Heerhugowaard", ranges: [{ from: 1700, to: 1739 }] },
      { name: "Hoorn", ranges: [{ from: 1620, to: 1699 }] },
      { name: "Schagen", ranges: [{ from: 1740, to: 1779 }] },
      { name: "Texel", ranges: [{ from: 1790, to: 1799 }] },
    ],
  },
  {
    name: "Amersfoort",
    cities: [
      { name: "Amersfoort", ranges: [{ from: 3800, to: 3839 }] },
      { name: "Barneveld", ranges: [{ from: 3770, to: 3799 }] },
      { name: "Harderwijk", ranges: [{ from: 3840, to: 3859 }] },
      { name: "Nijkerk", ranges: [{ from: 3860, to: 3899 }] },
      { name: "Soest", ranges: [{ from: 3740, to: 3769 }] },
    ],
  },
  {
    name: "Amsterdam",
    cities: [
      { name: "Amstelveen", ranges: [{ from: 1180, to: 1199 }] },
      { name: "Amsterdam", ranges: [{ from: 1000, to: 1119 }] },
    ],
  },
  {
    name: "Apeldoorn",
    cities: [
      { name: "Apeldoorn", ranges: [{ from: 7300, to: 7399 }] },
      { name: "Deventer", ranges: [{ from: 7400, to: 7439 }] },
      { name: "Zutphen", ranges: [{ from: 7200, to: 7279 }] },
    ],
  },
  {
    name: "Arnhem",
    cities: [
      { name: "Arnhem", ranges: [{ from: 6800, to: 6859 }] },
      { name: "Dieren", ranges: [{ from: 6950, to: 6999 }] },
      { name: "Doetinchem", ranges: [{ from: 7000, to: 7099 }] },
      { name: "Ede", ranges: [{ from: 6710, to: 6749 }] },
      { name: "Oosterbeek", ranges: [{ from: 6860, to: 6879 }] },
      { name: "Tiel", ranges: [{ from: 4000, to: 4069 }] },
      { name: "Veenendaal", ranges: [{ from: 3900, to: 3939 }] },
      { name: "Velp", ranges: [{ from: 6880, to: 6899 }] },
      { name: "Wageningen", ranges: [{ from: 6700, to: 6709 }] },
      { name: "Zevenaar", ranges: [{ from: 6900, to: 6949 }] },
    ],
  },
  {
    name: "Breda",
    cities: [
      { name: "Bergen op Zoom", ranges: [{ from: 4600, to: 4699 }] },
      { name: "Breda", ranges: [{ from: 4800, to: 4899 }] },
      { name: "Oosterhout", ranges: [{ from: 4900, to: 4949 }] },
      { name: "Roosendaal", ranges: [{ from: 4700, to: 4799 }] },
    ],
  },
  // Regions below were collapsed in the source (cities not listed).
  // Single-city placeholders use the region name so buyers can still
  // select them. Expand these when we get the full HomeDeal data.
  {
    name: "Den Bosch",
    cities: [{ name: "Den Bosch", ranges: [{ from: 5200, to: 5249 }] }],
  },
  {
    name: "Den Haag",
    cities: [{ name: "Den Haag", ranges: [{ from: 2490, to: 2599 }] }],
  },
  {
    name: "Drechtsteden",
    cities: [{ name: "Dordrecht", ranges: [{ from: 3300, to: 3399 }] }],
  },
  {
    name: "Drenthe",
    cities: [
      {
        name: "Assen/Emmen",
        // Conservative ranges avoiding overlap with Zwolle/Groningen:
        // 7800-7899 (Emmen area) + 9400-9499 (Assen area)
        ranges: [
          { from: 7800, to: 7899 },
          { from: 9400, to: 9499 },
        ],
      },
    ],
  },
  {
    name: "Eindhoven",
    cities: [{ name: "Eindhoven", ranges: [{ from: 5600, to: 5799 }] }],
  },
  {
    name: "Friesland",
    cities: [{ name: "Leeuwarden", ranges: [{ from: 8400, to: 8999 }] }],
  },
  {
    name: "Groningen",
    cities: [
      { name: "Appingedam", ranges: [{ from: 9900, to: 9949 }] },
      { name: "Groningen", ranges: [{ from: 9700, to: 9899 }] },
      { name: "Hoogezand", ranges: [{ from: 9600, to: 9639 }] },
      { name: "Stadskanaal", ranges: [{ from: 9500, to: 9599 }] },
      { name: "Veendam", ranges: [{ from: 9640, to: 9669 }] },
      { name: "Winschoten", ranges: [{ from: 9670, to: 9699 }] },
      { name: "Winsum", ranges: [{ from: 9950, to: 9999 }] },
    ],
  },
  {
    name: "Haarlem",
    cities: [
      { name: "Beverwijk", ranges: [{ from: 1940, to: 1969 }] },
      { name: "Haarlem", ranges: [{ from: 2000, to: 2089 }] },
      { name: "Heemstede", ranges: [{ from: 2100, to: 2129 }] },
      { name: "Hoofddorp", ranges: [{ from: 2130, to: 2159 }] },
      { name: "IJmuiden", ranges: [{ from: 1970, to: 1999 }] },
      { name: "Uithoorn", ranges: [{ from: 1420, to: 1439 }] },
      { name: "Zwanenburg", ranges: [{ from: 1160, to: 1179 }] },
    ],
  },
  {
    name: "Leiden",
    cities: [
      { name: "Alphen aan den Rijn", ranges: [{ from: 2400, to: 2489 }] },
      { name: "Katwijk", ranges: [{ from: 2220, to: 2239 }] },
      { name: "Leiden", ranges: [{ from: 2300, to: 2399 }] },
      { name: "Lisse", ranges: [{ from: 2160, to: 2199 }] },
      { name: "Noordwijk", ranges: [{ from: 2200, to: 2219 }] },
      // Voorschoten postcodes not listed in source — tentative 2250-2259
      { name: "Voorschoten", ranges: [{ from: 2250, to: 2259 }] },
    ],
  },
  {
    name: "Nijmegen",
    cities: [
      { name: "Elst", ranges: [{ from: 6660, to: 6699 }] },
      { name: "Nijmegen", ranges: [{ from: 6500, to: 6599 }] },
      { name: "Uden", ranges: [{ from: 5400, to: 5459 }] },
      { name: "Wijchen", ranges: [{ from: 6600, to: 6659 }] },
    ],
  },
  {
    name: "Noord-Limburg",
    cities: [
      { name: "Roermond", ranges: [{ from: 6040, to: 6099 }] },
      { name: "Venlo", ranges: [{ from: 5900, to: 5999 }] },
      { name: "Venray", ranges: [{ from: 5800, to: 5879 }] },
      { name: "Weert", ranges: [{ from: 6000, to: 6039 }] },
    ],
  },
  {
    name: "Rotterdam",
    cities: [
      { name: "Capelle", ranges: [{ from: 2900, to: 2919 }] },
      { name: "Delft", ranges: [{ from: 2600, to: 2669 }] },
      { name: "Gouda", ranges: [{ from: 2800, to: 2879 }] },
      { name: "Hellevoetsluis", ranges: [{ from: 3220, to: 3239 }] },
      { name: "Hoogvliet", ranges: [{ from: 3160, to: 3199 }] },
      { name: "Krimpen", ranges: [{ from: 2920, to: 2949 }] },
      { name: "Maassluis", ranges: [{ from: 3140, to: 3159 }] },
      { name: "Middelharnis", ranges: [{ from: 3240, to: 3259 }] },
      { name: "Oud-Beijerland", ranges: [{ from: 3260, to: 3299 }] },
      { name: "Ridderkerk", ranges: [{ from: 2980, to: 2999 }] },
      { name: "Rotterdam", ranges: [{ from: 3000, to: 3089 }] },
      { name: "Schiedam", ranges: [{ from: 3100, to: 3129 }] },
      { name: "Spijkenisse", ranges: [{ from: 3200, to: 3219 }] },
      { name: "Vlaardingen", ranges: [{ from: 3130, to: 3139 }] },
      { name: "Waddinxveen", ranges: [{ from: 2740, to: 2779 }] },
      { name: "Zoetermeer", ranges: [{ from: 2700, to: 2739 }] },
    ],
  },
  {
    name: "Tilburg",
    cities: [
      { name: "Tilburg", ranges: [{ from: 5000, to: 5139 }] },
      { name: "Waalwijk", ranges: [{ from: 5140, to: 5179 }] },
    ],
  },
  {
    name: "Twente",
    cities: [
      { name: "Almelo", ranges: [{ from: 7600, to: 7669 }] },
      { name: "Enschede", ranges: [{ from: 7500, to: 7549 }] },
      { name: "Goor", ranges: [{ from: 7470, to: 7499 }] },
      { name: "Hengelo", ranges: [{ from: 7550, to: 7569 }] },
      { name: "Lichtenvoorde", ranges: [{ from: 7130, to: 7169 }] },
      { name: "Nijverdal", ranges: [{ from: 7440, to: 7469 }] },
      { name: "Oldenzaal", ranges: [{ from: 7570, to: 7599 }] },
      { name: "Winterswijk", ranges: [{ from: 7100, to: 7129 }] },
    ],
  },
  {
    name: "Utrecht",
    cities: [
      { name: "Bilthoven", ranges: [{ from: 3720, to: 3739 }] },
      { name: "Culemborg", ranges: [{ from: 4100, to: 4139 }] },
      { name: "Doorn", ranges: [{ from: 3940, to: 3969 }] },
      { name: "Driebergen-Rijsenburg", ranges: [{ from: 3970, to: 3999 }] },
      { name: "IJsselstein", ranges: [{ from: 3400, to: 3429 }] },
      { name: "Leerdam", ranges: [{ from: 4140, to: 4199 }] },
      { name: "Maarssen", ranges: [{ from: 3600, to: 3659 }] },
      { name: "Nieuwegein", ranges: [{ from: 3430, to: 3439 }] },
      { name: "Utrecht", ranges: [{ from: 3500, to: 3589 }] },
      { name: "Woerden", ranges: [{ from: 3440, to: 3489 }] },
      { name: "Zeist", ranges: [{ from: 3700, to: 3719 }] },
    ],
  },
  {
    name: "Zaanstreek",
    cities: [
      { name: "Purmerend", ranges: [{ from: 1440, to: 1489 }] },
      { name: "Volendam", ranges: [{ from: 1120, to: 1159 }] },
      { name: "Wormerveer", ranges: [{ from: 1520, to: 1569 }] },
      { name: "Zaandam", ranges: [{ from: 1500, to: 1519 }] },
    ],
  },
  {
    name: "Zeeland",
    cities: [
      { name: "Noord- en Zuid-Beveland", ranges: [{ from: 4400, to: 4499 }] },
      { name: "Schouwen-Duiveland", ranges: [{ from: 4300, to: 4329 }] },
      { name: "Walcheren", ranges: [{ from: 4330, to: 4399 }] },
      { name: "Zeeuws-Vlaanderen", ranges: [{ from: 4500, to: 4589 }] },
    ],
  },
  {
    name: "Zuid-Limburg",
    cities: [
      { name: "Brunssum", ranges: [{ from: 6440, to: 6459 }] },
      { name: "Geleen", ranges: [{ from: 6160, to: 6199 }] },
      {
        name: "Heerlen",
        ranges: [
          { from: 6300, to: 6379 },
          { from: 6400, to: 6439 },
        ],
      },
      { name: "Kerkrade", ranges: [{ from: 6460, to: 6479 }] },
      { name: "Maastricht", ranges: [{ from: 6200, to: 6299 }] },
      { name: "Sittard", ranges: [{ from: 6100, to: 6159 }] },
    ],
  },
  {
    name: "Zwolle",
    cities: [
      { name: "Dedemsvaart", ranges: [{ from: 7700, to: 7739 }] },
      { name: "Emmeloord", ranges: [{ from: 8300, to: 8329 }] },
      { name: "Epe", ranges: [{ from: 8160, to: 8199 }] },
      { name: "Kampen", ranges: [{ from: 8250, to: 8299 }] },
      { name: "Nunspeet", ranges: [{ from: 8070, to: 8099 }] },
      { name: "Raalte", ranges: [{ from: 8100, to: 8159 }] },
      { name: "Vriezenveen", ranges: [{ from: 7670, to: 7699 }] },
      { name: "Zwolle", ranges: [{ from: 8000, to: 8069 }] },
    ],
  },
  {
    name: "'t Gooi / Flevoland",
    cities: [
      { name: "Almere", ranges: [{ from: 1300, to: 1369 }] },
      { name: "Bussum", ranges: [{ from: 1400, to: 1419 }] },
      { name: "Hilversum", ranges: [{ from: 1200, to: 1249 }] },
      { name: "Huizen", ranges: [{ from: 1270, to: 1279 }] },
      { name: "Laren", ranges: [{ from: 1250, to: 1269 }] },
      { name: "Lelystad", ranges: [{ from: 8200, to: 8249 }] },
      { name: "Weesp", ranges: [{ from: 1380, to: 1399 }] },
    ],
  },
];

/**
 * Flattened list of all region names. Convenient for UI selects and
 * validation.
 */
export const ALL_REGION_NAMES = REGIONS.map((r) => r.name);

/**
 * Given a raw NL postcode (4 digits, optionally with space + 2
 * letters), find the matching region + city. Returns null if no match.
 *
 * Used by intake to auto-derive region/city from the submitted
 * postcode so buyers can filter by region without us asking for extra
 * form fields.
 */
export function lookupRegionByPostcode(
  postcode: string | null | undefined
): { region: string; city: string } | null {
  if (!postcode) return null;
  const digits = postcode.replace(/\D/g, "").slice(0, 4);
  if (digits.length !== 4) return null;
  const pc = Number.parseInt(digits, 10);
  if (!Number.isFinite(pc)) return null;

  for (const region of REGIONS) {
    for (const city of region.cities) {
      for (const range of city.ranges) {
        if (pc >= range.from && pc <= range.to) {
          return { region: region.name, city: city.name };
        }
      }
    }
  }
  return null;
}
