# Apps en uitbreidingen — 13 september 2026

## Voor bedrijven

Open **Apps & uitbreidingen** in de sidebar (`/crm/apps`). LeadFlow blijft je CRM; Frostwork en Cashflow worden afzonderlijk per bedrijf afgesproken.

Een eigenaar of bedrijfsbeheerder kan op **Interesse in Frostwork** of **Interesse in Cashflow** klikken. De aanvraag wordt voor het bedrijf opgeslagen. Ook medewerkers zien daarna **Aangevraagd**. Herhaald klikken maakt geen dubbele aanvraag. Er wordt geen abonnement afgesloten, betaling uitgevoerd of toegang geactiveerd. De platformbeheerder bespreekt prijs, inrichting en toegang met het bedrijf.

Medewerkers kunnen zelf geen uitbreiding aanvragen. Een bestaande Staycool-bedrijfskoppeling toont de directe appknoppen; de doelapp blijft de eigen organisatie- en gebruikersrechten controleren. Een platformrol alleen verleent deze koppeling niet.

## Voor platformbeheer

Superadmins zien onderaan dezelfde pagina de gepagineerde uitbreidingsaanvragen met bedrijf, product en tijdstip. Bedrijfseigenaren en medewerkers kunnen deze lijst niet via de API lezen. Aanvragen zijn interesseverklaringen, geen betaalde of geactiveerde rechten. De eerste versie heeft geen automatische e-mail, afhandeling of activatieknop.

De bestaande twee superadmins en twee testaccounts zijn niet gewijzigd. Leadgenbeheer blijft superadmin-only. Nieuwe bedrijven behouden hun standaardrol en krijgen door deze wijziging geen marketplace-toegang.

## Gecontroleerde broncode en productiebranches

De lokale main-branches van de doelapps zijn niet de productieversies. Vercel rapporteerde:

| App | Productiebranch | Commit |
| --- | --- | --- |
| Cashflow | cashflow-360-hub | 1d7a9f820795167171b8c40c14788f3af54746ea |
| Frostwork | frostwork-summary-endpoint | 302b05dd8639e6b54c20290a0fa7071a0e14a8bf |

Cashflow gebruikt in deze branch Clerk, een eigen users.organizationId en billingAccess. Schrijven wordt na de proefperiode geblokkeerd als geen geldig abonnement bestaat **en** STRIPE_SAAS_PRICE_ID geconfigureerd is. Lezen/export blijven beschikbaar. Aanwezigheid van de productieprijs is in deze controle niet vastgesteld.

Frostwork controleert Clerk-organisatie, betaAllowed en de app-rol via orgMembers. De huidige organisatieaanmaak en provisioning zetten betaAllowed op true; dit is dus geen betaalde upsellpoort. Het billingontwerp uit juni is geen bewijs van huidige handhaving. Geen van beide doelapps is in deze wijziging aangepast of volledig op alle endpoints geaudit.

## Volgende implementatiefase: echte productrechten

1. Maak een expliciete koppeling tussen de LeadFlow-org, Frostwork-organisatie/Clerk-org en Cashflow-organisatie. Verifieer eigendom; koppel nooit uitsluitend op bedrijfsnaam of e-mailadres. Behoud bestaande bedrijven en abonnementen.
2. Leg per gekoppeld bedrijf en product de overeengekomen toegang vast met status, bron, eventuele einddatum en auditgeschiedenis. Onderscheid handmatige toegang, proefperiode en betaald abonnement. Een interesseaanvraag blijft een apart gegeven.
3. Laat doelapps deze rechten server-side afdwingen. Cashflow's bestaande facturering en lees/exportgedrag moeten bewust behouden of gemigreerd worden. Frostwork heeft een commerciële toegangspoort nodig naast gebruikersrollen. Geef superadmins geen automatische toegang tot andere klantorganisaties.
4. Maak provisioning en intrekken herhaalbaar met ondertekende serverberichten, replaybescherming en expliciete tenantcontrole. Een ingetrokken abonnement trekt geen historisch klantdatabezit in; bepaal lezen/export en schrijven afzonderlijk.
5. Vervang de legacy suite-API-sleutels door koppelingen per bedrijf voordat betaalde bedrijven cross-app samenvattingen krijgen. De bestaande LeadFlow-backend beperkt deze samenvattingen al tot de expliciet toegewezen legacy-organisatie; aanvragen wijzigen die beperking niet.
6. Test twee volledig onafhankelijke bedrijven, directe API-aanroepen, verval/intrekken en een dubbele betaalwebhook. Activeer commerciële verkoop pas nadat provisioning en handhaving samen bewezen zijn.

Deze fase levert de aanvraagroute en correcte LeadFlow-navigatie op. Er is nog geen centraal abonnement of automatische toegang over de drie apps.
