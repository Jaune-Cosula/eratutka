# Tietoturva-auditointi — 2026-10-14

**Menetelmä:** 14-agenttinen auditointi (7 aluetta × kartoittaja + adversiaalinen varmistaja). Jokainen löydös varmennettu koodia vasten; varmistaja yritti kumota sen ja säätää vakavuuden. Täysin read-only — koodiin ei koskettu.

**Alueet:** XSS/tulosteen koodaus · SSRF/lähtevät pyynnöt · pääsynvalvonta · Firestore-säännöt & dataluottamus · injektio & parserit · salaisuudet & tiedonvuodot · designmemojen adversiaalinen review.

> Kaikki alla olevat löydökset on **varmennettu koodista** (`confirmed`). Vakavuudet ovat varmistajan säätämiä.

---

## Juurisyyt

Kolme läpäisevää perussyytä selittävät suurimman osan löydöksistä:

1. **`server.ts`:ssä ei ole auth-middlewarea lainkaan** (vain body-parserit, rivit 9-10). Kaikki `/api/gps/*`, `/api/gateway/*`, `/api/collar/*`, `/api/tractive/*` ovat avoimia. Vain `/api/session/*`-relay ja -poisto tarkistavat avaimen.
2. **Karttanäkymä rakentaa HTML:ää merkkijonoina ilman escaapia** ja Leaflet renderöi ne `innerHTML`:llä (divIconit jopa ilman klikkausta). Ei CSP:tä.
3. **Jaettu sessiodata on client-kirjoitettavaa ja sitä luotetaan sokeasti**, ja koko `Dog`-rekordi kulkee osallistujille.

---

## Kriittiset

### K1 — Stored XSS karttamerkinnöissä (kaikki osallistujat)
**Alue:** xss-output · **Sijainti:** `MapContainer.tsx:688-745, 649-651, 808-870, 1016-1108`

Karttamarkkerit ja popupit rakennetaan raakana HTML:nä ja Leaflet parsii ne `innerHTML`:llä. Escaamattomia kenttiä: `dog.name/breed/trackerModel/collarId/addedBy/color`, metsästäjän nimimerkki, merkintöjen `title/description/createdBy`.

- **Matalin kynnys:** kuka tahansa jahtiin liittyvä asettaa oman nimimerkkinsä vapaana tekstinä (`HuntAuthModal.tsx:257`) → se välitetään kaikille ja renderöidään escaamatta (`MapContainer.tsx:813, 858`). `<img src=x onerror=...>` ajautuu **jokaisen** metsästäjän selaimessa **ilman klikkausta** (divIcon `innerHTML`).
- Seuraus: `localStorage['eratutka_session']` sisältää huntKeyn → **koko session kaappaus**, GPS/tokenien vienti.
- Ei CSP:tä, ei sanitoijaa missään.

**Korjaus:** HTML-escapaa kaikki interpoloitavat kentät tai rakenna popupit/ikonit DOM-solmuina (`L.popup().setContent(element)`). Lisää CSP ilman `unsafe-inline`. Sanitoi myös relaylla (puolustuksen syvyys).

### K2 — GPS-gatewayn HTTP-API täysin avoin (CORS `*`)
**Alue:** secrets-disclosure · **Sijainti:** `micro-gps-gateway/standalone-gateway.ts:1187-1290` (osoite julkinen repossa: `server.ts:640`, `AGENTS.md:10`)

Kuka tahansa internetissä:
- `GET /api/positions` (+`/api/devices`) → kaikkien pantojen IMEI + sijainti
- `GET /api/rawlogs/download` → raaka pakettiloki (IMEI, koordinaatit)
- `GET /api/history?id=<imei>` → reitti
- `POST /api/command` → **komento mihin tahansa pantaan**

Ei tunnistetta missään; CORS `*`. Tämä on **live nyt**, jos pannat ovat käynnissä.

**Korjaus:** HMAC/jaettu salaisuus kaikille reiteille (default-deny-gate, ks. M1), rajaa CORS, älä julkaise osoitetta repossa. Suunnittelu jo olemassa ([docs/tietoturva-hmac-suunnitelma.md](tietoturva-hmac-suunnitelma.md)).

### K3 — Komento-endpoint ilman authia = mielivaltainen komento + POST-SSRF
**Alue:** authz / injection / ssrf · **Sijainti:** `server.ts:1844-1873`, `forwardCommandToGateway` `1772-1841`

