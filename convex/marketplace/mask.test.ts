import { describe, expect, it } from "vitest";
import { maskEmail, maskName, maskPhone } from "./mask";

describe("maskName", () => {
	it("masks both name parts with first char + stars (min 2 stars)", () => {
		expect(maskName("Jan", "Jansen")).toBe("J** J*****");
	});

	it("pads short names to at least 2 stars", () => {
		// "Jo" → first char + max(2-1, 2)=2 stars → "J**"
		expect(maskName("Jo", "Li")).toBe("J** L**");
	});

	it("returns only the present part when one is missing", () => {
		expect(maskName("Jan", undefined)).toBe("J**");
		expect(maskName(undefined, "Jansen")).toBe("J*****");
		expect(maskName("Jan", "")).toBe("J**");
	});

	it("returns the em-dash when both are empty/nullish", () => {
		expect(maskName(undefined, undefined)).toBe("—");
		expect(maskName(null, null)).toBe("—");
		expect(maskName("", "  ")).toBe("—");
	});
});

describe("maskPhone", () => {
	it("masks an E.164 NL mobile to +31 {firstDigit}****{last2}", () => {
		expect(maskPhone("+31612345678")).toBe("+31 6****78");
	});

	it("masks a national NL mobile to {first2}****{last2}", () => {
		expect(maskPhone("0612345678")).toBe("06****78");
	});

	it("returns the em-dash for empty/nullish input", () => {
		expect(maskPhone(undefined)).toBe("—");
		expect(maskPhone(null)).toBe("—");
		expect(maskPhone("")).toBe("—");
	});

	it("returns *** for too-short input (<6 chars)", () => {
		expect(maskPhone("12345")).toBe("***");
	});
});

describe("maskEmail", () => {
	it("masks local part to firstChar + ** keeping domain", () => {
		expect(maskEmail("jan@x.nl")).toBe("j**@x.nl");
	});

	it("returns null for falsy input", () => {
		expect(maskEmail(undefined)).toBeNull();
		expect(maskEmail(null)).toBeNull();
		expect(maskEmail("")).toBeNull();
	});

	it("returns the input unchanged when there is no @", () => {
		expect(maskEmail("not-an-email")).toBe("not-an-email");
	});
});
