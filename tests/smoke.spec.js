const { test, expect } = require('@playwright/test');

// Appen läser förgenererad gatudata (data/*.streets.json) och faller tillbaka på
// Overpass först om filen saknas. Testet mockar därför datafilen — inte Overpass —
// så att gatuantalet blir förutsägbart oavsett hur den riktiga datan ser ut.
//
// Formatet matchar det som tools/build-streets.py skriver: 'streets' är
// namn -> lista av segment, 'roundabouts' är namn -> parallell lista med flaggor.
const FAKE_STREETS = {
  org: 'nerikes',
  station: 'orebro',
  source: 'orebro',
  generated: '2026-01-01',
  count: 2,
  streets: {
    Storgatan: [[[59.27, 15.2], [59.271, 15.201]]],
    Stortorgsrondellen: [[[59.272, 15.202], [59.2725, 15.2025], [59.272, 15.203]]],
  },
  roundabouts: {
    Stortorgsrondellen: [true],
  },
};

// Minimalt Overpass-svar för reservvägen – samma två gator.
const FAKE_OVERPASS = {
  elements: [
    {
      type: 'way',
      tags: { name: 'Storgatan', highway: 'residential' },
      geometry: [{ lat: 59.27, lon: 15.2 }, { lat: 59.271, lon: 15.201 }],
    },
    {
      type: 'way',
      tags: { name: 'Stortorgsrondellen', highway: 'residential', junction: 'roundabout' },
      geometry: [
        { lat: 59.272, lon: 15.202 },
        { lat: 59.2725, lon: 15.2025 },
        { lat: 59.272, lon: 15.203 },
      ],
    },
  ],
};

test.beforeEach(async ({ page }) => {
  // Mocka datafilerna, Overpass-speglarna och Firestore – CI har ingen nätåtkomst dit
  await page.route('**/data/*.streets.json*', (route) => route.fulfill({ json: FAKE_STREETS }));
  await page.route('**/api/interpreter*', (route) => route.fulfill({ json: FAKE_OVERPASS }));
  await page.route('**firestore.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, body: '{}' }));
});

test('sidan laddar, hämtar gator och visar områdesskärmen', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#area-screen')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#loading-screen')).toBeHidden();
  await expect(page.locator('#load-count')).toHaveText('2');
});

test('knapparna i områdesvyn har kontrasterande textfärg mot mörk bakgrund', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#area-screen')).toBeVisible({ timeout: 15000 });
  const color = await page.locator('.sel-btn').first().evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe('rgb(170, 170, 170)'); // #aaa
});

test('rondellens segment flaggas och registreras för att alltid hållas överst', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#area-screen')).toBeVisible({ timeout: 15000 });
  const roundaboutCount = await page.evaluate(() => roundaboutPolys.length);
  // En rondell-way ger två polylines (osynlig hit-target + synlig linje)
  expect(roundaboutCount).toBe(2);
});

test('stationsväljaren listar stationerna ur tenants.json', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#area-screen')).toBeVisible({ timeout: 15000 });
  const knappar = await page.locator('#station-bar button').allTextContents();
  expect(knappar.length).toBeGreaterThan(1);
  expect(knappar.some((t) => t.startsWith('Örebro'))).toBe(true);
  // Byrsta visar sina orter under namnet så att Kumla går att hitta
  expect(knappar.some((t) => t.includes('Kumla'))).toBe(true);
});

test('byte av station laddar om med station i URL:en', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#area-screen')).toBeVisible({ timeout: 15000 });
  await page.evaluate(() => switchStation('nerikes', 'byrsta'));
  await page.waitForURL(/station=byrsta/, { timeout: 15000 });
  await expect(page.locator('#area-screen')).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(() => STATION.id)).toBe('byrsta');
});
