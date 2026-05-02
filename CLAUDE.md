# CLAUDE.md – Brandkårens Gatquiz

Den här filen hjälper Claude att förstå projektet direkt utan att behöva läsa all kod.

---

## 1. Projektbeskrivning

**Brandkårens Gatquiz** – ett gatunamnsquiz för Nerikes Brandkår i Örebro.
Användaren visas ett gatunamn och ska klicka rätt gata på kartan.
Byggt som en enda självständig `index.html` — ingen build-step, ingen pakethanterare, ingen server.

---

## 2. Teknikstack

| Bibliotek | Version | Syfte |
|---|---|---|
| Leaflet.js | 1.9.4 | Karta + polyline-interaktion (CDN) |
| Firebase App compat | 9.23.0 | Firebase-initiering (CDN) |
| Firebase Firestore compat | 9.23.0 | Spara/läsa topplista-resultat (CDN) |
| CartoDB Voyager No Labels | – | Karttiles — **inga gatunamn, kritiskt för quizet!** |
| ESRI World Imagery | – | Satellittiles (växla via knapp) |
| OpenStreetMap Overpass API | – | Hämtar alla gator live vid start |

---

## 3. Filstruktur

```
index.html          – allt: CSS + HTML + JS i en fil (~1 000 rader)
areas.geojson       – 37 GeoJSON-polygoner (egenskapen "Område" per feature)
pusha.bat           – git add index.html areas.geojson → commit → push origin main
CLAUDE.md           – den här filen
.gitignore          – .claude/, "areas.geojson backup", satellite.html
```

**GitHub:** `https://github.com/Borgande/Gatuquiz-Nerikes-brandk-r`
**GitHub Pages:** `https://borgande.github.io/Gatuquiz-Nerikes-brandk-r/`

---

## 4. Struktur i index.html (ungefärliga radnummer)

- **CSS** rader ~29–145  
  Färgpalett: `#ff6400` (orange), `#0d0d0d` (bakgrund), `#00e676` (rätt), `#ff4444` (fel), `#3a7cbf` (normal gata)

- **HTML** rader ~147–258 — fem skärmar visade/dolda via `display`:
  - `#loading-screen` – visas under OSM-hämtning
  - `#area-screen` – välj område(n), namnfält, "Ladda om"-knapp
  - `header` + `#sub-bar` + `#map` – själva quizet (satellit- och areaknapp i sub-bar)
  - `#end` – resultatskärm (rätt/fel/hoppat, tid, procent, topplista-knapp)
  - `#lb-overlay` – topplista-overlay (z-index 3000)

- **JavaScript** rader ~260–slutet — all logik i ett `<script>`-block

---

## 5. Viktiga globala variabler

```js
allStreets    // {name → {polys, bounds, areas, coords}} – alla laddade gator
areaStreets   // {områdespnamn → [gatunamn]}
selectedAreas // Set av valda områden
queue         // shufflad lista av gatunamn för aktuell session
idx           // index i queue
score         // {correct, wrong, skipped}
phase         // 'loading'|'area'|'playing'|'feedback'|'end'
dataSource    // 'live'|'fallback'
attemptsLeft  // 3 per fråga; 0 → auto-advance efter 2.8 s
correctStreets// Set av korrekt besvarade gator (visas inte igen samma session)
pinnedStyles  // Map name → stilobjekt — hover ändrar EJ pinnad stil
wrongFlash    // Set av tillfälligt röda gator — hover ignoreras
quizStartTime // Date.now() vid quizstart
areasLayer    // Leaflet-lager för polygonöverlägg (null = dolt)
lbCurrentTab  // 'omrade'|'kombo'
isSatellite   // boolean
AREAS_GEO     // aktiv GeoJSON (byts ut mot areas.geojson om den laddas)
```

---

## 6. Stilkonstanter (S)

