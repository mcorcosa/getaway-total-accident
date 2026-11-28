import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadContent } from '../src/content-loader.mjs';
import { createGame } from '../src/game-state.mjs';
import { driveFrame } from '../src/renderer.mjs';
import { newProgress, progressStore, SAVE_KEY } from '../src/save.mjs';
import { validateChapterOneProgression } from '../src/schema.mjs';
import { NEUTRAL_INPUT, STEP } from '../src/simulation.mjs';
import { vehicles } from '../src/vehicles.mjs';
import { distance, makeMap, roadLine } from '../src/world.mjs';

const hatchbackId = 'city-hatchback';
const hatchback = vehicles[hatchbackId];
const legacyCoupeId = 'starter-coupe';
const authoredContent = () => loadContent({
  fetcher: async url => new Response(await readFile(url)),
});

// These are the Level Design author's validated routes for the authored map.
const [northwest, northeast, southwest, southeast, junction] =
  [[128, 128], [448, 128], [128, 448], [448, 448], [288, 448]].map(([x, y]) => ({ x, y }));
const lowerWest = { x: 128, y: 1160 };
const lowerEast = { x: 448, y: 1160 };
const farWest = { x: 128, y: 1660 };
const farEast = { x: 448, y: 1660 };
const westBranch = [junction, southwest, northwest];
const eastBranch = [junction, southeast, northeast];
const mainTurns = new Map([
  [4, [northwest]], [5, [northeast]], [6, [northeast]], [7, westBranch],
  [9, [northwest]], [11, [northwest]], [12, [farEast, farWest]], [13, [farWest]],
  [14, [northeast]], [15, [northeast]], [16, westBranch], [18, [northwest]],
  [19, [farEast]], [20, [northeast, northwest]], [21, [northeast, northwest]],
]);
const bonusTurns = new Map([
  [9, [lowerWest]], [10, [lowerWest]], [11, [lowerWest]], [12, [lowerWest]], [13, [farWest]],
  [14, [northeast]], [16, [northwest]], [17, [northwest]], [18, [northwest]], [19, [lowerEast]],
]);

function guide(path) {
  const legs = [];
  let length = 0;
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1];
    const to = path[index];
    const span = distance(from, to);
    legs.push({ from, start: length, span, x: to.x - from.x, y: to.y - from.y });
    length += span;
  }
  const turns = legs.slice(1).map(leg => leg.start);
  const pointAlong = (leg, fraction) => ({ x: leg.from.x + fraction * leg.x, y: leg.from.y + fraction * leg.y });
  let covered = 0;
  return player => {
    let nearest = covered;
    let error = Infinity;
    for (const leg of legs) {
      const dot = (player.x - leg.from.x) * leg.x + (player.y - leg.from.y) * leg.y;
      const fraction = Math.max(0, Math.min(1, dot / leg.span ** 2));
      const offset = leg.start + fraction * leg.span;
      const gap = distance(player, pointAlong(leg, fraction));
      if (offset >= covered - 15 && gap < error) {
        nearest = offset;
        error = gap;
      }
    }
    covered = Math.max(covered, nearest);
    const lookAhead = Math.min(length, covered + 32);
    const leg = legs.find(leg => leg.start + leg.span >= lookAhead) ?? legs.at(-1);
    const target = pointAlong(leg, (lookAhead - leg.start) / leg.span);
    const angle = Math.atan2(target.y - player.y, target.x - player.x) - player.heading;
    const turn = Math.atan2(Math.sin(angle), Math.cos(angle));
    const nearBend = turns.some(offset => offset - covered < 63 && offset - covered > -18);
    return { left: turn < -.035, right: turn > .035, brake: nearBend && player.speed > 80 };
  };
}

function houseApproach({ spawn, objective: { destination } }) {
  return player => player.y <= destination.y + 87 && player.heading - spawn.heading < .20
    ? { ...NEUTRAL_INPUT, right: true }
    : NEUTRAL_INPUT;
}

