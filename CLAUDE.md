# CLAUDE.md – Gatuprov Örebro

Den här filen hjälper Claude att förstå projektet direkt utan att behöva läsa all kod.

---

## 1. Projektbeskrivning

**Gatuprov Örebro** (tidigare "Brandkårens Gatquiz") – ett gatunamnsquiz ursprungligen för
Nerikes Brandkår, nu med stöd för flera kommuner (Örebro, Kumla, Hallsberg).
Användaren visas ett gatunamn och ska klicka rätt gata på kartan.
Byggt som en enda självständig `index.html` — ingen build-step, ingen pakethanterare, ingen server.

---

## 2. Teknikstack

| Bibliotek | Version | Syfte |
|---|---|---|
| Leaflet.js | 1.9.4 | Karta + polyline-interaktion (CDN) |
| Firebase App compat | 9.23.0 | Firebase-initiering (CDN) |
| Firebase Firestore compat | 9.23.0 | Spara/läsa topplista-resultat (CDN) |
| MapLibre GL + maplibre-gl-leaflet | 4.7.1 | Renderar vektortiles i Leaflet (CDN) |
| OpenFreeMap `liberty` | – | Karttiles, gratis utan API-nyckel |
| ESRI World Imagery | – | Satellittiles (växla via knapp) |
| OpenStreetMap Overpass API | – | Hämtar alla gator live vid start |

---

## 3. Filstruktur

```
index.html             – allt: CSS + HTML + JS i en fil (~1 100 rader)
areas.geojson          – 40 GeoJSON-polygoner ("Område" + "station" per feature)
tenants.json           – organisationer och stationer (bbox, startvy, datafiler)
tools/build-streets.py – hämtar Overpass → förgenererad gatudata i data/
tools/test-areas.js    – regressionstest för områdeslogiken (`node tools/test-areas.js`)
tests/smoke.spec.js    – Playwright-smoktester (`npx playwright test`), körs av CI
playwright.config.js   – testkonfiguration, startar http-server på :4173
package.json           – enbart devDependencies för testerna
.github/workflows/ci.yml – kör npm ci + playwright test vid push och PR
firestore.rules        – Firestore-regler (klistras in manuellt i Firebase Console)
liberty-nolabels.json  – kartstil utan textlager, varm palett (28 kB)
serva.bat              – startar lokal webbserver på :8000 och öppnar webbläsaren
data/*.streets.json    – förgenererad gatudata per datakälla
pusha.bat              – git add -A → commit → push origin main
CLAUDE.md              – den här filen
.gitignore             – .claude/, satellite.html, backup-filer
```

Backup-filerna (`areas.geojson backup2`, `areasbackup 260515.geojson`) är nu
ignorerade via mönstren `areas.geojson backup*` och `areasbackup*`.

**GitHub:** `https://github.com/Borgande/Gatuquiz-Nerikes-brandk-r`
**GitHub Pages:** `https://borgande.github.io/Gatuquiz-Nerikes-brandk-r/`

---

## 4. Struktur i index.html (ungefärliga radnummer)

- **CSS** rader ~29–145  
  Färgpalett: `#ff6400` (orange), `#0d0d0d` (bakgrund), `#00e676` (rätt), `#ff4444` (fel), `#3a7cbf` (normal gata)

- **HTML** rader ~147–260 — fem skärmar visade/dolda via `display`:
  - `#loading-screen` – visas under OSM-hämtning
  - `#area-screen` – välj kommun(er) via `#muni-bar`, välj område(n), namnfält,
    "Ladda om"-knapp och **"Topplista 🏆"-knapp** direkt på startsidan
  - `header` + `#sub-bar` + `#map` – själva quizet.
    Sub-bar innehåller `🛰 Satellit`, `Visa omr.`, `Hoppa ⏭`, `Byt område`
  - `#end` – resultatskärm (rätt/fel/hoppat, tid, procent, topplista-knapp)
  - `#lb-overlay` – topplista-overlay (z-index 9000)

- **JavaScript** rader ~260–slutet — all logik i ett `<script>`-block

