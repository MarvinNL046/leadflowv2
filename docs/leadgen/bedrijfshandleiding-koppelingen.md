# Bedrijfshandleiding: e-mail en WhatsApp aansluiten

Versie 12 september 2026. Voor eigenaren en bedrijfsbeheerders in LeadFlow.

## Voordat je begint

Je hebt een bestaande LeadFlow-bedrijfsomgeving nodig met de rol eigenaar of bedrijfsbeheerder. Medewerkers kunnen dagelijks met het CRM werken, maar beheren geen sleutels. Het zelfstandig aanmelden van nieuwe bedrijven is nog niet beschikbaar.

Gebruik accounts en telefoonnummers die jouw bedrijf beheert. Deel API-keys en persoonlijke webhookadressen alleen met bevoegde beheerders. Stuur ze niet naar klanten of in screenshots. LeadFlow slaat providerkeys versleuteld op en toont opgeslagen API-keys niet opnieuw.

## E-mail: wat heb je nodig?

Een eigen Resend-account, een eigen domein en toegang tot de DNS-instellingen van dat domein. Kies een afzenderadres op het domein dat je in Resend verifieert. Resend kan voor het gebruik kosten rekenen; controleer je eigen abonnement.

## E-mail: stap voor stap

1. Open Instellingen → Eigen e-mailkoppeling → Eigen koppeling voorbereiden. LeadFlow maakt een concept en toont het webhookadres.

2. Voeg je verzenddomein toe in Resend. Plaats de DNS-records die Resend aangeeft en wacht op de status Verified. Kopieer de domein-ID.

3. Maak in Resend een actieve webhook naar het adres uit LeadFlow. Selecteer email.delivered, email.bounced, email.complained en email.opened. Kopieer de webhook-ID.

4. Vul in LeadFlow afzendernaam, afzenderadres, domein-ID, webhook-ID en een Resend API-key in. De key moet domeinen en webhooks kunnen lezen én e-mail kunnen versturen. Klik Controleren en activeren.

5. LeadFlow controleert de instellingen. Activeren verstuurt geen testmail. Stuur daarna zelf één CRM-testbericht naar een adres dat je beheert en controleer zowel je inbox als de berichtstatus. Een geslaagde instellingcontrole bewijst nog niet dat elk bericht wordt afgeleverd.

Nieuwe CRM-mails, workflowmails en campagnebatches gebruiken de eigen afzender. Antwoorden op e-mails worden nog niet in een LeadFlow-mailbox ingelezen. Platformmeldingen over verificatie en de leadmarktplaats vallen buiten jouw bedrijfskoppeling.

## WhatsApp: wat heb je nodig?

Een eigen Voidfix WhatsApp-account, de API-key daarvan en een telefoon met het WhatsApp-bedrijfsnummer. Gebruik voor deze LeadFlow-werkruimte een apart Voidfix-account. De webhookinstelling is op accountniveau; overschrijf geen webhook die een ander systeem of bedrijf gebruikt.

## WhatsApp: stap voor stap

1. Open wa.voidfix.com en koppel daar je telefoon door de QR-code te scannen via Gekoppelde apparaten in WhatsApp. Wacht totdat de sessie verbonden is. Noteer de sessie-ID en controleer het telefoonnummer.

2. Open in LeadFlow Instellingen → Eigen WhatsApp-koppeling. Vul de sessie-ID, het bedrijfsnummer met landcode (bijvoorbeeld +31 in plaats van de eerste 0) en de API-key uit jouw Voidfix-instellingen in.

3. Klik Controleren en activeren. LeadFlow controleert of precies deze verbonden sessie onder de API-key zichtbaar is en of het telefoonnummer overeenkomt. Een al aan een andere werkruimte gebonden sessie wordt geweigerd. Er wordt geen testbericht verstuurd.