function followRoute(game, turns, label, input) {
  const { drive } = game.state.run;
  const path = [drive.segment.spawn, ...turns, drive.segment.objective.destination];
  const nextInput = input ?? guide(path);
  let length = 0;
  for (let index = 1; index < path.length; index += 1) length += distance(path[index - 1], path[index]);
  const stepLimit = Math.ceil((length / drive.vehicle.speed + 2 + turns.length) / STEP);
  let steps = 0;
  while (steps < stepLimit && game.state.phase === 'driving') {
    game.tick(nextInput(drive.player));
    steps += 1;
  }
  const seconds = steps * STEP;
  assert.equal(drive.outcome?.kind, 'success', `${label} did not clear after ${seconds.toFixed(2)}s`);
  assert.equal(drive.pickedUp, Boolean(drive.segment.objective.pickup), `${label} pickup`);
  assert.equal(drive.damage, drive.vehicle.maxDamage, `${label} damage`);
  return seconds;
}

test('the first two authored jobs clear without steering or braking', async () => {
  const content = await authoredContent();
  const storage = { getItem: () => null, setItem: () => {} };
  const store = progressStore(content.chapter, { getStorage: () => storage });
  const game = createGame(content, store);
  const clearSteps = [];
  let bank = 0;
  for (const mission of content.chapter.missions.slice(0, 2)) {
    assert.equal(game.dispatch('open', mission.id), true);
    assert.equal(game.dispatch('start'), true, `${mission.id} does not have a usable starter car`);
    const target = mission.objective.destination;
    const { drive } = game.state.run;
    assert.ok(roadLine(drive.map, mission.spawn, target), `${mission.id} has a clear path toward the target`);
    const sizes = [[320, 568], [390, 600]];
    const reachedWorldMarker = new Set();
    const stepLimit = Math.ceil((distance(mission.spawn, target) / drive.vehicle.speed + 2) / STEP);
    let steps = 0;
    while (steps < stepLimit && game.state.phase === 'driving') {
      for (const [width, height] of sizes) {
        const { view, zoom, safe } = driveFrame(width, height, drive.player, target, { hudBottom: 100, footerTop: height - 60 });
        const x = (target.x - view.x) * zoom;
        const y = (target.y - view.y) * zoom;
        if (x >= safe.left - .01 && x <= safe.right + .01 && y >= safe.top - .01 && y <= safe.bottom + .01) {
          reachedWorldMarker.add(width);
        }
      }
      game.tick(NEUTRAL_INPUT);
      steps += 1;
    }
    assert.equal(reachedWorldMarker.size, sizes.length, `${mission.id} shows the on-road target before completion`);
    assert.equal(game.state.phase, 'success', `${mission.id} did not finish with neutral input`);
    assert.equal(game.state.run.damage, game.state.run.drive.vehicle.maxDamage);
    clearSteps.push(steps);
    game.dispatch('bank');
    bank += mission.payout;
    assert.equal(game.state.progress.bank, bank);
  }
  assert.deepEqual(clearSteps, [617, 674], 'The Hatchback clears the first two drives on their expected simulation steps');
});

test('Chapter 1 requires straight clears in missions 1–2 and a reachable off-center clear in mission 3', async () => {
  const { chapter, world } = await authoredContent();
  for (const index of [0, 1, 2]) {
    const altered = structuredClone(chapter);
    const { spawn, objective: { destination } } = altered.missions[index];
    destination.x = index < 2 ? spawn.x + destination.radius + 1 : spawn.x;
    assert.throws(() => validateChapterOneProgression(altered, world),
      index < 2 ? /missions 1–2 must be reachable by driving straight/ : /mission 3 must require steering/);
  }
  const altered = structuredClone(chapter);
  const third = altered.missions[2];
  third.objective.destination.y = third.spawn.y + 40;
  assert.throws(() => validateChapterOneProgression(altered, world), /put the target ahead/);
});

