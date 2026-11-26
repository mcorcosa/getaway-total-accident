import { Container } from '/vendor/pixi.mjs';
import { driveFrame } from '../renderer.mjs';
import { colors, graphics, group, icon } from './primitives.mjs';

const roofs = [0x52686c, 0x8a6e58, 0x59696b, 0x755565];
const patrolCar = { length: 25, width: 13, color: '#b9d7ef' };
const water = 0x10343c;

function overlaps(a, b, margin) {
  return a.x + a.width + margin > b.x && a.x - margin < b.x + b.width &&
    a.y + a.height + margin > b.y && a.y - margin < b.y + b.height;
}

function blocksFor(map) {
  const blocks = [...map.obstacles];
  for (const road of map.roads) {
    const horizontal = road.width >= road.height;
    const length = horizontal ? road.width : road.height;
    const slots = Math.min(250, Math.floor(length / 85));
    for (let slot = 0; slot < slots; slot += 1) {
      const offset = (slot + .16) * length / slots;
      const depth = 30 + (slot * 7 % 20);
      for (const side of [-1, 1]) {
        const block = horizontal ?
          { x: road.x + offset, y: side < 0 ? road.y - depth - 7 : road.y + road.height + 7, width: 60, height: depth } :
          { x: side < 0 ? road.x - depth - 7 : road.x + road.width + 7, y: road.y + offset, width: depth, height: 60 };
        if (!map.roads.some(other => overlaps(block, other, 6)) && !blocks.some(other => overlaps(block, other, 5))) {
          blocks.push(block);
        }
      }
    }
  }
  return blocks;
}

function box(g, { x, y, width, height }, color, grow = 0) {
  g.rect(x - grow, y - grow, width + grow * 2, height + grow * 2).fill(color);
}

function glow(g, x, y, radius, tint, opacity) {
  for (let step = 4; step >= 1; step -= 1) {
    g.circle(x, y, radius * (.32 + step * .17)).fill({ color: tint, alpha: opacity * (5 - step) / 10 });
  }
}

function lamp(g, x, y) {
  glow(g, x, y, 17, 0xfda346, .24);
  g.circle(x, y, 1.65).fill(0xffda8a);
}

function building(g, block, index) {
  const { x, y, width, height } = block;
  box(g, block, 0x253c42, 5);
  box(g, { x: x + 3, y: y + 5, width, height }, 0x0c161d);
  box(g, block, 0x171d24);
  if (width < 7 || height < 7) return;
  g.rect(x + 2, y + 2, width - 4, height - 5).fill(roofs[index % roofs.length]);
  g.rect(x + 2, y + 2, width - 4, 1).rect(x + 2, y + 3, 1, height - 6).fill({ color: 0xccbfa0, alpha: .42 });
  if (width > 22 && height > 14) {
    const vx = x + width * .66;
    const vy = y + height * .34;
    g.rect(vx, vy, 7, 5).fill(0x344146).rect(vx, vy, 5, 3).fill(0x7d8b8a);
    for (let tile = 7; tile < height - 4; tile += 6) {
      g.rect(x + 4, y + tile, width - 8, .55).fill({ color: 0x1a2331, alpha: .24 });
    }
  }
  if (width > 15) {
    g.rect(x + width * .28, y + height - 2, width * .36, 1.8).fill(0xf9ac55);
    lamp(g, x + width * .13, y + height + 2);
  }
}

function waterSurface(parent) {
  const waves = graphics(parent, 'canal-water');
  let originX;
  let originY;
  let columns;
  let rows;
  return view => {
    const x1 = Math.floor(view.x / 38);
    const y1 = Math.floor(view.y / 11);
    const horizontal = Math.ceil((view.x + view.width) / 38) - x1;
    const vertical = Math.ceil((view.y + view.height) / 11) - y1;
    if (x1 === originX && y1 === originY && horizontal === columns && vertical === rows) return;
    originX = x1;
    originY = y1;
    columns = horizontal;
    rows = vertical;
    waves.clear();
    for (let row = y1 - 1; row <= y1 + rows; row += 1) {
      const y = row * 11;
      for (let col = x1 - 1; col <= x1 + columns; col += 1) {
        const x = col * 38;
        const from = x + Math.abs((x * 3 + y * 17) % 21);
        waves.moveTo(from, y).lineTo(from + 8 + Math.abs((x + y) % 11), y - 1);
      }
    }
    waves.stroke({ width: .75, color: 0x67aaa5, alpha: .23 });
  };
}

