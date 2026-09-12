# Leadgen — pagina- en wijzigingslog

Dit is het centrale werklog vanaf 12 september 2026. Eerdere inhoudelijke verbeteringen zijn niet gereconstrueerd; een Git-commitdatum geldt niet als bewijs dat een pagina is aangepakt.

## Bijhouden na elke werksessie

Voeg per gewijzigde pagina een nieuwe regel toe. Bewaar eerdere regels: zo blijft zichtbaar wanneer we een pagina opnieuw aanpakken. Gebruik de exacte URL of route, wat is gewijzigd, de controle, commit/PR en publicatiedatum. Een gedeelde componentwijziging krijgt als bereik alle betrokken routes.

Statussen: **Geïnventariseerd**, **Gepland**, **In uitvoering**, **Lokaal aangepast**, **Gecontroleerd**, **Live**, **Geblokkeerd**. Gebruik Live alleen na bevestigde publicatie. Lege datum = nog niet gedaan of onbekend. Controle is geen inhoudelijke verbetering.

## Wijzigingen

| ID | Datum | Repo/site | Pagina of bereik | Wat gedaan | Status | Controle | Commit/PR | Live sinds | Vervolg |
|---|---|---|---|---|---|---|---|---|---|
| LG-001 | 2026-09-12 | Leadgenportfolio | Alle 49 bestaande repo's | Lokale clones, branches, commitkoppen en intakeverwijzingen onderzocht | Geïnventariseerd | Git-status, ls-remote en code-scan | — | — | Per gekozen pagina inhoudelijke audit |
| LG-002 | 2026-09-12 | vindaircomonteur-v2 | Repository | Juiste Vercel-repo vastgesteld en lokaal gecloned | Geïnventariseerd | Clone en Vercel-koppeling | 3594014 (bron) | — | Dependencies en productie-intake controleren |
| LG-003 | 2026-09-12 | leadflowv2 | /crm en onderliggende CRM-pagina's | Sidebar uitgebreid met Leadgenbeheer voor super-admins en Marketplace-snelkoppelingen voor bevoegde gebruikers | Lokaal aangepast | Productiebuild geslaagd; 5 navigatietests geslaagd; totale suite 251 tests geslaagd | Nog niet gecommit | — | Ingelogde weergave beoordelen en publiceren |
| LG-004 | 2026-09-12 | leadflowv2 | /feed, /feed/purchased, /feed/wallet, /feed/lead/:id | CRM-sidebar blijft beschikbaar; mobiel menu toegevoegd; header past op kleine schermen | Lokaal aangepast | Build en navigatietests; ingelogde browsercontrole nog niet uitgevoerd | Nog niet gecommit | — | Ingelogde desktop/mobielcontrole en publiceren |

| LG-005 | 2026-09-12 | vindaircomonteur-v2 / leadflowv2 | Productie-intake | Live Vercel-bestemming en historische succesvolle aanvraag vastgesteld; pilot gebruikt al v2 | Gecontroleerd | Read-only Vercel-env en Convex-metadata | Zie Git-log | Bestaande koppeling, datum niet gewijzigd | Geen migratie nodig |
| LG-006 | 2026-09-12 | leadflowv2 | /crm/leadgen en gedeelde sidebar | Eigen v2-beheeroverzicht met bronfilter, paginering, contact/verificatie, meldingsstatus en opvolging; vervangt tijdelijke v1-snelkoppelingen van LG-003 | Gecontroleerd (lokaal) | 259 tests; build; Convex-typecheck en deploy-dry-run; desktop/mobiel met fictieve data | Zie Git-log | — | Backend en frontend publiceren; ingelogd verifiëren |
| LG-007 | 2026-09-12 | leadflowv2 | Wizard-verificatie en nieuwe-leadmail | Codecheck en leadpromotie atomair; cooldown geldt ook voor e-mail; notificatiestatus opgeslagen; mail verwijst naar /crm/leadgen | Gecontroleerd (lokaal) | HTTP-ketentest, retry/rollback, e-mailvariant en fouttests met gesimuleerde providers | Zie Git-log | — | Na publicatie test met aangewezen ontvanger |
| LG-008 | 2026-09-12 | vindaircomonteur-v2 | /aanvragen/verify | Duidelijke sms/e-mailmeldingen, veilige herverzending met wachttijd, foutafhandeling en herstart | Gecontroleerd (lokaal) | Onderdeel van 22 tests; TypeScript; Next-build; browser | Zie Git-log | — | Publiceren |
| LG-009 | 2026-09-12 | vindaircomonteur-v2 | /api/lead/start, /api/lead/send-code, /api/lead/verify | Expliciete v2-config, timeout, foutstatussen, geen cache of credential-redirect, sitegebonden bron | Gecontroleerd (lokaal) | Proxytests en build; bestaande productie-env bevestigd | Zie Git-log | — | Publiceren |
| LG-010 | 2026-09-12 | vindaircomonteur-v2 | / en alle gedeelde header/footer/mobiele CTA's | Aanvraagknoppen werken vanaf vervolgpagina's; uniek homepageanker; toegankelijke veldnamen en consistente verificatie-uitleg | Gecontroleerd (lokaal) | Build en browsercontrole van terugkeer naar aanvraagformulier | Zie Git-log | — | Publiceren |

LeadFlow: 259 tests geslaagd; build geslaagd; Convex-typecheck en deploy-dry-run geslaagd. De volledige root-TypeScript-controle heeft bestaande fouten buiten de gewijzigde bestanden (migratiescripts, e-mailbuilder en ongebruikte imports). Pilot: 22 tests, TypeScript en build geslaagd. De v2-browsercontrole gebruikte de echte componenten met fictieve gegevens; ingelogde productiecontrole volgt na publicatie. Geen productiegegevens aangepast en niets gedeployed.

