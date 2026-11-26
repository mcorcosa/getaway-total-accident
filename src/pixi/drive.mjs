import { RoundedRectangle } from '../../vendor/pixi.mjs';
import { button, clamp, colors, graphics, group, icon, panel, target, text } from './primitives.mjs';
import { liveWorld } from './world-view.mjs';

function hudBlock(root, label, x, y, w, h, tint, symbol) {
  const box = group(root, `hud:${label}`, x, y);
  panel(box, 0, 0, w, h, 0x101c36, 0x507496, 9, .97).label = `hud-panel:${label}`;
  panel(box, 7, 8, 27, 26, 0x182d48, 0x395574, 7);
  icon(box, symbol, 20.5, 21, 16, tint);
  text(box, label.toUpperCase(), 42, 5, { size: 9, color: tint, spacing: .5, weight: '800' });
  return box;
}

function pedalPad(shape) {
  return shape.moveTo(-13, -20).lineTo(13, -20).quadraticCurveTo(19, -20, 19, -14)
    .lineTo(17, 13).quadraticCurveTo(17, 18, 12, 19).lineTo(-11, 19)
    .quadraticCurveTo(-16, 19, -17, 13).lineTo(-19, -13)
    .quadraticCurveTo(-20, -20, -13, -20).closePath();
}

function showBrakePedal(pedal, width, height) {
  const center = width / 2;
  const faceY = height / 2 - 6;
  graphics(pedal).roundRect(center - 5, faceY + 12, 10, 13, 3)
    .fill({ color: 0x081019, alpha: .86 });
  const face = group(pedal, 'brake-face', center, faceY);
  face.rotation = .15;
  pedalPad(graphics(face)).fill({ color: 0x050e15, alpha: .72 }).y = 3;
  pedalPad(graphics(face)).fill({ color: 0x1c2c37, alpha: .91 })
    .stroke({ color: 0xa5b6c1, alpha: .76, width: 1.25 });
  const pressed = pedalPad(graphics(face, 'held:brake')).fill(0x583921)
    .stroke({ color: colors.gold, width: 1.6 });
  const treads = graphics(face, 'brake-treads');
  for (const y of [-12, -3, 6]) {
    treads.roundRect(-12, y, 10, 4, 1.5).roundRect(2, y, 10, 4, 1.5);
  }
  treads.fill(0xffffff);
  const caption = text(pedal, 'BRAKE', center, height - 5, {
    size: 10, color: 0xffffff, center: true, spacing: 1.1, weight: '800',
  });
  return held => {
    pressed.visible = held;
    face.y = faceY + (held ? 2 : 0);
    treads.tint = held ? 0xffcb85 : 0x90a9b7;
    caption.tint = held ? colors.gold : colors.faded;
  };
}

function showSteeringWheel(base, center) {
  const rim = center - 6;
  graphics(base).circle(center, center, center - 1.5).fill({ color: 0x091721, alpha: .72 });
  const wheel = group(base, 'steer-wheel', center, center);
  graphics(wheel).circle(0, 0, rim + 3).stroke({ color: 0x07121a, width: 6 });
  graphics(wheel).circle(0, 0, rim).stroke({ color: 0x537281, width: 5 });
  graphics(wheel).circle(0, 0, rim + 2).stroke({ color: 0x8faebb, alpha: .67, width: 1 });
  graphics(wheel).moveTo(-rim + 3, -14).quadraticCurveTo(-rim - 2, 0, -rim + 3, 14)
    .moveTo(rim - 3, -14).quadraticCurveTo(rim + 2, 0, rim - 3, 14)
    .stroke({ color: 0x9db5be, alpha: .72, width: 4, cap: 'round' });
  graphics(wheel).moveTo(-rim + 5, -7).lineTo(-13, -3).lineTo(0, 6).lineTo(13, -3).lineTo(rim - 5, -7)
    .moveTo(0, 6).lineTo(0, rim - 3)
    .stroke({ color: 0x637f8c, width: 5, cap: 'round', join: 'round' });
  const index = graphics(wheel).roundRect(-2, -rim - 3, 4, 10, 2).fill(0xffffff);

  graphics(base).circle(center, center, 12).fill(0x142a35)
    .stroke({ color: 0x6d8d9b, width: 1 });
  const shaft = graphics(base).rect(0, -2.5, 1, 5).fill(0xffffff);
  shaft.position.set(center, center);
  const thumb = group(base, 'steer-thumb', center, center);
  graphics(thumb).circle(0, 2, 14).fill({ color: 0x07121a, alpha: .9 });
  graphics(thumb).circle(0, 0, 13.5).fill(0x2d4854)
    .stroke({ color: 0xb0c9ce, width: 1.35 });
  const active = graphics(thumb).circle(0, 0, 13.5).fill(0x1b5960)
    .stroke({ color: colors.aqua, width: 1.7 });
  const grip = graphics(thumb).circle(0, 0, 8).fill(0x1a303a);
  for (const [x, y] of [[0, -4], [-4, 0], [4, 0], [0, 4]]) grip.circle(x, y, 1.3);
  grip.fill(0xb9d8d9);

  const centered = { x: 0, y: 0, steering: 0 };
  return ({ x, y, steering } = centered) => {
    const distance = Math.hypot(x, y);
    active.visible = steering !== 0;
    index.tint = active.visible ? colors.aqua : 0xc7d9dd;
    shaft.visible = distance > 0;
    shaft.scale.x = distance;
    shaft.rotation = Math.atan2(y, x);
    shaft.tint = active.visible ? colors.aqua : 0x88a7b4;
    wheel.rotation = steering * .65;
    thumb.position.set(center + x, center + y);
  };
}

