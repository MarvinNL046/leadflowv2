# Leadgen — lokale repo's en intake

Gecontroleerd: 12 september 2026. Bron: lokale Git-status, GitHub-branchkoppen via ls-remote, formuliercode, Vercel-productieconfiguratie en beperkte read-only Convex-controle.

## Uitkomst

- 49 bestaande repo's gevonden in de leadgenmap; vindaircomonteur-v2 is daarna toegevoegd. Nu 50 lokale repo's in deze map.
- Indeling op reponaam: Airco: 24; Directories / overige: 11; Vakmannen: 15. De map bevat ook directories en andere sites; niet alles is een offertepagina.
- Van de 49 oorspronkelijke clones zijn 48 commitkoppen gelijk aan GitHub. staycoolairconL is een oudere kopie.
- Skilllinkup heeft 148 bestaande gewijzigde/toegevoegde bestanden. Deze zijn niet aangepast.
- Bij de eerste inventarisatie had alleen Skilllinkup node_modules in deze leadgenmap. Inmiddels zijn ook de dependencies van vindaircomonteur-v2 geïnstalleerd. Leadflowv2 heeft zijn dependencies al.
- Gebruik voor Staycool de recentere clone: C:/Users/M_Smi/Documents/Codex/2026-09-10/hoi/outputs/staycoolairco/staycoolairco.nl (commit b4d634f, 2026-09-10).
- Vercel-project vindaircomonteur verwijst naar MarvinNL046/vindaircomonteur-v2, niet naar de oudere vindaircomonteur-repo. De juiste repo is nu lokaal gecloned.

## Werkmappen

Leadgenmap: C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen

LeadFlow v2: C:/Users/M_Smi/Documents/Codex/2026-09-07/hoi/outputs/leadflowv2

Ook aanwezig naast LeadFlow: wetry, frostwork-crm, wetrycashflow en aanmelden.staycoolairco.nl. Voor die andere apps is geen actuele remote-vergelijking gedaan. De lokale scan bestreek repos, Documents, Desktop en Codex-worktrees; niet alle schijven of OneDrive.

## Waar komen leads binnen?

1. **Vindaircomonteur draait al op v2.** De productievariabele LEADFLOW_BASE_URL in Vercel-project vindaircomonteur is https://vibrant-wildebeest-329.eu-west-1.convex.site. De API-key is aanwezig. Een actieve bronsleutel en een gepubliceerde, telefonisch bevestigde aanvraag van 3 augustus 2026 zijn in v2 aangetroffen. De bron is home:vindaircomonteur.nl. De oude standaard-URL in de broncode was dus geen bewijs voor de live bestemming.
2. **Opslag:** wizard-start schrijft leadVerifications. Na correcte code komt de aanvraag in marketplaceLeads. De beperkte read-only controle vond 46 bronsleutels en 12 opgeslagen marketplaceLeads (maximaal 30 opgevraagd). Dit is geen volledige analyse van conversie of afleverbaarheid.
3. **Beheer:** LeadFlow v2 staat op https://leadflow.wetry.app. Nieuw lokaal toegevoegd: /crm/leadgen, via sidebar → Leadgenbeheer → Binnengekomen leads. Super-admins zien bronnen, contactgegevens, verificatie, melding en opvolging. /feed blijft de afnemersfeed met filters en gemaskeerde gegevens. Directe CRM-webhookleads staan apart bij contacten/pipelines.
4. **Andere sites:** 23 oorspronkelijke clones verwijzen in de code naar wetryleadflow.com/api/webhooks/leads; 14 naar de wizard met een overschrijfbare v1-standaard; één naar Convex. Voor 11 clones werd geen intake vastgesteld. De productie-instellingen van deze overige sites zijn nog niet afzonderlijk gecontroleerd. Het repo-overzicht hieronder is de initiële codescan, geen bevestiging van alle live bestemmingen.

De v1-websitewebhook gaf bij de healthcheck een gezond antwoord. Er is geen migratie of synchronisatie tussen v1 en v2 uitgevoerd. Productie is alleen gelezen; er zijn geen formulieren ingestuurd, berichten verstuurd of productiegegevens gewijzigd. De nieuwe code is lokaal gebouwd en met gesimuleerde berichtproviders getest; publicatie staat nog open.

## Repo-overzicht

