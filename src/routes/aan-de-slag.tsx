import { useState } from "react";
import { UserButton } from "@clerk/clerk-react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	Authenticated,
	Unauthenticated,
	useMutation,
	useQuery,
} from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Skeleton } from "#/components/ui/skeleton";
export const Route = createFileRoute("/aan-de-slag")({ component: Page });
function Page() {
	return (
		<main className="mx-auto max-w-2xl space-y-5 p-6">
			<Link to="/">← LeadFlow</Link>
			<h1 className="text-3xl font-bold">Aan de slag met LeadFlow</h1>
			<Authenticated>
				<div className="flex items-center gap-3 rounded-lg border p-4">
					<UserButton />
					<p className="text-sm text-muted-foreground">
						Open je accountmenu om je e-mailadres te controleren en zo nodig te
						verifiëren. Vernieuw daarna deze pagina voordat je verdergaat.
					</p>
				</div>
				<Setup />
			</Authenticated>
			<Unauthenticated>
				<p>
					Log in of maak via het inlogscherm een account aan. Bevestig je
					e-mailadres en open daarna deze pagina opnieuw.
				</p>
				<Link to="/login" className="text-primary underline">
					Inloggen of registreren
				</Link>
			</Unauthenticated>
		</main>
	);
}
function Setup() {
	const tenants = useQuery(api.userProfiles.myTenants),
		tenant = tenants?.find((t) => t.workspace);
	const manage = tenant?.role === "owner" || tenant?.role === "admin";
	const providers = useQuery(
		api.companyProviders.status,
		tenant?.workspace && manage ? { workspaceId: tenant.workspace.id } : "skip",
	);
	const create = useMutation(api.companyOnboarding.create),
		accept = useMutation(api.companyOnboarding.accept),
		navigate = useNavigate();
	const [mode, setMode] = useState<"invite" | "create">("invite"),
		[code, setCode] = useState(""),
		[busy, setBusy] = useState(false),
		[error, setError] = useState("");
	const [values, setValues] = useState({
		name: "",
		contactPhone: "",
		workArea: "",
		services: "",
	});
	async function run(fn: () => Promise<unknown>) {
		setBusy(true);
		setError("");
		try {
			await fn();
			await navigate({ to: "/crm" });
		} catch (e) {
			setError(e instanceof Error ? e.message : "Opslaan mislukt");
		} finally {
			setBusy(false);
		}
	}
	if (tenants === undefined)
		return (
			<div role="status" className="space-y-3">
				<span className="sr-only">Bedrijfsomgeving laden…</span>
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-48 w-full" />
			</div>
		);
	if (tenants.length)
		return (
			<Card>
				<CardContent className="space-y-4 p-5">
					<h2 className="text-xl font-semibold">
						{tenant?.org?.name ?? "Je bedrijfsomgeving"}
					</h2>
					<p>
						Je account is al aan een bedrijf gekoppeld. Je rol:{" "}
						{
							{
								owner: "Eigenaar",
								admin: "Bedrijfsbeheerder",
								member: "Medewerker",
							}[tenant?.role ?? tenants[0].role]
						}
						. Per account ondersteunen we momenteel één bedrijf.
					</p>
					<Link className="text-primary underline" to="/crm">
						Open je CRM
					</Link>
					{manage && (
						<>
							<h3 className="font-semibold">Richt je bedrijf verder in</h3>
							<p>
								Je CRM werkt ook zonder leads te kopen. De leadmarktplaats wordt
								afzonderlijk toegelaten.
							</p>
							<ul className="space-y-2">
								<li>
									<Link to="/crm/settings/team">
										Teamleden uitnodigen en toegang beheren
									</Link>
								</li>
								<li>
									<Link to="/crm/pipelines">Je verkooppipeline bekijken</Link>
								</li>
								<li>
									<Link to="/crm/settings/email">
										E-mail:{" "}
										{providers === undefined
											? "Status laden…"
											: providers.email
												? "configuratie aanwezig"
												: "nog instellen"}
									</Link>
								</li>
								<li>
									<Link to="/crm/settings/eigen-whatsapp">
										WhatsApp:{" "}
										{providers === undefined
											? "Status laden…"
											: providers.whatsapp
												? "configuratie aanwezig"
												: "nog instellen of controleren"}
									</Link>
								</li>
								<li>
									<Link to="/crm/settings/sms">
										SMS:{" "}
										{providers === undefined
											? "Status laden…"
											: providers.sms
												? "configuratie aanwezig"
												: "nog instellen"}
									</Link>
								</li>
								<li>
									<Link to="/crm/settings/handleiding">
										Bedrijfshandleiding openen
									</Link>
								</li>
							</ul>
							<p className="text-sm text-muted-foreground">
								Configuratie aanwezig betekent niet dat de afleveringstest al is
								uitgevoerd.
							</p>
						</>
					)}
				</CardContent>
			</Card>
		);
	return (
		<Card>
			<CardContent className="space-y-4 p-5">
				<p>
					Ben je uitgenodigd? Accepteer die uitnodiging voordat je zelf een
					bedrijf aanmaakt. Uitnodigingen werken alleen met het geverifieerde
					e-mailadres waarvoor ze zijn gemaakt.
				</p>
				<div className="flex flex-wrap gap-2">
					<Button
						disabled={busy}
						aria-pressed={mode === "invite"}
						variant={mode === "invite" ? "default" : "outline"}
						onClick={() => setMode("invite")}
					>
						Ik heb een uitnodiging
					</Button>
					<Button
						disabled={busy}
						aria-pressed={mode === "create"}
						variant={mode === "create" ? "default" : "outline"}
						onClick={() => setMode("create")}
					>
						Eigen bedrijf starten
					</Button>
				</div>
				{error && (
					<p role="alert" className="text-destructive">
						{error}
					</p>
				)}
				{mode === "invite" ? (
					<form
						className="space-y-3"
						onSubmit={(e) => {
							e.preventDefault();
							run(() => accept({ code }));
						}}
					>
						<div className="grid gap-2">
							<Label htmlFor="invite-code">Uitnodigingscode</Label>
							<Input
								id="invite-code"
								disabled={busy}
								required
								autoComplete="off"
								maxLength={64}
								value={code}
								onChange={(e) => setCode(e.target.value)}
								className="font-mono text-sm"
							/>
						</div>
						<Button disabled={busy}>
							{busy ? "Uitnodiging accepteren…" : "Uitnodiging accepteren"}
						</Button>
					</form>
				) : (
					<form
						className="space-y-3"
						onSubmit={(e) => {
							e.preventDefault();
							run(() => create(values));
						}}
					>
						<p>
							Je wordt eigenaar van je eigen bedrijfsomgeving, met een lege
							CRM-pipeline. Er worden geen provideraccounts aangesloten,
							berichten verstuurd of leadtegoeden aangemaakt. Je geverifieerde
							e-mailadres wordt het contactadres.
						</p>
						{(
							[
								["name", "Bedrijfsnaam", 120],
								["contactPhone", "Zakelijk telefoonnummer", 40],
								["workArea", "Werkgebied", 250],
								["services", "Diensten", 500],
							] as const
						).map(([key, label, max]) => (
							<div key={key} className="grid gap-2">
								<Label htmlFor={key}>{label}</Label>
								<Input
									id={key}
									disabled={busy}
									type={key === "contactPhone" ? "tel" : "text"}
									required
									maxLength={max}
									value={values[key]}
									onChange={(e) =>
										setValues({ ...values, [key]: e.target.value })
									}
								/>
							</div>
						))}
						<Button disabled={busy}>
							{busy
								? "Bedrijfsomgeving aanmaken…"
								: "Mijn bedrijfsomgeving aanmaken"}
						</Button>
					</form>
				)}
			</CardContent>
		</Card>
	);
}
