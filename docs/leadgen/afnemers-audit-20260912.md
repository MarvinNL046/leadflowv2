# Afnemers- en verkooproute — 12 september 2026

Historische audit op de hieronder genoemde commit. De aansluitende [herstelronde](marketplace-herstel-20260912.md) is gepubliceerd: betaalcontrole, ingestelde vervaldatums, dienstclassificatie en CRM-overdracht zijn verbeterd. De auditfixture reproduceert de oorspronkelijke situatie; actuele regressietests staan in convex/marketplacePurchaseFlow.test.ts. De commerciële en overige open punten blijven relevant.

De intake is aanwezig, maar de marketplace is nog niet klaar voor betrouwbare betaalde leadverkoop. Eerst de betaalcontrole en verkoopvoorwaarden herstellen, daarna afnemers activeren en de regionale paginagroei hervatten.

## Omvang en bewijs

- Productie alleen gelezen: Convex `vibrant-wildebeest-329`, snapshot 12 september 2026. Per tabel maximaal 501 rijen; geen limiet geraakt. Geen contactgegevens opgenomen in deze rapportage.
- Code gecontroleerd op LeadFlow-commit `5c3fca7ca67ec09d5c06dc7c34a303dfc208a94b`; installatieproxy op pilotcommit `cb37e737dc3e4dde7c92563f1240dbba889a6853`.
- Tien lokale simulaties met convex-test en Vitest: vijf controles geslaagd, vijf tekortkomingen gereproduceerd als falende assertions. Geen externe providerrequests toegestaan. Geen echte betaling, aankoop, tegoedwijziging, notificatie of leadwijziging uitgevoerd.
- Dit is een audit, geen gepubliceerde reparatie. Niet getest: echte Stripe Checkout, ontvangst door afnemers, gelijktijdige productieaankopen, contracten of daadwerkelijke beschikbaarheid/certificering van installateurs. Testresultaten bewijzen de gesimuleerde scenario's, niet al deze externe voorwaarden.
- Reproductie: `audit/buyerAudit.test.ts.fixture`; resultaat: `audit/buyerAudit-resultaat.txt`. Kopieer de fixture tijdelijk naar `convex/buyerAudit.test.ts` en voer `node node_modules/vitest/vitest.mjs run convex/buyerAudit.test.ts` uit. Verwacht vijf falende controles zolang de gevonden gaten niet zijn hersteld. De fixture staat buiten de gewone testsuite.

## Huidige afnemers en aanbod

| Onderdeel | Vastgesteld in v2 |
|---|---|
| Organisaties | Eén: Staycool Airconditioning; marketplace ingeschakeld |
| Andere afnemers | Geen andere organisaties geregistreerd in deze v2-database; externe netwerken en v1 niet onderzocht |
| Voorkeuren Staycool | Airco, thuisbatterij, zonnepanelen, laadpaal, warmtepomp; particulier en zakelijk; gedeeld en exclusief |
| Werkgebied | Geen provincies, regio's of postcodes ingesteld. De feed behandelt dit als alle provincies; dat bewijst geen landelijke dekking |
| Diensten | Geen selectie installatie/onderhoud/reparatie ingesteld |
| Tegoed / transacties | €0; nul grootboekregels en nul aankopen |
| Betaling | Productieconfiguratie heeft een Stripe-testsleutel en een marketplace-webhooksecret. Sleutelwaarden niet opgeslagen in rapportage |
| Gepubliceerde aanvragen | 12, exclusief de afgehandelde eigen testaanvraag; echtheid, bereikbaarheid en actuele interesse niet opnieuw bevestigd |
| Airco | 8: 7 Limburg, 1 Noord-Brabant. Gepubliceerd 23 juli–3 augustus, circa 40–51 dagen oud |
| Overige aanvragen | 2 loodgieter, 1 slotenmaker, 1 laadpaal |
| Bekeken / gekocht | Geen marketplace-detailviews of aankopen geregistreerd bij deze aanvragen; dit zegt niets over contact buiten v2 |
| Aircoprijzen | 6 aanvragen: €17,40 gedeeld / €69,60 exclusief; 2: €18,85 / €75,40. Dit zijn ingestelde leadprijzen, geen gerealiseerde opbrengsten of installatieprijzen |
| Gedeelde verkoop | Maximaal vier afnemers per aanvraag; exclusief is viermaal de opgeslagen gedeelde prijs |

## Herstelpunten op volgorde

### 1. Betaalcontrole vóór activering van echte betalingen

`convex/http.ts` bij `/webhooks/marketplace-stripe` controleert de Stripe-handtekening en voorkomt dubbele bijschrijving per sessie. De webhook controleert echter niet `payment_status` voordat tegoed wordt bijgeschreven. De lokale test bood een correct ondertekend `checkout.session.completed`-event met `payment_status: unpaid` aan: de wallet kreeg toch €50.

