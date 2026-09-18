# 🐕 Erätutka — Maastokartta- ja koirapaikannussovellus

Erätutka on nykyaikainen, reaaliaikainen maastokartta- ja koirapaikannussovellus metsästykseen, koirakokeisiin ja luonnossa liikkumiseen.

---

## ✨ Tärkeimmät ominaisuudet

### 📡 1. Reaaliaikainen koirapaikannus & Panta-integraatiot
- **Suora Micro GPS Gateway (JT808 / ICAR / TK-sarja / OsmAnd)**:
  - Oletusyhteyspiste: `http://35.206.111.214:8080/api/positions`
  - Lukee automaattisesti koordinaatit, nopeuden, kulkusuunnan, akun varauksen (%) ja haukkutiheyden.
- **Haukunilmaisin**:
  - Tunnistaa haukun ja laskee haukkutiheyden (hakkua/min).
  - Äänimerkit ja visuaaliset indikaattorit haukun alkaessa.
- **Reittihistoria & Häntä**:
  - Tallentaa koiran kulkureitin aikaleimoineen ja nopeustietoineen (6–12 h historia).
  - Kulkusuunnan nuoli ja vauhtivektori kartalla.

### 🗺️ 2. Tarkat Suomen maastokartat
- **Maanmittauslaitos (MML)** maastokartat ja ilmakuvat.
- **Avoimet topo- ja satelliittikartat** sekä tumma yötila.
- **Etäisyys- ja pinta-alamittari**: Mittaa suorat etäisyydet, monipisteiset reitit ja pinta-alat hehtaareina.
- **Tiedonsiirto**: GPX, KML ja GeoJSON -tiedostojen tuonti ja vienti.

### 🎯 3. Passipaikat & Maastomerkinnät
- Merkitse kartalle:
  - 🏹 Passipaikat & Hirvitornit
  - 🎯 Saaliit & Riistahavainnot
  - 🔥 Nuotiopaikat & Laavut
  - ⚠️ Vaara-alueet & Sudenjäljet
  - 🪤 Loukut & Ruokintapaikat

### 👥 4. Jahtiseurue & Reaaliaikainen jakaminen
- **Jahtiporukan live-seuranta**: Näe passimiesten ja koiraohjaajien sijainnit sekä etäisyydet.
- **Pilvisynkronointi (Firestore)**: Jaa jahtisessio jakolinkillä tai koodilla + PIN-koodilla ilman monimutkaista rekisteröitymistä.
- **Pääsynvalvonta**: Jokaisella jahdilla on satunnainen jahtiavain, joka kulkee jakolinkin mukana. Ilman avainta sessiodataa ei voi lukea eikä muokata, eikä jahteja voi luetella. Salaisuus kulkee linkissä URL-fragmentissa, jota selain ei lähetä palvelimelle.
- **SOS-turvatoiminto**: Lähetä välitön hätähälytys koordinaatteineen ja äänimerkkeineen koko seurueelle.

---

## 🚀 Pika-aloitus ja kehitys

### Asennus ja käynnistys
```bash
# Asenna riippuvuudet
npm install

# Käynnistä kehityspalvelin
npm run dev

# Tuotantobuild
npm run build
npm start
```

### Palvelinarkkitehtuuri
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + Leaflet + Lucide Icons
- **Backend**: Express (`server.ts`) hoitaa telemetrian vastaanoton, PULL-haun ja rajapintojen suojauksen
- **Tietokanta**: Firebase Firestore reaaliaikaiseen ryhmäjakoon

---

## 📡 GPS-pannan asetukset

Jos käytät omaa GPS-pantaa (esim. SinoTrack, TK905, ICAR tai Traccar Client):

1. **Palvelimen IP / Host**: `35.206.111.214`
2. **Portti**: `8080` (tai protokollakohtainen portti)
3. **PULL-hakuosoite Erätutkassa**: `http://35.206.111.214:8080/api/positions`
