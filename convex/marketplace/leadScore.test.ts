import { describe, expect, it } from "vitest";
import { computeLeadScore } from "./leadScore";

describe("computeLeadScore", () => {
	it("3 positives → high (contact + serious job + serious intent)", () => {
		expect(
			computeLeadScore({
				hasPhone: true,
				hasEmail: true,
				jobSize: "l",
				buyerIntention: "yes",
			}),
		).toBe("high");
		expect(
			computeLeadScore({
				hasPhone: true,
				hasEmail: true,
				jobSize: "xl",
				buyerIntention: "yes",
			}),
		).toBe("high");
	});

	it("2 positives → medium", () => {
		// contact + serious job, no serious intent
		expect(
			computeLeadScore({
				hasPhone: true,
				hasEmail: true,
				jobSize: "l",
				buyerIntention: "no",
			}),
		).toBe("medium");
		// contact + serious intent, small job
		expect(
			computeLeadScore({
				hasPhone: true,
				hasEmail: true,
				jobSize: "s",
				buyerIntention: "yes",
			}),
		).toBe("medium");
		// serious job + serious intent, no email
		expect(
			computeLeadScore({
				hasPhone: true,
				hasEmail: false,
				jobSize: "l",
				buyerIntention: "yes",
			}),
		).toBe("medium");
	});

	it("1 positive → low", () => {
		expect(
			computeLeadScore({
				hasPhone: true,
				hasEmail: true,
				jobSize: "s",
				buyerIntention: "no",
			}),
		).toBe("low");
	});

	it("0 positives → low", () => {
		expect(
			computeLeadScore({ hasPhone: true, hasEmail: false }),
		).toBe("low");
		expect(
			computeLeadScore({
				hasPhone: false,
				hasEmail: false,
				jobSize: "m",
				buyerIntention: "unknown",
			}),
		).toBe("low");
	});

	it("contactVerified requires BOTH phone and email", () => {
		// only phone → contact not verified, m job not serious → low
		expect(
			computeLeadScore({ hasPhone: true, hasEmail: false, jobSize: "m" }),
		).toBe("low");
	});

	it("medium job size (m) does not count as serious job", () => {
		// contact verified (1) + m job (0) + no intent (0) = 1 → low
		expect(
			computeLeadScore({
				hasPhone: true,
				hasEmail: true,
				jobSize: "m",
				buyerIntention: "unknown",
			}),
		).toBe("low");
	});
});
