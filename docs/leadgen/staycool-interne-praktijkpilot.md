# Staycool interne praktijkpilot — 13 september 2026

Marvin heeft Staycool gekozen als interne pilot. Doel: dagelijkse bruikbaarheid, inrichting en supportbelasting meten voordat externe bedrijven starten. Deze pilot bewijst geen betalingsbereidheid en telt niet als betalende klant. Bestaande Staycool-accounts en koppelingen blijven het uitgangspunt; maak geen duplicaatbedrijf en gebruik de A/B-testbedrijven niet als praktijkresultaat.

## Meetperiode en registratie

Voorstel: 13 t/m 27 september 2026; de datums zijn aanpasbaar in het meegeleverde Staycool-pilot.xlsx. Dit is een registratieperiode, geen automatisch gepland evaluatiemoment. Het bestand bevat Pilot, Kosten en Tijd. De gele velden zijn invoer; berekeningen staan daarbuiten. De werkversie staat bij deze Codex-taak in outputs/staycool-pilot/Staycool-pilot.xlsx.

- Kosten: servicedatum, categorie, bronbedrag exclusief btw, onderbouwd aandeel Staycool en factuur-/bronreferentie. Verdeel een factuur die meerdere perioden omvat over de juiste servicedatums; boek geen volledige maandfactuur zonder toelichting op een halve pilotperiode. Vermijd dubbeltelling van dezelfde factuur.
- Tijd: datum, soort werk, activiteit, werkelijke minuten en resultaat. Splits onboarding, support, herstel en evaluatie. Ontwikkeltijd aan algemene productfeatures hoort niet automatisch volledig bij Staycool.
- Het interne uurtarief EUR 30 is een expliciete aanname uit het eerdere voorstel. Pas dit aan zodra een onderbouwd tarief beschikbaar is. Tijdkosten zijn daarmee een raming, ook wanneer minuten gemeten zijn.
- Onbekende kosten blijven leeg. Is een kostensoort werkelijk nul, leg dan een nulregel met bewijs vast. Alleen regels 6–205 tellen mee; verleng bij meer regels eerst de formules.
- Zet de twee volledigheidsvelden pas op Ja nadat providerkosten en tijdregistratie zijn gecontroleerd. Het bestand toont geen definitief periodebedrag zolang gegevens ontbreken. Er wordt geen omzet of marge voor een betalende klant afgeleid.

## Praktijkroute

1. Controleer in LeadFlow, Cashflow en Frostwork de Staycool-bedrijfsnaam en het eigen account. De bestaande legacy-koppeling hoeft niet opnieuw via een uitbreidingsaanvraag te lopen. De nieuwe eigenaar-aanvraagflow blijft bedoeld voor bedrijven zonder bestaande suite.
2. Kies één bestaand eigen CRM-traject en noteer uitsluitend een interne referentie in het meetbestand. Controleer contact, pipelinefase, taak en opvolging. Start de tijdregistratie bij het begin van de handeling.
3. Open de bijbehorende eigen conceptofferte in Cashflow, controleer klant en bedragen en heropen na een eventuele conceptwijziging. Houd verzending, definitief maken en betalingen als afzonderlijke acties met een echte bedrijfsafspraak.
4. Voer een passende praktijkstap in Frostwork uit, bijvoorbeeld een eigen werkbon voorbereiden. Noteer wat lukt, wat handmatig moet en eventuele foutmelding. Zet de stap alleen op Gereed met een datum en resultaat.
5. Sluit iedere gebruikte dag af met kosten en supportminuten. Vermeld blokkades en volgende actie. Voeg geen klantnamen, telefoonnummers of e-mailadressen toe aan het meetbestand als een interne referentie volstaat.
6. Evalueer na de meetperiode: aantal afgeronde trajecten, terugkerende blokkades, minuten per activiteit, totale kosten en benodigde begeleiding. Kies daarna herstel, een verlengde interne proef of één externe pilot.

