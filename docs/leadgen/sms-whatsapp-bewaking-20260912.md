# Eigen SMS en WhatsApp-bewaking — 12 september 2026

LG-042 voegt een SMS-account per werkruimte toe en periodieke controle van eigen WhatsApp-koppelingen. De bedrijfshandleiding in de app is uitgebreid met beide onderwerpen.

## SMS: exact bereik

companySmsConnections bewaart apparaat-ID/naam, werkruimte, aanmaker, controle- en ontvangstdatum en versleutelde API-key/webhooksecret. Alleen owner/admin van het bedrijf mag deze instellingen beheren. Rechten worden vóór de providerrequest en bij het opslaan gecontroleerd. Maximaal één actieve koppeling en twintig historische koppelingen per werkruimte. Het bestaande platformaccount/apparaat en apparaten van andere werkruimtes worden geweigerd.

Activering gebruikt de gedocumenteerde GET /services/get-devices.php onder de eigen key. De reactie moet precies het gekozen apparaat met de opgegeven naam en minimaal één SIM bevatten. De apparaatlijst bevestigt geen online-status of telefoonnummer. De standaard SIM-keuze blijft bij de gateway; LeadFlow heeft geen slotselectie. Een API-key in de query is voor deze provider-GET het gedocumenteerde mechanisme; fouten geven nooit het volledige verzoekadres of de key terug.

CRM en interne workflow-SMS gebruiken de eigen key en device-ID. Berichten bewaren de eigen koppeling-ID. De eigen callbackroute /webhooks/voidfix-sms-company controleert het geheime adres en deviceID van ieder bericht. Inbound en receipts worden op de koppeling gevonden; een gelijk berichtnummer van een ander account kan geen status wijzigen. Pauzeren blokkeert nieuwe verzending en nieuwe inbound; eerdere receipts blijven mogelijk. Geen fallback naar de platformkey. De legacy-SMS-callbackroute stopt met nieuwe verwerking voor een werkruimte die een eigen SMS-koppeling heeft gehad.

## WhatsApp-bewaking

Een kwartiercron leest actieve eigen koppelingen met index en paginering en plant afzonderlijke controles. Iedere controle gebruikt uitsluitend de eigen key en exacte sessie. HTTP-timeout tien seconden. Alleen WORKING, isConnected=true, de juiste sessie en hetzelfde telefoonnummer geven connected. Offline/ander nummer geeft disconnected; fout/ongeldige response geeft unknown. Geen raw providerresponse of secret in opgeslagen meldingen.

Health en controletijd zijn gescheiden van de beheerstatus active/disabled. Een onbekende of verbroken verbinding blokkeert nieuwe verzendingen totdat een latere controle connected bevestigt. Reeds gestarte verzendingen kunnen afronden. Verouderde resultaten overschrijven geen recentere controle; pauzeren tijdens een controle kan de koppeling niet opnieuw activeren. Gepauzeerde koppelingen worden overgeslagen. Een bedrijfsbeheerder kan Nu controleren gebruiken; rechten worden vóór de request en bij opslag opnieuw gecontroleerd. Er zijn geen storingsmails, pushmeldingen of automatische retries van mislukte klantberichten toegevoegd.

## Verificatie

459 tests in 49 bestanden, waaronder achttien nieuwe tests voor toegangsrechten, apparaatverificatie, SMS-credentials, devicegebonden inbound/receipts, dedup, pauzeren, WhatsApp-storingen en herstel, oude resultaten en geplande controles. Convex-TypeScript en Vite-productiebuild slagen. Algemene TypeScript geeft dezelfde bestaande foutcategorieën/bestanden als voor deze wijziging; geen nieuwe diagnostiek.

Eén echte alleen-lezen apparaatlijstrequest is gebruikt om de antwoordstructuur te controleren. Alleen veldnamen en typen zijn getoond, geen key, apparaatnaam of telefoonnummer. Geen echte SMS/WhatsApp-verzending, nieuwe providerbinding of providerinstelling uitgevoerd. De overige tests gebruiken fictieve bedrijven en gesimuleerde providerrequests. De daadwerkelijke afleveringstest met de telefoon blijft open.

Bronnen: SMS Voidfix API Integration en het ingebouwde webhookvoorbeeld (deviceID/simSlot); de officiële API-specificatie op https://gateway.voidfix.com/rest-api/your-swagger-doc.yaml; WhatsApp session-status op https://wa.voidfix.com/api-docs/. Gecontroleerd op 12 september 2026. Geen SEO-werk.

Vervolg: een gecontroleerde praktijkproef in twee richtingen met de kantoor-telefoon. Daarna begeleide bedrijfsregistratie/uitnodigingen en optionele storingsmeldingen buiten de app.

Live bevestigd via PR #41, commit b503d736c223c7df1deb33a878193a7555d8c382; Vercel dpl_6MdUSAz9HXpbH3C2Vv1fnaMVpqgX READY. SMS-formulier, handleidingsecties en WhatsApp-bewakingsuitleg vanuit de instellingsnavigatie alleen-lezen gecontroleerd. Er is geen eigen provideraccount aangesloten voor deze livecontrole.
