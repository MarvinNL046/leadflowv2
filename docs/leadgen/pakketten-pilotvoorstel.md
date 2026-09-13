# LeadFlow pakketten en upsells — pilotvoorstel

Datum: 13 september 2026. Status: intern voorstel, niet gepubliceerd of ingesteld als abonnement. Alle voorgestelde bedragen exclusief btw per bedrijf per maand. Dit zijn testprijzen op basis van positionering; kosten en betalingsbereidheid zijn nog niet gemeten.

## Aanbevolen aanbod

| Aanbod | Pilotprijs | Omvang |
| --- | ---: | --- |
| LeadFlow CRM | EUR 49/maand | Eén bedrijf, maximaal drie gebruikers; contacten, pipelines, taken en bestaande opvolgfuncties binnen het gecontroleerde pilotbereik |
| Cashflow uitbreiding | + EUR 19/maand | Eigen Cashflow-administratie, offertes en facturen; activering na koppeling aan hetzelfde bedrijf |
| Frostwork uitbreiding | + EUR 29/maand | Eigen Frostwork-omgeving voor de installatiepraktijk; alleen functionaliteit die voor de pilot is vrijgegeven |
| Complete combinatie | EUR 89/maand | CRM + Cashflow + Frostwork, drie gebruikers; EUR 8 voordeliger dan losse combinatie van EUR 97 |
| Extra gebruiker | + EUR 9/maand | Voorstel voor later; pas aanbieden zodra telling en handhaving zijn gebouwd |

Begin met maximaal vijf pilotbedrijven, maandelijkse afspraken en één helder aanbod met optionele uitbreidingen. Bouw nog geen drie verschillende CRM-niveaus. Gebruik de complete combinatie als bundel met dezelfde onderliggende productrechten, niet als een afzonderlijke organisatie of rol. Een gratis marketplace-account kan later als zelfstandige instap dienen; niet beloven voordat die toegang apart is afgeschermd.

## Wat apart wordt berekend

Leads zitten niet in het CRM-abonnement. De koper ziet per aanvraag de prijs voor gedeeld of exclusief vóór aankoop. Gedeeld betekent maximaal drie kopers totaal. Exclusief kan uitsluitend zolang de aanvraag nog niet is verkocht; na de eerste gedeelde verkoop vervalt die mogelijkheid. De server moet gelijktijdige aankopen atomair afhandelen en de gekozen prijs/verkoopvorm vastleggen. Deze notitie verandert geen bestaande leadprijzen, vervalregels of verkoopcode.

Stel leadprijzen per dienst en regio vast na meting van acquisitiekosten, bereikbaarheid, acceptatie en eventuele credits. Beloof geen onbeperkte leads of gegarandeerd volume. Communicatiekosten (sms, WhatsApp, e-mail), AI-gebruik en eventuele betaalproviderkosten vallen buiten onbeperkte bundels. Voor de pilot geldt een vooraf afgesproken gebruiksbudget; toon kosten en grenzen voordat verbruik in rekening wordt gebracht. Geen nieuw verbruikstarief vastgesteld in dit voorstel.

## Klantflow

1. Een bedrijf maakt een eigen account/organisatie aan. De bedrijfseigenaar beheert het eigen team; het gekozen pakket verandert niemand in platformbeheerder.
2. Onder Apps ziet de eigenaar de actieve uitbreidingen en de nog beschikbare uitbreidingen met prijs en uitleg.
3. Tijdens de pilot vraagt de eigenaar een uitbreiding aan. De platformbeheerder controleert bedrijf, koppeling en afspraak en activeert het product voor de afgesproken periode.
4. Actieve uitbreiding opent uitsluitend de gekoppelde eigen organisatie. Medewerkers krijgen hun bestaande functionele rechten binnen dat bedrijf.
5. Bij afloop wordt de verlenging of beëindiging verwerkt. Communiceer de bestaande maximale geldigheid van toegangsbevestigingen van vijftien minuten. Cashflow houdt bestaande lees-/exportregels; andere uitzonderingen worden niet stilzwijgend overschreven.

Voorbeelden van interfacecopy: 'Cashflow toevoegen — EUR 19 per maand. Maak offertes en facturen in je eigen administratie.' en 'Frostwork toevoegen — EUR 29 per maand. Breid je werkproces uit met je eigen Frostwork-omgeving.' Knop tijdens pilot: 'Uitbreiding aanvragen'. Toon geen directe betaal- of activatiebelofte zolang die flow niet bestaat.

## Rollen en rechten

| Wie | Bevoegdheid in dit voorstel |
| --- | --- |
| Platform-superadmin | Platformbeheer, inkomende leadverdeling en suite-activering volgens bestaande autorisatie |
| Bedrijfseigenaar | Eigen organisatie/team, uitbreidingen aanvragen, eigen aankopen en administratie |
| Medewerker | Alleen bestaande toegekende bedrijfsfuncties; geen suite-activering of platform-leadbeheer |

