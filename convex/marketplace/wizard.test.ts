/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { hashApiKey } from "./apiKeys";

// Glob vanuit deze submap geeft "../x.ts" voor convex-root-bestanden en
// "./x.ts" voor bestanden in marketplace/ zelf; convex-test verwacht
// alles relatief aan convex/ ("./…"), dus herschrijf beide prefixen.
const modules = Object.fromEntries(
	Object.entries(import.meta.glob("../**/*.ts")).map(([k, v]) => [
		k.startsWith("../")
			? `./${k.slice(3)}`
			: `./marketplace/${k.slice(2)}`,
		v,
	]),
);

/**
 * Wizard-OTP flow (v1-compat shim). Dekt de internal-laag: start →
 * recordDispatch → attemptVerify → promotie via intake.insertLead →
 * markPromoted. De http-routes zijn dunne wrappers hierom heen.
 */

const RAW_KEY = "lmk_testtesttesttesttesttesttest12";

async function setupKey(
	t: ReturnType<typeof convexTest>,
	opts?: { trusted?: boolean },
) {
	const keyHash = await hashApiKey(RAW_KEY);
	return t.run(async (ctx) => {
		return ctx.db.insert("marketplaceApiKeys", {
			keyHash,
			keyPrefix: RAW_KEY.slice(0, 12),
			name: "wizard-test.nl",
			defaultNiche: "airco",
			allowedNiches: ["airco"],
			isActive: true,
			trusted: opts?.trusted ?? true,
		});
	});
}

const PAYLOAD = {
	firstName: "Test",
	lastName: "Wizard",
	phone: "+31612345678",
	email: "test@example.com",
	postalCode: "6222XD",
	nicheData: { amount_rooms: 3 },
};

async function startVerification(
	t: ReturnType<typeof convexTest>,
	apiKeyId: Id<"marketplaceApiKeys">,
	ip = "1.2.3.4",
) {
	const res = await t.mutation(internal.marketplace.wizard.start, {
		apiKeyId,
		niche: "airco",
		phone: PAYLOAD.phone,
		email: PAYLOAD.email,
		payload: PAYLOAD,
		metadata: { source: "wizard-test.nl" },
		ip,
	});
	if (res.rateLimited) throw new Error("onverwacht rate-limited");
	return res;
}