## Publicatie en vervolg op 12 september 2026

De bovenstaande lokale controles beschrijven de eerste fase. Deze is inmiddels gepubliceerd:

| ID | Datum | Repo/site | Pagina of bereik | Wat gedaan | Status | Controle | Commit/PR | Live sinds | Vervolg |
|---|---|---|---|---|---|---|---|---|---|
| LG-011 | 2026-09-12 | leadflowv2 + vindaircomonteur-v2 | LG-003 t/m LG-010 | Eerste ronde gepubliceerd; ingelogd beheer en echte aanvraagroute gecontroleerd | Live | Beide Vercel-deployments READY; beheer bereikbaar | leadflowv2 PR #10 / c7d7461; pilot PR #1 / 286e728 | 2026-09-12 | Aflevering sms controleren |
| LG-012 | 2026-09-12 | vindaircomonteur.nl | /aanvragen/verify → /aanvragen/bedankt | Eén geautoriseerde TESTAANVRAAG bevestigd per e-mail; lead en beheerdersnotificatie aangemaakt | Gecontroleerd | emailVerified=true, phoneVerified=false; notificatie door provider geaccepteerd; sms blijft Pending op OnePlus 8T | Productiecontrole eerste ronde | 2026-09-12 | Testlead uit verkoop gehaald en afgerond, historie behouden; gatewayapp controleren |
| LG-013 | 2026-09-12 | leadflowv2 | /crm/leadgen, /api/intake/events, wizard | 30-daagse telling per bron: paginaweergave, formulierstart, ingediend, nieuwe bevestigde lead; geen contactgegevens in telling; bewaakte archivering testlead | Live | 261 tests; Convex-typecheck; build; live teller 1 weergave en 1 formulierstart | PR #11 / c259114 | 2026-09-12 | Verzamelen van echte gebruiksgegevens |
| LG-014 | 2026-09-12 | vindaircomonteur.nl | /, /privacy, /aanvragen/verify, /aanvragen/bedankt | Eén formulier met optionele toelichting; realistische reactietijd; anonieme meting; kanaalonafhankelijke bevestiging en e-mailalternatief | Live | 24 tests; TypeScript; build; live één formulier en werkende events; mobiel 390 px zonder overflow | PR #2 / c4c8d66 | 2026-09-12 | Sms-gatewayapp controleren |

Sms-documentatie: https://gateway.voidfix.com/rest-api/api-documentation en https://gateway.voidfix.com/device-connection.
WhatsApp is een apart kanaal; sessiecontrole gedocumenteerd op https://wa.voidfix.com/api-docs/#/Sessions/get_api_external_sessions. Voor deze test is geen WhatsApp verstuurd.
De nieuwe telling start bij publicatie; eerdere bezoekers en de eerste testaanvraag zijn niet achteraf toegevoegd. Paginaweergaven zijn geen unieke bezoekers; herhaalde bevestigingen en dubbele leads tellen niet opnieuw als nieuwe bevestigde lead.

## Pagina's klaar voor vervolg

Vastgelegde implementatiecommits op de lokale branch `codex/leadgen-pilot-20260912`:
LeadFlow v2 `a5f17b8`; Vindaircomonteur v2 `2dadf6c`. Deze eerste ronde is inmiddels gepubliceerd via de PRs bij LG-011.

De records hieronder gaan over de site als geheel. Vul bij daadwerkelijk werk de exacte pagina-URL in en voeg een wijzigingsregel hierboven toe. De SEO/content/conversie-aanpak is nog niet gestart in deze taak.

| Site/repo | Laatst gecontroleerd | Laatste inhoudelijke aanpak | Status | Eerstvolgende stap |
|---|---|---|---|---|
| airco_offertelimburg | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| aircobedrijflimburg.nl | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| aircoinstallateurlimburg.nl | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| aircoinstallatie-echt-susteren | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| aircoinstallatie-maastricht | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| aircoinstallatie-sittard-geleen | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| aircoinstallatiebrunssum.nl | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| aircoinstallatiegeleen.nl | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| aircoinstallatieheerlen.nl | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| aircoinstallatiekerkrade.nl | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| aircoinstallatielandgraaf.nl | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| aircoinstallatieroermond.nl | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| aircoinstallatiesittard.nl | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| aircoinstallatieweert.nl | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| aircolimburgaanbieding.nl | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| aircomontagelimurg.nl | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| aircovergelijkenlimburg.nl | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| begraafplaatsindebuurt-whitelabel | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| begraafplaatsindebuurt.nl | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| cemeterynearbyme | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| cutiepawspedia.com | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| Daikin-Airco-Limburg | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| dentistnearmenow.com | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| kinderopvang-indebuurt.nl | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| lgaircolimburg | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| limburgseaircodeals.nl | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| mitsubishiaircolimburg | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| rehabnearbyme | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| seniorcarenearbyme | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| Skilllinkup | 2026-09-12 | — | Geïnventariseerd | Bestaand lokaal werk eerst afstemmen |
| staycoolairconL | 2026-09-12 | — | Geïnventariseerd | Recente Staycool-clone gebruiken |
| storageunitsnearbyme | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| toshibaaircolimburg | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| tosotaircolimburg | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| vind-aannemer | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| vindaircomonteur | 2026-09-12 | — | Geïnventariseerd | Gebruik vindaircomonteur-v2 voor het huidige Vercel-project |
| vindaircomonteur-v2 | 2026-09-12 | 2026-09-12 (aanvraagroute) | Live (homepage, aanvraagroute en meting) | Sms-gateway controleren; daarna conversie volgen |
| vindcvmonteur | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| vinddakdekker | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| vindelektricien | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| vindglaszetter | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| vindlaadpaalinstallateur | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| vindlaadpaalmonteur | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| vindloodgieter | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| vindrioolservice | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| vindschoorsteenveger | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| vindslotenmaker | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| vindstukadoor | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| vindtandarts.nl | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |
| vindtimmerman | 2026-09-12 | — | Geïnventariseerd | Pagina kiezen; formulierbestemming en inhoud controleren |

