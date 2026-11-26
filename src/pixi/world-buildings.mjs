import { Matrix } from '/vendor/pixi.mjs';
import { light, materials } from './world-materials.mjs';

const roofColors = [0x638094, 0xad987e, 0x688499, 0x9e6d60, 0xbca487];
const key = { x: .79, y: 1.26 };

export function grain(color, scale = .56) {
  return { texture: materials().grain, textureSpace: 'global', matrix: new Matrix().scale(scale, scale), color };
}

function rect(g, { x, y, width, height }, style) {
  if (width > 0 && height > 0) g.rect(x, y, width, height).fill(style);
}

export function castShadow(g, { x, y, width, height }, relief, opacity = 1) {
  const right = x + width;
  const bottom = y + height;
  // The cool ambient key is upper left. Taller objects project farther into the same penumbra.
  for (const [distance, spread, alpha] of [[1.49, .38, .044], [1.32, .30, .062], [1.15, .23, .086],
    [1.00, .15, .113], [.83, .075, .16], [.59, 0, .22]]) {
    const dx = key.x * relief * distance;
    const dy = key.y * relief * distance;
    const blur = spread * relief;
    g.poly([right + blur, y - blur, right + dx + blur, y + dy - blur, right + dx + blur, bottom + dy + blur,
      x + dx - blur, bottom + dy + blur, x - blur, bottom + blur, x - blur, y - blur])
      .fill({ color: 0x06111a, alpha: alpha * opacity });
  }
}

function faceFor(block, axis, sign, depth) {
  const horizontal = axis === 'x';
  return {
    horizontal, sign, depth,
    line: horizontal ? block.y + (sign > 0 ? block.height : 0) : block.x + (sign > 0 ? block.width : 0),
    start: horizontal ? block.x : block.y,
    length: horizontal ? block.width : block.height,
  };
}

function faceBand(face, start, end, low, high) {
  const along = face.start + start;
  const across = face.line - face.sign * (face.sign > 0 ? high : low);
  return face.horizontal ? { x: along, y: across, width: end - start, height: high - low } :
    { x: across, y: along, width: high - low, height: end - start };
}

function onFace(face, along, inward) {
  return face.horizontal ? { x: face.start + along, y: face.line - face.sign * inward } :
    { x: face.line - face.sign * inward, y: face.start + along };
}

function glowOnSurface(g, surface, lightX, lightY, width, height, color, alpha) {
  const x = lightX - width / 2;
  const y = lightY - height / 2;
  const left = Math.max(x, surface.x);
  const top = Math.max(y, surface.y);
  const right = Math.min(x + width, surface.x + surface.width);
  const bottom = Math.min(y + height, surface.y + surface.height);
  if (left >= right || top >= bottom) return;
  const texture = materials().glow;
  rect(g, { x: left, y: top, width: right - left, height: bottom - top }, {
    texture, color, alpha, textureSpace: 'global',
    matrix: new Matrix().scale(width / texture.width, height / texture.height).translate(x, y),
  });
}

function facadeLight(g, face, plane, eave, lamps) {
  for (const { x, y } of lamps) {
    const along = (face.horizontal ? x : y) - face.start;
    const across = face.sign * ((face.horizontal ? y : x) - face.line);
    if (across < -2 || across > 25 || along < -12 || along > face.length + 12) continue;
    const strength = (1 - Math.max(0, across) / 26) ** 1.27;
    const base = onFace(face, along, face.depth * .30);
    glowOnSurface(g, plane, base.x, base.y, face.horizontal ? 35 : 14, face.horizontal ? 14 : 35,
      0xf8a550, .88 * strength);
    const trim = onFace(face, along, face.depth - .12);
    glowOnSurface(g, eave, trim.x, trim.y, face.horizontal ? 31 : 9, face.horizontal ? 9 : 31,
      0xffc17c, .73 * strength);
  }
}

