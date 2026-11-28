import { Container, Matrix } from '../../vendor/pixi.mjs';
import { driveFrame, markerGlowRadius, markerRingWidth } from '../renderer.mjs';
import { STEP } from '../simulation.mjs';
import { vehicles } from '../vehicles.mjs';
import { getCityHatchbackTexture } from './assets.mjs';
import { colors, graphics, group, icon } from './primitives.mjs';
import { building, castShadow, grain } from './world-buildings.mjs';
import { light, materials, sprite, waterColor, waterSurface } from './world-materials.mjs';

const patrolCar = { length: 25, width: 13, color: '#b9d7ef' };
const cityHatchbackPixelsPerUnit = 4;
const animation = new WeakMap();
const edges = [
  { axis: 'x', across: 'y', length: 'width', depth: 'height', sign: -1 },
  { axis: 'y', across: 'x', length: 'height', depth: 'width', sign: 1 },
  { axis: 'x', across: 'y', length: 'width', depth: 'height', sign: 1 },
  { axis: 'y', across: 'x', length: 'height', depth: 'width', sign: -1 },
];

function overlaps(a, b, margin) {
  return a.x + a.width + margin > b.x && a.x - margin < b.x + b.width &&
    a.y + a.height + margin > b.y && a.y - margin < b.y + b.height;
}

function blocksFor(roads, obstacles) {
  const blocks = [...obstacles];
  for (const road of roads) {
    const horizontal = road.width >= road.height;
    const length = horizontal ? road.width : road.height;
    const step = Math.max(8, Math.floor(length / 500));
    for (const side of [-1, 1]) {
      let offset = 10;
      while (offset + 28 < length) {
        const lot = Math.floor(offset / 40);
        const depth = 29 + (lot * 7 % 20);
        const frontage = Math.min(49 + (lot * 11 % 18), length - offset - 7);
        let spacing = step;
        for (const width of [frontage, 28]) {
          if (width < 28 || offset + width + 7 > length) continue;
          const block = horizontal ?
            { x: road.x + offset, y: side < 0 ? road.y - depth - 12 : road.y + road.height + 12, width, height: depth } :
            { x: side < 0 ? road.x - depth - 12 : road.x + road.width + 12, y: road.y + offset, width: depth, height: width };
          if (roads.some(other => overlaps(block, other, 8)) || blocks.some(other => overlaps(block, other, 8))) continue;
          blocks.push(block);
          spacing = width + 12;
          break;
        }
        offset += spacing;
      }
    }
  }
  return blocks;
}

function box(g, { x, y, width, height }, color, grow = 0) {
  if (width + grow * 2 > 0 && height + grow * 2 > 0) {
    g.rect(x - grow, y - grow, width + grow * 2, height + grow * 2).fill(color);
  }
}

function expand({ x, y, width, height }, by) {
  return { x: x - by, y: y - by, width: width + 2 * by, height: height + 2 * by };
}

function stone(color) {
  return { texture: materials().pavers, textureSpace: 'global', matrix: new Matrix().scale(.53, .53), color };
}

function glow(g, x, y, radius, tint, opacity) {
  for (let step = 4; step >= 1; step -= 1) {
    g.circle(x, y, radius * (.32 + step * .17)).fill({ color: tint, alpha: opacity * (5 - step) / 10 });
  }
}

function edgeRect(edge, from, to, outward, thickness) {
  const { axis, across, length, depth, line, sign } = edge;
  return { [axis]: from, [across]: line + sign * outward - (sign < 0 ? thickness : 0),
    [length]: to - from, [depth]: thickness };
}

function perimeter(rectangles) {
  return rectangles.flatMap((rect, index) => edges.flatMap((side, direction) => {
    const { axis, across, length, depth, sign } = side;
    const from = rect[axis];
    const to = from + rect[length];
    const line = rect[across] + (sign > 0 ? rect[depth] : 0);
    const outside = line + sign * .01;
    const blocked = rectangles.filter((other, i) => i !== index && other[axis] < to && other[axis] + other[length] > from &&
      (other[across] < outside && other[across] + other[depth] > outside ||
        i < index && (sign < 0 ? other[across] : other[across] + other[depth]) === line));
    const cuts = [...new Set([from, to, ...blocked.flatMap(other => [Math.max(from, other[axis]),
      Math.min(to, other[axis] + other[length])])])].sort((a, b) => a - b);
    return cuts.slice(1).flatMap((end, i) => {
      const start = cuts[i];
      const center = (start + end) / 2;
      return blocked.some(other => other[axis] < center && other[axis] + other[length] > center) ? [] :
        [{ ...side, from: start, to: end, line, direction }];
    });
  }));
}

