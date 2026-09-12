# Accountrollen en bedrijfsregistratie — 12 september 2026

## Oordeel

LeadFlow heeft platformbeheerders en bedrijfsrollen, maar is nog niet klaar voor vrije onboarding van externe bedrijven. De gecontroleerde CRM-routes controleren organisatielidmaatschap; de fijnere verdeling tussen eigenaar, beheerder en medewerker is nog onvolledig. Dit is een gerichte code- en regressiecontrole, geen volledige penetratietest of garantie dat alle routes veilig zijn.

Alleen-lezen productiecontrole: twee app-profielen, beide super-admin, twee owner-lidmaatschappen in één organisatie. Eén organisatie heeft marketplace-toegang. Geen app-profielen zonder lidmaatschap. Dit telt LeadFlow-profielen, niet alle gebruikers in de gedeelde Clerk-instance. Geen accounts, rollen, lidmaatschappen of providerinstellingen gewijzigd.

## Wat gebeurt er bij registratie?

Clerk levert de identiteit; `userProfiles.getOrCreateUserProfile` maakt een LeadFlow-profiel. Een gewoon nieuw account krijgt `isSuperAdmin: false` en géén organisatie, workspace of bedrijfsrol. Het wacht op toewijzing. Er is nog geen complete selfservice-bedrijfsregistratie of uitnodigingsflow. De marketplace-onboarding stelt voorkeuren in voor een al toegelaten organisatie; die maakt geen bedrijf aan.

Super-admin staat los van de rol binnen een bedrijf. De bootstrap kent aan geverifieerde adressen in de super-adminconfiguratie automatisch platformrechten en Staycool-ownerlidmaatschap toe. Bestaande super-adminprofielen behouden hun rechten. De configuratie en persoonlijke/bedrijfsaccountscheiding verdienen een afzonderlijke review; deze audit heeft geen toegang ingetrokken of uitgebreid.

## Huidige rechten na deze wijziging

| Account | Bereik |
|---|---|
| Nieuw account zonder lidmaatschap | Eigen profiel; geen CRM-data of marketplace-toegang |
| Bedrijfseigenaar (`owner`) | CRM van eigen organisatie; koppelingen beheren; marketplace voor eigen organisatie inschakelen |
| Bedrijfsbeheerder (`admin`) | In gecontroleerde routes grotendeels dezelfde bedrijfsrechten als owner, geen platformbeheer |
| Medewerker (`member`) | CRM lezen/bewerken binnen de organisatie; bij ingeschakelde marketplace ook kopen en voorkeuren wijzigen. Geen Meta/WhatsApp-beheer meer na deze wijziging |
| Platformbeheerder (`isSuperAdmin`) | Centraal leadgenoverzicht en intake-API-sleutels; dit is geen gewone bedrijfsadminrol |

Organisatielidmaatschap geeft in veel CRM-helpers toegang tot alle workspaces van die organisatie: het optionele `membership.workspaceId` is daar geen afzonderlijke beveiligingsgrens. Een aparte read-onlyrol bestaat niet. De rollen zijn daarom nog geen fijnmazig rechtenmodel.

## In deze ronde hersteld

1. Publieke Meta-formuliersynchronisatie en WhatsApp-koppelen/statusacties misten controle op de aanroeper. De interne resolvers controleren nu identiteit en owner/admin-lidmaatschap van de doelorganisatie vóór providerverkeer. Gewone leden en buitenstaanders worden geweigerd.
2. Integratiequeries en mutaties eisen nu owner/admin. De OAuth-start, callback en databasecommit controleren die rol. Rechten die tijdens OAuth verdwijnen worden opnieuw beoordeeld. De actor bij callback komt uitsluitend uit gecontroleerde, ondertekende state.
3. WhatsApp- en Meta-formulierwrites controleren de rechten opnieuw na een providerresponse. Een reeds gestarte providerbewerking kan niet achteraf worden teruggedraaid, maar ingetrokken rechten geven geen toegang tot een volgende databasewrite.
4. Een onbekend CRM-contact stopt de suite-samenvatting voordat Cashflow/Frostwork worden aangeroepen.

De wijzigingen breiden geen rechten uit. Ze beperken bestaand integratiebeheer tot de daarvoor bedoelde bedrijfsrollen. Geen echte Meta/WhatsApp-koppeling, berichten of klantregistratie uitgevoerd; providertests zijn volledig gesimuleerd.

