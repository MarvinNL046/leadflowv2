# Bedrijfscommunicatie: eerste isolatiestap — 12 september 2026

De bestaande deployment-credentials zijn expliciet gebonden aan de bestaande Staycool-organisatie q1766xgcazxy1bgy8jbyrkj5xx871wp9. Andere bedrijven kunnen deze accounts niet gebruiken, ook niet met owner/adminrechten of dezelfde bedrijfsnaam. De binding gebruikt een exacte organisatie-ID; LEGACY_PROVIDER_ORG_ID is uitsluitend een serverinstelling voor een gecontroleerde migratie of test, geen onboardingoptie.

## Bereik

- Publieke en interne CRM-verzending via e-mail, SMS en WhatsApp controleren het bedrijf vóór een berichtregel of providerverzoek.
- Campagnetest, directe/geplande verzending en iedere batch controleren het bedrijf bij het laden van de verzendcontext. Concepten bewerken blijft mogelijk.
- WhatsApp koppelen/status opvragen gebruikt het gedeelde provideraccount uitsluitend voor Staycool. Uitgaand kiest alleen de expliciete actieve workspace-sessie; een inactieve sessie valt nooit terug op een andere. Zonder workspaceconfig mag alleen de expliciete deployment-sessie van Staycool worden gebruikt. De eerste willekeurige verbonden sessie wordt niet meer gekozen.
- Agenda-export voor andere bedrijven wordt overgeslagen met een interne notitie; er gaat geen verzoek naar Google.
- Cashflow/Frostwork-samenvattingen voor andere bedrijven blijven leeg zonder extern verzoek.
- De bestaande WhatsApp-bewaker en statuswebhook verwerken alleen sessies van het toegewezen bedrijf. Sessie-opzoeking gebruikt een nieuwe index.
- /crm/settings toont voor bedrijfsbeheerders een overzicht zonder sleutels: configuratie aanwezig of niet ingesteld/inactief. Dit is geen live verbindingstest.

## Validatie

393 tests in 43 bestanden geslaagd. Twaalf nieuwe tests controleren twee fictieve bedrijven, blokkering vóór providerverkeer, interne verzending, campagnes/batches, WhatsApp-beheer, agenda, suite, exacte sessiekeuze, inactieve sessie, bestaand e-mail/SMS/WhatsApp-verkeer met mocks, afgeschermde status en bewaking. Convex-TypeScript en productiebuild geslaagd. Algemene TypeScript bevat bestaande diagnostiek; slechts een bestaand regelnummer verschoven.

Alleen-lezen productie-inventaris: één bestaande Staycool-organisatie en één als actief opgeslagen WhatsApp-configuratie. Geen nieuwe accounts, credentials, koppelingen of berichten aangemaakt. Geen live verzending getest. Geen SEO-werk.

## Open en volgende stap

Dit is een veilige tussenstap, geen volledige selfserviceproviderconfiguratie. Nieuwe bedrijven hebben nog geen eigen werkende communicatie. Inkomende e-mail/SMS/WhatsApp-webhooks en delivery receipts gebruiken nog legacy-routing; die moeten aan provideraccount, sessie en bedrijf worden gekoppeld voordat eigen accounts voor andere bedrijven worden geactiveerd. Daarna versleutelde bedrijfscredentials, afzenderverificatie, beheerformulieren en verbindingscontrole; daarna pas bedrijfsregistratie/teamuitnodigingen openen. Meta heeft bestaande bedrijfsrouting en is in deze stap niet gewijzigd. Marketplace-verificatie en platformmeldingen blijven platformcommunicatie.

Status: getest; publicatie volgt.
