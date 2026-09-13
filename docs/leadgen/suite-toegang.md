# Bedrijfsbinding en suite-toegang

Implementatie: 13 september 2026. Dit is handmatig toegekende producttoegang na een afspraak; er wordt geen betaling of Stripe-abonnement aangemaakt.

## Bedrijf koppelen

1. Richt je eigen bedrijf in de doelapp in. Gebruik dezelfde Clerk-gebruiker als de eigenaar in LeadFlow. Een gelijk e-mailadres of bedrijfsnaam is niet voldoende.
2. Open LeadFlow → Apps & uitbreidingen → Bedrijfsaccounts koppelen. Alleen de eigenaar kan een koppelcode maken. Kies Frostwork of Cashflow.
3. Open de getoonde koppellink en plak de code. Die is tien minuten geldig. In Cashflow moet je eigenaar zijn; in Frostwork organisatiebeheerder. Het doelbedrijf komt uit je sessie, niet uit een invoerveld.
4. De koppeling staat daarna vast maar suite-toegang staat uit. De platformbeheerder ziet het bedrijf onder Producttoegang en kan met toelichting en einddatum toegang toekennen. Alleen superadmins mogen dit.
5. Wacht maximaal vijf minuten of klik in de doelapp op Toegang vernieuwen. Daarna kun je de app openen. Medewerkers houden hun eigen bestaande rol; er worden geen nieuwe lidmaatschappen aangemaakt.

## Beheren

Toekennen vereist een toelichting van 5–500 tekens en een einddatum binnen één jaar. Gebruik de afgesproken abonnementsperiode. Elke wijziging wordt met beheerder en tijdstip opgeslagen in suiteAccessAudit. Intrekken vereist ook een toelichting. Geen prijs, facturatie of automatische incasso wordt hiermee ingesteld.

Een bedrijf kan maar één organisatie per product koppelen en een doelorganisatie maar één LeadFlow-bedrijf. Codes mogen opnieuw worden gebruikt voor exact dezelfde binding na een verloren antwoord; ze kunnen nooit een andere binding overschrijven. Een nieuwe code vervangt de eerdere code voor dat bedrijf/product. Verkeerd gekoppelde bedrijven vereisen gecontroleerd beheerdersherstel; er is bewust geen onbeperkte ontkoppelen/herkoppelen-knop.

## Handhaving en beperkingen

- De doelapp haalt een serverbevestiging op via HTTPS met een aparte geheime sleutel per product. Sleutels staan uitsluitend in Convex. De eigenaar wordt aan beide kanten gecontroleerd, inclusief JWT-issuer en subject.
- Toegangsbevestigingen zijn maximaal 15 minuten geldig en worden iedere 5 minuten vernieuwd. Bij uitval wordt geen geldigheid verlengd. Intrekken is dus niet onmiddellijk: normaal binnen 5 minuten, uiterlijk binnen 15 minuten voor suite-toegang. Oude revisies kunnen een intrekking niet ongedaan maken.
- Nieuwe Frostwork-organisaties krijgen betaAllowed=false. requireOrg controleert bestaande toelating of een geldige suite-bevestiging; desktop en mobiel verwijzen zonder toegang naar de koppelpagina. Bestaande toegelaten organisaties blijven toegelaten. Hun historische beta-toegang wordt niet door intrekken van suite-toegang verwijderd.
- Cashflow behoudt actieve zelfstandige abonnementen en vrijstellingen. Gekoppelde bedrijven zonder die zelfstandige rechten gebruiken de suite-bevestiging, ook als geen Stripe-prijs is ingesteld. Een verlopen bevestiging blokkeert de bestaande centrale schrijfpaden. Lezen/export blijven beschikbaar. Achtergrondprocessen behouden hun bestaande beleid; dit is geen nieuwe algemene stopknop voor alle reeds geplande werkzaamheden.
- De binding geeft geen toegang tot de contacten van Staycool. De bestaande contact-API blijft beperkt tot de legacy-organisatie. Cashflow's publieke zoek-, detail-, aanmaak- en taakkoppelingen en interne tag/taakpaden controleren nu de toegewezen organisatie.
- Nieuwe klantbedrijven krijgen nog geen automatische contactuitwisseling. Daarvoor zijn per-bedrijf API-koppelingen nodig. Geen lidmaatschappen, facturatiegegevens of klantrecords worden op naam/e-mail samengevoegd.

## Publicatie en onderhoud

Productiebranches: LeadFlow main; Frostwork frostwork-summary-endpoint; Cashflow cashflow-360-hub. Backends: vibrant-wildebeest-329, wooden-jellyfish-458 en sleek-giraffe-933. De publieke productie-bundels bevestigen beide doelbackends.

LeadFlow gebruikt SUITE_FROSTWORK_SECRET en SUITE_CASHFLOW_SECRET. De corresponderende doelapp gebruikt SUITE_BRIDGE_SECRET. Per product moeten de waarden overeenkomen; geen waarden opnemen in Git, documentatie of logs. Polling gebruikt de vaste LeadFlow-server-URL en valideert doelorganisatie en responsevelden. Bij rotatie eerst rekening houden met de maximale 15 minuten lease en controleren dat polling weer slaagt.

Aanbevolen vervolg: echte klantpilot met twee lege bedrijven, vervolgens overeengekomen prijzen/Stripe-afhandeling aansluiten. Betaalwebhooks moeten dezelfde productrechten en auditroute gebruiken en idempotent zijn. Zelfstandige abonnementen mogen nooit dubbel worden gefactureerd. Test ook de overgang van zelfstandig abonnement naar suite-abonnement vóór verkoop.