Ilman tunnistetta `POST /api/collar/command` `{deviceId, command, gatewayUrl}` → lähettää mielivaltaisen komennon pannalle (esim. nollaus, intervallin tiputus → akku tyhjä kesken jahdin). Koska `gatewayUrl` on hyökkääjän hallussa ja vastaus palautetaan, myös **POST-SSRF sisäverkkoon** (vastaus bodynä takaisin). Laitteet ovat enumeroitavissa K5:n kautta.

**Korjaus:** vaadi omistajarajattu auth; poista `gatewayUrl` pyynnöstä (kiinnitä palvelinpuolelle); rajaa komentokielioppi.

### K4 — Viewer-projektion ohi vuotaa `deletedDogIds`/`revivedDogIds` (raaka IMEI + Tractive-token)
**Alue:** design-memos · **Sijainti:** `server.ts:2507-2516`, `2299-2306`, `2088-2121`; `useDogTracker.ts:513-520`; `rooliprojektio-suunnitelma.md:26,77`

Kun kuka tahansa poistaa pannan jahdista, client lähettää tunnisteet (`collarId+imei+directGpsId+tractiveTrackerId+tractiveShareUrl`) → palvelin tallentaa ne `deletedDogIds`-listaan → **seuraava relay-GET palauttaa ne kaikille osallistujille**. Projektio `dogs[]`:sta on tehty tyhjäksi sisaruskentän kautta. Memo ei mainitse näitä kenttiä → suunnitelma sellaisenaan jättää kanavan auki.

**Korjaus:** avainna poisto-/elvytysrekisteri sessiokohtaiseen pseudotunnukseen ja lähetä relaylla vain pseudotunnukset. Lisää kentät projektion kattavuuslistaan.

---

## Korkeat

### H1 — SSRF joka puolelta hyökkääjän `gatewayUrl`:lla
**Sijainti:** `server.ts:690` (`pullFromMicroGateway`), `:1119` (historia), reiteiltä `/api/gateway/sync` (1555), `/api/gps/device/:id` (1450), `/api/gps/history/:id` (1390), `/api/collar/command` (1801)

Ei host-sallimalistaa, ei yksityis-/metadata-IP-estoa, uudelleenohjaukset seurataan (redirect-oletus). Hyökkääjä saa palvelimen hakemaan `http://169.254.169.254/...` tai `http://127.0.0.1:<port>/...` sisäverkosta. Osa vastauksesta heijastuu `rawPayload`ina (300 merkkiä). GCP-metadata vaatii `Metadata-Flavor`-otsakkeen (ei lähetetä), joten IMDS-rajoittuu, mutta sokea SSRF sisäverkkoon ja uudelleenohjausketjut toimivat.

**Korjaus:** keskitetty lähtevän URLin vartija: salli vain https (tai tunnettu gateway-host), hylkää yksityiset/loopback/link-local -IP:t myös DNS-resoluution jälkeen, `redirect:'manual'` + uudelleenvalidointi, host-sallimalista. Älä heijasta vastauksia.

### H2 — Ilman authia: GPS-ingestin väärennös
**Sijainti:** `server.ts:1382-1387`, `handleGpsIngest` `1253-1380`, `/api/gps/simulate` `1496-1552`

Kuka tahansa IMEIn tietävä (enumerointi H4:n kautta) syöttää `GET /api/gps/update?id=<uhri>&lat=...&isBarking=true` → väärentää sijainnin ja haukkuhälytyksen. Tuore väärennetty rekordi (<4 s) **estää aidon gateway-haun** (1459) → metsästäjät lähtevät äänettömän koiran perään. Haukku on turvallisuuskriittinen signaali.

**Korjaus:** vaadi allekirjoitettu ingest (`INGEST_SECRET`), sido laitetunnus omistavaan jahtiin, älä hyväksy sijaintikirjoituksia julkiselta reitiltä.

### H3 — Participant voi piilottaa toisen pannan koko seurueelta
**Sijainti:** `server.ts:2275-2326`; client-applikaatio `userService.ts:544`

Osallistuja (huntKey) tuntee toisen pannan tunnisteet (koko Dog jaetaan) → `POST /api/session/:code/dogs/delete {deletedIds:[<imei>]}` → panta katoaa **kaikilta**, eikä palaa ilman eksplisiittistä elvytystä. Toistettavissa. Firestoren `delete:false`-sääntö ei auta, koska merkitsevä tila on palvelimen muistissa.

**Korjaus:** rajaa poisto tekijään / pannan omistajaan; vaadi jäsenkohtainen token (suunniteltu) jaetun avaimen sijaan destruk​tiiviselle reitille.

