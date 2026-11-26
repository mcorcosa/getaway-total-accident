import { BufferImageSource, CanvasSource, Rectangle, Sprite, Texture } from '../../vendor/pixi.mjs';
import { vehicles } from '../vehicles.mjs';
import { clamp, colors, fade, graphics, group, icon, money, panel, target, text } from './primitives.mjs';
import { car } from './world-view.mjs';

const stops = [[.40, .825], [.855, .68], [.65, .575], [.456, .472], [.502, .365], [.355, .263], [.138, .156]];
const bends = [
  [.205, .067], [.11, .118], [.495, .42], [.585, .548], [.83, .763], [.76, .865, .791], [.68, .881, .809], [.36, .935],
];
const tabs = [['garage', 'Garage'], ['shop', 'Shop'], ['daily', 'Daily Missions'], ['home', 'Story']];
const mapFeatherFraction = .12;
const backgroundTextures = new WeakMap();
function routePoints(points, left, width) {
  const path = points.map(({ x, y }) => ({ x: left + x * width, y }));
  const segments = [];
  const dots = [];
  let length = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const prior = path[i - 1] ?? a;
    const next = path[i + 2] ?? b;
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const start = distance / (3 * Math.hypot(b.x - prior.x, b.y - prior.y));
    const finish = distance / (3 * Math.hypot(next.x - a.x, next.y - a.y));
    const p = { x: a.x + (b.x - prior.x) * start, y: a.y + (b.y - prior.y) * start };
    const q = { x: b.x - (next.x - a.x) * finish, y: b.y - (next.y - a.y) * finish };
    segments.push({ p, q, b });
    let last = a;
    const steps = Math.ceil(distance / 5) + 4;
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const s = 1 - t;
      const x = s ** 3 * a.x + 3 * s * s * t * p.x + 3 * s * t * t * q.x + t ** 3 * b.x;
      const y = s ** 3 * a.y + 3 * s * s * t * p.y + 3 * s * t * t * q.y + t ** 3 * b.y;
      const nextLength = length + Math.hypot(x - last.x, y - last.y);
      dots.push({ x, y, length: nextLength, last: { ...last, length } });
      last = { x, y };
      length = nextLength;
    }
  }
  const interval = length / Math.max(1, Math.round(length / 12));
  let next = 0;
  const marks = [];
  for (const dot of dots) {
    while (next < dot.length) {
      const t = (next - dot.last.length) / (dot.length - dot.last.length);
      marks.push([dot.last.x + t * (dot.x - dot.last.x), dot.last.y + t * (dot.y - dot.last.y)]);
      next += interval;
    }
  }
  return { start: path[0], segments, marks };
}

function drawRoute(parent, curve, w) {
  const track = graphics(parent, 'route-road').moveTo(curve.start.x, curve.start.y);
  for (const { p, q, b } of curve.segments) track.bezierCurveTo(p.x, p.y, q.x, q.y, b.x, b.y);
  track.stroke({ color: 0x10182e, width: clamp(w * .035, 11, 20), cap: 'round' });
  const dots = graphics(parent, 'route-dots');
  for (const [x, y] of curve.marks) dots.circle(x, y, clamp(w * .005, 2, 3.1));
  dots.fill(0x92f7eb);
}

function backgroundTexture(map) {
  const cached = backgroundTextures.get(map);
  if (cached) return cached;

  // Downsample the artwork once. Scrolling then draws a single ordinary Pixi sprite.
  const width = 256;
  const height = Math.round(width * map.height / map.width);
  const canvas = new OffscreenCanvas(width, height);
  const image = canvas.getContext('2d', { alpha: false });
  image.fillStyle = '#152934';
  image.fillRect(0, 0, width, height);
  image.filter = 'blur(1.8px) saturate(.52)';
  const overscan = 1.3;
  image.drawImage(map.source.resource, width * (1 - overscan) / 2, height * (1 - overscan) / 2,
    width * overscan, height * overscan);
  const texture = new Texture({ source: new CanvasSource({ resource: canvas }) });
  backgroundTextures.set(map, texture);
  return texture;
}