Controleer betaalstatus, valuta, positief geheel bedrag en sessiemodus; behandel eventueel vertraagde betaalbevestigingen afzonderlijk. Welke vertraagde betaalmethoden in Stripe zijn ingeschakeld is niet onderzocht. Volgens [Stripe's fulfillmentdocumentatie](https://docs.stripe.com/checkout/fulfillment) moet de betaalstatus worden beoordeeld en hebben vertraagde methoden een apart succes-event. Pas na herstel en een volledige test kan livebetaling worden ingericht.

### 2. Beschikbaarheid en branchecontrole consequent afdwingen

`convex/marketplace/purchase.ts` controleert status, verkoopmodus, gedeelde plekken, bestaande aankoop en saldo, maar negeert `expiresAt` en de branchevoorkeur. De tests konden een verlopen aanvraag kopen en een aircolead kopen terwijl de afnemer alleen loodgieter had geselecteerd. De feed verbergt de laatste wel: de aankooproute wijkt dus af van feed/detail. Het product moet expliciet bepalen welke voorkeuren toegang beperken en welke alleen filters zijn, en dit consistent toepassen.

`feed.ts` controleert eveneens geen vervaldatum. `getMaskedLeadDetail` heeft geen algemene status-/vervalcontrole. Alle twaalf gepubliceerde aanvragen hebben nu geen vervaldatum. `crons.ts` bevat geen marketplace-taak om niet-opgepakte aanvragen te laten vervallen of te escaleren. Kies een bruikbaarheidsperiode per dienst; beoordeel oude aanvragen handmatig voordat ze opnieuw worden aangeboden. Deze audit archiveert ze niet automatisch.

### 3. Afnemersmeldingen en concrete dekking regelen

`notifyOnNewLead` en `notifyChannel` worden opgeslagen, maar hebben geen afnemergerichte verzendlogica. De bestaande `notify.ts` mailt superadmins; dat is geen melding naar passende installateurs. Ook ontbreekt een marketplace-opvolgtaak voor onbeantwoorde aanvragen.

Regio's en postcodevoorkeuren zijn volgens schema opgeslagen maar worden niet gebruikt door de feed. Het provincieveld wordt wel gebruikt, maar staat bij Staycool niet ingesteld; het huidige voorkeurenformulier biedt hiervoor geen selectie. Leg eerst de werkelijke dienst, werkgebied en beschikbare capaciteit van de pilotafnemer vast, daarna meldingen met herhaalbeveiliging en een zichtbare onbehandelde wachtrij. Marketplace-toegang op zichzelf is geen afnemerscontract of certificeringscontrole.

### 4. Diensttype en CRM-overdracht afmaken

De installatieproxy bewaart het label `Airco-installatie` in metadata. De intake verwacht voor filtering een afzonderlijk veld `serviceType: install`. Alle twaalf bestaande aanvragen missen dat veld. De test bevestigt dat het label het filterveld niet vult. De eerder aangebrachte paginabron blijft werken; dit is een aanvullende tekortkoming in dienstclassificatie.

Bij een aankoop worden contactgegevens, een notitie en (bij een standaardpipeline met geschikte fase) een opportunity aangemaakt. De oorspronkelijke opdrachtomschrijving ontbreekt echter in de CRM-notitie; de test bevestigt dit. De oorspronkelijke paginabron wordt in CRM-attributie vervangen door de algemene bron `marketplace`. De uitgebreide aanvraag is nog wel zichtbaar via gekochte leads. Neem opdrachtinformatie en oorspronkelijke bron mee in de overdracht, met behoud van afscherming per afnemer.

### 5. Privacy en kleinere verbeteringen vóór opschaling

De feed maskeert losse naam-, telefoon- en e-mailvelden, maar geeft bericht, projectomschrijving, nichedata en fotoverwijzingen door. Vrije tekst kan alsnog contactgegevens bevatten. Dit is code-inspectie; geen lek van productiecontactgegevens geprobeerd. Verder filtert de feed sommige voorkeuren pas na het afsnijden van de resultaten en leest hij onbegrensde verzamelingen. Neem gegevensminimalisatie, consistente filters en begrensde queries mee vóór volumegroei.

## Wat de tests wel bevestigen

1. Gedeelde aankoop schrijft de opgeslagen prijs af en maakt contact plus opportunity aan; een herhaalde aankoop schrijft niet opnieuw af.
2. Exclusieve aankoop doet hetzelfde en voorkomt een tweede aankoop van dezelfde lead.
3. Onvoldoende saldo levert geen aankoop of nieuw CRM-contact op.
4. Twee verwerkingen van dezelfde Stripe-sessie schrijven slechts eenmaal tegoed bij.
5. Een niet-ingelogde gebruiker kan geen aankoop doen.

## SEO-context uit Obsidian

Gebruikte vault: `C:/Users/M_Smi/Documents/webdev/webdev/SEO/`.

- `00 SEO Playbook (index).md`: ingang naar de relevante notities.
- `23 Nederlandse en lokale SEO specifics.md`: lokale context en aansluiting op echte diensten/werkgebieden.
- `28 Publicatieritme, refresh en meten.md`: meten en actualiseren per pagina; sluit aan bij het bestaande pagina-werklog.
- `references-staycool/business-context.md` en `README.md`: Limburg als beschreven werkgebied en expliciete `[CHECK]`-punten voor bedrijfsgegevens en claims.

Deze notities zijn projectcontext, geen bewijs dat alle claims actueel zijn. De beschreven Staycool-dekking moet operationeel worden bevestigd; bedrijfsclaims gaan niet automatisch over op VindAircoMonteur. Huidige SEO-regels of wettelijke uitspraken moeten bij gebruik opnieuw aan primaire bronnen worden getoetst. De vault is in deze ronde alleen gelezen.

## Aanbevolen vervolg

Eerst één herstelronde voor betaalstatus, verkoopbaarheid, diensttype en volledige CRM-overdracht, met regressietests. Daarna een afnemer voor een concreet Limburgs werkgebied operationeel maken, inclusief meldingen, opvolging en afspraken over prijs/acceptatie. Vervolgens pas één regionale pagina verbeteren en de aanvraag-tot-opvolging meten. De echte sms-ontvangsttest blijft open voor maandag wanneer de kantoortelefoon aanstaat.