function seawall(g, edge) {
  const { from, to } = edge;
  box(g, edgeRect(edge, from, to, -.1, 8), { color: 0x051015, alpha: .44 });
  box(g, edgeRect(edge, from, to, -.1, 4.9), { color: 0x050e13, alpha: .72 });
  box(g, edgeRect(edge, from, to, -1.4, 4.6), 0x23343a);
  box(g, edgeRect(edge, from, to, .1, 1.6), 0x16282f);
  box(g, edgeRect(edge, from, to, -3.1, 3.1), 0x68716b);
  box(g, edgeRect(edge, from, to, -3.6, .75), 0x8a8878);
  for (let along = Math.ceil(from / 8) * 8; along < to - .5; along += 8) {
    box(g, edgeRect(edge, along, along + .54, -3.05, 3.1), 0x333a39);
  }
}

function curb(g, edge) {
  const { from, to } = edge;
  box(g, edgeRect(edge, from, to, -1.5, 2.3), 0x111a20);
  box(g, edgeRect(edge, from, to, .04, 1.2), 0x7a786d);
  box(g, edgeRect(edge, from, to, 1.2, 1.15), 0x595b56);
  for (let along = Math.ceil(from / 8) * 8; along < to - .5; along += 8) {
    box(g, edgeRect(edge, along, along + .5, .04, 2.3), 0x303738);
  }
}

function lamp(lights, poles, relief, x, y, direction, shore = false) {
  const { axis, sign } = direction;
  const dx = axis === 'y' ? sign : 0;
  const dy = axis === 'x' ? sign : 0;
  light(lights, x + dx * 9, y + dy * 9, dx ? 57 : 38, dx ? 38 : 57, 0xe49143, shore ? .48 : .53);
  light(lights, x + dx * 2, y + dy * 2, 23, 23, 0xffad58, .52);
  sprite(lights, materials().wet, x + dx * 12, y + dy * 12, dx ? 37 : 19, dx ? 19 : 37,
    { tint: 0xffb765, alpha: .56 });
  const { shadows, spill } = relief;
  light(spill, x + .35, y + 1.5, 31, 27, 0xffac5c, .53);
  if (!shore) {
    light(spill, x - dx * 6.5, y - dy * 6.5, dx ? 34 : 41, dx ? 41 : 34, 0xf5a452, .58);
    light(spill, x - dx * 3.9, y - dy * 3.9, dx ? 19 : 24, dx ? 24 : 19, 0xffba74, .47);
    light(spill, x + dx * 12, y + dy * 12, dx ? 47 : 24, dx ? 24 : 47, 0xdd9855, .16);
    sprite(spill, materials().wet, x + dx * 15, y + dy * 15, dx ? 39 : 16, dx ? 16 : 39,
      { tint: 0xffbe71, alpha: .86 });
  }
  castShadow(shadows, { x: x - .34, y: y + 3, width: 1.3, height: 1.25 }, 3.2, .70);
  poles.ellipse(x + .65, y + 3.5, 1.93, 1.24).fill(0x161e23)
    .ellipse(x + .42, y + 3.21, 1.25, .66).fill(0x4b4940);
  poles.moveTo(x + .56, y + 3.15).lineTo(x, y).stroke({ color: 0x262625, width: 1.25 });
  poles.moveTo(x + .19, y + 2.97).lineTo(x - .27, y).stroke({ color: 0xa77b50, width: .44 });
  poles.circle(x, y, 2.34).fill(0x7f5332).circle(x, y, 1.82).fill(0xffcf76)
    .circle(x - .26, y - .32, 1.05).fill(0xffebc6);
}

