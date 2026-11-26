import { Sprite, Texture, TilingSprite } from '/vendor/pixi.mjs';

export const waterColor = 0x071e29;

const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const fraction = value => value - Math.floor(value);

function random(seed) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function noise(x, y, columns, rows, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const at = (col, row) => {
    const a = (col % columns + columns) % columns;
    const b = (row % rows + rows) % rows;
    const n = Math.imul(a + 31, 374761393) ^ Math.imul(b + seed, 668265263);
    return ((Math.imul(n ^ (n >>> 13), 1274126177) ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const t = smooth(fraction(x));
  return mix(mix(at(ix, iy), at(ix + 1, iy), t), mix(at(ix, iy + 1), at(ix + 1, iy + 1), t), smooth(fraction(y)));
}

function texture(width, height, draw, repeat = false) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'));
  const result = Texture.from(canvas, true);
  if (repeat) result.source.addressMode = 'repeat';
  return result;
}

function wavelets(ctx, size, highlights) {
  const rand = random(highlights ? 127 : 408);
  for (let i = 0; i < 4100; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const patch = noise(x / size * 21, y / size * 29, 21, 29, 97);
    if (rand() > .28 + patch * .65) continue;
    const length = 1.4 + rand() ** 2.7 * (8 + patch * 5);
    const skew = (rand() - .5) * length * .36;
    const tint = rand();
    const alpha = (.10 + rand() ** 2 * .33) * (.30 + patch * .70) * (highlights ? .61 : 1);
    ctx.strokeStyle = `rgba(${15 + Math.round(tint * 23)},${78 + Math.round(tint * 46)},${91 + Math.round(tint * 39)},${alpha})`;
    ctx.lineWidth = .46 + rand() * .73;
    const xOffsets = x + length > size ? [0, -size] : [0];
    const yOffsets = y + skew > size ? [0, -size] : y + skew < 0 ? [0, size] : [0];
    for (const dx of xOffsets) {
      for (const dy of yOffsets) {
        ctx.beginPath();
        ctx.moveTo(x + dx, y + dy);
        ctx.quadraticCurveTo(x + dx + length * .43, y + dy + skew * .24, x + dx + length, y + dy + skew);
        ctx.stroke();
      }
    }
  }
}

function seaTexture(highlights) {
  const size = 512;
  return texture(size, size, ctx => {
    const image = ctx.createImageData(size, size);
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const x = col / size;
        const y = row / size;
        const depth = noise(x * 5, y * 5, 5, 5, 76);
        const swell = noise(x * 8, y * 14, 8, 14, 41);
        const chop = noise(x * 25, y * 48, 25, 48, 21);
        const breakup = noise(x * 41, y * 67, 41, 67, 53);
        const facets = noise(x * 109, y * 137, 109, 137, 63);
        const crest = Math.max(0, Math.cos(Math.PI * 2 * (y * 51 + x * 3 + swell * 1.65 + chop * .63)));
        const ripple = Math.max(0, Math.cos(Math.PI * 2 * (y * 97 - x * 4 + chop * 1.55 + depth * 1.3)));
        const ridges = crest ** 5 * Math.max(0, (breakup + chop) * .94 - .55);
        const detail = ripple ** 5 * breakup * chop;
        const brightEdges = Math.max(0, (facets + chop) * .92 - .95) * (.13 + ridges + detail);
        const i = (row * size + col) * 4;
        if (highlights) {
          const glint = ridges * Math.max(0, (swell + breakup) * 1.35 - .85);
          image.data.set([54, 142, 144, 48 * glint + 29 * detail + 62 * brightEdges], i);
        } else {
          const body = 7 * depth + 5 * swell + 8 * chop;
          const foam = ridges * 14 + detail * 19 + brightEdges * 49;
          image.data.set([3 + body * .31 + foam * .33, 18 + body * 1.39 + foam, 26 + body * 1.55 + foam * .92, 255], i);
        }
      }
    }
    ctx.putImageData(image, 0, 0);
    wavelets(ctx, size, highlights);
  }, true);
}

