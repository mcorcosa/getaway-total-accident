import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { gameServer } from '../../scripts/serve.mjs';
import { SAVE_KEY } from '../../src/save.mjs';
import { launchBrowser, openPage, poll } from './cdp.mjs';

const postcard = '#postcard[open]';
const mission = id => `#mission-list [data-mission="${id}"]`;
const action = name => `${postcard} [data-action="${name}"]`;
const control = name => `[data-drive="${name}"]`;
const money = value => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(value);

let browser;
let server;
let origin;
let evidence;

before(async () => {
  evidence = await mkdtemp(join(await realpath(tmpdir()), 'gtc-chapter1-browser-evidence-'));
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

async function phase(page, expected) {
  try {
    await poll(() => page.read(expected => document.body.dataset.phase === expected, expected), `phase ${expected}`);
  } catch (error) {
    const state = await page.read(() => ({
      phase: document.body.dataset.phase,
      card: document.querySelector('#postcard[open] #card-title')?.textContent,
      loading: document.querySelector('#loading:not([hidden])')?.innerText,
    }));
    throw new Error(`${error.message}; observed ${JSON.stringify(state)}`);
  }
}

function shot(page, name) {
  return page.screenshot(join(evidence, `${name}.png`));
}

async function inBrowser(name, options, check) {
  const page = await openPage(browser.connection, origin, options);
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

function progress(page) {
  return page.read(key => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
}

function textAt(page, selector) {
  return page.read(selector => document.querySelector(selector)?.textContent.trim(), selector);
}

function cardActions(page) {
  return page.read(() => [...document.querySelectorAll('#postcard[open] #card-actions button')]
    .map(button => button.textContent.trim()));
}

function missionStatus(page, id) {
  return page.read(selector => {
    const node = document.querySelector(selector);
    return { status: node.dataset.status, disabled: node.disabled, active: node.getAttribute('aria-current') };
  }, mission(id));
}

async function openMission(page, id) {
  await page.click(mission(id));
  await phase(page, 'briefing');
}

async function start(page) {
  await page.click(action('start'));
  await phase(page, 'driving');
}

async function bank(page, count = 1) {
  await page.click(action('bank'), count);
  await phase(page, 'home');
}

async function assertClear(page, banked, pending) {
  const save = await progress(page);
  assert.equal(save.bank, banked);
  assert.deepEqual(save.cleared, ['C1-01']);
  if (pending) {
    for (const [key, value] of Object.entries(pending)) assert.equal(save.pending?.[key], value, `Pending haul ${key}`);
  } else {
    assert.equal(save.pending, null);
  }
}

async function assertNextMission(page, banked) {
  assert.equal(await textAt(page, '#menu-bank'), money(banked));
  assert.deepEqual(await missionStatus(page, 'C1-01'), { status: 'replay', disabled: false, active: null });
  assert.deepEqual(await missionStatus(page, 'C1-02'), { status: 'play', disabled: false, active: 'step' });
  assert.deepEqual(await missionStatus(page, 'C1-03'), { status: 'locked', disabled: true, active: null });
}

async function stageHash(page) {
  const png = await page.read(() => document.querySelector('#stage').toDataURL());
  return createHash('sha256').update(png).digest('hex');
}

async function reload(page, expected) {
  const priorDocument = await page.read(() => performance.timeOrigin);
  await page.send('Page.reload', { ignoreCache: true });
  await poll(async () => {
    try {
      return (await page.read(() => performance.timeOrigin)) > priorDocument;
    } catch (error) {
      if (/execution context|navigat/i.test(error.message)) return false;
      throw error;
    }
  }, 'a replacement document after reload');
  await phase(page, expected);
}

function driveLayout(page) {
  return page.read(() => {
    const stage = document.querySelector('#stage');
    const { left, top, width, height } = stage.getBoundingClientRect();
    const hud = document.querySelector('.hud');
    return {
      stage: { left, top, width, height },
      viewport: { width: innerWidth, height: innerHeight },
      indicators: [...hud.querySelectorAll(':scope > div')].map(row => ({
        label: row.querySelector('span').textContent.trim(), icon: row.querySelector('i').textContent.trim(),
      })),
      stars: document.querySelector('#hud-heat').textContent,
      hudBottom: hud.getBoundingClientRect().bottom,
      controlsTop: document.querySelector('.controls').getBoundingClientRect().top,
    };
  });
}

const mainPayout = 100;
const bonusPayout = 50;
const pendingMain = { missionId: 'C1-01', vehicleId: 'starter-coupe', haul: mainPayout, damage: 4 };

test('Authored Home, briefing, paused driving, hands-off clear, bonus return and single bank', { timeout: 30000 }, async () => {
  await inBrowser('desktop', {}, async page => {
    assert.equal(await textAt(page, '#menu-title'), 'Palmera Bay');
    assert.equal(await textAt(page, '#menu-bank'), money(0));
    assert.equal(page.responses.get('/src/content/world.json'), 200);
    assert.equal(page.responses.get('/src/content/chapter1.json'), 200);
    assert.equal(page.responses.has('/src/fixture.mjs'), false);
    const nodes = await page.read(() => [...document.querySelectorAll('#mission-list button')].map(node => ({
      id: node.dataset.mission, locked: node.disabled,
    })));
    assert.deepEqual(nodes, Array.from({ length: 21 }, (_, index) => ({
      id: `C1-${String(index + 1).padStart(2, '0')}`, locked: index > 0,
    })));
    await shot(page, '01-home');
    await page.click(mission('C1-02'));
    assert.equal(await page.read(() => document.body.dataset.phase), 'home', 'Locked job must stay closed');

    await openMission(page, 'C1-01');
    assert.equal(await textAt(page, `${postcard} #card-title`), 'Reach the Marker');
    assert.match(await textAt(page, `${postcard} #card-instruction:not([hidden])`), /accelerates on its own.*drive straight/i);
    const briefing = await page.read(() => {
      const inset = document.querySelector('#teaching-inset');
      const pixels = inset.getContext('2d').getImageData(0, 0, inset.width, inset.height).data;
      const alpha = pixels.some((channel, index) => index % 4 === 3 && channel !== 0);
      const select = document.querySelector('#vehicle-field:not([hidden]) select:not([hidden])');
      const { width, height } = inset.getBoundingClientRect();
      return { openDialogs: document.querySelectorAll('dialog[open]').length, inset: !inset.hidden && alpha,
        squareInset: width > 0 && Math.abs(width - height) <= 1,
        choice: select?.selectedOptions[0]?.text, value: select?.value };
    });
    assert.deepEqual(briefing, {
      openDialogs: 1, inset: true, squareInset: true, choice: 'Starter Coupe · Tier 1', value: 'starter-coupe',
    });
    await shot(page, '02-m1-briefing');
    await start(page);
    await page.press('Escape');
    await phase(page, 'pause');
    const stopped = await stageHash(page);
    const layout = await driveLayout(page);
    assert.deepEqual(layout.stage, { left: 0, top: 0, ...layout.viewport });
    assert.deepEqual(layout.indicators.map(row => row.label), ['Objective', 'Car damage', 'Heat']);
    assert.ok(layout.indicators.every(row => row.icon), 'Each HUD indicator must have an icon');
    assert.match(layout.stars, /^[☆★]{5}$/u);
    await shot(page, '04-paused');
    assert.equal(await page.read(() => document.activeElement.id), 'card-title');
    await page.press('Tab', 8);
    assert.equal(await page.read(() => document.activeElement.dataset.action), 'home');
    await page.press('Tab');
    assert.equal(await page.read(() => document.activeElement.dataset.action), 'resume');
    await page.press('Tab', 8);
    assert.equal(await page.read(() => document.activeElement.dataset.action), 'home');
    await delay(500);
    assert.equal(await stageHash(page), stopped, 'Pause must freeze the canvas pixels for multiple frames');

    await page.click(action('resume'));
    assert.equal(await page.read(() => document.activeElement.id), 'stage');
    await shot(page, '03-driving');
    await phase(page, 'success');
    assert.deepEqual(await cardActions(page), ['Continue to Story', 'Bonus']);
    const haul = await textAt(page, '#card-copy');
    assert.ok(haul.includes(money(mainPayout)), 'Results must show the unbanked haul');
    await assertClear(page, 0, pendingMain);
    await shot(page, '05-results');

    await page.click(action('bonus'));
    await phase(page, 'bonus-briefing');
    assert.deepEqual(await cardActions(page), ['Start Bonus', 'Back to Success']);
    await shot(page, '06-bonus-briefing');
    await page.click(action('cancel-bonus'));
    await phase(page, 'success');
    assert.equal(await textAt(page, '#card-copy'), haul);
    await assertClear(page, 0, pendingMain);

    await reload(page, 'success');
    await assertClear(page, 0, pendingMain);
    await bank(page, 2);
    await assertClear(page, mainPayout, null);
    await assertNextMission(page, mainPayout);
    await reload(page, 'home');
    await assertClear(page, mainPayout, null);
    await assertNextMission(page, mainPayout);
  });
});

test('Authored M1 bonus success automatically banks both payouts and returns Home', { timeout: 20000 }, async () => {
  await inBrowser('bonus-success', {}, async page => {
    await openMission(page, 'C1-01');
    await start(page);
    await phase(page, 'success');
    await assertClear(page, 0, pendingMain);
    await page.click(action('bonus'));
    await phase(page, 'bonus-briefing');
    await start(page);
    assert.match(await page.read(() => document.querySelector('#hud-damage').getAttribute('aria-label')), /4 of 4/);
    await assertClear(page, 0, null);
    await phase(page, 'home');
    await assertClear(page, mainPayout + bonusPayout, null);
    await assertNextMission(page, mainPayout + bonusPayout);
    await shot(page, '07-bonus-banked');
  });
});

// Read the rendered car and destination colors from the canvas. The lamp pair at the front
// identifies the car's heading even when the camera moves as it turns.
function drivePixels(page) {
  return page.read(() => {
    const canvas = document.querySelector('#stage');
    const { width, height } = canvas;
    const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    function bounds() {
      return { count: 0, left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity, xSum: 0, ySum: 0 };
    }
    function add(box, x, y) {
      box.count += 1;
      box.left = Math.min(box.left, x);
      box.right = Math.max(box.right, x);
      box.top = Math.min(box.top, y);
      box.bottom = Math.max(box.bottom, y);
      box.xSum += x;
      box.ySum += y;
    }
    function center(box) {
      return box.count ? { x: box.xSum / box.count, y: box.ySum / box.count } : null;
    }
    const body = bounds();
    const lamps = bounds();
    const core = bounds();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        if (red === 255 && green === 79 && blue === 167) add(body, x, y);
        if (red === 52 && green === 231 && blue === 225) add(core, x, y);
      }
    }
    if (!body.count) return null;
    for (let y = body.top; y <= body.bottom; y += 1) {
      for (let x = body.left; x <= body.right; x += 1) {
        const index = (y * width + x) * 4;
        if (pixels[index] === 255 && pixels[index + 1] >= 236 && pixels[index + 2] >= 172 && pixels[index + 2] <= 180) {
          add(lamps, x, y);
        }
      }
    }
    const car = center(body);
    const nose = center(lamps);
    const marker = center(core);
    function ringSide(direction) {
      if (!marker) return 0;
      for (let radius = 25; radius <= 47; radius += 1) {
        const x = Math.round(marker.x + radius * direction);
        if (x < 0 || x >= width) continue;
        const y = Math.round(marker.y);
        for (let offset = -3; offset <= 3; offset += 1) {
          if (y + offset < 0 || y + offset >= height) continue;
          const [red, green, blue] = pixels.subarray(((y + offset) * width + x) * 4, ((y + offset) * width + x) * 4 + 3);
          if (green > 115 && green - red > 55 && Math.abs(blue - green) < 24) return radius;
        }
      }
      return 0;
    }
    const leftRing = ringSide(-1);
    const rightRing = ringSide(1);
    return {
      car, marker,
      carHeight: body.bottom - body.top + 1,
      ringRadius: leftRing && rightRing ? Math.max(leftRing, rightRing) : 0,
      heading: nose ? Math.atan2(nose.y - car.y, nose.x - car.x) : null,
    };
  });
}

function touchPoint(page, name, id) {
  return page.center(control(name)).then(point => ({ ...point, id }));
}

function touch(page, type, touchPoints = []) {
  return page.send('Input.dispatchTouchEvent', { type, touchPoints });
}

function held(page, name) {
  return page.read(name => document.querySelector(`[data-drive="${name}"]`).dataset.held === 'true', name);
}

async function waitForCar(page) {
  return poll(async () => {
    const sample = await drivePixels(page);
    return sample?.heading !== null && sample;
  }, 'the rendered Starter Coupe and its headlights');
}

function angleDifference(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

test('390×600 touch brake freezes travel and simultaneous steering rotates the car', { timeout: 20000 }, async () => {
  await inBrowser('mobile-controls', { width: 390, height: 600, mobile: true }, async page => {
    assert.equal(await page.read(() => navigator.maxTouchPoints), 2);
    await openMission(page, 'C1-01');
    await shot(page, '08-mobile-briefing');
    await start(page);
    const brake = await touchPoint(page, 'brake', 1);
    const right = await touchPoint(page, 'right', 2);
    await touch(page, 'touchStart', [brake]);
    await poll(() => held(page, 'brake'), 'touch brake to be held');
    await delay(200);
    const braked = await stageHash(page);
    const straight = await waitForCar(page);
    await delay(250);
    assert.equal(await stageHash(page), braked, 'Touch brake should hold the car still');

    await touch(page, 'touchStart', [brake, right]);
    await poll(() => held(page, 'right'), 'touch steering to be held');
    assert.equal(await held(page, 'brake'), true, 'Both touch contacts should remain active');
    await poll(async () => {
      const turning = await drivePixels(page);
      return turning?.heading !== null && turning && angleDifference(turning.heading, straight.heading) > .30;
    }, 'the braked car to turn visibly on steering touch', 1500);
    await shot(page, '09-mobile-touch');
    await touch(page, 'touchEnd');
    assert.equal(await held(page, 'brake'), false);
    assert.equal(await held(page, 'right'), false);
    const released = await stageHash(page);
    await delay(180);
    assert.notEqual(await stageHash(page), released, 'Removing both contacts should return control to coasting');
  });
});

for (const [width, height] of [[390, 600], [320, 568]]) {
  test(`${width}×${height} shows the real M1–M3 opening destinations below the HUD`, { timeout: 25000 }, async () => {
    await inBrowser(`mobile-markers-${width}`, { width, height, mobile: true }, async page => {
      const opening = [['C1-01', 126], ['C1-02', 118], ['C1-03', 168]];
      for (const [id, distance] of opening) {
        await openMission(page, id);
        assert.equal(await page.read(() => document.querySelector('#teaching-inset').hidden), id !== 'C1-01',
          'The teaching inset should appear for the introduction, then stay hidden on same-rule practice jobs');
        await start(page);
        const brake = await touchPoint(page, 'brake', 1);
        await touch(page, 'touchStart', [brake]);
        await poll(() => held(page, 'brake'), 'touch brake to be held');
        const layout = await driveLayout(page);
        const sample = await waitForCar(page);
        assert.deepEqual(layout.stage, { left: 0, top: 0, width, height });
        assert.match(await textAt(page, '#objective'), /reach (the|a) (marker|garage)/i);
        assert.ok(sample.marker, `Missing aqua destination marker for ${id}`);
        // The upright 24-unit coupe loses about two edge pixels when sampling only solid pink.
        // Check the relative positions and the wide world ring to rule out the smaller screen arrow.
        const projectedDistance = distance * (sample.carHeight + 2) / 24;
        assert.ok(Math.abs(sample.marker.x - sample.car.x) < 6 &&
          Math.abs(sample.car.y - sample.marker.y - projectedDistance) < 13 && sample.ringRadius > 0,
        `${id} destination is not rendered at its world position: ${JSON.stringify(sample)}, expected separation ${projectedDistance}`);
        const ringTop = sample.marker.y - sample.ringRadius;
        const ringBottom = sample.marker.y + sample.ringRadius;
        assert.ok(ringTop > layout.hudBottom && ringBottom < layout.controlsTop,
          `${id} destination ring overlaps the controls or HUD: ${JSON.stringify({ sample, layout })}`);
        if (id !== 'C1-02') await shot(page, `mobile-${width}-${id.toLowerCase()}`);
        await touch(page, 'touchEnd');
        await phase(page, 'success');
        await bank(page);
      }
      assert.deepEqual((await progress(page)).cleared, opening.map(([id]) => id));
      assert.equal((await missionStatus(page, 'C1-04')).status, 'play');
    });
  });
}

async function turnAcrossStreet(page, target) {
  await page.key('ArrowDown', 'rawKeyDown');
  await delay(115);
  const startHeading = (await waitForCar(page)).heading;
  const turn = Math.atan2(Math.sin(target - startHeading), Math.cos(target - startHeading));
  const direction = turn < 0 ? 'ArrowLeft' : 'ArrowRight';
  await page.key(direction, 'rawKeyDown');
  try {
    await poll(async () => {
      const sample = await drivePixels(page);
      return sample && sample.heading !== null && angleDifference(sample.heading, target) < .10;
    }, `the rendered car to rotate to ${target.toFixed(2)} radians`, 4200);
  } finally {
    await page.key(direction, 'keyUp');
    await page.key('ArrowDown', 'keyUp');
  }
}

function waitForCondition(page, condition) {
  return poll(() => page.read(pips => document.querySelector('#hud-damage').getAttribute('aria-label') ===
    `${pips} of 4 condition pips`, condition), `the HUD to display ${condition} of 4 condition pips`, 2500);
}

test('An authored M1 bonus wreck loses the unbanked haul and keeps the main clear', { timeout: 35000 }, async () => {
  await inBrowser('bonus-wreck', { width: 720, height: 640 }, async page => {
    await openMission(page, 'C1-01');
    await start(page);
    await turnAcrossStreet(page, 0);
    await waitForCondition(page, 3);
    await turnAcrossStreet(page, Math.PI);
    await poll(async () => {
      const sample = await drivePixels(page);
      return sample?.marker && Math.abs(sample.car.x - sample.marker.x) < 24;
    }, 'the car to return near the center of the road', 1800);
    await page.key('ArrowDown', 'rawKeyDown');
    await delay(230);
    const linedUp = await waitForCar(page);
    await turnAcrossStreet(page, Math.atan2(linedUp.marker.y - linedUp.car.y, linedUp.marker.x - linedUp.car.x));
    await phase(page, 'success');
    await assertClear(page, 0, { ...pendingMain, damage: 3 });
    await page.click(action('bonus'));
    await phase(page, 'bonus-briefing');
    await start(page);
    await waitForCondition(page, 3);
    await assertClear(page, 0, null);
    // Brake to turn and then release to drive, repeating across the straight street.
    // Point slightly south on both crossings to stay away from the northbound bonus marker.
    for (const [heading, condition] of [[.14, 2], [Math.PI - .14, 1], [.14, 0]]) {
      await turnAcrossStreet(page, heading);
      await waitForCondition(page, condition);
    }
    await phase(page, 'failure');
    assert.deepEqual(await cardActions(page), ['Replay', 'Back to menu']);
    const result = await textAt(page, '#card-copy');
    assert.match(result, /wreck/i);
    assert.ok(result.includes(money(mainPayout)) && /main job.*complete/i.test(result), result);
    await shot(page, '10-bonus-wrecked');
    await page.click(action('home'));
    await phase(page, 'home');
    await assertNextMission(page, 0);
    await reload(page, 'home');
    await assertClear(page, 0, null);
    await assertNextMission(page, 0);
  });
});

test('Authored Story scroll wraps and menu destinations are reachable', { timeout: 20000 }, async () => {
  await inBrowser('menu', {}, async page => {
    const { line, position, height } = await page.read(() => ({
      line: document.querySelector('#route-scroll').getBoundingClientRect().toJSON(),
      position: document.querySelector('#route-scroll').scrollTop,
      height: document.querySelector('#route-map').offsetHeight,
    }));
    assert.ok(height > line.height && Math.abs(position - height) <= 1);
    const wheel = deltaY => page.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: line.left + line.width / 2, y: line.top + line.height / 2, deltaX: 0, deltaY,
    });
    await wheel(-140);
    await poll(() => page.read(height => document.querySelector('#route-scroll').scrollTop > height * 1.5, height),
      'a real upward scroll to wrap to the end of the authored map');
    await wheel(180);
    await poll(() => page.read(height => document.querySelector('#route-scroll').scrollTop < height + 160, height),
      'a real downward scroll to wrap back to the beginning');

    for (const [name, title, detail] of [
      ['garage', 'Garage', /Starter Coupe/],
      ['shop', 'Shop', /unavailable/i],
      ['daily', 'Daily Missions', /unavailable/i],
    ]) {
      await page.click(`.bottom-menu [data-action="${name}"]`);
      await phase(page, name);
      assert.equal(await textAt(page, '#menu-title'), title);
      assert.match(await textAt(page, '#menu-detail'), detail);
    }
    await page.click('.bottom-menu [data-action="home"]');
    await phase(page, 'home');
    assert.equal(await textAt(page, '#menu-title'), 'Palmera Bay');
  });
});
