import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, realpath } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { test } from 'node:test';
import { SAVE_KEY } from '../../src/save.mjs';
import { launchBrowser, openPage, poll } from './cdp.mjs';

const artifact = new URL('../../dist-pages/', import.meta.url);
const prefix = '/getaway-total-accident/';
const hatchbackId = 'city-hatchback';
const hatchbackArt = 'assets/gameplay/canal-ward/cars/city-hatchback.png';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};
const expectedRequests = [
  '', 'src/app.mjs', 'src/styles.css', 'vendor/pixi.mjs',
  'src/content/chapter1.json', 'src/content/world.json',
  'assets/ui/palmera-bay.jpg', 'assets/ui/postcards/first-job.jpg',
  'assets/ui/postcards/canal-ward.jpg', 'assets/ui/postcards/success.jpg',
  'assets/ui/postcards/bonus.jpg', hatchbackArt,
];

function pagesServer(responses) {
  return createServer(async (request, response) => {
    const pathname = request.url.split('?')[0];
    response.on('finish', () => responses.push({ pathname, status: response.statusCode }));
    const file = pathname === prefix ? 'index.html' : pathname.slice(prefix.length);
    const contentType = types[extname(file)];
    if (request.method !== 'GET' || !pathname.startsWith(prefix) ||
        !/^(?:[\w-]+\/)*[\w-]+\.[a-z]+$/.test(file) || !contentType) {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(new URL(file, artifact));
      response.writeHead(200, { 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff' }).end(body);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
    }
  });
}

function storage(page, key = SAVE_KEY) {
  return page.read(key => JSON.parse(localStorage.getItem(key)), key);
}

function afterPaint(page) {
  return page.read(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test('Pages project URL serves Chapter 1 and banks an authored Mission 1 clear', { timeout: 45000 }, async t => {
  const html = await readFile(new URL('index.html', artifact), 'utf8').catch(error => {
    if (error.code === 'ENOENT') throw new Error('Build the site with npm run build:pages first.', { cause: error });
    throw error;
  });
  assert.match(html, /<html data-pages-build\s/);

  const responses = [];
  const server = pagesServer(responses);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of [
    '/', '/index.html', '/vendor/pixi.mjs', '/assets/ui/palmera-bay.jpg', '/src/content/world.json',
    `/${hatchbackArt}`, `${prefix}src/fixture.mjs`, `${prefix}src/pixi/observe.mjs`,
  ]) {
    assert.equal((await fetch(origin + path)).status, 404, path);
  }
  const hatchback = await fetch(origin + prefix + hatchbackArt);
  assert.equal(hatchback.status, 200);
  assert.equal(hatchback.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await hatchback.arrayBuffer()), await readFile(new URL(`../../${hatchbackArt}`, import.meta.url)));
  responses.length = 0;

  const evidence = await mkdtemp(join(await realpath(tmpdir()), 'gtc-pages-evidence-'));
  t.diagnostic(`Screenshots: ${evidence}`);
  const browser = await launchBrowser();
  t.diagnostic(`Browser: ${browser.version} (${browser.executable})`);
  try {
    // The public game must ignore both local engineering query options.
    const page = await openPage(browser.connection, `${origin}${prefix}?fixture=1&observe=1`);
    try {
      await poll(() => page.read(() => document.activeElement?.id === 'stage'), 'the public game to focus the canvas');
      assert.equal(await page.read(() => typeof window.__getawayScene), 'undefined');
      assert.equal(await storage(page), null);

      // Story map, Mission 1, then the briefing's vehicle picker and Play.
      await page.press('Tab');
      await page.press('Tab');
      await page.press('Enter');
      await page.press('Tab');
      await page.press('Tab');
      await page.press('Enter');
      await page.key('ArrowDown', 'rawKeyDown');
      try {
        await afterPaint(page);
        assert.equal(await storage(page), null);
        await page.screenshot(join(evidence, 'mission-1-playing.png'));
      } finally {
        await page.key('ArrowDown', 'keyUp');
      }

      const cleared = await poll(async () => {
        const save = await storage(page);
        return save?.pending && save;
      }, 'Mission 1 clear and pending haul', 16000);
      assert.deepEqual(cleared.cleared, ['C1-01']);
      assert.equal(cleared.pending.missionId, 'C1-01');
      assert.equal(cleared.pending.vehicleId, hatchbackId);
      assert.deepEqual(cleared.ownedVehicleIds, [hatchbackId]);
      assert.equal(cleared.pending.haul, 100);
      assert.equal(cleared.bank, 0);
      await afterPaint(page);
      await page.screenshot(join(evidence, 'mission-1-clear.png'));

      // Continue to Story is first in the success card's keyboard order.
      await page.press('Tab');
      await page.press('Enter');
      const banked = await poll(async () => {
        const save = await storage(page);
        return save?.pending === null && save;
      }, 'Continue to Story to bank the haul');
      assert.deepEqual(banked.cleared, ['C1-01']);
      assert.equal(banked.bank, 100);
      assert.equal(await storage(page, `${SAVE_KEY}-fixture`), null);

      // Pixi fetches the JPGs in a worker, outside the page's CDP session.
      const served = new Set(responses.map(({ pathname }) => pathname));
      for (const file of expectedRequests) {
        assert.ok(served.has(prefix + file), `Missing request for ${prefix + file}`);
      }
      for (const { pathname, status } of responses) {
        assert.ok(pathname.startsWith(prefix), `Unexpected request outside the Pages prefix: ${pathname}`);
        assert.equal(status, 200, pathname);
      }
      for (const url of page.requests.values()) {
        const request = new URL(url);
        const localWorker = request.protocol === 'blob:' && request.origin === origin;
        const inlineResource = request.protocol === 'data:';
        assert.ok(localWorker || inlineResource || url.startsWith(origin + prefix),
          `Unexpected request outside the Pages site: ${url}`);
      }
      assert.deepEqual(page.errors, [], 'Unexpected browser errors or failed requests');
      t.diagnostic(`Verified ${responses.length} responses under ${prefix} and a $100 banked haul.`);
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