## Eindcontrole publicatie — 12 september 2026

- LeadFlow v2: PR #11, c259114, dpl_2w1DbfYg6ywrNUMYLqAkWmd3gMg4, READY, TanStack Start, build circa 35 seconden. https://leadflow.wetry.app/crm/leadgen
- Pilot: PR #2, c4c8d66, dpl_4m8aZuf1RLd5gaqRtoojgdYi5eJw, READY, Next.js, build circa 30 seconden. https://vindaircomonteur.nl/
- Live gecontroleerd: één homepageformulier; de controle leverde 1 weergave en 1 start in de teller op. Niet ingestuurd; geen extra testlead. De eerste e-mailtest vond vóór activering van de meting plaats en is niet teruggeteld.
- Geautoriseerde testlead staat op rejected + done; emailVerified=true en phoneVerified=false. Geen aankoop gevonden bij archivering; historie behouden.
- Beide Vercel-projecten: geen runtimefouten gevonden in de laatste 30 minuten. Externe logdrains niet gecontroleerd; geen nieuwe periodieke monitoring aangemaakt.
- Openstaand: sms Pending bij Staycool Airconditioning, OnePlus 8T [887]. Gatewayapp/service, internet en SIM op het toestel controleren. Provideracceptatie bewijst geen ontvangst.

## Installatiepagina en vervolg — 12 september 2026

| ID | Datum | Repo/site | Pagina of bereik | Wat gedaan | Status | Controle | Commit/PR | Live sinds | Vervolg |
|---|---|---|---|---|---|---|---|---|---|
| LG-015 | 2026-09-12 | vindaircomonteur-v2 | /installatie/airco-laten-plaatsen-stappen | Kostenopbouw, voorbereiding, selectie monteur en aanvraagproces herschreven; onderbouwde bronverwijzingen; formulier op de pagina | Live | 29 pilottests, TypeScript, Next-build; desktop/mobiel 390 px; live één formulier en juiste ankers/canonical | Pilot PR #4 / 2c04c83 | 2026-09-12 | Echte aanvragen en afnemersrespons beoordelen |
| LG-016 | 2026-09-12 | vindaircomonteur-v2 + leadflowv2 | /api/lead/start en bron in /crm/leadgen | Vaste paginabron en serverbepaalde dienst; bestaand v2-pad behoudt bron na verificatie en retries; homepagecijfers blijven gescheiden | Live | Proxy/UI-tests; 262 v2-tests inclusief ketentest met installatiebron; geen productieberichten | Pilot PR #4; v2-testcommit via git log | 2026-09-12 | Aanvragen herkenbaar per pagina opvolgen |
| LG-017 | 2026-09-12 | vindaircomonteur-v2 | Gedeelde gids-CTA, header/footer/mobiele CTA; /sitemap.xml | Routebewuste aanvraaglinks; niet-onderbouwde reactie-/offertebelofte uit gids-CTA verwijderd; bestaande gidsen en categorieën in sitemap | Live | Browser op desktop/mobiel, clientnavigatietest en sitemapcontrole | Pilot PR #4 / 2c04c83 | 2026-09-12 | Onderhouds- en storingsinhoud apart beoordelen |
| LG-018 | 2026-09-12 | leadflowv2 | docs/leadgen/programmatic-vervolg.md | Gebruikersblauwdruk vertaald naar plan voor lokale brondata, calculatorvalidatie, afnemersdekking en opbrengstmeting | Gepland | Bijlage gelezen; Google-richtlijnen gecontroleerd; voorbeeldclaims niet overgenomen | Zie git log | — | Eén regio kiezen met echte afnemers en brongegevens |

Productiepilot: dpl_DzD7EqvsL3pMdfGECEH1vHqj9M1N, READY, Next.js, build 31 seconden. De echte installatieaanvraag is deze ronde niet opnieuw verstuurd: providers zijn gesimuleerd in tests. Sms-test blijft voor maandag na inschakelen van de kantoortelefoon. Geen nieuwe partners gekoppeld, geen lokale datapagina's of calculator gepubliceerd. De algemene certificeringsclaims op de homepage en de inhoud van onderhoud/storing zijn niet volledig geaudit in deze ronde; de gewijzigde gedeelde CTA is wel gecontroleerd.

## Afnemersaudit en SEO-context — 12 september 2026

