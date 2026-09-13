import { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { SuiteAccess } from "#/components/crm/suite-access";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Badge } from "#/components/ui/badge";
import { FROSTWORK_URL, CASHFLOW_URL } from "#/lib/external-apps";

export const Route = createFileRoute("/crm/apps")({ component: Page });
const products = [
	{
		key: "frostwork",
		name: "Frostwork",
		description:
			"Werkbonnen, installaties en onderhoud voor je installatiebedrijf.",
		url: FROSTWORK_URL,
	},
	{
		key: "cashflow",
		name: "Cashflow",
		description:
			"Offertes en facturen voor de financiële opvolging van je klanten.",
		url: CASHFLOW_URL,
	},
] as const;
function Page() {
	const tenants = useQuery(api.userProfiles.myTenants);
	const workspaceId = tenants?.find((t) => t.workspace)?.workspace?.id;
	const access = useQuery(
		api.appRequests.status,
		workspaceId ? { workspaceId } : "skip",
	);
	const profile = useQuery(api.userProfiles.me);
	const request = useMutation(api.appRequests.request);
	const [busy, setBusy] = useState(false),
		[error, setError] = useState("");
	return (
		<div className="mx-auto w-full max-w-4xl space-y-6 p-6">
			<div>
				<h1 className="text-2xl font-semibold">Apps & uitbreidingen</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Breid je LeadFlow CRM uit met Frostwork of Cashflow. Uitbreidingen
					worden apart per bedrijf afgesproken.
				</p>
			</div>
			<Card>
				<CardContent className="space-y-2 p-5 text-sm">
					<p>
						Een aanvraag is vrijblijvend. Je sluit hiermee geen abonnement af en
						er wordt niets afgeschreven.
					</p>
					<p>
						De platformbeheerder bespreekt de prijs en inrichting met je.
						Toegang en een eventuele gegevenskoppeling worden daarna
						afzonderlijk ingesteld.
					</p>
				</CardContent>
			</Card>
			{error && (
				<p role="alert" className="text-sm text-red-700">
					{error}
				</p>
			)}
			{!access ? (
				<p role="status">Bedrijfstoegang laden…</p>
			) : (
				<div className="grid gap-4 sm:grid-cols-2">
					{products.map((p) => (
						<Card key={p.key}>
							<CardContent className="space-y-4 p-5">
								<h2 className="text-lg font-semibold">{p.name}</h2>
								<p className="text-sm text-muted-foreground">{p.description}</p>
								{access.existingSuite || access.active.includes(p.key) ? (
									<>
										<Badge>
											{access.existingSuite
												? "Bestaande bedrijfskoppeling"
												: "Suite-toegang toegekend"}
										</Badge>
										<p className="text-sm">
											Je rechten in {p.name} bepalen welke gegevens je daar kunt
											openen.
										</p>
										<Button asChild>
											<a href={p.url} target="_blank" rel="noreferrer">
												Open {p.name}
											</a>
										</Button>
									</>
								) : access.requested.includes(p.key) ? (
									<>
										<Badge>
											{
												requestLabels[
													access.requests.find((r) => r.product === p.key)
														?.status ?? "pending"
												]
											}
										</Badge>
										<p role="status" className="text-sm">
											{access.requests.find((r) => r.product === p.key)
												?.status === "approved"
												? "Je aanvraag is goedgekeurd voor verdere inrichting. Producttoegang wordt apart geactiveerd."
												: access.requests.find((r) => r.product === p.key)
															?.status === "rejected"
													? "Je aanvraag is afgewezen. Bekijk de toelichting; neem bij vragen contact op met de platformbeheerder."
													: "Je aanvraag is in behandeling bij de platformbeheerder."}
										</p>
										{access.requests.find((r) => r.product === p.key)
											?.reviewNote && (
											<p className="whitespace-pre-wrap text-sm">
												Toelichting:{" "}
												{
													access.requests.find((r) => r.product === p.key)
														?.reviewNote
												}
											</p>
										)}
										{access.requests.find((r) => r.product === p.key)
											?.reviewedAt && (
											<p className="text-xs text-muted-foreground">
												Beoordeeld op{" "}
												{new Date(
													access.requests.find((r) => r.product === p.key)!
														.reviewedAt!,
												).toLocaleString("nl-NL")}
											</p>
										)}
									</>
								) : access.canRequest ? (
									<Button
										disabled={busy}
										onClick={async () => {
											if (!workspaceId) return;
											setBusy(true);
											setError("");
											try {
												await request({ workspaceId, product: p.key });
											} catch {
												setError("Aanvragen is niet gelukt. Probeer opnieuw.");
											} finally {
												setBusy(false);
											}
										}}
									>
										Uitbreiding aanvragen
									</Button>
								) : (
									<p className="text-sm">
										Vraag je bedrijfseigenaar om deze uitbreiding aan te vragen.
									</p>
								)}
							</CardContent>
						</Card>
					))}
				</div>
			)}
			{workspaceId && (
				<SuiteAccess
					workspaceId={workspaceId}
					admin={profile?.isSuperAdmin === true}
				/>
			)}
			{profile?.isSuperAdmin && <Requests />}
		</div>
	);
}
function Requests() {
	const { results, status, loadMore } = usePaginatedQuery(
		api.appRequests.list,
		{},
		{ initialNumItems: 20 },
	);
	return (
		<section className="space-y-3" aria-label="Uitbreidingsaanvragen">
			<h2 className="text-lg font-semibold">
				Uitbreidingsaanvragen · platformbeheer
			</h2>
			<p className="text-sm text-muted-foreground">
				Bespreek de aanvraag met het bedrijf. Deze lijst verleent geen toegang
				tot een andere app.
			</p>
			{status === "LoadingFirstPage" ? (
				<p>Laden…</p>
			) : !results.length ? (
				<p className="text-sm">Nog geen aanvragen.</p>
			) : (
				results.map((r) => <RequestReview key={r.id} request={r} />)
			)}
			{status === "CanLoadMore" && (
				<Button variant="outline" onClick={() => loadMore(20)}>
					Meer aanvragen
				</Button>
			)}
		</section>
	);
}

