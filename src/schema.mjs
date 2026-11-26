import { vehicles } from './vehicles.mjs';
import { behind, distance, makeMap, onRoad, roadLine } from './world.mjs';

function check(condition, path, message) {
  if (!condition) throw new Error(`${path}: ${message}`);
}

function object(value, path) {
  check(value && typeof value === 'object' && !Array.isArray(value), path, 'expected an object');
}

function array(value, path, min = 0) {
  check(Array.isArray(value) && value.length >= min, path, `expected an array with at least ${min} entries`);
}

function string(value, path) {
  check(typeof value === 'string' && value.trim().length > 0, path, 'expected nonempty text');
}

function id(value, path) {
  check(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value),
    path, 'expected an ID using letters, numbers, dots, hyphens or underscores');
}

function unique(value, alreadySeen, path) {
  check(!alreadySeen.has(value), path, `duplicate ID "${value}"`);
  alreadySeen.add(value);
}

function number(value, path) {
  check(Number.isFinite(value), path, 'expected a finite number');
}

function positive(value, path) {
  number(value, path);
  check(value > 0, path, 'expected a positive number');
}

function integer(value, path, min) {
  check(Number.isSafeInteger(value) && value >= min, path, `expected a whole number of at least ${min}`);
}

function point(value, path) {
  object(value, path);
  number(value.x, `${path}.x`);
  number(value.y, `${path}.y`);
}

function rectangle(value, path) {
  point(value, path);
  positive(value.width, `${path}.width`);
  positive(value.height, `${path}.height`);
  number(value.x + value.width, `${path} right edge`);
  number(value.y + value.height, `${path} bottom edge`);
}

function optionalArray(value, path) {
  if (value === undefined) return [];
  array(value, path);
  return value;
}

export function validateWorld(world) {
  const root = 'world.json';
  object(world, root);
  check(world.version === 1, `${root}.version`, 'expected version 1');
  array(world.pieces, `${root}.pieces`, 1);
  const pieceIds = new Set();
  const nodeIds = new Set();
  const links = [];
  world.pieces.forEach((piece, index) => {
    const path = `${root}.pieces[${index}]`;
    object(piece, path);
    id(piece.id, `${path}.id`);
    unique(piece.id, pieceIds, `${path}.id`);
    rectangle(piece.bounds, `${path}.bounds`);
    array(piece.roads, `${path}.roads`, 1);
    piece.roads.forEach((road, i) => rectangle(road, `${path}.roads[${i}]`));
    optionalArray(piece.obstacles, `${path}.obstacles`)
      .forEach((obstacle, i) => rectangle(obstacle, `${path}.obstacles[${i}]`));
    optionalArray(piece.navNodes, `${path}.navNodes`).forEach((node, i) => {
      const nodePath = `${path}.navNodes[${i}]`;
      point(node, nodePath);
      id(node.id, `${nodePath}.id`);
      unique(node.id, nodeIds, `${nodePath}.id`);
    });
    optionalArray(piece.navLinks, `${path}.navLinks`).forEach((link, i) => {
      const linkPath = `${path}.navLinks[${i}]`;
      check(Array.isArray(link) && link.length === 2, linkPath, 'expected two navigation node IDs');
      link.forEach(value => id(value, linkPath));
      check(link[0] !== link[1], linkPath, 'link must connect two different nodes');
      links.push({ link, path: linkPath });
    });
  });
  const map = makeMap(world, [...pieceIds]);
  const nodes = new Map(map.nodes.map(node => [node.id, node]));
  for (const node of nodes.values()) {
    check(onRoad(map, node), `${root} navigation node "${node.id}"`, 'place the node on drivable road');
  }
  for (const { link: [a, b], path } of links) {
    check(nodes.has(a) && nodes.has(b), path, `unknown navigation node in "${a}" → "${b}"`);
    check(roadLine(map, nodes.get(a), nodes.get(b)), path, `"${a}" → "${b}" leaves drivable road`);
  }
  return world;
}

function target(value, path, map) {
  point(value, path);
  positive(value.radius, `${path}.radius`);
  check(onRoad(map, value), path, 'place the target center on drivable road');
}

function validateSegment(segment, path, map) {
  object(segment, path);
  string(segment.flavour, `${path}.flavour`);
  string(segment.instructions, `${path}.instructions`);
  integer(segment.payout, `${path}.payout`, 1);
  point(segment.spawn, `${path}.spawn`);
  number(segment.spawn.heading, `${path}.spawn.heading`);
  check(onRoad(map, segment.spawn), `${path}.spawn`, 'place the spawn on drivable road');
  const objective = segment.objective;
  object(objective, `${path}.objective`);
  check(objective.kind === 'delivery' || objective.kind === 'pickup-delivery',
    `${path}.objective.kind`, 'expected "delivery" or "pickup-delivery"');
  target(objective.destination, `${path}.objective.destination`, map);
  if (objective.kind === 'pickup-delivery') {
    target(objective.pickup, `${path}.objective.pickup`, map);
  } else {
    check(objective.pickup === undefined, `${path}.objective.pickup`, 'only pickup-delivery can have a pickup');
  }
  if (segment.patrol !== undefined) {
    const patrolPath = `${path}.patrol`;
    object(segment.patrol, patrolPath);
    for (const key of ['startGap', 'speed', 'captureRadius', 'captureSeconds']) {
      positive(segment.patrol[key], `${patrolPath}.${key}`);
    }
    check(segment.patrol.startGap > segment.patrol.captureRadius, patrolPath, 'spawn gap must exceed capture radius');
    const patrolSpawn = behind(segment.spawn, segment.patrol.startGap);
    check(roadLine(map, patrolSpawn, segment.spawn), patrolPath,
      'provide continuous drivable road behind the player for the patrol starting gap');
  }
}

