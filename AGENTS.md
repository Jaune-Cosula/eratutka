# AGENTS.md — Erätutka Development & Continuity Guidelines

Tämä tiedosto sisältää Erätutka-sovelluksen arkkitehtuuriohjeet, kriittiset asetukset ja säännöt, jotta tulevat AI-agentit ja kehittäjät eivät riko toimivia ominaisuuksia.

---

## 🚨 KRIITTISET SÄÄNNÖT (ÄLÄ RIKO NÄITÄ)

### 1. GPS Gateway & PULL-hakuosoite
* **Pääasiallinen PULL-osoite**: `http://35.206.111.214:8080/api/positions`
* Palvelin hakee pannan koordinaatit, nopeuden, akun, suunnan ja haukun suoraan tästä osoitteesta (`ICAR_JT808` / Micro GPS Gateway).
* **Kielletty**: Älä koskaan poista tai muuta tämän oletusosoitteen tukea tiedostoista `server.ts`, `src/App.tsx`, `src/types.ts` tai modaaleista.
* Palvelimen `pullFromMicroGateway`- ja `pullHistoryFromMicroGateway`-funktioiden tulee tukea sekä suoraa `/api/positions`-URLia että taustapalvelimen juuriosoitetta.
* **Numeerinen laitetunnus ei ole Tractive-token.** IMEI (`868123456789012`), SinoTrack-tunnus (`917088234567890`) ja AGENTS.md:n oma esimerkki (`7026216737`) ovat puhtaasti numeerisia. `extractTractiveToken`-funktio (kahdennettuna tiedostoissa `src/services/collarService.ts` ja `server.ts`) palauttaa `null` kaikille puhtaasti numeerisille merkkijonoille. Jos tämä ehto poistetaan, jokainen IMEI:llä varustettu panta luokitellaan Tractive-laitteeksi, `gwUrl` korvautuu osoitteella `my.tractive.com` ja **käyttäjän konfiguroima Micro GPS Gateway ohitetaan hiljaisesti**. Aito Tractive-tunnus sisältää aina kirjaimia (`6f212df630`) tai tulee jakolinkkinä, ja ne tunnistetaan URL- ja parametrihaaroista.
* **Älä parsia aikaleimoja käsin.** Pannat ja gatewayt lähettävät aikaleiman milloin sekunteina, milloin millisekunteina, milloin ISO-merkkijonona. Käytä aina `normalizeTimestampMs`-funktiota (`server.ts`). Pelkkä `Number()` tuottaa vuoden 1970 aikaleiman sekunneille ja `NaN`:n ISO-merkkijonoille — ja `NaN`-aikaleima hylkää **kaikki** reittipisteet historiasuodatuksessa (`ts >= cutoff` on aina epätosi) sekä näyttää laitteen ikuisesti vanhentuneena.

### 2. Koiratiedon säilyvyys ja vilkkumisen esto (`mergeDogLists`)
* Kun taustapalvelin pollaa GPS-dataa tai Firestore/BroadcastChannel päivittyy, **koiralistaa ei saa koskaan korvata tyhjällä tai vajavaisella taulukolla**.
* Käytä aina `src/utils/geoUtils.ts` -tiedoston `mergeDogLists`-funktiota, joka yhdistää telemetrian, reittihistorian ja käyttäjän tekemät asetukset säilyttäen olemassa olevat koirat.
* **Koiran identiteetti muodostuu vain tunnisteista, ei kuvauksista.** Sekä yhdistäminen (`mergeDogLists`) että poisto (`extractAllDogIdentifiers`, `isDogDeletedOnServer`) saavat verrata vain kenttiä `id`, `collarId`, `directGpsId`, `imei`, `tractiveTrackerId` ja `tractiveShareUrl` (sisältää Tractive-tokenin). Kentät `name`, `trackerModel` ja `tractivePetName` ovat **kuvauksia**, eivät identiteettejä: kun niitä käytettiin, yhden koiran poistaminen piilotti kaikki samannimiset koirat ja **kaikki saman pannamallin koirat** (toinen IK122-panta olisi kadonnut kartalta), ja yhdistäminen sulautti kaksi eri koiraa yhdeksi kadottaen toisen. Kahden eri koiran päätyminen tuplakappaleeksi on hyväksytty hinta: tuplakappaleen näkee ja voi poistaa käsin, kadonnut koira ei näy missään.