function windowGroup(g, spill, face, left, width, panes, lit) {
  const deck = face.depth;
  const low = Math.max(1.35, deck * .24);
  const high = deck * .80;
  const paint = (from, to, a, b, fill) => rect(g, faceBand(face, from, to, a, b), fill);
  if (lit) {
    const { x, y } = onFace(face, left + width / 2, low - .4);
    glowOnSurface(g, faceBand(face, 1, face.length - 1, 0, deck), x, y,
      face.horizontal ? width + 7 : 8.2, face.horizontal ? 8.2 : width + 7, 0xeaa252, .39);
  }
  paint(left - .52, left + width + .56, low - .45, high + .28, 0x888076);
  paint(left - .25, left + width + .25, low, high, 0x131a20);
  paint(left - .68, left + width + .65, low - .68, low - .12, 0xa39882);
  const openingWidth = width / panes;
  for (let i = 0; i < panes; i += 1) {
    const x = left + i * openingWidth;
    paint(x + .24, x + openingWidth - .23, low + .29, high - .53, lit ? 0xdc8940 : 0x334753);
    if (lit) paint(x + .53, x + openingWidth - .49, low + .68, high - 1.02, i === 0 ? 0xffc067 : 0xffda8c);
    else paint(x + .34, x + openingWidth - .37, high - .97, high - .56, 0x536976);
  }
  if (lit) {
    const { x, y } = onFace(face, left + width / 2, -3.5);
    light(spill, x, y, face.horizontal ? width + 15 : 24, face.horizontal ? 24 : width + 15, 0xe1984d, .59);
    const foot = onFace(face, left + width / 2, -1.05);
    light(spill, foot.x, foot.y, face.horizontal ? width + 6 : 10, face.horizontal ? 10 : width + 6, 0xffaf58, .49);
  }
}

function door(g, face, from, width, garage) {
  const deck = face.depth;
  const top = deck - 1.3;
  const paint = (start, end, low, high, fill) => rect(g, faceBand(face, start, end, low, high), fill);
  paint(from - .6, from + width + .65, .38, top + .2, 0x7f7a72);
  paint(from, from + width, .46, top -.13, 0x151e24);
  paint(from + .55, from + width - .58, .67, top - .43, garage ? 0x455762 : 0x5a5b56);
  if (garage) {
    for (let ledge = 1.23; ledge < top - .62; ledge += 1.05) {
      paint(from + .68, from + width - .7, ledge, ledge + .35, 0x30414a);
    }
  } else {
    paint(from + .86, from + width - .9, top * .57, top - .69, 0x28333b);
    paint(from + width - 1.5, from + width - .82, 1.65, 2.2, 0xa39872);
  }
  paint(from - .45, from + width + .5, .06, .53, 0x857763);
}

function facade(g, spill, face, lamps, seed, principal) {
  const { depth, length, horizontal, sign } = face;
  const lo = horizontal ? 1.05 : .8;
  const hi = length - lo;
  const plane = faceBand(face, lo, hi, 0, depth);
  const wall = horizontal ? (sign > 0 ? 0x68615a : 0x495661) : (sign > 0 ? 0x505557 : 0x616165);
  rect(g, plane, grain(wall, .73));
  rect(g, faceBand(face, lo, hi, depth * .73, depth - .4), { color: 0x29363e, alpha: .40 });
  rect(g, faceBand(face, lo, hi, .55, 1.43), { color: 0x263139, alpha: .53 });
  for (let start = 3 + seed % 5; start < hi - 1; start += 7.4) {
    rect(g, faceBand(face, start, start + .34, 1.47, depth - .8), { color: 0x16202a, alpha: .24 });
  }
  if (depth >= 4.4 && length >= 23) {
    const garage = principal && seed % 4 === 1 && length > 34;
    const half = length * .49;
    const doorWidth = garage ? Math.min(length * .31, 15) : Math.min(length * .17, 7.1);
    door(g, face, 4.25, doorWidth, garage);
    const width = Math.min(length * .29, 13.7);
    windowGroup(g, spill, face, Math.max(half, 5.5 + doorWidth), width, width > 8.7 ? 3 : 2, seed % 5 !== 0 || principal);
    if (length >= 48) windowGroup(g, spill, face, length - 9.8, 5.8, 2, seed % 3 === 0);
  }
  rect(g, faceBand(face, lo, hi, depth - 1.37, depth - .38), { color: 0x111b22, alpha: .73 });
  const eave = faceBand(face, lo, hi, depth - .45, depth + .21);
  rect(g, eave, horizontal && sign > 0 ? 0x8d8575 : 0x6c7474);
  facadeLight(g, face, faceBand(face, lo, hi, 0, depth - 1.2), eave, lamps);
}

