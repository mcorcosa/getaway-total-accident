import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content-loader.mjs';
import { fixtureChapter, fixtureWorld } from '../src/fixture.mjs';
import { createGame } from '../src/game-state.mjs';
import { SAVE_KEY, newProgress, progressStore } from '../src/save.mjs';
import { validateChapter, validateChapterOneProgression, validateWorld } from '../src/schema.mjs';
import { NEUTRAL_INPUT, STEP, startDrive, stepDrive } from '../src/simulation.mjs';
import { chooseVehicle, eligibleVehicles, STARTER_VEHICLE_ID, vehicles } from '../src/vehicles.mjs';
import { inside, makeMap, onRoad, roadLine } from '../src/world.mjs';

const fixture = { chapter: fixtureChapter, world: fixtureWorld };
const [first, second, third] = fixtureChapter.missions;
const vehicle = vehicles[STARTER_VEHICLE_ID];
const map = makeMap(fixtureWorld, first.mapPieceIds);
const brake = { ...NEUTRAL_INPUT, brake: true };
const left = { ...NEUTRAL_INPUT, left: true };

test('neighboring pavement adds scenery and closure markings without adding a patrol or driving route', () => {
  const piece = (id, road, navNodes = [], navLinks = []) => ({ id, bounds: road, roads: [road], navNodes, navLinks });
  const approach = piece('approach', { x: 40, y: 0, width: 40, height: 102 }, [{ id: 'start', x: 60, y: 15 }]);
  const extension = piece('extension', { x: 40, y: 90, width: 40, height: 100 }, [{ id: 'finish', x: 60, y: 170 }],
    [['start', 'finish']]);
  const cross = piece('cross', { x: 0, y: 80, width: 160, height: 30 }, [{ id: 'side', x: 135, y: 95 }],
    [['start', 'side']]);
  const inactiveObstacles = [
    { x: 50, y: 102, width: 10, height: 7 },
    { x: 135, y: 102, width: 10, height: 7 },
  ];
  cross.obstacles = inactiveObstacles;
  const exit = piece('exit', { x: 65, y: 80, width: 95, height: 15 });
  const remote = piece('remote', { x: 0, y: 900, width: 160, height: 30 });
  const streetMap = { pieces: [approach, extension, cross, exit, remote] };
  const selected = makeMap(streetMap, ['approach', 'extension', 'exit']);
  assert.deepEqual(selected.pieces, [approach, extension, exit]);
  assert.deepEqual(selected.scenery.surroundings, cross.roads);
  assert.deepEqual(selected.scenery.roads, [...approach.roads, ...extension.roads, ...cross.roads, ...exit.roads]);
  assert.deepEqual(selected.scenery.obstacles, [inactiveObstacles[1]]);
  assert.deepEqual(selected.obstacles, []);
  assert.deepEqual(selected.nodes.map(node => node.id), ['start', 'finish']);
  assert.deepEqual([...selected.neighbors.get('start')], ['finish']);

  const intersection = { x: 60, y: 100 };
  const closed = { x: 135, y: 100 };
  assert.equal(roadLine(selected, approach.navNodes[0], extension.navNodes[0]), true);
  assert.equal(onRoad(selected, closed), false);
  assert.equal(roadLine(selected, intersection, closed), false);
  assert.equal(roadLine(selected, { x: 60, y: 88 }, { x: 135, y: 88 }), true);
  assert.deepEqual(selected.scenery.closures, [
    { x: 28, y: 80, width: 12, height: 30, axis: 'x' },
    { x: 80, y: 95, width: 12, height: 15, axis: 'x' },
  ]);
  for (const closure of selected.scenery.closures) {
    const center = { x: closure.x + closure.width / 2, y: closure.y + closure.height / 2 };
    assert.ok(inside(cross.roads[0], center));
    assert.equal(onRoad(selected, center), false);
  }
  const opened = makeMap(streetMap, ['approach', 'extension', 'cross', 'exit']);
  assert.equal(roadLine(opened, intersection, closed), true);
  assert.deepEqual(opened.scenery.closures, []);
  assert.ok(opened.neighbors.get('start').has('side'));
});