export function validateChapter(chapter, world) {
  const root = 'chapter1.json';
  object(chapter, root);
  check(chapter.version === 1, `${root}.version`, 'expected version 1');
  id(chapter.id, `${root}.id`);
  string(chapter.title, `${root}.title`);
  array(chapter.missions, `${root}.missions`, 1);
  const ids = new Set();
  const worldIds = new Set(world.pieces.map(piece => piece.id));
  chapter.missions.forEach((mission, index) => {
    const path = `${root}.missions[${index}]`;
    object(mission, path);
    id(mission.id, `${path}.id`);
    unique(mission.id, ids, `${path}.id`);
    string(mission.title, `${path}.title`);
    integer(mission.minTier, `${path}.minTier`, 1);
    for (const key of ['defaultVehicleId', 'stolenVehicleId']) {
      if (key === 'stolenVehicleId' && mission[key] === undefined) continue;
      check(Object.hasOwn(vehicles, mission[key]), `${path}.${key}`, 'unknown vehicle ID');
      check(vehicles[mission[key]].tier >= mission.minTier, `${path}.${key}`, 'vehicle fails the mission tier requirement');
    }
    check(typeof mission.allowVehicleSelection === 'boolean', `${path}.allowVehicleSelection`, 'expected true or false');
    array(mission.mapPieceIds, `${path}.mapPieceIds`, 1);
    const pieces = new Set();
    for (const pieceId of mission.mapPieceIds) {
      check(worldIds.has(pieceId), `${path}.mapPieceIds`, `unknown piece "${pieceId}"`);
      unique(pieceId, pieces, `${path}.mapPieceIds`);
    }
    const map = makeMap(world, mission.mapPieceIds);
    validateSegment(mission, path, map);
    validateSegment(mission.bonus, `${path}.bonus`, map);
    integer(mission.payout + mission.bonus.payout, `${path} combined payout`, 2);
  });
  return chapter;
}

function patrolSignature(patrol) {
  return patrol && [patrol.startGap, patrol.speed, patrol.captureRadius, patrol.captureSeconds].join(',');
}

export function validateChapterOneProgression(chapter, world) {
  const root = 'chapter1.json.missions';
  check(chapter.missions.length === 21, root, 'Chapter 1 requires exactly 21 missions');
  const firstPatrol = chapter.missions[13].patrol;
  chapter.missions.forEach((mission, index) => {
    const order = index + 1;
    const path = `${root}[${index}] (${mission.id})`;
    const hasPickup = (order >= 9 && order <= 13) || order >= 20;
    const hasPatrol = (order >= 14 && order <= 18) || order === 21;
    check(mission.objective.kind === (hasPickup ? 'pickup-delivery' : 'delivery'),
      `${path}.objective.kind`, `does not match the approved objective for mission ${order}`);
    check(Boolean(mission.patrol) === hasPatrol, `${path}.patrol`, `does not match the approved pursuit for mission ${order}`);
    if (hasPatrol) {
      check(patrolSignature(mission.patrol) === patrolSignature(firstPatrol),
        `${path}.patrol`, 'use identical pursuit tuning for missions 14–18 and 21');
    }
    check(order >= 9 || mission.bonus.objective.kind === 'delivery', `${path}.bonus.objective.kind`,
      'pickup can first appear in mission 9');
    if (mission.bonus.patrol) {
      check(order >= 14 && patrolSignature(mission.bonus.patrol) === patrolSignature(firstPatrol),
        `${path}.bonus.patrol`, 'patrols can first appear in mission 14 and use the learned tuning');
    }
    for (const segment of [mission, mission.bonus]) {
      for (const key of ['traffic', 'timer', 'duration', 'water', 'jumps', 'bridge']) {
        check(segment[key] === undefined, segment === mission ? path : `${path}.bonus`,
          `"${key}" is outside the Chapter 1 rules`);
      }
    }
    if (order > 3) return;
    const { spawn, objective: { destination } } = mission;
    const map = makeMap(world, mission.mapPieceIds);
    const gap = distance(spawn, destination);
    const ahead = (destination.x - spawn.x) * Math.cos(spawn.heading) +
      (destination.y - spawn.y) * Math.sin(spawn.heading);
    check(ahead > destination.radius, `${path}.objective.destination`, 'put the target ahead of the starting car');
    const miss = Math.sqrt(Math.max(0, gap ** 2 - ahead ** 2));
    const closest = behind(spawn, -ahead);
    check(miss < destination.radius && roadLine(map, spawn, closest), `${path}.objective.destination`,
      'missions 1–3 must be reachable by driving straight from spawn');
  });
  return chapter;
}