**Två quizlägen** styrs av `quizMode`:
- `'streets'` – standard: ett gatunamn visas, klicka rätt gata
- `'areas'` – "Öva på områden": ett områdesnamn visas, klicka rätt polygon.
  Egen skärm `#area-quiz-screen`, startas via `goAreaQuiz()` → `beginAreaQuiz()`.
  Urvalet styrs av `areaQuizSources` (datakällor), som initieras från `activeSources`.

---

## 5. Viktiga globala variabler

```js
allStreets       // {name → {polys, bounds, areas, coords}} – alla laddade gator
areaStreets      // {områdesnamn → [gatunamn]}
selectedAreas    // Set av valda områden
TENANTS          // hela tenants.json (TENANTS_FALLBACK om filen inte går att läsa)
ORG              // aktiv organisation {id,label,stations}
STATION          // aktiv station {id,label,title,center,zoom,areasUrl,sources}
activeSources    // Set av valda datakälle-id inom stationen
loadedSources    // Set av källor vars gatudata redan hämtats (cache)
queue          // shufflad lista av gatunamn för aktuell session
idx            // index i queue
score          // {correct, wrong, skipped}
phase          // 'loading'|'area'|'playing'|'feedback'|'end'
dataSource     // 'live'|'fallback'
attemptsLeft   // 3 per fråga; 0 → auto-advance efter 2.8 s
correctStreets // Set av korrekt besvarade gator (visas inte igen samma session)
pinnedStyles   // Map name → stilobjekt — hover ändrar EJ pinnad stil
wrongFlash     // Set av tillfälligt röda gator — hover ignoreras
quizStartTime  // Date.now() vid quizstart
areasLayer     // Leaflet-lager för polygonöverlägg (null = dolt)
lbCurrentTab   // 'omrade'|'kombo'
isSatellite    // boolean
AREAS_GEO      // aktiv GeoJSON (byts ut mot areas.geojson om den laddas)
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

1. **Inga etiketter alls på kartan** – hårt krav, och nu garanterat i egen kod.
   `liberty-nolabels.json` är OpenFreeMaps `liberty`-stil där **alla 23 textlager**
   (de med `layout['text-field']`) är bortplockade. Gatunamn avslöjar svaret i
   gatuquizet; **områdesnamn avslöjar svaret i områdesquizet** – båda måste bort.

   ⚠️ **CARTO togs bort 2026-09-03**: de kräver numera API-nyckel och bränner in
   "API KEY REQUIRED" i bildrutorna. Rutorna svarar fortfarande 200, de är bara
   vandaliserade.

   ⚠️ **Lantmäteriets topografiska karta kan inte användas.** Kontrollerat mot
   `topowebb`: vid 16 m/px visas områdesnamn (Vivalla, Varberga, Hjärsta), vid
   1 m/px gatunamn och husnummer (Tegnérgatan, Västra Nobelgatan). Ingen etikettfri
   variant finns, den kräver API-nyckel via Geotorget och levereras i SWEREF99 TM.

   Vill man ändra kartans **färger** görs det i `liberty-nolabels.json` – paletten är
   redan värmd mot Lantmäteriets utseende (laxrosa byggnader, varm beige bakgrund).
   Lägg **aldrig** tillbaka ett lager med `text-field`.
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

## 7b. Organisationer, stationer och datakällor (`tenants.json`)

Hierarkin är **organisation → station → datakälla**.

- **Station** = enheten som har egen karta, egna områden, egen titel och (planerat)
  egen topplista. En ny station läggs till genom att lägga till **data**, inte kod.
- **Datakälla** = en bbox + en förgenererad gatufil. En station kan ha flera:
  `orebro` har en, `byrsta` har två (Kumla + Hallsberg).

Nuvarande innehåll:

| Station | Titel | Källor |
|---|---|---|
| `orebro` | Gatuprov Örebro | orebro |
| `byrsta` | Gatuprov Byrsta | kumla, hallsberg |
| `nora` | Gatuprov Nora | nora |

**Val av station** — `#station-bar` på områdesskärmen listar alla stationer, med
stationens orter i mindre text under namnet (härlett ur `sources[].label`) så att man
ser att t.ex. Kumla ligger under Byrsta. `switchStation()` byter genom att sätta
`localStorage` och ladda om sidan med `?org=&station=` — `applyStation()` rensar
**inte** `allStreets`/`areaStreets`/`selectedAreas`/kartlagren, så omladdning är
säkrare än att riva staten för hand.

