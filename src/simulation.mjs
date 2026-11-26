import { behind, distance, roadLine } from './world.mjs';

export const STEP = 1 / 60;
export const NEUTRAL_INPUT = Object.freeze({ left: false, right: false, brake: false });

const reverseDwell = 1;
const reverseSpeed = 36;
const wrappedAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

function patrolWaypoint(map, patrol, player) {
  if (roadLine(map, patrol, player)) return player;
  const costs = new Map();
  const nodesById = new Map(map.nodes.map(node => [node.id, node]));
  const remaining = new Set(map.nodes.map(node => node.id));
  for (const node of map.nodes) {
    if (roadLine(map, node, player)) costs.set(node.id, distance(node, player));
  }
  while (remaining.size) {
    let best;
    let cost = Infinity;
    for (const id of remaining) {
      if (costs.get(id) < cost) {
        best = id;
        cost = costs.get(id);
      }
    }
    if (best === undefined) break;
    remaining.delete(best);
    const node = nodesById.get(best);
    for (const id of map.neighbors.get(best)) {
      const neighbor = nodesById.get(id);
      if (!remaining.has(id) || !roadLine(map, node, neighbor)) continue;
      const nextCost = cost + distance(node, neighbor);
      if (nextCost < (costs.get(id) ?? Infinity)) costs.set(id, nextCost);
    }
  }
  let target;
  let cost = Infinity;
  for (const node of map.nodes) {
    const gap = distance(node, patrol);
    const toPlayer = costs.get(node.id) ?? Infinity;
    if (gap > .5 && toPlayer + gap < cost && roadLine(map, patrol, node)) {
      cost = toPlayer + gap;
      target = node;
    }
  }
  return target;
}

function approach(speed, target, by) {
  return speed < target ? Math.min(target, speed + by) : Math.max(target, speed - by);
}

export function startDrive(segment, map, vehicle, damage = vehicle.maxDamage) {
  const { x, y, heading } = segment.spawn;
  return {
    segment, map, vehicle, damage,
    player: { x, y, heading, travelHeading: heading, speed: 0 },
    brakeDwell: 0,
    patrol: segment.patrol ? { ...behind(segment.spawn, segment.patrol.startGap), heading } : null,
    patrolWaypoint: null,
    nextRoute: 0,
    capture: 0,
    clearOfWall: .2,
    contact: false,
    pickedUp: false,
    skidding: false,
    skidMarks: [],
    incident: '',
    incidentTime: 0,
    outcome: null,
  };
}

function setIncident(drive, message) {
  drive.incident = message;
  drive.incidentTime = 1.15;
}

function nextSpeed(drive, brake, forwardTarget, dt) {
  const { player: { speed }, vehicle } = drive;
  if (!brake) {
    drive.brakeDwell = 0;
    return approach(speed, speed < 0 ? 0 : forwardTarget, vehicle.acceleration * dt);
  }
  if (drive.brakeDwell >= reverseDwell) return approach(speed, -reverseSpeed, vehicle.acceleration * dt);
  // The frame that finishes braking is still a moving frame. The dwell starts on the next one.
  if (speed === 0) drive.brakeDwell = Math.min(reverseDwell, drive.brakeDwell + dt);
  return approach(speed, 0, 220 * dt);
}

