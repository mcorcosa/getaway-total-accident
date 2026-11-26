import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadContent } from '../src/content-loader.mjs';
import { createGame } from '../src/game-state.mjs';
import { driveFrame } from '../src/renderer.mjs';
import { newProgress, progressStore, SAVE_KEY } from '../src/save.mjs';
import { NEUTRAL_INPUT, STEP } from '../src/simulation.mjs';
import { STARTER_VEHICLE_ID, vehicles } from '../src/vehicles.mjs';
import { distance, makeMap, roadLine } from '../src/world.mjs';

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

function followRoute(game, turns, neutral, label) {
  const { drive } = game.state.run;
  const path = [drive.segment.spawn, ...turns, drive.segment.objective.destination];
  const nextInput = neutral ? () => NEUTRAL_INPUT : guide(path);
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

test('the authored chapter loads through the standard loader and all three opening jobs clear without steering or braking', async () => {
  const content = await authoredContent();
  const storage = { getItem: () => null, setItem: () => {} };
  const store = progressStore(content.chapter, { getStorage: () => storage });
  const game = createGame(content, store);
  const clearSteps = [];
  let bank = 0;
  for (const mission of content.chapter.missions.slice(0, 3)) {
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
  assert.deepEqual(clearSteps, [600, 655, 761], 'The longer opening drives clear on their expected simulation steps');
});

test('vehicle pace comes from the catalog in both the authored chapter and the fixture', async () => {
  const catalogPaces = [
    [STARTER_VEHICLE_ID, 120, 194],
    ['street-coupe', 136, 209],
    ['city-hatchback', 116, 213],
  ];
  for (const [vehicleId, speed, acceleration] of catalogPaces) {
    const vehicle = vehicles[vehicleId];
    assert.deepEqual([vehicle.speed, vehicle.acceleration], [speed, acceleration], vehicleId);
  }

  const storage = { getItem: () => null, setItem: () => {} };
  for (const content of [await authoredContent(), await loadContent({ fixture: true })]) {
    const { chapter } = content;
    const game = createGame(content, progressStore(chapter, { getStorage: () => storage }));
    assert.equal(game.dispatch('open', chapter.missions[0].id), true);
    assert.equal(game.dispatch('start'), true);
    assert.equal(game.state.run.drive.vehicle, vehicles[STARTER_VEHICLE_ID]);
  }
});

test('the authored patrol travels at its fixed speed, captures a reversing player and resets on replay', async () => {
  const content = await authoredContent();
  const { chapter } = content;
  const mission = chapter.missions[13];
  const starter = vehicles[STARTER_VEHICLE_ID];
  const cleared = chapter.missions.slice(0, 13).map(({ id }) => id);
  const storage = { getItem: () => JSON.stringify({ ...newProgress(), cleared }), setItem: () => {} };
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
  assert.equal(drive.player.speed, starter.acceleration * STEP);
  assert.ok(Math.abs(distance(patrol, drive.patrol) / STEP - originalRule.speed) < 1e-9);
  for (let step = 0; step < 40; step += 1) game.tick(NEUTRAL_INPUT);
  assert.equal(drive.player.speed, starter.speed);

  const brake = { ...NEUTRAL_INPUT, brake: true };
  game.tick(brake);
  assert.ok(drive.player.speed < starter.speed);
  for (let step = 0; step < 600 && game.state.phase === 'driving'; step += 1) game.tick(brake);
  assert.equal(game.state.phase, 'failure');
  assert.ok(drive.player.speed < 0);
  assert.deepEqual(drive.outcome, { kind: 'failure', reason: 'busted' });
  assert.ok(drive.capture >= originalRule.captureSeconds);
  assert.deepEqual(mission.patrol, originalRule);

  assert.equal(game.dispatch('replay'), true);
  assert.equal(game.dispatch('start'), true);
  assert.equal(game.state.run.drive.vehicle, starter);
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

for (const vehicleId of [STARTER_VEHICLE_ID, 'street-coupe']) {
  test(`all 21 authored mains and bonuses clear in the ${vehicles[vehicleId].name}`, async t => {
    const content = await authoredContent();
    const records = new Map();
    const storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
    const getStorage = () => storage;
    if (vehicleId !== STARTER_VEHICLE_ID) {
      storage.setItem(SAVE_KEY, JSON.stringify({ ...newProgress(), ownedVehicleIds: [STARTER_VEHICLE_ID, vehicleId] }));
    }
    const store = progressStore(content.chapter, { getStorage });
    const game = createGame(content, store);
    let bank = 0;
    const mainTimes = [];
    const bonusTimes = [];

    for (const [index, mission] of content.chapter.missions.entries()) {
      const order = index + 1;
      assert.equal(game.dispatch('open', mission.id), true, mission.id);
      if (vehicleId !== STARTER_VEHICLE_ID) assert.equal(game.dispatch('vehicle', vehicleId), true, mission.id);
      assert.equal(game.dispatch('start'), true, mission.id);
      assert.equal(game.state.run.drive.vehicle, vehicles[vehicleId]);
      assert.equal(game.state.run.drive.segment, mission);
      mainTimes.push(followRoute(game, mainTurns.get(order) ?? [], order <= 3, `${mission.id} main`));
      assert.equal(game.state.phase, 'success');
      assert.equal(game.state.progress.cleared.at(-1), mission.id);
      assert.equal(game.state.progress.bank, bank);
      assert.equal(game.state.run.haul, mission.payout);

      assert.equal(game.dispatch('bonus'), true);
      assert.equal(game.dispatch('start'), true);
      assert.equal(game.state.run.drive.vehicle, vehicles[vehicleId]);
      assert.equal(game.state.run.drive.segment, mission.bonus);
      bonusTimes.push(followRoute(game, bonusTurns.get(order) ?? [], order <= 8, `${mission.id} bonus`));
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
}

test('both coupes can also take the eastern branch on C1-07 and C1-16', async () => {
  const content = await authoredContent();
  for (const index of [6, 15]) {
    const mission = content.chapter.missions[index];
    const cleared = content.chapter.missions.slice(0, index).map(({ id }) => id);
    const ownedVehicleIds = [STARTER_VEHICLE_ID, 'street-coupe'];
    for (const vehicleId of ownedVehicleIds) {
      const game = createGame(content, {
        read: () => ({ ...newProgress(), cleared, ownedVehicleIds }),
        write: progress => progress,
      });
      assert.equal(game.dispatch('open', mission.id), true);
      assert.equal(game.dispatch('vehicle', vehicleId), true);
      assert.equal(game.dispatch('start'), true);
      followRoute(game, eastBranch, false, `${mission.id} east branch in the ${vehicles[vehicleId].name}`);
    }
  }
});