function touchControls(parent, controls, width, bottom, stickSize, safeArea) {
  const footer = group(parent, 'driving-controls');
  const left = Math.max(12, safeArea.left + 8);
  const right = Math.max(12, safeArea.right + 8);
  const usable = width - left - right;
  const pedalWidth = clamp(usable * .24, 70, 92);
  const pedalHeight = 58;
  const { node: pedal } = target(footer, controls, {
    id: 'drive:brake', name: 'Brake', drive: 'brake', x: left, y: bottom - pedalHeight, w: pedalWidth, h: pedalHeight,
  });
  const drawBrake = showBrakePedal(pedal, pedalWidth, pedalHeight);

  const steer = target(footer, controls, {
    id: 'drive:steer', name: 'Steer left or right', x: width - right - stickSize, y: bottom - stickSize,
    w: stickSize, h: stickSize,
  });
  const center = stickSize / 2;
  steer.steeringTravel = center - 16;
  steer.node.hitArea = new RoundedRectangle(0, 0, stickSize, stickSize, center);
  steer.node.cursor = 'grab';
  const drawStick = showSteeringWheel(steer.node, center);

  return (held, offset) => {
    drawBrake(held.brake);
    drawStick(offset);
  };
}

function desktopControls(parent, controls, width, top, keyY) {
  const footer = group(parent, 'driving-controls');
  panel(footer, width / 2 - 228, top - 2, 456, 18, 0x0e1a32, undefined, 6, .9);
  text(footer, 'Steer with ← / → or A / D. Brake with Space, ↓ or S. Esc pauses.',
    width / 2, top + 7, { size: 12, center: true, color: colors.faded, label: 'drive-help' });
  const w = clamp((width - 38) / 3, 64, 110);
  const xPositions = [21, (width - w) / 2, width - w - 21];
  const holds = ['left', 'brake', 'right'].map((id, i) => {
    const names = { left: 'Steer left', brake: 'Brake', right: 'Steer right' };
    const control = button(footer, controls, {
      id: `drive:${id}`, name: names[id], caption: id === 'brake' ? 'Brake' : undefined,
      drive: id, glyph: id === 'brake' ? undefined : id, x: xPositions[i], y: keyY, w, h: 48,
    });
    const active = graphics(control.node, `held:${id}`).roundRect(1, 1, w - 2, 46, 9)
      .fill({ color: colors.aqua, alpha: .27 }).stroke({ color: colors.aqua, width: 2 });
    active.visible = false;
    return { id, active };
  });
  return held => {
    for (const { id, active } of holds) active.visible = held[id];
  };
}

