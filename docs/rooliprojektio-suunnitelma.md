# Suunnittelumuistio: roolit ja viewer-projektio

- **Versio:** luonnos, 2026-10-14
- **Tila:** suunniteltu, **ei toteutettu**
- **Kattaa:** mitä koiran (`Dog`) kenttiä jaetaan kenellekin jahdissa, ja miten laitetiedot rajataan omistajalle.
- **Liittyy:** `docs/tietoturva-hmac-suunnitelma.md` (gatewayn autentikointi).

---

## Roolimalli

Kaksi tasoa + yksi moderointivalta:

| Identiteetti | Näkee | Voi tehdä |
|---|---|---|
| **Pannan omistaja** | kaiken (seuranta + tunnisteet + diagnostiikka) | kaikki asetukset ja komennot |
| **Jahtimestari** (= jahdin luoja) | kuten muut | **poistaa jäsenen/koiran jahdista** |
| **Kaikki muut** (passimies, koiramies, ajomies, seuraaja) | **vain viewer-projektio** | ei laiteasetuksia (saa silti kirjoittaa oman sijaintinsa, radionsa, tilansa ja jahdin merkinnät) |

Kirjoitusmalli on siis **resurssikohtainen**: laitetiedot ovat omistajan, jahti-sisältö on jäsenten. Tämä on toteutettava jäsenkohtaisilla tokeneilla.

---

## Viewer-projektio (jaetaan kaikille osallistujille)

Sessiodokumenttiin (`sessions/{huntKey}`) ja relayhin kirjoitetaan **vain nämä kentät**:

| Kenttä | Perustelu |
|---|---|
| _(sessiokohtainen pseudotunnus)_ | **Uusi kenttä.** Korvaa `id`/`collarId`; vakaa jahdin sisällä, ei paljasta laitetta |
| `name` | tunniste kartalla |
| `breed` | "nice to know" |
| `trackerModel` | "nice to know" – selittää tilan/käytöksen, esim. **Tractive ei tue haukkua**, joten malli kertoo miksi haukku ja tila voivat näyttää eri asiaa |
| `color` | merkin väri |
| `status` | haukkuu / seisoo / juoksee / liikkeessä / paikallaan |
| `lat`, `lng` | sijainti |
| `battery` | akku |
| `signal` | 4G/sat-% (ihmisluku, ei raaka CSQ/dBm) |
| `speed` | nopeus |
| `barkRate`, `lastBarkTimestamp` | haukku + viimeisin haukku |
| `trackHistory` | jälki (sisältää vain lat/lng/aika/nopeus/haukku) |
| `isActive`, `lastUpdated` | suodatus + tuoreus |
| `heading` | mukana – suuntanuoli on suunnitteilla |
| `addedBy` | "Lisännyt: \<metsästäjä\>" (pidetään viewerillä) |

**Pseudotunnus:** viewer tarvitsee vakaan avaimen, jolla päivitykset kohdistuvat samaan pantaan (ettei merkki monistu kartalle). Sen on oltava läpinäkymätön. Toteutus: **palvelin jakaa satunnaisen id:n, kun koira saapuu jahtiin**, ja kohdistaa telemetrian siihen – laitetunnus ei koskaan kulje clientille.

---

## Omistaja-only (ei koskaan sessiodokumenttiin eikä viewerille)

**Laitetunnisteet / capabilityt** (luokka "laitekohtainen", ks. sääntö alla):
`collarId`, `imei`, `directGpsId`, `simNumber`, `gatewayServerUrl`, `tractiveShareUrl`, `tractiveTrackerId`, `tractivePetName`, `tractiveOwnerName`, `telematicsProvider`, `protocolName`

**Diagnostiikka:**
`satellites`, `gsmSignalCsq`, `gsmSignalDb`, `networkStatus`, `fixMode`, `voltage`, `hdop`, `lastPacketLatencySec`, `rawPayload`

**Asetukset (omistajan):**
`barkAlertEnabled`, `standAlertEnabled`, `autoSyncEnabled`, `trackingIntervalSec`, `odometerResetTimestamp`

**Sisäinen UI-tila (ei jaeta lainkaan):**
`barkHoldRemainingFixes`, `recentBarkRate`, `distanceFromUser`, `bearingFromUser`

---

## Sääntö: salaisuudet jakautuvat kahteen luokkaan

- **Tilikohtaiset tunnukset** (MML-avain, tulevat Stripe/Firebase-salaisuudet) → tilin dokumentissa (`users/{uid}.settings`), omistaja-only, **ei koskaan jahdin jaettuun dataan.** MML-avain on jo näin.
- **Laitekohtaiset tunnukset** (IMEI, SIM, `gatewayServerUrl`, **Tractive-token**) → kuuluvat pannulle, mutta vuotavat jaetun `dogs`-arrayn mukana → **omistaja-only.**

Erityishuomio: **`collarId` on IMEI**, kun panta lisätään IMEI:llä (`AddDogModal.tsx`), ja **Tractive-jakolinkki on bearer-capability** lemmikin sijaintiin Tractiven alustalla. Molemmat ovat vuotaneita, pysyviä pääsylippuja → eivät kuulu viewerille.

---

## Miksi tämä ei onnistu pelkällä käyttöliittymällä

Nykyinen `isJahtimestari`-portitus piilottaa vain nappeja. Itse `dogs`-array tulee kaikille täydellisenä, joten viewer voi lukea kentät suoraan clientin muistista. Roolikohtainen näkyvyys vaatii, että arkaluontoiset kentät **eivät ole sessiodokumentissa lainkaan** ja että kirjoitukset kulkevat jäsenkohtaisella tokenilla varmentetun relayn kautta.

Firestore-säännöt eivät osaa suodattaa kenttiä lukuhetkellä, eivätkä anonyymit liittyjät ole Firebase Authissa → **jaettu sessiodokumentti saa sisältää vain viewer-projektion.**