## Startstatus

Interne pilotkeuze is bevestigd. Meetbestand en werkinstructie zijn gereed. Er zijn nog geen werkelijke kosten, supportminuten of afgeronde Staycool-praktijktrajecten aangeleverd. De bedrijfscontext en functionele stappen staan daarom open in het meetbestand. De eerdere A/B-isolatietests blijven technisch bewijs, geen Staycool-praktijkgebruik.

De eerdere marketplace-pilot voor airco-installatie in heel Limburg staat apart beschreven in staycool-pilot-20260912.md. De daarin genoemde sms-ontvangst, betaalmodus en verkoopinstellingen worden door deze CRM-praktijkpilot niet als afgerond beschouwd of gewijzigd.

## Controle en vervolg

Het spreadsheet is geëxporteerd en alle drie tabbladen visueel gecontroleerd. Formules getest met tijdelijke invoer: EUR 20 x 50% kostentoerekening en 30 minuten x EUR 30/uur geven EUR 25 totaal. Bij ontbrekend aandeel verdwijnt het berekende bedrag; onvolledige registraties blijven gemarkeerd. Alle testinvoer is verwijderd. Niet in Microsoft Excel zelf doorgerekend; controle vond plaats in de spreadsheet-engine.

Eerstvolgende stap: samen één bestaand Staycool-traject kiezen en de eerste praktijkstap met werkelijk gemeten tijd vastleggen. Werkelijke facturen en verbruik toevoegen zodra beschikbaar. Externe prijsvalidatie volgt pas met een extern bedrijf.

## Eerste praktijkcontrole — 13 september 2026 (LG-064)

Interne casus P-001 is geselecteerd vanuit het Staycool-dashboard. De klantreferentie blijft uitsluitend in de lokale pilotnotitie; geen contactgegevens in dit document of het meetbestand.

| Onderdeel | Waargenomen resultaat | Open actie |
| --- | --- | --- |
| Bedrijfscontext | LeadFlow toont Staycool Airconditioning, Default, super-admin | Cashflow/Frostwork-context afzonderlijk controleren |
| Aanvraag | Bestaande websiteaanvraag voor verplaatsing van een eerder geplaatste airco | Service-/verplaatsingsvraag kwalificeren; geen generieke nieuwe installatieofferte aannemen |
| Pipeline en activiteit | Eén opportunity, fase Nieuw; Nog niet gebeld | Werkelijke contactuitkomst en volgende afspraak vastleggen |
| Automatische opvolging | E-mail en sms als records aanwezig; workflow Snelle Response Completed | Dit bewijst geen ontvangst of geboekte afspraak |
| Open taken | Geen taak voor P-001 zichtbaar in de open takenlijst | Eerst eventuele bestaande afspraak controleren, daarna passende opvolgtaak met eigenaar en datum |
| Suiteverwijzing | Contact toont 1 offerte en 0 facturen; Cashflow-link opent de algemene app | Eerst vaststellen of die offerte bij deze aanvraag hoort en concept is |
| Frostwork | Contact toont nog niet als klant | Bestaande klant zoeken voordat een duplicaat of werkbon wordt gemaakt |

De browsercontrole liep van 15:22:23 tot 15:24:49 UTC (17:22:23–17:24:49 CEST): 2 minuten 26 seconden verstreken agenttijd, inclusief navigatie en verwerking. Dit is geen gemeten menselijke supporttijd en is niet als personeelskosten in Tijd geboekt. Er zijn geen berichten verstuurd, telefoongesprekken gestart, taken afgevinkt of verkoopfasen gewijzigd.