`resolveStation()` avgör startstation i prioritetsordning:
`?org=&station=` → `localStorage` (`gq_org`/`gq_station`) → `defaultStation` → första stationen.
Utan parametrar landar man alltså på Örebro precis som förut.

**Laddning** — `loadSource(id)` läser i första hand `streetsUrl` (förgenererad fil) och
faller tillbaka på Overpass endast om filen saknas. Källor cachas i `loadedSources`.
Knapparna i `#muni-bar` renderas av `buildSourceBar()`; har stationen bara **en** källa
döljs hela raden.

**Områdestillhörighet** — varje feature i `areas.geojson` har både `station` och `source`.
`getStation()` styr vilka områden som hör till stationen, `getSource()` styr under vilken
rubrik de grupperas och vad som avmarkeras när en källa stängs av. Begreppen är skilda
just för att Byrsta är **en** station med **två** källor.

---

## 7c. Förgenererad gatudata (`tools/build-streets.py`)

Appen hämtar **inte** gator från Overpass vid start. Datan förgenereras och läses
från `data/<org>-<källa>.streets.json`.

```bash
python tools/build-streets.py            # alla källor som saknar fil
python tools/build-streets.py hallsberg  # tvinga om en enskild källa
```

Format: `{org, station, source, bbox, generated, count, streets:{…}, roundabouts:{…}}`
— `streets` är `namn → [segment]` och matchar vad `addStreet(namn, segList, roundFlags)`
förväntar sig. `roundabouts` är `namn → [bool]`, parallell med segmentlistan, och tas
bara med för gator som faktiskt har en rondell. Fältet är **valfritt**: saknas det
(äldre filer) ritas inga rondeller överst, men allt annat fungerar.

Nuläge: Örebro 1 266 gator, Kumla 543, Hallsberg 579, Nora 189.

**Nora-polygonen är härledd ur datan**, inte ritad för hand: ett konvext hölje kring
samtliga gatukoordinater, buffrat 2 %. Därför hamnar 0 % i "Övrigt" (jämför Byrstas
44 %). För en liten ort räcker ett område; finfördela med ritverktyget senare.

⚠️ **Kumla- och Hallsberg-bbox:arna överlappar** (59.06–59.14 delas), så 395 gatunamn
finns i båda filerna. `addStreet()` har `if(allStreets[name]) return` — första källan
som laddar vinner, resten kastas. Byrsta får därför 727 unika gator av 1 122 poster,
och eftersom källorna laddas parallellt kan områdesantalen variera några gator mellan
sidladdningar. Quizet fungerar, men en gata med samma namn i båda orterna visas bara
på ett ställe. Snävare bbox:ar vid nästa körning av `build-streets.py` löser det.

**Varför:** Overpass svarar ofta 429/504 och kostade ~15 s vid varje sidladdning.
Under utvecklingen av detta slog alla tre speglarna fel flera gånger, och ett
för snabbt anrop gav 429. Skriptet pausar därför 20 s mellan källor, väntar 60 s
vid 429/504, och skickar en riktig `User-Agent` (utan den svarar Overpass **406**).

Kör om skriptet när gatunätet har ändrats — några gånger om året räcker.

---

## 8. Områden och areas.geojson

- GeoJSON FeatureCollection; koordinater i **[lon, lat]**-ordning (GeoJSON-standard)
- Varje feature har `properties.Område` (områdesnamn) och `properties.station`
  (`orebro`/`kumla`/`hallsberg`) — 40 features, alla Polygon
- `areas.geojson` laddas via XHR vid start; `AREAS_GEO_FALLBACK` är inbakad reserv.
  ⚠️ Reserven innehåller **bara Örebro-polygoner med äldre namn** — den får aldrig
  användas för en annan station, då hamnar alla gator i `'Övrigt'` utan förklaring