describe("wizard OTP-flow", () => {
	test("happy path: start → dispatch → verify → gepromoveerde lead", async () => {
		const t = convexTest(schema, modules);
		const apiKeyId = await setupKey(t);
		const { token } = await startVerification(t, apiKeyId);

		// Dispatch met bekende codes (zoals send-code dat doet).
		const row = await t.query(internal.marketplace.wizard.getByToken, {
			token,
		});
		expect(row).not.toBeNull();
		const emailCode = "654321";
		await t.mutation(internal.marketplace.wizard.recordDispatch, {
			verificationId: row!._id,
			phoneCodeHash: await hashApiKey("111111"),
			emailCodeHash: await hashApiKey(emailCode),
			smsOk: true,
			emailOk: true,
		});

		// Juiste (e-mail)code → match.
		const attempt = await t.mutation(
			internal.marketplace.wizard.attemptVerify,
			{
				token,
				apiKeyId,
				codeHash: await hashApiKey(emailCode),
			},
		);
		expect(attempt.outcome).toBe("match");
		if (attempt.outcome !== "match") return;
		expect(attempt.matchedChannel).toBe("email");

		// Promotie via de bestaande single-source intake-mutatie.
		const result = await t.mutation(internal.marketplace.intake.insertLead, {
			apiKeyId,
			niche: attempt.niche,
			firstName: PAYLOAD.firstName,
			lastName: PAYLOAD.lastName,
			phone: PAYLOAD.phone,
			postalCode: PAYLOAD.postalCode,
			email: PAYLOAD.email,
			jobSize: "l", // afgeleid uit amount_rooms=3
			metadata: attempt.metadata,
		});
		expect(result.ok).toBe(true);

		await t.mutation(internal.marketplace.wizard.markPromoted, {
			verificationId: attempt.verificationId,
			leadId: result.leadId as Id<"marketplaceLeads">,
			matchedChannel: attempt.matchedChannel,
		});

		// Verificatie afgestempeld + lead heeft emailVerifiedAt.
		const after = await t.query(internal.marketplace.wizard.getByToken, {
			token,
		});
		expect(after!.verifiedAt).toBeDefined();
		expect(after!.emailVerifiedAt).toBeDefined();
		expect(after!.promotedLeadId).toBe(result.leadId);
		const lead = await t.run(async (ctx) =>
			ctx.db.get(result.leadId as Id<"marketplaceLeads">),
		);
		expect(lead!.emailVerifiedAt).toBeDefined();
		expect(lead!.phoneVerifiedAt).toBeUndefined();
	});

	test("foute code: attempts lopen op tot too_many_attempts", async () => {
		const t = convexTest(schema, modules);
		const apiKeyId = await setupKey(t);
		const { token } = await startVerification(t, apiKeyId);
		const wrong = await hashApiKey("000000");

		for (let i = 1; i <= 5; i++) {
			const res = await t.mutation(internal.marketplace.wizard.attemptVerify, {
				token,
				apiKeyId,
				codeHash: wrong,
			});
			expect(res.outcome).toBe("invalid_code");
			if (res.outcome === "invalid_code") {
				expect(res.attemptsLeft).toBe(5 - i);
			}
		}
		const blocked = await t.mutation(
			internal.marketplace.wizard.attemptVerify,
			{ token, apiKeyId, codeHash: wrong },
		);
		expect(blocked.outcome).toBe("too_many_attempts");
	});

	test("rate-limit: 6e start vanaf zelfde IP wordt geweigerd", async () => {
		const t = convexTest(schema, modules);
		const apiKeyId = await setupKey(t);
		for (let i = 0; i < 5; i++) {
			await startVerification(t, apiKeyId, "9.9.9.9");
		}
		const sixth = await t.mutation(internal.marketplace.wizard.start, {
			apiKeyId,
			niche: "airco",
			phone: PAYLOAD.phone,
			email: PAYLOAD.email,
			payload: PAYLOAD,
			ip: "9.9.9.9",
		});
		expect(sixth.rateLimited).toBe(true);
	});

	test("verkeerde api-key ziet andermans verificatie niet", async () => {
		const t = convexTest(schema, modules);
		const apiKeyId = await setupKey(t);
		const otherKeyId = await t.run(async (ctx) =>
			ctx.db.insert("marketplaceApiKeys", {
				keyHash: await hashApiKey("lmk_ander"),
				keyPrefix: "lmk_ander",
				name: "andere-site.nl",
				defaultNiche: "airco",
				allowedNiches: ["airco"],
				isActive: true,
			}),
		);
		const { token } = await startVerification(t, apiKeyId);
		const res = await t.mutation(internal.marketplace.wizard.attemptVerify, {
			token,
			apiKeyId: otherKeyId,
			codeHash: await hashApiKey("123456"),
		});
		expect(res.outcome).toBe("not_found");
	});

	test("http /start: honeypot → 400, geldige aanvraag → token", async () => {
		const t = convexTest(schema, modules);
		await setupKey(t);

		const honeypot = await t.fetch("/api/intake/wizard/start", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${RAW_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				niche: "airco",
				payload: PAYLOAD,
				honeypot: "spam",
			}),
		});
		expect(honeypot.status).toBe(400);

		const ok = await t.fetch("/api/intake/wizard/start", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${RAW_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				niche: "airco",
				payload: PAYLOAD,
				metadata: { source: "wizard-test.nl" },
			}),
		});
		expect(ok.status).toBe(200);
		const json = (await ok.json()) as { token: string; verifyUrl: string };
		expect(json.token).toBeTruthy();
		expect(json.verifyUrl).toContain(json.token);

		// Zonder key → 401.
		const noAuth = await t.fetch("/api/intake/wizard/start", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ niche: "airco", payload: PAYLOAD }),
		});
		expect(noAuth.status).toBe(401);
	});
});
