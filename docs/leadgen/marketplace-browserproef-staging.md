# Marketplace-browserproef — aparte testomgeving

Status 13 september 2026: aparte Convex-developmentdeployment aangemaakt, nog niet voorzien van appcode, testgebruikers of Stripe-configuratie. De geïsoleerde aankooptests (LG-068) zijn groen; deze browserproef is nog niet uitgevoerd.

## Omgeving

- Deploymentreferentie: marvinsmit1988:wetryleadflow:dev/marketplace-e2e
- Deploymentnaam: steady-orca-351
- Database/client-URL: https://steady-orca-351.convex.cloud
- Dashboard: https://dashboard.convex.dev/t/marvinsmit1988/wetryleadflow/steady-orca-351
- Beoogde Stripe-webhook na codepublicatie: https://steady-orca-351.convex.site/webhooks/marketplace-stripe
- Bestaande productie vibrant-wildebeest-329 is niet gewijzigd. De standaarddeployment van de lokale repo is niet omgezet.

## Nog benodigde configuratie

Gebruik uitsluitend de eigen developmentdeployment als doel bij CLI-commando's, nooit --prod. Gebruik een apart genegeerd env-bestand voor de testfrontend; overschrijf geen productieconfiguratie.

| Locatie | Variabele | Waarde / bron |
| --- | --- | --- |
| Testfrontend | VITE_CONVEX_URL | https://steady-orca-351.convex.cloud |
| Testfrontend | VITE_CLERK_PUBLISHABLE_KEY | Expliciete pk_test_ van de gekozen Clerk Development-instance; ontbreekt nog |
| Testfrontend | VITE_POSTHOG_KEY | Leeg voor deze proef |
| Convex test | CLERK_JWT_ISSUER_DOMAIN | Issuer van dezelfde Clerk-testinstance; JWT-template convex |
| Convex test | SITE_URL | Exacte URL van de testfrontend, lokaal of apart gehost |
| Convex test | STRIPE_SECRET_KEY | sk_test_ van gekozen Stripe-testconfiguratie; ontbreekt nog |
| Convex test | STRIPE_MARKETPLACE_WEBHOOK_SECRET | whsec_ van uitsluitend bovenstaande testendpoint |
| Convex test | SUPER_ADMIN_EMAILS | Expliciete testbeheerder, zodat productiefallback niet wordt gebruikt |

Clerk-testinstance en Stripe-testconfiguratie nog door gebruiker te identificeren; geheime sleutels niet in chat, Git of dit document zetten. Geen productieproviderconfiguratie voor e-mail, WhatsApp, SMS of suite kopiëren. Een standaard Vercel-preview is onvoldoende: de frontend bevat anders een fallback naar pk_live_ voor de gedeelde wetry-login.

## Uitvoering zodra configuratie beschikbaar is

1. Publiceer appcode naar steady-orca-351 met expliciete deploymentselectie. Controleer auth-issuer en frontend-URL; start een afzonderlijke frontend met pk_test_.
2. Maak twee synthetische testbedrijven met eigen testidentiteiten. Maak fictieve airco-installatieaanvragen in Limburg in deze database, met meldingen uit. Gebruik geen productie-export.
3. Begin met wallet nul. Controleer gemaskeerde leadgegevens en afwijzing bij onvoldoende tegoed.
4. Maak een Stripe Checkout in testmodus. Controleer dat de sessie geen live betaling is. Voltooi testbetaling; webhook moet precies eenmaal testtegoed boeken. Een succesredirect alleen is geen betaalbewijs.
5. Koop gedeeld; controleer walletdelta, aankooprecord, ontgrendeling, eigen CRM-contact, bronnotitie en opportunity. Herlaad; herhaalde koop mag niet opnieuw afschrijven.
6. Controleer met bedrijf B dat CRM-contact A niet leesbaar is. Voer exclusiviteit en drie-koperslimiet uit met aanvullende synthetische bedrijven/leads.
7. Noteer bewijs per stap, deployment/commit, testreferenties en werkelijke beperkingen. Geen geslaagde Stripe/browserclaim voordat alle betreffende stappen zijn waargenomen.

