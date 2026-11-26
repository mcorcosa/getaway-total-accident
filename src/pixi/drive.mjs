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

function thumbCap(shape) {
  return shape.moveTo(-10, -15).lineTo(10, -15).quadraticCurveTo(14, -15, 16, -10)
    .quadraticCurveTo(20, 0, 16, 9).quadraticCurveTo(14, 14, 10, 14).lineTo(-10, 14)
    .quadraticCurveTo(-14, 14, -16, 9).quadraticCurveTo(-20, 0, -16, -10)
    .quadraticCurveTo(-14, -15, -10, -15).closePath();
}

function showSteeringStick(track, width, height) {
  const center = width / 2;
  const axisY = height / 2;
  const railY = axisY + 4;
  graphics(track).moveTo(24, railY).lineTo(width - 24, railY)
    .stroke({ color: 0x07121b, alpha: .64, width: 10, cap: 'round' });
  graphics(track).moveTo(26, railY).lineTo(width - 26, railY)
    .stroke({ color: 0x90a7b4, alpha: .55, width: 1.25, cap: 'round' });
  graphics(track).ellipse(center, railY, 13, 10).fill({ color: 0x0b1922, alpha: .79 })
    .stroke({ color: 0x78939f, alpha: .72, width: 1 });
  const throwBar = graphics(track).rect(0, -2, 1, 4).fill(0xffffff);
  throwBar.position.set(center, railY);
  const left = icon(track, 'left', 9, axisY, 24, 0xffffff);
  const right = icon(track, 'right', width - 9, axisY, 24, 0xffffff);

  const thumb = group(track, 'steer-thumb', center, axisY);
  thumbCap(graphics(thumb)).fill({ color: 0x07121a, alpha: .91 }).y = 3;
  thumbCap(graphics(thumb)).fill(0x283e49)
    .stroke({ color: 0xa8c0c7, alpha: .94, width: 1.35 });
  const engaged = thumbCap(graphics(thumb)).fill(0x18555d)
    .stroke({ color: colors.aqua, width: 1.7 });
  const grip = graphics(thumb).ellipse(0, 0, 10, 7).fill({ color: 0x101f29, alpha: .64 });
  for (const x of [-5, 0, 5]) grip.circle(x, 0, 1.35);
  grip.fill(0xb9d8d9);

  return (held, offset) => {
    const leftActive = offset < 0 && held.left;
    const rightActive = offset > 0 && held.right;
    engaged.visible = leftActive || rightActive;
    left.tint = leftActive ? colors.aqua : colors.faded;
    right.tint = rightActive ? colors.aqua : colors.faded;
    throwBar.visible = offset !== 0;
    throwBar.scale.x = offset;
    throwBar.tint = engaged.visible ? colors.aqua : 0x819fae;
    thumb.x = center + offset;
  };
}

function touchControls(parent, controls, width, top, height, safeArea) {
  const footer = group(parent, 'driving-controls');
  const left = Math.max(12, safeArea.left + 8);
  const right = Math.max(12, safeArea.right + 8);
  const usable = width - left - right;
  const pedalWidth = clamp(usable * .24, 70, 92);
  const { node: pedal } = target(footer, controls, {
    id: 'drive:brake', name: 'Brake', drive: 'brake', x: left, y: top, w: pedalWidth, h: height,
  });
  const drawBrake = showBrakePedal(pedal, pedalWidth, height);

  const stickWidth = clamp(usable * .48, 116, 196);
  const steer = target(footer, controls, {
    id: 'drive:steer', name: 'Steer left or right', x: width - right - stickWidth, y: top, w: stickWidth, h: height,
  });
  const { node: track } = steer;
  steer.steeringTravel = stickWidth / 2 - 31;
  track.cursor = 'ew-resize';
  const drawStick = showSteeringStick(track, stickWidth, height);

  return (held, offset) => {
    drawBrake(held.brake);
    drawStick(held, offset);
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
  const touchHeight = 58;
  const footerTop = touch ? height - Math.max(14, safeArea.bottom + 10) - touchHeight : keyY - 23;
  let drawControls;
  if (touch && controls) {
    drawControls = touchControls(parent, targets, width, footerTop, touchHeight, safeArea);
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
