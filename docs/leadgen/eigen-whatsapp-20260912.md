# Eigen WhatsApp per werkruimte — 12 september 2026

LG-041 voegt een eigen Voidfix-account toe voor bestaande bedrijfsomgevingen. Instellingen bevat Eigen WhatsApp-koppeling en Handleiding voor bedrijven. De handleiding is één Markdown-bron die ook in de app wordt getoond en omvat e-mail, WhatsApp, verificatie, pauzeren en probleemoplossing.

## Exact bereik

- companyWhatsappConnections: werkruimte, sessie, telefoon, versleutelde API-key/webhooksecret, aanmaker en controle-/ontvangstdatum. Eén actieve koppeling per werkruimte, maximaal twintig historische koppelingen.
- Alleen owner/admin van het bedrijf mag instellen, status lezen, webhookadres tonen of pauzeren. Rechten worden vóór de providerrequest en bij het opslaan gecontroleerd.
- Activering leest GET /api/external/sessions onder de ingevoerde key. Exact één opgegeven sessie, WORKING, isConnected=true en een overeenkomend bedrijfsnummer zijn vereist. Bestaande platformsleutel/sessie en sessies van andere werkruimtes worden geweigerd.
- CRM en interne workflowverzending kiezen de eigen key/sessie. Berichten slaan de koppeling-ID op. De parser verwerkt ook de gedocumenteerde geneste data.messageId-response van Voidfix.
- Eigen HTTP-endpoint controleert een willekeurig gegenereerd geheim en exacte sessie. Inkomende berichten, telefoon-echo's en statusmeldingen zijn aan de werkruimte/koppeling gebonden. Dubbele provider-ID's van andere accounts raken elkaar niet. Nieuwe inboundwrites controleren de actieve koppeling opnieuw binnen de transactie.
- Pauzeren blokkeert nieuwe verzending en nieuwe inbound/echo's, met behoud van ontvangst van eerdere bezorgmeldingen. Geen terugval naar legacy. Na overstappen accepteert de legacy-WhatsApp-route geen nieuwe berichten voor deze werkruimte; de legacy-sessiebewaker slaat deze werkruimte over.

## Verificatie en grenzen

441 tests in 47 bestanden, waarvan twaalf nieuwe: verkeerde rol/bedrijf, onjuiste key/sessie/nummer, offline of dubbele sessie, rechten ingetrokken tijdens providerresponse, versleutelde opslag, afgeschermd webhookadres, eigen sendcredentials, inbounddedup, ontvangstisolatie en pauzeren. Convex-TypeScript en Vite-build slagen. Algemene TypeScript bevat dezelfde bestaande diagnostiek buiten dit bereik.

Alle providerrequests zijn in tests gesimuleerd. Geen echte telefoon, key of providerwebhook gewijzigd; geen echte berichten verzonden. De echte providerpayload- en afleveringstest blijft open. De huidige decoder ondersteunt de bestaande LeadFlow-payloadvormen; de openbare Voidfix-specificatie beschrijft webhookpayloads niet volledig.

Er is geen API-controle van de ingestelde webhook gevonden in de openbare Voidfix-specificatie. Daarom staat sessiecontrole los van laatste webhookontvangst. Een sessiestatuswebhook is geen bewijs van een geslaagd gesprek. De interface en handleiding vragen de gebruiker expliciet een gesprek in twee richtingen te controleren.

Webhookinstelling gebeurt handmatig in het eigen Voidfix-account. Het URL-secret wordt uitsluitend op verzoek aan de bedrijfsbeheerder getoond; de API-key wordt nooit opnieuw getoond. Gebruik een apart provideraccount per werkruimte omdat de providerwebhook op accountniveau wordt ingesteld. Een uitgelekt webhookadres moet vervangen worden via pauzeren/nieuwe koppeling. De eigen koppeling heeft nog geen automatische bewaking, QR-generatie in LeadFlow, beheer van Voidfix-accountleden of zelfservice-registratie. Controle bij activering bewijst toegang via die key, geen juridische eigendom van het telefoonnummer.

De bestaande platformkoppeling wordt niet gemigreerd of verwijderd. Een overstap naar een eigen account moet bewust worden uitgevoerd. Historische bezorgmeldingen blijven per oorspronkelijke koppeling verwerkt; geen automatische replay van gemiste inboundberichten. Geen SEO-wijzigingen.

Bron: officiële Voidfix API-documentatie, gelezen op 12 september 2026: https://wa.voidfix.com/api-docs/ en de bijbehorende swagger-ui-init.js (sessions en send-message).

Vervolg: echte WhatsApp/SMS-proef wanneer de kantoor-telefoon beschikbaar is; eigen SMS-inrichting en bewaking van eigen WhatsApp voordat externe bedrijfsregistratie breed wordt geopend.
