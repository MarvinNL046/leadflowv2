import { useAction } from "convex/react";
import { ExternalLink, Receipt, Snowflake } from "@/components/icons";
import { type ReactNode, useEffect, useState } from "react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "#/components/ui/card.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { CASHFLOW_URL, frostworkCustomerUrl } from "#/lib/external-apps.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type CashflowSummary = {
	configured: boolean;
	linked: boolean;
	invoices: {
		count: number;
		openCount: number;
		openTotalCents: number;
		latestDate: number | null;
		latestNumber: string | null;
	};
	quotes: { count: number; openCount: number; latest?: {
		number: string | null; date: number; status: string;
	} | null };
};

type FrostworkSummary = {
  matchedBy?: 'contactId' | 'email';
	configured: boolean;
	linked: boolean;
	installations: { count: number };
	maintenance: { lastAt: number | null; nextDueAt: number | null };
	workOrders: { count: number };
};

const euro = (cents: number) =>
	new Intl.NumberFormat("nl-NL", {
		style: "currency",
		currency: "EUR",
	}).format(cents / 100);

const dateShort = (ms: number) =>
	new Date(ms).toLocaleDateString("nl-NL", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});

/**
 * "Ook in de suite" — leadflow is de bron van waarheid voor contacten; deze
 * sectie toont wat de andere apps van dit contact weten (cashflow: facturen/
 * offertes, frostwork: installaties/onderhoud/werkbonnen). Data via de
 * cross-app action (niet-reactief), dus fetchen in een effect. Elke app kan
 * los onbereikbaar zijn → per kaart een nette lege staat.
 */
export function SuiteSummarySection({
  existingSuite,
	contactId,
	contactName,
}: {
  existingSuite: boolean;
	contactId: Id<"contacts">;
	contactName: string;
}) {
	const fetchSummary = useAction(api.crossApp.contactSuiteSummary);
	const [data, setData] = useState<
		| { cashflow: CashflowSummary | null; frostwork: FrostworkSummary | null }
		| null
		| undefined
	>(undefined);

	useEffect(() => {
		let cancelled = false;
		setData(undefined);
		if (!existingSuite) return;
		fetchSummary({ contactId })
			.then((res) => {
				if (!cancelled) setData(res);
			})
			.catch(() => {
				if (!cancelled) setData(null);
			});
		return () => {
			cancelled = true;
		};
	}, [contactId, fetchSummary, existingSuite]);
	if (!existingSuite) return <Card><CardContent className="space-y-2 p-5 text-sm"><p>Frostwork en Cashflow zijn uitbreidingen voor je bedrijf.</p><a href="/crm/apps" className="text-primary underline">Bekijk apps & uitbreidingen</a></CardContent></Card>;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm font-medium text-zinc-500">
					Ook in de suite
				</CardTitle>
			</CardHeader>
			<CardContent>
				{data === undefined ? (
					<div className="grid gap-3 sm:grid-cols-2">
						<Skeleton className="h-24 w-full" />
						<Skeleton className="h-24 w-full" />
					</div>
				) : (
					<div className="grid gap-3 sm:grid-cols-2">
						<AppCard
							icon={<Receipt className="h-4 w-4 text-blue-600" />}
							title="Cashflow"
							href={`${CASHFLOW_URL}/klanten/open?lf=${encodeURIComponent(contactId)}`}
							linkLabel="Klant & offertes"
						>
							<CashflowBody summary={data?.cashflow ?? null} />
						</AppCard>
						<AppCard
							icon={<Snowflake className="h-4 w-4 text-sky-600" />}
							title="Frostwork"
							href={frostworkCustomerUrl(contactName)}
						>
							<FrostworkBody summary={data?.frostwork ?? null} />
						</AppCard>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function AppCard({
	icon,
	title,
	href,
	linkLabel = 'Open',
	children,
}: {
	icon: ReactNode;
	title: string;
	href: string;
	linkLabel?: string;
	children: ReactNode;
}) {
	return (
		<div className="rounded-lg border border-zinc-200 bg-card p-3 shadow-xs">
			<div className="mb-2 flex items-center justify-between">
				<div className="flex items-center gap-2 text-sm font-medium text-zinc-800">
					{icon}
					{title}
				</div>
				<a
					href={href}
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
				>
					{linkLabel} <ExternalLink className="h-3 w-3" />
				</a>
			</div>
			<div className="text-sm text-zinc-600">{children}</div>
		</div>
	);
}

function CashflowBody({ summary }: { summary: CashflowSummary | null }) {
	if (!summary || !summary.configured)
		return <p className="text-zinc-400">Niet beschikbaar.</p>;
	if (!summary.linked)
		return <p className="text-zinc-400">Nog niet als klant in Cashflow.</p>;
	return (
		<ul className="space-y-0.5">
			<li>
				{summary.invoices.count}{" "}
				{summary.invoices.count === 1 ? "factuur" : "facturen"}
				{summary.invoices.openCount > 0 && (
					<span className="text-amber-700">
						{" "}
						· {summary.invoices.openCount} open (
						{euro(summary.invoices.openTotalCents)})
					</span>
				)}
			</li>
			<li>
				{summary.quotes.count}{" "}
				{summary.quotes.count === 1 ? "offerte" : "offertes"}
				{summary.quotes.openCount > 0 && (
					<span className="text-zinc-500">
						{" "}
						· {summary.quotes.openCount} open
					</span>
				)}
			</li>
			{summary.quotes.latest && (
				<li className="pt-2">
					<p>Meest recente offerte: {summary.quotes.latest.number ?? "Zonder nummer"}</p>
					<p>{({draft: "Concept", sent: "Verstuurd", accepted: "Geaccepteerd", rejected: "Afgewezen", expired: "Verlopen"} as Record<string, string>)[summary.quotes.latest.status] ?? "Status onbekend"} · {dateShort(summary.quotes.latest.date)}</p>
				</li>
			)}
			{summary.quotes.count > 0 && (
				<li className="pt-2 text-xs text-zinc-500">Klanthistorie; controleer of de offerte bij deze aanvraag hoort.</li>
			)}
		</ul>
	);
}

function FrostworkBody({ summary }: { summary: FrostworkSummary | null }) {
	if (!summary || !summary.configured)
		return <p className="text-zinc-400">Niet beschikbaar.</p>;
	if (!summary.linked)
		return <p className="text-zinc-400">Geen klantmatch gevonden in Frostwork.</p>;
	const nextDue = summary.maintenance.nextDueAt;
	const overdue = nextDue !== null && nextDue < Date.now();
	return (
		<ul className="space-y-0.5">
			{summary.matchedBy === 'email' && <li className="text-xs text-zinc-500">Gevonden via e-mailadres; contact-ID nog niet gekoppeld.</li>}
			<li>
				{summary.installations.count}{" "}
				{summary.installations.count === 1 ? "installatie" : "installaties"} ·{" "}
				{summary.workOrders.count}{" "}
				{summary.workOrders.count === 1 ? "werkbon" : "werkbonnen"}
			</li>
			{nextDue !== null && (
				<li className={overdue ? "text-red-700" : "text-zinc-600"}>
					Volgend onderhoud: {dateShort(nextDue)}
					{overdue && " (te laat)"}
				</li>
			)}
		</ul>
	);
}