| ID | Datum | Repo/site | Pagina of bereik | Wat gedaan | Status | Controle | Commit/PR | Live sinds | Vervolg |
|---|---|---|---|---|---|---|---|---|---|
| LG-019 | 2026-09-12 | leadflowv2 | /feed, wallet, aankoop, intake, CRM-overdracht, ongeclaimde aanvragen | Productie alleen gelezen; 1 afnemer, €0, 0 aankopen, 12 niet als test gemarkeerde gepubliceerde aanvragen; Stripe testmodus; audit met herstelpunten vastgelegd | Audit afgerond; reparaties open | 10 lokale simulaties: 5 geslaagd, 5 tekortkomingen gereproduceerd; geen productieaankopen/berichten | Lokale branch codex/marketplace-audit-20260912; zie git log | — (geen runtimewijziging) | Eerst betaalcontrole, verkoopbaarheid, diensttype en CRM-overdracht herstellen |
| LG-020 | 2026-09-12 | leadflowv2 + taakcontext | AGENTS.md en docs/leadgen/README.md | Gebruikersvoorkeur vastgelegd: SEO-vault raadplegen en na elke taak gedaan/open/vervolg aangeven | Lokaal vastgelegd | Vault gevonden; SEO-index, lokale SEO, paginameting en Staycool-reference gelezen; CHECK-punten niet als feiten overgenomen | Lokale branch codex/marketplace-audit-20260912; zie git log | — | Vault bij volgende SEO-keuze opnieuw gericht raadplegen |

Details en testbewijs: [afnemers-audit-20260912.md](afnemers-audit-20260912.md). De vijf falende auditassertions staan bewust in een aparte reproductiefixture, buiten de gewone testsuite; ze zijn geen geslaagde regressietests. Aanvraagkwaliteit en werkelijke beschikbaarheid van afnemers zijn niet vastgesteld.

## Herstel verkooproute — 12 september 2026

| ID | Datum | Repo/site | Pagina of bereik | Wat gedaan | Status | Controle | Commit/PR | Live sinds | Vervolg |
|---|---|---|---|---|---|---|---|---|---|
| LG-021 | 2026-09-12 | leadflowv2 | /webhooks/marketplace-stripe en marketplace/wallet | Alleen betaalde, afgeronde EUR-betaalsessies met geldig bedrag schrijven bij; vertraagde succes-events ondersteund; duplicaatbeveiliging behouden; interne bedrag- en orgcontrole | Live | Betaald/onbetaald/vertraagd/dubbel/ongeldige handtekening en sessievarianten; 289 v2-tests | LF PR #14 / a8e340c | 2026-09-12 | Pas later echte betalingen activeren en volledige Checkout testen |
| LG-022 | 2026-09-12 | leadflowv2 | /feed, leaddetail en aankoop | Ingestelde vervaldatum blokkeert alle drie routes; niet-verkoopbare statussen gesloten; aankoop handhaaft branchekeuze; specifieke dienstfilter sluit onbekende diensten uit | Live | Feed/detail/aankoop-regressietests; bestaande rijen niet aangepast | LF PR #14 / a8e340c | 2026-09-12 | Voor bestaande aanvragen actualiteit en vervalbeleid bepalen |
| LG-023 | 2026-09-12 | vindaircomonteur-v2 + leadflowv2 | /api/lead/start vanaf /installatie/airco-laten-plaatsen-stappen | Proxy zet payload.serviceType=install; ketentest bevestigt opslag na verificatie. Homepage krijgt geen geraden dienst | Live | 31 pilottests, pilot-TypeScript/Next-build; v2-ketentest | Pilot PR #6 / cddf1b4; LF PR #14 / a8e340c | 2026-09-12 | Onbekende diensten op andere formulieren later expliciet uitvragen |
| LG-024 | 2026-09-12 | leadflowv2 | Aankoop naar CRM-notitie en leadAttribution | Opdrachtomschrijving, bericht, dienst, omvang, urgentie, extra gegevens, foto's en oorspronkelijke paginabron bewaard; marketplace-bronlabel behouden | Live | Aankoop/CRM-regressietests; Convex-TypeScript en Vite-build | LF PR #14 / a8e340c | 2026-09-12 | Afnemersmeldingen en concreet werkgebied operationeel maken |

De volledige repository-TypeScriptcontrole meldt nog bestaande fouten buiten deze herstelronde (onder andere messaging/metaProcessor ongebruikte variabelen, migratiesjabloon en frontend). De nieuwe testtypefout is hersteld; de afzonderlijke Convex-TypeScriptcontrole slaagt. De auditfixture blijft een historische reproductie op de oorspronkelijke auditcommit. Actuele regressies staan in convex/marketplacePurchaseFlow.test.ts. Er zijn geen productiebetalingen, berichten, afnemerswijzigingen of backfills uitgevoerd.

Publicatiebevestiging: zie [marketplace-herstel-20260912.md](marketplace-herstel-20260912.md) voor PRs, productiecommits, READY-deployments, testresultaten en nog openstaande punten.

## Staycool als pilotafnemer — 12 september 2026