function driveCar(drive, input, dt) {
  const { player, vehicle, map } = drive;
  const steering = Number.isFinite(input.steering)
    ? Math.max(-1, Math.min(1, input.steering))
    : Number(Boolean(input.right)) - Number(Boolean(input.left));
  const pace = Math.abs(player.speed) / vehicle.speed;
  const turn = vehicle.turn * (.35 + .65 * Math.min(1, pace * 2)) * (1 - .25 * pace);
  const steeringSpeed = 1 - (1 - .67) * Math.abs(steering);
  player.speed = nextSpeed(drive, input.brake, vehicle.speed * steeringSpeed, dt);
  const direction = player.speed < 0 ? -1 : 1;
  player.heading = wrappedAngle(player.heading + direction * steering * turn * dt);
  const slip = wrappedAngle(player.heading - player.travelHeading);
  player.travelHeading = wrappedAngle(player.travelHeading +
    slip * Math.min(1, dt * vehicle.grip * (1 - .45 * pace)));
  const speed = Math.abs(player.speed);
  drive.skidding = Math.abs(slip) > .26 && speed > vehicle.speed * .46;
  if (drive.skidding) {
    drive.skidMarks.push({ x: player.x, y: player.y, heading: player.travelHeading });
    if (drive.skidMarks.length > 90) drive.skidMarks.shift();
  }
  const ux = Math.cos(player.travelHeading);
  const uy = Math.sin(player.travelHeading);
  const next = { x: player.x + ux * player.speed * dt, y: player.y + uy * player.speed * dt };
  if (roadLine(map, player, next)) {
    player.x = next.x;
    player.y = next.y;
    drive.clearOfWall += dt;
    if (drive.clearOfWall >= .18) drive.contact = false;
    return;
  }
  const alongX = { x: next.x, y: player.y };
  const alongY = { x: player.x, y: next.y };
  const canMoveX = roadLine(map, player, alongX);
  const canMoveY = roadLine(map, player, alongY);
  const impact = speed * Math.hypot(canMoveX ? 0 : ux, canMoveY ? 0 : uy);
  if (!drive.contact && Math.max(impact, canMoveX && canMoveY ? speed : 0) >= 70) {
    drive.damage -= 1;
    drive.contact = true;
    setIncident(drive, 'Hard impact. Car condition dropped.');
  }
  drive.clearOfWall = 0;
  if (canMoveX) player.x = alongX.x;
  else if (canMoveY) player.y = alongY.y;
  player.speed *= canMoveX || canMoveY ? .48 : .20;
  if (drive.damage === 0) drive.outcome = { kind: 'failure', reason: 'wrecked' };
}

function updatePatrol(drive, dt) {
  const { map, patrol, player, segment } = drive;
  if (!patrol) return;
  const rule = segment.patrol;
  drive.nextRoute -= dt;
  if (drive.nextRoute <= 0) {
    drive.patrolWaypoint = patrolWaypoint(map, patrol, player);
    drive.nextRoute = .12;
  }
  const target = drive.patrolWaypoint;
  if (target) {
    const gap = distance(patrol, target);
    if (gap > .1) {
      const fraction = Math.min(1, rule.speed * dt / gap);
      const next = { x: patrol.x + (target.x - patrol.x) * fraction, y: patrol.y + (target.y - patrol.y) * fraction };
      if (roadLine(map, patrol, next)) {
        patrol.heading = Math.atan2(target.y - patrol.y, target.x - patrol.x);
        Object.assign(patrol, next);
      }
    }
  }
  const close = distance(patrol, player) <= rule.captureRadius && roadLine(map, patrol, player);
  drive.capture = close ? drive.capture + dt : 0;
  if (drive.capture >= rule.captureSeconds) drive.outcome = { kind: 'failure', reason: 'busted' };
}

export function stepDrive(drive, input = NEUTRAL_INPUT, dt = STEP) {
  if (drive.outcome) return drive.outcome;
  const { segment: { objective }, player } = drive;
  drive.incidentTime = Math.max(0, drive.incidentTime - dt);
  const from = { x: player.x, y: player.y };
  driveCar(drive, input, dt);
  if (drive.outcome) return drive.outcome;
  let pickupAt = 0;
  if (!drive.pickedUp && objective.pickup) {
    pickupAt = firstTouch(from, player, objective.pickup);
  }
  if (!drive.pickedUp && objective.pickup && pickupAt !== null) {
    drive.pickedUp = true;
    setIncident(drive, 'Package collected.');
  }
  const { destination } = objective;
  if (!objective.pickup || drive.pickedUp) {
    const afterPickup = {
      x: from.x + (player.x - from.x) * pickupAt,
      y: from.y + (player.y - from.y) * pickupAt,
    };
    if (firstTouch(afterPickup, player, destination) !== null) {
      drive.outcome = { kind: 'success' };
      return drive.outcome;
    }
  }
  updatePatrol(drive, dt);
  return drive.outcome;
}

function firstTouch(from, to, target) {
  const x = from.x - target.x;
  const y = from.y - target.y;
  const outside = x * x + y * y - target.radius ** 2;
  if (outside <= 0) return 0;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const travel = dx * dx + dy * dy;
  const toward = x * dx + y * dy;
  const discriminant = toward * toward - travel * outside;
  if (!travel || toward >= 0 || discriminant < 0) return null;
  const time = (-toward - Math.sqrt(discriminant)) / travel;
  return time <= 1 ? time : null;
}