### 3. Käyttöliittymän asettelu ja Leaflet Zoom -painikkeet
* Kartan oikean reunan 3 kohdistusnappia (*Näytä kaikki*, *Seuraa kohdetta*, *Oma GPS*) ja Leafletin zoom-painikkeet (`+` ja `-`) ovat täsmälleen tasatut pystysuunnassa (oikea reuna `right-[10px]` ja leveys `40px` / `w-10`).
* Kohdistusnapit on sijoitettu luokalla `bottom-[124px] right-[10px] z-[1000]` ja zoom-painikkeet `.leaflet-bottom.leaflet-right` (`margin-bottom: 34px !important; margin-right: 10px !important;`).
* Tämä jättää Leafletin zoom-painikkeet esteettömästi näkyviin kohdistusnappien alapuolelle siistillä välillä ja estää painikkeiden päällekkäisyyden.
* Alareunan koordinaatti- ja koirainfopalkki (`bottom-2`) ja mobiilin alapalkki on sovitettu (`pb-[54px]`), jotta mikään tieto ei jää piiloon tai peity.

### 4. Full-stack & Palvelinarkkitehtuuri
* Sovellus on full-stack -sovellus: `server.ts` (Express) hoitaa GPS-ingestin, telemetrian välityksen ja MML-karttatiilien välityksen.
* Käynnistys ja build-skriptit `package.json`-tiedostossa:
  - `dev`: `tsx server.ts`
  - `build`: `vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs`
  - `start`: `node dist/server.cjs`
* Portti on aina `3000` (`0.0.0.0`).
* **Versiopäivitys on manuaalinen rituaali.** `VersionUpdateChecker` tarjoaa päivitystä vain kun palvelimen `ERATUTKA_VERSION` (`server.ts`) eroaa siitä versiosta, jonka sivu näki latautuessaan. Pelkkä palvelimen uudelleenkäynnistys **ei** enää laukaise päivitystä, joten **versio on nostettava jokaisessa julkaisussa**, jossa asiakkaiden halutaan lataavan sivu uudelleen. Pidä se samassa tahdissa `index.html`-tiedoston `<title>`-otsikon kanssa.
* **Uudelleenlatausta ei koskaan pakoteta.** Päivitys näytetään suljettavana bannerina ilman lähtölaskentaa, koska automaattinen uudelleenlataus tuhoaa kesken jahdin tallentamattoman tilan (mittarin mittaukset, kesken oleva merkintä, avoinna oleva dialogi). Älä palauta countdownia.

### 5. Jahtisession pääsynvalvonta (`huntKey`)
* Jokaisella jahtisessiolla on satunnainen 16 tavun **jahtiavain** (`huntKey`, 32 pientä heksamerkkiä). Se on capability-lippu: tunteminen = pääsy.
* **Firestore-polku on `sessions/{huntKey}`**, ei `sessions/{code}`. Avain on dokumentin ID, koska Firestore-säännöt eivät voi verrata asiakkaan lähettämää salaisuutta dokumentin sisältöön lukuoperaatiossa.
* `firestore.rules` sallii vain 32-merkkiset dokumentti-ID:t: `allow get: if sessionId.size() == 32;`, `allow list: if false;`, `allow create, update: if sessionId.size() == 32;`, `allow delete: if false;`. **Älä poista `list`-kieltoa** — se on ainoa esto sessioiden enumeroinnille. Sääntömuutos on vietävä Firebase-konsoliin erikseen; se ei aktivoidu pelkällä tiedostomuutoksella.
* Palvelimen relay- ja delete-endpointit vaativat `X-Hunt-Key`-otsikon (tai `(code, PIN)`-parin). Ei koskaan poistaa `requireSessionAccess`-tarkistusta.
* Jahtiavain generoidaan **palvelimella** (`POST /api/session/create`), samoin koodi. Palvelin tallentaa avaimen muistiinsa ja PINistä vain scrypt-tiivisteen.
* PIN ei saa koskaan päätyä verkkoon eikä jaettuun sessiotietoon: `stripSessionSecrets` poistaa sen ennen relay-pushia ja Firestore-kirjoitusta.
* Avain kulkee jakolinkin **fragmentissa** (`?huntCode=X#huntKey=Y`), ei query-parametrissa. Fragmenttia selain ei lähetä palvelimelle eikä välitä Referer-otsikossa.
* Session tilaus (`subscribeToSessionFirebase`) korvaa session tiedot jaetulla `sessionInfo`-objektilla, josta salaisuudet on siivottu. **Kun yhdistät sen `currentSession`-tilaan, säilytä `password` ja `huntKey` aiemmasta tilasta** (`App.tsx`), muuten avain katoaa ja synkronointi katkeaa.

