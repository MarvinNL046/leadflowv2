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

test("two companies stay isolated through HTTP pairing, activation and revocation", async () => {
  const { t, code, owner, workspaceId } = await setup();
  const secondWorkspace = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { clerkUserId: "owner-b" });
    const orgId = await ctx.db.insert("orgs", { name: "B", slug: "b", ownerId: userId });
    const workspaceId = await ctx.db.insert("workspaces", { orgId, name: "B", isDefault: true });
    await ctx.db.insert("memberships", { orgId, workspaceId, userId, role: "owner" });
    return workspaceId;
  });
  const second = t.withIdentity({ subject: "owner-b", issuer: "https://issuer.test" });
  const secondCode = await second.mutation(api.suiteAccess.createCode, { workspaceId: secondWorkspace, product: "cashflow" });
  vi.stubEnv("SUITE_CASHFLOW_SECRET", "test-only-secret-never-used-in-production");
  const request = (body: Record<string, string>) => t.fetch("/suite/access", {
    method: "POST", headers: { "x-suite-product": "cashflow", authorization: "Bearer test-only-secret-never-used-in-production" }, body: JSON.stringify(body),
  });
  const aResponse = await request({ code, subject: "owner", issuer: "https://issuer.test", targetOrgId: "target-a" });
  expect(aResponse.status).toBe(200);
  const a = await aResponse.json();
  expect((await request({ code: secondCode, subject: "owner-b", issuer: "https://issuer.test", targetOrgId: "target-a" })).status).toBe(400);
  const bResponse = await request({ code: secondCode, subject: "owner-b", issuer: "https://issuer.test", targetOrgId: "target-b" });
  expect(bResponse.status).toBe(200);
  const b = await bResponse.json();
  const admin = t.withIdentity({ subject: "admin" });
  const grant = { enabled: true, validUntil: Date.now() + 3600000, note: "Geisoleerde technische proef" };
  await admin.mutation(api.suiteAccess.setAccess, { ...grant, bindingId: a.bindingId });
  expect((await owner.query(api.appRequests.status, { workspaceId })).active).toEqual(["cashflow"]);
  expect((await second.query(api.appRequests.status, { workspaceId: secondWorkspace })).active).toEqual([]);
  await expect(second.query(api.appRequests.status, { workspaceId })).rejects.toThrow();
  expect((await request({ bindingId: a.bindingId, targetOrgId: "target-b" })).status).toBe(400);
  await admin.mutation(api.suiteAccess.setAccess, { ...grant, bindingId: b.bindingId });
  await admin.mutation(api.suiteAccess.setAccess, { ...grant, bindingId: a.bindingId, enabled: false, validUntil: 0 });
  const revoked = await (await request({ bindingId: a.bindingId, targetOrgId: "target-a" })).json();
  const untouched = await (await request({ bindingId: b.bindingId, targetOrgId: "target-b" })).json();
  expect(revoked.allowedUntil).toBe(0);
  expect(revoked.revision).toBe(2);
  expect(untouched.allowedUntil).toBeGreaterThan(Date.now());
  expect(untouched.revision).toBe(1);
  expect((await second.query(api.appRequests.status, { workspaceId: secondWorkspace })).active).toEqual(["cashflow"]);
});
