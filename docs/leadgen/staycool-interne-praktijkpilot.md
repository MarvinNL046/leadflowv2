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

