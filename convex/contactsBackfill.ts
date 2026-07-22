import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { buildSearchText } from "./contactSearch";

/**
 * Backfill van het gedenormaliseerde `searchText`-veld op contacts (gebruikt
 * door searchContacts voor snelle per-rij substring-matching — zie
 * contactSearch.buildSearchText en lib/contactWrite.ts).
 *
 * NB: searchContacts heeft dit veld NIET nodig om correct te zijn — het pad
 * valt per rij terug op live buildSearchText(contact) als searchText leeg is
 * (geen kapot venster tussen deploy en backfill). Deze backfill is puur een
 * PERF-convergentie: eenmaal gevuld is matchen goedkoper (geen live-opbouw).
 *
 * Draaien op prod, één keer ná deploy — kies één van de twee:
 *
 *   npx convex run contactsBackfill:backfillSearchTextAll --prod
 *   # of vanuit een deploy-script, via de scheduler-wrapper:
 *   npx convex run contactsBackfill:scheduleBackfill --prod
 *
 * Bewust NIET aan een cron of on-deploy-hook gehangen: dat zou bij elke
 * deploy ~4.700 docs opnieuw scannen zonder winst (idempotent, maar zinloos).
 *
 * Idempotent: rijen waar searchText al klopt worden geskipt, herdraaien is
 * altijd veilig. De action loopt server-side batches van ≤200 af tot de
 * hele tabel gedaan is en rapporteert { patched, scanned, batches }.
 * Soft-deleted contacten krijgen óók searchText (onschadelijk — de query
 * sluit ze uit via het deletedAt-filter).
 */

export const backfillSearchText = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const numItems = Math.min(Math.max(1, args.batchSize ?? 200), 200);
    const page = await ctx.db
      .query("contacts")
      .paginate({ numItems, cursor: args.cursor ?? null });

    let patched = 0;
    for (const contact of page.page) {
      const searchText = buildSearchText(contact);
      if (contact.searchText !== searchText) {
        await ctx.db.patch(contact._id, { searchText });
        patched++;
      }
    }

    return {
      patched,
      scanned: page.page.length,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/**
 * Deploy-veilige wrapper: schedule de backfill-action op de achtergrond
 * (runAfter 0) en keer direct terug. Handig vanuit een post-deploy-script —
 * de zware scan draait dan async in de Convex-scheduler i.p.v. de CLI-call
 * te blokkeren. Idempotent (de onderliggende backfill skipt reeds-correcte
 * rijen), dus meermaals aanroepen is veilig.
 */
export const scheduleBackfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(
      0,
      internal.contactsBackfill.backfillSearchTextAll,
      {},
    );
    return { scheduled: true };
  },
});

export const backfillSearchTextAll = internalAction({
  args: {},
  handler: async (ctx) => {
    let cursor: string | undefined;
    let patched = 0;
    let scanned = 0;
    let batches = 0;
    for (;;) {
      const res: {
        patched: number;
        scanned: number;
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runMutation(internal.contactsBackfill.backfillSearchText, {
        cursor,
      });
      patched += res.patched;
      scanned += res.scanned;
      batches++;
      if (res.isDone) break;
      cursor = res.continueCursor;
    }
    console.log(
      `backfillSearchText klaar: ${patched} gepatcht van ${scanned} gescand in ${batches} batches`,
    );
    return { patched, scanned, batches };
  },
});
