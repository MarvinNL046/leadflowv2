# Herstel verkooproute — 12 september 2026

De betaalcontrole, verkoopbaarheid, dienstclassificatie en CRM-overdracht zijn hersteld en gepubliceerd.

## Gedaan

- Stripe schrijft alleen tegoed bij voor betaalde, afgeronde EUR-betaalsessies met een geldig geheel bedrag binnen de opwaardeergrenzen. Vertraagde betaalbevestigingen worden verwerkt; dubbele meldingen schrijven niet dubbel bij.
- Een ingestelde vervaldatum wordt gehandhaafd in feed, detail en aankoop. Niet-verkoopbare statussen zijn afgeschermd. De aankooproute controleert de gekozen branche en specifieke diensten; een onbekende dienst telt niet als een bewezen match.
- Het aanvraagformulier op `/installatie/airco-laten-plaatsen-stappen` stuurt nu het gestructureerde diensttype `install` mee, bepaald door de server. Dit veld wordt na verificatie opgeslagen. Voor de homepage wordt geen dienst geraden.
- Gekochte aanvragen dragen opdrachtomschrijving, bericht, dienst, omvang, intentie, urgentie, extra gegevens en fotoverwijzingen over naar het CRM. De oorspronkelijke paginabron blijft bewaard in de notitie en attributie, naast het marketplace-label.
- Werklog LG-021 t/m LG-024 bijgewerkt. SEO-vault en terugkoppelvoorkeur staan in AGENTS.md; deze ronde veranderde geen SEO-inhoud.

## Controle en publicatie

| Onderdeel | Resultaat |
|---|---|
| LeadFlow-tests | 289 geslaagd, waaronder 27 aankoop-/betaalregressies |
| Website-tests | 31 geslaagd |
| TypeScript | Convex en pilot slagen. De volledige LeadFlow-repository heeft nog bestaande fouten buiten dit werk, onder andere migratiesjablonen en ongebruikte variabelen |
| Productiebuilds | LeadFlow Vite en pilot Next slagen |
| LeadFlow | [PR #14](https://github.com/MarvinNL046/leadflowv2/pull/14), commit `a8e340c`, Vercel `dpl_8eTnhxzQ1CAzVha83SgroouX271u`, READY, productiealias leadflow.wetry.app; build circa 35 seconden |
| Pilot | [PR #6](https://github.com/MarvinNL046/vindaircomonteur-v2/pull/6), commit `cddf1b4`, Vercel `dpl_4HghDttuf8JT6dztuhqBPqjncV8b`, READY, productiealias vindaircomonteur.nl; build circa 32 seconden |
| Live route | Installatiepagina geeft HTTP 200 en bevat één formulier |

De productiebuild van LeadFlow voert de Convex-deploy voor `vibrant-wildebeest-329` uit. Betalingen en aanvragen zijn lokaal gesimuleerd; de HTTP-livecontrole dient alleen als bereikbaarheidscontrole en bewijst geen volledige echte aanvraag of aankoop.

## Nog open

- Stripe blijft in testmodus; geen echte Checkout of betaling uitgevoerd.
- De twaalf bestaande aanvragen hebben geen vervaldatum. Hun kwaliteit/interesse is niet opnieuw vastgesteld en ze zijn niet automatisch gewijzigd. Een vervalbeleid en opvolging voor ongeclaimde aanvragen ontbreken nog.
- Afnemersmeldingen, bevestigd werkgebied en operationele capaciteit van Staycool moeten nog worden ingericht. Er zijn geen berichten of uitnodigingen verstuurd.
- Niet-geclassificeerde aanvragen uit andere formulieren moeten een expliciete dienstkeuze krijgen of worden beoordeeld. Geen backfill met geraden diensten uitgevoerd.
- De eerder gevonden aandachtspunten rond persoonsgegevens in vrije tekst, regionale/postcodefilters, feedpaginering en grote onbegrensde reads vallen buiten deze herstelronde en blijven in de audit staan.
- De echte sms-ontvangsttest blijft voor maandag wanneer de kantoortelefoon aanstaat.

## Aanbevolen eerstvolgende stap

Maak Staycool operationeel als eerste pilotafnemer: leg diensten en het concrete Limburgse werkgebied vast, bouw passende meldingen met bescherming tegen dubbel verzenden en maak onbehandelde aanvragen zichtbaar voor opvolging. Beoordeel daarna de oude aanvragen. Zodra deze keten werkt, kan de volgende regionale leadgenpagina worden verbeterd met de SEO-vault als context.