function grainTexture(roof = false) {
  const size = 128;
  return texture(size, size, ctx => {
    const image = ctx.createImageData(size, size);
    const rand = random(819);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const mottle = noise(x / 16, y / 16, 8, 8, 24);
        const speckle = noise(x / 3.2, y / 3.2, 40, 40, 43);
        const brightness = Math.round(roof ? 169 + 43 * mottle + 33 * speckle + 10 * rand() :
          191 + 14 * mottle + 20 * speckle + 30 * rand());
        image.data.set([brightness, brightness, brightness, 255], (y * size + x) * 4);
      }
    }
    ctx.putImageData(image, 0, 0);
  }, true);
}

function paversTexture() {
  return texture(64, 64, ctx => {
    const rand = random(4);
    ctx.fillStyle = '#9e9993';
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 16) {
      for (let x = 0; x < 64; x += 16) {
        const shade = Math.floor(167 + rand() * 42);
        ctx.fillStyle = `rgb(${shade + 4} ${shade} ${shade - 2})`;
        ctx.fillRect(x + .7, y + .7, 15.1, 15.1);
        ctx.fillStyle = 'rgba(225,218,204,.23)';
        ctx.fillRect(x + .7, y + .7, 14.6, .8);
        ctx.fillRect(x + .7, y + 1.5, .8, 14.2);
        for (let i = 0; i < 55; i += 1) {
          ctx.fillStyle = rand() > .5 ? 'rgba(220,218,211,.24)' : 'rgba(91,82,76,.19)';
          ctx.fillRect(x + 1 + rand() * 14, y + 1 + rand() * 14, 1, 1);
        }
      }
    }
  }, true);
}

function glowTexture() {
  return texture(128, 128, ctx => {
    const light = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [stop, alpha] of [[0, .94], [.11, .76], [.28, .40], [.50, .15], [.77, .035], [1, 0]]) {
      light.addColorStop(stop, `rgba(255,255,255,${alpha})`);
    }
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, 128, 128);
  });
}

function wetTexture() {
  const size = 110;
  const center = size / 2;
  return texture(size, size, ctx => {
    const rand = random(55);
    for (let i = 0; i < 3100; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const radius = Math.hypot((x - center) / center, (y - center) / center);
      if (radius >= .96) continue;
      const alpha = (1 - radius) ** 2.5 * (.15 + rand() * .49);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(x, y, .5 + rand() ** 2 * 2.1, .5 + rand() * 1.7);
    }
  });
}

function reflectionTexture(edge, variation) {
  const size = 128;
  const center = size / 2;
  return texture(size * 2, size * 2, ctx => {
    ctx.scale(2, 2);
    const rand = random(73 + edge * 191 + variation * 273);
    const offsets = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const [dx, dy] = offsets[edge];
    const reach = variation ? 43 : 38;
    for (let i = 0; i < 315; i += 1) {
      const distance = .8 + reach * rand() ** 1.65;
      const drift = Math.sin(distance * .32 + edge * 2 + variation) * (1.4 + distance * .045);
      const spread = drift + (rand() - rand()) * (7 + distance * .31);
      const outward = distance + 3.7;
      const x = center + dx * outward + dy * spread;
      const y = center + dy * outward + dx * spread;
      const width = .95 + rand() ** 2.4 * (3.9 + distance * .048);
      const thickness = .39 + rand() ** 2 * .83;
      const falloff = Math.exp(-distance / (variation ? 13 : 11));
      const core = Math.max(0, 1 - Math.abs(spread - drift) / (4.5 + distance * .1));
      const alpha = Math.min(.95, (.21 + rand() ** 1.3 * .73 + core * core * .18) * falloff * (.68 + .32 * core));
      ctx.fillStyle = `rgba(255,${149 + Math.floor(rand() * 73 + core * 26)},${66 + Math.floor(rand() * 54 + core * 18)},${alpha})`;
      ctx.beginPath();
      ctx.moveTo(x - width * .52, y);
      ctx.lineTo(x - width * .14, y - thickness * .42);
      ctx.lineTo(x + width * .54, y + (rand() - .55) * thickness);
      ctx.lineTo(x + width * .19, y + thickness * .59);
      ctx.closePath();
      ctx.fill();
    }
  });
}

