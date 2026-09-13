import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Badge } from "#/components/ui/badge";
import { Skeleton } from "#/components/ui/skeleton";
import { Card, CardContent } from "#/components/ui/card";
export const Route = createFileRoute("/crm/settings_/email")({
	component: EmailSettings,
});
function EmailSettings() {
	const tenants = useQuery(api.userProfiles.myTenants);
	const workspaceId = tenants?.find((t) => t.workspace)?.workspace?.id;
	const rows = useQuery(
		api.companyEmail.list,
		workspaceId ? { workspaceId } : "skip",
	);
	const prepare = useMutation(api.companyEmail.prepare),
		disable = useMutation(api.companyEmail.disable);
	const [error, setError] = useState<string | null>(null),
		[busy, setBusy] = useState(false);
	async function run(fn: () => Promise<unknown>) {
		setBusy(true);
		setError(null);
		try {
			await fn();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Opslaan mislukt");
		} finally {
			setBusy(false);
		}
	}
	return (
		<div className="mx-auto max-w-3xl space-y-5">
			<Link to="/crm/settings">← Instellingen</Link>
			<h1 className="text-2xl font-bold">Eigen e-mailkoppeling</h1>
			<Link className="text-primary underline" to="/crm/settings/handleiding">
				Handleiding voor bedrijven
			</Link>
			<p className="text-sm text-muted-foreground">
				Gebruik je eigen Resend-account voor CRM-berichten en campagnes. Dit
				koppelt verzending en bezorgstatussen; antwoorden op e-mails worden nog
				niet als mailbox ingelezen.
			</p>
			{busy && (
				<p role="status" className="text-sm text-muted-foreground">
					Bezig met verwerken…
				</p>
			)}
			{error && (
				<p role="alert" className="text-sm text-destructive">
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
					{!rows.length && (
						<p className="rounded-lg border p-4 text-sm">
							Nog geen eigen e-mailkoppeling. Een eventueel bestaande
							platformkoppeling blijft actief totdat je een eigen koppeling
							activeert.
						</p>
					)}
					{rows.map((row) => (
						<Card key={row.id}>
							<CardContent className="space-y-3 p-4">
								<h2 className="font-semibold">
									<Badge
										variant={row.status === "active" ? "default" : "secondary"}
									>
										{row.status === "draft"
											? "Concept"
											: row.status === "active"
												? "Actief"
												: "Gepauzeerd"}
									</Badge>
									{row.from ? ` · ${row.from}` : ""}
								</h2>
								{row.verifiedAt && (
									<p className="text-xs text-muted-foreground">
										Gecontroleerd op{" "}
										{new Date(row.verifiedAt).toLocaleString("nl-NL")}
									</p>
								)}
								{row.status === "draft" ? (
									<SetupForm id={row.id} endpoint={row.endpoint} />
								) : row.status === "active" ? (
									<>
										<p className="text-sm">
											Pauzeren stopt nieuwe verzendingen via deze koppeling.
											Lopende verzendingen kunnen afronden; bezorgstatussen
											blijven binnenkomen.
										</p>
										<Button
											variant="outline"
											disabled={busy}
											onClick={() => run(() => disable({ id: row.id }))}
										>
											Verzending pauzeren
										</Button>
									</>
								) : (
									<p className="text-sm">
										Maak een nieuw concept om opnieuw te koppelen. Oude
										bezorgstatussen blijven aan deze koppeling gebonden.
									</p>
								)}
							</CardContent>
						</Card>
					))}
					{!rows.some((r) => r.status === "draft") && (
						<Button
							disabled={busy || !workspaceId}
							onClick={() => run(() => prepare({ workspaceId: workspaceId! }))}
						>
							{busy ? "Even geduld…" : "Eigen koppeling voorbereiden"}
						</Button>
					)}
				</>
			)}
		</div>
	);
}
function SetupForm({
	id,
	endpoint,
}: {
	id: Id<"companyEmailConnections">;
	endpoint: string;
}) {
	const activate = useAction(api.companyEmail.activate);
	const [values, setValues] = useState({
			apiKey: "",
			fromEmail: "",
			fromName: "",
			domainId: "",
			webhookId: "",
		}),
		[busy, setBusy] = useState(false),
		[error, setError] = useState<string | null>(null);
	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		setError(null);
		try {
			await activate({ id, ...values });
			setValues({ ...values, apiKey: "" });
		} catch (e) {
			setError(e instanceof Error ? e.message : "Controle mislukt");
		} finally {
			setBusy(false);
		}
	}
	return (
		<form aria-busy={busy} onSubmit={submit} className="space-y-4">
			<ol className="list-decimal space-y-2 pl-5 text-sm">
				<li>Verifieer je verzenddomein in Resend en kopieer de domein-ID.</li>
				<li>
					Maak in Resend een actieve webhook met onderstaand adres. Selecteer
					email.delivered, email.bounced, email.complained en email.opened.
					Kopieer de webhook-ID.
				</li>
				<li>
					Vul een API-key in die dit domein en deze webhook kan lezen én e-mails
					kan versturen. LeadFlow controleert de instellingen en bewaart de
					sleutels versleuteld.
				</li>
			</ol>
			<Label className="grid gap-2 text-sm">
				Webhookadres
				<Input
					className="bg-muted font-mono text-xs"
					readOnly
					value={endpoint}
					onFocus={(e) => e.target.select()}
				/>
			</Label>
			{(
				[
					["fromName", "Afzendernaam", "text"],
					["fromEmail", "Afzenderadres", "email"],
					["domainId", "Domein-ID uit Resend", "text"],
					["webhookId", "Webhook-ID uit Resend", "text"],
					["apiKey", "Resend API-key", "password"],
				] as const
			).map(([key, label, type]) => (
				<Label key={key} className="grid gap-2 text-sm">
					{label}
					<Input
						disabled={busy}
						type={type}
						autoComplete="off"
						required={key !== "fromName"}
						maxLength={key === "apiKey" ? 500 : 254}
						value={values[key]}
						onChange={(e) => setValues({ ...values, [key]: e.target.value })}
					/>
				</Label>
			))}
			{busy && (
				<p role="status" className="text-sm text-muted-foreground">
					Bezig met verwerken…
				</p>
			)}
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
			<p className="text-sm text-muted-foreground">
				Activeren verstuurt geen testmail. Nieuwe CRM-berichten en
				campagnebatches gebruiken daarna deze afzender. Pauzeer een eerdere
				eigen koppeling voordat je deze activeert.
			</p>
			<Button disabled={busy} type="submit">
				{busy ? "Instellingen controleren…" : "Controleren en activeren"}
			</Button>
		</form>
	);
}
