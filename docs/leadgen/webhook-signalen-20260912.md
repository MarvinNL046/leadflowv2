# Webhooksignalen — 12 september 2026

## Gedaan

Platformbeheerders krijgen onder Leadgenbeheer de pagina /crm/webhook-signalen. Daar staan overgeslagen meldingen gegroepeerd per kanaal en oorzaak: onbekende/dubbelzinnige sessie, conflicterende sessiegegevens, onbekend account, niet-koppelbare bezorgstatus, ontbrekende afzender/ontvanger en niet-parseerbare payload.

Er worden uitsluitend kanaal, vaste oorzaak, aantallen en eerste/laatste tijdstip geregistreerd. Geen providerpayload, externe bericht-ID, sessie-ID, telefoonnummer, berichtinhoud of geheim wordt opgeslagen. Het aantal is het aantal geregistreerde signalen, geen aantal unieke verloren klantberichten: providerretries kunnen opnieuw meetellen en een niet-koppelbare bezorgstatus kan ook een platformmail betreffen.

Alleen geauthenticeerde providerwebhooks registreren signalen; afgewezen signatures/secrets schrijven hier niets. Niet-koppelbare receipts registreren in dezelfde mutatie als de matchingpoging. De registratie van onbekende routing gebeurt voordat HTTP skipped wordt teruggegeven. Bij een databasefout slaagt die bevestiging niet stilzwijgend.

De lijst is gepagineerd en standaard gefilterd op openstaande signalen. Controle vastleggen vereist een toelichting van 3–500 tekens en het getoonde aantal bij openen van het formulier. Een nieuw signaal tijdens de controle maakt de oude bevestiging ongeldig. Actor, tijd, aantal en toelichting worden in een afzonderlijke auditregel bewaard. Een volgende melding heropent de groep en behoudt de laatste controle. De pagina toont de laatste controle; de volledige audithistorie staat in de database.

Zowel lezen als controleren vereist platformadminrechten op de server. Een gewone bedrijfseigenaar krijgt geen toegang. Er worden geen e-mails, pushmeldingen of herverwerkingen gestart.

## Validatie

414 tests in 45 bestanden geslaagd. Zeven nieuwe tests bewaken payloadminimalisatie, aggregatie, toegang voor platformadmin tegenover gewone gebruiker/anoniem, auditregistratie, heropenen, verouderde controle, toelichting, auth-fouten en een ongekoppelde receipt zonder klantwrites. Convex-TypeScript en productiebuild geslaagd. Algemene TypeScript heeft alleen bestaande diagnostiek (één bestaand regelnummer verschoven).

## Open en volgende stap

Registratie begint met deze publicatie. Eerder overgeslagen berichten kunnen niet worden gereconstrueerd. Dit is een signalenoverzicht, geen quarantaine met berichtinhoud en geen retryknop. Werkelijke providerverbindingen zijn hiermee niet live getest; een leeg overzicht bewijst geen correcte aflevering.

Volgende stap: de echte inkomende WhatsApp-/SMS-test uitvoeren wanneer de telefoon beschikbaar is, en veilige inrichting van eigen provideraccounts voorbereiden (versleutelde credentials, accountbinding en afzenderverificatie). Eventuele opslag voor gecontroleerd opnieuw verwerken vraagt apart bewaarbeleid en toegangscontrole. Geen SEO-werk.

Live op 12 september 2026 via PR #35, commit 630177547e74047059b660fe17bc884f37a0dc7e. Vercel dpl_GwY32BWmmKt7y6dDv3zE3SwB6yUw READY. Live /crm/webhook-signalen gecontroleerd: kop, uitleg, standaard open-filter en alle-signalenfilter werken; beide tonen momenteel een lege registratie. Geen productiesignalen aangemaakt of gecontroleerd voor deze test.
