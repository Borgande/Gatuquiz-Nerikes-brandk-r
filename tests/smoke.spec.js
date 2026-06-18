const { test, expect } = require('@playwright/test');

// Minimal Overpass-svar: en vanlig gata + en rondell (junction=roundabout)
const FAKE_OVERPASS = {
  elements: [
    {
      type: 'way',
      tags: { name: 'Storgatan', highway: 'residential' },
      geometry: [{ lat: 59.27, lon: 15.20 }, { lat: 59.271, lon: 15.201 }],
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
  // Mocka Overpass-speglarna och Firestore – CI har ingen riktig nätåtkomst dit
  await page.route('**/api/interpreter*', (route) => route.fulfill({ json: FAKE_OVERPASS }));
  await page.route('**firestore.googleapis.com/**', (route) => route.fulfill({ status: 200, body: '{}' }));
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