function memoryStorage() {
  const records = new Map();
  return {
    getItem: key => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
    records,
  };
}

function makeGame(storage = memoryStorage(), content = fixture, settings = {}) {
  const store = progressStore(content.chapter, {
    getStorage: () => storage,
    ...settings,
  });
  return createGame(content, store);
}

function driveUntilResult(game, input = NEUTRAL_INPUT) {
  for (let i = 0; i < 900 && game.state.phase === 'driving'; i += 1) game.tick(input);
}

function startMission(game, id = first.id) {
  assert.equal(game.dispatch('open', id), true);
  assert.equal(game.state.phase, 'briefing');
  assert.equal(game.dispatch('start'), true);
}

test('normal mode requires authored JSON and fixture mode is explicit', async () => {
  const loaded = await loadContent({ fixture: true, fetcher: () => assert.fail('fixture requested authored files') });
  assert.deepEqual(loaded.chapter, fixtureChapter);
  assert.equal(loaded.fixture, true);
  await assert.rejects(loadContent({ fetcher: () => new Response(null, { status: 404 }) }),
    /src\/content\/world\.json.*404/);
  await assert.rejects(loadContent({ fetcher: () => new Response('{ invalid') }),
    /src\/content\/world\.json contains invalid JSON/);
  await assert.rejects(loadContent({
    fetcher: url => Response.json(url.pathname.endsWith('world.json') ? fixtureWorld : fixtureChapter),
  }), /requires exactly 21 missions/);
});

test('schema validates IDs, selected road pieces, targets, payouts, and patrol spawn gaps', () => {
  assert.equal(validateWorld(fixtureWorld), fixtureWorld);
  assert.equal(validateChapter(fixtureChapter, fixtureWorld), fixtureChapter);
  assert.throws(() => validateChapterOneProgression(fixtureChapter, fixtureWorld), /21 missions/);
  const cases = [
    [chapter => { chapter.missions[1].id = first.id; }, /duplicate ID/],
    [chapter => { chapter.missions[0].mapPieceIds = ['missing']; }, /unknown piece/],
    [chapter => { chapter.missions[0].defaultVehicleId = 'missing'; }, /unknown vehicle/],
    [chapter => { chapter.missions[0].objective.destination.y = 210; }, /target center on drivable road/],
    [chapter => { chapter.missions[0].bonus.payout = 0; }, /whole number of at least 1/],
    [chapter => { chapter.missions[2].patrol.startGap = 300; }, /continuous drivable road behind/],
    [chapter => { chapter.missions[0].bonus.spawn.x = -100; }, /spawn on drivable road/],
  ];
  for (const [change, error] of cases) {
    const chapter = structuredClone(fixtureChapter);
    change(chapter);
    assert.throws(() => validateChapter(chapter, fixtureWorld), error);
  }
});

test('road union admits cross-piece navigation links and obstacles subtract exact drivable area', () => {
  const world = {
    version: 1,
    pieces: [
      {
        id: 'a', bounds: { x: -10, y: -10, width: 50, height: 40 },
        roads: [{ x: 0, y: 0, width: 50, height: 20 }],
        navNodes: [{ id: 'a-end', x: 15, y: 10 }],
        navLinks: [['a-end', 'b-start']],
      },
      {
        id: 'b', bounds: { x: 40, y: -10, width: 60, height: 40 },
        roads: [{ x: 50, y: 0, width: 50, height: 20 }],
        navNodes: [{ id: 'b-start', x: 80, y: 10 }],
      },
    ],
  };
  assert.equal(validateWorld(world), world);
  let shared = makeMap(world, ['a', 'b']);
  assert.equal(roadLine(shared, shared.nodes[0], shared.nodes[1]), true);
  assert.deepEqual([...shared.neighbors.get('b-start')], ['a-end']);
  world.pieces[1].obstacles = [{ x: 59.99, y: 8, width: .02, height: 4 }];
  shared = makeMap(world, ['a', 'b']);
  assert.equal(onRoad(shared, { x: 60, y: 10 }), false);
  assert.equal(roadLine(shared, shared.nodes[0], shared.nodes[1]), false);
  assert.throws(() => validateWorld(world), /leaves drivable road/);
});

