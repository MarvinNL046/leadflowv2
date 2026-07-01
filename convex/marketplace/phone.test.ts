import { describe, expect, it } from "vitest";
import { isValidNlPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
	it("normalises NL mobile 06 format to +31…", () => {
		expect(normalizePhone("0612345678")).toBe("+31612345678");
		expect(normalizePhone("06-12345678")).toBe("+31612345678");
		expect(normalizePhone("06 12 34 56 78")).toBe("+31612345678");
	});

	it("keeps already-canonical +31 numbers", () => {
		expect(normalizePhone("+31612345678")).toBe("+31612345678");
		expect(normalizePhone("+31 6 12345678")).toBe("+31612345678");
	});

	it("converts 0031 international prefix", () => {
		expect(normalizePhone("0031612345678")).toBe("+31612345678");
	});

	it("converts bare 31… (length >= 11)", () => {
		expect(normalizePhone("31612345678")).toBe("+31612345678");
	});

	it("returns null for empty / junk", () => {
		expect(normalizePhone("")).toBeNull();
		expect(normalizePhone(null)).toBeNull();
		expect(normalizePhone(undefined)).toBeNull();
		expect(normalizePhone("abc")).toBeNull();
	});

	it("returns null when the result is not exactly +31 + 9 digits", () => {
		expect(normalizePhone("061234567")).toBeNull(); // too short
		expect(normalizePhone("06123456789")).toBeNull(); // too long
		expect(normalizePhone("12345")).toBeNull(); // no recognisable prefix
	});
});

describe("isValidNlPhone", () => {
	it("accepts NL mobile +316XXXXXXXX", () => {
		expect(isValidNlPhone("+31612345678")).toBe(true);
	});

	it("rejects NL landline (+31 not starting with 6)", () => {
		expect(isValidNlPhone("+31201234567")).toBe(false); // 020 Amsterdam
		expect(isValidNlPhone("+31101234567")).toBe(false); // 010 Rotterdam
	});

	it("rejects null and malformed", () => {
		expect(isValidNlPhone(null)).toBe(false);
		expect(isValidNlPhone("0612345678")).toBe(false); // not normalised
		expect(isValidNlPhone("+316123")).toBe(false);
	});

	it("normalize → validate round-trip for a real NL mobile", () => {
		const n = normalizePhone("06-12345678");
		expect(n).toBe("+31612345678");
		expect(isValidNlPhone(n)).toBe(true);
	});
});
