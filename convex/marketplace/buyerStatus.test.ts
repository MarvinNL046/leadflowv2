import { describe, expect, it } from "vitest";
import {
	BUYER_STATUSES,
	type BuyerStatus,
	isBuyerStatus,
	isValidTransition,
} from "./buyerStatus";

describe("isValidTransition", () => {
	it("rejects same-state transitions", () => {
		for (const s of BUYER_STATUSES) {
			expect(isValidTransition(s, s)).toBe(false);
		}
	});

	it("new → contacted | no_contact | rejected", () => {
		expect(isValidTransition("new", "contacted")).toBe(true);
		expect(isValidTransition("new", "no_contact")).toBe(true);
		expect(isValidTransition("new", "rejected")).toBe(true);
		// not directly reachable from new
		expect(isValidTransition("new", "appointment")).toBe(false);
		expect(isValidTransition("new", "completed")).toBe(false);
	});

	it("contacted → appointment | completed | no_contact | rejected", () => {
		expect(isValidTransition("contacted", "appointment")).toBe(true);
		expect(isValidTransition("contacted", "completed")).toBe(true);
		expect(isValidTransition("contacted", "no_contact")).toBe(true);
		expect(isValidTransition("contacted", "rejected")).toBe(true);
		expect(isValidTransition("contacted", "new")).toBe(false);
	});

	it("appointment → completed | rejected only", () => {
		expect(isValidTransition("appointment", "completed")).toBe(true);
		expect(isValidTransition("appointment", "rejected")).toBe(true);
		expect(isValidTransition("appointment", "contacted")).toBe(false);
		expect(isValidTransition("appointment", "no_contact")).toBe(false);
	});

	it("no_contact → contacted only", () => {
		expect(isValidTransition("no_contact", "contacted")).toBe(true);
		expect(isValidTransition("no_contact", "appointment")).toBe(false);
		expect(isValidTransition("no_contact", "completed")).toBe(false);
		expect(isValidTransition("no_contact", "rejected")).toBe(false);
	});

	it("completed and rejected are terminal", () => {
		for (const to of BUYER_STATUSES) {
			expect(isValidTransition("completed", to)).toBe(false);
			expect(isValidTransition("rejected", to)).toBe(false);
		}
	});
});

describe("isBuyerStatus", () => {
	it("accepts every defined status", () => {
		for (const s of BUYER_STATUSES) {
			expect(isBuyerStatus(s)).toBe(true);
		}
	});

	it("rejects unknown values + non-strings", () => {
		expect(isBuyerStatus("won")).toBe(false);
		expect(isBuyerStatus("")).toBe(false);
		expect(isBuyerStatus(null)).toBe(false);
		expect(isBuyerStatus(undefined)).toBe(false);
		expect(isBuyerStatus(42)).toBe(false);
	});

	it("narrows the type", () => {
		const raw: unknown = "appointment";
		if (isBuyerStatus(raw)) {
			const typed: BuyerStatus = raw;
			expect(typed).toBe("appointment");
		}
	});
});