4. Klik Webhookadres tonen. Dit persoonlijke adres bevat een geheime sleutel. Kopieer het volledige adres naar de webhookinstellingen van jouw Voidfix-account. Selecteer inkomende berichten, berichtstatussen en sessiestatussen. Bewaar de instellingen in Voidfix en verberg het adres daarna in LeadFlow.

5. Laat vanaf een tweede telefoon één herkenbaar testbericht naar jouw bedrijfsnummer sturen. Open Berichten in LeadFlow en controleer het gesprek. Stuur vanuit dat gesprek zelf een antwoord en controleer op de tweede telefoon of het aankomt. Controleer ook de status van dat bericht.

6. Kijk terug bij Eigen WhatsApp-koppeling. Laatste webhook ontvangen geeft aan dat een geldig verzoek voor jouw sessie is ontvangen. Dat kan ook een sessiestatus zijn; controleer daarom altijd het daadwerkelijke gesprek en antwoord. Ontvangst nog niet bevestigd betekent dat de webhookroute nog niet is aangetoond.

## Pauzeren, opnieuw koppelen en overstappen

E-mail pauzeren stopt nieuwe e-mailverzendingen via het eigen account. WhatsApp pauzeren stopt nieuwe verzendingen én nieuwe inkomende gesprekken via die koppeling. Een verzending die al bezig was kan afronden. Bezorgmeldingen van eerder verstuurde berichten kunnen nog worden verwerkt.

Na pauzeren valt LeadFlow niet terug op het platformaccount. Voor opnieuw activeren maak je een nieuwe koppeling en voer je de verificatie opnieuw uit. Werk bij WhatsApp daarna ook het webhookadres in Voidfix bij; de nieuwe koppeling krijgt een nieuw adres. Oude berichten houden hun oorspronkelijke koppeling.

Pauzeren in LeadFlow logt de telefoon niet uit bij Voidfix. Gebruik voor volledig ontkoppelen ook Voidfix en de lijst Gekoppelde apparaten op de telefoon. Campagnes die zijn gestopt worden niet automatisch hervat. Controleer je lopende campagnes en workflows bij een overstap.

De bestaande WhatsApp via Voidfix-pagina is voor de eerder door het platform ingerichte koppeling. Een nieuwe eigen koppeling gebruikt de pagina Eigen WhatsApp-koppeling. Gebruik niet beide inrichtingstrajecten door elkaar.

## Als iets niet werkt

E-mailcontrole mislukt: controleer of het domein Verified is, of het afzenderadres op exact dat domein staat en of de webhook actief is met het juiste adres en alle vier gebeurtenissen. Controleer de rechten van je API-key.

WhatsAppcontrole mislukt: controleer je eigen account, de exacte sessie-ID, verbonden status en telefoonnummer met landcode. Scan zo nodig opnieuw de QR-code in Voidfix. Een API-key of sessie van het bestaande platformaccount kan niet als eigen account worden hergebruikt.

Geen inkomende WhatsApp: controleer het volledige webhookadres, de geselecteerde gebeurtenissen en de sessie. Stuur een nieuw testbericht. Een groene sessie bij Voidfix bewijst op zichzelf niet dat de webhook naar LeadFlow werkt.

Bericht komt niet aan: controleer het ontvangersnummer, de verbinding in Voidfix en de foutstatus in LeadFlow. De verbindingstatus in LeadFlow is de controle bij het aansluiten, geen continue beschikbaarheidsgarantie. Eigen koppelingen hebben nog geen automatische storingsmail of ingebouwde QR-herkoppeling.

Hulp nodig: geef de beheerder het tijdstip, de betreffende werkruimte, de stap die mislukte en de foutmelding. Deel geen API-key, volledig persoonlijk webhookadres of klantgesprekken.

## Wat komt later?

Eigen SMS-accounts, automatische bewaking van eigen WhatsApp-accounts, e-mailantwoorden in de inbox en zelfstandig bedrijven aanmelden zijn nog vervolgstappen.