function roofEquipment(g, roof, seed) {
  if (roof.width < 13 || roof.height < 11) return;
  const fan = seed % 3 !== 0;
  const size = fan ? 7.2 : 5.85;
  const x = roof.x + (roof.width - size) * (seed % 2 ? .67 : .23);
  const y = roof.y + (roof.height - size) * (seed % 5 ? .39 : .64);
  castShadow(g, { x, y, width: size, height: size }, 1.8, .9);
  g.rect(x + .5, y + .7, size + .85, size + 1.15).fill(0x252f36)
    .rect(x, y, size, size).fill(fan ? 0x98978b : 0xb49d7d)
    .rect(x + .63, y + .62, size - 1.19, size - 1.21).fill(fan ? 0x596268 : 0x837967);
  g.moveTo(x, y + size).lineTo(x, y).lineTo(x + size, y).stroke({ color: 0xc1b7a2, width: .52 });
  if (!fan) return;
  const cx = x + size / 2;
  const cy = y + size / 2;
  g.circle(cx, cy, 2.52).fill(0x26353e).stroke({ color: 0x969c97, width: .43 });
  for (let blade = 0; blade < 6; blade += 1) {
    const angle = blade * Math.PI / 3;
    g.moveTo(cx, cy).lineTo(cx + Math.cos(angle) * 1.97, cy + Math.sin(angle) * 1.97);
  }
  g.stroke({ color: 0x85918e, width: .53 }).circle(cx, cy, .54).fill(0xadb1a0);
}

export function building(g, shadows, spill, block, streetFace, lamps) {
  const { x, y, width, height } = block;
  const seed = Math.abs(Math.floor(x * 11) ^ Math.floor(y * 79));
  const relief = 5.8 + (seed % 3) * 1.45;
  const front = Math.min(relief, height * .48);
  const back = streetFace.axis === 'x' && streetFace.sign < 0 ? Math.min(4.65, height * .24) : 1.75;
  const west = streetFace.axis === 'y' && streetFace.sign < 0 ? Math.min(5.15, front * .77, width * .28) : 1.75;
  const east = Math.min(streetFace.axis === 'y' && streetFace.sign > 0 ? 5.45 : 2.95, width * .27);
  const roof = { x: x + west, y: y + back, width: width - west - east, height: height - back - front };

  castShadow(shadows, block, relief);
  rect(g, block, 0x252e32);
  if (width < 8 || height < 8) return;
  const sides = [faceFor(block, 'x', -1, back), faceFor(block, 'y', -1, west),
    faceFor(block, 'y', 1, east), faceFor(block, 'x', 1, front)];
  for (const face of sides) {
    facade(g, spill, face, lamps, face.horizontal ? seed : seed + 3,
      (face.horizontal ? 'x' : 'y') === streetFace.axis && face.sign === streetFace.sign);
  }

  const roofTone = roofColors[seed % roofColors.length];
  const { x: rx, y: ry, width: rw, height: rh } = roof;
  rect(g, roof, 0x3c4a51);
  rect(g, { x: rx + .8, y: ry + .8, width: rw - 1.6, height: rh - 1.6 },
    { ...grain(roofTone, .91), texture: materials().roof });
  g.moveTo(rx + .53, ry + rh - .14).lineTo(rx + .53, ry + .5).lineTo(rx + rw - .37, ry + .5)
    .stroke({ color: 0xb7aa94, width: .79 });
  g.moveTo(rx + 1.35, ry + rh - 1.4).lineTo(rx + 1.35, ry + 1.40).lineTo(rx + rw - 1.35, ry + 1.40)
    .stroke({ color: 0x2a3a41, alpha: .58, width: .74 });
  g.moveTo(rx + rw - .36, ry + .42).lineTo(rx + rw - .36, ry + rh - .51).lineTo(rx + .44, ry + rh - .51)
    .stroke({ color: 0xada18d, width: .72 });
  for (const { x, y } of lamps) {
    const hitX = Math.max(rx - 1, Math.min(rx + rw + 1, x));
    const hitY = Math.max(ry - 1, Math.min(ry + rh + 1, y));
    const distance = Math.hypot(hitX - x, hitY - y);
    if (distance < 23) glowOnSurface(g, roof, hitX, hitY, 28, 22, 0xf3b678, .42 * (1 - distance / 25));
  }
  roofEquipment(g, roof, seed);
}
