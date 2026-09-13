# Publicatievoorbereiding — 13 september 2026

PR: https://github.com/MarvinNL046/leadflowv2/pull/73
Branch: fix/marketplace-stripe-mode
Status: concept; nog niet publiceren naar productie.

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

Nog open: exclusieve sandbox-browseraankoop en gerichte schrijfpoging vanuit B-browser (integratietests bestaan wel). Deze voorbereiding is geen productiepublicatie.
