# Bedrijfsregistratie, team en uitleg bij webhooksignalen

Datum: 12 september 2026. Bereik LG-043.

## Bedrijfsregistratie

`/aan-de-slag` biedt accounts zonder bedrijf een uitnodiging of eigen bedrijfsomgeving. Aanmaken vereist een geverifieerd e-mailadres uit de actuele identiteit. De server maakt atomair een organisatie, standaardwerkruimte, eigenaarlidmaatschap en verkooppipeline met vijf fasen. Geen platformbeheer, marketplace-toelating, tegoed of providerkoppeling wordt toegekend. Een account kan voorlopig slechts aan één bedrijf zijn gekoppeld.

## Teambeheer

`/crm/settings/team` is bereikbaar vanuit Instellingen. Eigenaren kunnen bedrijfsbeheerders en medewerkers uitnodigen; bedrijfsbeheerders alleen medewerkers. De ontvanger moet met exact het uitgenodigde, geverifieerde e-mailadres inloggen. Codes zijn willekeurig, eenmaal bruikbaar, zeven dagen geldig, en uitsluitend als SHA-256-hash opgeslagen. De code wordt eenmalig getoond; de eigenaar deelt deze zelf. Er wordt geen uitnodigingsmail verzonden.

Acceptatie controleert opnieuw de actuele rechten van de uitnodiger, geldige bedrijfsomgeving, verloopdatum, status en het ontvangeradres. Maximaal vijftig open uitnodigingen en honderd teamleden. Een vervangende code trekt de vorige in. Toegang intrekken verwijdert lidmaatschappen van dat lid binnen het betreffende bedrijf; CRM-gegevens blijven bestaan. Eigenaren en het eigen lidmaatschap kunnen niet worden verwijderd. Organisatierollen gelden voor het hele bedrijf, niet alleen een werkruimte.

De bedrijfshandleiding is uitgebreid met registratie en teambeheer; medewerkers kunnen de handleiding lezen. Een bedrijfsswitcher, eigendomsoverdracht en automatische uitnodigingsmail zijn nog niet beschikbaar. Het intrekken van toegang annuleert geen eerder ingestelde bedrijfsautomatiseringen.

## Webhooksignalen

`/crm/webhook-signalen` toont per kanaal en oorzaak een infobox met uitleg, providerbron, onderzoekstappen en links naar de provider en CRM-berichten. Enkelvoud is gecorrigeerd naar “1 melding”. Tijdstippen worden als Amsterdamse registratietijd uitgelegd. Een telling kan herhaalde webhookpogingen omvatten en is geen aantal unieke leads.

De bestaande opslag bevat geen gebeurtenis-ID, bericht-ID of berichtinhoud. Daarom kan de bestaande e-mailmelding niet rechtstreeks naar de oorspronkelijke mail worden gelinkt. Mogelijke oorzaken zijn expliciet hypotheses; de telling bewijst geen bezorgfout of verloren lead. Het overzicht is platformbreed; de CRM-link respecteert de huidige bedrijfsrechten. Er is geen productiecontrole vastgelegd en geen melding gewist.

## Validatie

471 tests in 50 bestanden geslaagd, inclusief 12 nieuwe tests voor registratie, rolgrenzen, verkeerde ontvanger, verlopen/ingetrokken/hergebruikte uitnodigingen, verwijderde uitnodiger en bedrijfsscheiding. Convex-TypeScript en Vite-build geslaagd. Algemene TypeScript-controle heeft uitsluitend dezelfde genormaliseerde diagnostiek als de bestaande baseline. Geen echte accounts aangemaakt, uitnodigingen verzonden, rechten gewijzigd of providerberichten verstuurd tijdens verificatie.

Publicatie en alleen-lezen livecontrole worden apart in het werklog bevestigd.
