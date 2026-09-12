# Eigen e-mail per bedrijf — 12 september 2026

Bedrijfsbeheerders (owner/admin) kunnen via Instellingen → Eigen e-mailkoppeling een eigen Resend-account voorbereiden en activeren. Een medewerker of platformadmin zonder bedrijfsbeheerrechten kan deze instellingen niet lezen of wijzigen.

## Inrichting en gedrag

1. Maak in LeadFlow een concept; dit geeft een uniek webhookadres voor die koppeling.
2. Verifieer het verzenddomein in het eigen Resend-account. Maak daar een actieve webhook naar het conceptadres met email.delivered, email.bounced, email.complained en email.opened.
3. Vul afzender, domein-ID, webhook-ID en een API-key met benodigde lees- en verzendrechten in. LeadFlow controleert domein en webhook via twee alleen-lezen providerverzoeken. Activeren verstuurt geen mail.
4. Sleutels worden met de bestaande AES-256-GCM-encryptie opgeslagen. Publieke queries geven alleen status/afzender/webhookadres terug. Rechten worden opnieuw gecontroleerd voordat sleutels worden opgeslagen.

CRM-mail, interne workflowverzending en campagnebatches kiezen de actieve bedrijfskoppeling. Elk verstuurd bericht bewaart de koppeling-ID; bezorgmeldingen worden op die ID én providerbericht-ID gevonden. De eigen webhook controleert de providerhandtekening en een tijdvenster van vijf minuten. Oude koppelingen blijven bezorgmeldingen ontvangen na pauzeren. Gelijke bericht-ID's uit verschillende accounts raken zo niet elkaar.

Pauzeren blokkeert nieuwe e-mails; reeds lopende verzendingen kunnen afronden. Er is daarna geen automatische terugval naar de gedeelde platformkey. Een nieuwe koppeling vereist een nieuw concept en nieuwe verificatie. Maximaal één actieve koppeling per bedrijf; maximaal twintig historische/conceptkoppelingen. De bestaande Staycool-route blijft ongewijzigd totdat een eigen koppeling wordt geactiveerd. Andere bedrijven krijgen nooit die legacy-route.

## Controle en grenzen

429 tests in 46 bestanden, waaronder 15 nieuwe tests met fictieve bedrijven en gesimuleerde providerverzoeken. Controle van bedrijfsrechten, ingetrokken rechten tijdens verificatie, ongeldige key/domein/webhook, versleutelde opslag, CRM- en campagneverzending, koppelinggebonden ontvangst en pauzeren. Convex-TypeScript en Vite-productiebuild slagen; algemene TypeScript bevat bestaande diagnostiek buiten dit bereik.

Geen productiecredentials, providerwebhooks of echte berichten aangemaakt. Een echte bedrijfskoppeling en aflevering moeten nog worden getest. Dit importeert geen antwoorden of mailbox. SMS/WhatsApp/agenda hebben nog geen eigen selfservice-providerkoppeling. Externe bedrijfsregistratie blijft een vervolgstap. Campagnes die tijdens pauzeren stoppen worden niet automatisch hervat. Geen SEO-wijzigingen.

Providercontrole gebaseerd op de officiële [Resend-webhookdocumentatie](https://resend.com/docs/api-reference/webhooks/get-webhook) en [domeinverificatie](https://resend.com/docs/dashboard/domains/introduction).

Aanbevolen vervolg: bedrijfsgebonden WhatsApp-inrichting met een aantoonbaar juiste sessie, daarna SMS en onboarding. Echte SMS/inboundtest met de kantoor-telefoon blijft open.

Live bevestigd: PR #37, commit 07902b342ef103480a186c924427af77ec881d61; Vercel dpl_BkCkdWSXot6nWpRSWvzUo65paDBd READY. Instellingenlink en lege e-mailconfiguratie alleen-lezen in de browser gecontroleerd. Productie heeft de benodigde encryptiesleutelconfiguratie en webhookbasis-URL. Er is nog geen eigen account aangesloten.
