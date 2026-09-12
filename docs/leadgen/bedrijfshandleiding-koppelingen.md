# Bedrijfshandleiding: je bedrijf, team en koppelingen inrichten

Versie 12 september 2026. Voor eigenaren en bedrijfsbeheerders in LeadFlow.

## Voordat je begint

Je kunt na inloggen met een geverifieerd e-mailadres een eigen bedrijfsomgeving maken of een teamuitnodiging accepteren. Voor het beheren van koppelingen heb je de rol eigenaar of bedrijfsbeheerder nodig. Medewerkers kunnen dagelijks met het CRM werken, maar beheren geen sleutels.

## Je bedrijfsomgeving aanmaken

1. Log in of maak via het inlogscherm een account aan. Bevestig je e-mailadres. Open daarna Aan de slag via de startpagina. Ook een lege CRM-omgeving verwijst je hiernaartoe.

2. Ben je door een bedrijf uitgenodigd? Kies dan eerst Ik heb een uitnodiging. Maak niet daarnaast een eigen bedrijf aan: één account kan in deze eerste versie maar bij één bedrijf horen.

3. Voor je eigen bedrijf kies je Eigen bedrijf starten. Vul bedrijfsnaam, zakelijk telefoonnummer, werkgebied en diensten in. Je geverifieerde e-mailadres wordt het contactadres. Klik Mijn bedrijfsomgeving aanmaken.

4. Je wordt eigenaar van uitsluitend jouw bedrijf. Je krijgt een lege verkooppipeline met Nieuw, Contact gelegd, Offerte verstuurd, Gewonnen en Verloren. Er worden geen provideraccounts, klantberichten, tegoeden of platformbeheerrechten aangemaakt. Toegang tot de leadmarktplaats wordt afzonderlijk toegelaten.

5. Open via Instellingen → Bedrijf en team het Startoverzicht. Nodig teamleden uit en richt je communicatiekanalen in met de stappen hieronder. Het eigen CRM is ook bruikbaar zonder leads te kopen.

## Teamleden uitnodigen

1. Open Instellingen → Bedrijf en team. Vul het e-mailadres van de ontvanger in en kies Medewerker. Een eigenaar kan ook Bedrijfsbeheerder kiezen. Medewerkers hebben dagelijkse CRM-toegang; beheerders kunnen daarnaast instellingen, campagnes en toegestane aankopen beheren. Rollen gelden voor het hele bedrijf, niet voor een afgeschermde werkruimte daarbinnen.

2. Klik Uitnodigingscode maken. Er wordt geen e-mail verstuurd. Kopieer de eenmalig getoonde code en deel die zelf met de bedoelde ontvanger. LeadFlow bewaart uitsluitend een controlehash van de code. Een nieuwe code voor hetzelfde adres vervangt de vorige.

3. De ontvanger logt in met exact het uitgenodigde e-mailadres, verifieert dat adres en opent Aan de slag → Ik heb een uitnodiging. Vul de code in en klik Uitnodiging accepteren. De code is zeven dagen geldig en eenmaal bruikbaar. De rol en het bedrijf worden door de uitnodiging bepaald.

4. Onder Open uitnodigingen kun je een ongebruikte code intrekken. Als de uitnodiger zijn benodigde beheerrechten verliest, kan de uitnodiging niet meer worden gebruikt. Een verlopen of kwijtgeraakte code vervang je door een nieuwe.

5. Met Toegang intrekken verwijder je de toegang van een teamlid tot dit bedrijf. CRM-gegevens blijven bewaard. Een eigenaar kan beheerders verwijderen; beheerders kunnen alleen medewerkers verwijderen. Eigenaren en je eigen toegang worden op deze pagina niet verwijderd. Verwijderen annuleert geen eerder ingeplande bedrijfsautomatiseringen.

Een ontvanger die al bij een bedrijf hoort kan de uitnodiging nog niet accepteren. Een bedrijfswisselaar en meerdere bedrijven per account volgen later. Rolwijziging van een bestaand lid gebeurt in deze versie door de toegang in te trekken en een nieuwe uitnodiging met de gewenste rol te maken. Overdracht van eigenaarschap is nog niet beschikbaar.

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

Bericht komt niet aan: controleer het ontvangersnummer, de verbinding in Voidfix en de foutstatus in LeadFlow. WhatsApp wordt elke vijftien minuten opnieuw gecontroleerd; dit is geen continue beschikbaarheidsgarantie. Eigen koppelingen hebben nog geen automatische storingsmail of ingebouwde QR-herkoppeling.

