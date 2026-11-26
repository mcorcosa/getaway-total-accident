import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { gameServer } from '../../scripts/serve.mjs';
import { SAVE_KEY } from '../../src/save.mjs';
import { STARTER_VEHICLE_ID, vehicles } from '../../src/vehicles.mjs';
import { launchBrowser, openPage, poll } from './cdp.mjs';

const mainPayout = 100;
const bonusPayout = 50;
const pendingMain = { missionId: 'C1-01', vehicleId: 'starter-coupe', haul: mainPayout, damage: 4 };
const neutral = { left: false, right: false, brake: false, steering: 0 };
const chapterUrl = new URL('../../src/content/chapter1.json', import.meta.url);
const mission = id => `mission:${id}`;
const action = id => `card:${id}`;
const money = value => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(value);

let browser;
let server;
let origin;
let evidence;
let chapter;

before(async () => {
  chapter = JSON.parse(await readFile(chapterUrl, 'utf8'));
  evidence = await mkdtemp(join(await realpath(tmpdir()), 'gtc-pixi-browser-evidence-'));
  console.log(`Screenshots: ${evidence}`);
  server = gameServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}/`;
  browser = await launchBrowser();
  console.log(`Browser: ${browser.version} (${browser.executable})`);
});

after(async () => {
  try {
    await browser?.close();
  } finally {
    if (server?.listening) {
      server.close();
      server.closeAllConnections();
      await once(server, 'close');
    }
  }
});

function snapshot(page) {
  return page.read(() => window.__getawayScene?.());
}
const object = (view, label) => view.scene.find(node => node.label === label);
const control = (view, id) => view.controls.find(item => item.id === id);

async function phase(page, expected, timeout) {
  try {
    return await poll(async () => {
      const view = await snapshot(page);
      return view?.phase === expected && view;
    }, `phase ${expected}`, timeout);
  } catch (error) {
    const observed = await page.read(() => ({
      phase: window.__getawayScene?.()?.phase, title: document.title, canvas: document.querySelector('canvas')?.ariaLabel,
    }));
    throw new Error(`${error.message}; observed ${JSON.stringify(observed)}; browser errors ${JSON.stringify(page.errors)}`);
  }
}

function straightDriveTimeout({ spawn, objective: { destination } }) {
  const distance = Math.hypot(destination.x - spawn.x, destination.y - spawn.y);
  const { speed } = vehicles[STARTER_VEHICLE_ID];
  return Math.ceil(distance * 1000 / speed + 4000);
}

async function settle(page) {
  await page.read(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function shot(page, name) {
  await settle(page);
  await page.screenshot(join(evidence, `${name}.png`));
}

async function inBrowser(name, options, check, parameters = 'observe=1') {
  const page = await openPage(browser.connection, origin + '?' + parameters, options);
  try {
    await phase(page, 'home');
    await check(page);
    assert.deepEqual(page.errors, [], 'Unexpected browser exceptions, console errors or failed requests');
  } catch (error) {
    await shot(page, `${name}-failure`).catch(() => {});
    throw error;
  } finally {
    await page.close();
  }
}

async function openMission(page, id) {
  await page.click(mission(id));
  return phase(page, 'briefing');
}

async function start(page) {
  await page.click(action('start'));
  return phase(page, 'driving');
}

async function bank(page, count = 1) {
  await page.click(action('bank'), count);
  return phase(page, 'home');
}

async function storage(page, key = SAVE_KEY) {
  return page.read(key => JSON.parse(localStorage.getItem(key)), key);
}

async function assertClear(page, banked, pending) {
  const save = await storage(page);
  const view = await snapshot(page);
  assert.deepEqual(view.progress, save);
  assert.equal(save.bank, banked);
  assert.deepEqual(save.cleared, ['C1-01']);
  if (pending) {
    for (const [key, value] of Object.entries(pending)) assert.equal(save.pending?.[key], value, `Pending haul ${key}`);
  } else {
    assert.equal(save.pending, null);
  }
}

function assertNextMission(view, banked) {
  assert.equal(object(view, 'bank-balance').text, money(banked));
  for (const [id, status, enabled] of [['C1-01', 'replay', true], ['C1-02', 'play', true], ['C1-03', 'locked', false]]) {
    const pin = control(view, mission(id));
    assert.equal(pin.status, status);
    assert.equal(pin.enabled, enabled);
    assert.equal(pin.selected, status === 'play');
  }
}

async function reload(page, expected) {
  const timestamp = await page.read(() => performance.timeOrigin);
  await page.send('Page.reload', { ignoreCache: true });
  await poll(async () => {
    try {
      return (await page.read(() => performance.timeOrigin)) > timestamp;
    } catch (error) {
      if (/execution context|navigat/i.test(error.message)) return false;
      throw error;
    }
  }, 'a replacement document after reload');
  return phase(page, expected);
}

function verifyHud(view) {
  const hud = view.scene.filter(row => row.ancestor === 'driving-hud' && row.label?.startsWith('hud:'));
  assert.deepEqual(hud.map(row => row.label), ['hud:Objective', 'hud:Car damage', 'hud:Heat']);
  assert.ok(hud.every(item => item.type === 'Container' && item.visible &&
    view.scene.some(icon => icon.ancestor === item.label && icon.label.startsWith('icon:') && icon.visible)));
  assert.equal(view.scene.filter(item => item.label.startsWith('heat-star:') && item.type === 'Graphics' && item.visible).length, 5);
  assert.equal(object(view, 'world-geometry').type, 'Container');
  assert.equal(object(view, 'roads-and-lighting').type, 'Graphics');
  assert.equal(object(view, 'canal-buildings').type, 'Graphics');
  assert.equal(object(view, 'player-car').type, 'Container');
  return hud;
}

function verifyDialog(view, actions) {
  assert.equal(object(view, `dialog:${view.phase}`).type, 'Container');
  assert.equal(view.modal, view.phase);
  assert.deepEqual(view.controls.filter(item => item.id.startsWith('card:')).map(item => item.name), actions);
}

function verifyOpeningArt(view) {
  const { bounds: portrait } = object(view, 'postcard-art:first-job');
  const { bounds: bubble } = object(view, 'speech-bubble');
  assert.ok(Math.abs(portrait.width / portrait.height - 1260 / 836) < .015, 'The full Nina illustration must fit the panel');
  assert.ok(portrait.y + portrait.height <= bubble.y + 1, 'The speech bubble must leave the artwork clear');
  for (const id of ['vehicle-picker', action('start'), action('home')]) {
    const { bounds } = control(view, id);
    assert.ok(bounds.y > bubble.y + bubble.height && bounds.y + bounds.height < view.height);
    assert.ok(bounds.height >= 39, `The ${id} hit target must remain usable`);
  }
}

function verifyBonusArt(view) {
  const faceFrame = object(view, 'postcard-illustration-frame');
  const portrait = object(view, 'postcard-art:bonus');
  const inset = portrait.position.y - faceFrame.bounds.y;
  assert.ok(inset > 0 && inset < 2.7, `The top edge must retain both faces and their headroom, inset ${inset}`);
}

async function pixelSamples(page, image, request) {
  return page.read(async (image, request) => {
    async function decode(base64) {
      const pixels = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([pixels], { type: 'image/png' }));
      const samples = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      samples.drawImage(bitmap, 0, 0);
      bitmap.close();
      return samples;
    }
    const samples = await decode(image);
    const { kind, x, y } = request;
    if (kind === 'vertical-joins') {
      return request.columns.map(join => {
        const columns = 17;
        const size = request.height;
        const pixels = samples.getImageData(join - 8, y, columns, size).data;
        const changes = [];
        for (let col = 1; col < columns; col += 1) {
          let total = 0;
          for (let row = 0; row < size; row += 1) {
            const at = (row * columns + col) * 4;
            for (let component = 0; component < 3; component += 1) {
              total += Math.abs(pixels[at + component] - pixels[at - 4 + component]);
            }
          }
          changes.push(total / (size * 3));
        }
        const joinChange = changes.splice(7, 1)[0];
        return { join, joinChange, nearbyMean: changes.reduce((sum, value) => sum + value, 0) / changes.length };
      });
    }
    if (kind === 'backdrop-coverage') {
      return request.wings.map(({ x, width }) => {
        const pixels = samples.getImageData(x, y, width, request.height).data;
        const middle = request.middle - y;
        const low = [Infinity, Infinity];
        const high = [0, 0];
        let midline = 0;
        for (let row = 0; row < request.height; row += 1) {
          const half = Number(row >= middle);
          for (let col = 0; col < width; col += 1) {
            const at = (row * width + col) * 4;
            const level = pixels[at] + pixels[at + 1] + pixels[at + 2];
            low[half] = Math.min(low[half], level);
            high[half] = Math.max(high[half], level);
            if (row === middle) {
              for (let channel = 0; channel < 3; channel += 1) {
                midline += Math.abs(pixels[at + channel] - pixels[at - width * 4 + channel]);
              }
            }
          }
        }
        return { range: high.map((value, half) => value - low[half]), midline: midline / (width * 3) };
      });
    }
    if (kind === 'shift') {
      const next = await decode(request.next);
      const width = request.width ?? samples.canvas.width;
      const first = samples.getImageData(x ?? 0, y, width, request.height).data;
      const second = next.getImageData(x ?? 0, y - request.dy, width, request.height).data;
      let different = 0;
      let changed = 0;
      let max = 0;
      let channels = 0;
      let absolute = 0;
      for (let offset = 0; offset < first.length; offset += 4) {
        for (let component = 0; component < 3; component += 1) {
          const diff = Math.abs(first[offset + component] - second[offset + component]);
          if (diff > 4) different += 1;
          if (diff > 0) changed += 1;
          max = Math.max(max, diff);
          absolute += diff;
          channels += 1;
        }
      }
      return { mismatch: different / channels, mean: absolute / channels, changed: changed / channels, max };
    }
    if (kind === 'neighborhood') {
      const { width, height, closure } = request;
      const pixels = samples.getImageData(x, y, width, height).data;
      let buildings = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const red = pixels[i];
        const green = pixels[i + 1];
        const blue = pixels[i + 2];
        const slateRoof = green >= 76 && green <= 122 && green - red >= 12 && blue - green >= 8 && blue - green <= 19;
        const warmRoof = red >= 95 && red <= 153 && red - green >= 10 && green >= 61 && green - blue <= 25 && blue >= 52;
        if (slateRoof || warmRoof) buildings += 1;
      }
      const upright = closure.height > closure.width;
      const centerX = Math.round(closure.x + closure.width / 2);
      const centerY = Math.round(closure.y + closure.height / 2);
      const vergeX = Math.max(0, centerX - (upright ? 32 : 12));
      const vergeY = Math.max(y, centerY - (upright ? 12 : 32));
      const pavement = samples.getImageData(vergeX, vergeY, Math.min(upright ? 64 : 24, width - vergeX),
        Math.min(upright ? 24 : 64, samples.canvas.height - vergeY)).data;
      let streets = 0;
      for (let i = 0; i < pavement.length; i += 4) {
        const red = pavement[i];
        const green = pavement[i + 1];
        const blue = pavement[i + 2];
        if (red >= 32 && red <= 43 && green >= 44 && green <= 55 && green - red >= 9 &&
            green - red <= 15 && blue - green >= 8 && blue - green <= 13) streets += 1;
      }
      const stripes = samples.getImageData(closure.x, closure.y, closure.width, closure.height).data;
      let barricade = 0;
      for (let i = 0; i < stripes.length; i += 4) {
        if (stripes[i] > 210 && stripes[i + 1] >= 145 && stripes[i + 2] < 130) barricade += 1;
      }
      return { buildings, streets, barricade };
    }
    const swatch = samples.getImageData(Math.round(x) - 9, Math.round(y) - 9, 19, 19).data;
    let match = 0;
    const a = kind === 'pink' ? 0 : 1;
    const c = kind === 'pink' ? 1 : 0;
    for (let i = 0; i < swatch.length; i += 4) {
      if (swatch[i + a] > 168 && swatch[i + 2] > 114 && swatch[i + c] < 143) match += 1;
    }
    return match;
  }, image.toString('base64'), request);
}

function contact(page, kind, touchPoints = []) {
  return page.send('Input.dispatchTouchEvent', { type: kind, touchPoints });
}

async function moveContacts(page, ...touchPoints) {
  await contact(page, 'touchMove', touchPoints);
  // Chromium may deliver coalesced touch moves on the next frame.
  await settle(page);
}

async function holdPoint(page, id, contactId) {
  return { ...await page.center(`drive:${id}`), id: contactId };
}

function verifyTouchControls(view) {
  const brake = control(view, 'drive:brake');
  const stick = control(view, 'drive:steer');
  const { hudBottom } = playfield(view);
  assert.ok(brake.interactive && stick.interactive);
  assert.ok(brake.bounds.x > 0 && brake.bounds.x + brake.bounds.width < view.width / 2);
  assert.ok(stick.bounds.x > view.width / 2 && stick.bounds.x + stick.bounds.width < view.width);
  for (const { bounds } of [brake, stick]) {
    assert.ok(bounds.height >= 44 && bounds.y > hudBottom && bounds.y + bounds.height < view.height);
  }
  assert.ok(stick.bounds.width >= 90 && Math.abs(stick.bounds.width - stick.bounds.height) < .01);
  assert.ok(Math.abs(brake.bounds.y + brake.bounds.height - stick.bounds.y - stick.bounds.height) < .01);
  assert.equal(control(view, 'drive:left'), undefined);
  assert.equal(control(view, 'drive:right'), undefined);
}

function steeringOffset(view) {
  const { x, y, width, height } = control(view, 'drive:steer').bounds;
  const thumb = object(view, 'steer-thumb').position;
  return { x: thumb.x - (x + width / 2), y: thumb.y - (y + height / 2) };
}

function verifyCenteredStick(view) {
  const { x, y } = steeringOffset(view);
  assert.ok(Math.hypot(x, y) < 1, `The thumb is centered, offset was ${x}, ${y}`);
}

async function holdBrake(page, mobile) {
  const brake = mobile ? await holdPoint(page, 'brake', 1) : null;
  if (brake) await contact(page, 'touchStart', [brake]);
  else await page.key('ArrowDown', 'rawKeyDown');
  await poll(async () => (await snapshot(page)).input.brake, 'a real brake input');
  return () => brake ? contact(page, 'touchEnd', [brake]) : page.key('ArrowDown', 'keyUp');
}

function keepBrakeFresh(page, mobile, lift) {
  let started = performance.now();
  return async () => {
    if (performance.now() - started < 550) return;
    // Lift and reapply the brake while steering stays held, as a player can do to avoid reverse.
    await lift();
    lift = await holdBrake(page, mobile);
    started = performance.now();
  };
}

function playfield(view) {
  const hudBottom = Math.max(...verifyHud(view).map(item => item.bounds.y + item.bounds.height));
  const footerTop = object(view, 'driving-controls').bounds.y;
  return { hudBottom, footerTop };
}

function visibleObjective(view) {
  const mark = object(view, 'world-destination');
  const edge = object(view, 'edge-destination');
  assert.notEqual(mark.visible, edge.visible, 'Show one destination indicator at a time');
  const visible = mark.visible ? mark : edge;
  const { y, height, x, width } = visible.bounds;
  const { hudBottom, footerTop } = playfield(view);
  assert.ok(y > hudBottom && y + height < footerTop && x >= 0 && x + width <= view.width,
    `The destination overlaps an overlay or viewport edge: ${JSON.stringify({ visible, hudBottom, footerTop })}`);
  return visible;
}

function waitForWorldDestination(page, id, timeout) {
  return poll(async () => {
    const view = await snapshot(page);
    return view.phase === 'driving' && object(view, 'world-destination').visible && view;
  }, `${id} hands off naturally from the edge cue to the on-road marker`, timeout);
}

async function verifyNeighborhood(page, view) {
  const { hudBottom, footerTop } = playfield(view);
  const overlays = view.scene.filter(node => node.visible && node.ancestor === 'driving-controls').map(node => node.bounds);
  assert.equal(object(view, 'context-streets').ancestor, 'world-geometry');
  assert.equal(object(view, 'canal-buildings').ancestor, 'world-geometry');
  const closures = view.scene.filter(node => {
    if (node.ancestor !== 'road-closures' || !node.visible) return false;
    const { x, y, width, height } = node.bounds;
    if (x <= 1 || x + width >= view.width - 1 || y <= hudBottom + 1 || y + height >= view.height - 1) return false;
    return overlays.every(box => x + width < box.x - 1 || x > box.x + box.width + 1 ||
      y + height < box.y - 1 || y > box.y + box.height + 1);
  });
  const centerDistance = ({ bounds }) => Math.abs(bounds.x + bounds.width / 2 - view.width / 2);
  const [closure] = closures.sort((a, b) => centerDistance(a) - centerDistance(b));
  assert.ok(closure, 'The playable view contains an unobstructed barricade on a nearby closed street');
  const integerBounds = Object.fromEntries(Object.entries(closure.bounds).map(([key, value]) => [key, Math.round(value)]));
  const screen = await page.pixels();
  const pixels = await pixelSamples(page, screen, { kind: 'neighborhood', x: 0, y: Math.ceil(hudBottom), width: view.width,
    height: Math.floor(footerTop) - Math.ceil(hudBottom), closure: integerBounds });
  assert.ok(pixels.buildings > 250 && pixels.streets > 250 && pixels.barricade > 20,
    `The frame shows roofs, closed pavement and a striped barricade: ${JSON.stringify({ pixels, closure })}`);
}

async function captureFirstBend(page, name, mobile) {
  const segment = chapter.missions[3];
  const briefing = await openMission(page, segment.id);
  assert.ok(object(briefing, 'teaching-inset').visible);
  assert.ok(object(briefing, 'context-streets').visible);
  await start(page);
  let releaseBrake = await holdBrake(page, mobile);
  await poll(async () => (await snapshot(page)).drive.player.speed === 0, 'brake to stop before sampling the closed junction');
  await settle(page);
  await verifyNeighborhood(page, await snapshot(page));
  await shot(page, `${name}-c1-04-closed-junction`);
  await releaseBrake();
  const approach = await poll(async () => {
    const view = await snapshot(page);
    const { player, objective } = view.drive;
    return player.y - objective.destination.y < 48 && view;
  }, 'approach the first bend under normal driving', straightDriveTimeout(segment));
  assert.ok(approach.drive.damage === 4);
  releaseBrake = await holdBrake(page, mobile);
  const keepBrake = keepBrakeFresh(page, mobile, releaseBrake);
  await poll(async () => (await snapshot(page)).drive.player.speed < 1, 'brake naturally at the first bend');
  const corner = await snapshot(page);
  assert.equal(corner.phase, 'driving');
  assert.equal(corner.drive.damage, 4);
  await shot(page, `${name}-c1-04-approach`);
  const { player, objective } = corner.drive;
  const turnTo = Math.atan2(objective.destination.y - player.y, objective.destination.x - player.x);
  if (mobile) {
    const stick = await holdPoint(page, 'steer', 2);
    await contact(page, 'touchStart', [stick]);
    await contact(page, 'touchMove', [{ ...stick, x: stick.x + 42 }]);
  } else {
    await page.key('ArrowRight', 'rawKeyDown');
  }
  await poll(async () => {
    const view = await snapshot(page);
    if (view.input.brake && view.input.right && angleDifference(view.drive.player.heading, turnTo) < .10) return true;
    await keepBrake();
    return false;
  }, 'turn toward the open street using the real steering control');
  if (mobile) await contact(page, 'touchEnd', [await holdPoint(page, 'steer', 2)]);
  else await page.key('ArrowRight', 'keyUp');
  if (!mobile) {
    await releaseBrake();
    await settle(page);
    releaseBrake = await holdBrake(page, false);
    await poll(async () => (await snapshot(page)).drive.player.speed === 0, 'stop before sampling the water');
    const clip = { x: 12, y: 68, width: 135, height: 50, scale: 1 };
    const sampleWater = async () => {
      const result = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true, clip });
      return Buffer.from(result.data, 'base64');
    };
    const { x, y } = (await snapshot(page)).drive.player;
    const first = await sampleWater();
    await delay(160);
    const second = await sampleWater();
    const stationary = (await snapshot(page)).drive.player;
    assert.deepEqual([stationary.x, stationary.y, stationary.speed], [x, y, 0], 'The camera stays still between water samples');
    await Promise.all([writeFile(join(evidence, `${name}-c1-04-water-shimmer-a.png`), first),
      writeFile(join(evidence, `${name}-c1-04-water-shimmer-b.png`), second)]);
    const motion = await pixelSamples(page, first, { kind: 'shift', x: 0, y: 0, width: clip.width, height: clip.height,
      next: second.toString('base64'), dy: 0 });
    assert.ok(motion.changed > .035 && motion.mean < 3, `Stationary viewing shows subtle moving water: ${JSON.stringify(motion)}`);
  }
  await releaseBrake();
  const turned = await snapshot(page);
  assert.ok(angleDifference(turned.drive.player.heading, turnTo) < .22);
  assert.equal(visibleObjective(turned).label, 'world-destination');
  await shot(page, `${name}-c1-04-corner`);
}

function headingDelta(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function angleDifference(a, b) {
  return Math.abs(headingDelta(a, b));
}

test('Authored Home, briefing, paused driving, hands-off clear, bonus return and single bank', { timeout: 70000 }, async () => {
  await inBrowser('desktop', {}, async page => {
    const [first, ...otherOpeners] = chapter.missions.slice(0, 3);
    const home = await snapshot(page);
    assert.equal(object(home, 'menu-title').text, 'PALMERA BAY');
    assert.equal(object(home, 'bank-balance').text, money(0));
    assert.equal(page.responses.get('/src/content/world.json'), 200);
    assert.equal(page.responses.get('/src/content/chapter1.json'), 200);
    assert.equal(page.responses.has('/src/fixture.mjs'), false);
    const nodes = home.controls.filter(item => item.action === 'open');
    assert.deepEqual(nodes.map(({ value, enabled }) => [value, enabled]), Array.from({ length: 21 }, (_, index) =>
      [`C1-${String(index + 1).padStart(2, '0')}`, index === 0]));
    assert.equal(object(home, 'route-road').type, 'Graphics');
    assert.ok(home.scene.some(node => node.label === 'map-tile' && node.type === 'Sprite' && node.visible));
    assert.ok(control(home, mission('C1-01')).interactive);
    await shot(page, 'desktop-story');
    await page.click(mission('C1-02'));
    assert.equal((await snapshot(page)).phase, 'home');

    const briefing = await openMission(page, 'C1-01');
    verifyDialog(briefing, ['Play', 'Story']);
    assert.equal(object(briefing, 'card-title').text, 'Reach the Marker');
    assert.match(object(briefing, 'card-instruction').text, /accelerates on its own.*straight.*marker/i);
    assert.equal(object(briefing, 'postcard-art:first-job').type, 'Sprite');
    verifyOpeningArt(briefing);
    const inset = object(briefing, 'teaching-inset');
    assert.equal(inset.type, 'Container');
    assert.ok(inset.visible && inset.bounds.width >= 55 && Math.abs(inset.bounds.width - inset.bounds.height) < 1);
    assert.equal(object(briefing, 'lesson-goal').type, 'Container');
    assert.match(control(briefing, 'vehicle-picker').name, /Starter Coupe · Tier 1/);
    await shot(page, 'desktop-briefing');

    await start(page);
    const releaseBrake = await holdBrake(page, false);
    const launch = await snapshot(page);
    assert.equal(visibleObjective(launch).label, 'edge-destination');
    await verifyNeighborhood(page, launch);
    await shot(page, 'desktop-c1-01-closed-junction');
    await releaseBrake();
    await page.press('Escape');
    const paused = await phase(page, 'pause');
    verifyHud(paused);
    verifyDialog(paused, ['Resume', 'Back to menu']);
    assert.equal(paused.focus, null);
    assert.equal(paused.activeHost, true);
    await page.press('Tab', 8);
    assert.equal((await snapshot(page)).focus, action('home'));
    await page.press('Tab');
    assert.equal((await snapshot(page)).focus, action('resume'));
    assert.ok(object(await snapshot(page), 'keyboard-focus').bounds.width > 30);
    await page.press('Tab', 8);
    assert.equal((await snapshot(page)).focus, action('home'));
    await settle(page);
    const stopped = await page.pixels();
    await delay(350);
    assert.deepEqual((await snapshot(page)).drive, paused.drive);
    assert.ok(stopped.equals(await page.pixels()), 'Pause must freeze the rendered world and real game state');
    await shot(page, 'desktop-pause');

    await page.click(action('resume'));
    const active = await phase(page, 'driving');
    assert.equal(active.activeHost, true);
    assert.equal(active.modal, null);
    await shot(page, 'desktop-drive');
    const onRoad = await waitForWorldDestination(page, first.id, straightDriveTimeout(first));
    assert.deepEqual(onRoad.input, neutral);
    const mark = visibleObjective(onRoad);
    assert.equal(mark.label, 'world-destination');
    assert.ok(await pixelSamples(page, await page.pixels(), { kind: 'aqua', ...mark.position }) > 70);
    await shot(page, 'desktop-c1-01-world-marker');
    const success = await phase(page, 'success');
    verifyDialog(success, ['Continue to Story', 'Bonus']);
    const haul = object(success, 'card-copy').text;
    assert.match(haul, /\$100/);
    await assertClear(page, 0, pendingMain);
    await shot(page, 'desktop-success');

    await page.click(action('bonus'));
    const bonus = await phase(page, 'bonus-briefing');
    verifyDialog(bonus, ['Start Bonus', 'Back to Success']);
    assert.equal(object(bonus, 'payout:Bonus payout').text, '+$50');
    verifyBonusArt(bonus);
    await shot(page, 'desktop-bonus');
    await page.press('Escape');
    assert.equal(object(await phase(page, 'success'), 'card-copy').text, haul);
    await assertClear(page, 0, pendingMain);

    await reload(page, 'success');
    await assertClear(page, 0, pendingMain);
    await bank(page, 2);
    await assertClear(page, mainPayout, null);
    assertNextMission(await reload(page, 'home'), mainPayout);
    for (const opener of otherOpeners) {
      await openMission(page, opener.id);
      await start(page);
      await phase(page, 'success', straightDriveTimeout(opener));
      await bank(page);
    }
    await captureFirstBend(page, 'desktop', false);
  });
});

test('Authored M1 bonus success carries condition and automatically banks both payouts', { timeout: 24000 }, async () => {
  await inBrowser('bonus-success', {}, async page => {
    const first = chapter.missions[0];
    await openMission(page, first.id);
    await start(page);
    await phase(page, 'success', straightDriveTimeout(first));
    await assertClear(page, 0, pendingMain);
    await page.click(action('bonus'));
    await phase(page, 'bonus-briefing');
    const active = await start(page);
    assert.equal(active.drive.damage, 4);
    assert.equal(active.run.bonus, true);
    assert.equal(active.progress.pending, null);
    await phase(page, 'home', straightDriveTimeout(first.bonus));
    await assertClear(page, mainPayout + bonusPayout, null);
    assertNextMission(await snapshot(page), mainPayout + bonusPayout);
  });
});

test('390×600 wheel tracks full circles in both directions and unwinds from lock', { timeout: 26000 }, async () => {
  await inBrowser('mobile-wheel-arcs', { width: 390, height: 600, mobile: true }, async page => {
    await openMission(page, 'C1-01');
    await start(page);
    const brake = await holdPoint(page, 'brake', 1);
    const wheel = await holdPoint(page, 'steer', 2);
    const rim = degrees => {
      const angle = degrees * Math.PI / 180;
      return { ...wheel, x: wheel.x + 42 * Math.sin(angle), y: wheel.y - 42 * Math.cos(angle) };
    };
    const indexAngle = view => {
      const { position } = object(view, 'steer-index');
      return Math.atan2(position.x - wheel.x, wheel.y - position.y);
    };
    await contact(page, 'touchStart', [brake]);
    let brakeSince = performance.now();
    async function moveTo(point) {
      if (performance.now() - brakeSince > 600) {
        await contact(page, 'touchEnd', [brake]);
        await contact(page, 'touchStart', [brake]);
        brakeSince = performance.now();
      }
      await moveContacts(page, point);
      const view = await snapshot(page);
      assert.equal(view.input.brake, true);
      return view;
    }

    for (const direction of [1, -1]) {
      await contact(page, 'touchStart', [rim(0)]);
      assert.equal((await snapshot(page)).input.steering, 0, 'grabbing the rim starts neutral');
      for (let degrees = 30; degrees <= 390; degrees += 30) {
        const view = await moveTo(rim(direction * degrees));
        const strength = direction * view.input.steering;
        if (degrees === 30) assert.ok(strength > .24 && strength < .37);
        else if (degrees === 60) assert.ok(strength > .55 && strength < .75);
        else assert.ok(strength > .98, `${degrees}° in direction ${direction}`);
        assert.ok(angleDifference(indexAngle(view), direction * degrees * Math.PI / 180) < .045,
          `the wheel index tracks the finger at ${direction * degrees}°`);
        if (degrees === 210) await shot(page, `mobile-390-wheel-arc-${direction > 0 ? 'clockwise' : 'counterclockwise'}`);
      }

      let view = await moveTo(wheel);
      verifyCenteredStick(view);
      assert.equal(view.input.steering, direction, 'crossing the hub does not manufacture a turn');
      assert.ok(angleDifference(indexAngle(view), direction * 390 * Math.PI / 180) < .045);
      view = await moveTo(rim(direction * 210));
      assert.equal(view.input.steering, direction, 'leaving the hub reanchors the gesture');
      view = await moveTo(rim(direction * 390));
      assert.equal(view.input.steering, direction, 'a diametric jump is also a hub crossing');

      view = await moveTo(rim(direction * 360));
      assert.ok(direction * view.input.steering > .6 && direction * view.input.steering < .8);
      view = await moveTo(rim(direction * 300));
      assert.equal(view.input.steering, 0, 'unwinding 90° from lock brings the steering to neutral');
      view = await moveTo(rim(direction * 270));
      assert.ok(direction * view.input.steering < -.24, 'a further unwind reverses the steering sign');
      await contact(page, 'touchEnd', [wheel]);
      view = await snapshot(page);
      assert.deepEqual(view.input, { ...neutral, brake: true });
      verifyCenteredStick(view);
      assert.ok(Math.abs(indexAngle(view)) < .02);
    }
    await contact(page, 'touchStart', [wheel]);
    for (let degrees = 0; degrees <= 270; degrees += 15) await moveTo(rim(degrees));
    assert.ok((await snapshot(page)).input.steering > .98, 'an arc can continue from a center grab');
    await contact(page, 'touchEnd');
    assert.deepEqual((await snapshot(page)).input, neutral);
  });
});

test('390×600 held brake waits at rest, reverses, and rolls through zero on lift', { timeout: 18000 }, async () => {
  await inBrowser('mobile-reverse', { width: 390, height: 600, mobile: true }, async page => {
    await openMission(page, 'C1-01');
    await start(page);
    const brake = await holdPoint(page, 'brake', 1);
    await contact(page, 'touchStart', [brake]);
    const stopped = await poll(async () => {
      const view = await snapshot(page);
      return view.input.brake && view.drive.player.speed === 0 && view.drive.player;
    }, 'the mobile brake to reach a stop');
    await shot(page, 'mobile-390-reverse-before');
    await delay(650);
    assert.deepEqual((await snapshot(page)).drive.player, stopped);
    const progress = player => (player.x - stopped.x) * Math.cos(stopped.heading) + (player.y - stopped.y) * Math.sin(stopped.heading);
    await poll(async () => {
      const view = await snapshot(page);
      return view.input.brake && view.drive.player.speed === -36 && progress(view.drive.player) < -12;
    }, 'the held pedal to reverse the vehicle down the road');
    await shot(page, 'mobile-390-reversing');
    await contact(page, 'touchEnd', [brake]);
    const rolling = await poll(async () => {
      const view = await snapshot(page);
      return !view.input.brake && view.drive.player.speed > -36 && view.drive.player.speed < 0 && view.drive.player;
    }, 'continued backward roll on release');
    const resumed = await poll(async () => {
      const view = await snapshot(page);
      return view.drive.player.speed > 0 && view.drive.player;
    }, 'automatic forward acceleration after reversing');
    assert.ok(progress(resumed) < progress(rolling), 'the car coasted backward before driving forward again');
  });
});

test('390×600 wheel turns progressively through light, middle and edge pulls', { timeout: 24000 }, async t => {
  await inBrowser('mobile-proportional-steering', { width: 390, height: 600, mobile: true }, async page => {
    await openMission(page, 'C1-01');
    await start(page);
    const brake = await holdPoint(page, 'brake', 1);
    const stick = await holdPoint(page, 'steer', 2);
    await contact(page, 'touchStart', [brake]);
    await poll(async () => {
      const view = await snapshot(page);
      return view.input.brake && view.drive.player.speed === 0;
    }, 'brake to stop the car so that all steering samples start at the same pace');
    await contact(page, 'touchStart', [stick]);

    async function measureTurn(dx, dy = 0) {
      await contact(page, 'touchEnd', [brake]);
      await contact(page, 'touchStart', [brake]);
      await poll(async () => (await snapshot(page)).drive.player.speed === 0, 'stop between steering samples');
      await moveContacts(page, { ...stick, x: stick.x + dx, y: stick.y + dy });
      const sample = await page.read(async () => {
        const first = window.__getawayScene();
        const start = performance.now();
        const end = await new Promise(resolve => {
          function frame(time) {
            if (time - start >= 240) resolve(time);
            else requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        });
        const last = window.__getawayScene();
        return { startHeading: first.drive.player.heading, endHeading: last.drive.player.heading,
          seconds: (end - start) / 1000, view: last };
      });
      assert.equal(sample.view.drive.player.speed, 0);
      assert.equal(sample.view.input.brake, true);
      return { rate: headingDelta(sample.endHeading, sample.startHeading) / sample.seconds, view: sample.view };
    }

    const light = await measureTurn(10);
    await shot(page, 'mobile-390-controls-slight');
    const middle = await measureTurn(22);
    const edge = await measureTurn(47);
    const lightRatio = light.rate / edge.rate;
    const middleRatio = middle.rate / edge.rate;
    t.diagnostic(`Measured light / middle / edge yaw rates: ${[light.rate, middle.rate, edge.rate].map(value => value.toFixed(3)).join(' / ')} rad/s`);
    assert.ok(edge.rate > .35 && lightRatio > .035 && lightRatio < .25,
      `Light steering should turn at a small fraction of full rate, observed ${lightRatio}`);
    assert.ok(middleRatio > .30 && middleRatio < .75, `Middle steering rate ratio was ${middleRatio}`);
    assert.ok(light.view.input.steering > 0 && light.view.input.steering < .25);
    assert.ok(middle.view.input.steering > .3 && middle.view.input.steering < .75);
    assert.equal(edge.view.input.steering, 1);

    const vertical = await measureTurn(0, -67);
    assert.ok(Math.abs(vertical.rate) < .001);
    assert.equal(vertical.view.input.steering, 0);
    const wheel = control(vertical.view, 'drive:steer').bounds;
    const thumb = object(vertical.view, 'steer-thumb').position;
    assert.ok(Math.abs(thumb.x - stick.x) < 1 && thumb.y < stick.y - 25);
    const diagonal = await measureTurn(42, -42);
    assert.ok(diagonal.view.input.steering > .4 && diagonal.view.input.steering < .8);
    const diagonalThumb = object(diagonal.view, 'steer-thumb').position;
    assert.ok(Math.abs(Math.hypot(diagonalThumb.x - stick.x, diagonalThumb.y - stick.y) - (stick.y - thumb.y)) < 1);
    const inside = await measureTurn(4);
    assert.ok(Math.abs(inside.rate) < .001);
    assert.equal(inside.view.input.steering, 0);

    await contact(page, 'touchEnd', [stick]);
    const outside = { id: stick.id, x: wheel.x + 3, y: wheel.y + 3 };
    await contact(page, 'touchStart', [outside]);
    await moveContacts(page, { ...stick, x: stick.x + 30 });
    assert.deepEqual((await snapshot(page)).input, { ...neutral, brake: true });
    await contact(page, 'touchEnd');
  });
});

test('390×600 touch steering crosses neutral and releases independently of the brake', { timeout: 26000 }, async () => {
  await inBrowser('mobile-controls', { width: 390, height: 600, mobile: true }, async page => {
    assert.equal(await page.read(() => navigator.maxTouchPoints), 2);
    await openMission(page, 'C1-01');
    await shot(page, 'mobile-390-briefing');
    const idle = await start(page);
    verifyTouchControls(idle);
    verifyCenteredStick(idle);
    assert.equal(object(idle, 'held:brake').visible, false);
    await shot(page, 'mobile-390-controls-neutral');
    const brake = await holdPoint(page, 'brake', 1);
    const stick = await holdPoint(page, 'steer', 2);
    const right = { ...stick, x: stick.x + 48 };
    const left = { ...stick, x: stick.x - 47 };
    await contact(page, 'touchStart', [brake]);
    await poll(async () => (await snapshot(page)).input.brake, 'touch brake');
    assert.equal(object(await snapshot(page), 'held:brake').visible, true);
    await delay(250);
    const stopped = (await snapshot(page)).drive.player;
    await delay(250);
    assert.deepEqual((await snapshot(page)).drive.player, stopped);
    await contact(page, 'touchStart', [stick]);
    await moveContacts(page, { ...stick, x: stick.x + 4 });
    let view = await snapshot(page);
    assert.deepEqual(view.input, { ...neutral, brake: true });
    assert.ok(steeringOffset(view).x > 2 && steeringOffset(view).x < 6, 'The thumb moves inside the dead zone');
    await contact(page, 'touchMove', [right]);
    await poll(async () => {
      const view = await snapshot(page);
      return view.input.brake && view.input.right && headingDelta(view.drive.player.heading, stopped.heading) > .25;
    }, 'the braked car to turn right with the steering finger near the right rim');
    view = await snapshot(page);
    assert.ok(steeringOffset(view).x > 30 && steeringOffset(view).x < right.x - stick.x);
    await shot(page, 'mobile-390-controls-steering-and-brake');

    await contact(page, 'touchEnd', [brake]);
    await contact(page, 'touchStart', [brake]);
    await moveContacts(page, stick);
    view = await snapshot(page);
    assert.deepEqual(view.input, { ...neutral, brake: true });
    verifyCenteredStick(view);
    const centeredHeading = view.drive.player.heading;
    await contact(page, 'touchMove', [left]);
    await poll(async () => {
      const view = await snapshot(page);
      return view.input.brake && view.input.left && !view.input.right && steeringOffset(view).x < -25 &&
        headingDelta(view.drive.player.heading, centeredHeading) < -.20;
    }, 'the same finger to reverse steering through the center');

    await contact(page, 'touchEnd', [left]);
    view = await snapshot(page);
    assert.deepEqual(view.input, { ...neutral, brake: true });
    assert.equal(object(view, 'held:brake').visible, true);
    verifyCenteredStick(view);
    await contact(page, 'touchStart', [stick]);
    await moveContacts(page, right);
    await contact(page, 'touchEnd', [brake]);
    view = await snapshot(page);
    assert.deepEqual(view.input, { ...neutral, right: true, steering: 1 });
    assert.equal(object(view, 'held:brake').visible, false);
    assert.ok(steeringOffset(view).x > 30);

    const otherStick = { ...left, id: 1 };
    await contact(page, 'touchStart', [otherStick]);
    await moveContacts(page, { ...otherStick, x: otherStick.x - 8 });
    assert.deepEqual((await snapshot(page)).input, { ...neutral, right: true, steering: 1 });
    await contact(page, 'touchEnd', [right]);
    await moveContacts(page, { ...otherStick, x: otherStick.x + 70 });
    view = await snapshot(page);
    assert.deepEqual(view.input, neutral, 'A second touch must not take over the stick after its owner lifts');
    verifyCenteredStick(view);
    await contact(page, 'touchEnd');

    const otherBrake = { ...brake, id: 2, x: brake.x + 9 };
    await contact(page, 'touchStart', [brake, otherBrake]);
    assert.deepEqual((await snapshot(page)).input, { ...neutral, brake: true });
    await contact(page, 'touchEnd', [brake]);
    assert.deepEqual((await snapshot(page)).input, neutral, 'A second touch must not keep the brake held');
    await contact(page, 'touchEnd');

    await contact(page, 'touchStart', [brake, stick]);
    await moveContacts(page, right);
    assert.deepEqual((await snapshot(page)).input, { ...neutral, brake: true, right: true, steering: 1 });
    await contact(page, 'touchCancel');
    view = await snapshot(page);
    assert.deepEqual(view.input, neutral);
    assert.equal(object(view, 'held:brake').visible, false);
    verifyCenteredStick(view);
    const released = view.drive.player;
    await poll(async () => {
      const player = (await snapshot(page)).drive?.player;
      return player && Math.hypot(player.x - released.x, player.y - released.y) > 4;
    }, 'vehicle to move again after cancellation');
  });
});

test('Mobile driving releases captured controls on lost capture, pause, resize, and backgrounding', { timeout: 26000 }, async () => {
  await inBrowser('mobile-controls-lifecycle', { width: 390, height: 600, mobile: true }, async page => {
    await openMission(page, 'C1-01');
    await start(page);

    async function engage(observeSteer = false) {
      const brake = await holdPoint(page, 'brake', 1);
      const stick = await holdPoint(page, 'steer', 2);
      const right = { ...stick, x: stick.x + 43 };
      await contact(page, 'touchStart', [brake]);
      if (observeSteer) await page.read(() => {
        const canvas = document.querySelector('canvas');
        const observed = window.steerCapture = {};
        canvas.addEventListener('pointerdown', event => { observed.id = event.pointerId; }, { once: true });
        canvas.addEventListener('lostpointercapture', event => {
          if (event.pointerId === observed.id) observed.lost = event.isTrusted;
        });
      });
      await contact(page, 'touchStart', [stick]);
      await moveContacts(page, right);
      assert.deepEqual((await snapshot(page)).input, { ...neutral, brake: true, right: true, steering: 1 });
      return { brake, stick, right };
    }

    function verifyReset(view) {
      assert.deepEqual(view.input, neutral);
      verifyCenteredStick(view);
      assert.equal(object(view, 'held:brake').visible, false);
    }

    async function verifyLift({ brake, stick, right }) {
      await moveContacts(page, { ...brake, x: brake.x + 8 }, { ...right, x: stick.x - 26 });
      verifyReset(await snapshot(page));
      await contact(page, 'touchEnd');
      verifyReset(await snapshot(page));
    }

    const { right } = await engage(true);
    assert.equal(await page.read(() => {
      const canvas = document.querySelector('canvas');
      const { id } = window.steerCapture;
      if (!canvas.hasPointerCapture(id)) return false;
      canvas.releasePointerCapture(id);
      return true;
    }), true);
    await moveContacts(page, { ...right, x: right.x - 70 });
    assert.equal(await page.read(() => window.steerCapture.lost), true);
    let view = await snapshot(page);
    assert.deepEqual(view.input, { ...neutral, brake: true });
    verifyCenteredStick(view);
    await contact(page, 'touchEnd');
    verifyReset(await snapshot(page));

    const paused = await engage();
    await page.press('Escape');
    view = await phase(page, 'pause');
    assert.deepEqual(view.input, neutral);
    assert.equal(object(view, 'drive:steer'), undefined);
    assert.equal(object(view, 'drive:brake'), undefined);
    await page.press('Escape');
    verifyReset(await phase(page, 'driving'));
    await verifyLift(paused);

    const resized = await engage();
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 360, height: 620, deviceScaleFactor: 1, mobile: true, screenWidth: 360, screenHeight: 620,
    });
    view = await poll(async () => {
      const scene = await snapshot(page);
      return scene.width === 360 && scene.height === 620 && scene;
    }, 'active Pixi drive to resize');
    assert.equal(view.phase, 'driving');
    verifyTouchControls(view);
    verifyReset(view);
    await verifyLift(resized);

    const backgrounded = await engage();
    const foreground = await page.background();
    try {
      assert.deepEqual((await phase(page, 'pause')).input, neutral);
    } finally {
      await foreground();
    }
    await page.press('Escape');
    verifyReset(await phase(page, 'driving'));
    await verifyLift(backgrounded);
  });
});

test('Wider touch-capable driving offers the stick and brake and keeps keyboard input available', { timeout: 18000 }, async () => {
  await inBrowser('wide-touch-controls', { width: 900, height: 640 }, async page => {
    await openMission(page, 'C1-01');
    const desktop = await start(page);
    for (const id of ['drive:left', 'drive:brake', 'drive:right']) assert.ok(control(desktop, id).interactive);
    assert.ok(object(desktop, 'drive-help').visible);
    assert.equal(control(desktop, 'drive:steer'), undefined);
    const existingBrake = await page.center('drive:brake');
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...existingBrake, button: 'left', buttons: 1 });
    assert.deepEqual((await snapshot(page)).input, { ...neutral, brake: true });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...existingBrake, button: 'left' });
    assert.deepEqual((await snapshot(page)).input, neutral);
    await shot(page, 'desktop-900-controls');

    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
    const hybrid = await poll(async () => {
      const view = await snapshot(page);
      return view.width === 900 && control(view, 'drive:steer') && view;
    }, 'the same wide canvas to expose touch controls');
    verifyTouchControls(hybrid);
    const stick = await holdPoint(page, 'steer', 1);
    await page.key('ArrowDown', 'rawKeyDown');
    await contact(page, 'touchStart', [stick]);
    await moveContacts(page, { ...stick, x: stick.x - 23 });
    const touch = (await snapshot(page)).input;
    assert.ok(touch.left && touch.brake && touch.steering > -.6 && touch.steering < -.4);
    await page.key('ArrowRight', 'rawKeyDown');
    assert.deepEqual((await snapshot(page)).input, { ...neutral, brake: true, right: true, steering: 1 });
    await page.key('ArrowLeft', 'rawKeyDown');
    assert.deepEqual((await snapshot(page)).input, { ...neutral, brake: true, left: true, right: true });
    await page.key('ArrowRight', 'keyUp');
    assert.deepEqual((await snapshot(page)).input, { ...neutral, brake: true, left: true, steering: -1 });
    await page.key('ArrowLeft', 'keyUp');
    assert.deepEqual((await snapshot(page)).input, touch);
    await contact(page, 'touchEnd');
    assert.deepEqual((await snapshot(page)).input, { ...neutral, brake: true });
    await page.key('ArrowDown', 'keyUp');
    assert.deepEqual((await snapshot(page)).input, neutral);
  });
});

for (const [width, height] of [[390, 600], [320, 568]]) {
  test(`${width}×${height} leads all three opening drives from the edge cue to the on-road target`, { timeout: 65000 }, async () => {
    await inBrowser(`mobile-markers-${width}`, { width, height, mobile: true }, async page => {
      await shot(page, `mobile-${width}-story`);
      const opening = chapter.missions.slice(0, 3);
      for (const opener of opening) {
        const { id, spawn, objective } = opener;
        const preview = await openMission(page, id);
        assert.equal(Boolean(object(preview, 'teaching-inset')), id === 'C1-01');
        assert.equal(object(preview, 'drive:steer'), undefined);
        if (id === 'C1-01') {
          verifyOpeningArt(preview);
          await shot(page, `mobile-${width}-briefing`);
        }
        const active = await start(page);
        verifyTouchControls(active);
        assert.equal(active.drive.player.heading, spawn.heading);
        assert.ok(Math.hypot(active.drive.player.x - spawn.x, active.drive.player.y - spawn.y) < 6);
        const releaseBrake = await holdBrake(page, true);
        await settle(page);
        const view = await snapshot(page);
        assert.deepEqual([view.width, view.height], [width, height]);
        assert.match(object(view, 'objective-text').text, /reach the marker/i);
        assert.deepEqual(view.drive.objective, objective);
        const cue = visibleObjective(view);
        assert.equal(cue.label, 'edge-destination', `${id} starts with the longer target outside the playfield`);
        const car = object(view, 'player-car');
        assert.ok(Math.abs(cue.position.x - car.position.x) < 4 && cue.position.y < car.position.y,
          `${id} cue is straight ahead`);
        const screen = await page.pixels();
        assert.ok(await pixelSamples(page, screen, { kind: 'aqua', ...cue.position }) > 70);
        assert.ok(await pixelSamples(page, screen, { kind: 'pink', ...car.position }) > 25);
        if (id === 'C1-01') await verifyNeighborhood(page, view);
        if (id !== 'C1-02') await shot(page, `mobile-${width}-${id.toLowerCase()}-edge-cue`);
        await releaseBrake();
        if (id === 'C1-01' && width === 320) await shot(page, 'mobile-320-controls-neutral');
        if (id === 'C1-01' && width === 390) {
          await page.click('drive:pause');
          await phase(page, 'pause');
          await shot(page, 'mobile-390-pause');
          await page.click(action('resume'));
        }
        const onRoad = await waitForWorldDestination(page, id, straightDriveTimeout(opener));
        assert.deepEqual(onRoad.input, neutral);
        const mark = visibleObjective(onRoad);
        assert.equal(mark.label, 'world-destination');
        assert.ok(Math.abs(mark.position.x - object(onRoad, 'player-car').position.x) < 4);
        assert.ok(await pixelSamples(page, await page.pixels(), { kind: 'aqua', ...mark.position }) > 70);
        if (id !== 'C1-02') await shot(page, `mobile-${width}-${id.toLowerCase()}-drive`);
        const success = await phase(page, 'success');
        assert.equal(object(success, 'drive:steer'), undefined);
        assert.equal(object(success, 'drive:brake'), undefined);
        if (id === 'C1-01') {
          if (width === 390) await shot(page, 'mobile-390-success');
          await page.click(action('bonus'));
          verifyBonusArt(await phase(page, 'bonus-briefing'));
          await shot(page, `mobile-${width}-bonus`);
          await page.click(action('cancel-bonus'));
          await phase(page, 'success');
        }
        await bank(page);
      }
      assert.deepEqual((await storage(page)).cleared, opening.map(({ id }) => id));
      await captureFirstBend(page, `mobile-${width}`, true);
    });
  });
}

async function turnAcrossStreet(page, target, tolerance = .105) {
  const liftBrake = await holdBrake(page, false);
  const keepBrake = keepBrakeFresh(page, false, liftBrake);
  await delay(110);
  const initial = (await snapshot(page)).drive.player.heading;
  const turn = Math.atan2(Math.sin(target - initial), Math.cos(target - initial));
  if (Math.abs(turn) < tolerance) {
    await liftBrake();
    return;
  }
  const direction = turn < 0 ? 'ArrowLeft' : 'ArrowRight';
  await page.key(direction, 'rawKeyDown');
  try {
    await poll(async () => {
      const view = await snapshot(page);
      if (view.phase === 'driving' && angleDifference(view.drive.player.heading, target) < tolerance) return true;
      await keepBrake();
      return false;
    }, `keyboard steering to ${target.toFixed(2)} radians`, 4200);
  } finally {
    await page.key(direction, 'keyUp');
    await liftBrake();
  }
}

function waitForCondition(page, amount) {
  return poll(async () => (await snapshot(page)).drive?.damage === amount, `${amount} condition pips`, 3500);
}

for (const [width, height] of [[320, 568], [390, 600]]) {
  test(`${width}×${height} contains live impact feedback inside the objective panel`, { timeout: 22000 }, async () => {
    await inBrowser(`compact-impact-${width}`, { width, height, mobile: true }, async page => {
      await openMission(page, 'C1-01');
      await start(page);
      await turnAcrossStreet(page, 0);
      const hit = await poll(async () => {
        const view = await snapshot(page);
        return view.drive?.damage === 3 && object(view, 'objective-incident')?.visible && view;
      }, 'a real road impact to show live condition feedback');
      const panel = object(hit, 'hud-panel:Objective');
      assert.equal(panel.type, 'Graphics');
      assert.equal(object(hit, 'objective-text').text, 'Reach the marker');
      assert.equal(object(hit, 'objective-incident').text, 'Hard impact. Car condition dropped.');
      const goal = object(hit, 'objective-text').bounds;
      const incident = object(hit, 'objective-incident').bounds;
      assert.ok(goal.y + goal.height <= incident.y, `The objective and feedback must occupy separate lines: ${JSON.stringify({ goal, incident })}`);
      const { bounds: rect } = panel;
      for (const bounds of [goal, incident]) {
        assert.ok(bounds.x >= rect.x && bounds.y >= rect.y && bounds.x + bounds.width <= rect.x + rect.width &&
          bounds.y + bounds.height <= rect.y + rect.height, JSON.stringify({ bounds, rect }));
      }
      verifyHud(hit);
      await shot(page, `compact-${width}-impact-hud`);
    });
  });
}

test('An authored M1 bonus wreck loses the haul, preserves the main clear, and supports keyboard replay', { timeout: 45000 }, async () => {
  await inBrowser('bonus-wreck', { width: 720, height: 640 }, async page => {
    await openMission(page, 'C1-01');
    await start(page);
    await turnAcrossStreet(page, 0);
    await waitForCondition(page, 3);
    await turnAcrossStreet(page, Math.PI);
    await poll(async () => {
      const drive = (await snapshot(page)).drive;
      return Math.abs(drive.player.x - drive.objective.destination.x) < 16;
    }, 'car aligned near the center of the road');
    const { spawn, objective: { destination } } = chapter.missions[0];
    const legs = Math.ceil((spawn.y - destination.y) / 240);
    for (let legsLeft = legs; legsLeft > 0; legsLeft -= 1) {
      await page.key('ArrowDown', 'rawKeyDown');
      await poll(async () => Math.abs((await snapshot(page)).drive.player.speed) < 1, 'brake before aiming up the street');
      const { player } = (await snapshot(page)).drive;
      const nextY = destination.y + (player.y - destination.y) * (legsLeft - 1) / legsLeft;
      await turnAcrossStreet(page, Math.atan2(nextY - player.y, destination.x - player.x), .065);
      if (legsLeft > 1) {
        await poll(async () => {
          const view = await snapshot(page);
          assert.equal(view.drive.damage, 3, 'The car keeps its one impact on the way to the main finish');
          return view.drive.player.y <= nextY;
        }, 'drive to the next point on the opening street');
      }
    }
    await phase(page, 'success');
    await assertClear(page, 0, { ...pendingMain, damage: 3 });
    await page.click(action('bonus'));
    await phase(page, 'bonus-briefing');
    await start(page);
    await waitForCondition(page, 3);
    await assertClear(page, 0, null);
    for (const [heading, remaining] of [[.14, 2], [Math.PI - .14, 1], [.14, 0]]) {
      await turnAcrossStreet(page, heading);
      await waitForCondition(page, remaining);
    }
    const failed = await phase(page, 'failure');
    verifyDialog(failed, ['Replay', 'Back to menu']);
    assert.deepEqual(failed.failure, { reason: 'wrecked', lost: 100, bonus: true });
    assert.match(object(failed, 'card-copy').text, /wreck.*\$100.*main job.*complete/i);
    assert.ok(object(failed, 'failure-art:wrecked').visible);
    await shot(page, 'bonus-wrecked');
    await page.press('Tab');
    assert.equal((await snapshot(page)).focus, action('replay'));
    await page.press('Enter');
    assert.equal((await phase(page, 'briefing')).run.missionId, 'C1-01');
    await page.press('Escape');
    assertNextMission(await phase(page, 'home'), 0);
    await reload(page, 'home');
    await assertClear(page, 0, null);
    assertNextMission(await snapshot(page), 0);
  });
});

async function wheel(page, deltaY) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 194, y: 290, deltaX: 0, deltaY });
}

async function atOffset(page, goal) {
  await poll(async () => {
    const at = (await snapshot(page)).scroll;
    return Math.abs(at.offset - goal) < .1;
  }, `Story offset ${goal}`);
  await settle(page);
}

async function moveMap(page, goal) {
  const { offset } = (await snapshot(page)).scroll;
  await wheel(page, goal - offset);
  await atOffset(page, goal);
}

async function pressStoryKey(page, code) {
  const virtualKey = { PageUp: 33, PageDown: 34, End: 35, Home: 36 }[code];
  for (const type of ['rawKeyDown', 'keyUp']) {
    await page.send('Input.dispatchKeyEvent', { type, code, key: code, windowsVirtualKeyCode: virtualKey });
  }
}

function assertStoryBottom(view) {
  assert.equal(view.scroll.offset, view.scroll.max);
  const first = control(view, mission('C1-01'));
  const story = control(view, 'story-map').bounds;
  assert.ok(first.interactive && first.visible);
  assert.equal(first.alpha, 1);
  assert.ok(first.bounds.y >= story.y && first.bounds.y + first.bounds.height < story.y + story.height);
  assert.equal(control(view, mission('C1-21')).visible, false);
  assert.equal(object(view, 'district:neon-strip').visible, false);
  const roads = view.scene.filter(node => node.label === 'route-road');
  const dots = view.scene.filter(node => node.label === 'route-dots');
  assert.equal(roads.length, 1);
  assert.equal(dots.length, 1);
  const [a, b] = view.scene.filter(node => node.label === 'map-tile');
  const band = b.position.y - a.position.y;
  const approachEnd = first.bounds.y + first.bounds.height / 2 + band * .075 + 12;
  for (const { bounds } of [...roads, ...dots]) {
    assert.ok(bounds.y + bounds.height < approachEnd, 'The route must end at Mission 1 after its final approach');
  }
}

function assertStoryTop(view) {
  assert.equal(view.scroll.offset, view.scroll.min);
  assert.ok(object(view, 'district:neon-strip').visible);
  assert.ok(view.scene.some(entry => entry.text === 'District locked · Unavailable' && entry.visible));
  assert.ok(control(view, mission('C1-21')).visible);
  assert.equal(control(view, mission('C1-01')).visible, false);
}

test('Story clamps real wheel, touch, and keyboard input at Mission 1 and reaches the upper district', { timeout: 38000 }, async () => {
  await inBrowser('story-endpoints', { width: 390, height: 600, mobile: true }, async page => {
    const startView = await snapshot(page);
    const { min, max } = startView.scroll;
    assertStoryBottom(startView);
    const missions = startView.controls.filter(item => item.action === 'open');
    assert.equal(missions.length, 21);
    assert.equal(new Set(missions.map(item => item.id)).size, 21);
    assert.equal(missions.filter(item => item.enabled).length, 1);
    assert.equal(object(startView, 'district:neon-strip').type, 'Container');
    assert.equal(startView.controls.some(item => item.id === 'district:neon-strip'), false);
    assert.equal((await fetch(origin + 'assets/ui/palmera-bay.jpg', { method: 'HEAD' })).headers.get('content-type'), 'image/jpeg');

    await shot(page, 'mobile-390-story-bottom');
    const initial = await page.pixels();
    for (const delta of [460, 9999, 9999]) {
      await wheel(page, delta);
      assertStoryBottom(await snapshot(page));
    }
    await wheel(page, -37);
    await atOffset(page, max - 37);
    await wheel(page, 9999);
    await atOffset(page, max);
    const endpointDiff = await pixelSamples(page, initial, {
      kind: 'shift', y: 0, height: startView.height, dy: 0, next: (await page.pixels()).toString('base64'),
    });
    assert.ok(endpointDiff.max <= 1 && endpointDiff.changed <= .0001, 'Returning to the bottom must restore its picture');
    await page.press('Tab');
    assert.equal((await snapshot(page)).focus, 'story-map');
    for (const code of ['PageDown', 'PageDown', 'End']) {
      await pressStoryKey(page, code);
      assertStoryBottom(await snapshot(page));
    }
    await page.press('ArrowDown');
    assertStoryBottom(await snapshot(page));
    await page.press('ArrowUp');
    await atOffset(page, max - 65);
    await page.press('ArrowDown');
    await atOffset(page, max);
    await pressStoryKey(page, 'PageUp');
    await atOffset(page, max - startView.height * .7);
    await pressStoryKey(page, 'PageDown');
    await atOffset(page, max);
    await pressStoryKey(page, 'Home');
    assertStoryTop(await snapshot(page));
    await shot(page, 'mobile-390-story-top');
    await wheel(page, -9999);
    assertStoryTop(await snapshot(page));
    await wheel(page, 36);
    await atOffset(page, min + 36);
    await pressStoryKey(page, 'End');
    await atOffset(page, max);

    const pointer = { ...await page.center(mission('C1-01')), id: 1 };
    await contact(page, 'touchStart', [pointer]);
    await contact(page, 'touchMove', [{ ...pointer, y: pointer.y - 15 }]);
    await contact(page, 'touchEnd');
    const clamped = await snapshot(page);
    assert.equal(clamped.phase, 'home', 'Swipe over Play must not launch the mission');
    assertStoryBottom(clamped);
    await contact(page, 'touchStart', [pointer]);
    for (const distance of [135, 270]) {
      await contact(page, 'touchMove', [{ ...pointer, y: pointer.y - distance }]);
      assertStoryBottom(await snapshot(page));
    }
    await contact(page, 'touchMove', [{ ...pointer, y: pointer.y - 233 }]);
    await atOffset(page, max - 37);
    await contact(page, 'touchEnd');
    await pressStoryKey(page, 'End');
    const tap = { ...await page.center(mission('C1-01')), id: 1 };
    await contact(page, 'touchStart', [tap]);
    await contact(page, 'touchEnd');
    await phase(page, 'briefing');
    await page.press('Escape');
    const returned = await phase(page, 'home');
    assert.equal(returned.focus, mission('C1-01'));
    assertStoryBottom(returned);
    await page.press('Enter');
    await phase(page, 'briefing');
    await start(page);
    await phase(page, 'success', straightDriveTimeout(chapter.missions[0]));
    const advanced = await bank(page);
    assert.equal(advanced.focus, mission('C1-02'));
    assert.ok(control(advanced, advanced.focus).interactive);
    const reloaded = await reload(page, 'home');
    assertNextMission(reloaded, mainPayout);
    assert.ok(control(reloaded, mission('C1-02')).interactive);
    await shot(page, 'story-390-after-clear-reload');

    await page.press('Tab');
    assert.equal((await snapshot(page)).focus, 'story-map');
    await page.press('Tab');
    const focused = await snapshot(page);
    assert.equal(focused.focus, mission('C1-01'));
    assert.match(control(focused, focused.focus).name, /Reach the Marker, Replay/);
    assert.ok(object(focused, 'keyboard-focus').bounds.width > 40);
    await shot(page, 'story-390-keyboard-replay');
    await page.press('Enter');
    await phase(page, 'briefing');
    await page.press('Escape');
    assert.equal((await phase(page, 'home')).focus, mission('C1-01'));

    for (const [slug, title, content] of [
      ['garage', 'Garage', /Starter Coupe/],
      ['shop', 'Shop', /unavailable/i],
      ['daily', 'Daily Missions', /unavailable/i],
    ]) {
      await page.click(`nav:${slug}`);
      const view = await phase(page, slug);
      assert.equal(object(view, 'menu-title').text, title);
      assert.match(object(view, slug === 'garage' ? 'owned-vehicle' : 'unavailable').text, content);
      assert.ok(control(view, `nav:${slug}`).selected && control(view, `nav:${slug}`).role === 'tab');
      await shot(page, `mobile-390-${slug}`);
    }
    await page.click('nav:home');
    assert.equal(object(await phase(page, 'home'), 'menu-title').text, 'PALMERA BAY');
  });
});

test('Widescreen Story keeps its backdrop stationary, art joins smooth, and finite endpoints through resize', { timeout: 36000 }, async () => {
  await inBrowser('widescreen-story', {}, async page => {
    const home = await snapshot(page);
    assert.deepEqual([home.width, home.height], [1200, 800]);
    assertStoryBottom(home);
    const { min, max } = home.scroll;
    const sourceAspect = await page.read(async () => {
      const response = await fetch('/assets/ui/palmera-bay.jpg');
      const bitmap = await createImageBitmap(await response.blob());
      const aspect = bitmap.width / bitmap.height;
      bitmap.close();
      return aspect;
    });
    const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < .01, `${message}: ${actual} ≈ ${expected}`);
    async function checkLayout(view) {
      const background = object(view, 'story-background');
      const mask = object(view, 'story-map-mask');
      const dragBounds = control(view, 'story-map').bounds;
      const left = dragBounds.x - 4;
      const mapWidth = dragBounds.width + 8;
      assert.equal(background.type, 'Sprite');
      assert.ok(background.visible);
      assert.equal(mask.type, 'Sprite');
      near(mask.position.x, left, 'Mask starts at the map edge');
      near(mask.position.x + mapWidth / 2, view.width / 2, 'Map mask stays centered');
      near(background.bounds.width / background.bounds.height, sourceAspect, 'Backdrop keeps the source aspect');
      assert.ok(background.bounds.x <= 0 && background.bounds.y <= 0);
      assert.ok(background.bounds.x + background.bounds.width >= view.width);
      assert.ok(background.bounds.y + background.bounds.height >= view.height);
      const tiles = view.scene.filter(node => node.label === 'map-tile');
      const band = tiles[1].position.y - tiles[0].position.y;
      for (const { type, bounds } of tiles.filter(node => node.visible)) {
        assert.equal(type, 'Sprite');
        near(bounds.width, (band + 112) * sourceAspect, 'Foreground art scales equally in both axes');
        near(bounds.x + bounds.width / 2, view.width / 2, 'Foreground art stays centered');
      }
      if (left >= 40) {
        const request = { kind: 'vertical-joins', columns: [left, left + mapWidth], y: 222, height: 455 };
        const pixels = await page.pixels();
        for (const sample of await pixelSamples(page, pixels, request)) {
          assert.ok(sample.joinChange < sample.nearbyMean * 1.5 + 2, `Hard desktop join: ${JSON.stringify(sample)}`);
        }
        const wings = [16, left + mapWidth + 16].map(x => ({ x, width: left - 32 }));
        for (const sample of await pixelSamples(page, pixels, { kind: 'backdrop-coverage', wings, y: 225, height: 385, middle: 400 })) {
          assert.ok(sample.range.every(range => range >= 8), `Missing backdrop art in a wing: ${JSON.stringify(sample)}`);
          assert.ok(sample.midline < 1, `Hard horizontal backdrop join: ${JSON.stringify(sample)}`);
        }
      }
      return { x: left, width: mapWidth };
    }
    async function resize(width, height) {
      await page.send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height,
      });
      await poll(async () => {
        const view = await snapshot(page);
        return view.width === width && view.height === height;
      }, `Story to resize to ${width} × ${height}`);
      await settle(page);
      return snapshot(page);
    }
    await settle(page);
    const mask = await checkLayout(home);
    const still = await page.pixels();
    await shot(page, 'desktop-1200-story-bottom');
    await wheel(page, 9999);
    assertStoryBottom(await snapshot(page));
    assert.ok(still.equals(await page.pixels()), 'A clamped desktop wheel keeps the bottom picture fixed');

    const [firstTile, secondTile] = home.scene.filter(node => node.label === 'map-tile');
    const band = secondTile.position.y - firstTile.position.y;
    const internalJoin = band - 360;
    await moveMap(page, internalJoin);
    const before = await page.pixels();
    for (const [x, width] of [[0, mask.x], [mask.x + mask.width, mask.x]]) {
      const wing = await pixelSamples(page, still, { kind: 'shift', x, width, y: 160, height: 480, dy: 0, next: before.toString('base64') });
      assert.equal(wing.mean, 0, 'Artwork outside the mask stays stationary while the map scrolls');
    }
    await wheel(page, 2);
    await atOffset(page, internalJoin + 2);
    const after = await page.pixels();
    const adjacent = await pixelSamples(page, before, {
      kind: 'shift', x: mask.x + 100, width: mask.width - 200, y: 295, height: 190, dy: 2, next: after.toString('base64'),
    });
    assert.ok(adjacent.mismatch < .009 && adjacent.mean < 1.05, `Visible reset at an internal art join: ${JSON.stringify(adjacent)}`);
    await shot(page, 'desktop-story-internal-join');

    await wheel(page, -9999);
    await atOffset(page, min);
    const district = await snapshot(page);
    assertStoryTop(district);
    assert.deepEqual(object(district, 'menu-header').position, object(home, 'menu-header').position);
    assert.deepEqual(control(district, 'nav:home').bounds, control(home, 'nav:home').bounds);
    await checkLayout(district);
    await shot(page, 'desktop-1200-story-top');

    for (const [width, height] of [[1920, 800], [720, 800], [721, 800], [320, 568], [390, 600]]) {
      const resized = await resize(width, height);
      assertStoryTop(resized);
      if (width === 1920 || width === 320) await shot(page, `${width}-story-top`);
    }

    await pressStoryKey(page, 'End');
    assertStoryBottom(await snapshot(page));
    for (const [width, height] of [[320, 568], [390, 600], [720, 800], [721, 800], [1920, 800], [1200, 800]]) {
      const resized = await resize(width, height);
      assertStoryBottom(resized);
      await shot(page, `${width}-story-bottom-after-resize`);
    }
    await atOffset(page, max);
    assert.ok(still.equals(await page.pixels()), 'Resizing through the breakpoint must restore the same desktop bottom picture');

    const wide = await resize(1920, 800);
    assert.deepEqual(wide.scroll, home.scroll);
    await checkLayout(wide);
    const wideMission = control(wide, mission('C1-01'));
    const homeMission = control(home, mission('C1-01'));
    assert.ok(wideMission.interactive);
    assert.deepEqual(wideMission.bounds, { ...homeMission.bounds, x: homeMission.bounds.x + 360 });
    const fullWidth = await resize(720, 800);
    assert.deepEqual(fullWidth.scroll, home.scroll);
    assert.equal(object(fullWidth, 'story-background'), undefined);
    const justWider = await resize(721, 800);
    assert.deepEqual(justWider.scroll, fullWidth.scroll);
    const fullWidthMission = control(fullWidth, mission('C1-01'));
    const justWiderMission = control(justWider, mission('C1-01'));
    assert.ok(justWiderMission.interactive);
    assert.deepEqual(justWiderMission.bounds, { ...fullWidthMission.bounds, x: fullWidthMission.bounds.x + .5 });
    await checkLayout(justWider);
    const marker = mission('C1-10');
    const pinY = control(justWider, marker).bounds.y + max;
    await moveMap(page, pinY - 360);
    assert.ok(control(await snapshot(page), marker).visible);
    const compact = await resize(390, 600);
    assert.ok(control(compact, marker).visible);
    assert.equal(object(compact, 'story-background'), undefined);
    assert.equal(object(compact, 'story-map-mask'), undefined);
    await resize(721, 800);
    await pressStoryKey(page, 'End');
    const pointer = await page.center(mission('C1-01'));
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...pointer, button: 'left', buttons: 1, clickCount: 1 });
    const end = { x: pointer.x, y: pointer.y - 29 };
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...end, buttons: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...end, button: 'left', clickCount: 1 });
    const clamped = await snapshot(page);
    assert.equal(clamped.phase, 'home', 'A drag over the mission must remain on Story');
    assertStoryBottom(clamped);
    await page.press('Tab');
    await page.press('Tab');
    assert.equal((await snapshot(page)).focus, mission('C1-01'));
    await pressStoryKey(page, 'Home');
    const focusedTop = await resize(320, 568);
    assert.equal(focusedTop.focus, mission('C1-01'));
    assertStoryTop(focusedTop);
    await pressStoryKey(page, 'End');
    await settle(page);
    assertStoryBottom(await snapshot(page));
    assert.equal((await openMission(page, 'C1-01')).run.missionId, 'C1-01');
  });
});

test('The engineering fixture uses its missions and never modifies the authored save', { timeout: 25000 }, async () => {
  await inBrowser('fixture', { width: 390, height: 600, mobile: true }, async page => {
    const home = await snapshot(page);
    assert.equal(object(home, 'menu-title').text, 'Canal Ward · Engineering Fixture');
    assert.equal(page.responses.has('/src/content/chapter1.json'), false);
    assert.equal(home.controls.filter(item => item.action === 'open').length, 3);
    assert.equal(object(home, 'district:neon-strip'), undefined);
    assert.equal(object(await openMission(page, 'straight-delivery'), 'card-title').text, 'A Short Drive');
    await page.press('Escape');
    assert.equal((await phase(page, 'home')).focus, mission('straight-delivery'));
    await openMission(page, 'straight-delivery');
    await start(page);
    await phase(page, 'success');
    await bank(page);
    assert.equal(await storage(page), null);
    assert.equal((await storage(page, SAVE_KEY + '-fixture')).bank, 100);
    await page.send('Page.navigate', { url: origin + '?observe=1' });
    const normal = await poll(async () => {
      const view = await snapshot(page);
      return object(view ?? { scene: [] }, 'menu-title')?.text === 'PALMERA BAY' && view;
    }, 'authored page to replace the fixture');
    assert.equal(normal.progress.bank, 0);
    assert.equal((await storage(page, SAVE_KEY + '-fixture')).bank, 100);
  }, 'fixture=1&observe=1');
});

test('Single canvas owns rendering and input, local Pixi is pinned, and the read bridge is opt-in', { timeout: 25000 }, async () => {
  await inBrowser('renderer-compliance', { width: 390, height: 600 }, async page => {
    const view = await snapshot(page);
    assert.equal(view.pixi, '8.23.0');
    assert.equal(view.renderer, 'webgl');
    assert.ok(view.activeHost);
    assert.equal(page.responses.get('/vendor/pixi.mjs'), 200);
    for (const requested of page.requests.values()) {
      const url = new URL(requested);
      assert.ok(['data:', 'blob:'].includes(url.protocol) || url.origin === new URL(origin).origin, requested);
    }
    assert.equal((await fetch(origin + 'node_modules/pixi.js/dist/pixi.min.mjs')).status, 404);
    assert.equal((await fetch(origin + 'vendor/pixi.mjs.map')).status, 404);
    const order = ['story-map', mission('C1-01'), 'nav:garage', 'nav:shop', 'nav:daily', 'nav:home'];
    for (const id of order) {
      await page.press('Tab');
      assert.equal((await snapshot(page)).focus, id);
    }
    await page.press('Tab');
    assert.equal((await snapshot(page)).focus, null, 'Forward Tab leaves the Pixi traversal at its end');
    assert.equal((await snapshot(page)).activeHost, false, 'Native Tab can leave the canvas');
    await page.press('Tab');
    assert.equal((await snapshot(page)).activeHost, true, 'Native keyboard Tab can enter the canvas again');
    await page.press('Tab');
    assert.equal((await snapshot(page)).focus, 'story-map');
    await page.press('Tab', 8);
    assert.equal((await snapshot(page)).focus, null, 'Reverse Tab leaves the Pixi traversal at its start');
    assert.equal((await snapshot(page)).activeHost, false);
    await page.press('Tab');
    for (const id of ['story-map', mission('C1-01')]) {
      await page.press('Tab');
      assert.equal((await snapshot(page)).focus, id);
    }
    await page.press('Enter');
    await phase(page, 'briefing');
    const documentState = await page.read(() => ({
      tags: [...document.body.children].map(node => node.tagName),
      name: document.querySelector('canvas').getAttribute('aria-label'),
      focus: document.activeElement?.tagName,
    }));
    assert.deepEqual(documentState.tags, ['CANVAS']);
    assert.match(documentState.name, /^Getaway Total Accident game\./);
    assert.equal(documentState.focus, 'CANVAS');
    const assets = ['first-job', 'canal-ward', 'success', 'bonus'];
    for (const id of assets) {
      assert.equal((await fetch(origin + `assets/ui/postcards/${id}.jpg`, { method: 'HEAD' })).status, 200);
    }
  });
  const clean = await openPage(browser.connection, origin);
  try {
    await poll(() => clean.read(() => document.activeElement?.tagName === 'CANVAS'), 'ordinary app to focus the canvas');
    assert.equal(await clean.read(() => Object.hasOwn(window, '__getawayScene')), false);
    assert.equal(clean.responses.has('/src/pixi/observe.mjs'), false);
    assert.deepEqual(clean.errors, []);
  } finally {
    await clean.close();
  }
});

test('Vehicle picker, viewport resize, and window focus release use real scene controls', { timeout: 32000 }, async () => {
  await inBrowser('scene-lifecycle', { width: 390, height: 600 }, async page => {
    await openMission(page, 'C1-01');
    await page.click('vehicle-picker');
    let view = await snapshot(page);
    assert.equal(control(view, 'vehicle-picker').expanded, true);
    assert.equal(view.focus, 'vehicle:starter-coupe');
    assert.equal(control(view, 'vehicle:starter-coupe').role, 'option');
    await page.press('Enter');
    assert.equal(control(await snapshot(page), 'vehicle-picker').expanded, false);
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 320, height: 568, deviceScaleFactor: 1, mobile: false, screenWidth: 320, screenHeight: 568,
    });
    const narrow = await poll(async () => {
      const scene = await snapshot(page);
      return scene.width === 320 && scene.height === 568 && scene;
    }, 'Pixi to resize');
    assert.equal(narrow.phase, 'briefing');
    assert.deepEqual(await page.read(() => {
      const canvas = document.querySelector('canvas');
      return [canvas.clientWidth, canvas.clientHeight, canvas.style.width, canvas.style.height];
    }), [320, 568, '', '']);
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 600, deviceScaleFactor: 1, mobile: false, screenWidth: 390, screenHeight: 600,
    });
    const wide = await poll(async () => {
      const scene = await snapshot(page);
      return scene.width === 390 && scene.height === 600 && scene;
    }, 'Pixi to resize a second time');
    assert.equal(wide.phase, 'briefing');
    assert.deepEqual(await page.read(() => {
      const canvas = document.querySelector('canvas');
      return [canvas.clientWidth, canvas.clientHeight, canvas.style.width, canvas.style.height];
    }), [390, 600, '', '']);
    const active = await start(page);
    verifyTouchControls(active);
    await page.key('ArrowDown', 'rawKeyDown');
    assert.equal((await snapshot(page)).input.brake, true);
    const foreground = await page.background();
    try {
      view = await phase(page, 'pause');
      assert.deepEqual(view.input, neutral);
      assert.equal(view.activeHost, true);
    } finally {
      await foreground();
    }
    await page.press('Escape');
    view = await phase(page, 'driving');
    assert.deepEqual(view.input, neutral);
    await phase(page, 'success', straightDriveTimeout(chapter.missions[0]));
  });
});

test('Authored loading errors stay in Pixi and the keyboard fixture action survives unrelated keys and resize', { timeout: 20000 }, async () => {
  const page = await openPage(browser.connection, 'about:blank', { width: 390, height: 600 });
  try {
    await page.send('Network.setBlockedURLs', { urls: [origin + 'src/content/chapter1.json'] });
    await page.send('Page.navigate', { url: origin + '?observe=1' });
    await poll(() => page.read(() => document.activeElement?.tagName === 'CANVAS'), 'the error scene to focus the host');
    assert.deepEqual(await page.read(() => [...document.body.children].map(node => node.tagName)), ['CANVAS']);
    assert.equal(await page.read(() => new URLSearchParams(location.search).has('fixture')), false);
    await shot(page, 'pixi-loading-error');
    await page.press('ArrowDown');
    await page.press('Tab');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 320, height: 568, deviceScaleFactor: 1, mobile: false, screenWidth: 320, screenHeight: 568,
    });
    await settle(page);
    await page.press('ArrowUp');
    await page.press('Enter');
    await poll(() => page.read(() => new URLSearchParams(location.search).get('fixture') === '1'), 'the real fixture URL');
    await poll(() => page.read(() => document.activeElement?.tagName === 'CANVAS'), 'the fixture to focus the host');
    assert.equal(await page.read(() => Object.hasOwn(window, '__getawayScene')), false);
  } finally {
    await page.close();
  }
});