| ID | Datum | Repo/site | Pagina of bereik | Wat gedaan | Status | Controle | Commit/PR | Live sinds | Vervolg |
|---|---|---|---|---|---|---|---|---|---|
| LG-025 | 2026-09-12 | leadflowv2 | /feed/settings, marketplace-sidebar | Werkgebied, dienst en e-mailmeldingen instelbaar; expliciet filter wissen hersteld. Gebruiker kiest voor Staycool airco-installatie in heel Limburg | Live; productieconfiguratie bevestigd | UI-test voorkeuren; backendmatch op dienst/provincie/niche; geen oude aanvragen als nieuwe mail | PR #16 / 3638e97 | 2026-09-12 | Echte ontvangst bij volgende passende aanvraag beoordelen |
| LG-026 | 2026-09-12 | leadflowv2 | Nieuwe-leadmelding naar afnemer | E-mail naar geregistreerde organisatie-eigenaar; expliciete activering; geen consumentcontactgegevens in mail; vast bericht met provider-idempotency, lease en maximaal drie pogingen | Live; productieconfiguratie bevestigd | Matching, afmelden, verlopen vóór verzending, crashherstel, dubbele queue en drie foutpogingen gesimuleerd | PR #16 / 3638e97 | 2026-09-12 | Staycool-adres info@staycoolairco.nl; geen echte testmail in deze ronde |
| LG-027 | 2026-09-12 | leadflowv2 | Gedeelde en exclusieve aankoop, leaddetail en bevestigingsvenster | Maximaal 3 gedeelde kopers totaal; tekst zegt maximaal 2 andere installateurs. Bestaande prijzen behouden. Exclusief sluit gedeeld; eerste gedeelde aankoop sluit exclusief | Live; productieconfiguratie bevestigd | Drie kopers slagen, vierde geweigerd; exclusief na gedeeld geweigerd; modaltekst getest; capaciteitmigratie slaat reeds gekochte leads over | PR #16 / 3638e97 | 2026-09-12 | Prijsbeleid later apart beoordelen |
| LG-028 | 2026-09-12 | leadflowv2 | /crm/leadgen, achtergrondcontrole verval/opvolging | Filter opvolging nodig, afnemermailstatus en vervaldatum zichtbaar; controle elke 5 minuten. Nieuwe installatieaanvragen kunnen na 24 uur zonder koper worden gemarkeerd; verkooptermijn instelbaar op 7/14 dagen of uit | Live; productieconfiguratie bevestigd | Dag-1 markering, geen herhaalde markering, geen waarschuwing na aankoop, vervallen op ingestelde datum | PR #16 / 3638e97 | 2026-09-12 | Automatisch verlopen blijft uit totdat gebruiker termijn kiest; oude aanvragen apart beoordelen |

De gebruiker bevestigde airco-installatie in heel Limburg en drie kopers totaal. De vraag over 7/14 dagen staat nog open. De opvolgmelding is een zichtbare waarschuwing in Leadgenbeheer, geen nieuwe herinneringsmail. Bestaande data krijgt geen geraden dienst of vervaldatum. De geregistreerde prijzen blijven bijvoorbeeld €17,40 gedeeld en €69,60 exclusief; de exclusieve prijsfactor staat los van het maximumaantal gedeelde kopers. Betaling blijft in testmodus en Staycool-tegoed blijft €0.

Publicatie en productiecontrole: [Staycool-pilot](staycool-pilot-20260912.md). Twaalf ongekochte gepubliceerde aanvragen zijn begrensd op drie kopers; prijzen, dienst en vervaldatum behouden. 305 tests, Convex-TypeScript en productiebuild geslaagd. Werkgebied en meldingen live gecontroleerd. Automatisch verlopen staat uit; opvolgbeleid voor nieuwe airco-installatieaanvragen staat op 24 uur.


## Oude aanvragen beoordelen — 12 september 2026

| ID | Datum | Repo/site | Pagina of bereik | Wat gedaan | Status | Controle | Commit/PR | Live sinds | Vervolg |
|---|---|---|---|---|---|---|---|---|---|
| LG-029 | 2026-09-12 | leadflowv2 | 12 gepubliceerde aanvragen; /crm/leadgen | Alle oude aanvragen read-only beoordeeld; oorspronkelijke importdatum en historische reviewstatus onderzocht. Beheer toont aanvraag- en importdatum apart, type werk en waarschuwing bij oude pending_review-status | Live | 32 gerichte tests, Convex-TypeScript en Vite-build; geen productiemutaties of berichten | PR #18 / f3a8c88 | 2026-09-12 | Actuele behoefte eerst herbevestigen; daarna dienst vastleggen |

De zeven Limburgse airco-aanvragen zijn geïmporteerd op 23 juli, maar oorspronkelijk ontvangen van 23 mei tot 4 juli (circa 70–112 dagen oud op controlemoment). De eerdere leeftijdsindicatie op basis van de v2-opslagdatum onderschatte hun ouderdom. Alle zeven hadden in v1 de status pending_review; historische e-mailbevestiging staat alleen in importmetadata. Deze gegevens worden als historische aanwijzing weergegeven, niet gebruikt om verkoop- of verificatiestatus automatisch te wijzigen. Alle twaalf aanvragen missen een gestructureerd type werk; huidige behoefte is nergens opnieuw bevestigd. Het dossier met beoordeling per aanvraag is alleen in de lokale taakoutputs opgeslagen, zonder consumentnamen of contactgegevens. Geen SEO-pagina's gewijzigd.

Publicatiebevestiging LG-029: productiecommit f3a8c88110e99a275bd0a1078f2d0610e2e1138d, Vercel dpl_79aR2YZqjwJRUs6aqFhoD9b4V7AM READY. Livebeheer gecontroleerd: zeven oorspronkelijke datums en zeven historische reviewwaarschuwingen zichtbaar; type werk onbekend zichtbaar. Aanbevolen technisch vervolg: op de homepage expliciet installatie, onderhoud of reparatie uitvragen, zodat nieuwe aanvragen wel betrouwbaar op Staycools dienstfilter aansluiten.

## Homepage-dienstkeuze — 12 september 2026