## Wat gebeurt er als toegang verloopt?

Een reeds geopende app schakelt bij het verlopen van de toegangsbevestiging automatisch naar 'Je toegang via LeadFlow is niet actief'. Je hoeft daarvoor niet uit te loggen of de pagina te herladen. Cashflow houdt de administratie-export beschikbaar. Via 'Toegang via LeadFlow bekijken' kun je de status vernieuwen wanneer de beheerder opnieuw toegang heeft toegekend.

De schermcontrole loopt elke seconde en bij terugkeer naar het venster. Een achtergrondtab of slapend apparaat kan schermupdates uitstellen; de server blijft de toegang zelfstandig controleren. Bestaande zelfstandige abonnementen, vrijstellingen en bestaande Frostwork-toelating houden hun eigen regels. Deze wijziging maakt intrekken niet onmiddellijk: de hierboven genoemde maximale geldigheid van 15 minuten blijft gelden.

Live gecontroleerd op 13 september 2026 met het lege Testbedrijf B in beide productiedomeinen. De tijdelijke rechten zijn na de proef uitgezet. De live servercontrole van LeadFlow koppelingen weigert ook A naar B en B naar A; een volledige proef met twee onafhankelijke eigenaarsessies in beide doelapps en directe schrijfacties is nog niet afgerond.

## Aanvullende isolatiecontrole — 13 september 2026

| Controle | Resultaat | Bewijsniveau |
| --- | --- | --- |
| A en B maken en wijzigen hun eigen klant | Geslaagd in beide apps | Geautomatiseerde integratietest |
| A kan B niet lezen/wijzigen/archiveren en omgekeerd | Geslaagd, records blijven ongewijzigd | Geautomatiseerde integratietest |
| Intrekken A blokkeert aanmaken/wijzigen/archiveren, B blijft werken | Geslaagd in beide apps | Geautomatiseerde integratietest |
| Testbedrijf B kan zonder productrecht geen klant aanmaken | Geslaagd, nul klanten voor en na | Productiefunctie via beheer-CLI-identiteit, foutcode bevestigd in logs |
| Twee onafhankelijke eigenaarsessies met eigen klantrecords | Nog open | Browserproef |

Voor de resterende browserproef: houd A en B in gescheiden sessies, bevestig per app de testbedrijfsnaam en eigenaar, maak alleen herkenbare fictieve klanten aan, wijzig de eigen klant en controleer dat de directe klantlink in de andere sessie geen klantgegevens toont. Leg per stap het resultaat vast; alleen een ontbrekende lijstregel is onvoldoende bewijs. Laat productrechten na de proef weer uitzetten. De geautomatiseerde tests vullen directe mutatiepogingen aan; presenteer die niet als browserbewijs.

## Afgeronde browserproef — 13 september 2026

Met echte, opeenvolgende eigenaarsessies van testbedrijven A en B is in Cashflow en Frostwork bevestigd:

- Ieder bedrijf kan zijn eigen fictieve klant aanmaken en wijzigen.
- B kan de directe klantlink van A niet openen, en A die van B niet.
- Cashflow toont 'Klant niet gevonden'. Frostwork weigert met NOT_FOUND, bevestigd in serverlogs, maar toont nog een technische fouttekst.
- Alle tijdelijke productrechten zijn na de proef uitgezet. Vier herkenbare fictieve klanten zijn bewaard, één per bedrijf per app.

Dit voltooit de eerder openstaande browsercontrole van directe klantdetails. Geautomatiseerde tests dekken daarnaast wijzigen/archiveren van vreemde klanten en schrijven na intrekken. Niet alle productfuncties en mutatie-endpoints zijn live getest. Nog te verbeteren: Frostwork foutpresentatie en de offerte-/factuurklantkiezer voor bedrijven met lokale Cashflow-contacten.

## Klanten kiezen bij offertes en facturen — 13 september 2026

1. Open in Cashflow **Offertes → Nieuwe offerte** of **Facturen → Nieuwe factuur**.
2. Klik bij **Aan** op **Klant kiezen**. Typ minimaal twee tekens om klanten binnen je eigen administratie te zoeken.
3. Kies een klant en bevestig met **Opslaan** in het klantpaneel. Hiermee kies je alleen de klant; het document is nog niet opgeslagen.
4. Bestaat de klant nog niet? Kies **Nieuwe klant aanmaken**, vul naam, e-mail en adres in en klik **Aanmaken & kiezen**. Voor nieuwe bedrijven wordt deze klant binnen hun eigen Cashflow-administratie bewaard.
5. Controleer de klantgegevens onder **Aan** voordat je het document verder invult. **Opslaan als concept** is een aparte documentactie.

De bestaande organisatie met een expliciete legacy LeadFlow-koppeling behoudt haar eigen contactbron. Andere bedrijven hebben die koppeling niet nodig om klanten te kiezen of aan te maken.

Frostwork toont bij onbeschikbare klantgegevens nu een begrijpelijke melding met **Naar mijn klanten** en **Opnieuw proberen**. Een ontbrekende klant kan ook een tijdelijke laadfout betekenen; het scherm onthult geen technische fouttekst of gegevens van een ander bedrijf.

Live gecontroleerd met testbedrijf A: eigen klant zoeken/selecteren in beide documentformulieren en een nieuwe lokale klant aanmaken vanuit de factuurklantkiezer. De factuur bleef onopgeslagen en de factuurlijst leeg. Alle tijdelijke testrechten zijn uitgezet. Deze controle betreft de klantkeuze; opslaan, heropenen, bedragen en volledige documentisolatie zijn de volgende proef.