function storyBackground(parent, map, { width, height }) {
  const background = parent.addChild(new Sprite({
    texture: backgroundTexture(map), label: 'story-background', tint: 0x4c6972, eventMode: 'none',
  }));
  background.anchor.set(.5);
  background.position.set(width / 2, height / 2);
  const scale = Math.max(width / map.width, height / map.height);
  background.width = map.width * scale;
  background.height = map.height * scale;
}

function featherMap(parent, art, { left, w, height }) {
  // A stationary alpha mask feathers both sides while the art scrolls beneath it.
  const feather = Math.min(left / w, mapFeatherFraction);
  const samples = 1024;
  const data = new Uint8Array(samples * 4).fill(255);
  for (let i = 0; i < samples; i += 1) {
    const distance = Math.min(i, samples - 1 - i) / (samples - 1);
    const t = Math.min(1, distance / feather);
    data[i * 4 + 3] = Math.round(255 * t * t * (3 - 2 * t));
  }
  const source = new BufferImageSource({ resource: data, width: samples, height: 1, format: 'rgba8unorm' });
  const texture = new Texture({ source });
  const mask = parent.addChild(new Sprite({ texture, label: 'story-map-mask', x: left, eventMode: 'none' }));
  mask.width = w;
  mask.height = height;
  mask.once('destroyed', () => texture.destroy(true));
  art.setMask({ mask, channel: 'alpha' });
}

function sceneStrip(parent, texture, view, band, overlap, mirrored) {
  const strip = group(parent, 'art-band');
  const { left, w } = view;
  const slices = 18;
  const size = band + overlap;
  const original = texture.frame;
  const scale = size / original.height;
  const artWidth = left ? original.width * scale : w;
  const artLeft = left + (w - artWidth) / 2;
  const overlapPixels = Math.round(original.height * overlap / size);
  let previous = 0;
  for (let i = 0; i <= slices; i += 1) {
    const end = i === slices ? original.height : Math.round(overlapPixels * (i + 1) / slices);
    const from = previous;
    previous = end;
    const part = new Texture({
      source: texture.source,
      frame: new Rectangle(original.x, original.y + from, original.width, end - from),
    });
    strip.once('destroyed', () => part.destroy(false));
    const alpha = i === slices ? 1 : (i + .5) / slices;
    const sprite = strip.addChild(new Sprite({
      texture: part, label: i === slices ? 'map-tile' : 'palmera-bay-art', alpha, eventMode: 'none',
    }));
    if (left) {
      sprite.scale.set(scale);
    } else {
      sprite.width = w;
      sprite.height = size * (end - from) / original.height;
    }
    sprite.position.set(artLeft + (mirrored ? artWidth : 0), size * from / original.height);
    if (mirrored) sprite.scale.x *= -1;
  }
  return strip;
}

function missionPin(parent, controls, entry, pinX, mapWidth, mapLeft, reveal) {
  const size = clamp(mapWidth * .117, 42, 59);
  const radius = size / 2;
  const right = entry.x <= .5;
  const gap = 5;
  const available = (right ? mapLeft + mapWidth - pinX : pinX - mapLeft) - radius - 8 - gap;
  const labelWidth = Math.min(available, clamp(mapWidth * .33, 108, 172));
  const left = right ? pinX - radius : pinX - radius - labelWidth - gap;
  const nodeX = pinX - left;
  const titleSize = clamp(mapWidth / 32, 12, 16);
  const captionX = right ? size + gap : 0;
  const stateLabel = { play: 'Play', replay: 'Replay', locked: 'Locked' }[entry.status];
  const accent = { play: colors.aqua, replay: colors.gold, locked: 0xb6cae1 }[entry.status];
  const control = target(parent, controls, {
    id: `mission:${entry.id}`, name: `Mission ${entry.index + 1}, ${entry.title}, ${stateLabel}`,
    x: left, y: 0, w: size + gap + labelWidth, h: size,
    action: 'open', value: entry.id, enabled: entry.status !== 'locked', selected: entry.status === 'play', reveal,
  });
  control.status = entry.status;
  const node = control.node;
  panel(node, captionX, 1, labelWidth, size - 2, 0x10223c, 0x54728a, 8, .93);
  const title = text(node, entry.title, captionX + 7, 4, { size: titleSize, width: labelWidth - 14, label: 'mission-title' });
  if (title.height > size - 22) {
    title.style.fontSize = Math.max(10, titleSize - 2);
    title.style.lineHeight = Math.ceil(title.style.fontSize * 1.08);
  }
  text(node, stateLabel, captionX + 7, size - 16, { size: 10, color: accent });
  const circle = graphics(node, 'mission-pin');
  circle.circle(nodeX, radius + 3, radius).fill(0x08172e);
  if (entry.status === 'play') {
    circle.circle(nodeX, radius, radius + 4).fill({ color: colors.aqua, alpha: .30 });
  }
  circle.circle(nodeX, radius, radius - 1).fill(entry.status === 'locked' ? 0x405b76 : accent)
    .stroke({ color: entry.status === 'locked' ? 0xd7e9fc : colors.paper, width: 1.5 });
  circle.circle(nodeX, radius, radius - 5).stroke({ color: 0x263749, alpha: .55, width: 2 });
  text(node, String(entry.index + 1), nodeX, radius - .5, {
    size: size * .49, center: true, color: entry.status === 'locked' ? colors.paper : colors.ink, weight: '800',
  });
  if (entry.status === 'locked' || entry.status === 'replay') {
    const x = nodeX + radius * .66;
    const y = radius * 1.65;
    circle.circle(x, y, 8).fill(0x0b1d35);
    icon(node, entry.status === 'locked' ? 'lock' : 'check', x, y, 12, accent);
  }
  return { control, radius };
}

