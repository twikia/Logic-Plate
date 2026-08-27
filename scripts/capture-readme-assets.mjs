/**
 * Capture README screenshots and GIFs from the Expo web dev server.
 * Usage: node scripts/capture-readme-assets.mjs [--base-url http://localhost:8081]
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import gifenc from 'gifenc';
import { PNG } from 'pngjs';

const { GIFEncoder, quantize, applyPalette } = gifenc;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs', 'assets');
const BASE_URL = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:8081';
const VIEWPORT = { width: 390, height: 844 };

const NYC = { latitude: 40.758, longitude: -73.9855 };

async function seedStorage(page) {
  await page.addInitScript(() => {
    localStorage.setItem('app_intro_seen_v1', '1');
    localStorage.setItem('recommendation_onboarding_done_v1', '1');
    localStorage.setItem(
      'recommendation_prefs_v1',
      JSON.stringify({
        v: 1,
        onboardingComplete: true,
        favoriteCuisines: ['italian', 'american'],
        weights: {
          distance: 0.2,
          health: 0.15,
          price: 0.2,
          rating: 0.25,
          novelty: 0.2,
        },
        defaultRadiusId: 'medium',
      })
    );
  });
}

async function waitForApp(page, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const url = page.url();
    if (url.includes('/(tabs)') || url.includes('/groups') || url.includes('/map') || /\/$/.test(new URL(url).pathname)) {
      const tabBar = page.locator('[role="tablist"], [data-testid="tab-bar"]').first();
      const homeContent = page.getByText(/date night|quick bite|spotlight|nearby/i).first();
      if ((await tabBar.count()) > 0 || (await homeContent.count()) > 0) {
        return;
      }
    }
    await page.waitForTimeout(1500);
  }
  throw new Error('App did not reach main tabs in time');
}

async function dismissOverlays(page) {
  for (const label of [/allow/i, /continue/i, /got it/i, /skip/i, /not now/i]) {
    const btn = page.getByRole('button', { name: label }).first();
    if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) {
      await btn.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
  }
}

async function gotoTab(page, tabName) {
  const routes = {
    home: `${BASE_URL}/`,
    map: `${BASE_URL}/map`,
    groups: `${BASE_URL}/groups`,
  };
  await page.goto(routes[tabName] ?? `${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(3000);
}

async function closeModals(page) {
  const niceMeal = page.getByText('Nice Meal').first();
  if ((await niceMeal.count()) > 0 && (await niceMeal.isVisible().catch(() => false))) {
    await niceMeal.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(600);
    return;
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
}

async function screenshot(page, name) {
  await closeModals(page);
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: false });
  console.log(`  saved ${name}`);
}

function framesToGif(framePaths, outPath, delay = 280) {
  const encoder = GIFEncoder();
  for (const fp of framePaths) {
    const png = PNG.sync.read(readFileSync(fp));
    const rgba = new Uint8Array(png.data);
    const palette = quantize(rgba, 256);
    const index = applyPalette(rgba, palette);
    encoder.writeFrame(index, png.width, png.height, { palette, delay });
  }
  encoder.finish();
  writeFileSync(outPath, Buffer.from(encoder.bytes()));
}

async function recordGif(page, name, action, frames = 10, intervalMs = 350) {
  const framesDir = join(OUT, '.gif-frames', name.replace('.gif', ''));
  await mkdir(framesDir, { recursive: true });
  const framePaths = [];
  for (let i = 0; i < frames; i++) {
    if (i === 0) await action(page);
    else await page.waitForTimeout(intervalMs);
    const fp = join(framesDir, `f${String(i).padStart(3, '0')}.png`);
    await page.screenshot({ path: fp });
    framePaths.push(fp);
  }
  const gifPath = join(OUT, name);
  framesToGif(framePaths, gifPath);
  console.log(`  saved ${name}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'en-US',
    geolocation: NYC,
    permissions: ['geolocation'],
    colorScheme: 'dark',
  });

  const page = await context.newPage();
  await seedStorage(page);

  console.log(`Loading ${BASE_URL} ...`);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForTimeout(12000);
  await dismissOverlays(page);
  await waitForApp(page).catch(() => console.warn('Continuing without confirmed tab bar'));

  console.log('Capturing screenshots...');

  await gotoTab(page, 'home');
  await page.waitForTimeout(8000);
  await screenshot(page, 'home.png');

  await recordGif(page, 'home-carousel.gif', async (p) => {
    await closeModals(p);
    for (let i = 0; i < 4; i++) {
      await p.mouse.click(195, 520);
      await p.waitForTimeout(400);
    }
  }, 8, 400);

  await gotoTab(page, 'map');
  await screenshot(page, 'map.png');

  await gotoTab(page, 'groups');
  await screenshot(page, 'groups.png');

  await page.goto(`${BASE_URL}/profile`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(3000);
  await closeModals(page);
  await screenshot(page, 'profile.png');

  await page.goto(`${BASE_URL}/random`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(2000);
  await screenshot(page, 'random.png');

  await gotoTab(page, 'groups');
  await recordGif(page, 'group-vote.gif', async (p) => {
    const quick = p.getByText(/quick vote/i).first();
    if ((await quick.count()) > 0) {
      await quick.click({ timeout: 3000 }).catch(() => {});
      await p.waitForTimeout(1200);
    }
  }, 8, 400);

  await browser.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
