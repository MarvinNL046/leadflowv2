import { expect, test } from "vitest";
import { suiteStatus } from "./suite-status";

test("a binding alone never means active access", () => {
	expect(suiteStatus(undefined, 100).state).toBe("unlinked");
	expect(suiteStatus({ enabled: false, validUntil: 200 }, 100).state).toBe(
		"inactive",
	);
	expect(suiteStatus({ enabled: false, validUntil: 0 }, 100).state).toBe(
		"inactive",
	);
});
test("expires at the boundary even when the stored flag is still enabled", () => {
	expect(suiteStatus({ enabled: true, validUntil: 200 }, 199).state).toBe(
		"active",
	);
	expect(suiteStatus({ enabled: true, validUntil: 200 }, 200).state).toBe(
		"expired",
	);
	expect(suiteStatus({ enabled: false, validUntil: 200 }, 201).state).toBe(
		"expired",
	);
});
