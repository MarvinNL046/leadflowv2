# Publicatievoorbereiding — 13 september 2026

PR: https://github.com/MarvinNL046/leadflowv2/pull/73
Branch: fix/marketplace-stripe-mode
Status: gepubliceerd op 13 september 2026 via PR #73, commit b892c6c8369fccfa9a62a6ddeb9274057af2db3d. Zie actuele afronding hieronder; eerdere controles zijn historische voorbereiding.

## Wijzigingen

- Stripe-moduscontrole vóór Checkout en vóór walletbijschrijving. Zowel event als sessie moet bij de ingestelde modus passen; standaard live.
- Accountmenu op /aan-de-slag voor e-mailverificatie.
- Begrijpelijke foutpagina bij onbereikbaar contact, met teruglink naar eigen contacten.

## Bewijs

53 gerichte tests geslaagd (aankopen en bedrijfsrechten). Frontend client/SSR-build geslaagd. Sandbox Checkout EUR 50, webhook 200 OK, herlevering zonder dubbele bijschrijving. Gedeelde aankoop EUR 18,15: saldo EUR 31,85, CRM-contact en toegewezen opvolgtaak. Bedrijf B kan A-contact niet openen en ziet A-taak niet; A behoudt toegang. Nieuwe foutpagina en teruglink in browser gecontroleerd. Zie marketplace-browserproef-staging.md voor beperkingen en referenties.

## Publicatieblokkade

Bij LG-086 is in productie een Stripe-testsleutel vastgesteld; STRIPE_MARKETPLACE_MODE ontbrak. Met nieuwe standaard live zou Checkout hierdoor stoppen. Verifieer de actuele productieconfiguratie vóór de release en bepaal of echte betalingen mogen worden geactiveerd. Voor live: eigen live-webhook op de productiebackend en bijbehorende live-secret/key veilig configureren. Gebruik geen sandboxcredentials. Bestaande gedeelde testwebhook naar productie vereist afzonderlijke afhandeling. De teststand van productie niet stilzwijgend behouden of omzetten.

## Uitvoering zodra betalingsconfiguratie is opgelost

1. Vergelijk actuele main met PR en controleer gewijzigde bestanden en CI.
2. Controleer dat productie key, webhooksecret en expliciete live-modus overeenkomen. Toon geen geheimen in uitvoer.
3. Publiceer frontend en Convex vanuit dezelfde goedgekeurde revisie; bevestig deploymentstatus.
4. Controleer login, accountmenu en contactfoutpagina met toegestane accounts. Geen echte betaaltransactie zonder concrete autorisatie.
5. Noteer commit, deployment en verificatie in werklog.

Bij fouten: herstel de vorige goedgekeurde code/configuratie als samenhangende release. Draai wallettransacties niet terug via databaseherstel.

Nog open: exclusieve sandbox-browseraankoop en gerichte schrijfpoging vanuit B-browser (integratietests bestaan wel). De onderstaande historische voorbereiding is ingehaald door LG-097.

## Actuele configuratiecontrole LG-094

13 september 2026: productie nog testkey, webhooksecret aanwezig, geen expliciete geldige mode. Testwebhook naar huidige marketplace-productie actief. Live-dashboard bevat geen webhook naar de huidige marketplacebackend; andere actieve bestemmingen horen bij abonnementen en Cashflow. Dus eerst live-key/live-webhooksecret en endpoint voorbereiden, daarna samen met code en expliciete live-modus publiceren. Accountstatus in read-only API meldt betalingen/uitbetalingen ingeschakeld, maar bewijst niet dat deze marketplace live kan afrekenen. Geen configuratie gewijzigd.

## Afronding LG-097 — 13 september 2026

Productie gepubliceerd via PR #73 (b892c6c8369fccfa9a62a6ddeb9274057af2db3d). Vercel dpl_CJSkaxxm2usLDtiTayqCYGVdJrA3 is READY, target production; buildlogs bevestigen geslaagde schema-validatie en Convex-deploy gevolgd door frontendpublicatie.

Live Stripe-bestemming we_1UFInFEPjKUovbQKqLWOS0De aangesloten op productie. Eigen restricted key LeadFlow Marketplace Production heeft Checkout Sessions schrijven. Productievariabelen STRIPE_SECRET_KEY, STRIPE_MARKETPLACE_WEBHOOK_SECRET en STRIPE_MARKETPLACE_MODE=live ingesteld; SITE_URL is https://leadflow.wetry.app. Geen geheimen in documentatie. Oude testbestemming we_1ToRfjEPjKUovbQKGToVtHqp naar productie uitgeschakeld; overige appbestemmingen ongemoeid.

Configuratieproef: live Checkout aangemaakt met metadata.kind=configuration_check, zonder klant/bedrijfkoppeling, en direct onbetaald verlopen gemaakt. Geen walletbijschrijving of echte betaling. Productie-CRM en /feed/wallet laden met bestaande super-adminsessie; tegoedpagina toont saldo en opwaardeerbediening. Accountmenu en contactfoutpagina eerder in staging gecontroleerd, niet opnieuw met productie-testaccounts.

Open: volledige echte betaling inclusief live-webhook en eenmalige walletbijschrijving nog niet bewezen. Ook exclusieve sandbox-browseraankoop en gerichte schrijfpoging vanuit B-browser blijven apart open. Aanbevolen vervolg: gebruiker doet één kleine live-opwaardering via Tegoed; daarna betaling, webhook en wallet gezamenlijk controleren.

## Eerste livebetaling bevestigd — LG-098

13 september 2026 21:24:51 CEST: gebruiker betaalde EUR 10. Stripe-event evt_1UFJ1DEPjKUovbQKteJAx2Kr (checkout.session.completed) is live, paid/complete, EUR 10 en marketplace_topup; levering aan de productiebackend is HTTP 200 received=true. Sessie komt overeen met de terugkeer-URL van de gebruiker. Wallet toont saldo EUR 10 en één opwaardering EUR 10. Hiermee is de eerder genoemde open livebetaalproef afgerond. Geen liveherlevering uitgevoerd; bescherming tegen dubbele levering is eerder in sandbox bewezen. Volgende stap: exclusieve sandboxaankoop en daarna interne praktijkpilot. Geen extra betaling nodig.