Git-commitdatum is technische historie en betekent niet dat een pagina inhoudelijk is verbeterd. Daarvoor gebruiken we het aparte werklog.

| Repo | Groep | Framework | Branch | Lokale wijzigingen | GitHub-vergelijking | Intake volgens code | Laatste commit |
|---|---|---|---|---|---|---|---|
| [airco_offertelimburg](https://github.com/MarvinNL046/airco_offertelimburg) | Airco | next, react | main | Geen | Gelijk aan GitHub | Marketplace-wizard (standaard v1; env kan afwijken) | e9f6061 2026-04-24 feat(seo): 5 cluster pages — prijzen, kosten, gids, vergelijk |
| [aircobedrijflimburg.nl](https://github.com/MarvinNL046/aircobedrijflimburg.nl) | Airco | vite, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | d22ea1f 2026-04-11 Add Google Analytics 4 tracking |
| [aircoinstallateurlimburg.nl](https://github.com/MarvinNL046/aircoinstallateurlimburg.nl) | Airco | vite, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | 7b8ff78 2026-04-11 Add Google Analytics 4 tracking |
| [aircoinstallatie-echt-susteren](https://github.com/MarvinNL046/aircoinstallatie-echt-susteren) | Airco | next, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | a485810 2026-04-11 Add Google Analytics 4 tracking |
| [aircoinstallatie-maastricht](https://github.com/MarvinNL046/aircoinstallatie-maastricht) | Airco | next, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | cfe7060 2026-04-11 Add Google Analytics 4 tracking |
| [aircoinstallatie-sittard-geleen](https://github.com/MarvinNL046/aircoinstallatie-sittard-geleen) | Airco | next, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | dc0a464 2026-02-20 Add LeadFlow webhook, remove GHL, add redirect to tot-snel |
| [aircoinstallatiebrunssum.nl](https://github.com/MarvinNL046/aircoinstallatiebrunssum.nl) | Airco | next, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | e88684c 2026-04-11 Add Google Analytics 4 tracking |
| [aircoinstallatiegeleen.nl](https://github.com/MarvinNL046/aircoinstallatiegeleen.nl) | Airco | next, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | 0e54d6b 2026-04-11 Add Google Analytics 4 tracking |
| [aircoinstallatieheerlen.nl](https://github.com/MarvinNL046/aircoinstallatieheerlen.nl) | Airco | next, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | 2e59294 2026-04-11 Add Google Analytics 4 tracking |
| [aircoinstallatiekerkrade.nl](https://github.com/MarvinNL046/aircoinstallatiekerkrade.nl) | Airco | next, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | 8888adc 2026-04-11 Add Google Analytics 4 tracking |
| [aircoinstallatielandgraaf.nl](https://github.com/MarvinNL046/aircoinstallatielandgraaf.nl) | Airco | next, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | dd6a21d 2026-04-11 Add Google Analytics 4 tracking |
| [aircoinstallatieroermond.nl](https://github.com/MarvinNL046/aircoinstallatieroermond.nl) | Airco | next, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | bb6825e 2026-04-11 Add Google Analytics 4 tracking |
| [aircoinstallatiesittard.nl](https://github.com/MarvinNL046/aircoinstallatiesittard.nl) | Airco | next, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | 215f05d 2026-04-11 Add Google Analytics 4 tracking |
| [aircoinstallatieweert.nl](https://github.com/MarvinNL046/aircoinstallatieweert.nl) | Airco | next, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | 98d5751 2026-04-11 Add Google Analytics 4 tracking |
| [aircolimburgaanbieding.nl](https://github.com/MarvinNL046/aircolimburgaanbieding.nl) | Airco | vite | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | 67a4ff3 2026-04-11 Add Google Analytics 4 tracking |
| [aircomontagelimurg.nl](https://github.com/MarvinNL046/aircomontagelimurg.nl) | Airco | vite | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | 197a3e0 2026-04-11 Add Google Analytics 4 tracking |
| [aircovergelijkenlimburg.nl](https://github.com/MarvinNL046/aircovergelijkenlimburg.nl) | Airco | next, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | a298f7c 2026-04-11 Add Google Analytics 4 tracking |
| [begraafplaatsindebuurt-whitelabel](https://github.com/MarvinNL046/begraafplaatsindebuurt-whitelabel) | Directories / overige | next, react | main | Geen | Gelijk aan GitHub | Niet vastgesteld in deze code-scan | a793431 2026-08-24 Stop the sitemap builder template teaching lastModified: new Date() (#1) |
| [begraafplaatsindebuurt.nl](https://github.com/MarvinNL046/begraafplaatsindebuurt.nl) | Directories / overige | next, react | main | Geen | Gelijk aan GitHub | Niet vastgesteld in deze code-scan | 84a275b 2026-08-24 Sitemap index: newest content date per sub-sitemap, not the request time (#2) |
| [cemeterynearbyme](https://github.com/MarvinNL046/cemeterynearbyme) | Directories / overige | next, react | main | Geen | Gelijk aan GitHub | Niet vastgesteld in deze code-scan | 5ecd679 2026-07-20 Merge: vervang Neon Postgres door statische JSON-datalaag |
| [cutiepawspedia.com](https://github.com/MarvinNL046/cutiepawspedia.com) | Directories / overige | next, react | main | Geen | Gelijk aan GitHub | Niet vastgesteld in deze code-scan | 9fb4bfc 2026-04-11 Add Google Analytics 4 tracking |
| [Daikin-Airco-Limburg](https://github.com/MarvinNL046/Daikin-Airco-Limburg) | Airco | vite, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | e64a429 2026-04-11 Add Google Analytics 4 tracking |
| [dentistnearmenow.com](https://github.com/MarvinNL046/dentistnearmenow.com) | Directories / overige | next, react | main | Geen | Gelijk aan GitHub | Niet vastgesteld in deze code-scan | 8251441 2026-07-20 Merge: vervang Neon Postgres door statische JSON-datalaag |
| [kinderopvang-indebuurt.nl](https://github.com/MarvinNL046/kinderopvang-indebuurt.nl) | Directories / overige | next, react | main | Geen | Gelijk aan GitHub | Niet vastgesteld in deze code-scan | 1028279 2026-08-28 Allow initial IndexNow key deployment |
| [lgaircolimburg](https://github.com/MarvinNL046/lgaircolimburg) | Airco | vite, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | ba77ffa 2026-04-11 Add Google Analytics 4 tracking |
| [limburgseaircodeals.nl](https://github.com/MarvinNL046/limburgseaircodeals.nl) | Airco | next, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | 198ef95 2026-04-11 Add Google Analytics 4 tracking |
| [mitsubishiaircolimburg](https://github.com/MarvinNL046/mitsubishiaircolimburg) | Airco | vite, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | bfac851 2026-04-11 Add Google Analytics 4 tracking |
| [rehabnearbyme](https://github.com/MarvinNL046/rehabnearbyme) | Directories / overige | next, react | main | Geen | Gelijk aan GitHub | Niet vastgesteld in deze code-scan | 2e9387d 2026-01-18 Initial commit: RehabNearMe.com - US Treatment Center Directory |
| [seniorcarenearbyme](https://github.com/MarvinNL046/seniorcarenearbyme) | Directories / overige | next, react | master | Geen | Gelijk aan GitHub | Niet vastgesteld in deze code-scan | 6489d57 2026-01-18 Fix PostCSS config for Tailwind v3 compatibility |
| [Skilllinkup](https://github.com/MarvinNL046/Skilllinkup) | Directories / overige | next, react | main | 148 bestanden | Gelijk aan GitHub | Niet vastgesteld in deze code-scan | 7236e0f 2026-09-09 Update vulnerable dependencies before release |
| [staycoolairconL](https://github.com/MarvinNL046/staycoolairconL) | Airco | vite, react | main | Geen | Verschilt van GitHub | CRM v2 / Convex | ca8d981 2026-08-24 Stop the sitemap builder template teaching lastModified: new Date() (#5) |
| [storageunitsnearbyme](https://github.com/MarvinNL046/storageunitsnearbyme) | Directories / overige | next, react | master | Geen | Gelijk aan GitHub | Niet vastgesteld in deze code-scan | 6456b00 2026-01-18 Fix PostCSS config for Tailwind v3 compatibility |
| [toshibaaircolimburg](https://github.com/MarvinNL046/toshibaaircolimburg) | Airco | vite, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | 4f3fb0f 2026-04-11 Add Google Analytics 4 tracking |
| [tosotaircolimburg](https://github.com/MarvinNL046/tosotaircolimburg) | Airco | vite, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | e966298 2026-04-11 Add Google Analytics 4 tracking |
| [vind-aannemer](https://github.com/MarvinNL046/vind-aannemer) | Vakmannen | next, react | main | Geen | Gelijk aan GitHub | Marketplace-wizard (standaard v1; env kan afwijken) | c348221 2026-04-23 feat(ui): shiny-btn shimmer on primary CTAs |
| [vindaircomonteur](https://github.com/MarvinNL046/vindaircomonteur) | Vakmannen | next, react | main | Geen | Gelijk aan GitHub | CRM v1 / website-webhook | 179f914 2026-02-20 Add LeadFlow webhook, remove GHL, add redirect to tot-snel |
| [vindaircomonteur-v2](https://github.com/MarvinNL046/vindaircomonteur-v2) | Vakmannen | next, react | main | Geen | Nieuw gecloned op 2026-09-12 | Wizard naar v2 (productie-env bevestigd) | 3594014 2026-08-18 Turn the thank-you page into the peak of the funnel (W34) |
| [vindcvmonteur](https://github.com/MarvinNL046/vindcvmonteur) | Vakmannen | next, react | main | Geen | Gelijk aan GitHub | Marketplace-wizard (standaard v1; env kan afwijken) | 6a7aaf7 2026-04-24 feat(seo): high-intent spoed/storing cluster page |
| [vinddakdekker](https://github.com/MarvinNL046/vinddakdekker) | Vakmannen | next, react | main | Geen | Gelijk aan GitHub | Marketplace-wizard (standaard v1; env kan afwijken) | 614f16b 2026-04-23 feat(ui): shiny-btn shimmer on primary CTAs |
| [vindelektricien](https://github.com/MarvinNL046/vindelektricien) | Vakmannen | next, react | main | Geen | Gelijk aan GitHub | Marketplace-wizard (standaard v1; env kan afwijken) | f9eca72 2026-04-24 feat(seo): 5 cluster pages — spoed, installatiewerk, keuring, kiezen |
| [vindglaszetter](https://github.com/MarvinNL046/vindglaszetter) | Vakmannen | next, react | main | Geen | Gelijk aan GitHub | Marketplace-wizard (standaard v1; env kan afwijken) | 4e462f6 2026-04-23 feat(ui): shiny-btn shimmer on primary CTAs |
| [vindlaadpaalinstallateur](https://github.com/MarvinNL046/vindlaadpaalinstallateur) | Vakmannen | next, react | main | Geen | Gelijk aan GitHub | Marketplace-wizard (standaard v1; env kan afwijken) | 8ce0111 2026-04-24 feat(seo): 5 cluster pages — thuis, zakelijk, vve, merken, meterkast |
| [vindlaadpaalmonteur](https://github.com/MarvinNL046/vindlaadpaalmonteur) | Vakmannen | next, react | main | Geen | Gelijk aan GitHub | Marketplace-wizard (standaard v1; env kan afwijken) | 7529a87 2026-04-23 feat(ui): shiny-btn shimmer on primary CTAs |
| [vindloodgieter](https://github.com/MarvinNL046/vindloodgieter) | Vakmannen | next, react | main | Geen | Gelijk aan GitHub | Marketplace-wizard (standaard v1; env kan afwijken) | 9c9acf7 2026-04-24 feat(seo): high-intent spoed/storing cluster page |
| [vindrioolservice](https://github.com/MarvinNL046/vindrioolservice) | Vakmannen | next, react | main | Geen | Gelijk aan GitHub | Marketplace-wizard (standaard v1; env kan afwijken) | 7da7065 2026-04-24 feat(seo): high-intent spoed/storing cluster page |
| [vindschoorsteenveger](https://github.com/MarvinNL046/vindschoorsteenveger) | Vakmannen | next, react | main | Geen | Gelijk aan GitHub | Marketplace-wizard (standaard v1; env kan afwijken) | 64b628f 2026-04-23 feat(ui): shiny-btn shimmer on primary CTAs |
| [vindslotenmaker](https://github.com/MarvinNL046/vindslotenmaker) | Vakmannen | next, react | main | Geen | Gelijk aan GitHub | Marketplace-wizard (standaard v1; env kan afwijken) | f5cd449 2026-04-24 feat(seo): high-intent spoed/storing cluster page |
| [vindstukadoor](https://github.com/MarvinNL046/vindstukadoor) | Vakmannen | next, react | main | Geen | Gelijk aan GitHub | Marketplace-wizard (standaard v1; env kan afwijken) | 27143d8 2026-04-23 feat(ui): shiny-btn shimmer on primary CTAs |
| [vindtandarts.nl](https://github.com/MarvinNL046/vindtandarts.nl) | Directories / overige | next, react | main | Geen | Gelijk aan GitHub | Niet vastgesteld in deze code-scan | 521b855 2026-08-28 Allow initial IndexNow key deployment |
| [vindtimmerman](https://github.com/MarvinNL046/vindtimmerman) | Vakmannen | next, react | main | Geen | Gelijk aan GitHub | Marketplace-wizard (standaard v1; env kan afwijken) | b4d6afd 2026-04-23 feat(ui): shiny-btn shimmer on primary CTAs |

## Vindplaatsen in de code

| Repo | Lokaal pad | Intakebestanden (actieve broncode, geen archief/bundels) |
|---|---|---|
| airco_offertelimburg | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\airco_offertelimburg | src/app/api/lead/send-code/route.ts, src/app/api/lead/start/route.ts, src/app/api/lead/verify/route.ts |
| aircobedrijflimburg.nl | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\aircobedrijflimburg.nl | src/utils/email.ts |
| aircoinstallateurlimburg.nl | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\aircoinstallateurlimburg.nl | src/utils/email.ts |
| aircoinstallatie-echt-susteren | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\aircoinstallatie-echt-susteren | utils/email.ts |
| aircoinstallatie-maastricht | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\aircoinstallatie-maastricht | utils/email.ts |
| aircoinstallatie-sittard-geleen | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\aircoinstallatie-sittard-geleen | lib/email.ts |
| aircoinstallatiebrunssum.nl | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\aircoinstallatiebrunssum.nl | lib/emailjs.ts |
| aircoinstallatiegeleen.nl | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\aircoinstallatiegeleen.nl | lib/email-dual.ts |
| aircoinstallatieheerlen.nl | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\aircoinstallatieheerlen.nl | lib/email.ts |
| aircoinstallatiekerkrade.nl | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\aircoinstallatiekerkrade.nl | utils/email.ts |
| aircoinstallatielandgraaf.nl | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\aircoinstallatielandgraaf.nl | lib/email.ts |
| aircoinstallatieroermond.nl | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\aircoinstallatieroermond.nl | lib/emailjs.ts |
| aircoinstallatiesittard.nl | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\aircoinstallatiesittard.nl | lib/emailjs.ts |
| aircoinstallatieweert.nl | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\aircoinstallatieweert.nl | src/utils/email.ts |
| aircolimburgaanbieding.nl | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\aircolimburgaanbieding.nl | assets/js/main.js, assets/js/utils/email.js |
| aircomontagelimurg.nl | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\aircomontagelimurg.nl | js/main.js |
| aircovergelijkenlimburg.nl | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\aircovergelijkenlimburg.nl | src/utils/email.ts |
| begraafplaatsindebuurt-whitelabel | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\begraafplaatsindebuurt-whitelabel | Geen match in deze scan |
| begraafplaatsindebuurt.nl | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\begraafplaatsindebuurt.nl | Geen match in deze scan |
| cemeterynearbyme | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\cemeterynearbyme | Geen match in deze scan |
| cutiepawspedia.com | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\cutiepawspedia.com | Geen match in deze scan |
| Daikin-Airco-Limburg | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\Daikin-Airco-Limburg | src/utils/email.ts |
| dentistnearmenow.com | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\dentistnearmenow.com | Geen match in deze scan |
| kinderopvang-indebuurt.nl | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\kinderopvang-indebuurt.nl | Geen match in deze scan |
| lgaircolimburg | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\lgaircolimburg | src/utils/email.ts |
| limburgseaircodeals.nl | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\limburgseaircodeals.nl | lib/emailjs.ts |
| mitsubishiaircolimburg | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\mitsubishiaircolimburg | src/utils/email-webhook.ts, src/utils/email.ts |
| rehabnearbyme | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\rehabnearbyme | Geen match in deze scan |
| seniorcarenearbyme | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\seniorcarenearbyme | Geen match in deze scan |
| Skilllinkup | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\Skilllinkup | Geen match in deze scan |
| staycoolairconL | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\staycoolairconL | src/utils/email.ts |
| storageunitsnearbyme | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\storageunitsnearbyme | Geen match in deze scan |
| toshibaaircolimburg | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\toshibaaircolimburg | src/utils/email.ts |
| tosotaircolimburg | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\tosotaircolimburg | src/utils/email.ts |
| vind-aannemer | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\vind-aannemer | src/app/api/lead/send-code/route.ts, src/app/api/lead/start/route.ts, src/app/api/lead/verify/route.ts |
| vindaircomonteur | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\vindaircomonteur | app/api/contact/route.ts |
| vindaircomonteur-v2 | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\vindaircomonteur-v2 | src/app/api/lead/start/route.ts |
| vindcvmonteur | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\vindcvmonteur | src/app/api/lead/send-code/route.ts, src/app/api/lead/start/route.ts, src/app/api/lead/verify/route.ts |
| vinddakdekker | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\vinddakdekker | src/app/api/lead/send-code/route.ts, src/app/api/lead/start/route.ts, src/app/api/lead/verify/route.ts |
| vindelektricien | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\vindelektricien | src/app/api/lead/send-code/route.ts, src/app/api/lead/start/route.ts, src/app/api/lead/verify/route.ts |
| vindglaszetter | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\vindglaszetter | src/app/api/lead/send-code/route.ts, src/app/api/lead/start/route.ts, src/app/api/lead/verify/route.ts |
| vindlaadpaalinstallateur | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\vindlaadpaalinstallateur | src/app/api/lead/send-code/route.ts, src/app/api/lead/start/route.ts, src/app/api/lead/verify/route.ts |
| vindlaadpaalmonteur | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\vindlaadpaalmonteur | src/app/api/lead/send-code/route.ts, src/app/api/lead/start/route.ts, src/app/api/lead/verify/route.ts |
| vindloodgieter | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\vindloodgieter | src/app/api/lead/send-code/route.ts, src/app/api/lead/start/route.ts, src/app/api/lead/verify/route.ts |
| vindrioolservice | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\vindrioolservice | src/app/api/lead/send-code/route.ts, src/app/api/lead/start/route.ts, src/app/api/lead/verify/route.ts |
| vindschoorsteenveger | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\vindschoorsteenveger | src/app/api/lead/send-code/route.ts, src/app/api/lead/start/route.ts, src/app/api/lead/verify/route.ts |
| vindslotenmaker | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\vindslotenmaker | src/app/api/lead/send-code/route.ts, src/app/api/lead/start/route.ts, src/app/api/lead/verify/route.ts |
| vindstukadoor | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\vindstukadoor | src/app/api/lead/send-code/route.ts, src/app/api/lead/start/route.ts, src/app/api/lead/verify/route.ts |
| vindtandarts.nl | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\vindtandarts.nl | Geen match in deze scan |
| vindtimmerman | C:\Users\M_Smi\Documents\Codex\2026-09-07\hoi\outputs\leadgen\vindtimmerman | src/app/api/lead/send-code/route.ts, src/app/api/lead/start/route.ts, src/app/api/lead/verify/route.ts |

## Primaire bronnen

- https://github.com/MarvinNL046/wetryleadflow/blob/main/src/app/api/webhooks/leads/route.ts
- https://github.com/MarvinNL046/wetryleadflow/blob/main/src/app/api/intake/wizard/start/route.ts
- https://github.com/MarvinNL046/wetryleadflow/blob/main/src/app/api/intake/wizard/verify/route.ts
- https://github.com/MarvinNL046/wetryleadflow/blob/main/src/app/admin/marketplace/page.tsx
- https://github.com/MarvinNL046/leadflowv2/blob/main/convex/http.ts
- https://github.com/MarvinNL046/leadflowv2/blob/main/convex/websiteLeads.ts
- https://github.com/MarvinNL046/leadflowv2/blob/main/convex/marketplace/intake.ts
- https://github.com/MarvinNL046/vindaircomonteur-v2/blob/main/src/app/api/lead/start/route.ts