test('mission 3 passes the house marker at lane center with no input and clears after a late right correction', async () => {
  const content = await authoredContent();
  const [first, second, mission] = content.chapter.missions;
  const progress = { ...newProgress(hatchbackId), cleared: [first.id, second.id] };
  const game = createGame(content, { read: () => progress, write: value => value });
  const start = () => {
    assert.equal(game.dispatch('open', mission.id), true);
    assert.equal(game.dispatch('start'), true);
    return game.state.run.drive;
  };
  const { spawn, objective: { destination } } = mission;
  const neutralDrive = start();
  assert.equal(neutralDrive.vehicle, hatchback);
  const stepLimit = Math.ceil((distance(spawn, destination) / neutralDrive.vehicle.speed + 2) / STEP);
  for (let step = 0; step < stepLimit && game.state.phase === 'driving'; step += 1) {
    if (neutralDrive.player.y < destination.y - destination.radius - 5) break;
    game.tick(NEUTRAL_INPUT);
  }
  assert.equal(game.state.phase, 'driving');
  assert.ok(neutralDrive.player.y < destination.y - destination.radius - 5);
  assert.ok(Math.abs(neutralDrive.player.x - spawn.x) < .01);
  assert.equal(neutralDrive.damage, neutralDrive.vehicle.maxDamage);
  assert.deepEqual(game.state.progress.cleared, progress.cleared);

  assert.equal(game.dispatch('pause'), true);
  assert.equal(game.dispatch('home'), true);
  const drive = start();
  const steer = houseApproach(mission);
  const seconds = followRoute(game, [], 'C1-03 house marker', steer);
  assert.ok(seconds >= 12 && seconds < 14, `C1-03 should keep its long approach, took ${seconds.toFixed(2)}s`);
  assert.ok(drive.player.x > spawn.x + 8);
  assert.ok(drive.player.heading - spawn.heading >= .20 && drive.player.heading - spawn.heading < .30);
});

test('vehicle pace comes from the catalog in both the authored chapter and the fixture', async () => {
  const catalogPaces = [
    [legacyCoupeId, 120, 194],
    ['street-coupe', 136, 209],
    ['city-hatchback', 116, 213],
  ];
  for (const [vehicleId, speed, acceleration] of catalogPaces) {
    const vehicle = vehicles[vehicleId];
    assert.deepEqual([vehicle.speed, vehicle.acceleration], [speed, acceleration], vehicleId);
  }

  const storage = { getItem: () => null, setItem: () => {} };
  for (const fixture of [false, true]) {
    const content = fixture ? await loadContent({ fixture }) : await authoredContent();
    const { chapter } = content;
    const game = createGame(content, progressStore(chapter, { getStorage: () => storage, fixture }));
    assert.equal(game.dispatch('open', chapter.missions[0].id), true);
    assert.equal(game.dispatch('start'), true);
    assert.equal(game.state.run.drive.vehicle, fixture ? vehicles[legacyCoupeId] : hatchback);
  }
});

test('the authored patrol travels at its fixed speed, captures a stopped player and resets on replay', async () => {
  const content = await authoredContent();
  const { chapter } = content;
  const mission = chapter.missions[13];
  const cleared = chapter.missions.slice(0, 13).map(({ id }) => id);
  const storage = { getItem: () => JSON.stringify({ ...newProgress(hatchbackId), cleared }), setItem: () => {} };
  const game = createGame(content, progressStore(chapter, { getStorage: () => storage }));
  assert.equal(game.dispatch('open', mission.id), true);
  assert.equal(game.dispatch('start'), true);
  const { drive } = game.state.run;
  const patrol = { ...drive.patrol };
  const originalRule = { startGap: 84, speed: 54.4, captureRadius: 29, captureSeconds: 1.4 };
  assert.deepEqual(mission.patrol, originalRule);
  assert.equal(drive.segment, mission);
  assert.equal(distance(drive.player, patrol), mission.patrol.startGap);

  game.tick(NEUTRAL_INPUT);
  assert.equal(drive.player.speed, hatchback.acceleration * STEP);
  assert.ok(Math.abs(distance(patrol, drive.patrol) / STEP - originalRule.speed) < 1e-9);
  for (let step = 0; step < 40; step += 1) game.tick(NEUTRAL_INPUT);
  assert.equal(drive.player.speed, hatchback.speed);

  const brake = { ...NEUTRAL_INPUT, brake: true };
  game.tick(brake);
  assert.ok(drive.player.speed < hatchback.speed);
  for (let step = 0; step < 600 && game.state.phase === 'driving'; step += 1) game.tick(brake);
  assert.equal(game.state.phase, 'failure');
  assert.equal(drive.player.speed, 0);
  assert.deepEqual(drive.outcome, { kind: 'failure', reason: 'busted' });
  assert.ok(drive.capture >= originalRule.captureSeconds);
  assert.deepEqual(mission.patrol, originalRule);

  assert.equal(game.dispatch('replay'), true);
  assert.equal(game.dispatch('start'), true);
  assert.equal(game.state.run.drive.vehicle, hatchback);
  assert.equal(game.state.run.drive.segment, mission);
  assert.deepEqual(game.state.run.drive.patrol, patrol);
});