export function showDrive(parent, drive, { width, height }, controls, { touch, safeArea }) {
  const world = group(parent, 'driving-world');
  const hud = group(parent, 'driving-hud');
  const targets = controls ?? [];
  const compact = width < 680;
  const gutter = compact ? 8 : 18;
  const gap = 6;
  const usable = width - gutter * 2;
  const row = 43;
  const barWidth = Math.min(usable, 840);
  const left = (width - barWidth) / 2;
  const pauseW = 47;
  const objectiveW = compact ? barWidth - pauseW - gap : Math.floor(barWidth * .5);
  const meterW = compact ? (barWidth - gap) / 2 : (barWidth - objectiveW - pauseW - gap * 3) / 2;
  const meterY = gutter + (compact ? row + gap : 0);
  const meterX = left + (compact ? 0 : objectiveW + gap);
  const objective = hudBlock(hud, 'Objective', left, gutter, objectiveW, row, colors.gold, 'destination');
  const marker = objective.getChildByLabel('icon:destination');
  const pickup = icon(objective, 'pickup', 20.5, 21, 16, colors.gold);
  const objectiveText = text(objective, '', 42, 19, {
    size: compact ? 13 : 15, width: objectiveW - 48, label: 'objective-text',
  });
  const incidentText = text(objective, '', 42, 30, {
    size: compact ? 10 : 11, color: 0xffca9a, label: 'objective-incident',
  });
  incidentText.visible = false;
  const damage = hudBlock(hud, 'Car damage', meterX, meterY, meterW, row, colors.aqua, 'damage');
  const heat = hudBlock(hud, 'Heat', meterX + meterW + gap, meterY, meterW, row, 0xff9cd0, 'heat');
  const pips = Array.from({ length: drive.vehicle.maxDamage }, (_, i) => {
    const span = Math.min(15, (meterW - 49) / drive.vehicle.maxDamage);
    return graphics(damage, `condition:${i}`).roundRect(42 + i * span, 22, span - 2.5, 9, 2.5);
  });
  const stars = Array.from({ length: 5 }, (_, i) => {
    const span = Math.min(18, (meterW - 47) / 5);
    return graphics(heat, `heat-star:${i}`).star(48 + i * span, 26, 5, Math.min(6, span * .45), Math.min(3, span * .23));
  });
  button(hud, targets, {
    id: 'drive:pause', name: 'Pause', action: 'pause', glyph: 'pause', x: left + barWidth - pauseW, y: gutter, w: pauseW, h: row,
  });

  const keyY = height - 20 - 48;
  const stickSize = clamp(width * .27, 94, 110);
  const touchBottom = height - Math.max(14, (safeArea?.bottom ?? 0) + 10);
  const footerTop = touch ? touchBottom - stickSize : keyY - 23;
  let drawControls;
  if (touch && controls) {
    drawControls = touchControls(parent, targets, width, touchBottom, stickSize, safeArea);
  } else if (!touch) {
    drawControls = desktopControls(parent, targets, width, footerTop, keyY);
  }
  const drawScene = liveWorld(world, drive, width, height, { hudBottom: meterY + row, footerTop });
  let lastDamage;
  let lastHeat;
  let lastObjective;
  let lastIncident;
  return (held, offset) => {
    drawScene();
    const collecting = Boolean(drive.segment.objective.pickup && !drive.pickedUp);
    marker.visible = !collecting;
    pickup.visible = collecting;
    const goal = collecting ? 'Pick up the package' : 'Reach the marker';
    if (goal !== lastObjective) {
      objectiveText.text = goal;
      lastObjective = goal;
    }
    const incident = drive.incidentTime > 0 ? drive.incident : '';
    if (incident !== lastIncident) {
      incidentText.text = incident;
      incidentText.visible = Boolean(incident);
      objectiveText.y = incident ? 14 : 19;
      objectiveText.style.fontSize = incident ? (compact ? 12 : 13) : (compact ? 13 : 15);
      objectiveText.style.lineHeight = incident ? 15 : compact ? 16 : 18;
      if (incident) {
        incidentText.scale.x = 1;
        incidentText.scale.x = Math.min(1, (objectiveW - 48) / incidentText.width);
      }
      lastIncident = incident;
    }
    if (lastDamage !== drive.damage) {
      // Reapply paths when the fill changes so there is one real pip object per condition point.
      for (const [i, shape] of pips.entries()) {
        const span = Math.min(15, (meterW - 49) / pips.length);
        shape.clear().roundRect(42 + i * span, 22, span - 2.5, 9, 2.5)
          .fill(i < drive.damage ? colors.aqua : 0x273752).stroke({ color: 0x42738a, width: .7 });
      }
      lastDamage = drive.damage;
    }
    const level = drive.patrol ? 1 : 0;
    if (lastHeat !== level) {
      for (const [i, shape] of stars.entries()) {
        const span = Math.min(18, (meterW - 47) / 5);
        shape.clear().star(48 + i * span, 26, 5, Math.min(6, span * .45), Math.min(3, span * .23))
          .fill(i < level ? colors.pink : 0x22314d).stroke({ color: i < level ? 0xffb7d8 : 0x7585a2, width: .85 });
      }
      lastHeat = level;
    }
    drawControls?.(held, offset);
  };
}