Hulp nodig: geef de beheerder het tijdstip, de betreffende werkruimte, de stap die mislukte en de foutmelding. Deel geen API-key, volledig persoonlijk webhookadres of klantgesprekken.

## SMS: wat heb je nodig?

Een eigen SMS Voidfix-account, een Android-telefoon met de gateway-app en een werkende SIM. Houd de telefoon ingeschakeld en verbonden volgens de instructies van de provider. Het SMS-account en de SMS API-key staan los van WhatsApp. Gebruik een apart SMS-provideraccount voor deze werkruimte zodat je geen webhook van een ander systeem overschrijft.

## SMS: stap voor stap

1. Koppel het Android-apparaat via de instructies op sms.voidfix.com. Open Devices & SIMs en noteer de apparaat-ID en de exacte apparaatnaam. Controleer dat er een SIM gekoppeld is.

2. Open LeadFlow → Instellingen → Eigen SMS-koppeling. Vul apparaat-ID, exacte apparaatnaam en de API-key uit API Integration van jouw SMS-account in. Klik Controleren en activeren.

3. LeadFlow controleert de apparaatlijst van jouw account en de aanwezigheid van een SIM. Dit is geen onlinecontrole en er wordt geen SMS verstuurd. Controleer op de telefoon welke SIM de gateway standaard gebruikt; er is nog geen SIM-slotkeuze in LeadFlow. SMS-kosten lopen via jouw provider/SIM.

4. Klik Webhookadres tonen. Kopieer dit volledige, geheime adres naar Add WebHook for received messages op de API Integration-pagina van SMS Voidfix en sla het daar op. Verberg daarna het adres in LeadFlow.

5. Stuur zelf één CRM-test-SMS naar een tweede telefoon die je beheert. Antwoord vanaf die telefoon en controleer het gesprek in LeadFlow. Een bericht dat de gateway heeft geaccepteerd is nog niet bewezen afgeleverd; controleer de telefoon en eventuele bezorgstatus.

6. Geen ontvangst: controleer dat de telefoon aanstaat, de app is verbonden, de webhook klopt en het juiste apparaat wordt gebruikt. LeadFlow verwerkt alleen callbacks met de apparaat-ID van jouw koppeling. Last webhook ontvangen bevestigt een passende callback, niet automatisch een geslaagd gesprek.

SMS pauzeren blokkeert nieuwe verzendingen en nieuwe inkomende SMS in LeadFlow. Reeds gestarte verzendingen kunnen afronden; oude bezorgmeldingen blijven verwerkt. Er is geen terugval naar de platformkey. Voor hervatten maak je een nieuwe geverifieerde koppeling en werk je het webhookadres bij. De gateway-app en het provideraccount worden niet door deze knop uitgeschakeld.

## WhatsApp: bewaking en herstel

LeadFlow controleert eigen actieve WhatsApp-koppelingen iedere vijftien minuten met de eigen accountkey. Onder Eigen WhatsApp-koppeling zie je Verbinding bevestigd, Verbinding verbroken of nummer gewijzigd, of Verbinding niet bevestigd, met controletijd. Nu controleren vraagt direct opnieuw de status op en verstuurt geen bericht.

Bij een verbroken verbinding, een afwijkend telefoonnummer of een mislukte providercontrole blokkeert LeadFlow nieuwe WhatsApp-verzendingen. Open Voidfix, herstel de sessie met het juiste nummer en klik Nu controleren. Zodra de controle slaagt kunnen nieuwe berichten weer worden verzonden. Eerder mislukte berichten worden niet automatisch opnieuw verstuurd; controleer die afzonderlijk in Berichten.

Een onbekende status kan ook een tijdelijke providerstoring zijn. De bewaking blijft proberen zolang de koppeling actief is. Pauzeren schakelt de periodieke controle van die koppeling uit. Een controle die al liep kan nog afronden maar activeert een gepauzeerde koppeling niet opnieuw. Er zijn nog geen storingsmails of pushmeldingen voor eigen koppelingen: bekijk de status in LeadFlow. Controle van de verbinding vervangt de webhook- en gesprekstest niet.

## Wat komt later?

Automatische storingsmeldingen buiten de app, e-mailantwoorden in de inbox, meerdere bedrijven per account en overdracht van eigenaarschap zijn nog vervolgstappen. De eerste echte telefoon- en afleveringstest van de nieuwe koppelingen staat nog open.
