import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Badge } from "#/components/ui/badge";
import { Skeleton } from "#/components/ui/skeleton";
export const Route = createFileRoute("/crm/settings_/eigen-whatsapp")({
	component: Page,
});
function Page() {
	const tenants = useQuery(api.userProfiles.myTenants),
		workspaceId = tenants?.find((t) => t.workspace)?.workspace?.id;
	const rows = useQuery(
		api.companyWhatsapp.list,
		workspaceId ? { workspaceId } : "skip",
	);
	const checkNow = useAction(api.companyWhatsappHealth.checkNow);
	const activate = useAction(api.companyWhatsapp.activate),
		setup = useAction(api.companyWhatsapp.setupUrl),
		disable = useMutation(api.companyWhatsapp.disable);
	const [values, setValues] = useState({
			apiKey: "",
			sessionId: "",
			expectedPhone: "",
		}),
		[busy, setBusy] = useState(false),
		[error, setError] = useState(""),
		[url, setUrl] = useState("");
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
	return (
		<div className="mx-auto max-w-3xl space-y-5">
			<Link to="/crm/settings">← Instellingen</Link>
			<h1 className="text-2xl font-bold">Eigen WhatsApp-koppeling</h1>
			<p>
				Sluit een eigen Voidfix-account en bedrijfsnummer aan voor deze
				werkruimte. De bestaande platformkoppeling blijft werken totdat je een
				eigen koppeling activeert.
			</p>
			<Link className="text-primary underline" to="/crm/settings/handleiding">
				Handleiding voor bedrijven
			</Link>
			{busy && (
				<p role="status" className="text-sm text-muted-foreground">
					Bezig met verwerken…
				</p>
			)}
			{error && (
				<p role="alert" className="text-destructive">
					{error}
				</p>
			)}
			{rows === undefined ? (
				<div role="status" className="space-y-3">
					<span className="sr-only">Koppelingen laden…</span>
					<Skeleton className="h-8 w-48" />
					<Skeleton className="h-64 w-full" />
				</div>
			) : (
				<>
					{rows.map((r) => (
						<Card key={r.id}>
							<CardContent className="space-y-3 p-4">
								<h2 className="font-semibold">
									<Badge
										variant={r.status === "active" ? "default" : "secondary"}
									>
										{r.status === "active" ? "Actief" : "Gepauzeerd"}
									</Badge>{" "}
									· {r.phoneNumber}
								</h2>
								<p
									role={r.health === "connected" ? "status" : "alert"}
									className={
										r.health === "connected"
											? "text-sm text-green-700"
											: "text-sm text-amber-800"
									}
								>
									{r.health === "connected"
										? "Verbinding bevestigd"
										: r.health === "disconnected"
											? "Verbinding verbroken of nummer gewijzigd"
											: "Verbinding niet bevestigd"}{" "}
									·{" "}
									{r.lastCheckedAt
										? new Date(r.lastCheckedAt).toLocaleString("nl-NL")
										: "Nog niet gecontroleerd"}
									{r.healthReason ? ` · ${r.healthReason}` : ""}
								</p>
								<p className="text-sm">
									Sessie: {r.sessionId}. Gecontroleerd:{" "}
									{new Date(r.verifiedAt).toLocaleString("nl-NL")}.
								</p>
								<p className="text-sm">
									{r.lastWebhookAt
										? `Laatste webhook ontvangen: ${new Date(r.lastWebhookAt).toLocaleString("nl-NL")}. Controleer ook een gesprek in Berichten.`
										: "Ontvangst nog niet bevestigd. Stel de webhook in en controleer daarna een testgesprek."}
								</p>
								{r.status === "active" && (
									<div className="flex flex-wrap gap-2">
										<Button
											variant="outline"
											disabled={busy}
											onClick={() => run(() => checkNow({ id: r.id }))}
										>
											Nu controleren
										</Button>
										<Button
											variant="outline"
											disabled={busy}
											onClick={() =>
												run(async () => setUrl(await setup({ id: r.id })))
											}
										>
											Webhookadres tonen
										</Button>
										<Button
											variant="outline"
											disabled={busy}
											onClick={() =>
												run(async () => {
													await disable({ id: r.id });
													setUrl("");
												})
											}
										>
											Koppeling pauzeren
										</Button>
									</div>
								)}
							</CardContent>
						</Card>
					))}
					{url && (
						<Card>
							<CardContent className="space-y-3 p-4">
								<Label className="grid gap-2">
									Persoonlijk webhookadres
									<Input
										readOnly
										value={url}
										onFocus={(e) => e.target.select()}
										className="font-mono text-xs"
									/>
								</Label>
								<p className="text-sm">
									Dit adres bevat een geheime sleutel. Kopieer het alleen naar
									de webhookinstellingen van jouw Voidfix-account; deel het niet
									met klanten of in screenshots. Selecteer inkomende berichten,
									berichtstatussen en sessiestatussen.
								</p>
								<Button variant="outline" onClick={() => setUrl("")}>
									Adres verbergen
								</Button>
							</CardContent>
						</Card>
					)}
					{!rows.some((r) => r.status === "active") && (
						<Card>
							<CardContent className="p-4">
								<form
									aria-busy={busy}
									className="space-y-4"
									onSubmit={(e) => {
										e.preventDefault();
										run(async () => {
											if (!workspaceId) return;
											await activate({ workspaceId, ...values });
											setValues({ ...values, apiKey: "" });
											setUrl("");
										});
									}}
								>
									<h2 className="font-semibold">
										1. Koppel je telefoon in je eigen Voidfix-account
									</h2>
									<p className="text-sm">
										Scan daar de QR-code met je bedrijfstelefoon en wacht tot de
										sessie verbonden is. Gebruik voor deze werkruimte een eigen
										account; wijzig niet de webhook van een account dat al voor
										andere systemen wordt gebruikt.
									</p>
									<h2 className="font-semibold">
										2. Controleer en activeer in LeadFlow
									</h2>
									{(
										[
											["sessionId", "Sessie-ID uit Voidfix", "text"],
											[
												"expectedPhone",
												"Bedrijfsnummer met landcode, bijvoorbeeld +31…",
												"tel",
											],
											[
												"apiKey",
												"API-key van jouw Voidfix-account",
												"password",
											],
										] as const
									).map(([key, label, type]) => (
										<Label key={key} className="grid gap-2 text-sm">
											{label}
											<Input
												disabled={busy}
												required
												autoComplete="off"
												type={type}
												maxLength={key === "apiKey" ? 500 : 150}
												value={values[key]}
												onChange={(e) =>
													setValues({ ...values, [key]: e.target.value })
												}
											/>
										</Label>
									))}
									<p className="text-sm">
										Activeren controleert de verbonden sessie en het nummer. Het
										verstuurt geen bericht. Nieuwe WhatsApp-verzendingen
										gebruiken daarna dit account. Stel vervolgens het
										webhookadres in voor ontvangst.
									</p>
									<Button disabled={busy || !workspaceId}>
										{busy
											? "Instellingen controleren…"
											: "Controleren en activeren"}
									</Button>
								</form>
							</CardContent>
						</Card>
					)}
					<p className="text-sm">
						Elke vijftien minuten controleert LeadFlow verbinding en
						telefoonnummer. Bij een mislukte controle stoppen nieuwe
						WhatsApp-verzendingen tot de verbinding opnieuw is bevestigd. Er
						wordt geen storingsmail gestuurd.{" "}
					</p>
					<p className="text-sm">
						Pauzeren stopt nieuwe verzending en nieuwe inkomende gesprekken via
						deze koppeling. Bezorgmeldingen van eerdere berichten blijven
						verwerkt worden. Lopende verzendingen kunnen afronden. De telefoon
						wordt niet bij Voidfix uitgelogd.
					</p>
				</>
			)}
		</div>
	);
}