function districtPin(parent, x, width) {
  const node = group(parent, 'district:neon-strip', x, 0);
  const pin = graphics(node);
  pin.circle(0, 0, 19).fill(0x341633).stroke({ color: colors.pink, width: 2 });
  icon(node, 'lock', 0, 0, 18, colors.pink);
  panel(node, 24, -23, Math.min(200, width * .66), 46, 0x351c3d, 0xe980b1);
  text(node, 'NEON STRIP', 34, -18, { size: 15, color: 0xff99ca, weight: '800', label: 'district-name' });
  text(node, 'District locked · Unavailable', 34, 2, { size: clamp(width / 27, 10, 13), label: 'district-status' });
  return { node, radius: 0 };
}

function story(parent, textures, content, progress, view, controls, scroll) {
  const { width, height, left, w, header, navY } = view;
  const bands = Math.ceil(content.chapter.missions.length / stops.length);
  const band = Math.max(552, Math.round(w * 1.65), Math.ceil((height + 120) / bands));
  const overlap = clamp(w * .20, 62, 112);
  const dragArea = target(parent, controls, {
    id: 'story-map', name: 'Scrollable chapter map', x: left + 4, y: header,
    w: w - 8, h: Math.max(1, navY - header), role: 'region',
  });
  dragArea.node.eventMode = 'none';
  if (left) storyBackground(parent, textures.map, view);
  const art = group(parent, 'city-art');
  art.eventMode = 'none';
  if (left) featherMap(parent, art, view);
  const track = group(parent, 'winding-route');
  track.eventMode = 'none';
  const pins = group(parent, 'story-pins');
  const entries = content.chapter.missions.map((mission, index) => {
    const strip = bands - 1 - Math.floor(index / stops.length);
    const [x, y] = stops[index % stops.length];
    const status = index < progress.cleared.length ? 'replay' : index === progress.cleared.length ? 'play' : 'locked';
    return { id: mission.id, title: mission.title, index, x: strip % 2 ? 1 - x : x, y: (strip + y) * band, status };
  });
  const points = entries.map(entry => ({ x: entry.x, y: entry.y, order: entry.y / band }));
  const district = { x: .29, y: .064 * band, order: .064 };
  const first = points[0];
  const last = content.fixture ? points.at(-1) : district;
  const lowerPinY = Math.max(header + 31, Math.min(navY - 36, height * .71));
  const upperPinY = Math.min(navY - 40, Math.max(header + 44, height * .29));
  const min = Math.min(last.y - upperPinY, first.y - lowerPinY);
  const max = first.y - lowerPinY;
  // The overlapping art can extend to the viewport edges while the route ends at its pins.
  for (let strip = Math.floor(min / band); strip <= Math.floor((max + height) / band); strip += 1) {
    sceneStrip(art, textures.map, view, band, overlap, strip % 2 !== 0).y = strip * band;
  }
  if (!content.fixture) points.push(district);
  for (let b = 0; b < bands; b += 1) {
    points.push({ x: .37, y: b * band, order: b });
    for (const [x, y, order = y] of bends) points.push({ x: b % 2 ? 1 - x : x, y: (b + y) * band, order: b + order });
  }
  const route = points.filter(point => point.order >= last.order && point.order <= first.order);
  route.sort((a, b) => a.order - b.order);
  drawRoute(track, routePoints(route, left, w), w);
  const displays = entries.map(entry => {
    const reveal = () => {
      const index = entry.index;
      const backtrack = index > 0 ? entries[index - 1].y - entry.y : 0;
      const y = Math.max(header + 31, Math.min(lowerPinY, navY - 36 - backtrack));
      position(entry.y - y);
    };
    const { control, radius } = missionPin(pins, controls, entry, left + entry.x * w, w, left, reveal);
    return { ...entry, control, radius, node: control.node };
  });
  if (!content.fixture) {
    displays.push({ ...district, ...districtPin(pins, left + district.x * w, w) });
    const node = group(pins, 'chapter-sign', left + 10, 0);
    panel(node, 0, -12, 99, 24, 0x28233b, 0xc68d54, 6);
    text(node, content.chapter.title, 8, -8, { size: 12, color: colors.gold });
    displays.push({ node, y: (bands - 1 + .71) * band, radius: 0 });
  }
  fade(parent, 0, 0, width, Math.min(214, height * .31), 0x081223, [[0, 1], [.42, .88], [1, 0]]);
  fade(parent, 0, navY - 68, width, height - navY + 68, 0x071222, [[0, 0], [.53, .81], [1, 1]]);

  function position(next, initial = false) {
    const offset = clamp(next, min, max);
    if (!initial && offset === scroll.offset) return false;
    scroll.offset = offset;
    art.y = track.y = -scroll.offset;
    for (const strip of art.children) {
      const y = strip.y - scroll.offset;
      strip.visible = y <= height && y + band + overlap >= 0;
    }
    for (const { node, y, radius, control } of displays) {
      const screenY = y - scroll.offset;
      const opacity = clamp(Math.min((screenY - header + 23) / 37, (navY + 10 - screenY) / 33), 0, 1);
      node.y = screenY - radius;
      node.alpha = opacity;
      node.visible = opacity > 0;
      if (control?.enabled) {
        node.eventMode = screenY >= header + 2 && screenY <= navY - 2 ? 'static' : 'none';
      }
    }
    return true;
  }

  const old = { ...scroll };
  let offset = max;
  if (old.min !== null && old.offset !== old.max) {
    const fraction = (old.offset - old.min) / (old.max - old.min);
    offset = old.min === min && old.max === max ? old.offset : min + fraction * (max - min);
  }
  Object.assign(scroll, { min, max });
  position(offset, true);
  return { position };
}