test('a segment can only finish after the package, even when a marker is narrower than one step', () => {
  const segment = structuredClone(first);
  segment.objective = {
    kind: 'pickup-delivery',
    pickup: { x: 190.23, y: 82, radius: .03 },
    destination: { x: 150, y: 82, radius: 5 },
  };
  const drive = startDrive(segment, map, vehicle);
  while (drive.player.x < 170) stepDrive(drive);
  assert.equal(drive.outcome, null);
  assert.equal(drive.pickedUp, false);
  while (drive.player.x < 210) stepDrive(drive);
  assert.equal(drive.pickedUp, true);
  assert.equal(drive.outcome, null);
  const ordered = startDrive({
    ...segment,
    objective: { ...segment.objective, destination: { x: 210, y: 82, radius: 5 } },
  }, map, vehicle);
  for (let i = 0; i < 180 && !ordered.outcome; i += 1) stepDrive(ordered);
  assert.equal(ordered.outcome?.kind, 'success');
});

test('steering, grip and braking affect motion, while one continuous wall contact costs one pip', () => {
  const drive = startDrive(second, map, vehicle);
  for (let i = 0; i < 32; i += 1) stepDrive(drive);
  const speed = drive.player.speed;
  for (let i = 0; i < 13; i += 1) stepDrive(drive, left);
  assert.ok(drive.player.heading < 0);
  assert.ok(drive.player.travelHeading > drive.player.heading);
  assert.ok(drive.skidMarks.length > 0);
  for (let i = 0; i < 18; i += 1) stepDrive(drive, brake);
  assert.ok(drive.player.speed < speed);

  const wallRun = startDrive({ ...first, spawn: { x: 700, y: 82, heading: 0 } }, map, vehicle);
  for (let i = 0; i < 180; i += 1) stepDrive(wallRun);
  assert.equal(wallRun.damage, vehicle.maxDamage - 1);
  assert.equal(wallRun.outcome, null);
  assert.ok(onRoad(map, wallRun.player));
  const fragile = startDrive(wallRun.segment, map, vehicle, 1);
  for (let i = 0; i < 180 && !fragile.outcome; i += 1) stepDrive(fragile);
  assert.deepEqual(fragile.outcome, { kind: 'failure', reason: 'wrecked' });
});

test('a brief brake tap feathers speed while a held brake keeps the car stopped', () => {
  function atCruisingSpeed() {
    const drive = startDrive(first, map, vehicle);
    drive.player.speed = 120;
    return drive;
  }

  const tap = atCruisingSpeed();
  for (let step = 0; step < 6; step += 1) stepDrive(tap, brake, STEP);
  assert.ok(Math.abs(tap.player.speed - 98) < 1e-9);
  stepDrive(tap, NEUTRAL_INPUT, STEP);
  assert.ok(Math.abs(tap.player.speed - (98 + vehicle.acceleration * STEP)) < 1e-9);

  const hold = atCruisingSpeed();
  for (let step = 0; step < 32; step += 1) stepDrive(hold, brake, STEP);
  assert.ok(Math.abs(hold.player.speed - 8 / 3) < 1e-9);
  stepDrive(hold, brake, STEP);
  assert.equal(hold.player.speed, 0);
  assert.ok(Math.abs(hold.player.x - first.spawn.x - 31.733333333) < 1e-9);
  const stopped = { ...hold.player };
  for (let frame = 0; frame < 180; frame += 1) stepDrive(hold, brake, STEP);
  assert.deepEqual(hold.player, stopped, 'holding the brake after stopping keeps the car stationary');
  stepDrive(hold, NEUTRAL_INPUT, STEP);
  assert.equal(hold.player.speed, vehicle.acceleration * STEP);
  assert.ok(hold.player.x > stopped.x);
});

