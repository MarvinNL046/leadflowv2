# Staycool-pilot — 12 september 2026

De afnemersinstellingen en verkoopverbeteringen zijn gepubliceerd via [PR #16](https://github.com/MarvinNL046/leadflowv2/pull/16), productiecommit `3638e9716885d6f263d135fd9c223f78c7937629`. Vercel-productiedeployment `dpl_5T9FWESUTkxm4MFisVAjxoNHNv5E` is READY; de productiehelpers zijn daarna succesvol uitgevoerd en uit de database teruggelezen.

## Gedaan

- Staycool Airconditioning: airco, installeren, heel Limburg, particulier en zakelijk; beide aankoopvormen. Dit werkgebied en drie kopers totaal zijn expliciet door Marvin bevestigd.
- [Werkgebied en meldingen](https://leadflow.wetry.app/feed/settings) staat in de sidebar. De livepagina toont Airco, Installeren en Limburg geselecteerd, beide aankoopvormen en e-mailmeldingen aan.
- Nieuwe passende gepubliceerde leads kunnen naar het geregistreerde eigenaaradres info@staycoolairco.nl worden gemeld. De mail bevat dienst, plaats, prijzen en een link; geen consumentcontactgegevens. De verzendroute gebruikt een vast bericht, idempotentie en maximaal drie pogingen. Provideracceptatie is geen bewijs van inboxontvangst.
- Gedeeld: maximaal drie kopers totaal. Exclusief: via LeadFlow alleen aan die koper verkocht. Na de eerste gedeelde aankoop vervalt de exclusieve optie; een exclusieve aankoop sluit andere kopers uit.
- Twaalf bestaande gepubliceerde, ongekochte aanvragen aangepast van vier naar drie kopers. Prijzen, dienstclassificatie en vervaldatum zijn aantoonbaar behouden. De afgewezen testaanvraag is buiten deze wijziging gebleven.
- Nieuwe expliciete airco-installatieaanvragen krijgen na 24 uur zonder koper een opvolgvlag in [Leadgenbeheer](https://leadflow.wetry.app/crm/leadgen). De controle loopt elke vijf minuten. Dit is een waarschuwing in het beheer, geen herinneringsmail.

## Wanneer verloopt een lead?

Een lead met een ingestelde vervaldatum is vanaf dat tijdstip niet meer te koop. De achtergrondcontrole zet daarna ook de status op verlopen. Een opvolgvlag na 24 uur is geen vervaldatum. Uitverkocht, exclusief verkocht en afgewezen zijn aparte redenen waarom een aanvraag niet meer te koop is.

Automatisch verlopen staat voorlopig uit: de keuze tussen zeven dagen, veertien dagen of uit staat nog open. Een gekozen termijn zal voor nieuwe publicaties gelden. Bestaande oude aanvragen krijgen geen nieuwe verkooptermijn en moeten apart op actualiteit worden beoordeeld.

## Controle en grenzen

305 tests in 35 bestanden geslaagd; Convex-TypeScriptcontrole en Vite-productiebuild geslaagd. Dit omvat matching, filterwissen, lege provincieselectie, expliciete e-mailactivering, dubbele verzending, crashherstel, verlopen voor verzending, drie kopers en blokkering van de vierde, aankoop naar CRM en de nieuwe instellingeninterface. De algemene repository-TypeScriptcontrole meldt bestaande fouten buiten dit bereik.

Na productieconfiguratie: twaalf aanvragen met verkoopmaximum drie, nul aankopen, nul afnemermeldingen en Staycool-tegoed €0. Bestaande aanvragen zijn niet opnieuw gemaild. Betalingen staan nog in testmodus; de commerciële betaalroute is daarom nog niet operationeel. Geen echte aankoop, betaling, SMS of testmail uitgevoerd in deze ronde.

## Open en aanbevolen vervolg

1. Verkooptermijn kiezen; voorstel blijft zeven dagen voor nieuwe installatieaanvragen, met opvolging na één dag.
2. Oude aanvragen handmatig beoordelen op actualiteit en dienst; aanvragen zonder bekende dienst vallen buiten Staycools specifieke installatiefilter.
3. Maandag met de ingeschakelde SMS-telefoon de afgesproken verificatietest afronden en bij de volgende passende aanvraag de echte afnemermailontvangst controleren.
4. Voor commerciële ingebruikname betaalmodus en tegoed regelen en daarna de volledige aankooproute gecontroleerd doorlopen.

Geen SEO-pagina's gewijzigd; deze ronde betreft de afnemers- en verkooproute. Het doorlopende overzicht staat in [werklog.md](werklog.md), regels LG-025 t/m LG-028.