De eerdere 30 integratietests dekken de transactielogica, maar vervangen niet de browser-, login- en Checkout/webhookproef.

## Hercontrole 13 september 2026 — LG-082

De expliciet geselecteerde deployment marvinsmit1988:wetryleadflow:dev/marketplace-e2e meldt via env list: geen environmentvariabelen ingesteld. Alleen aanwezigheid gecontroleerd, geen sleutels vastgelegd. Ook lokaal is geen .env-testconfiguratie aanwezig (alleen .env.example). Testlogin en Checkout kunnen hierdoor niet worden gestart. Dit is een configuratieblokkade, geen mislukte aankooptest.

Na beschikbaar stellen van de Clerk Development-instance moeten publishable key en bijbehorende issuer veilig worden ingesteld. Voor Checkout zijn daarnaast de Stripe-testsleutel en het webhooksecret van deze testdeployment nodig. Deel geheimen via de betreffende dashboards of een genegeerd lokaal configuratiebestand, niet via chat. Eerst de login en de juiste testbackend bevestigen, dan pas testdata en Checkout uitvoeren.

Voeg aan stap 5 toe: open het eigen CRM-contact, maak een interne opvolgtaak met testverantwoordelijke en deadline, controleer deze in het takenoverzicht en na herladen. Bedrijf B mag ook die taak niet kunnen lezen of wijzigen. Geen klantberichten versturen.

## Testlogin voorbereid — LG-083, 13 september 2026

Clerk wetry Development gevonden: ins_3Czp4DOBv8evoVqJVAzy9X4iFJP, publiek domein darling-magpie-58.clerk.accounts.dev. Bestaande JWT-template convex aanwezig. Geen Clerk-instellingen of geheime sleutels gewijzigd. Alleen testdeployment steady-orca-351 geconfigureerd: CLERK_JWT_ISSUER_DOMAIN naar dit domein, SITE_URL http://localhost:5186, SUPER_ADMIN_EMAILS nobody@marketplace-test.invalid (geen bestaande gebruiker automatisch beheerder).

Appcode succesvol gepubliceerd naar de expliciet geselecteerde developmentdeployment. Lokale frontend start met: node node_modules/vite/bin/vite.js --mode marketplace --port 5186 --strictPort. Genegeerde .env.marketplace.local bevat expliciete testkey, testbackend en lege PostHog-key. Door Convex gegenereerde .env.local verwijderd, zodat standaardselectie niet blijvend naar de proefomgeving wijzigt.

Chrome http://localhost:5186/login toont Sign in to wetry en Development mode. Daarmee is het loginscherm bevestigd; aanmelden/tokenacceptatie nog niet getest. Gebruiker kan het bestaande Development-account gebruiken. Stripe-testsecret/webhooksecret ontbreken nog. Geen testbedrijven, aankopen, tegoed of berichten aangemaakt.

## Browserbewijs — LG-084

13 september 2026: gebruiker aangemeld op localhost:5186 in in-app browser. Reguliere bedrijfsregistratie voltooid voor LeadFlow Marketplace Test A (synthetisch, dummytelefoon). CRM en marketplace-activering werken. Na herladen voorkeuren Airco/Installeren/Limburg, beide segmenten/verkoopvormen en e-mail uit bevestigd. Wallet EUR 0, geen transacties. Nog geen aankoop of opvolgtaak getest; daarvoor volgen synthetische aanvraag en Stripe-testconfiguratie. Productie ongewijzigd.

## Stripe-isolatie — LG-085

Bestaande Stripe-testmodus van StaycoolAirco.nl bevat een actieve webhook naar de productie-LeadFlow-backend (vibrant-wildebeest-329). Deze gedeelde testmodus dus nog niet gebruiken voor de browserproef. Richt een afzonderlijke Stripe-sandbox in met uitsluitend de steady-orca-351-webhook en eigen testsleutel. De bestaande webhook is niet gewijzigd. Geen testbetaling uitgevoerd; event.livemode wordt in de huidige marketplace-handler niet expliciet tegen de omgeving gecontroleerd. Onderzoek dit afzonderlijk voordat productiebetalingen als volledig gescheiden zijn aangemerkt.