test('holding the brake from rest permits steering at a fixed position until release', () => {
  const drive = startDrive(first, map, vehicle);
  const parked = { ...drive.player };
  for (let frame = 0; frame < 180; frame += 1) stepDrive(drive, brake, STEP);
  assert.deepEqual(drive.player, parked);
  const input = { ...brake, steering: .5, touchSteering: true };
  for (let frame = 0; frame < 10; frame += 1) stepDrive(drive, input, STEP);
  assert.ok(drive.player.heading > parked.heading);
  assert.deepEqual([drive.player.x, drive.player.y, drive.player.speed], [parked.x, parked.y, 0]);
  stepDrive(drive, NEUTRAL_INPUT, STEP);
  assert.equal(drive.player.speed, vehicle.acceleration * STEP);
  assert.ok(drive.player.x > parked.x);
});

test('partial steering produces a proportional turn and a gentler speed cap', () => {
  const halfSteerSpeed = vehicle.speed * .835;
  function advance(input) {
    const drive = startDrive(first, map, vehicle);
    drive.player.speed = halfSteerSpeed;
    stepDrive(drive, { ...NEUTRAL_INPUT, ...input }, STEP);
    return { turn: drive.player.heading - first.spawn.heading, speed: drive.player.speed };
  }

  const full = advance({ right: true });
  const light = advance({ right: true, steering: .08 });
  const half = advance({ right: true, steering: .5 });
  const halfLeft = advance({ left: true, steering: -.5 });
  assert.ok(full.turn > 0);
  assert.ok(Math.abs(light.turn / full.turn - .08) < 1e-9);
  assert.ok(Math.abs(half.turn / full.turn - .5) < 1e-9);
  assert.ok(Math.abs(halfLeft.turn + half.turn) < 1e-9);
  assert.ok(full.speed < half.speed && half.speed < light.speed);
  assert.ok(Math.abs(half.speed - halfSteerSpeed) < 1e-9);
  assert.equal(halfLeft.speed, half.speed);

  const straight = advance({});
  assert.deepEqual(advance({ left: true, right: true }), straight);
  assert.deepEqual(advance({ right: true, steering: 0 }), straight);
  assert.deepEqual(advance({ steering: 1 }), full);
  assert.deepEqual(advance({ steering: 4 }), full);
  assert.deepEqual(advance({ steering: -4 }), advance({ left: true }));
  for (const invalid of [NaN, Infinity, -Infinity, '0.5', null]) {
    assert.deepEqual(advance({ steering: invalid }), straight);
    assert.deepEqual(advance({ steering: invalid, right: true }), full);
  }
});

test('touch steering keeps full turning authority at low speed and eases yaw at cruise', () => {
  function turnFrom(speed, input) {
    const drive = startDrive(first, map, vehicle);
    drive.player.speed = speed;
    stepDrive(drive, { ...NEUTRAL_INPUT, ...input }, STEP);
    return drive.player;
  }

  const full = { steering: 1 };
  const touch = { ...full, touchSteering: true };
  const cruiseDigital = turnFrom(vehicle.speed, { right: true });
  assert.deepEqual(turnFrom(vehicle.speed, full), cruiseDigital);
  const cruiseTouch = turnFrom(vehicle.speed, touch);
  const neutralHeading = first.spawn.heading;
  assert.ok(Math.abs((cruiseTouch.heading - neutralHeading) / (cruiseDigital.heading - neutralHeading) - .8) < 1e-9);
  assert.equal(cruiseTouch.speed, cruiseDigital.speed);
  for (const speed of [0, vehicle.speed * .30]) {
    assert.deepEqual(turnFrom(speed, touch), turnFrom(speed, full));
  }
  const mid = vehicle.speed * .675;
  const middleTouch = turnFrom(mid, touch);
  const middleDigital = turnFrom(mid, full);
  assert.ok(Math.abs((middleTouch.heading - neutralHeading) / (middleDigital.heading - neutralHeading) - .90) < 1e-9);
});

