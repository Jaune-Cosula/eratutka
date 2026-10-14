# Suunnittelumuistio: Erätutka ↔ GPS-gateway -liikenteen allekirjoitus (HMAC)

- **Versio:** luonnos, 2026-10-14
- **Tila:** suunniteltu, **ei toteutettu**
- **Kattaa:** Erätutkan palvelimen ja self-hosted Micro GPS Gatewayn välisen HTTP-liikenteen todennuksen, eheyden ja toistoesron.
- **Ei kata:** panta ↔ gateway -TCP-portteja (5013/5023), roolikohtaista pääsyä, TLS:ää.

---

## Tausta ja tavoite

Gatewayn HTTP-API on tällä hetkellä täysin avoin: kuka tahansa internetissä voi lukea kaikkien pantojen sijainnit ja historian sekä lähettää komentoja mille tahansa pannalle (`/api/positions`, `/api/history`, `/api/command`, `/api/rawlogs`). CORS on `*` eikä yhdelläkään reitillä ole tunnistautumista.

Tavoite on sulkea nämä aukot **ilman domainia ja TLS:ää** (free-tier-vaiheessa), niin että ratkaisu on:

1. **Todennus** – vain Erätutka-palvelin voi kutsua gatewayta, ja vain gateway voi kutsua Erätutkan ingest-endpointia.
2. **Eheys** – pyynnön sisältöä ei voi muuttaa matkalla.
3. **Toistoesto** – siepattu pyyntö ei kelpaa uudelleen.

**Ei tavoitteena:** luottamuksellisuus. HMAC ei salaa sisältöä – sijainnit ja IMEI kulkevat yhä selkokielisenä. Sen korjaa vasta TLS (myöhempi horisontti).

---

## Avaimet – kaksi, suunnittain (avaimen erottelu)

| Avain | Suunta | Allekirjoittaja | Varmentaja |
|---|---|---|---|
| `GW_SECRET` | Erätutka → gateway (luku, historia, komennot) | Erätutka-palvelin | Gateway |
| `INGEST_SECRET` | gateway → Erätutka (`/api/gps/update`) | Gateway | Erätutka-palvelin |

Kaksi erillistä avainta siksi, että gateway-VM:n murto antaa hyökkääjälle vain `INGEST_SECRET`in (voi spämmätä ingest-dataa) **mutta ei** `GW_SECRET`iä (ei voi komentaa pantoja eikä lukea historiaa). Raja vahingon.

- Pituus ≥ 32 satunnaista tavua: `openssl rand -hex 32`.
- `GW_SECRET` vain Erätutkan palvelimen ympäristöön; `INGEST_SECRET` kumpaankin päähän.
- Salaisuudet **ympäristömuuttujista**, ei koskaan koodiin tai clientille. Erätutka pollaa palvelinpuolelta, joten selaimet eivät koske niihin.

---

## Kanoninen merkkijono (mitä allekirjoitetaan)

```
{method}\n{path}\n{canonicalQuery}\n{timestamp}\n{nonce}\n{sha256hex(body)}
```

| Osa | Määritelmä |
|---|---|
| `method` | ISOUSOISIN (`GET`, `POST`) |
| `path` | Vain polku, ei kyselyä, esim. `/api/history` |
| `canonicalQuery` | Parametrit **avaimen mukaan lajiteltuna**, `encodeURIComponent(k)=encodeURIComponent(v)` yhdistettynä `&`:llä. Tyhjä, jos ei parametreja. |
| `timestamp` | **Unix-sekunnit** kokonaislukuna |
| `nonce` | 16 satunnaista tavua heksana (32 merkkiä) |
| `sha256hex(body)` | **Raa'an** rungon tavuista. Tyhjä runko → `sha256("")` = `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

Rungon hash (ei koko runko) pitää kanonisen merkkijonon lyhyenä isoillakin rungoilla. Kyselyn lajittelu estää järjestysambigulteetin.

---

## Otsakkeet

```
X-Eratutka-Timestamp: 1760496000
X-Eratutka-Nonce: 9f2c1a7b3e5d8f0a1b2c3d4e5f6a7b8c
X-Eratutka-Signature: v1=<heksa-hmac-sha256>
```

- Otsakenimissä **ei voi olla ä-kirjainta** (HTTP-token on ASCII) → `Eratutka` ilman ä:tä.
- `v1=`-etuliite sallii myöhemmän algoritmivaihdoksen rikkomatta vanhaa.

---

## Algoritmi ja vertailu

- `HMAC-SHA256(secret, canonicalString)`, tulos **pienellä heksalla**.
- Varmennus **ajoitusvakaalla** vertailulla: `crypto.timingSafeEqual`. Ei `===`.

---

## Varmennusalgoritmi (vastaanottaja)

