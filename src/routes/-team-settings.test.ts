// @vitest-environment jsdom
import { createElement, type ComponentType } from "react";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { Route } from "./crm.settings_.team";
const remove = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => ({ options }),
	Link: ({ children }: any) => createElement("span", null, children),
}));
vi.mock("convex/react", () => ({
	useMutation: (ref: any) =>
		getFunctionName(ref) === "companyOnboarding:removeMember"
			? remove
			: vi.fn(),
	useQuery: (ref: any) => {
		switch (getFunctionName(ref)) {
			case "userProfiles:myTenants":
				return [{ membershipId: "owner", workspace: { id: "workspace" } }];
			case "userProfiles:me":
				return { userId: "owner" };
			case "companyOnboarding:team":
				return {
					company: "Testbedrijf",
					canInviteAdmins: true,
					members: [
						{
							id: "owner",
							name: "Eigenaar",
							email: "owner@example.invalid",
							role: "owner",
						},
						{
							id: "member",
							name: "Testcollega",
							email: "colleague@example.invalid",
							role: "member",
						},
					],
					invites: [],
				};
		}
	},
}));
beforeEach(() => remove.mockReset().mockResolvedValue(null));
afterEach(cleanup);
function page() {
	render(createElement(Route.options.component as ComponentType));
}
test("opening and cancelling the removal confirmation never removes a member", async () => {
	page();
	fireEvent.click(screen.getByRole("button", { name: "Toegang intrekken" }));
	const dialog = screen.getByRole("alertdialog");
	expect(
		within(dialog).getByText(/Testcollega krijgt geen toegang/),
	).toBeTruthy();
	expect(document.activeElement).toBe(
		within(dialog).getByRole("button", { name: "Annuleren" }),
	);
	fireEvent.click(within(dialog).getByRole("button", { name: "Annuleren" }));
	await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
	expect(remove).not.toHaveBeenCalled();
});
test("failed removal remains open with an error; retry targets only the selected member", async () => {
	remove.mockRejectedValueOnce(new Error("Opslaan mislukt"));
	page();
	fireEvent.click(screen.getByRole("button", { name: "Toegang intrekken" }));
	fireEvent.click(
		within(screen.getByRole("alertdialog")).getByRole("button", {
			name: "Toegang intrekken",
		}),
	);
	await waitFor(() =>
		expect(
			within(screen.getByRole("alertdialog")).getByRole("alert").textContent,
		).toBe("Opslaan mislukt"),
	);
	expect(remove).toHaveBeenCalledWith({ id: "member" });
	fireEvent.click(
		within(screen.getByRole("alertdialog")).getByRole("button", {
			name: "Toegang intrekken",
		}),
	);
	await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
	expect(remove).toHaveBeenCalledTimes(2);
});