## Open vóór externe bedrijven toelaten

| Prioriteit | Werk |
|---|---|
| Hoog | Eén expliciete rechtenmatrix afdwingen op alle publieke CRM-/marketplacefuncties: wie mag kopen, tegoed beheren, bedrijfsvoorkeuren aanpassen, workflows/campagnes instellen en data exporteren? Huidige memberrechten zijn breed |
| Hoog | Berichten, agenda en suitekoppelingen per bedrijf isoleren. De huidige berichtcode en agenda gebruiken deels globale providerconfiguratie en Staycool-defaults; dit is geen generiek klantplatform |
| Hoog | Bestandsuploads/URL-resolutie aan een organisatie en eigenaar koppelen. `files.ts` controleert nu alleen ingelogde identiteit; nieuwe accounts mogen niet zonder bedrijfscontrole onbeperkt uploads doen. Mailafbeeldingen zijn bovendien bewust publiek bereikbaar |
| Hoog | Veilige bedrijfsaanmelding: nieuwe eigen organisatie met ownerrol, verificatie/toelating, gescheiden werkgebied en tegoed; nooit aansluiten op Staycool of platformadmin worden |
| Middel | Uitnodigen, intrekken, rolwijzigingen en auditlog; laatste eigenaar beschermen; platformadmin expliciet beheren i.p.v. uitbreiden via mailboxbootstrap |
| Middel | Meerdere organisaties/workspaces: expliciete actieve organisatie, gevalideerde workspace, overeenkomstige sidebar en UI. Marketplace kiest nu het eerste toegankelijke ingeschakelde bedrijf |
| Middel | Verder onderzoek naar uploadmisbruik, webhook-/integratiesleutels, bronclaiming bij leadroutes, sessie-/MFA-instellingen en overige publieke functies. Niet volledig afgedekt door deze ronde |

Aanbevolen vervolg: eerst het gedeelde serverzijdige rechtenmodel met twee fictieve testbedrijven en owner/admin/member-tests over CRM, marketplace, bestanden en communicatie. Pas daarna bedrijfsregistratie en uitnodigingen openen. De interface moet dezelfde rechten tonen als de server afdwingt.

## Controle en bronnen in de repository

`convex/accountAccess.test.ts` controleert nieuwe en onbevestigde accounts, toegang van een ander bedrijf, gewone leden, owner/admin-toegang met gesimuleerde providers, rechtenintrekking en onbekende contact-ID's. De bestaande marketplace-tests controleren koop- en afschermingsgedrag.

Bekeken: `userProfiles.ts`, `lib/identity.ts`, `lib/identityLogic.ts`, `auth.config.ts`, `schema.ts`, `marketplace/access.ts`, `marketplace/admin.ts`, `marketplace/apiKeys.ts`, `marketplace/purchase.ts`, `marketplace/buyerPreferences.ts`, CRM-lidmaatschaphelpers, `integrations.ts`, `metaOauth.ts`, `http.ts`, `crossApp.ts`, `files.ts`, `messaging.ts`, `googleCalendar.ts`, `aiAgentConfig.ts` en registratie-/sidebarcomponenten. Geen SEO-werk in deze ronde.

## Oplevering

Publicatiebevestiging LG-035: Vercel dpl_48Qvg8wXqVAN2DBjKerAGxWW9CGh READY, productiecommit 6c3680d9496caed8c8d91f7a7dc23faed2e83393. Live: 12 hervatknoppen en 0 pauzeerknoppen in Leadgenbeheer; beheerder kan Meta-status lezen. Twee anonieme queryverzoeken (leadgenbronnen en Meta-status) leveren geen gegevens en worden geweigerd; productiefoutdetails zijn afgeschermd. Autorisatieoorzaken en owner/admin/member-scheiding afzonderlijk geverifieerd met regressietests. Geen echte koppeling of bericht uitgevoerd. Openstaande aandachtspunten en aanbevolen rechtenmodel staan in de accountrollen-audit.

Validatie: 366 volledige regressietests en daarna 12 gerichte tests (367 unieke tests), Convex-TypeScript en Vite-build geslaagd. Algemene TypeScriptcontrole bevat bestaande fouten buiten het gewijzigde bereik; dat is niet als volledig groen aangemerkt.