- **Tilldelning:** `assignAreas(allCoords)` samplar upp till 9 punkter längs gatan,
  kör ray casting (`pointInPolygon`) mot ringarna från `outerRings()`, kräver träff
  i ≥ 30 % av punkterna. En feature räknas högst en gång per samplad punkt
- **Geometrityper:** `outerRings()` stödjer Polygon och MultiPolygon. Point och andra
  typer ger `[]` och ignoreras — de kan inte avgränsa ett område. Viktigt eftersom
  ritverktyg lätt producerar MultiPolygon, och geojson.io kan lämna kvar klick-punkter
- En gata kan tillhöra **flera** områden (threshold-logik, inte first-match)
- Gator utanför alla polygoner → `'Övrigt'` (ca 4 % för Örebro)
- ⚠️ **bbox och polygoner är frikopplade.** Mosås-polygonen (lat 59.182–59.211) ligger
  till stor del utanför Örebros Overpass-bbox (som börjar på 59.20) — dess gator kommer
  in först när Kumla är vald. Kontrollera alltid att en stations bbox täcker dess polygoner
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
  name      krävs    tomt namn → resultatet sparas INTE (anonymt spel tillåts)
  areas     array    ["Centrum","Öster"] – alfabetiskt sorterat
  areasKey  string   "Centrum + Öster" – för grupp-flik
  correct   int
  wrong     int
  skipped   int
  total     int
  pct       int      avrundad procent rätt
  elapsed   int      sekunder
  timestamp Timestamp  serverTimestamp
  org       string   'nerikes'        – organisationens id
  station   string   'orebro'         – stationens id
  scope     string   'nerikes/orebro' – org+'/'+station, det ENDA som filtreras på
  ```

- **Topplistan är avgränsad per station** via `scope`. `aktivtScope()` bygger strängen
  på ett ställe; både `loadAreaTab()` och `loadKomboTab()` frågar
  `.where('scope','==',aktivtScope()).limit(1000)`.

  ⚠️ **Filtrera aldrig på `org` och `station` som två villkor** — två likheter i samma
  fråga kräver ett sammansatt index som måste skapas manuellt i konsolen för varje
  Firebase-projekt. Ett enda `scope`-fält kräver inget index. `scope` är dessutom
  kollisionssäkert när två organisationer har varsin station med samma id.

  Av samma skäl filtreras **området i JS** i `loadAreaTab()` i stället för med
  `array-contains` — likhet + `array-contains` hade också krävt sammansatt index.

  ⚠️ **`limit(1000)` utan `orderBy`** ger godtyckliga 1 000 dokument om en station
  passerar den gränsen; `lbSort()` sorterar först därefter. Med dagens datamängd är
  det i praktiken "allt". Passerar en station 1 000 resultat behövs
  `orderBy('pct','desc')` plus ett sammansatt index.

- **Resultat före augusti 2026 saknar `scope`** och syns därför inte längre i
  topplistan. Det var testdata och beslutet att låta dem falla bort var medvetet —
  de ligger kvar i databasen men filtreras bort.
- **Firestore-regler** ligger i **`firestore.rules`** i repot. Filen tillämpas **inte**
  automatiskt — projektet använder inte Firebase CLI. Klistra in innehållet i
  Firebase Console → Firestore → Rules och tryck Publicera. Filen finns i repot för att
  reglerna ska versionshanteras tillsammans med koden som skriver dokumenten.

  Reglerna kräver `org`, `station` och `scope`, och kontrollerar att
  `scope == org + '/' + station` — annars kan ett resultat stämplas in i en annan
  stations topplista. `read` är öppen, `update`/`delete` är blockerade.

  ⚠️ Gamla regler använder `hasAll`, som tillåter **extra** fält. Nya dokument skrivs
  därför igenom även innan de nya reglerna publicerats — publicering behövs för att
  *kräva* fälten, inte för att appen ska fungera.

---

## 10. GitHub och driftsättning

- **Repo:** `https://github.com/Borgande/Gatuquiz-Nerikes-brandk-r`
- **GitHub Pages:** `https://borgande.github.io/Gatuquiz-Nerikes-brandk-r/`
- **Pusha:** kör `pusha.bat`. Använder `git add -A` och listar vad som pushas.
  Tidigare lade den bara till `index.html` + `areas.geojson`, vilket gjorde att nya
  filer tyst aldrig nådde GitHub Pages — ändrat 2026-08-20.
