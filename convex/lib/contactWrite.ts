import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { buildSearchText } from "../contactSearch";

/**
 * Schrijf-helpers die het gedenormaliseerde `searchText`-veld op contacts
 * onderhouden (voorberekend zoek-haystack voor searchContacts, zie
 * contactSearch.buildSearchText + matchesHaystack).
 *
 * REGEL: elk schrijfpad dat zoekvelden raakt (naam, e-mail, telefoon,
 * bedrijf, straat, huisnummer, postcode, plaats) moet via deze helpers —
 * een insert zonder searchText of een patch zonder refresh maakt het
 * contact onvindbaar (of verouderd vindbaar) in de zoekbalk.
 */

/** Insert een contact mét berekend searchText. */
export async function insertContactWithSearchText(
  ctx: MutationCtx,
  fields: Omit<WithoutSystemFields<Doc<"contacts">>, "searchText">,
): Promise<Id<"contacts">> {
  return await ctx.db.insert("contacts", {
    ...fields,
    searchText: buildSearchText(fields),
  });
}

/**
 * Herbereken searchText nadat een patch zoekvelden geraakt kan hebben.
 * Leest de verse rij en patcht alleen als de waarde echt wijzigt (no-op
 * anders) — idempotent en veilig om na elke contact-patch aan te roepen.
 */
export async function refreshContactSearchText(
  ctx: MutationCtx,
  contactId: Id<"contacts">,
): Promise<void> {
  const contact = await ctx.db.get(contactId);
  if (!contact) return;
  const searchText = buildSearchText(contact);
  if (contact.searchText !== searchText) {
    await ctx.db.patch(contactId, { searchText });
  }
}
