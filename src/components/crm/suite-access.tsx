import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Card, CardContent } from "#/components/ui/card";
export function SuiteAccess({
  workspaceId,
  admin,
}: {
  workspaceId: Id<"workspaces">;
  admin: boolean;
}) {
  const status = useQuery(api.suiteAccess.company, { workspaceId }),
    create = useMutation(api.suiteAccess.createCode);
  const [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Bedrijfsaccounts koppelen</h2>
      <p className="text-sm">
        Gebruik in beide apps dezelfde eigenaar. Koppelen activeert geen
        abonnement en deelt geen contacten. Je bestaande zelfstandige abonnement
        blijft gelden.
      </p>
      {status?.canPair && (
        <div className="flex flex-wrap gap-2">
          {(["frostwork", "cashflow"] as const).map((product) => (
            <Button
              key={product}
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                setCode("");
                try {
                  setCode(await create({ workspaceId, product }));
                } catch {
                  setError(
                    "Code maken niet gelukt. Alleen de eigenaar kan koppelen.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Koppelcode voor{" "}
              {product === "frostwork" ? "Frostwork" : "Cashflow"}
            </Button>
          ))}
        </div>
      )}
      {code && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <label htmlFor="suite-code">Koppelcode · 10 minuten geldig</label>
            <Input id="suite-code" readOnly value={code} />
            <p className="text-sm">Plak de code in de gekozen app:</p>
            <div className="flex gap-4">
              <a
                className="underline"
                href="https://frostwork.wetry.app/leadflow-koppelen"
                target="_blank"
                rel="noreferrer"
              >
                Frostwork koppelen
              </a>
              <a
                className="underline"
                href="https://cashflow.wetry.app/leadflow-koppelen"
                target="_blank"
                rel="noreferrer"
              >
                Cashflow koppelen
              </a>
            </div>
          </CardContent>
        </Card>
      )}
      {error && <p role="alert">{error}</p>}
      {status?.bindings.map((b) => (
        <p key={b.product} className="text-sm">
          {b.product}: gekoppeld ·{" "}
          {b.enabled
            ? "toegang toegekend tot " +
              new Date(b.validUntil).toLocaleDateString("nl-NL")
            : "geen suite-toegang toegekend"}
          .{" "}
          <a
            className="underline"
            href={`https://${b.product}.wetry.app/leadflow-koppelen`}
            target="_blank"
            rel="noreferrer"
          >
            Toegangsstatus in app vernieuwen
          </a>
        </p>
      ))}
      {admin && <Admin />}
    </section>
  );
}
function Admin() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.suiteAccess.list,
    {},
    { initialNumItems: 20 },
  );
  return (
    <section aria-label="Producttoegang beheren" className="space-y-3">
      <h2 className="text-lg font-semibold">Producttoegang · platformbeheer</h2>
      <p className="text-sm">
        Handmatige toegang na een afspraak met het bedrijf. Dit voert geen
        betaling uit. Intrekken werkt normaal binnen vijf minuten, uiterlijk na
        vijftien minuten. Bestaande zelfstandige toegang blijft gelden.
      </p>
      {results.map((r) => (
        <AccessRow key={r.id} row={r} />
      ))}
      {status === "LoadingFirstPage" ? (
        <p>Laden…</p>
      ) : results.length === 0 ? (
        <p>Nog geen gekoppelde bedrijven.</p>
      ) : null}
      {status === "CanLoadMore" && (
        <Button onClick={() => loadMore(20)}>Meer bedrijven</Button>
      )}
    </section>
  );
}
function AccessRow({
  row,
}: {
  row: {
    id: Id<"suiteBindings">;
    company: string;
    product: "frostwork" | "cashflow";
    targetOrgId: string;
    enabled: boolean;
    validUntil: number;
  };
}) {
  const update = useMutation(api.suiteAccess.setAccess),
    [note, setNote] = useState(""),
    [until, setUntil] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(enabled: boolean) {
    setBusy(true);
    setMessage("");
    try {
      await update({
        bindingId: row.id,
        enabled,
        validUntil: enabled ? new Date(until + "T23:59:59").getTime() : 0,
        note,
      });
      setMessage("Opgeslagen. De doelapp haalt de wijziging op.");
      setNote("");
    } catch {
      setMessage(
        "Niet opgeslagen. Geef een toelichting en een geldige einddatum binnen één jaar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h3 className="font-medium">
          {row.company} · {row.product}
        </h3>
        <p className="text-sm">
          {row.enabled
            ? "Toegekend tot " +
              new Date(row.validUntil).toLocaleDateString("nl-NL")
            : "Niet toegekend"}
        </p>
        <details>
          <summary>Bedrijfsbinding</summary>
          <p className="break-all text-sm">{row.targetOrgId}</p>
        </details>
        <label className="block" htmlFor={row.id + "date"}>
          Einddatum
        </label>
        <Input
          id={row.id + "date"}
          type="date"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
        />
        <label className="block" htmlFor={row.id + "note"}>
          Toelichting / afspraak (geen betaalgegevens)
        </label>
        <Input
          id={row.id + "note"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
        />
        <div className="flex gap-2">
          <Button
            disabled={busy || note.trim().length < 5 || !until}
            onClick={() => save(true)}
          >
            Toegang toekennen
          </Button>
          <Button
            variant="outline"
            disabled={busy || note.trim().length < 5}
            onClick={() => save(false)}
          >
            Suite-toegang intrekken
          </Button>
        </div>
        <p role="status">{message}</p>
      </CardContent>
    </Card>
  );
}