function drawStreet(g, road) {
  const { x, y, width, height } = road;
  const horizontal = width >= height;
  const span = horizontal ? width : height;
  for (let along = 8; along < span - 3; along += 25) {
    if (horizontal) g.rect(x + along, y + height / 2, Math.min(10, span - along), 1);
    else g.rect(x + width / 2, y + along, 1, Math.min(10, span - along));
  }
  g.fill({ color: 0xa9aa97, alpha: .37 });
  for (let along = 20; along < span - 10; along += 82) {
    if (horizontal) {
      lamp(g, x + along, y - 3);
      lamp(g, x + along + 8, y + height + 2);
    } else {
      lamp(g, x - 3, y + along);
      lamp(g, x + width + 2, y + along + 8);
    }
  }
}

function world(parent, map) {
  const scene = group(parent, 'world-geometry');
  const drawWater = waterSurface(scene);
  const roads = graphics(scene, 'roads-and-lighting');
  for (const road of map.roads) box(roads, road, 0x84796a, 5);
  for (const road of map.roads) box(roads, road, 0x475455, 3);
  for (const road of map.roads) box(roads, road, 0x263039);
  for (const road of map.roads) drawStreet(roads, road);
  const buildings = graphics(scene, 'canal-buildings');
  blocksFor(map).forEach((block, index) => building(buildings, block, index));
  return drawWater;
}

export function car(parent, vehicle, label, police = false) {
  const node = group(parent, label);
  const g = graphics(node);
  const { width, length, color } = vehicle;
  glow(g, length * .67, 0, length * .91, 0xffd59a, .13);
  if (police) glow(g, 0, 0, length, 0x34a9e5, .23);
  g.roundRect(-length / 2 - 1, -width / 2 + 1.5, length + 3, width + 2, 4)
    .fill({ color: 0x080e1c, alpha: .8 });
  g.roundRect(-length / 2, -width / 2, length, width, 3).fill(color)
    .stroke({ color: 0xffffff, alpha: .4, width: .65 });
  g.rect(-length * .18, -width * .39, length * .42, width * .78).fill(0x132537);
  g.rect(-length * .12, -width * .36, length * .26, width * .72).fill(0x41516a);
  g.rect(length * .39, -width * .37, 2, 2).rect(length * .39, width * .2, 2, 2).fill(0xfff1b2);
  g.rect(-length * .46, -width * .35, 1.5, 1.8).rect(-length * .46, width * .2, 1.5, 1.8).fill(0xff7669);
  if (police) {
    g.rect(-1.9, -width * .35, 3.8, width * .35).fill(colors.pink);
    g.rect(-1.9, 0, 3.8, width * .35).fill(colors.aqua);
  }
  return node;
}

function pose(node, point) {
  node.position.set(point.x, point.y);
  node.rotation = point.heading;
}

function marker(parent, point, kind, label) {
  const node = group(parent, label, point.x, point.y);
  const tint = kind === 'pickup' ? colors.gold : colors.aqua;
  const g = graphics(node);
  glow(g, 0, 0, 23, tint, .23);
  g.circle(0, 0, point.radius).stroke({ color: tint, alpha: .77, width: 1.35 });
  g.circle(0, 0, 10).fill(tint);
  icon(node, kind, 0, 0, 15, colors.night);
  return node;
}

