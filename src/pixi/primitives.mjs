import { Container, FillGradient, Graphics, Rectangle, Sprite, Text } from '../../vendor/pixi.mjs';

export const colors = {
  night: 0x101c3a, paper: 0xfff2dc, faded: 0xc9daea, aqua: 0x34e7e1,
  pink: 0xff4fa7, gold: 0xffd368, ink: 0x19182e, edge: 0x647d9d,
};

export const money = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
});

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function group(parent, label, x = 0, y = 0) {
  const view = new Container({ label });
  view.position.set(x, y);
  parent.addChild(view);
  return view;
}

export function graphics(parent, label) {
  return parent.addChild(new Graphics({ label, eventMode: 'none' }));
}

export function panel(parent, x, y, w, h, fill, edge, radius = 10, alpha = 1) {
  const shape = graphics(parent).roundRect(x, y, w, h, radius).fill({ color: fill, alpha });
  if (edge !== undefined) shape.stroke({ color: edge, width: 1 });
  return shape;
}

export function fade(parent, x, y, w, h, color, stops, horizontal = false) {
  const fill = new FillGradient({
    start: { x: 0, y: 0 }, end: horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 },
    colorStops: stops.map(([offset, alpha]) => ({ offset, color: { r: color >> 16 & 255, g: color >> 8 & 255, b: color & 255, a: alpha } })),
  });
  const shape = graphics(parent).rect(x, y, w, h).fill(fill);
  // Graphics owns its geometry, while FillGradient owns a separate GPU texture.
  shape.once('destroyed', () => fill.destroy());
  return shape;
}

export function text(parent, value, x, y, {
  label, size = 16, color = colors.paper, weight = '700', width,
  align = 'left', center = false, family = 'Segoe UI, sans-serif', spacing = 0,
} = {}) {
  const display = new Text({
    label, text: value, eventMode: 'none',
    style: {
      fontFamily: family, fontSize: size, fill: color, fontWeight: weight,
      wordWrap: Boolean(width), wordWrapWidth: width, breakWords: Boolean(width), align,
      letterSpacing: spacing, lineHeight: Math.ceil(size * 1.16),
    },
  });
  if (center) display.anchor.set(.5);
  display.position.set(x, y);
  parent.addChild(display);
  return display;
}

export function art(parent, texture, x, y, w, h, { label, radius = 0, vertical = .5 } = {}) {
  const clip = graphics(parent, label && `${label}-clip`).roundRect(x, y, w, h, radius).fill(0xffffff);
  const sprite = parent.addChild(new Sprite({ texture, label, eventMode: 'none' }));
  const scale = Math.max(w / texture.width, h / texture.height);
  sprite.scale.set(scale);
  sprite.position.set(x + (w - sprite.width) / 2, y + (h - sprite.height) * vertical);
  sprite.mask = clip;
  return sprite;
}

