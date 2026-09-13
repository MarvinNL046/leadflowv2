import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { hashCode } from "./suiteAccess";
import type { Id } from "./_generated/dataModel";

export const bridge = httpAction(async (ctx, req) => {
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  const product = req.headers.get("x-suite-product");
  if (product !== "frostwork" && product !== "cashflow")
    return json({ error: "Unauthorized" }, 401);
  const secret =
    process.env[
      product === "frostwork"
        ? "SUITE_FROSTWORK_SECRET"
        : "SUITE_CASHFLOW_SECRET"
    ];
  const supplied =
    req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (
    !secret ||
    secret.length < 32 ||
    supplied.length > 256 ||
    (await hashCode(supplied)) !== (await hashCode(secret))
  )
    return json({ error: "Unauthorized" }, 401);
  try {
    const raw = await req.text();
    if (raw.length > 4096) return json({ error: "Too large" }, 413);
    const body = JSON.parse(raw);
    if (typeof body.targetOrgId !== "string" || body.targetOrgId.length > 100)
      return json({ error: "Invalid request" }, 400);
    const result =
      body.code !== undefined
        ? await ctx.runMutation(internal.suiteAccess.pair, {
            product,
            code: body.code,
            targetOrgId: body.targetOrgId,
            subject: body.subject,
            issuer: body.issuer,
          })
        : await ctx.runQuery(internal.suiteAccess.currentLease, {
            product,
            bindingId: body.bindingId as Id<"suiteBindings">,
            targetOrgId: body.targetOrgId,
          });
    return json(result);
  } catch {
    return json(
      {
        error:
          "Koppeling niet bevestigd. Controleer code, eigenaar en bedrijf.",
      },
      400,
    );
  }
});
