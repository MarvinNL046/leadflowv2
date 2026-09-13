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