function palmTexture(seed) {
  return texture(96, 96, ctx => {
    const rand = random(seed);
    ctx.lineCap = 'round';
    for (let i = 0; i < 10; i += 1) {
      const angle = (i + rand() * .65) * Math.PI / 5;
      const length = 18 + rand() * 23;
      const bend = 6 + rand() * 13;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const at = (t, side) => {
        const a = t * length;
        const b = t * t * bend + side;
        return [48 + a * c - b * s, 46 + a * s + b * c];
      };
      const olive = i % 3 === 0;
      ctx.strokeStyle = olive ? '#7b722e' : '#4b5e35';
      ctx.lineWidth = 1.55;
      ctx.beginPath();
      ctx.moveTo(...at(0, 0));
      ctx.quadraticCurveTo(...at(.5, -bend * .25), ...at(1, 0));
      ctx.stroke();
      for (let j = 2; j < 12; j += 1) {
        const t = j / 12;
        for (const side of [-1, 1]) {
          const leaf = (5 + rand() * 5) * Math.sin(t * Math.PI) * side;
          ctx.strokeStyle = side > 0 ? '#293c27' : olive ? '#a4974d' : '#62794a';
          ctx.lineWidth = .72 + rand() * .76;
          ctx.beginPath();
          ctx.moveTo(...at(t, 0));
          ctx.quadraticCurveTo(...at(t + .07, leaf * .5), ...at(t + .13, leaf));
          ctx.stroke();
        }
      }
    }
    ctx.fillStyle = '#75663d';
    ctx.beginPath();
    ctx.arc(48, 46, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Shared GPU textures survive scene reconstruction on pause and resize.
let shared;
export function materials() {
  if (!shared) {
    shared = {
      water: seaTexture(false), shimmer: seaTexture(true), grain: grainTexture(), roof: grainTexture(true), pavers: paversTexture(),
      glow: glowTexture(), wet: wetTexture(),
      reflections: [0, 1, 2, 3].map(edge => [reflectionTexture(edge, 0), reflectionTexture(edge, 1)]),
      palms: [17, 49, 182].map(palmTexture),
    };
  }
  return shared;
}

export function sprite(parent, texture, x, y, width, height, options = {}) {
  return parent.addChild(new Sprite({ texture, x, y, width, height, anchor: .5, eventMode: 'none', ...options }));
}

export function light(parent, x, y, width, height, tint, alpha, rotation = 0) {
  return sprite(parent, materials().glow, x, y, width, height, { tint, alpha, rotation });
}

export function waterSurface(parent) {
  const { water, shimmer } = materials();
  const layer = (label, texture, scaleX, scaleY) => {
    const tiles = parent.addChild(new TilingSprite({ label, texture, eventMode: 'none' }));
    tiles.tileScale.set(scaleX, scaleY);
    return tiles;
  };
  const body = layer('canal-water', water, .64, .58);
  const ripples = layer('canal-shimmer', shimmer, .81, .73);
  const align = (tiles, view, driftX, driftY) => {
    tiles.position.set(view.x - 1, view.y - 1);
    tiles.width = view.width + 2;
    tiles.height = view.height + 2;
    tiles.tilePosition.set(1 - view.x + driftX, 1 - view.y + driftY);
  };
  return (view, time) => {
    align(body, view, 0, 0);
    align(ripples, view, 2.1 * time, -1.7 * time);
    ripples.alpha = .8 + .12 * Math.sin(time * 1.32);
  };
}