### H4 — Anonyymi laitelistaus ja telemetrian luku
**Sijainti:** `server.ts:1487-1493` (`/api/gps/devices`), `1450-1483`, `1390-1432`

`GET /api/gps/devices` palauttaa **kaikkien** puskuroitujen pantojen `DirectGpsRecord`in — laitetunnus/IMEI, sijainti, `rawPayload` ja **`tractiveInfo.token`** (bearer-capability lemmikin sijaintiin). Tämä on se enumerointiprimitiivi, joka ruokkii H2:ta ja H1:tä.

**Korjaus:** poista tai autentikoi; jos lista tarvitaan, rajaa kutsujan jahtiin ja projisoi vain ei-arkaluontoiset kentät.

### H5 — Relay uudelleenrekisteröinti kaappaa session tunnetulla koodilla
**Sijainti:** `server.ts:2344-2355`

Hunt-koodi on tahallaan ei-salainen (kulkee query-parametrissa, `ShareSessionModal.tsx:41`), avain fragmentissa. Palvelimen uudelleenkäynnistyksen tai 24 h eviktion jälkeen sessio on poissa muistista. Hyökkääjä, joka on nähnyt koodin, `POST /api/session/<code>/relay` mielivaltaisella 32-hex-avaimella → ainoa tarkistus on formaatti-regex → **hyökkääjän avain asennetaan session avaimeksi**, hän voi kirjoittaa session tilan ja esiintyä jahtimestarina; oikean seurueen avain lakkaa täsmäämästä. Ei PINiä.

**Korjaus:** älä koskaan (uudelleen)luo sessiota clientin antamalla avaimella — vaadi code+PIN ennen eviktoituneen session palautusta; persisoi avain/hash Firestoreen.

### H6 — Pannan tunnukset (IMEI, SIM, gateway-URL, Tractive-token) jaetaan ja tallennetaan
**Sijainti:** `types.ts:35-48`; `server.ts:2509-2517`; `userService.ts:466-472, 746-844`

Koko `Dog`-rekordi välitetään kaikille osallistujille ja peilataan Firestoreen `sessions/{huntKey}` + localStorageen. `stripSessionSecrets` (`userService.ts:121`) koskee vain `sessionInfo`-objektia, **ei koskaan `dogs`-arrayta**. Osallistuja (tai linkin saanut) saa jokaisen metsästäjän pannan IMEIn, puhelinnumeron ja Tractive-tokenin. Sama kuin aiemmin todettu — tämä auditointi vahvistaa ja laajentaa (`ShareSessionModal.tsx:45` upottaa jakotekstiin myös PINin).

**Korjaus:** kytke viewer-projektio `saveSessionPartial`+`pushToLiveRelay`-polkuun (ei vain `sessionInfo`).

### H7 — Kovakoodattu oikea Tractive-token + authittomat proxy-endpointit
**Sijainti:** `server.ts:392-395, 1645, 1085`; `AddDogModal.tsx:102`

Repoon on committu Tractive-jakotoken (`6f212df630`), tracker-id (`EUUGEDYM`) ja lemmikin nimi (`Nirppu`). `/api/tractive/sync` **olettaa tähän tokeniin**, kun argumenttia ei anneta → anonyymi `GET /api/tractive/sync` hakee lemmikin live-sijainnin ja palauttaa sen. (Varmistaja ei voinut offline todentaa tokenin olevan yhä elossa.)

**Korjaus:** poista kovakoodatut tunnukset/oletusarvo; vaadi token pyynnöstä; kohtele jakotokeneita salaisuuksina.

### H8 — HMAC-memo kattaa vain 4 reittiä; gatewaylla on useampia
**Sijainti:** `tietoturva-hmac-suunnitelma.md:12`; gateway `1208,1218,1234,1246,1290,1367`

`/api/devices`, `/api/rawlogs/download`, `/raw_packets.log`, `/api/tracks`, `/api/positions/:id` jäisivät auki. **Korjaus:** tee allekirjoituksen vaatimuksesta default-deny-portti ennen reititystä, ei reittikohtainen; päivitä memo listaamaan kaikki reitit.

### H9 — HMAC ohitettavissa Erätutkan omien proxy-endpointtien kautta
**Sijainti:** `tietoturva-hmac-suunnitelma.md:131`; `server.ts:1408, 1453-1460, 1556-1561, 1844-1859`

