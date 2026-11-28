import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { gameServer } from '../../scripts/serve.mjs';
import { newProgress, SAVE_KEY } from '../../src/save.mjs';
import { launchBrowser, openPage, poll } from './cdp.mjs';

const chapter = JSON.parse(await readFile(new URL('../../src/content/chapter1.json', import.meta.url), 'utf8'));
let browser;
let server;
let origin;

before(async () => {
  server = gameServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}/?observe=1`;
  browser = await launchBrowser();
  console.log(`Browser: ${browser.version} (${browser.executable})`);
});

after(async () => {
  try {
    await browser?.close();
  } finally {
    if (server?.listening) {
      const closed = once(server, 'close');
      server.close();
      server.closeAllConnections();
      await closed;
    }
  }
});

const snapshot = page => page.read(() => window.__getawayScene?.());

function phase(page, expected) {
  return poll(async () => (await snapshot(page))?.phase === expected, `phase ${expected}`);
}

async function enterMission(page, index) {
  await phase(page, 'home');
  const { id } = chapter.missions[index];
  if (index > 0) {
    // Unlock the authored mission through its normal save format in this isolated profile.
    const time = await page.read((key, progress) => {
      localStorage.setItem(key, JSON.stringify(progress));
      return performance.timeOrigin;
    }, SAVE_KEY, { ...newProgress(), cleared: chapter.missions.slice(0, index).map(mission => mission.id) });
    await page.send('Page.reload', { ignoreCache: true });
    await poll(() => page.read(time => performance.timeOrigin !== time, time), 'the authored save to reload');
    await phase(page, 'home');
    const { controls } = await snapshot(page);
    const { bounds: map } = controls.find(control => control.id === 'story-map');
    const { bounds: pin } = controls.find(control => control.id === `mission:${id}`);
    const x = map.x + map.width / 2;
    const y = map.y + map.height / 2;
    await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: pin.y + pin.height / 2 - y });
    await poll(async () => (await snapshot(page)).controls.some(control =>
      control.id === `mission:${id}` && control.visible && control.enabled), `${id} visible on the Story map`);
  }
  await page.click(`mission:${id}`);
  await phase(page, 'briefing');
  await page.read(() => {
    const frames = [];
    window.cameraMotionFrames = frames;
    function record(time) {
      const view = window.__getawayScene();
      if (view.phase === 'driving') {
        const { player, pickup } = view.drive;
        const camera = view.scene.find(node => node.label === 'world-camera').position;
        const marker = view.scene.find(node => node.visible && /^(world|edge)-(pickup|destination)$/.test(node.label));
        const hudBottom = Math.max(...view.scene.filter(node => node.ancestor === 'driving-hud' && node.label.startsWith('hud:'))
          .map(({ bounds }) => bounds.y + bounds.height));
        const footerTop = view.scene.find(node => node.label === 'driving-controls').bounds.y;
        frames.push({ time, player, pickup, camera, marker, hudBottom, footerTop });
      }
      requestAnimationFrame(record);
    }
    requestAnimationFrame(record);
  });
  await page.click('card:start');
  await phase(page, 'driving');
}

function verifyMotion(t, frames, index, { width, height }, event, movingRequired = true) {
  assert.ok(index >= 4 && index + 4 < frames.length, `Record live frames on both sides of ${event}`);
  const window = frames.slice(index - 4, index + 5);
  const zoom = Math.max(1.2, Math.min(2.25, Math.min(width * 1.6, height) / 365));
  let moving = 0;
  let largestError = 0;
  for (let step = 1; step < window.length; step += 1) {
    const { camera, player } = window[step];
    const previous = window[step - 1];
    const dx = player.x - previous.player.x;
    const dy = player.y - previous.player.y;
    if (Math.hypot(dx, dy) > 0.5) moving += 1;
    const expectedX = -zoom * (dx + 39 * (Math.cos(player.heading) - Math.cos(previous.player.heading)));
    const expectedY = -zoom * (dy + 39 * (Math.sin(player.heading) - Math.sin(previous.player.heading)));
    largestError = Math.max(largestError, Math.hypot(camera.x - previous.camera.x - expectedX,
      camera.y - previous.camera.y - expectedY));
  }
  const { time, player, camera } = frames[index];
  const previous = frames[index - 1];
  t.diagnostic(`${event}: ${Math.hypot(camera.x - previous.camera.x, camera.y - previous.camera.y).toFixed(2)}px camera, ` +
    `${Math.hypot(player.x - previous.player.x, player.y - previous.player.y).toFixed(2)} world units, ` +
    `${(time - previous.time).toFixed(1)}ms, ${largestError.toFixed(2)}px follow error`);
  if (movingRequired) assert.ok(moving >= 3, `${event} was exercised while the car moved`);
  assert.ok(largestError < 0.1, `${event}: camera deviated ${largestError.toFixed(2)}px from the moving car`);
}

function verifyMarkerClear(frame, width) {
  const { x, y, width: markerWidth, height } = frame.marker.bounds;
  assert.ok(x >= 0 && x + markerWidth <= width && y > frame.hudBottom && y + height < frame.footerTop,
    `${frame.marker.label} is fully visible between overlays`);
}

async function turnRight(page, target) {
  await page.key('ArrowDown', 'rawKeyDown');
  const car = await poll(async () => {
    const { player } = (await snapshot(page)).drive;
    return player.speed === 0 && player;
  }, 'the car to brake at the junction');
  const heading = Math.atan2(target.y - car.y, target.x - car.x);
  await page.key('ArrowRight', 'rawKeyDown');
  try {
    await page.read(heading => new Promise((resolve, reject) => {
      const deadline = performance.now() + 3500;
      function check(time) {
        const delta = window.cameraMotionFrames.at(-1).player.heading - heading;
        if (Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) < .065) resolve();
        else if (time >= deadline) reject(new Error('The braked car did not face the next street'));
        else requestAnimationFrame(check);
      }
      requestAnimationFrame(check);
    }), heading);
  } finally {
    await page.key('ArrowRight', 'keyUp');
    await page.key('ArrowDown', 'keyUp');
  }
}

for (const size of [{ width: 320, height: 568, mobile: true }, { width: 390, height: 600, mobile: true },
  { width: 1200, height: 800 }]) {
  const name = `${size.width}×${size.height}`;
  test(`${name} follows C1-01 smoothly as the road marker replaces the edge cue`, { timeout: 24000 }, async t => {
    const page = await openPage(browser.connection, origin, size);
    t.after(() => page.close());
    await enterMission(page, 0);
    await poll(async () => (await snapshot(page))?.phase === 'success', 'C1-01 to clear hands-off', 15000);
    const frames = await page.read(() => window.cameraMotionFrames);
    assert.equal(frames[0].marker?.label, 'edge-destination');
    const reveal = frames.findIndex(frame => frame.marker?.label === 'world-destination');
    verifyMotion(t, frames, reveal, size, 'road-marker reveal');
    const marker = frames[reveal].marker;
    const previousCue = frames[reveal - 1].marker;
    const shift = Math.hypot(marker.position.x - previousCue.position.x, marker.position.y - previousCue.position.y);
    const a = frames[reveal - 1].camera;
    const b = frames[reveal].camera;
    assert.ok(shift <= Math.hypot(a.x - b.x, a.y - b.y) + .2, `The indicator moved ${shift.toFixed(2)}px at reveal`);
    verifyMarkerClear(frames[reveal], size.width);
    assert.deepEqual(page.errors, []);
  });

  test(`${name} follows C1-12 through a real pickup and destination change`, { timeout: 39000 }, async t => {
    const page = await openPage(browser.connection, origin, size);
    t.after(() => page.close());
    await enterMission(page, 11);
    const { pickup, destination } = chapter.missions[11].objective;
    await poll(async () => (await snapshot(page)).drive.player.y >= pickup.y - 42, 'the authored far cross street', 18000);
    await turnRight(page, pickup);
    await poll(async () => {
      const { drive } = await snapshot(page);
      return drive.pickup && drive.player.x < pickup.x - 12;
    }, 'the package to be collected by the westbound car');
    await poll(async () => (await snapshot(page)).drive.player.x <= destination.x + 42, 'the westbound car to approach the second turn');
    await turnRight(page, destination);
    await poll(async () => (await snapshot(page))?.phase === 'success', 'C1-12 to clear after the second right turn');
    const frames = await page.read(() => window.cameraMotionFrames);
    const switched = frames.findIndex(frame => frame.pickup);
    assert.equal(frames[switched - 1]?.marker?.label, 'world-pickup');
    assert.match(frames[switched]?.marker?.label, /^(world|edge)-destination$/);
    verifyMotion(t, frames, switched, size, 'pickup-to-destination change');
    verifyMarkerClear(frames[switched], size.width);
    const reveal = frames.findIndex((frame, i) => i > switched && frame.marker?.label === 'world-destination' &&
      frames[i - 1].marker?.label === 'edge-destination');
    if (frames[switched].marker.label === 'edge-destination') {
      verifyMotion(t, frames, reveal, size, 'destination reveal after pickup', false);
      verifyMarkerClear(frames[reveal], size.width);
    }
    assert.deepEqual(page.errors, []);
  });
}