function shoreLights(edge, reflections, lights, poles, lamps, relief) {
  const { from, to, line, axis, across, direction, sign } = edge;
  for (let along = Math.ceil((from + 13) / 96) * 96; along < to - 13; along += 96) {
    const { x, y } = { [axis]: along, [across]: line - sign * 7 };
    lamp(lights, poles, relief, x, y, { ...edge, sign: -sign }, true);
    lamps.push({ x, y });
    const texture = materials().reflections[direction][Math.abs(along / 96) % 2];
    const waterEdge = { [axis]: along, [across]: line + sign * 2.5 };
    const reflection = sprite(reflections, texture, waterEdge.x, waterEdge.y, 112, 113, { alpha: .87 });
    const flicker = sprite(reflections, texture, waterEdge.x, waterEdge.y, 108, 106, { alpha: .34 });
    reflection.label = 'shore-lamp-reflection';
    flicker.label = 'shore-lamp-shimmer';
  }
}

function facing(block, streets) {
  let distance = Infinity;
  let nearest = edges[2];
  for (const edge of edges) {
    const { axis, across, length, depth, sign } = edge;
    const center = block[axis] + block[length] / 2;
    const wall = block[across] + (sign > 0 ? block[depth] : 0);
    for (const street of streets) {
      const gap = sign * (street[across] + (sign < 0 ? street[depth] : 0) - wall);
      if (gap >= 0 && gap < distance && center > street[axis] && center < street[axis] + street[length]) {
        nearest = edge;
        distance = gap;
      }
    }
  }
  return { ...nearest, line: block[nearest.across] + (nearest.sign > 0 ? block[nearest.depth] : 0) };
}

function plants(parent, details, shadows, block, edge, index, streets, blocks, ground, lamps) {
  const { axis, across, length, line, sign } = edge;
  const from = block[axis] + 5;
  const to = block[axis] + block[length] - 5;
  const fits = (point, radius, clearance = radius) => {
    const area = { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 };
    return ground.some(rect => area.x >= rect.x + 2 && area.y >= rect.y + 2 &&
      area.x + area.width <= rect.x + rect.width - 2 && area.y + area.height <= rect.y + rect.height - 2) &&
      !streets.some(road => overlaps(area, road, .5)) &&
      !blocks.some(other => overlaps({ x: point.x, y: point.y, width: 0, height: 0 }, other, clearance)) &&
      !lamps.some(lamp => Math.hypot(lamp.x - point.x, lamp.y - point.y) < radius + 3);
  };
  for (const along of [from + 2, to - 2]) {
    const point = { [axis]: along, [across]: line + sign * 5.9 };
    if (!fits(point, 3)) continue;
    const { x, y } = point;
    details.ellipse(x + .65, y + .9, 4.2, 2.8).fill(0x192721);
    for (const [dx, dy, tint] of [[-2, 0, 0x4b5a33], [0, -.6, 0x54643b], [2, .6, 0x394c32]]) {
      details.circle(x + dx, y + dy, 1.65).fill(tint).circle(x + dx - .2, y + dy - .45, .62).fill(0x777848);
    }
  }
  if (index % 3 === 1) return;
  const point = { [axis]: index % 2 ? to + 9 : from - 9, [across]: line - sign * 10 };
  if (!fits(point, 9, 4)) return;
  const { x, y } = point;
  castShadow(shadows, { x: x - 2, y: y - 3, width: 4, height: 5 }, 4.2, .58);
  light(parent, x + 2, y + 2.8, 31, 31, 0x070f12, .8);
  sprite(parent, materials().palms[index % 3], x, y, 32 + index % 4, 32 + index % 4,
    { rotation: index * .78 });
}

function continuousStreets(roads) {
  const lines = new Map();
  for (const road of roads) {
    const horizontal = road.width >= road.height;
    const axis = horizontal ? 'x' : 'y';
    const size = horizontal ? 'width' : 'height';
    const across = horizontal ? 'y' : 'x';
    const span = horizontal ? 'height' : 'width';
    const key = `${axis}/${road[across]}/${road[span]}`;
    const line = lines.get(key) ?? { axis, size, roads: [] };
    line.roads.push(road);
    lines.set(key, line);
  }
  const streets = [];
  for (const { axis, size, roads } of lines.values()) {
    let current;
    for (const road of roads.sort((a, b) => a[axis] - b[axis])) {
      if (current && road[axis] <= current[axis] + current[size]) {
        current[size] = Math.max(current[size], road[axis] + road[size] - current[axis]);
      } else {
        current = { ...road };
        streets.push(current);
      }
    }
  }
  return streets;
}