#### Hyväksytyt rajoitukset
* Avaimen haltija voi kirjoittaa kaiken (myös poistaa koiria ja esiintyä jahtimestarina). Roolikohtaiset oikeudet vaatisivat jäsenkohtaiset tokenit.
* PIN-koodilla liittyminen vaatii, että palvelin muistaa session. Palvelimen uudelleenkäynnistyksen jälkeen `/api/session/resolve` ei tunne sessiota ja käyttäjää kehotetaan käyttämään jakolinkkiä — linkki toimii aina, koska se kantaa avaimen.
* Epäonnistuneet PIN-yritykset rajoitetaan 10 yritykseen / 5 min per jahtikoodi. Raja on koodikohtainen (ei IP-kohtainen), koska sovellus on välityspalvelimen takana ja kaikki clientit jakaisivat saman IP-osoitteen.

---

## 🧭 KESKEISET OMINAISUUDET JA TIEDOSTORAKENNE

### 1. Koirien seuranta ja tutka
* `src/components/DogRadarPanel.tsx`: Koiratutka HUD, kompassisuunta käyttäjästä koiraan, etäisyys (m/km), nopeusmittari, haukkutiheys (hakkua/min), matkamittari (odometer) ja akun varaus.
* `src/components/IcarSyncModal.tsx`: JT808 / ICAR / TK905 / OsmAnd / Traccar -pannansynkronointi ja testityökalut.
* `src/components/AddDogModal.tsx`: Uuden koiran lisäys (valmiiksi konfiguroitu Erätutka Direct GPS + Gateway).

### 2. Kartat ja merkinnät
* `src/components/MapContainer.tsx`: Leaflet-karttamoottori. Tukee Maanmittauslaitoksen maastokarttoja (MML WMTS), ilmakuvaa, avointa maastokarttaa ja tummaa tilaa.
* `src/components/AnnotationsPanel.tsx` & `AddAnnotationModal.tsx`: Passipaikat, saaliit, nuotiopaikat, riistahavainnot, vaara-alueet, loukut ja hirvitornit.
* `src/components/RulerPanel.tsx`: Mittaustyökalu (etäisyydet ja pinta-alat monikulmioina).
* `src/components/ImportMapDataModal.tsx`: GPX, KML ja GeoJSON -reittien ja maastomerkkien tuonti/vienti.

### 3. Jahti & Turvallisuus
* `src/components/TeamPanel.tsx`: Jahtiseurueen jäsenet, etäisyydet ja roolit (passimies, koiramies, jahtipäällikkö).
* `src/components/ShareSessionModal.tsx`: Reaaliaikainen jahdin jakaminen jakolinkillä (jahtiavain fragmentissa) sekä koodilla + PIN-koodilla. Näyttää ja kopioi jahtiavaimen.
* `src/components/SosModal.tsx` & `src/utils/audioAlerts.ts`: Hätähälytys (SOS), äänimerkit haukulle ja hätätilanteille.

---

## 🛠️ KEHITYSKÄYTÄNNÖT
1. **Linter ja Build**: Aja aina `lint_applet` ja `compile_applet` muutosten jälkeen.
2. **Ikonit**: Käytä vain `lucide-react`-kirjastoa (`import { ... } from 'lucide-react'`).
3. **Tyylit**: Tailwind CSS utility-luokat suoraan elementeissä. Älä luo erillisiä `.css`-tiedostoja.
4. **Varmistus**: Ennen tiedoston muokkausta käytä `view_file`-työkalua varmistaaksesi tarkan rivisisällön.
