# Inkomende bedrijfsrouting — 12 september 2026

## Bereik

De bestaande webhookgeheimen blijven horen bij het expliciet toegewezen Staycool-provideraccount. Dit activeert geen provideraccount voor een nieuw bedrijf.

- WhatsApp inkomend, telefoon-uitgaand, bezorgstatus en sessiestatus vereisen een unieke bekende sessie in whatsappWebConfig van het toegewezen bedrijf. De sessie mag op het hoogste niveau of in data staan; conflicterende waarden worden geweigerd. Geen fallback naar de standaardwerkruimte. Een tijdelijk inactieve bekende sessie mag nog antwoorden/status ontvangen.
- SMS gebruikt het geauthenticeerde legacy-account en uitsluitend diens enige werkruimte. Bij meerdere werkruimtes wordt niet gegokt; eerst expliciete device-routing inrichten.
- Resend-bezorgstatussen zoeken uitsluitend een uniek uitgaand e-mailbericht van het toegewezen bedrijf. SMS en WhatsApp zoeken daarnaast op hun eigen kanaal; WhatsApp beperkt tot de gevonden sessiewerkruimte.
- Dubbele externe ID's binnen hetzelfde toegestane bereik worden overgeslagen. Deduplicatie van inkomende berichten en telefoon-uitgaand gebruikt werkruimte + kanaal + externe ID, zodat identieke ID's bij andere bedrijven/kanalen geen berichten laten verdwijnen.
- Status, eerste-open/bezorg/bounce-markeringen, campagnecijfers en bounce/klacht-blokkering worden atomisch bijgewerkt. Contact- en campagnekoppelingen naar een andere werkruimte worden niet aangeraakt. Historische bezorgtijdstempels voorkomen opnieuw tellen; oude historische totalen worden niet herberekend.
- De twee oudere interne helpers voor campagnecijfers en bounce-blokkering blijven bestaan maar controleren nu ook bedrijfs- en kanaalgrenzen. De webhook gebruikt de gezamenlijke mutatie.

Onbekende, ontbrekende, conflicterende of dubbelzinnige mapping geeft HTTP 200 met skipped en schrijft geen klantbericht. Dat voorkomt eindeloze providerretries; er is nog geen quarantaine of automatisch opnieuw verwerken. Authenticatiefouten blijven 401. Geen berichtinhoud of secrets toegevoegd aan logging.

## Validatie

407 tests in 44 bestanden, waaronder 14 nieuwe routingtests met twee fictieve bedrijven. Volledige HTTP-tests voor geldige/ongeldige authenticatie, ondertekende Resend-meldingen, WhatsApp inkomend/uitgaand/bezorging, SMS-kanaalscheiding en conflicterende sessies. Tests bewaken dubbele notificaties, vreemde relaties, sessie-ambiguïteit, historische tijdstempels en afwezigheid van ongewenste contact-/berichtwrites. Convex-TypeScript en productiebuild geslaagd; algemene TypeScript bevat dezelfde bestaande diagnostiek met een verschoven regelnummer.

Geen productieberichten, accounts of providerinstellingen gewijzigd; geen live berichten verstuurd. Geen SEO-wijzigingen.

## Open en aanbevolen vervolg

Een echte inkomende WhatsApp-/SMS-test blijft nodig. De publiek leesbare Voidfix API-docspagina leverde geen uitleesbaar webhookcontract; de ondersteunde sessievelden zijn dus defensief verwerkt en getest, maar niet met een nieuw echt providerbericht bevestigd. Zonder sessie-ID wordt WhatsApp niet opgeslagen. De SMS-test staat nog voor maandag wanneer de kantoor-telefoon aanstaat.

Volgende stap: veilige registratie van eigen provideraccounts met versleutelde credentials, unieke inkomende endpoint-/accountbinding en afzenderverificatie. Voeg daarbij een zichtbaar overzicht van overgeslagen webhooks en gecontroleerd opnieuw verwerken toe. Inkomende e-mailantwoorden zijn nog geen volwaardige afzonderlijke mailboxkoppeling. Pas na die inrichting en tests bedrijfsregistratie/teamuitnodigingen openen. Bestaande website-/suite-intake en marketplace-OTP/platformmeldingen zijn buiten dit bereik.

Status: getest; publicatie volgt.