test('the authored Canal Ward shows closed cross streets without covering active pavement', async () => {
  const { chapter, world } = await authoredContent();
  for (const [index, mission] of chapter.missions.entries()) {
    const map = makeMap(world, mission.mapPieceIds);
    if (index < 4 || index === 7) {
      assert.ok(map.scenery.closures.some(closure => Math.abs(closure.y - mission.spawn.y) < 150), mission.id);
    }
    for (const { x, y, width, height } of map.scenery.closures) {
      assert.ok(map.roads.every(road => x >= road.x + road.width || x + width <= road.x ||
        y >= road.y + road.height || y + height <= road.y), `${mission.id} has a barricade on open pavement at ${x},${y}`);
    }
  }
});

test('the City Hatchback clears all 21 authored mains and bonuses from a fresh save', async t => {
  const content = await authoredContent();
  assert.deepEqual([...new Set(content.chapter.missions.map(mission => mission.defaultVehicleId))], [hatchbackId]);
  const records = new Map();
  const storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
  const getStorage = () => storage;
  const store = progressStore(content.chapter, { getStorage });
  const game = createGame(content, store);
  let bank = 0;
  const mainTimes = [];
  const bonusTimes = [];

  for (const [index, mission] of content.chapter.missions.entries()) {
    const order = index + 1;
    assert.equal(game.dispatch('open', mission.id), true, mission.id);
    assert.equal(game.dispatch('start'), true, mission.id);
    assert.equal(game.state.run.vehicleId, hatchbackId);
    assert.equal(game.state.run.drive.vehicle, hatchback);
    assert.equal(game.state.run.drive.segment, mission);
    const input = order < 3 ? () => NEUTRAL_INPUT : order === 3 ? houseApproach(mission) : undefined;
    mainTimes.push(followRoute(game, mainTurns.get(order) ?? [], `${mission.id} main`, input));
    assert.equal(game.state.phase, 'success');
    assert.equal(game.state.progress.cleared.at(-1), mission.id);
    assert.equal(game.state.progress.bank, bank);
    assert.equal(game.state.run.haul, mission.payout);

    assert.equal(game.dispatch('bonus'), true);
    assert.equal(game.dispatch('start'), true);
    assert.equal(game.state.run.drive.vehicle, hatchback);
    assert.equal(game.state.run.drive.segment, mission.bonus);
    bonusTimes.push(followRoute(game, bonusTurns.get(order) ?? [], `${mission.id} bonus`, order <= 8 ? () => NEUTRAL_INPUT : undefined));
    bank += mission.payout + mission.bonus.payout;
    assert.equal(game.state.phase, 'home');
    assert.equal(game.state.progress.bank, bank);
  }

  const reloaded = createGame(content, progressStore(content.chapter, { getStorage }));
  assert.equal(reloaded.state.phase, 'home');
  assert.equal(reloaded.state.progress.pending, null);
  assert.equal(reloaded.state.progress.bank, bank);
  assert.deepEqual(reloaded.state.progress.cleared, content.chapter.missions.map(mission => mission.id));
  t.diagnostic(`Main seconds in mission order: ${mainTimes.map(time => time.toFixed(3)).join(', ')}`);
  t.diagnostic(`Bonus seconds in mission order: ${bonusTimes.map(time => time.toFixed(3)).join(', ')}`);
});

test('the City Hatchback can also take the eastern branch on C1-07 and C1-16', async () => {
  const content = await authoredContent();
  for (const index of [6, 15]) {
    const mission = content.chapter.missions[index];
    const cleared = content.chapter.missions.slice(0, index).map(({ id }) => id);
    const game = createGame(content, {
      read: () => ({ ...newProgress(hatchbackId), cleared }),
      write: progress => progress,
    });
    assert.equal(game.dispatch('open', mission.id), true);
    assert.equal(game.dispatch('start'), true);
    assert.equal(game.state.run.drive.vehicle, hatchback);
    followRoute(game, eastBranch, `${mission.id} east branch`);
  }
});
