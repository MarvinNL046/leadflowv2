import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';

export const DRIP7 = {
  name: 'Abonnement-drip 7 — fris blijven werken',
  subject: 'Uw airco werkt nog goed. Houden zo.',
  body: '<h2>Laat uw airco stil zijn werk blijven doen.</h2>' +
    '<p>Goedendag,</p>' +
    '<p>Uw airco koelt of verwarmt zoals u gewend bent. Dan denkt u waarschijnlijk niet direct aan onderhoud. Toch kan zich tijdens het gebruik langzaam stof en vuil ophopen, ook als u nog niets merkt.</p>' +
    '<p>Met regelmatig onderhoud helpen we uw airco schoon te houden en goed te blijven werken. We reinigen de onderdelen die aandacht nodig hebben en controleren de werking van uw installatie.</p>' +
    '<p><img src="https://leadflow.wetry.app/campagne/onderhoud-drip7.jpeg" alt="Een geopende binnenunit tijdens een professionele reiniging met reinigingsschuim" width="536" style="width:100%;height:auto;border-radius:8px;" /></p>' +
    '<p style="font-size:13px;color:#64748b;">Een onderhoudsbeurt uit onze eigen praktijk.</p>' +
    '<p>Zo geeft u uw airco aandacht vóórdat een muffe geur of minder goede luchtstroom aanleiding wordt om te bellen. Net als bij uw auto: onderhoud hoort ook bij een installatie die het nog prima doet.</p>' +
    '<p>Wilt u het onderhoud regelmatig laten verzorgen? Bekijk ons onderhoudsabonnement en kies het pakket dat bij uw airco past.</p>' +
    '<p style="text-align:center;margin:24px 0;"><a data-cta href="https://aanmelden.staycoolairco.nl/direct?utm_source=email&amp;utm_medium=drip&amp;utm_campaign=onderhoudsabonnement&amp;utm_content=mail-7" style="display:inline-block;background:#c2410c;color:#fff;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Bekijk het onderhoudsabonnement</a></p>' +
    '<p>Met vriendelijke groet,<br>Team Staycool Airconditioning</p>' +
    '<p style="font-size:13px;color:#64748b;">PS Heeft u inmiddels al een onderhoudsabonnement bij ons? Dan hoeft u niets te doen.</p>',
};

/** The requested seventh variant, reusing the first drip's current segment. Never sends. */
export const createDraft = internalMutation({
  args: { sourceBroadcastId: v.id('broadcasts') },
  returns: v.id('broadcasts'),
  handler: async (ctx, { sourceBroadcastId }) => {
    const source = await ctx.db.get(sourceBroadcastId);
    if (!source || source.status !== 'sent') throw new Error('Kies de verzonden eerste drip als bron.');
    const segment = await ctx.db.get(source.segmentId);
    if (!segment || segment.workspaceId !== source.workspaceId) throw new Error('Bronsegment ontbreekt.');
    const candidates = await ctx.db.query('broadcasts').withIndex('by_workspace_status', q => q.eq('workspaceId', source.workspaceId)).take(200);
    const existing = candidates.find(b => b.name === DRIP7.name);
    if (existing) return existing._id;
    const id = await ctx.db.insert('broadcasts', { ...DRIP7, workspaceId: source.workspaceId, segmentId: source.segmentId, status: 'draft', stats: { total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0, bounced: 0, unsubscribed: 0 } });
    await ctx.scheduler.runAfter(0, internal.broadcastAudience.refresh, { broadcastId: id });
    return id;
  },
});