1. Puuttuva otsake → `401`.
2. `|now − timestamp| > 300` s → `401` (vanhentunut tai toisto).
3. Nonce nähty tässä 300 s ikkunassa → `401` (toisto). Pidä pientä muistissa olevaa nonce-joukkoa.
4. Rakenna kanoninen merkkijono **vastaanotetusta** metodista / polusta / kyselystä / rungosta.
5. Laske odotettu HMAC avaimella; vertaa ajoitusvakaasti.
6. Vasta hyväksynnän jälkeen jäsennä JSON.

---

## Esimerkki

Pyyntö:

```
GET /api/history?id=867689067647125&hours=6 HTTP/1.1
Host: 35.206.111.214:8080
X-Eratutka-Timestamp: 1760496000
X-Eratutka-Nonce: 9f2c1a7b3e5d8f0a1b2c3d4e5f6a7b8c
X-Eratutka-Signature: v1=<hex>
```

Kanoninen merkkijono (`\n` = rivinvaihto):

```
GET
/api/history
hours=6&id=867689067647125
1760496000
9f2c1a7b3e5d8f0a1b2c3d4e5f6a7b8c
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

---

## Toteutuksen sudenkuopat

1. **Raaka runko talteen ennen varmennusta.** Expressin `express.json()` ei säilytä raakaa runkoa → `express.json({ verify: (req, res, buf) => (req as any).rawBody = buf })`. Allekirjoitus on tavuista, ei uudelleenserialisoinnista: muuten JSON-avainten järjestys tai välilyönnit rikkovat sen.
2. **Komennot: laitetunnus vain rungosta**, ei URL:sta – yksiselitteinen allekirjoitettava muoto. (Nykyinen gateway hyväksyy molemmat.)
3. **Hallintapaneeli.** Selain ei voi turvallisesti pitää salaisuutta. Free-tier-vaiheessa helpoin: SSH-tunneli + **loopback-luottamus** (`remoteAddress` on 127.0.0.1 → ohita allekirjoitus). **Huom:** kun TLS tulee myöhemmin Caddyn taakse, kaikki pyynnöt näyttävät localhostilta → loopback-luottamus on silloin poistettava.
4. **Käyttöönotto ilman katkoa.** Gateway tarkistaa allekirjoituksen vain kun `REQUIRE_SIGNATURE=true`. Ei mallia "salaisuus puuttuu → avoin" (jalka-ansa). Kytke päälle vasta kun molemmat päät on päivitetty.
5. **AGENTS-rajoitus.** Erätutkan on yhä tuettava vanhaa oletusosoitetta (`http://35.206.111.214:8080/api/positions`) tiedostoissa `server.ts`, `src/App.tsx`, `src/types.ts`. Allekirjoitus on **lisäys**, ei osoitteen vaihto.
6. **Kellot.** Molemmat päät NTP:ssä (GCE + Cloud Run) → ±300 s ikkuna on turvallinen.
7. **CORS `*`** on HMAC:n kanssa merkityksetön selainten osalta (allekirjoitusta ei ole selaimessa), mutta kiristä se silti myöhemmin.

---

## Käyttöönotto (porrastus)

1. Lisää allekirjoitus/luenta molempiin päihin (`REQUIRE_SIGNATURE=false` aluksi).
2. Varmista toimivuus lokien avulla.
3. Kytke `REQUIRE_SIGNATURE=true` gatewaylla ja vaadi allekirjoitus Erätutkan ingest-endpointilla.
4. Sulje Erätutkan omat proxy-endpointit (`/api/collar/command`, `/api/gateway/sync`, `/api/gps/devices`, `/api/gps/simulate`), ettei allekirjoitus ole kierrettävissä Erätutkan kautta.

---

## Mitä tämä ei ratkaise

- **Luottamuksellisuus** – sijainnit ja IMEI kulkevat selkokielisenä. Vasta TLS.
- **Laitteiden sisäänotto** – panta ei allekirjoita mitään; IMEI on yhä väärennettävissä. Tämä koskee vain Erätutka ↔ gateway -liikennettä, ei panta ↔ gateway -portteja.
- **Roolikohtainen pääsy ja viewer-projektio** – oma erillinen suunnittelunsa (koirat tilin omistukseen, jäsenkohtaiset tokenit, arkaluontoiset kentät pois jaetusta sessiodokumentista).

---

## Liittyvät päätökset (tausta)

- Pannan IMEI on tällä hetkellä **toimiva avain** pannaan (gateway avoin), ja `collarId` on IMEI, kun panta lisätään IMEI:llä → IMEI ei saa vuotaa viewereille.
- Gatewayn HTTP-API:ta ei voi kokonaan sulkea, koska Erätutka hakee sieltä historian ja lähettää komennot; siksi avain/allekirjoitus, ei pelkkä piilotus.
- Gateway → Erätutka -legi on jo HTTPS → siihen suuntaan tarvitaan vain jaettu salaisuus.