| ID | Datum | Repo/site | Pagina of bereik | Wat gedaan | Status | Controle | Commit/PR | Live sinds | Vervolg |
|---|---|---|---|---|---|---|---|---|---|
| LG-030 | 2026-09-12 | vindaircomonteur-v2 + leadflowv2 | /#aanvragen, /api/lead/start; wizard-verificatie en afnemermatching | Verplichte homepagekeuze Installatie/Onderhoud/Reparatie zonder voorselectie. Server valideert en bewaart gekozen dienst; installatiepagina blijft install; directory blijft compatibel. Ketentest bewijst dienstopslag na verificatie en uitsluitend install als Staycool-melding | Live | 43 websitetests; website-TypeScript en Next-build; 35 gerichte LeadFlow-tests en Convex-TypeScript; live 390/1280 px | Pilot PR #8 / 47df8a9; LeadFlow-ketentest in deze commit | 2026-09-12 | Sms-test maandag combineren met echte dienstopslag en afnemermailontvangst |

Pilotproductie bevestigd: dpl_6ix4h6C8FFu6nQrJK7r73A4HP9mc READY, commit 47df8a9814b3d2c757049e668ae724fc23f017ad. Nieuwe homepagekeuzes zichtbaar op mobiel en desktop, alle drie uit bij openen. Geen liveaanvraag of berichten verstuurd; providerverkeer gesimuleerd. Geen oude aanvragen of SEO-claims gewijzigd. Open blijven de verkooptermijn, actualiteit oude leads en commerciële betaalmodus. Volgende technische verbetering: in Leadgenbeheer zichtbaar maken of een aanvraag überhaupt een passende actieve afnemer heeft, zodat onderhoud/reparatie of een ongedekte regio niet stil blijft liggen.

## Afnemerdekking — 12 september 2026

| ID | Datum | Repo/site | Pagina of bereik | Wat gedaan | Status | Controle | Commit/PR | Live sinds | Vervolg |
|---|---|---|---|---|---|---|---|---|---|
| LG-031 | 2026-09-12 | leadflowv2 | /crm/leadgen, admin.listLeads | Per aanvraag actieve afnemerdekking met redenen en samenvatting van geladen aanvragen. Match op niche, dienst, provincie, segment, verkoopvorm en eerdere aankoop. Niet-verkoopbare aanvragen apart; begrensde controles leveren onbekend of minimumaantal op | Live | 335 tests, Convex-TypeScript en Vite-build; admin-autorisatie, veranderende voorkeuren, gedeeltelijke controle, drie kopers, geen schrijfacties of mail vanuit beheerquery | PR #21 / 0fc141c | 2026-09-12 | Ontbrekende diensten/regio's gericht aanvullen met afnemers |

Actief betekent marketplaceEnabled met opgeslagen voorkeuren. Tegoed, e-mailopt-in, ontvangst en daadwerkelijke koopbereidheid zijn afzonderlijke zaken en tellen niet mee in deze dekkingsindicatie. Werkgebied betekent de bestaande provinciecontrole; opgeslagen regio/postcodeprefixfilters worden net als in de verkooproute niet gebruikt. De samenvatting gaat expliciet over geladen aanvragen, geen portfoliototaal. De controle leest maximaal 200 afnemersvoorkeuren (plus één om afkapping te detecteren) en maximaal 101 aankopen per lead. Bij afkapping wordt geen definitieve nuldekking geclaimd. Geen bestaande data, prijzen, verkooptermijn of berichtinstellingen aangepast; geen echte berichten verstuurd. Geen SEO-werk in deze ronde.

Publicatiebevestiging LG-031: Vercel dpl_2HP14i61z5tegJZamfsbyafjjXTF READY, productiecommit 0fc141ccf491f9174068d51e01feb35893bc8628. Livebeheer: 13 geladen aanvragen, 12 zonder passende afnemer, 0 met passende afnemer, 1 niet beschikbaar en 0 nog te controleren. Bij zeven oude Limburgse airco-aanvragen ontbreekt de dienst; andere aanvragen vallen buiten niche/provincie. Volgende aanbevolen beheeractie: dienst na inhoudelijke controle kunnen vastleggen, zonder datum of verificatie te vernieuwen.

## Type werk vanuit beheer controleren — 12 september 2026

| ID | Datum | Repo/site | Pagina of bereik | Wat gedaan | Status | Controle | Commit/PR | Live sinds | Vervolg |
|---|---|---|---|---|---|---|---|---|---|
| LG-032 | 2026-09-12 | leadflowv2 | /crm/leadgen; admin.reviewServiceType; marketplaceServiceReviews | Beheerder kan type werk expliciet vastleggen of terugzetten naar onbekend, met verplichte toelichting. Controlehistorie bewaart actor, tijd, voor/na en revisie. Dekking herberekent; laatste controle zichtbaar. Verkochte aanvragen geblokkeerd en gelijktijdige wijzigingen beschermd | Live | 349 volledige regressietests plus 4 gerichte UI-tests na laatste wijziging (350 unieke tests); Convex-TypeScript en Vite-build; geen nieuwe fouten in gewijzigde bestanden bij algemene TypeScriptcheck | PR #23 / 09eefff | 2026-09-12 | Actuele behoefte oude aanvragen bevestigen voordat ze opnieuw worden aangeboden |

De wijziging bewaart alleen serviceType en een revisienummer op de aanvraag, plus een afzonderlijk controlerecord. Aanvraag-/publicatie-/vervaldatum, verificatie, prijzen, bronmetadata en opvolging blijven behouden. Er worden geen meldingen ingepland. Deze actie kan wijzigen welke afnemers een nog gepubliceerde aanvraag zien; dat staat bij het formulier. Een controle van het type werk is geen herbevestiging van de actuele behoefte. Niet-toepasselijke niches en reeds verkochte aanvragen zijn ook serverzijdig geblokkeerd. De algemene TypeScriptcheck bevat nog bestaande fouten buiten dit bereik. Geen echte aanvragen gewijzigd, geen berichten verstuurd en geen SEO-werk uitgevoerd.