function drawStreet(g, road, crossings) {
  const { x, y, width, height } = road;
  const horizontal = width >= height;
  const span = horizontal ? width : height;
  for (let along = 8; along < span - 3; along += 25) {
    const length = Math.min(10, span - along);
    const dash = horizontal ? { x: x + along, y: y + height / 2, width: length, height: 1 } :
      { x: x + width / 2, y: y + along, width: 1, height: length };
    if (!crossings.some(other => overlaps(dash, other, 5))) box(g, dash, grain(0x7b786c));
  }
}

function roadClosure(parent, { x, y, width, height, axis }, index) {
  const g = graphics(parent, `road-closure:${index}`);
  const across = axis === 'x' ? height : width;
  const depth = axis === 'x' ? width : height;
  const strip = (along, offset, thickness, length, color) => {
    if (axis === 'x') g.rect(x + along, y + offset, thickness, length).fill(color);
    else g.rect(x + offset, y + along, length, thickness).fill(color);
  };
  strip(depth * .10, 0, depth * .83, across, { color: 0x0b1118, alpha: .8 });
  const panels = Math.max(1, Math.ceil(across / 18));
  const spacing = across / panels;
  strip(depth * .31, 0, depth * .45, across, 0x2e2826);
  strip(depth * .27, 0, depth * .35, across, 0x966644);
  for (let i = 0; i < panels; i += 1) {
    const edge = (i + .12) * spacing;
    strip(depth * .18, edge, depth * .67, spacing * .19, 0x4c4841);
    strip(depth * .25, edge, depth * .42, spacing * .78, 0xe6a75a);
    strip(depth * .25, edge, depth * .14, spacing * .78, 0xffc27d);
    const points = [[.25, .29], [.25, .52], [.67, .70], [.67, .48]].flatMap(([along, across]) =>
      axis === 'x' ? [x + depth * along, y + edge + spacing * across] : [x + edge + spacing * across, y + depth * along]);
    g.poly(points).fill(0x51382d);
    strip(depth * .29, edge + spacing * .08, depth * .22, spacing * .07, 0xffdb9d);
  }
}