```js
S.normal  = {color:'#3a7cbf', weight:4,  opacity:0.6}
S.hover   = {color:'#80c0ff', weight:7,  opacity:0.95}
S.correct = {color:'#00e676', weight:9,  opacity:1}
S.wrong   = {color:'#ff1744', weight:9,  opacity:1}
S.reveal  = {color:'#00e676', weight:9,  opacity:1}  // hoppad gata
S.hidden  = {color:'transparent', weight:0, opacity:0}
```

---

## 7. Viktiga designval

1. **Inga gatunamn på kartan** – CartoDB Voyager *No Labels* är ett hårdt krav.
   Standard Voyager visar gatunamn och förstör quizet.
2. **Dubbla polylines per segment** – en tjock transparent hit-target (`weight:22`)
   + en tunn synlig linje. Skapas i `addStreet()`.
3. **Ingen zoom vid klick** – kartvyn rör sig aldrig automatiskt.
4. **Ingen feedback-popup** – direkt auto-advance (~0.7 s vid rätt, ~2.8 s vid slut på försök).
5. **`pinnedStyles` + `wrongFlash`** – förhindrar att hover-events skriver över
   fel-röd stil på felklickade gator som inte är rätt svar.
6. **`Promise.any()` mot tre Overpass-speglar** parallellt, 15 s timeout.
   Faller tillbaka på inbyggd `FALLBACK_STREETS` (~400 gator) vid fel.
7. **Firebase compat SDK** (v8-yta) krävs för att fungera på `file://`-protokollet.
   `db` är `null` om Firebase ej är konfigurerat → sparning sker tyst utan felmeddelanden.

---

## 8. Områden och areas.geojson

- GeoJSON FeatureCollection; koordinater i **[lon, lat]**-ordning (GeoJSON-standard)
- Varje feature har `properties.Område` = områdespnamn (sträng)
- `areas.geojson` laddas via XHR vid start; `AREAS_GEO_FALLBACK` är inbakad reserv (35 områden)
- **Tilldelning:** `assignAreas(allCoords)` samplar upp till 9 punkter längs gatan,
  kör ray casting (`pointInPolygon`) mot alla polygoner, kräver träff i ≥ 30 % av punkterna
- En gata kan tillhöra **flera** områden (threshold-logik, inte first-match)
- Gator utanför alla polygoner → `'Övrigt'`
- **Redigera:** ändra `areas.geojson` → klicka **"Ladda om 🔄"** på områdespskärmen
  → `reloadAreas()` omtilldelar alla gator utan att ladda om sidan
- **Visualisera:** klicka **"Visa omr."** i sub-bar → orange polygonöverlägg med etiketter

---

## 9. Firebase-konfiguration

- **Projekt:** `gatuprov-orebro` (Firestore redan aktiverat, region `eur3`)
- **Konfigurationsnycklar** i `index.html` rader ~16–23, variabeln heter **`firebaseConfig`** (lowercase)
- **⚠️ Viktigt:** initialiseringskoden refererar till `firebaseConfig` (lowercase).
  Om du byter namn i config-blocket måste samma namn användas i init-raden.
  `FIREBASE_CONFIG` (uppercase) fungerar **inte** — är en känd bug som uppstod en gång.
- **Kollektion:** `results` — ett dokument per avslutat quiz:
  ```
  name      string   spelarens namn (max 30 tecken)
  areas     array    ["Centrum","Öster"] – alfabetiskt sorterat
  areasKey  string   "Centrum + Öster" – för grupp-flik
  correct   int
  wrong     int
  skipped   int
  total     int
  pct       int      avrundad procent rätt
  elapsed   int      sekunder
  timestamp Timestamp  serverTimestamp
  ```
- **Firestore-regler** (sätt i Firebase Console → Firestore → Rules):
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /results/{docId} {
        allow read: if true;
        allow create: if request.resource.data.keys().hasAll([
            'name','areas','areasKey','correct','wrong','skipped',
            'total','pct','elapsed','timestamp'])
          && request.resource.data.name is string
          && request.resource.data.name.size() <= 30
          && request.resource.data.pct is int;
        allow update, delete: if false;
      }
    }
  }
  ```

---

## 10. GitHub och driftsättning

- **Repo:** `https://github.com/Borgande/Gatuquiz-Nerikes-brandk-r`
- **GitHub Pages:** `https://borgande.github.io/Gatuquiz-Nerikes-brandk-r/`
- **Pusha:** kör `pusha.bat` (lägger till `index.html` + `areas.geojson`, committar, pushar `main`)
  — OBS: `CLAUDE.md` ingår **inte** i pusha.bat; committa den manuellt vid behov
