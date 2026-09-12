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
