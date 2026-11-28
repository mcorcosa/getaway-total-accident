import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gameServer } from '../../scripts/serve.mjs';
import { fixtureChapter, fixtureWorld } from '../../src/fixture.mjs';
import { driveFrame } from '../../src/renderer.mjs';
import { newProgress, SAVE_KEY } from '../../src/save.mjs';
import { STARTER_VEHICLE_ID, vehicles } from '../../src/vehicles.mjs';
import { launchBrowser, openPage, poll } from './cdp.mjs';

const hatchbackId = 'city-hatchback';
const asset = '/assets/gameplay/canal-ward/cars/city-hatchback.png';
const fixture = structuredClone(fixtureChapter);
fixture.missions[0].defaultVehicleId = hatchbackId;
const fixtureSource = `export const fixtureWorld = ${JSON.stringify(fixtureWorld)};
export const fixtureChapter = ${JSON.stringify(fixture)};`;

const scene = page => page.read(() => window.__getawayScene?.());
const child = (view, label) => view.scene.find(node => node.label === label && node.ancestor === 'player-car');

function waitForPhase(page, expected) {
  return poll(async () => {
    const view = await scene(page);
    return view?.phase === expected && view;
  }, expected);
}

async function startDrive(page, missionId, vehicleId) {
  await waitForPhase(page, 'home');
  await page.click(`mission:${missionId}`);
  assert.equal((await waitForPhase(page, 'briefing')).run.vehicleId, vehicleId);
  await page.click('card:start');
  await waitForPhase(page, 'driving');
  await page.key('ArrowDown', 'rawKeyDown');
  return poll(async () => {
    const view = await scene(page);
    return view?.phase === 'driving' && view.input.brake && view.drive.player.speed === 0 && view;
  }, 'the player holds the brake and stops');
}

function verifyPose(view, targetHeading) {
  const node = child(view, 'city-hatchback-body');
  assert.equal(node?.type, 'Sprite');
  assert.ok(node.visible);
  assert.equal(child(view, 'procedural-car-body'), undefined);
  assert.equal(view.run.vehicleId, hatchbackId);
  assert.equal(view.drive.damage, vehicles[hatchbackId].maxDamage);
  const { player, objective } = view.drive;
  assert.ok(Math.abs(player.heading - targetHeading) < .10, `Expected heading ${targetHeading}, saw ${player.heading}`);
  const car = view.scene.find(node => node.label === 'player-car');
  assert.deepEqual(node.position, car.position);
  const { zoom } = driveFrame(view.width, view.height, player, objective.destination, { hudBottom: 0, footerTop: view.height });
  const cos = Math.abs(Math.cos(player.heading));
  const sin = Math.abs(Math.sin(player.heading));
  const { x, y, width, height } = node.bounds;
  assert.ok(Math.abs(width - (22.5 * cos + 13.5 * sin) * zoom) < .02, `Unexpected sprite width ${width}`);
  assert.ok(Math.abs(height - (22.5 * sin + 13.5 * cos) * zoom) < .02, `Unexpected sprite height ${height}`);
  assert.ok(Math.abs(x + width / 2 - car.position.x) < .02 && Math.abs(y + height / 2 - car.position.y) < .02);
}