- **Lokalt:** använd Firefox på dator för live Overpass-data (`file://` + CORS).
  Chrome/mobil kör automatiskt på reservdata.

---

## 11. Nyckelfunktioner

| Funktion | Ansvar |
|---|---|
| `xhrGet(url)` | XHR-wrapper → Promise (15 s timeout) |
| `fetchLive()` | `Promise.any` mot 3 Overpass-speglar |
| `loadAreasGeo()` | Hämtar `areas.geojson`, uppdaterar `AREAS_GEO` |
| `pointInPolygon(lat,lon,ring)` | Ray casting (GeoJSON [lon,lat]-ordning) |
| `assignAreas(allCoords)` | Tilldelar gata till 0..N områden via sampling + threshold |
| `addStreet(name, segList)` | Skapar Leaflet hit-target + synlig polyline, tilldelar områden |
| `buildFromOSM(data)` / `buildFromFallback()` | Tolkar datakälla → anropar `addStreet` |
| `buildAreaGrid()` | Renderar områdespknappar på area-screen |
| `beginQuiz()` / `startGame()` | Blandar queue, startar timer, anropar `renderQ` |
| `renderQ()` | Visar aktuell fråga, aktiverar klick på gator |
| `handleClick(name)` | Svarskontroll, score, pinnedStyles/wrongFlash, auto-advance |
| `applyStyle(name, styleObj)` | Sätter stil på alla polylines för en gata |
| `doNext()` | Avancerar idx, anropar `renderQ` eller `showEnd` |
| `showEnd()` | Visar resultatskärm, anropar `saveResult` |
| `saveResult(pct,elapsed,total)` | Firestore-skrivning (tyst om `db===null`) |
| `openLeaderboard()` | Visar `#lb-overlay`, populerar område-dropdown |
| `closeLeaderboard()` | Döljer `#lb-overlay` |
| `switchLbTab(name)` | `'omrade'`/`'kombo'`, uppdaterar flik-stil, laddar data |
| `loadAreaTab()` | Firestore `.where('areas','array-contains',area).get()` |
| `loadKomboTab()` | Firestore `.get()` alla → gruppera på `areasKey` i JS |
| `lbRenderTable(rows, el)` | HTML-tabell sorterad pct↓, elapsed↑ |
| `lbSort(arr)` | Sorterar: pct desc, sedan elapsed asc |
| `lbEsc(s)` / `lbFmtTime(s)` / `lbFmtDate(ts)` | HTML-escape, tid, datum |
| `toggleSatellite()` | Byter `tileMap` ↔ `tileSat` |
| `toggleAreasOverlay()` | Visar/döljer orange polygonöverlägg med etiketter |
| `reloadAreas(btn)` | Laddar om `areas.geojson` + omtilldelar alla gator |
| `doSkip()` | Hoppar över fråga, visar gatan grön (S.reveal) |
| `goArea()` | Stänger topplista, visar area-screen |

---

## 12. Kodkonventioner

- **Komprimerad JS-stil** – korta variabelnamn, semikolon, ett uttryck per rad där möjligt
- Äldre delar använder `var`; nyare delar `let`/`const` — använd `let`/`const` för ny kod
- Sektionsavdelare: `// ════════════════… sektionsnamn …`
- All UI-text på **svenska**
- Inga externa beroenden utöver CDN-scripten; ingen transpilering
- Redigera direkt i `index.html`

---

## 13. Arbetsspråk

- **Konversationer med Claude:** svenska
- **UI-text och kommentarer i koden:** svenska
- **Commit-meddelanden:** svenska