function navigation(parent, phase, { left, w, navY }, controls) {
  const root = group(parent, 'main-navigation');
  const gap = 5;
  const margin = 9;
  const tile = (w - margin * 2 - gap * 3) / 4;
  for (const [i, [id, label]] of tabs.entries()) {
    const active = phase === id;
    const color = active ? colors.aqua : id === 'garage' ? 0x76dcdb : 0xe8b2df;
    const { node } = target(root, controls, {
      id: `nav:${id}`, name: label, action: id, x: left + margin + i * (tile + gap), y: navY,
      w: tile, h: 49, role: 'tab', selected: active,
    });
    panel(node, 0, 0, tile, 49, active ? 0x16384d : 0x11243e, active ? 0x58c0d4 : 0x4d6282, 8, .96);
    if (active) panel(node, tile * .31, 0, tile * .38, 2, colors.aqua);
    icon(node, id, tile / 2, 17, 19, color);
    text(node, label, tile / 2, 36, { size: clamp(tile / 7.6, 10, 14), center: true, color: active ? colors.aqua : colors.paper });
  }
}

const titles = { home: 'Palmera Bay', garage: 'Garage', shop: 'Shop', daily: 'Daily Missions' };

export function showMenu(parent, textures, content, phase, progress, size, controls, scroll) {
  const { width, height } = size;
  const w = Math.min(width, 720);
  const left = (width - w) / 2;
  const title = content.fixture && phase === 'home' ? content.chapter.title : titles[phase];
  const titleSize = content.fixture && phase === 'home' ? clamp(w * .06, 20, 35) : clamp(w * .077, 23, 48);
  const navY = height - 58;
  const complete = !content.fixture && progress.cleared.length === content.chapter.missions.length;
  const header = 68 + titleSize + (content.fixture ? 37 : complete ? 14 : 0);
  const view = { width, height, left, w, header, navY };
  let map;

  if (phase === 'home') {
    map = story(parent, textures, content, progress, view, controls, scroll);
  } else {
    graphics(parent, 'menu-backdrop').rect(0, 0, width, height).fill(0x101b35);
    fade(parent, 0, 0, width, height, 0x351f46, [[0, .65], [.55, .08], [1, .38]]);
    const detailX = (width - Math.min(w - 28, 520)) / 2;
    const detailW = width - detailX * 2;
    const detail = group(parent, 'menu-detail', detailX, 116);
    if (phase === 'garage') {
      for (const [i, id] of progress.ownedVehicleIds.entries()) {
        const vehicle = vehicles[id];
        const y = i * 76;
        panel(detail, 0, y, detailW, 66, 0x23344e, colors.edge);
        const preview = car(detail, vehicle, 'garage-vehicle');
        preview.position.set(31, y + 33);
        preview.scale.set(1.42);
        text(detail, vehicle.name, 59, y + 10, { size: 19, label: 'owned-vehicle' });
        text(detail, `Tier ${vehicle.tier} · ${vehicle.category} · ${vehicle.maxDamage} condition pips`, 59, y + 35, {
          size: 13, color: colors.faded, width: detailW - 69,
        });
      }
    } else {
      panel(detail, 0, 0, detailW, 104, 0x23344e, colors.edge);
      icon(detail, phase, detailW / 2, 31, 25, colors.aqua);
      text(detail, phase === 'shop' ? 'The Shop is currently unavailable.' : 'Daily Missions are currently unavailable.',
        detailW / 2, 66, { size: 15, center: true, color: colors.faded, label: 'unavailable' });
    }
  }

  const headerView = group(parent, 'menu-header', left + 13, 13);
  text(headerView, phase === 'home' ? 'Story' : 'Getaway Total Accident', 0, 0, {
    size: clamp(w * .034, 13, 19), color: phase === 'home' ? colors.faded : colors.pink,
  });
  const balance = money.format(progress.bank);
  const bankText = text(headerView, balance, 0, 0, { size: clamp(w * .047, 15, 23), color: colors.gold, label: 'bank-balance' });
  const bankW = bankText.width + 39;
  const bx = w - 26 - bankW;
  const wy = phase === 'home' && !content.fixture ? 12 : 3;
  const bankPanel = panel(headerView, bx, wy, bankW, 34, 0x251e35, 0xc18f49, 8, .97);
  headerView.setChildIndex(bankPanel, 0);
  icon(headerView, 'cash', bx + 15, wy + 17, 17, colors.gold);
  bankText.position.set(bx + 28, wy + (34 - bankText.height) / 2);
  const maxTitle = phase === 'home' && !content.fixture ? bx - 4 : w - 26;
  const label = text(headerView, phase === 'home' && !content.fixture ? title.toUpperCase() : title, 0,
    phase === 'home' && content.fixture ? 37 : 22, { size: titleSize, weight: '750', width: maxTitle, label: 'menu-title' });
  if (!content.fixture && label.height > titleSize * 1.34) {
    label.style.wordWrap = false;
    label.scale.set(Math.min(1, maxTitle / label.width));
  }
  if (phase === 'home') {
    const hintY = label.y + label.height + 9;
    panel(headerView, 0, hintY, complete ? Math.min(w - 26, 295) : 111, 22, 0x102438, 0x42697b, 7, .92);
    text(headerView, complete ? 'Chapter 1 complete. Replay any mission.' : 'Swipe to explore', 8, hintY + 3, { size: 12, color: colors.faded });
  }
  navigation(parent, phase, view, controls);
  return map;
}
