# Centrale bedrijfsrechten — 12 september 2026

Deze update ondersteunt LeadFlow als zelfstandig CRM- en marketingplatform met een optionele leadmarktplaats. Een bedrijf kan eigen contacten en leads beheren zonder marketplace-aankopen. De centrale platformbeheerder staat los van bedrijfsbeheerders.

## Rechtencontract

| Actie | Member | Admin | Owner |
|---|---|---|---|
| Eigen bedrijfscontacten, notities, taken en verkoopkansen beheren | Ja | Ja | Ja |
| Marketplace-aanbod en ontgrendelde bedrijfsleads bekijken bij toegelaten organisatie | Ja | Ja | Ja |
| Leads kopen, tegoed opwaarderen, werkgebied/meldingen instellen | Nee | Ja | Ja |
| CRM-instellingen, AI-configuratie, pipelinedefinitie en custom-velddefinities aanpassen | Nee | Ja | Ja |
| Workflows, campagnes, segmenten, mailsjablonen en campagnebacklog wijzigen | Nee | Ja | Ja |
| Campagne starten, plannen of een testmail sturen | Nee | Ja | Ja |
| Bedrijfsafbeeldingen uploaden en opgeslagen afbeeldings-URL opvragen | Nee | Ja | Ja |
| Ander bedrijf beheren zonder lidmaatschap | Nee | Nee | Nee |
| Centraal platform-leadgenbeheer en intake-sleutels | Alleen afzonderlijke platformadminbevoegdheid | Alleen afzonderlijke platformadminbevoegdheid | Alleen afzonderlijke platformadminbevoegdheid |

Owner en admin hebben momenteel dezelfde operationele beheerrechten. Overdracht van eigendom, teamuitnodigingen en rolwijzigingen zijn nog geen selfservicefunctionaliteit. Een platformadmin krijgt geen algemene bypass op bedrijfsgegevens; de bestaande Staycool-bootstrap geeft de huidige platformadmins apart hun eigen lidmaatschap.

Het bedrijfsgrensmodel is expliciet organisatiebreed: het optionele membership.workspaceId kiest een standaardwerkruimte, geen afzonderlijk afgesloten afdeling. Workspaces binnen één organisatie zijn dus niet onderling privé. Bij marketplace-resolutie wordt nu wel gecontroleerd dat de gekozen workspace daadwerkelijk bij die organisatie hoort. De eerste toegankelijke marketplace-organisatie blijft de actieve koper; een expliciete organisatieswitch volgt later.

## Implementatie en bereik

`convex/lib/permissions.ts` bepaalt centraal identiteit, organisatielidmaatschap en beheerrechten. De bestaande workspacehelpers in contacts, tasks, opportunities, workflowExecutions, crmSettings, aiAgentConfig, pipelines, workflows, customFields, emailTemplates, emailBacklog, segments en broadcasts gebruiken deze controle. Integratiebeheer gebruikt dezelfde centrale controle. Marketplace-aankopen, opwaarderingen en voorkeurmutaties controleren beheerrechten serverzijdig, los van de UI.

Sidebar, CRM-beheerpagina's, pipelinehernoemen, marketplacevoorkeuren, onboarding, opwaarderen en de koopbevestiging volgen de beperkingen. Medewerkers kunnen verkoopkansen blijven verplaatsen; het veranderen van pipelinenamen of fases is beheerwerk.

Twee extra gevonden relatieproblemen zijn hersteld: een nieuwe verkoopkans mag geen pipeline uit een andere workspace gebruiken, en een campagne mag geen segment uit een andere workspace gebruiken. De verzendpijplijn controleert de campagne/segmentrelatie ook opnieuw. Een bestaande inconsistente verkoopkans mag geen gekoppeld contact uit een andere workspace bijwerken.

Uploads gaan nu via een geautoriseerde action met bytes, niet via een door de client aangeleverd storageId. Het bedrijf, de workspace en uploader worden opgeslagen in de nieuwe companyImages-tabel; de rechten worden voor opslagregistratie opnieuw gecontroleerd. De oude directe upload-URLfunctie weigert gebruik; oude open tabs moeten vernieuwd worden. PNG/JPEG/WebP-bestandssignaturen en maximaal 5 MB worden serverzijdig gecontroleerd. Dit is geen volledige afbeeldingsdecoder of malwarescan. SVG/HTML zijn niet toegestaan. Bestaande afbeeldingslinks in mails blijven behouden; er wordt geen bestaande opslag verwijderd of gemigreerd.

Mailafbeeldingen zijn bewust publiek bereikbaar voor ontvangers. Deze voorziening is niet geschikt voor vertrouwelijke documenten. Afgeschermde bijlagen, quota en misbruiklimieten blijven apart werk.

## Validatie

381 tests in 42 bestanden geslaagd, inclusief 13 nieuwe bedrijfsrechtentests met twee fictieve bedrijven en een UI-test voor de geblokkeerde koopknop. Gecontroleerd: owner/admin toegestaan, member en ander bedrijf geweigerd, platformadmin zonder lidmaatschap geen bypass, dagelijks CRM-werk toegestaan, buitenlandse pipeline/segment geweigerd, behoud van saldo bij geweigerde koop, geen providerverkeer bij geweigerde actie, uploads/URL-resolutie per bedrijf, ongeldige afbeeldingsinhoud, rechtenintrekking en onjuiste marketplace-workspace.

Convex-TypeScript en Vite-productiebuild geslaagd. De algemene TypeScriptcontrole heeft dezelfde bestaande fouten als vóór deze ronde (regelnummers in een aangepast bestaand testbestand verschoven); geen nieuwe diagnostiek door deze update. Tests gebruiken uitsluitend lokale fictieve gegevens en gesimuleerde providers. Geen productieaccounts, rollen, betalingen, berichten of uploads aangemaakt; oude gepauzeerde aanvragen blijven gepauzeerd.

## Open en vervolg

De transportlaag voor berichten, agenda en suitekoppelingen bevat nog globale instellingen en Staycool-defaults. Deze update regelt wie acties mag uitvoeren; hij maakt nog niet alle externe diensten geschikt voor meerdere bedrijven. Daarom externe bedrijfsregistratie nog niet breed openen.

Aanbevolen volgende stap: bedrijfsgebonden afzenders en koppelingen scheiden met een veilige toestand voor bedrijven zonder configuratie. Daarna bedrijfsregistratie, uitnodigingen en expliciete organisatiekeuze. Platformbrede auditlogging, fijnere marketing-/inkooprechten, private bijlagen en operationele quota volgen als afzonderlijke onderdelen. Bestaande geplande systeemacties worden door een latere rolwijziging niet automatisch ingetrokken.