Publicatiebevestiging LG-032: Vercel dpl_F9j62Nae4FcWxdcgrBKBmEqRX5g7 READY, productiecommit 09eeffffaac32914c47e4e92f46e967566e3e97e. Liveformulier geopend: Nog onbekend, Installatie, Onderhoud, Reparatie en toelichting zichtbaar; Annuleren getest zonder opslaan. Aanbevolen vervolg: aanvragen met reden op Te beoordelen kunnen zetten en tijdelijk uit verkoop halen, met historie en zonder automatische datumvernieuwing.

## Aanvraag tijdelijk uit verkoop — 12 september 2026

| ID | Datum | Repo/site | Pagina of bereik | Wat gedaan | Status | Controle | Commit/PR | Live sinds | Vervolg |
|---|---|---|---|---|---|---|---|---|---|
| LG-033 | 2026-09-12 | leadflowv2 | /crm/leadgen; admin.reviewSale; marketplaceSaleReviews | Ongekochte beschikbare aanvraag met reden op Te beoordelen zetten; terug aanbieden alleen na expliciete actualiteitscontrole en binnen oorspronkelijke termijn. Historie bewaart actor, tijd, actie en revisie. Verkochte/verouderde wijzigingen geblokkeerd | Live | 355 tests plus gerichte hercontrole van 16 tests; Convex-TypeScript en Vite-build. Pauze blokkeert feed, detail, aankoop en nog niet begonnen afnemermelding; hervatten bewaart datums | PR #25 / b1df40a | 2026-09-12 | Oude aanvragen inhoudelijk behandelen via beheer; maandag sms-/mailcontrole |

De actie wijzigt alleen verkoopstatus, beheer-pauzevlag en revisie. Aanvraag-/publicatie-/vervaldatums, verificatie, prijzen en overige aanvraaggegevens blijven behouden. Hervatten is alleen mogelijk voor een via deze actie gepauzeerde lead, niet voor willekeurige pending_review-aanvragen. Er worden geen berichten of nieuwe termijnen ingepland. Reeds verstuurde of reeds bij de provider aangeboden berichten kunnen niet worden ingetrokken. Bestaande achtergrondopvolging blijft haar eigen regels volgen. Geen echte productieaanvragen aangepast en geen berichten verstuurd. Geen SEO-wijzigingen.

Publicatiebevestiging LG-033: Vercel dpl_BjvaF6StVnfCtFEU1NQXXG4EMFFU READY, productiecommit b1df40a47dc04aa0de992736a235d20763335aa6. Liveformulier geopend: reden, Uit verkoop halen en Annuleren zichtbaar; annuleren sluit zonder opslaan. Alleen-lezen productiecontrole: 13 aanvragen, 12 gepubliceerd, 1 afgewezen, 0 beheer-pauzes en 0 verkoopcontroleregels. Oude voorraad is nog ongewijzigd. Aanbevolen vervolg: oude ongekochte aanvragen tijdelijk op Te beoordelen zetten en de actuele behoefte controleren voordat ze terug in verkoop komen.

## Oude voorraad gepauzeerd en accountrollen — 12 september 2026

| ID | Datum | Repo/site | Pagina of bereik | Wat gedaan | Status | Controle | Commit/PR | Live sinds | Vervolg |
|---|---|---|---|---|---|---|---|---|---|
| LG-034 | 2026-09-12 | leadflowv2 | /crm/leadgen; 12 oude gepubliceerde ongekochte aanvragen | Na expliciet akkoord alle 12 via beheer op Te beoordelen gezet met reden: actuele behoefte nog niet bevestigd. Per aanvraag verkoopcontrolegeschiedenis vastgelegd | Live | Productie: 12 pending_review, 12 pauzevlaggen, 12 controleregels; overige testaanvraag blijft rejected. Geen berichten verstuurd, geen rol- of datumwijzigingen | Bestaande reviewSale uit PR #25 | 2026-09-12 | Actuele behoefte inhoudelijk bevestigen vóór hervatten |
| LG-035 | 2026-09-12 | leadflowv2 | Registratie/rollen-audit; integrations, Meta OAuth callback, crossApp, Meta/WhatsApp-instellingen | Ontbrekende toegangscontroles hersteld; integratiebeheer owner/admin van doelbedrijf; hercontrole bij writes na providerresponse; ontbrekend contact blokkeert suiteverzoek; audit en vervolgplan | Live | 366 volledige tests plus 12 gerichte na extra regressietest (367 uniek), Convex-TypeScript en Vite-build. Algemene TypeScript bevat bestaande fouten buiten bereik; geen fouten in gewijzigde backendbestanden | PR #27 / 6c3680d | 2026-09-12 | Volledig bedrijfsrechtenmodel en geïsoleerde communicatie/bestanden, daarna onboarding |

[Accountrollen-audit](accountrollen-audit-20260912.md): gewone registratie geeft isSuperAdmin=false, geen bedrijf/rol/workspace; owner/admin/member bestaan maar zijn buiten integratiebeheer nog niet overal onderscheiden. Alleen-lezen productie: 2 profielen (beide super-admin), 2 owner-lidmaatschappen in 1 organisatie. Dit is geen telling van alle Clerk-accounts. Geen gebruikersrechten of providerconfiguratie gewijzigd. Nieuwe bedrijven nog niet automatisch toegelaten. Providerverkeer uitsluitend gesimuleerd. Geen SEO-wijzigingen.

