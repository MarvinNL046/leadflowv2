# Vervolg: datagedreven airco-advies

Status: plan, 12 september 2026. Gebaseerd op de door Marvin aangeleverde blauwdruk; voorbeeldcijfers zijn niet als productiedata overgenomen.

## Wat we hergebruiken

De bestaande Next.js-site, bedrijfsdirectory, LeadFlow v2-intake en verificatie blijven de basis. De installatiepagina is de eerste complete route. Doel is bruikbare, bevestigde aanvragen die afnemers kunnen opvolgen; klikken en pagina-aantallen zijn tussensignalen.

## Eerst een kleine lokale proef

Kies twee of drie plaatsen op basis van echte afnemersdekking en beschikbare bronnen. Controleer bestaande regionale routes en zoekvragen vóór een nieuwe URL wordt gemaakt. Publiceer pas wanneer de pagina lokaal iets toevoegt: actuele broninformatie, geschikte bedrijven en praktische voorbereiding voor de aanvrager.

Per feit leggen we waarde, eenheid, toepassingsgebied, bron-URL, brondatum, controledatum en status vast. Onbekend blijft leeg; geen AI-schatting presenteren als lokaal feit. Vergunninginformatie hoort bij concrete omstandigheden (adres, monument, plaatsing), niet bij één gemeentelijke ja/nee-schakelaar. Woningstatistiek bewijst geen isolatiekwaliteit van een individuele woning. Netcongestie is geen zelfstandig advies voor een bepaald aircosysteem.

Voorbeeld van een intern bronrecord (geen gepubliceerde claim):

```json
{
  "citySlug": "nog-te-kiezen",
  "topic": "buitenunit-plaatsing",
  "claim": null,
  "scope": null,
  "sourceUrl": null,
  "sourcePublishedAt": null,
  "checkedAt": null,
  "status": "research-needed"
}
```

Publicatie vereist gecontroleerde inhoud, een werkende aanvraagroute en een laatste controle van de bronnen. Aantallen actieve installateurs, reviews, tarieven en wachttijden moeten op echte en actuele gegevens steunen. Geen automatisch vaste aantallen offertes of reactietijden beloven.

## Calculator na vakinhoudelijke validatie

Werk eerst met Marvin de invoer, rekenmethode en grenzen uit. Ruimteafmetingen, isolatie, glas, ligging en gebruik kunnen nuttige invoer zijn; een simpele oppervlaktefactor mag niet als definitief dimensioneringsadvies worden gepresenteerd. Toon aannames en een indicatiebereik. Een prijsindicatie vraagt daarnaast actuele tariefgegevens met omschreven montagepakket. Rekenregels pas activeren na toetsing aan praktijkgevallen. Vraaggegevens kunnen vervolgens als toelichting meegaan naar de monteur.

## Verdienen en meten

Leg met bestaande afnemers vast: regio, capaciteit, acceptatiecriteria, exclusief/gedeeld, prijs en afhandeling van ongeldige aanvragen. De genoemde €30–€80, abonnementsbedragen en partneruitbetalingen uit de blauwdruk zijn nog niet geverifieerd. Er zijn geen externe leadnetwerken gekoppeld of leads aan nieuwe partijen gestuurd.

Volg uiteindelijk per bron: ingediend, bevestigd, geaccepteerd/verkocht, opbrengst en afwijzingsreden. Houd kosten en dubbele aanvragen apart. De huidige teller meet alleen de homepage; de installatiepagina is bij individuele leads herkenbaar via de paginabron. Een volledige omzetrapportage is vervolgwerk.

## Zoekkwaliteit

Google geeft geen garantie op indexatie of ranking op basis van een calculator, lange bezoektijd, SSG of een vast aantal steden. Het beleid richt zich op onder meer grootschalige inhoud zonder toegevoegde waarde en doorverwijspagina's. Bron: https://developers.google.com/search/docs/essentials/spam-policies#scaled-content (gecontroleerd 12 september 2026).

Volgende concrete stap na de installatiepagina: afnemersdekking en één lokaal brondossier vaststellen, daarna een calculatorproef met door Marvin gevalideerde uitgangspunten.

