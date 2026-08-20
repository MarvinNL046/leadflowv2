import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Elk uur: verlopen follow-ups terugzetten naar stage "Nieuw" zodat het team
// ze weer op het kanban-bord ziet (port van v1's processFollowUps).
crons.interval(
  "process-due-followups",
  { hours: 1 },
  internal.followups.processDueFollowups,
  {},
);

// Elk kwartier: is de WhatsApp-sessie bij Voidfix nog verbonden? Zo niet, dan
// komen berichten van leads niet meer binnen zonder dat iemand dat merkt — dat
// is in juli 2026 vijf weken onopgemerkt gebleven. Stuurt hoogstens eens per
// 12 uur een mail.
crons.interval(
  "whatsapp-sessie-bewaken",
  { minutes: 15 },
  internal.whatsappHealth.controleerSessies,
  {},
);

export default crons;
