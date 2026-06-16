export type SegmentMatch = "all" | "any";
export type Condition = { field: string; op: string; value: unknown };
export type SegmentRules = { match: SegmentMatch; conditions: Condition[] };

/** Contact afgevlakt tot precies de velden waarop een segment filtert. De
 *  Convex-resolver bouwt dit object (joins op opportunities/attribution/custom). */
export type MatchableContact = {
  emailMarketingStatus?: "subscribed" | "unsubscribed" | "cleaned";
  email?: string;
  tags: string[];
  city?: string;
  province?: string;
  callCount: number;
  createdAt: number;
  stageId?: string;
  source?: string;
  custom: Record<string, unknown>;
};

export function isMailable(c: {
  emailMarketingStatus?: string;
  email?: string;
}): boolean {
  if (!c.email) return false;
  return c.emailMarketingStatus !== "unsubscribed" && c.emailMarketingStatus !== "cleaned";
}

function fieldValue(c: MatchableContact, field: string): unknown {
  if (field.startsWith("custom:")) return c.custom[field.slice("custom:".length)];
  switch (field) {
    case "tags": return c.tags;
    case "city": return c.city;
    case "province": return c.province;
    case "callCount": return c.callCount;
    case "createdAt": return c.createdAt;
    case "stage": return c.stageId;
    case "source": return c.source;
    default: return undefined;
  }
}

function evalCondition(c: MatchableContact, cond: Condition): boolean {
  const actual = fieldValue(c, cond.field);
  const expected = cond.value;
  switch (cond.op) {
    case "eq": return actual === expected;
    case "neq": return actual !== expected;
    case "contains":
      return Array.isArray(actual)
        ? actual.includes(expected as never)
        : typeof actual === "string" && actual.includes(String(expected));
    case "in":
      return Array.isArray(expected) && expected.includes(actual as never);
    case "gt": return numericCompare(actual, expected, (a, b) => a > b);
    case "lt": return numericCompare(actual, expected, (a, b) => a < b);
    case "before": return numericCompare(actual, expected, (a, b) => a < b);
    case "after": return numericCompare(actual, expected, (a, b) => a > b);
    default: return false;
  }
}

/** Vergelijk twee getallen; faalt veilig (false) als actual geen number is of
 *  expected niet naar een geldig getal te coercen valt (bv. ISO-datumstring → NaN). */
function numericCompare(
  actual: unknown,
  expected: unknown,
  cmp: (a: number, b: number) => boolean,
): boolean {
  if (typeof actual !== "number") return false;
  const b = Number(expected);
  if (Number.isNaN(b)) return false;
  return cmp(actual, b);
}

export function contactMatchesRules(c: MatchableContact, rules: SegmentRules): boolean {
  if (rules.conditions.length === 0) return true;
  const results = rules.conditions.map((cond) => evalCondition(c, cond));
  return rules.match === "all" ? results.every(Boolean) : results.some(Boolean);
}

/** Dedupliceer op lowercased email; behoud volgorde; drop rijen zonder email. */
export function dedupeByEmail<T extends { email?: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (!r.email) continue;
    const key = r.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