const requestLabels = {
	pending: "In behandeling",
	approved: "Goedgekeurd",
	rejected: "Afgewezen",
};
function RequestReview({
	request: r,
}: {
	request: {
		id: Id<"appRequests">;
		company: string;
		product: "cashflow" | "frostwork";
		requestedAt: number;
		status: "pending" | "approved" | "rejected";
		reviewNote: string | null;
		reviewedAt: number | null;
		revision: number;
	};
}) {
	const review = useMutation(api.appRequests.review);
	const [note, setNote] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	async function decide(status: "approved" | "rejected") {
		setBusy(true);
		setMessage("");
		try {
			await review({
				requestId: r.id,
				status,
				note,
				expectedRevision: r.revision,
			});
			setNote("");
			setMessage(
				"Beoordeling opgeslagen. Producttoegang blijft afzonderlijk geregeld.",
			);
		} catch {
			setMessage(
				"Opslaan niet gelukt. Controleer de actuele beoordeling en probeer opnieuw.",
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<Card>
			<CardContent className="space-y-3 p-4 text-sm">
				<p className="font-medium">
					{r.company} · {r.product === "cashflow" ? "Cashflow" : "Frostwork"}
				</p>
				<p>Aangevraagd op {new Date(r.requestedAt).toLocaleString("nl-NL")}</p>
				<Badge>{requestLabels[r.status]}</Badge>
				{r.reviewNote && (
					<p className="whitespace-pre-wrap">
						Laatste toelichting: {r.reviewNote}
					</p>
				)}
				{r.reviewedAt && (
					<p>Beoordeeld op {new Date(r.reviewedAt).toLocaleString("nl-NL")}</p>
				)}
				<label className="block" htmlFor={`review-${r.id}`}>
					Toelichting voor het bedrijf (5–500 tekens)
				</label>
				<textarea
					id={`review-${r.id}`}
					className="min-h-20 w-full rounded-md border p-2"
					maxLength={500}
					value={note}
					onChange={(e) => setNote(e.target.value)}
					disabled={busy}
				/>
				<p className="text-muted-foreground">
					Deze toelichting is zichtbaar voor het bedrijf. Goedkeuren geeft nog
					geen abonnement of producttoegang; regel koppeling en toegang
					afzonderlijk.
				</p>
				<div className="flex flex-wrap gap-2">
					<Button
						disabled={busy || note.trim().length < 5}
						onClick={() => decide("approved")}
					>
						Goedkeuren
					</Button>
					<Button
						variant="outline"
						disabled={busy || note.trim().length < 5}
						onClick={() => decide("rejected")}
					>
						Afwijzen
					</Button>
				</div>
				{message && <p role="status">{message}</p>}
			</CardContent>
		</Card>
	);
}