Het meetbestand markeert bedrijfscontext en CRM-opvolging als Bezig; overige praktijkstappen blijven open. Kosten en menselijke supportminuten blijven onbekend. Eerste concrete vervolg: afspraakstatus controleren en de verplaatsingsvraag opvolgen, met eigenaar, datum en werkelijke uitkomst. Daarna de passende Cashflow-offerte en Frostwork-route controleren. Productverbeterpunt voor een volgende taak: vanuit een CRM-contact rechtstreeks de relevante offerte en open opvolgtaak kunnen openen.

## Opvolgtaken op een contact (LG-065, live sinds LG-066)

Open een contact en ga naar Opvolging. Lees eerst de bestaande taken en controleer de afspraakstatus. Vul voor een nieuwe taak de handeling in, vermeld de verantwoordelijke in de toelichting en kies zo nodig een uiterste datum. Taak opslaan maakt een interne taak; er wordt geen klantbericht gestuurd. Afronden sluit uitsluitend die taak, Heropenen maakt hem weer open. Een verkoopfase of afspraak verandert hierdoor niet. De lijst toont maximaal 50 recentste taken. Verantwoordelijke is voorlopig tekst, geen formele toewijzing of notificatie aan een teamlid. Deze interface is op 13 september 2026 live gepubliceerd en als normaal bedrijfsaccount getest.

## Publicatie en leads kopen — LG-066

Het opvolgblok is op 13 september 2026 gepubliceerd en in Chrome getest met een normaal testbedrijf: opslaan, herladen, afronden en heropenen werken. Eén synthetische testtaak is als afgerond bewaard.

