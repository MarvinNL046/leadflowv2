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

export default crons;