export function liveWorld(parent, drive, width, height, overlays) {
  graphics(parent, 'water-background').rect(0, 0, width, height).fill(water);
  const camera = group(parent, 'world-camera');
  const drawWater = world(camera, drive.map);
  const skid = graphics(camera, 'skid-marks');
  const { objective } = drive.segment;
  const kinds = ['destination', ...(objective.pickup ? ['pickup'] : [])];
  const marks = Object.fromEntries(kinds.map(kind => [kind, marker(camera, objective[kind], kind, `world-${kind}`)]));
  const player = car(camera, drive.vehicle, 'player-car');
  const police = drive.patrol && car(camera, patrolCar, 'patrol-car', true);
  const arrows = Object.fromEntries(kinds.map(kind => {
    const node = marker(parent, { x: 0, y: 0, radius: 12 }, kind, `edge-${kind}`);
    const direction = graphics(node).poly([22, 0, 15, -5, 15, 5]).fill(kind === 'pickup' ? colors.gold : colors.aqua);
    return [kind, { node, direction }];
  }));

  return () => {
    const kind = objective.pickup && !drive.pickedUp ? 'pickup' : 'destination';
    const goal = objective[kind];
    const { zoom, safe, view } = driveFrame(width, height, drive.player, goal, overlays);
    camera.position.set(-view.x * zoom, -view.y * zoom);
    camera.scale.set(zoom);
    drawWater(view);
    skid.clear();
    for (const [i, mark] of drive.skidMarks.entries()) {
      const c = Math.cos(mark.heading);
      const s = Math.sin(mark.heading);
      for (const off of [-4.2, 3.2]) {
        const x = mark.x - s * off;
        const y = mark.y + c * off;
        skid.moveTo(x - c * 4, y - s * 4).lineTo(x + c, y + s)
          .stroke({ width: 1, color: 0x040910, alpha: .13 + .37 * i / drive.skidMarks.length });
      }
    }
    pose(player, drive.player);
    if (police) pose(police, drive.patrol);
    for (const entry of kinds) {
      marks[entry].visible = entry === kind;
      arrows[entry].node.visible = false;
    }
    const x = (goal.x - view.x) * zoom;
    const y = (goal.y - view.y) * zoom;
    const { left, right, top, bottom } = safe;
    if (x >= left - .01 && x <= right + .01 && y >= top - .01 && y <= bottom + .01) return;
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    const dx = x - centerX;
    const dy = y - centerY;
    const trim = Math.min((right - centerX) / (Math.abs(dx) || .001), (bottom - centerY) / (Math.abs(dy) || .001));
    const { node, direction } = arrows[kind];
    node.visible = true;
    node.position.set(centerX + dx * trim, centerY + dy * trim);
    direction.rotation = Math.atan2(dy, dx);
  };
}

export function teachingView(parent, map, segment, vehicle, x, y, size) {
  const inset = group(parent, 'teaching-inset', x, y);
  const crop = graphics(inset).roundRect(0, 0, size, size, 6).fill(0xffffff);
  const image = inset.addChild(new Container({ label: 'lesson-world' }));
  image.mask = crop;
  graphics(image).rect(0, 0, size, size).fill(water);
  const camera = group(image, 'lesson-camera');
  const { spawn, objective } = segment;
  const focus = objective.pickup ?? objective.destination;
  const zoom = Math.min(size / (Math.abs(spawn.x - focus.x) + 100), size / (Math.abs(spawn.y - focus.y) + 86), 1.15);
  const view = {
    x: (spawn.x + focus.x) / 2 - size / (zoom * 2),
    y: (spawn.y + focus.y) / 2 - size / (zoom * 2),
    width: size / zoom, height: size / zoom,
  };
  camera.scale.set(zoom);
  camera.position.set(-view.x * zoom, -view.y * zoom);
  world(camera, map)(view);
  marker(camera, focus, objective.pickup ? 'pickup' : 'destination', 'lesson-goal');
  if (segment.patrol) {
    const { startGap } = segment.patrol;
    pose(car(camera, patrolCar, 'lesson-patrol', true), {
      x: spawn.x - Math.cos(spawn.heading) * startGap,
      y: spawn.y - Math.sin(spawn.heading) * startGap, heading: spawn.heading,
    });
  }
  pose(car(camera, vehicle, 'lesson-car'), spawn);
}