Producttoegang is een apart recht, geen gebruikersrol. Een betaalde bundel geeft nooit toegang tot andere bedrijven of platform-leadbeheer. Controleer zowel serverroutes als gegevensfuncties; alleen een verborgen menu is onvoldoende. De suite-koppeling en tijdelijke productrechten bestaan al. Automatische pakketfacturatie, gebruikerslimieten, aanvragenflow en synchronisatie bij betaling zijn hiermee niet geïmplementeerd.

## Implementatie na prijsbesluit

1. Leg een centrale versieerbare pakketcatalogus vast met prijzen, valuta, inbegrepen gebruikers en productrechten. Bewaar gekozen prijsversie bij de afspraak.
2. Bouw eerst de aanvraag/statusweergave in Apps met eigenaarcontrole en auditregistratie. Behoud handmatige activering voor de pilot.
3. Voeg pas daarna betaalautomatisering toe: idempotente betaalgebeurtenissen, afhandeling van mislukte betaling, einde periode en opzegging. Een betaalredirect alleen mag nooit producttoegang verlenen.
4. Test upgrade/downgrade, dubbele gebeurtenissen, verlopen toegang en strikte organisatiebinding. Leg supportprocedures vast voordat extra bedrijven starten.

## Meetplan en beslisregel

Meet per pilotbedrijf maandelijks abonnementomzet, hosting/communicatie/AI-kosten, betaalproviderkosten en supportminuten. Bereken bijdrage als omzet minus directe kosten minus supporttijd tegen een intern uurtarief. Richtwaarde voor deze pilot: minstens 60% bijdrage na die kosten; dit is een gekozen doel, geen huidige marge. Bij EUR 49 betekent dat maximaal EUR 19,60 kosten; bij EUR 89 maximaal EUR 35,60. Controleer daarnaast gebruik, activatie van uitbreidingen, reden voor opzegging en bereidheid om de volgende maand te betalen. Herzie prijzen en limieten na twee betaalde maanden, vóór brede publicatie.

## Marktcontext en grenzen

Pipedrive rekent per gebruiker en pakket; zie [officiële prijsuitleg](https://support.pipedrive.com/en/article/how-does-pricing-work-in-pipedrive). HighLevel werkt met platformpakketten en aanvullende gebruikskosten; zie [officiële prijzen](https://www.gohighlevel.com/pricing) en [billing guide](https://help.gohighlevel.com/support/solutions/articles/155000001156-highlevel-pricing-guide). Geraadpleegd 13 september 2026. Deze modellen ondersteunen de keuze om basisgebruik en variabele kosten te scheiden; ze bewijzen niet dat onze voorgestelde bedragen winstgevend zijn. LeadFlow wordt hier als eigen product aangeboden, niet als wederverkoop van HighLevel.

Volgende stap: het pilotaanbod en de kostenaanname toetsen, daarna de eigenaar-aanvraagflow bouwen. Publicatie van prijzen en automatische incasso zijn afzonderlijke uitvoeringsstappen.

## Kostentoets — 13 september 2026

In de projectdocumentatie is geen actuele, aan LeadFlow toegerekende hostingfactuur of supportregistratie aangetroffen. De werkelijke marge is daardoor nog niet vast te stellen. Onderstaande gevoeligheidsanalyse gebruikt expliciete aannames, geen gemeten kosten: EUR 30 intern per supportuur en EUR 10 overige directe kosten per bedrijf/maand. Communicatie/AI boven het budget wordt apart afgesproken.

| Support per bedrijf/maand | Totale aangenomen kosten | Bijdrage CRM EUR 49 | Bijdrage bundel EUR 89 |
| --- | ---: | ---: | ---: |
| 10 minuten | EUR 15 | EUR 34 (69%) | EUR 74 (83%) |
| 30 minuten | EUR 25 | EUR 24 (49%) | EUR 64 (72%) |
| 60 minuten | EUR 40 | EUR 9 (18%) | EUR 49 (55%) |

Bij een doel van 60% bijdrage en EUR 10 overige kosten past bij CRM EUR 49 ongeveer 19 minuten support per maand; bij bundel EUR 89 ongeveer 51 minuten. De losse uitbreidingen van EUR 19 en EUR 29 laten op diezelfde doelmarge maximaal EUR 7,60 en EUR 11,60 extra kosten toe. Dat maakt selfservice en heldere onboarding belangrijk. Eenmalige inrichting moet apart worden gemeten en over de verwachte klantduur worden verdeeld; die zit niet in de tabel.

Besluit voor de pilot: behoud de bedragen als hypothese, bied geen onbeperkte begeleiding aan en registreer vanaf het eerste bedrijf werkelijke providerkosten en supportminuten. Voor definitieve prijsvalidatie ontbreken nog de toegerekende maandfacturen, werkelijk communicatieverbruik en gemeten supporttijd. Die ontbrekende gegevens zijn geen nulbedragen. De aanvraagflow publiceert daarom nog geen prijs of koopknop.