test('City Hatchback uses centered art at both headings and keeps the live fallback', { timeout: 60000 }, async t => {
  const artRequests = [];
  let useHatchbackFixture = false;
  let unavailable = false;
  const server = gameServer();
  const serve = server.listeners('request')[0];
  server.removeListener('request', serve);
  server.on('request', (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (useHatchbackFixture && pathname === '/src/fixture.mjs') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }).end(fixtureSource);
      return;
    }
    if (pathname === asset) {
      response.once('finish', () => artRequests.push(response.statusCode));
      if (unavailable) {
        response.writeHead(404).end();
        return;
      }
    }
    void serve(request, response);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const evidence = await mkdtemp(join(await realpath(tmpdir()), 'gtc-city-hatchback-evidence-'));
  t.diagnostic(`Screenshots: ${evidence}`);
  const browser = await launchBrowser();
  t.after(() => browser.close());

  const starter = await openPage(browser.connection, `${origin}/?fixture=1&observe=1`);
  try {
    const view = await startDrive(starter, 'straight-delivery', STARTER_VEHICLE_ID);
    assert.equal(child(view, 'procedural-car-body')?.type, 'Graphics');
    assert.equal(child(view, 'city-hatchback-body'), undefined);
    assert.deepEqual(artRequests, []);
    assert.deepEqual(starter.errors, []);
  } finally {
    await starter.close();
  }

  useHatchbackFixture = true;
  for (const [width, height] of [[1200, 800], [390, 600], [320, 568]]) {
    const page = await openPage(browser.connection, `${origin}/?fixture=1&observe=1`, { width, height, mobile: width < 680 });
    try {
      await waitForPhase(page, 'home');
      await page.send('DOMStorage.enable');
      await page.send('DOMStorage.setDOMStorageItem', {
        storageId: { securityOrigin: origin, isLocalStorage: true }, key: `${SAVE_KEY}-fixture`,
        value: JSON.stringify({ ...newProgress(), ownedVehicleIds: [STARTER_VEHICLE_ID, hatchbackId] }),
      });
      await page.send('Page.reload', { ignoreCache: true });
      await poll(async () => (await scene(page))?.progress.ownedVehicleIds.includes(hatchbackId), 'the isolated owned hatchback save');
      const previousRequests = artRequests.length;
      await startDrive(page, 'straight-delivery', hatchbackId);
      const east = await poll(async () => {
        const view = await scene(page);
        return child(view, 'city-hatchback-body') && view;
      }, 'the loaded hatchback Sprite replaces its procedural body');
      verifyPose(east, 0);
      assert.equal(artRequests.length, previousRequests + 1);
      assert.equal(artRequests.at(-1), 200);
      await page.screenshot(join(evidence, `hatchback-east-${width}x${height}.png`));
      await page.key('ArrowRight', 'rawKeyDown');
      try {
        await poll(async () => Math.abs((await scene(page)).drive.player.heading - Math.PI / 2) < .07, 'a real quarter turn while stopped');
      } finally {
        await page.key('ArrowRight', 'keyUp');
      }
      verifyPose(await scene(page), Math.PI / 2);
      await page.screenshot(join(evidence, `hatchback-south-${width}x${height}.png`));
      assert.deepEqual(page.errors, []);

      if (width === 1200) {
        const source = await page.read(async path => {
          const response = await fetch(path);
          const bitmap = await createImageBitmap(await response.blob());
          const { width, height } = bitmap;
          const context = new OffscreenCanvas(width, height).getContext('2d');
          context.drawImage(bitmap, 0, 0);
          bitmap.close();
          const rgba = context.getImageData(0, 0, width, height).data;
          const bounds = { minX: width, minY: height, maxX: -1, maxY: -1 };
          for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
              if (!rgba[(y * width + x) * 4 + 3]) continue;
              bounds.minX = Math.min(bounds.minX, x);
              bounds.minY = Math.min(bounds.minY, y);
              bounds.maxX = Math.max(bounds.maxX, x);
              bounds.maxY = Math.max(bounds.maxY, y);
            }
          }
          return { width, height, bounds };
        }, asset);
        assert.deepEqual(source, { width: 90, height: 54, bounds: { minX: 3, minY: 4, maxX: 86, maxY: 49 } });
        const { length, width: bodyWidth } = vehicles[hatchbackId];
        assert.equal((source.bounds.maxX - source.bounds.minX + 1) / 4, length);
        assert.ok((source.bounds.maxY - source.bounds.minY + 1) / 4 <= bodyWidth);
        unavailable = true;
        const requestsBefore = artRequests.length;
        await page.send('Page.reload', { ignoreCache: true });
        await startDrive(page, 'straight-delivery', hatchbackId);
        await poll(() => artRequests.slice(requestsBefore).includes(404), 'the simulated missing sprite');
        const fallback = await scene(page);
        assert.equal(child(fallback, 'procedural-car-body')?.visible, true);
        assert.equal(child(fallback, 'city-hatchback-body'), undefined);
        assert.deepEqual(page.errors.filter(error => !error.includes(asset)), []);
        await writeFile(join(evidence, 'hatchback-fallback-1200x800.png'), await page.pixels());
        unavailable = false;
      }
    } finally {
      await page.close();
    }
  }
});
