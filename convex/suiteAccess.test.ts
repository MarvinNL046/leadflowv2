/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test, vi, afterEach } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkUserId: "owner" }),
      admin = await ctx.db.insert("users", { clerkUserId: "admin" }),
      member = await ctx.db.insert("users", { clerkUserId: "member" });
    await ctx.db.insert("userProfiles", {
      userId: admin,
      locale: "nl",
      isSuperAdmin: true,
    });
    const orgId = await ctx.db.insert("orgs", {
      name: "A",
      slug: "a",
      ownerId: userId,
    });
    const workspaceId = await ctx.db.insert("workspaces", {
      orgId,
      name: "A",
      isDefault: true,
    });
    await ctx.db.insert("memberships", {
      orgId,
      workspaceId,
      userId,
      role: "owner",
    });
    await ctx.db.insert("memberships", {
      orgId,
      workspaceId,
      userId: member,
      role: "member",
    });
    return { orgId, workspaceId };
  });
  const owner = t.withIdentity({
    subject: "owner",
    issuer: "https://issuer.test",
  });
  const code = await owner.mutation(api.suiteAccess.createCode, {
    workspaceId: ids.workspaceId,
    product: "cashflow",
  });
  return { t, owner, code, ...ids };
}
test("pairing binds same issuer and subject, is idempotent and starts disabled", async () => {
  const { t, code } = await setup();
  const args = {
    product: "cashflow" as const,
    code,
    targetOrgId: "target-a",
    subject: "owner",
    issuer: "https://issuer.test",
  };
  for (const extra of [
    { subject: "member" },
    { issuer: "https://other.test" },
    { product: "frostwork" as const },
  ])
    await expect(
      t.mutation(internal.suiteAccess.pair, { ...args, ...extra }),
    ).rejects.toThrow();
  const a = await t.mutation(internal.suiteAccess.pair, args);
  expect(a.allowedUntil).toBe(0);
  expect((await t.mutation(internal.suiteAccess.pair, args)).bindingId).toBe(
    a.bindingId,
  );
  await expect(
    t.mutation(internal.suiteAccess.pair, { ...args, targetOrgId: "other" }),
  ).rejects.toThrow();
});
test("member and unrelated admin cannot generate pairing codes", async () => {
  const { t, workspaceId } = await setup();
  for (const subject of ["member", "admin", "unknown"])
    await expect(
      t
        .withIdentity({ subject })
        .mutation(api.suiteAccess.createCode, {
          workspaceId,
          product: "cashflow",
        }),
    ).rejects.toThrow();
});
test("expired pairing codes are rejected", async () => {
  const { t, code } = await setup();
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 600001);
  await expect(
    t.mutation(internal.suiteAccess.pair, {
      product: "cashflow",
      code,
      targetOrgId: "a",
      subject: "owner",
      issuer: "https://issuer.test",
    }),
  ).rejects.toThrow();
});
test("only platform admin grants; leases are bounded, isolated by product and revoked with audit", async () => {
  const { t, owner, code, workspaceId } = await setup();
  const row = await t.mutation(internal.suiteAccess.pair, {
    product: "cashflow",
    code,
    targetOrgId: "a",
    subject: "owner",
    issuer: "https://issuer.test",
  });
  const bindingId = row.bindingId as any;
  const args = {
    bindingId,
    enabled: true,
    validUntil: Date.now() + 86400000,
    note: "Handmatige testafspraak",
  };
  await expect(
    owner.mutation(api.suiteAccess.setAccess, args),
  ).rejects.toThrow();
  const admin = t.withIdentity({ subject: "admin" });
  await admin.mutation(api.suiteAccess.setAccess, args);
  const query = { bindingId, product: "cashflow" as const, targetOrgId: "a" };
  const lease = await t.query(internal.suiteAccess.currentLease, query);
  expect(lease.allowedUntil - lease.issuedAt).toBeLessThanOrEqual(900000);
  expect(
    (await owner.query(api.appRequests.status, { workspaceId })).active,
  ).toEqual(["cashflow"]);
  await expect(
    t.query(internal.suiteAccess.currentLease, {
      ...query,
      product: "frostwork",
    }),
  ).rejects.toThrow();
  await expect(
    t.query(internal.suiteAccess.currentLease, { ...query, targetOrgId: "b" }),
  ).rejects.toThrow();
  await admin.mutation(api.suiteAccess.setAccess, {
    ...args,
    enabled: false,
    validUntil: 0,
  });
  expect(
    (await t.query(internal.suiteAccess.currentLease, query)).allowedUntil,
  ).toBe(0);
  expect(
    await t.run((ctx) => ctx.db.query("suiteAccessAudit").take(10)),
  ).toHaveLength(2);
});
test("bridge rejects requests without the per-product secret", async () => {
  const { t } = await setup();
  expect(
    (await t.fetch("/suite/access", { method: "POST", body: "{}" })).status,
  ).toBe(401);
});