Kun Erätutka pitää `GW_SECRET`iä, hyökkääjä kutsuu `GET /api/gps/history/<imei>?pullGateway=true` → palvelin allekirjoittaa ja hakee uhrin historian ja palauttaa sen hyökkääjälle. Sama `gatewayUrl`-SSRF. Memon sulkulista on vaill​inainen: puuttuvat `/api/gps/history/:id`, `/api/gps/device/:id` (ja `/api/gps/wake`, joka ei itse asiassa kutsu gatewayta — ei päde). **Korjaus:** laajenna sulkulista; hylkää kutsujan `gatewayUrl` kokonaan.

---

## Designmemojen aukot (muut)

- **H10 (medium)** – Projektio putoaa `collarId`iin (eli IMEIin), kun `trackerModel` puuttuu: `MapContainer.tsx:729` `${dog.trackerModel || dog.collarId}` ja useat muut `directGpsId || imei || collarId` -fallbackit → pelkkä projektio ei riitä, myös nämä fallbackit on siivottava.
- **M (medium)** – `INGEST_SECRET` `/api/gps/update`ssa rikkoo appin dokumentoidun allekirjoittamattoman laite-ingestin → tarvitaan siirtymä.
- **M (medium)** – Nonce-tarkistus ennen allekirjoituksen varmennusta ja ilman rajaa → authittoman muistinkasvun mahdollisuus 60 MB:n VM:llä; siirrä nonce-tallennus var­mennuksen jälkeen ja rajaa/eviktoi.
- **M (medium)** – Gatewayn `sendCommand`-fallback (yksi socket) toimittaa allekirjoitetun komennon **väärälle** pannalle; HMAC varmentaa pyynnön, ei toimituskohdetta.
- **M (medium)** – HMAC antaa vain pyynnön eheyden; gatewayn **vastaukset ovat allekirjoittamattomia** selkokielisenä → muokattavissa.
- **M (medium)** – Sessiodokumentin projektiosta: Firestore-säännöt eivät suodata kenttiä eikä palvelinkirjoituspolkua ole → client-kirjoitus voi jatkaa koko rekordia; tarvitaan palvelinpuolen kirjoituspolku tai lopetettava omistajakenttien kirjoitus clientiltä. (Memo mainitsee tämän jo osittain.)
- **low/uncertain** – Loopback-luottamus on pysyvä HMAC-ohitus, ei vain siivous; sisäinen ristiriita (komento-URL vs. body).

---

## Keskitaso / matala (kooste)

- Hunt-avain ja PIN selkokielisena localStorageen; heikko oletus-PIN `'1234'` näytetään ja kopioidaan jakotekstiin (`ShareSessionModal.tsx`).
- `/api/session/create` ilman rajaa → 500 session katon tyhjennys.
- `gpsHistoryStore` ilman laitekohtaista rajaa → muistinkasvu ingestistä.
- Heikko PIN-käytäntö + koodikohtainen rajoitin → lukkiutus ja pitkä horisontin brute force.
- GPX-viennin XML-injektio escaamattomasta kategoriasta (`geoUtils.ts`); latentti prototyyppisaastutus parserissa; ei koko-/kompleksisuusrajaa XML/JSON-importille.
- Firestore: `sessions`-sääntö sallii rajattoman `update`n avaimenhaltijalle; blueprintissä `dogs`-kokoelma ilman sääntöä; `BroadcastChannel`+localStorage-tila luotetaan ilman lähettäjä­varmennusta (same-origin).
- Palvelin palauttaa raakoja virheviestejä; MML-avain selkokielisena localStoragessa (tilikohtainen, matala).
- Henkilötietotiedostot (`IK122T-Pro-ID-tunnus`, `area.json`) on **oikein** gitignoressa — ei toimenpiteitä.

---

## Mitä ei katettu

- Ei dynaamista testausta eikä pen-testiä; staattinen review näkee saman koodin.
- Ulkoinen gateway-repo (`micro-gps-gateway`) vain osin; TCP-protokollaparsinta (JT808/GT06/SinoTrack) syvemmin läpikäymättä.
- Kolmannen osapuolen riippuvuuksien haavoittuvuudet (npm-audit) erikseen.

---

## Ehdotettu korjausjärjestys

1. **K2** gatewayn auth (suunnittelu valmis) — sulkee isoimman live-riskin.
2. **K1** XSS-escapetus + CSP — kaikki selaimet.
3. **K3/H1** Erätutkan auth-middleware + `gatewayUrl` pois + SSRF-vartija.
4. **K4/H3** projektio kattaa myös `deletedDogIds`/`revivedDogIds`; poistoreitti omistajarajatuksi.
5. **H5** relay-uudelleenrekisteröinnin esto.
6. **H4/H2/H7** laitelistaus, ingest, Tractive pois/autentikoiduiksi.
7. Loput keskitasot.