## Aparte sandbox aangemaakt — LG-086

Sandbox LeadFlow Marketplace E2E: acct_1UFIDcEGHXq0MPJu. Webhook we_1UFIEoEGHXq0MPJubwCjxaMa wijst uitsluitend naar steady-orca-351, luistert naar completed en async_payment_succeeded. Staging mode=test en modusbeveiliging gedeployd. Nog in te stellen: STRIPE_SECRET_KEY uit deze nieuwe sandbox (niet gedeelde Testmodus) en STRIPE_MARKETPLACE_WEBHOOK_SECRET van deze nieuwe webhook. Geen betaling uitgevoerd. Productie bevat momenteel een testsleutel; de nieuwe live-default is daar nog niet gepubliceerd.

## Betalingsbewijs — LG-087

Beide sandboxsecrets ingesteld na expliciet akkoord. EUR 50 Checkout betaald met synthetische kaart/contactgegevens. Event evt_1UFIJvEGHXq0MPJuW7FoJEP2, paid/complete, event en session livemode=false. Eerste webhook 200 OK om 18:40:07 UTC, handmatige herlevering 200 OK om 18:40:52 UTC. Lokale wallet na herladen EUR 50 en precies één opwaardering. Geen echte betaling. Aankoop/CRM-taak/bedrijf B nog uit te voeren; productie-instellingen ongewijzigd.

## Aankoop en opvolging — LG-088, 13 september 2026

Geslaagd in localhost:5186 met steady-orca-351 en Test A:

- Synthetische aanvraag p17fsspz4f6v4ve991qpmdj14n8eb291 vóór aankoop afgeschermd.
- Gedeelde aankoop EUR 18,15 via bevestigingsdialoog. Eén aankoop p974wx7p4jv1ye91xkjddsymhn8eabm5.
- Na herladen nog ontgrendeld; CRM-link naar ks7c9qd9k4zf8ehfnz3yq5cy118eaesr werkt. Bron en opdracht in CRM-notitie, één opportunity.
- Taak sd7dv78prbhrc6gtfx73jsbhy18ea2av via UI gemaakt: TEST LG088 - controleer fictieve marketplaceaanvraag, Marvin S, 14 september 2026. Zichtbaar onder Mijn taken.
- Ontgrendelde leads bevat precies één gedeelde aankoop met CRM-link.
- Wallet EUR 31,85: EUR 50 opwaardering minus één aankoop EUR 18,15.

Read-only backend bevestigt aankoop en taak in workspace vd77743j3p5zb2nta93q9vc4sx8ea0dy van Test A. Alleen synthetische data, geen klantcommunicatie. Tweede-bedrijfcontrole in browser nog open; bestaande integratietests vervangen die stap niet. Productie-Stripewijziging nog niet gepubliceerd. Eerstvolgende stap: testbedrijf B aanmelden in dezelfde geïsoleerde Development-omgeving en toegang tot dit contact/deze taak controleren.

## Tweede bedrijf — LG-091

13 september 2026: B (m_smit1988@hotmail.com) geverifieerd en via reguliere registratie aangemaakt als LeadFlow Marketplace Test B. Leeg CRM bevestigd. Directe A-contactlink geweigerd door backend met Not a member of this workspace, zonder contactinhoud. Mijn taken en Alle open taken beide 0; A-taak niet zichtbaar. Gerichte schrijfproef via B-browser niet uitgevoerd. Technische foutpagina bij geweigerde contacttoegang verdient gebruiksvriendelijke afhandeling. Geen productieactie.

## LG-099: exclusieve browserproef afgerond
Test A koopt exclusief voor EUR 72,60: EUR 81,85 naar EUR 9,25, één aankoop. Contact, opportunity en handmatige opvolgtaak behouden na herladen. Test B ziet geen klantgegevens of taak. Na gebruikersverzoek toont de detailpagina nu wel de bedrijfsnaam van de koper en Exclusief; backend beperkt deze informatie tot passende marketplacebedrijven. Zie werklog LG-099 voor referenties en beperkingen. Alleen testomgeving, nog niet live.