Voor bedrijven zonder marketplace is een startscherm toegevoegd (live sinds 13 september 2026, PR #66): open Leads kopen in de sidebar. De eigenaar of beheerder kan de marketplace voor het eigen bedrijf activeren. Dit koopt geen lead. De bestaande standaardinstelling schakelt nieuwe-leadmeldingen per e-mail in; controleer daarna Werkgebied en meldingen, diensten en voorkeuren. Medewerkers vragen de eigenaar/beheerder om activering. Leadgenbeheer blijft alleen voor de platform-superadmin.


## Uitgevoerde marketplace-onboarding — LG-067

Op 13 september 2026 is het afzonderlijke testbedrijf A geactiveerd en ingericht op Airco / Installeren / Limburg, particulier en zakelijk, beide verkoopvormen. De voorkeuren zijn na opslaan opnieuw gelezen. E-mailmeldingen staan uit. De feed toont nul passende aanvragen; wallet EUR 0, geen transacties. Dit is technisch bewijs voor onboarding, niet een afgeronde Staycool-aankoop of betaalproef.

Bedrijven doorlopen: Leads kopen → Marketplace voor mijn bedrijf activeren → niche, type werk, segment en provincie kiezen → voorkeuren opslaan → Werkgebied en meldingen controleren. Bij geen aanbod hoeven filters niet willekeurig verruimd te worden: controleer of er werkelijk geschikte gepubliceerde aanvragen zijn. Opwaarderen en lead kopen zijn afzonderlijke vervolgstappen met financiële gevolgen.

## Aankoopproef met synthetische gegevens — LG-068

Op 13 september 2026 slaagden 30 aankooptests in een geïsoleerde Convex-testdatabase. Drie gedeelde kopers krijgen elk een eigen CRM-contact/verkoopkans; een vierde wordt geweigerd zonder afschrijving. Een exclusieve koop sluit verdere verkoop uit. Na een gedeelde koop is exclusief niet meer mogelijk. De CRM-contacten zijn tussen de testbedrijven afgeschermd. De bestaande bron- en aanvraagtekstoverdracht is eveneens getest.

Dit verandert niets aan het live testaccount: saldo en aankopen blijven zoals ze waren. Echte Stripe Checkout en de volledige aankoop via een browser zijn nog niet getest. Volgende stap is een afzonderlijke stagingproef met synthetisch aanbod en testbetaling.

## Taken aan teamleden toewijzen — LG-070

Bij een nieuwe opvolgtaak kies je Toewijzen aan. Bij een bestaande taak kies je de medewerker onder Verantwoordelijke. Niet toegewezen maakt de toewijzing leeg. De lijst bevat uitsluitend huidige teamleden van je bedrijf. De takenpagina toont wie verantwoordelijk is; er wordt nog geen automatische notificatie verzonden. De eerdere vrije tekst blijft bewaard, maar de keuzelijst is de formele toewijzing.

Bij een contact opent Klant & offertes de bijbehorende Cashflow-klant in je ingelogde Cashflow-bedrijf. Kies daar de juiste offerte. Een ontbrekende koppeling toont de bestaande niet-gevondenmelding. Deze route maakt geen klant of offerte aan en verleent geen Cashflow-toegang.

## Mijn taken — LG-071

Open Taken: standaard zie je de open taken die aan jouw account zijn toegewezen. Alle open taken toont de werklijst van je workspace; Niet toegewezen toont taken die nog geen verantwoordelijke hebben. De telling hoort bij de geselecteerde weergave, terwijl de sidebar alle open taken blijft tellen. Via het contact kun je een verantwoordelijke kiezen. Een lege lijst bij Mijn taken betekent niet dat alle bedrijfsopvolging afgerond is. Bij 300 resultaten wordt de begrenzing vermeld.

## Cashflow openen: juiste bedrijfsaccount — LG-072

Gebruik in Cashflow het bestaande account van het bedrijf waarin de klant en offertes staan. Een LeadFlow-superadminrol bewijst geen gekoppeld Cashflow-bedrijf. Verschijnt Welkom bij Cashflow met bedrijfsregistratie, maak dan niet voor deze controle opnieuw een bedrijf aan: meld aan met het bestaande Cashflow-account. Open daarna opnieuw Klant & offertes vanuit het LeadFlow-contact, zodat de klantverwijzing weer wordt meegegeven. Controleer de klantnaam en kies vervolgens de juiste offerte; de teller in LeadFlow bewijst op zichzelf niet dat een offerte bij de huidige aanvraag hoort.

Browserproef op 13 september 2026: de link bereikt Cashflow, maar de huidige sessie landt op onboarding. Klantdetail en offerte zijn daardoor nog niet live geverifieerd. Er is geen bedrijf, klant of offerte aangemaakt of gewijzigd.

LG-073: op Welkom bij Cashflow staat bovenaan Uitloggen. Gebruik deze knop om naar het inlogscherm te gaan en met het bestaande bedrijfsaccount aan te melden. Open daarna opnieuw Klant & offertes in LeadFlow.

## Klant/offertecontrole afgerond — LG-074

Op 13 september 2026 is de eerder vastgestelde LeadFlow-klantdeeplink geopend binnen het bestaande Staycool-Cashflow-bedrijf. De juiste klant en diens offertedetail openen succesvol. De offerte is verlopen en dateert van februari, vóór de aanvraag van september. Gebruik de suite-teller daarom alleen als klanthistorie: controleer altijd status, datum en werkzaamheden voordat je aanneemt dat de huidige aanvraag al een offerte heeft. Er is niets verstuurd of gewijzigd. Open blijft: afspraakstatus controleren en vaststellen of een nieuwe of aangepaste offerte nodig is. Productvervolg: offertestatus en datum zichtbaar maken bij de LeadFlow-suiteverwijzing.

## Offertehistorie in LeadFlow — LG-075

Bij het contact toont de Cashflow-kaart naast de aantallen de meest recente offerte met nummer, status en datum. De datum volgt Cashflow: verzenddatum, of bij een concept het aanmaakmoment. Verlopen wordt op dezelfde manier berekend als in Cashflow. Controleer via Klant & offertes de werkzaamheden: de meest recente offerte van de klant hoort niet automatisch bij de huidige aanvraag. De kaart wordt opnieuw opgehaald bij openen van het contact; het is geen continu bijgewerkte offerteweergave.