Publicatiebevestiging LG-035: Vercel dpl_48Qvg8wXqVAN2DBjKerAGxWW9CGh READY, productiecommit 6c3680d9496caed8c8d91f7a7dc23faed2e83393. Live: 12 hervatknoppen en 0 pauzeerknoppen in Leadgenbeheer; beheerder kan Meta-status lezen. Twee anonieme queryverzoeken (leadgenbronnen en Meta-status) leveren geen gegevens en worden geweigerd; productiefoutdetails zijn afgeschermd. Autorisatieoorzaken en owner/admin/member-scheiding afzonderlijk geverifieerd met regressietests. Geen echte koppeling of bericht uitgevoerd. Openstaande aandachtspunten en aanbevolen rechtenmodel staan in de accountrollen-audit.

## Centrale bedrijfsrechten — 12 september 2026

| ID | Datum | Repo/site | Pagina of bereik | Wat gedaan | Status | Controle | Commit/PR | Live sinds | Vervolg |
|---|---|---|---|---|---|---|---|---|---|
| LG-036 | 2026-09-12 | leadflowv2 | Centrale CRM- en marketplace-rechten; instellingen/workflows/campagnes/pipelines/sidebar; koop-/opwaardeer-/voorkeurroute; beide afbeeldingsuploaders | Centrale bedrijfscontrole; member voor dagelijks CRM, owner/admin voor beheer en aankoop. Afbeeldingen aan bedrijf gekoppeld; vreemde pipeline/segment en verkeerde marketplace-workspace geweigerd. Productrichting CRM + Marketing + Leadmarktplaats vastgelegd | Live | 381 tests in 42 bestanden; twee fictieve bedrijven, autorisatie, uploads en providerblokkade; Convex-TypeScript en productiebuild. Algemene TypeScript alleen bestaande diagnostiek | PR #29 / 9504dc8 | 2026-09-12 | Communicatie/agenda per bedrijf, daarna eigen bedrijfsregistratie en uitnodigingen |

[Rechtencontract en exact bereik](bedrijfsrechten-20260912.md); [productrichting](../product/leadflow-platform.md). Bedrijfsrollen blijven organisatiebreed; geen privacygrens tussen workspaces binnen dezelfde organisatie. Mailafbeeldingen blijven publiek voor mailontvangers en zijn geen private bijlagen. Geen echte productieaccounts, rollen, uploads, berichten of betalingen veranderd. Oude 12 aanvragen blijven op Te beoordelen. Geen SEO-werk. Selfservice-bedrijfsregistratie blijft nog gesloten zolang gedeelde providerinstellingen niet zijn gescheiden.

Publicatiebevestiging LG-036: Vercel dpl_8kDWjCmNFUHnNov9YgRbZibqoKKz READY, productiecommit 9504dc8259e81acf8164f4f40ac2ceb1ec06fc57. Live alleen-lezen gecontroleerd: Leadgenbeheer laadt, CRM-instellingen bereikbaar en pipelinebeheer toont hernoemen en nieuwe opportunity voor de bestaande owner. Medewerker- en tweede-bedrijfsscenario's met fictieve testgegevens gecontroleerd. Productie blijft 2 owner-lidmaatschappen in 1 organisatie; 12 aanvragen pending_review/gepauzeerd en 1 rejected. Geen echte berichten, aankopen of uploads uitgevoerd. Vervolg: bedrijfsgebonden communicatie en koppelingen voordat externe bedrijfsregistratie wordt geopend.

## Bedrijfscommunicatie: legacy-providers afschermen — 12 september 2026

| ID | Datum | Repo/site | Pagina of bereik | Wat gedaan | Status | Controle | Commit/PR | Live sinds | Vervolg |
|---|---|---|---|---|---|---|---|---|---|
| LG-037 | 2026-09-12 | leadflowv2 | /crm/settings; companyProviders; messaging; broadcasts; googleCalendar; crossApp; WhatsApp-beheer/bewaking | Bestaande provideraccounts expliciet aan Staycool gebonden; andere bedrijven geblokkeerd voor externe communicatie. Exacte WhatsApp-sessie; statusoverzicht zonder secrets | Live | 393 tests/43 bestanden; Convex-TypeScript en productiebuild; algemene TypeScript bestaande diagnostiek | PR #31 / 436b5a8 | 2026-09-12 | Inkomende providerberichten per bedrijf routeren, daarna eigen credentials/afzenders en selfservice |

[Exact bereik en beperkingen](bedrijfscommunicatie-20260912.md). Dit is de eerste isolatiestap; nieuwe bedrijven kunnen nog geen eigen provideraccounts activeren. Geen productiecredentials gewijzigd of berichten verstuurd. Geen SEO-wijzigingen. Platformverificatie en marketplace-meldingen blijven platformcommunicatie. Bedrijfsregistratie blijft gesloten tot inkomende en uitgaande communicatie compleet zijn gescheiden.

Publicatiebevestiging LG-037: Vercel dpl_BcgVyEZnRdJpj5Y5dPvAvGPPcm6T READY, commit 436b5a81f155ff21a00c5e5e82e9d50afac33950. Live /crm/settings toont Communicatie voor jouw bedrijf en configuratie aanwezig voor e-mail, SMS, WhatsApp, agenda en suite. Alleen-lezen controle; geen echte verzending of koppeling uitgevoerd. Vervolg: inkomende berichten en delivery receipts aan bedrijf/provider koppelen voordat eigen accounts voor nieuwe bedrijven actief worden.