test('patrol starts behind the car, follows drivable corners, and needs sustained proximity to capture', () => {
  const drive = startDrive({
    ...third, spawn: { x: 444, y: 310, heading: -Math.PI / 2 },
    patrol: { ...third.patrol, startGap: 60 },
  }, map, vehicle);
  assert.ok(Math.abs(drive.patrol.x - 444) < .0001);
  assert.equal(drive.patrol.y, 370);
  drive.patrol.x = 180;
  drive.patrol.y = 82;
  assert.equal(roadLine(map, drive.patrol, drive.player), false);
  let rounded = false;
  for (let i = 0; i < 600 && !drive.outcome; i += 1) {
    stepDrive(drive, brake);
    assert.ok(onRoad(map, drive.patrol));
    if (drive.patrol.y > 140) rounded = true;
  }
  assert.equal(rounded, true);
  assert.deepEqual(drive.outcome, { kind: 'failure', reason: 'busted' });
  assert.ok(drive.capture >= third.patrol.captureSeconds);
});

test('tier and category filter owned alternatives while a theft locks its authored car', () => {
  const owned = [STARTER_VEHICLE_ID, 'street-coupe', 'city-hatchback'];
  assert.deepEqual(eligibleVehicles(first, owned), [STARTER_VEHICLE_ID, 'street-coupe']);
  assert.deepEqual(eligibleVehicles({ ...first, minTier: 2 }, owned), ['street-coupe']);
  assert.equal(chooseVehicle({ ...first, defaultVehicleId: 'street-coupe' }, owned), 'street-coupe');
  assert.equal(chooseVehicle({ ...first, allowVehicleSelection: false }, ['city-hatchback']), null);
  assert.deepEqual(eligibleVehicles({ ...first, stolenVehicleId: 'city-hatchback' }, [STARTER_VEHICLE_ID]), ['city-hatchback']);
});

test('main clear and pending haul persist before banking, bank once after a reload, and replays pay', () => {
  const storage = memoryStorage();
  let game = makeGame(storage);
  assert.equal(game.dispatch('open', second.id), false);
  startMission(game);
  driveUntilResult(game);
  assert.equal(game.state.phase, 'success');
  assert.deepEqual(game.state.progress.cleared, [first.id]);
  assert.equal(game.state.progress.bank, 0);
  assert.equal(game.state.progress.pending.haul, 100);
  game = makeGame(storage);
  assert.equal(game.state.phase, 'success');
  assert.equal(game.state.run.haul, 100);
  assert.equal(game.state.run.firstClear, true);
  assert.equal(game.dispatch('bank'), true);
  assert.equal(game.dispatch('bank'), false);
  assert.equal(game.state.progress.bank, 100);
  assert.equal(game.state.progress.pending, null);
  game = makeGame(storage);
  assert.equal(game.state.phase, 'home');
  assert.equal(game.state.progress.bank, 100);
  startMission(game);
  driveUntilResult(game);
  assert.equal(makeGame(storage).state.run.firstClear, false);
  game.dispatch('bank');
  assert.equal(makeGame(storage).state.progress.bank, 200);
  assert.deepEqual(game.state.progress.cleared, [first.id]);
  assert.equal(game.dispatch('open', second.id), true);
});

test('bonus briefing cancellation preserves the reward and bonus auto-banks once with carryover', () => {
  const storage = memoryStorage();
  const game = makeGame(storage);
  startMission(game);
  game.state.run.drive.damage = 2;
  driveUntilResult(game);
  const main = game.state.run;
  assert.equal(game.dispatch('bonus'), true);
  assert.equal(game.state.phase, 'bonus-briefing');
  assert.equal(game.dispatch('cancel-bonus'), true);
  assert.equal(game.state.phase, 'success');
  assert.equal(game.state.run, main);
  assert.equal(game.state.run.haul, first.payout);
  assert.equal(game.state.run.damage, 2);
  assert.equal(makeGame(storage).state.phase, 'success');
  game.dispatch('bonus');
  game.dispatch('start');
  assert.equal(game.state.run.vehicleId, STARTER_VEHICLE_ID);
  assert.equal(game.state.run.drive.damage, 2);
  assert.equal(game.state.run.haul, 100);
  assert.equal(makeGame(storage).state.phase, 'home');
  driveUntilResult(game);
  assert.equal(game.state.phase, 'home');
  assert.equal(game.state.progress.bank, 175);
  assert.equal(makeGame(storage).state.progress.bank, 175);
  assert.equal(game.dispatch('bonus'), false);
});

