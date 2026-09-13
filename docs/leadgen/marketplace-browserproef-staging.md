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