export function icon(parent, name, x, y, size = 22, tint = colors.paper) {
  const g = graphics(parent, `icon:${name}`);
  g.position.set(x - size / 2, y - size / 2);
  g.scale.set(size / 24);
  switch (name) {
    case 'garage':
      g.moveTo(3, 21).lineTo(3, 10).lineTo(12, 3).lineTo(21, 10).lineTo(21, 21).closePath()
        .rect(7, 12, 10, 9).moveTo(7, 16.5).lineTo(17, 16.5);
      break;
    case 'shop':
      g.roundRect(4, 8, 16, 13, 2).moveTo(9, 8).lineTo(9, 4).lineTo(15, 4).lineTo(15, 8);
      break;
    case 'daily':
      g.roundRect(4, 5, 16, 15, 2).moveTo(4, 9).lineTo(20, 9).moveTo(8, 14).lineTo(10.5, 17).lineTo(16, 12);
      break;
    case 'home':
      g.moveTo(4, 6).lineTo(20, 6).moveTo(4, 12).lineTo(20, 12).moveTo(4, 18).lineTo(20, 18);
      break;
    case 'cash':
      g.roundRect(2, 6, 20, 12, 2).circle(12, 12, 2.5);
      break;
    case 'lock':
      g.roundRect(6, 10, 12, 10, 2).moveTo(9, 10).lineTo(9, 7).quadraticCurveTo(12, 1, 15, 7).lineTo(15, 10);
      break;
    case 'check':
      g.moveTo(5, 12).lineTo(10, 17).lineTo(19, 7);
      break;
    case 'left':
      g.moveTo(15, 5).lineTo(7, 12).lineTo(15, 19);
      break;
    case 'right':
      g.moveTo(9, 5).lineTo(17, 12).lineTo(9, 19);
      break;
    case 'brake':
      g.roundRect(4, 7, 16, 10, 3).moveTo(8, 12).lineTo(16, 12);
      break;
    case 'pause':
      return g.roundRect(6, 4, 4, 16, 1).roundRect(14, 4, 4, 16, 1).fill(tint);
    case 'play':
      return g.moveTo(8, 5).lineTo(19, 12).lineTo(8, 19).closePath().fill(tint);
    case 'destination':
      g.circle(12, 12, 7).circle(12, 12, 2.5)
        .moveTo(12, 1).lineTo(12, 5).moveTo(12, 19).lineTo(12, 23)
        .moveTo(1, 12).lineTo(5, 12).moveTo(19, 12).lineTo(23, 12);
      break;
    case 'pickup':
      g.roundRect(3, 6, 18, 12, 2).moveTo(4, 7).lineTo(12, 13).lineTo(20, 7);
      break;
    case 'damage':
      g.moveTo(7, 8).lineTo(14, 8).lineTo(16, 10).lineTo(19, 10).lineTo(19, 17)
        .lineTo(7, 17).lineTo(5, 15).lineTo(2, 15).lineTo(2, 11).lineTo(5, 11).closePath()
        .moveTo(9, 5).lineTo(15, 5).moveTo(22, 10).lineTo(22, 17);
      break;
    case 'heat':
      g.moveTo(13, 2).quadraticCurveTo(14, 7, 9, 11).quadraticCurveTo(7, 14, 10, 16)
        .quadraticCurveTo(11, 13, 14, 10).quadraticCurveTo(15, 13, 17, 15)
        .quadraticCurveTo(20, 12, 19, 10).quadraticCurveTo(25, 22, 12, 22)
        .quadraticCurveTo(0, 20, 6, 11).quadraticCurveTo(7, 9, 13, 2).closePath();
      break;
  }
  return g.stroke({ color: tint, width: 1.75, cap: 'round', join: 'round' });
}

export function target(parent, controls, {
  id, name, action, value, x, y, w, h, enabled = true, role = 'button',
  selected, expanded, reveal, drive, enter,
}) {
  const node = group(parent, id, x, y);
  node.hitArea = new Rectangle(0, 0, w, h);
  node.eventMode = enabled ? 'static' : 'none';
  node.interactiveChildren = false;
  node.cursor = enabled ? 'pointer' : 'default';

  const control = { node, id, name, action, value, enabled, role, selected, expanded, reveal, drive, enter };
  controls.push(control);
  return control;
}

export function button(parent, controls, spec) {
  const control = target(parent, controls, spec);
  const { node } = control;
  const { w, h, caption, glyph, primary, enabled = true, size = 15 } = spec;
  const tint = primary ? colors.ink : colors.paper;
  const base = primary === 'aqua' ? colors.aqua : primary === 'gold' ? colors.gold : primary ? colors.pink : 0x273c5d;
  panel(node, 0, 3, w, h, primary ? 0x422546 : 0x0a142c);
  panel(node, 0, 0, w, h, base, primary ? colors.paper : colors.edge);
  panel(node, 2, 2, w - 4, Math.max(6, h * .35), 0xffffff, undefined, 7, primary ? .15 : .06);
  if (glyph) icon(node, glyph, caption ? Math.min(20, w * .15) : w / 2, h / 2, caption ? 16 : 23, tint);
  if (caption) text(node, caption, w / 2 + (glyph ? 6 : 0), h / 2, { size, color: tint, center: true });
  if (!enabled) node.alpha = .5;
  return control;
}

export function clear(parent) {
  for (const item of parent.removeChildren()) item.destroy({ children: true, context: true });
}
