import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Skeleton } from "#/components/ui/skeleton";
import { Badge } from "#/components/ui/badge";
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from "#/components/ui/select";
import {
	AlertDialog,
	AlertDialogTrigger,
	AlertDialogContent,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogCancel,
	AlertDialogAction,
} from "#/components/ui/alert-dialog";
import type { Id } from "../../convex/_generated/dataModel";
export const Route = createFileRoute("/crm/settings_/team")({
	component: Page,
});
function Page() {
	const tenants = useQuery(api.userProfiles.myTenants),
		workspaceId = tenants?.find((t) => t.workspace)?.workspace?.id,
		profile = useQuery(api.userProfiles.me);
	const team = useQuery(
		api.companyOnboarding.team,
		workspaceId ? { workspaceId } : "skip",
	);
	const invite = useMutation(api.companyOnboarding.invite),
		revoke = useMutation(api.companyOnboarding.revoke),
		remove = useMutation(api.companyOnboarding.removeMember);
	const [email, setEmail] = useState(""),
		[role, setRole] = useState<"member" | "admin">("member"),
		[code, setCode] = useState(""),
		[busy, setBusy] = useState(false),
		[error, setError] = useState("");
	async function run(fn: () => Promise<unknown>) {
		setBusy(true);
		setError("");
		try {
			await fn();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Bewerking mislukt");
		} finally {
			setBusy(false);
		}
	}
	const [removing, setRemoving] = useState<Id<"memberships"> | null>(null);
	const ownMembership = tenants?.find(
		(t) => t.workspace?.id === workspaceId,
	)?.membershipId;
	return (
		<div className="mx-auto max-w-3xl space-y-5">
			<Link to="/crm/settings">← Instellingen</Link>
			<h1 className="text-2xl font-bold">Bedrijf en team</h1>
			<Link className="text-primary underline" to="/aan-de-slag">
				Startoverzicht en inrichting
			</Link>
			<p>
				Medewerkers werken in het CRM. Bedrijfsbeheerders beheren ook
				instellingen, campagnes en aankopen. Alleen de eigenaar kan beheerders
				uitnodigen of verwijderen. Rollen gelden voor het hele bedrijf.
			</p>
			{error && (
				<p role="alert" className="text-destructive">
					{error}
				</p>
			)}
			{!team ? (
				<div role="status" className="space-y-3">
					<span className="sr-only">Team laden…</span>
					<Skeleton className="h-32 w-full" />
					<Skeleton className="h-60 w-full" />
				</div>
			) : (
				<>
					<Card>
						<CardContent className="space-y-3 p-5">
							<h2 className="font-semibold">{team.company}</h2>
							{team.members.map((m) => (
								<div
									key={m.id}
									className="flex flex-wrap items-center justify-between gap-2 border-b py-2"
								>
									<div>
										{m.name || m.email || "Teamlid"}
										<span className="block text-sm text-muted-foreground">
											{m.email}{" "}
											<Badge variant="secondary">
												{m.role === "owner"
													? "Eigenaar"
													: m.role === "admin"
														? "Bedrijfsbeheerder"
														: "Medewerker"}
											</Badge>
										</span>
									</div>
									{m.id !== ownMembership &&
										m.role !== "owner" &&
										(m.role === "member" || team.canInviteAdmins) && (
											<AlertDialog
												open={removing === m.id}
												onOpenChange={(open) => {
													if (!busy) {
														setRemoving(open ? m.id : null);
														setError("");
													}
												}}
											>
												<AlertDialogTrigger asChild>
													<Button variant="outline" disabled={busy || !profile}>
														Toegang intrekken
													</Button>
												</AlertDialogTrigger>
												<AlertDialogContent>
													<AlertDialogTitle>
														Toegang intrekken?
													</AlertDialogTitle>
													<AlertDialogDescription>
														{m.name || m.email || "Dit teamlid"} krijgt geen
														toegang meer tot {team.company}. CRM-gegevens
														blijven bewaard. Eerder ingestelde
														bedrijfsautomatiseringen blijven actief.
													</AlertDialogDescription>
													{error && (
														<p
															role="alert"
															className="text-sm text-destructive"
														>
															{error}
														</p>
													)}
													<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
														<AlertDialogCancel asChild>
															<Button variant="outline" disabled={busy}>
																Annuleren
															</Button>
														</AlertDialogCancel>
														<AlertDialogAction asChild>
															<Button
																variant="destructive"
																disabled={busy}
																onClick={(e) => {
																	e.preventDefault();
																	run(async () => {
																		await remove({ id: m.id });
																		setRemoving(null);
																	});
																}}
															>
																{busy
																	? "Toegang intrekken…"
																	: "Toegang intrekken"}
															</Button>
														</AlertDialogAction>
													</div>
												</AlertDialogContent>
											</AlertDialog>
										)}
								</div>
							))}
						</CardContent>
					</Card>
					<Card>
						<CardContent className="space-y-3 p-5">
							<h2 className="font-semibold">Teamlid uitnodigen</h2>
							<form
								className="space-y-3"
								onSubmit={(e) => {
									e.preventDefault();
									run(async () => {
										if (!workspaceId) return;
										const r = await invite({ workspaceId, email, role });
										setCode(r.code);
									});
								}}
							>
								<div className="grid gap-2">
									<Label htmlFor="recipient">E-mailadres ontvanger</Label>
									<Input
										id="recipient"
										disabled={busy}
										type="email"
										required
										maxLength={254}
										value={email}
										onChange={(e) => setEmail(e.target.value)}
									/>
								</div>
								<div className="grid gap-2">
									<Label htmlFor="team-role">Rol</Label>
									<Select
										disabled={busy}
										value={role}
										onValueChange={(value) =>
											setRole(value as "member" | "admin")
										}
									>
										<SelectTrigger id="team-role" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="member">Medewerker</SelectItem>
											{team.canInviteAdmins && (
												<SelectItem value="admin">Bedrijfsbeheerder</SelectItem>
											)}
										</SelectContent>
									</Select>
								</div>
								<Button disabled={busy}>
									{busy ? "Bezig…" : "Uitnodigingscode maken"}
								</Button>
							</form>
							<p className="text-sm">
								Er wordt geen e-mail verstuurd. Deel de code zelf met de
								ontvanger. De code is zeven dagen geldig en kan eenmaal worden
								gebruikt. Een nieuwe code voor hetzelfde adres vervangt de
								vorige.
							</p>
							{code && (
								<div className="space-y-2 rounded border p-3">
									<div className="grid gap-2">
										<Label htmlFor="generated-code">
											Eenmalig getoonde code
										</Label>
										<Input
											id="generated-code"
											readOnly
											value={code}
											onFocus={(e) => e.target.select()}
											className="font-mono text-xs"
										/>
									</div>
									<p className="text-sm">
										Laat de ontvanger inloggen met het uitgenodigde e-mailadres
										en deze code invullen bij{" "}
										<Link to="/aan-de-slag" className="underline">
											Aan de slag → Ik heb een uitnodiging
										</Link>
										.
									</p>
									<Button variant="outline" onClick={() => setCode("")}>
										Code verbergen
									</Button>
								</div>
							)}
							<h3 className="font-semibold">Open uitnodigingen</h3>
							{!team.invites.length ? (
								<p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
									Geen open uitnodigingen. Maak hierboven een code om een
									collega uit te nodigen.
								</p>
							) : (
								team.invites.map((i) => (
									<div
										key={i.id}
										className="flex flex-wrap justify-between gap-2 border-t py-2"
									>
										<p>
											{i.email} ·{" "}
											{i.role === "admin" ? "Bedrijfsbeheerder" : "Medewerker"}
											<span className="block text-xs">
												Geldig tot{" "}
												{new Date(i.expiresAt).toLocaleString("nl-NL")}
											</span>
										</p>
										{(i.role === "member" || team.canInviteAdmins) && (
											<Button
												variant="outline"
												disabled={busy}
												onClick={() => run(() => revoke({ id: i.id }))}
											>
												Intrekken
											</Button>
										)}
									</div>
								))
							)}
						</CardContent>
					</Card>
				</>
			)}
			<Link to="/crm/settings/handleiding" className="text-primary underline">
				Handleiding voor bedrijven
			</Link>
		</div>
	);
}
