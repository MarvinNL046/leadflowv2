/**
 * Pluk de menselijke boodschap uit een Convex-error.
 *
 * Convex wikkelt server-side `throw new Error("...")` in een message als:
 *   [CONVEX M(pipelines:deleteStage)] [Request ID: abc123] Server Error
 *   Uncaught Error: <de echte boodschap>
 *       at handler (../convex/pipelines.ts:230:8)
 *
 *     Called by client
 *
 * Voor toasts willen we alleen "<de echte boodschap>" — niet de hele stack.
 */
export function humanizeConvexError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  let msg = err.message;

  msg = msg.replace(
    /^\[CONVEX [^\]]+\]\s*(?:\[Request ID: [^\]]+\])?\s*Server Error:?\s*/i,
    '',
  );
  msg = msg.replace(/^Uncaught (?:Convex)?Error:\s*/i, '');

  const stackIdx = msg.search(/\n\s+at /);
  if (stackIdx !== -1) msg = msg.slice(0, stackIdx);

  msg = msg.replace(/\n+\s*Called by client\s*$/i, '');
  msg = msg.trim();

  return msg || fallback;
}