- **Lokalt:** dubbelklicka **`serva.bat`** — startar `py -m http.server 8000` och
  öppnar webbläsaren. Stäng fönstret för att stoppa servern.

- ⚠️ **Får du bara reservdata lokalt?** Då har `index.html` öppnats direkt från disk.
  Appen läser `tenants.json`, `areas.geojson` och `data/*.streets.json` via XHR, och
  från `file://` är sidans origin `null` — webbläsaren blockerar alla tre med CORS,
  varpå boot faller tillbaka på `FALLBACK_STREETS` (121 gator i stället för 1 266).
  Kör via `serva.bat`. **`file://` stöds inte längre** — det är ett medvetet val, inte
  ett fel. GitHub Pages påverkas inte, det är en riktig webbserver.

- Kontroll att det blev rätt: badgen ska visa `● Örebro (1266 gator)`,
  inte `⚠ Reservdata`.

---

## 11. Nyckelfunktioner

| Funktion | Ansvar |
|---|---|
| `xhrGet(url)` | XHR-wrapper → Promise (15 s timeout) |
| `loadTenants()` | Läser `tenants.json`; `TENANTS_FALLBACK` vid fel |
| `resolveStation()` | URL → localStorage → `defaultStation` → första stationen |
| `applyStation(org,st)` | Sätter `ORG`/`STATION`, titel, rubrik, kartvy, `activeSources` |
| `loadSource(id)` | Förgenererad `streetsUrl` först, Overpass som reserv |
| `fetchFromOverpass(cfg)` | `Promise.any` mot 3 speglar — används bara som reserv |
| `srcCfg(id)` | Slår upp en datakälla i `STATION.sources` |
| `buildStationBar()` | Renderar `#station-bar`; döljs om det bara finns en station |
| `switchStation(org,st)` | Byter station via omladdning med `?org=&station=` |
| `buildSourceBar()` | Renderar `#muni-bar`; döljs om stationen har en enda källa |
| `updateDataBadge()` | Uppdaterar badgen med stationsnamn och gatuantal |
| `getStation(area)` | Vilken station ett område tillhör (`properties.station`) |
| `getSource(area)` | Vilken datakälla ett område tillhör (`properties.source`) |
| `areaProp(area,key,fb)` | Gemensam uppslagning i `AREAS_GEO.features` |
| `outerRings(geom)` | Yttre ringar för Polygon/MultiPolygon; `[]` för Point m.fl. |
| `loadAreasGeo()` | Läser `STATION.areasUrl`, filtrerar på station, uppdaterar `AREAS_GEO` |
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
| `synkaKartstorlek()` | `invalidateSize()` + MapLibre `resize()`; MapLibre rättar inte storleken själv |
| `skapaReservkarta()` | Esri grå rasterkarta om MapLibre inte kan laddas |
| `toggleAreasOverlay()` | Visar/döljer orange polygonöverlägg med etiketter |
| `toggleSource(id)` | Väljer/avväljer datakälla (`activeSources`), lazy-laddar gatudata |
| `bringRoundaboutsToFront()` | Lyfter rondellernas polylines överst så de inte göms |
| `goAreaQuiz()` | Öppnar områdesövningen, speglar `activeSources` |
| `buildAreaQuizSourceBar()` | Renderar ortsknappar i områdesövningen |
| `toggleAreaQuizSource(id)` | Väljer/avväljer ort i områdesövningen |
| `areaQuizCount()` | Antal områden som matchar valda källor |
| `beginAreaQuiz()` | Startar områdesquizet (`quizMode='areas'`) |
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
