import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { gameServer } from '../../scripts/serve.mjs';
import { SAVE_KEY } from '../../src/save.mjs';
import { launchBrowser, openPage, poll } from './cdp.mjs';

const mainPayout = 100;
const bonusPayout = 50;
const pendingMain = { missionId: 'C1-01', vehicleId: 'starter-coupe', haul: mainPayout, damage: 4 };
const neutral = { left: false, right: false, brake: false };
const mission = id => `mission:${id}`;
const action = id => `card:${id}`;
const money = value => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(value);

let browser;
let server;
let origin;
let evidence;

before(async () => {
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

async function phase(page, expected) {
  try {
    return await poll(async () => {
      const view = await snapshot(page);
      return view?.phase === expected && view;
    }, `phase ${expected}`);
  } catch (error) {
    const observed = await page.read(() => ({
      phase: window.__getawayScene?.()?.phase, title: document.title, canvas: document.querySelector('canvas')?.ariaLabel,
    }));
    throw new Error(`${error.message}; observed ${JSON.stringify(observed)}; browser errors ${JSON.stringify(page.errors)}`);
  }
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
    if (kind === 'shift') {
      const next = await decode(request.next);
      const width = samples.canvas.width;
      const first = samples.getImageData(0, y, width, request.height).data;
      const second = next.getImageData(0, y - request.dy, width, request.height).data;
      let different = 0;
      let channels = 0;
      let absolute = 0;
      for (let offset = 0; offset < first.length; offset += 4) {
        for (let component = 0; component < 3; component += 1) {
          const diff = Math.abs(first[offset + component] - second[offset + component]);
          if (diff > 4) different += 1;
          absolute += diff;
          channels += 1;
        }
      }
      return { mismatch: different / channels, mean: absolute / channels };
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

async function holdPoint(page, id, contactId) {
  return { ...await page.center(`drive:${id}`), id: contactId };
}

function angleDifference(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

test('Authored Home, briefing, paused driving, hands-off clear, bonus return and single bank', { timeout: 40000 }, async () => {
  await inBrowser('desktop', {}, async page => {
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
    assert.match(object(briefing, 'card-instruction').text, /accelerates on its own.*drive straight/i);
    assert.equal(object(briefing, 'postcard-art:first-job').type, 'Sprite');
    verifyOpeningArt(briefing);
    const inset = object(briefing, 'teaching-inset');
    assert.equal(inset.type, 'Container');
    assert.ok(inset.visible && inset.bounds.width >= 55 && Math.abs(inset.bounds.width - inset.bounds.height) < 1);
    assert.equal(object(briefing, 'lesson-goal').type, 'Container');
    assert.match(control(briefing, 'vehicle-picker').name, /Starter Coupe · Tier 1/);
    await shot(page, 'desktop-briefing');

    await start(page);
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
  });
});

test('Authored M1 bonus success carries condition and automatically banks both payouts', { timeout: 24000 }, async () => {
  await inBrowser('bonus-success', {}, async page => {
    await openMission(page, 'C1-01');
    await start(page);
    await phase(page, 'success');
    await assertClear(page, 0, pendingMain);
    await page.click(action('bonus'));
    await phase(page, 'bonus-briefing');
    const active = await start(page);
    assert.equal(active.drive.damage, 4);
    assert.equal(active.run.bonus, true);
    assert.equal(active.progress.pending, null);
    await phase(page, 'home');
    await assertClear(page, mainPayout + bonusPayout, null);
    assertNextMission(await snapshot(page), mainPayout + bonusPayout);
  });
});

test('390×600 touch can brake, steer simultaneously, cancel and coast without stuck input', { timeout: 26000 }, async () => {
  await inBrowser('mobile-controls', { width: 390, height: 600, mobile: true }, async page => {
    assert.equal(await page.read(() => navigator.maxTouchPoints), 2);
    await openMission(page, 'C1-01');
    await shot(page, 'mobile-390-briefing');
    await start(page);
    const brake = await holdPoint(page, 'brake', 1);
    const right = await holdPoint(page, 'right', 2);
    await contact(page, 'touchStart', [brake]);
    await poll(async () => (await snapshot(page)).input.brake, 'touch brake');
    await delay(250);
    const stopped = (await snapshot(page)).drive.player;
    await delay(250);
    assert.deepEqual((await snapshot(page)).drive.player, stopped);
    await contact(page, 'touchStart', [brake, right]);
    await poll(async () => {
      const view = await snapshot(page);
      return view.input.brake && view.input.right && angleDifference(view.drive.player.heading, stopped.heading) > .25;
    }, 'the braked vehicle to turn with a second held touch');
    await shot(page, 'mobile-390-touch-steer-brake');
    await contact(page, 'touchCancel');
    assert.deepEqual((await snapshot(page)).input, neutral);
    const released = (await snapshot(page)).drive.player;
    await poll(async () => {
      const player = (await snapshot(page)).drive?.player;
      return player && Math.hypot(player.x - released.x, player.y - released.y) > 4;
    }, 'vehicle to move again after cancellation');
  });
});

for (const [width, height] of [[390, 600], [320, 568]]) {
  test(`${width}×${height} renders unobstructed world markers for all three opening missions`, { timeout: 36000 }, async () => {
    await inBrowser(`mobile-markers-${width}`, { width, height, mobile: true }, async page => {
      await shot(page, `mobile-${width}-story`);
      const opening = [['C1-01', 126], ['C1-02', 118], ['C1-03', 168]];
      for (const [id, distance] of opening) {
        const preview = await openMission(page, id);
        assert.equal(Boolean(object(preview, 'teaching-inset')), id === 'C1-01');
        if (id === 'C1-01') {
          verifyOpeningArt(preview);
          await shot(page, `mobile-${width}-briefing`);
        }
        await start(page);
        const brake = await holdPoint(page, 'brake', 1);
        await contact(page, 'touchStart', [brake]);
        await poll(async () => (await snapshot(page)).input.brake, 'opening marker touch brake');
        await settle(page);
        const view = await snapshot(page);
        const hud = verifyHud(view);
        assert.deepEqual([view.width, view.height], [width, height]);
        assert.match(object(view, 'objective-text').text, /reach the marker/i);
        const mark = object(view, 'world-destination');
        const car = object(view, 'player-car');
        const zoom = mark.bounds.width / Math.max(view.drive.objective.destination.radius * 2 + 1.35, 46);
        assert.equal(mark.visible, true);
        assert.equal(object(view, 'edge-destination').visible, false);
        assert.ok(Math.abs(mark.position.x - car.position.x) < 4);
        assert.ok(Math.abs((car.position.y - mark.position.y) - distance * zoom) < 27);
        const hudBottom = Math.max(...hud.map(item => item.bounds.y + item.bounds.height));
        assert.ok(mark.bounds.y > hudBottom && mark.bounds.y + mark.bounds.height < brake.y - 24,
          `The world destination overlaps an overlay: ${JSON.stringify({ mark, hudBottom, brake })}`);
        const screen = await page.pixels();
        assert.ok(await pixelSamples(page, screen, { kind: 'aqua', ...mark.position }) > 70);
        assert.ok(await pixelSamples(page, screen, { kind: 'pink', ...car.position }) > 25);
        if (id !== 'C1-02') await shot(page, `mobile-${width}-${id.toLowerCase()}-drive`);
        if (id === 'C1-01' && width === 390) {
          await contact(page, 'touchEnd');
          await page.click('drive:pause');
          await phase(page, 'pause');
          await shot(page, 'mobile-390-pause');
          await page.click(action('resume'));
        } else {
          await contact(page, 'touchEnd');
        }
        await phase(page, 'success');
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
      assert.deepEqual((await storage(page)).cleared, opening.map(([id]) => id));
      const lesson = await openMission(page, 'C1-04');
      assert.ok(object(lesson, 'teaching-inset').visible);
    });
  });
}

async function turnAcrossStreet(page, target) {
  await page.key('ArrowDown', 'rawKeyDown');
  await delay(110);
  const initial = (await snapshot(page)).drive.player.heading;
  const turn = Math.atan2(Math.sin(target - initial), Math.cos(target - initial));
  const direction = turn < 0 ? 'ArrowLeft' : 'ArrowRight';
  await page.key(direction, 'rawKeyDown');
  try {
    await poll(async () => {
      const view = await snapshot(page);
      return view.phase === 'driving' && angleDifference(view.drive.player.heading, target) < .105;
    }, `keyboard steering to ${target.toFixed(2)} radians`, 4200);
  } finally {
    await page.key(direction, 'keyUp');
    await page.key('ArrowDown', 'keyUp');
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
    await page.key('ArrowDown', 'rawKeyDown');
    await delay(225);
    const { player, objective } = (await snapshot(page)).drive;
    await turnAcrossStreet(page, Math.atan2(objective.destination.y - player.y, objective.destination.x - player.x));
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

function angleOffset(value, period) {
  return ((value % period) + period) % period;
}

async function atOffset(page, goal) {
  await poll(async () => {
    const at = (await snapshot(page)).scroll;
    return Math.min(angleOffset(at.offset - goal, at.period), angleOffset(goal - at.offset, at.period)) < .1;
  }, `Story offset ${goal}`);
  await settle(page);
}

async function moveMap(page, goal) {
  const { offset } = (await snapshot(page)).scroll;
  await wheel(page, goal - offset);
  await atOffset(page, goal);
}

test('Story wraps both directions with continuous pixels, genuine swipe and tap, and live navigation', { timeout: 38000 }, async () => {
  await inBrowser('story-wrap', { width: 390, height: 600, mobile: true }, async page => {
    const startView = await snapshot(page);
    const { period } = startView.scroll;
    assert.ok(period > 700);
    const missions = startView.controls.filter(item => item.action === 'open');
    assert.equal(missions.length, 21);
    assert.equal(new Set(missions.map(item => item.id)).size, 21);
    assert.equal(missions.filter(item => item.enabled).length, 1);
    assert.equal(object(startView, 'district:neon-strip').type, 'Container');
    assert.equal(startView.controls.some(item => item.id === 'district:neon-strip'), false);
    assert.equal((await fetch(origin + 'assets/ui/palmera-bay.jpg', { method: 'HEAD' })).headers.get('content-type'), 'image/jpeg');

    await moveMap(page, period - 1);
    const before = await page.pixels();
    await shot(page, 'story-wrap-forward-before');
    await wheel(page, 2);
    await atOffset(page, 1);
    const after = await page.pixels();
    await shot(page, 'story-wrap-forward-after');
    const adjacent = await pixelSamples(page, before, { kind: 'shift', y: 226, height: 208, dy: 2, next: after.toString('base64') });
    assert.ok(adjacent.mismatch < .009 && adjacent.mean < 1.05, `Visible reset at seam: ${JSON.stringify(adjacent)}`);
    await wheel(page, -2);
    await atOffset(page, period - 1);
    assert.ok(before.equals(await page.pixels()), 'An equal reverse wheel must return to the identical view');
    await wheel(page, -period);
    await atOffset(page, period - 1);
    assert.ok(before.equals(await page.pixels()), 'A real wheel movement of one period must preserve pixels');

    await moveMap(page, 100);
    const initial = await page.pixels();
    await wheel(page, -420);
    await atOffset(page, period - 320);
    await shot(page, 'story-wrap-up-district');
    const screen = await snapshot(page);
    assert.ok(object(screen, 'district:neon-strip').visible);
    assert.ok(screen.scene.some(entry => entry.text === 'District locked · Unavailable' && entry.visible));
    assert.ok(control(screen, mission('C1-01')).interactive);
    await wheel(page, 420);
    await atOffset(page, 100);
    assert.ok(initial.equals(await page.pixels()));
    await wheel(page, -420);
    await atOffset(page, period - 320);

    const pointer = { ...await page.center(mission('C1-01')), id: 1 };
    await contact(page, 'touchStart', [pointer]);
    await contact(page, 'touchMove', [{ ...pointer, y: pointer.y - 29 }]);
    await contact(page, 'touchEnd');
    await atOffset(page, period - 291);
    assert.equal((await snapshot(page)).phase, 'home', 'Swipe over Play must not launch the mission');
    const tap = { ...await page.center(mission('C1-01')), id: 1 };
    await contact(page, 'touchStart', [tap]);
    await contact(page, 'touchEnd');
    await phase(page, 'briefing');
    await start(page);
    await phase(page, 'success');
    await bank(page);
    assertNextMission(await reload(page, 'home'), mainPayout);
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

test('Desktop Story blends both art joins while preserving the vertical wrap and district view', { timeout: 26000 }, async () => {
  await inBrowser('desktop-story-blend', {}, async page => {
    const home = await snapshot(page);
    assert.deepEqual([home.width, home.height], [1200, 800]);
    const { period } = home.scroll;
    const request = { kind: 'vertical-joins', columns: [240, 348, 852, 960], y: 222, height: 455 };
    async function checkBlend() {
      for (const sample of await pixelSamples(page, await page.pixels(), request)) {
        assert.ok(sample.joinChange < sample.nearbyMean * 1.5 + 2, `Hard desktop join: ${JSON.stringify(sample)}`);
      }
    }
    await settle(page);
    await checkBlend();
    await shot(page, 'desktop-story-blend-initial');

    await moveMap(page, period - 1);
    await shot(page, 'desktop-story-wrap-before');
    const before = await page.pixels();
    await wheel(page, 2);
    await atOffset(page, 1);
    const after = await page.pixels();
    await shot(page, 'desktop-story-wrap-after');
    const adjacent = await pixelSamples(page, before, { kind: 'shift', y: 230, height: 420, dy: 2, next: after.toString('base64') });
    assert.ok(adjacent.mismatch < .009 && adjacent.mean < 1.05, `Visible reset at the desktop seam: ${JSON.stringify(adjacent)}`);
    await wheel(page, -2);
    await atOffset(page, period - 1);
    assert.ok(before.equals(await page.pixels()), 'Reverse wheel must return to the identical desktop view');
    await wheel(page, period);
    await atOffset(page, period - 1);
    assert.ok(before.equals(await page.pixels()), 'A full period must preserve the desktop pixels');

    await wheel(page, -399);
    await atOffset(page, period - 400);
    const district = await snapshot(page);
    assert.ok(object(district, 'district-status').visible);
    assert.ok(control(district, mission('C1-01')).interactive);
    await checkBlend();
    await shot(page, 'desktop-story-neon-strip');
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
    await start(page);
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
    await phase(page, 'success');
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
