export type SuiteBinding = { enabled: boolean; validUntil: number };

export function suiteStatus(binding: SuiteBinding | undefined, now: number) {
	if (!binding)
		return { state: "unlinked", label: "Nog niet gekoppeld" } as const;
	if (binding.validUntil > 0 && binding.validUntil <= now)
		return { state: "expired", label: "Toegang verlopen" } as const;
	if (!binding.enabled || binding.validUntil <= now)
		return { state: "inactive", label: "Toegang niet actief" } as const;
	return { state: "active", label: "Toegang actief" } as const;
}