test('failed bonus loses only its stake and replay starts the main with full condition', () => {
  const content = structuredClone(fixture);
  const mission = content.chapter.missions[0];
  mission.bonus.spawn = { x: 700, y: 82, heading: 0 };
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({ ...newProgress(), bank: 50 }));
  const game = makeGame(storage, content);
  startMission(game);
  game.state.run.drive.damage = 1;
  driveUntilResult(game);
  game.dispatch('bonus');
  game.dispatch('start');
  driveUntilResult(game);
  assert.equal(game.state.phase, 'failure');
  assert.deepEqual(game.state.failure, { reason: 'wrecked', lost: 100, bonus: true });
  assert.equal(game.state.run.haul, 0);
  assert.equal(makeGame(storage, content).state.progress.bank, 50);
  assert.deepEqual(makeGame(storage, content).state.progress.cleared, [mission.id]);
  assert.equal(game.dispatch('replay'), true);
  assert.equal(game.state.phase, 'briefing');
  assert.equal(game.dispatch('start'), true);
  assert.equal(game.state.run.drive.damage, 4);
  assert.equal(game.state.run.bonus, false);
});

test('pause leaves all simulation state frozen and resumes the same attempt', () => {
  const game = makeGame();
  startMission(game);
  for (let i = 0; i < 30; i += 1) game.tick(NEUTRAL_INPUT);
  assert.equal(game.dispatch('pause'), true);
  const snapshot = structuredClone(game.state.run.drive);
  for (let i = 0; i < 180; i += 1) assert.equal(game.tick(left), false);
  assert.deepEqual(game.state.run.drive, snapshot);
  assert.equal(game.dispatch('resume'), true);
  game.tick(NEUTRAL_INPUT);
  assert.ok(game.state.run.drive.player.x > snapshot.player.x);
  assert.equal(game.state.run.drive.player.heading, snapshot.player.heading);
});

test('malformed progress and fixture saves leave legacy storage alone', () => {
  const storage = memoryStorage();
  const legacyKey = 'getaway-totally-accidental-prototype-v1';
  storage.setItem(legacyKey, 'legacy data');
  storage.setItem(SAVE_KEY, '{bad');
  const notices = [];
  const game = makeGame(storage, fixture, { onNotice: message => notices.push(message) });
  assert.deepEqual(game.state.progress, newProgress());
  assert.match(notices[0], /could not be read/);
  assert.equal(storage.getItem(SAVE_KEY), '{bad');
  const fixtureGame = makeGame(storage, fixture, { fixture: true });
  startMission(fixtureGame);
  driveUntilResult(fixtureGame);
  fixtureGame.dispatch('bank');
  assert.equal(storage.getItem(SAVE_KEY), '{bad');
  assert.equal(storage.getItem(legacyKey), 'legacy data');
  assert.equal(JSON.parse(storage.getItem(`${SAVE_KEY}-fixture`)).bank, 100);
});

test('storage write errors preserve one in-memory bank and allow a durable retry after reload', () => {
  const storage = memoryStorage();
  const notices = [];
  const game = makeGame(storage, fixture, { onNotice: message => notices.push(message) });
  startMission(game);
  driveUntilResult(game);
  const setItem = storage.setItem;
  storage.setItem = () => { throw new Error('quota'); };
  assert.equal(game.dispatch('bank'), true);
  assert.equal(game.dispatch('bank'), false);
  assert.equal(game.state.progress.bank, 100);
  assert.match(notices.at(-1), /could not save progress/);
  const reloaded = makeGame(storage);
  assert.equal(reloaded.state.phase, 'success');
  assert.equal(reloaded.state.progress.bank, 0);
  storage.setItem = setItem;
  reloaded.dispatch('bank');
  assert.equal(makeGame(storage).state.progress.bank, 100);

  const unavailable = makeGame(undefined, fixture, {
    getStorage() { throw new Error('storage disabled'); },
    onNotice: message => notices.push(message),
  });
  assert.match(notices.at(-1), /storage is unavailable/);
  startMission(unavailable);
  driveUntilResult(unavailable);
  unavailable.dispatch('bank');
  assert.equal(unavailable.state.progress.bank, 100);
});