function world(parent, map) {
  const scene = group(parent, 'world-geometry');
  const drawWater = waterSurface(scene);
  const reflections = group(scene, 'canal-reflections');
  const { scenery } = map;
  const streets = continuousStreets(scenery.roads);
  const ground = streets.map(street => expand(street, 59));
  const shore = perimeter(ground);
  const roadside = perimeter(streets);
  const lots = graphics(scene, 'canal-blocks');
  // Paint the union so an intersecting street can never leave a seam across a lot.
  const paving = stone(0x4d5250);
  for (const lot of ground) box(lots, lot, paving);
  for (const edge of shore) seawall(lots, edge);
  const roads = graphics(scene, 'roads-and-lighting');
  const verge = stone(0x646662);
  for (const road of streets) box(roads, road, verge, 7.3);
  for (const edge of roadside) curb(roads, edge);
  const context = graphics(scene, 'context-streets');
  const closed = grain(0x2a3742);
  for (const road of streets) box(context, road, closed);
  const pavement = graphics(scene, 'active-streets');
  const asphalt = grain(0x222b34);
  for (const road of map.roads) box(pavement, road, asphalt);
  const details = graphics(scene, 'street-details');
  for (const street of streets) {
    drawStreet(details, street, streets.filter(other => other !== street && overlaps(street, other, 6)));
  }
  const landMask = graphics(scene, 'land-lighting-mask');
  for (const lot of ground) landMask.rect(lot.x, lot.y, lot.width, lot.height);
  landMask.fill(0xffffff);
  const landLighting = group(scene, 'land-lighting');
  landLighting.mask = landMask;
  const shadows = graphics(landLighting, 'canal-cast-shadows');
  const spill = group(landLighting, 'local-light-spill');
  const relief = { shadows, spill };
  const lights = group(scene, 'street-lamp-spill');
  const poles = graphics(scene, 'street-lamp-fixtures');
  const lamps = [];
  for (const edge of shore) shoreLights(edge, reflections, lights, poles, lamps, relief);
  for (const edge of roadside) {
    const { axis, across, from, to, line, sign } = edge;
    const offset = sign > 0 ? 46 : 0;
    for (let along = Math.ceil((from + 12 - offset) / 94) * 94 + offset; along < to - 12; along += 94) {
      const { x, y } = { [axis]: along, [across]: line + sign * 5.2 };
      lamp(lights, poles, relief, x, y, { ...edge, sign: -sign });
      lamps.push({ x, y });
    }
  }
  const buildings = graphics(scene, 'canal-buildings');
  const foliage = group(scene, 'canal-foliage');
  const planters = graphics(foliage, 'canal-planters');
  const blocks = blocksFor(streets, scenery.obstacles);
  blocks.forEach((block, index) => {
    const edge = facing(block, streets);
    building(buildings, shadows, spill, block, edge, lamps);
    plants(foliage, planters, shadows, block, edge, index, streets, blocks, ground, lamps);
  });
  const closures = group(scene, 'road-closures');
  scenery.closures.forEach((closure, index) => roadClosure(closures, closure, index));
  const glints = reflections.children.filter(child => child.label === 'shore-lamp-shimmer');
  return (view, time = 0) => {
    drawWater(view, time);
    for (const [index, glint] of glints.entries()) glint.alpha = .33 + .12 * Math.sin(time * 2.3 + index * 2.1);
  };
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

function liveCar(parent, vehicle, label, police = false) {
  const node = group(parent, label);
  const { width, length, color } = vehicle;
  const head = length * .45;
  for (const side of [-1, 1]) {
    const y = side * width * .29;
    light(node, head + length * .50, y * 1.26, length * 1.86, width * .96, 0xca9a62, .24, side * .16);
    light(node, head + length * .22, y, length * .85, width * .55, 0xffd292, .43, side * .12);
    light(node, -head - 2.5, y, length * .48, width * .69, 0xce492f, .23);
  }
  if (police) {
    light(node, 0, -width * .80, length * 2.8, width * 2.4, 0xe12572, .53, -.19);
    light(node, 0, width * .80, length * 2.8, width * 2.4, 0x268cff, .59, .19);
    light(node, -length * .35, -width * 1.06, length * 1.55, width * 1.23, 0xfe3872, .28);
    light(node, length * .35, width * 1.06, length * 1.55, width * 1.23, 0x409cff, .32);
    sprite(node, materials().wet, 0, -width * .88, length * 1.87, width * 1.8, { tint: 0xff4d8d, alpha: .48 });
    sprite(node, materials().wet, 0, width * .88, length * 1.87, width * 1.8, { tint: 0x4eafff, alpha: .53 });
  }
  light(node, -.9, 1.5, length * 1.60, width * 1.75, 0x070c13, .84);
  const g = graphics(node, 'procedural-car-body');
  g.roundRect(-length * .51, -width * .53, length * 1.02, width * 1.11, 3.1).fill(0x141820);
  g.roundRect(-length / 2, -width / 2, length, width, 3).fill(color)
    .stroke({ color: 0xffffff, alpha: .36, width: .55 });
  g.roundRect(-length * .38, -width * .43, length * .71, width * .86, 2).fill(police ? 0xa2bec7 : color);
  g.poly([-length * .29, -width * .39, -length * .32, width * .39, -length * .15, width * .33,
    length * .12, width * .33, length * .27, width * .40, length * .30, -width * .40, length * .11, -width * .33,
    -length * .16, -width * .33]).fill(0x132735);
  g.poly([-length * .15, -width * .29, length * .12, -width * .28, length * .13, width * .30,
    -length * .15, width * .30]).fill(police ? 0x42637f : 0x364854);
  g.moveTo(-length * .32, -width * .44).lineTo(length * .33, -width * .44)
    .stroke({ color: 0xffffff, alpha: .46, width: .48 });
  g.moveTo(-length * .11, -width * .26).lineTo(length * .12, -width * .24)
    .stroke({ color: 0x9faeb6, alpha: .47, width: .55 });
  for (const side of [-1, 1]) {
    const y = side * width * .29;
    g.roundRect(head - 2.1, y - .88, 2.6, 1.76, .6).fill(0xffe5a8);
    g.roundRect(-head - .65, y - .85, 1.5, 1.7, .42).fill(0xfa714f);
  }
  if (police) {
    g.roundRect(-2.2, -width * .41, 4.4, width * .82, 1).fill(0x26323b);
    g.rect(-1.55, -width * .38, 3.1, width * .36).fill(0xff6799)
      .rect(-1.55, width * .02, 3.1, width * .36).fill(0x5ac4ff);
    g.rect(-1.15, -width * .34, .55, width * .67).fill({ color: 0xffffff, alpha: .75 });
  }
  return node;
}

function worldTime(drive) {
  // The UI recreates the scene on pause and resize. Use simulation progress so repainting
  // the same drive state keeps the exact same reflection and wave phase.
  const { clearOfWall, incidentTime, player: { x, y, speed, heading }, patrol } = drive;
  const previous = animation.get(drive);
  let time = previous?.time ?? 0;
  if (previous) {
    const clearDelta = clearOfWall - previous.clearOfWall;
    if (clearDelta > 0) time += clearDelta;
    else if (clearDelta < 0 || incidentTime !== previous.incidentTime || x !== previous.x || y !== previous.y ||
      speed !== previous.speed || heading !== previous.heading || patrol?.x !== previous.patrolX || patrol?.y !== previous.patrolY) time += STEP;
  }
  animation.set(drive, { time, clearOfWall, incidentTime, x, y, speed, heading, patrolX: patrol?.x, patrolY: patrol?.y });
  return time;
}

function pose(node, point) {
  node.position.set(point.x, point.y);
  node.rotation = point.heading;
}

function marker(parent, point, kind, label) {
  const node = group(parent, label, point.x, point.y);
  const tint = kind === 'pickup' ? colors.gold : colors.aqua;
  const g = graphics(node);
  glow(g, 0, 0, markerGlowRadius, tint, .23);
  g.circle(0, 0, point.radius).stroke({ color: tint, alpha: .77, width: markerRingWidth });
  g.circle(0, 0, 10).fill(tint);
  icon(node, kind, 0, 0, 15, colors.night);
  return node;
}

export function liveWorld(parent, drive, width, height, overlays) {
  graphics(parent, 'water-background').rect(0, 0, width, height).fill(waterColor);
  const camera = group(parent, 'world-camera');
  const drawWater = world(camera, drive.map);
  const skid = graphics(camera, 'skid-marks');
  const { objective } = drive.segment;
  const kinds = ['destination', ...(objective.pickup ? ['pickup'] : [])];
  const marks = Object.fromEntries(kinds.map(kind => [kind, marker(camera, objective[kind], kind, `world-${kind}`)]));
  const player = liveCar(camera, drive.vehicle, 'player-car');
  let hatchbackFallback = drive.vehicle === vehicles['city-hatchback'] ? player.getChildByLabel('procedural-car-body') : null;
  const police = drive.patrol && liveCar(camera, patrolCar, 'patrol-car', true);
  const arrows = Object.fromEntries(kinds.map(kind => {
    const node = marker(parent, { x: 0, y: 0, radius: 12 }, kind, `edge-${kind}`);
    const direction = graphics(node).poly([22, 0, 15, -5, 15, 5]).fill(kind === 'pickup' ? colors.gold : colors.aqua);
    return [kind, { node, direction }];
  }));

  return () => {
    const kind = objective.pickup && !drive.pickedUp ? 'pickup' : 'destination';
    const goal = objective[kind];
    const { zoom, safe, edge, view } = driveFrame(width, height, drive.player, goal, overlays);
    camera.position.set(-view.x * zoom, -view.y * zoom);
    camera.scale.set(zoom);
    drawWater(view, worldTime(drive));
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
    if (hatchbackFallback) {
      const texture = getCityHatchbackTexture();
      if (texture) {
        sprite(player, texture, 0, 0, texture.width / cityHatchbackPixelsPerUnit, texture.height / cityHatchbackPixelsPerUnit,
          { label: 'city-hatchback-body' });
        hatchbackFallback.destroy();
        hatchbackFallback = null;
      }
    }
    if (police) pose(police, drive.patrol);
    for (const entry of kinds) {
      marks[entry].visible = entry === kind;
      arrows[entry].node.visible = false;
    }
    const x = (goal.x - view.x) * zoom;
    const y = (goal.y - view.y) * zoom;
    if (x >= safe.left && x <= safe.right && y >= safe.top && y <= safe.bottom) return;
    marks[kind].visible = false;
    const { left, right, top, bottom } = edge;
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
  graphics(image).rect(0, 0, size, size).fill(waterColor);
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
    pose(liveCar(camera, patrolCar, 'lesson-patrol', true), {
      x: spawn.x - Math.cos(spawn.heading) * startGap,
      y: spawn.y - Math.sin(spawn.heading) * startGap, heading: spawn.heading,
    });
  }
  pose(liveCar(camera, vehicle, 'lesson-car'), spawn);
}
