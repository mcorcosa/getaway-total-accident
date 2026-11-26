const sceneCache = new WeakMap();
const roofColors = ['#53636a', '#886e58', '#5c6465', '#795963'];

function surface(canvas, maxRatio = 2) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return null;
  const ratio = Math.min(maxRatio, window.devicePixelRatio || 1);
  const pixelsWide = Math.round(width * ratio);
  const pixelsTall = Math.round(height * ratio);
  if (canvas.width !== pixelsWide || canvas.height !== pixelsTall) {
    canvas.width = pixelsWide;
    canvas.height = pixelsTall;
  }
  const context = canvas.getContext('2d');
  context.setTransform(pixelsWide / width, 0, 0, pixelsTall / height, 0, 0);
  return { context, width, height };
}

function overlaps(a, b, margin = 0) {
  return a.x + a.width + margin > b.x && a.x - margin < b.x + b.width &&
    a.y + a.height + margin > b.y && a.y - margin < b.y + b.height;
}

function scenery(map) {
  if (sceneCache.has(map)) return sceneCache.get(map);
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
  const result = blocks.map((block, index) => ({ ...block, color: roofColors[index % roofColors.length] }));
  sceneCache.set(map, result);
  return result;
}

function rect(ctx, box, fill, grow = 0) {
  ctx.fillStyle = fill;
  ctx.fillRect(box.x - grow, box.y - grow, box.width + grow * 2, box.height + grow * 2);
}

function glow(ctx, x, y, radius, color) {
  const light = ctx.createRadialGradient(x, y, 0, x, y, radius);
  light.addColorStop(0, color);
  light.addColorStop(1, 'transparent');
  ctx.fillStyle = light;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function lamp(ctx, x, y) {
  glow(ctx, x, y, 17, '#fda34689');
  ctx.fillStyle = '#ffd38a';
  ctx.fillRect(x - 1.4, y - 1.4, 2.8, 2.8);
}

function paintBlock(ctx, block) {
  const { x, y, width, height } = block;
  rect(ctx, block, '#253c42', 5);
  rect(ctx, { x: x + 3, y: y + 5, width, height }, '#0c161d');
  rect(ctx, block, '#171d24');
  if (width < 7 || height < 7) return;
  rect(ctx, { x: x + 2, y: y + 2, width: width - 4, height: height - 5 }, block.color);
  ctx.fillStyle = '#bfb39a62';
  ctx.fillRect(x + 2, y + 2, width - 4, 1);
  ctx.fillRect(x + 2, y + 3, 1, height - 6);
  if (width > 22 && height > 14) {
    rect(ctx, { x: x + width * .66, y: y + height * .34, width: 7, height: 5 }, '#344146');
    rect(ctx, { x: x + width * .66, y: y + height * .34, width: 5, height: 3 }, '#7d8b8a');
  }
  if (width > 15) {
    ctx.fillStyle = '#f9ac55';
    ctx.fillRect(x + width * .28, y + height - 2, width * .36, 1.8);
    lamp(ctx, x + width * .13, y + height + 2);
  }
}

function paintWorld(ctx, map, view) {
  rect(ctx, view, '#10343c');
  ctx.lineWidth = .7;
  for (let y = Math.floor(view.y / 11) * 11; y < view.y + view.height; y += 11) {
    ctx.strokeStyle = Math.round(y / 11) % 3 ? '#528e8627' : '#55ada231';
    ctx.beginPath();
    for (let x = Math.floor(view.x / 38) * 38; x < view.x + view.width; x += 38) {
      const from = x + Math.abs((x * 3 + y * 17) % 21);
      ctx.moveTo(from, y);
      ctx.lineTo(from + 8 + Math.abs((x + y) % 11), y - 1);
    }
    ctx.stroke();
  }
  const roads = map.roads.filter(road => overlaps(road, view, 15));
  for (const road of roads) rect(ctx, road, '#7d786a', 5);
  for (const road of roads) rect(ctx, road, '#4c5353', 3);
  for (const road of roads) rect(ctx, road, '#222d36');
  ctx.save();
  ctx.beginPath();
  for (const road of roads) ctx.rect(road.x, road.y, road.width, road.height);
  ctx.clip();
  ctx.strokeStyle = '#9ea0a077';
  ctx.lineWidth = 1.3;
  ctx.setLineDash([10, 15]);
  ctx.beginPath();
  for (const road of roads) {
    const x = road.x + road.width / 2;
    const y = road.y + road.height / 2;
    if (road.width >= road.height) {
      ctx.moveTo(road.x, y);
      ctx.lineTo(road.x + road.width, y);
    } else {
      ctx.moveTo(x, road.y);
      ctx.lineTo(x, road.y + road.height);
    }
  }
  ctx.stroke();
  ctx.restore();
  for (const block of scenery(map)) {
    if (overlaps(block, view, 22)) paintBlock(ctx, block);
  }
}

function drawCar(ctx, point, vehicle, police = false) {
  const { length, width, color } = vehicle;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(point.heading);
  glow(ctx, length * .7, 0, length * .95, '#ffd59a41');
  if (police) glow(ctx, 0, 0, length, '#34a9e565');
  ctx.fillStyle = '#08121bcc';
  ctx.beginPath();
  ctx.roundRect(-length / 2 - 1, -width / 2 + 1.5, length + 3, width + 2, 4);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-length / 2, -width / 2, length, width, 3);
  ctx.fill();
  ctx.strokeStyle = '#ffffff66';
  ctx.lineWidth = .65;
  ctx.stroke();
  ctx.fillStyle = '#132537';
  ctx.fillRect(-length * .18, -width * .39, length * .42, width * .78);
  ctx.fillStyle = '#41516a';
  ctx.fillRect(-length * .12, -width * .36, length * .26, width * .72);
  ctx.fillStyle = '#fff1b2';
  ctx.fillRect(length * .39, -width * .37, 2, 2);
  ctx.fillRect(length * .39, width * .2, 2, 2);
  ctx.fillStyle = '#ff7669';
  ctx.fillRect(-length * .46, -width * .35, 1.5, 1.8);
  ctx.fillRect(-length * .46, width * .2, 1.5, 1.8);
  if (police) {
    ctx.fillStyle = '#ff4794';
    ctx.fillRect(-1.9, -width * .35, 3.8, width * .35);
    ctx.fillStyle = '#34e7e1';
    ctx.fillRect(-1.9, 0, 3.8, width * .35);
  }
  ctx.restore();
}

function symbol(ctx, x, y, kind, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#13192b';
  ctx.beginPath();
  if (kind === 'pickup') {
    ctx.rect(-6, -4, 12, 8);
    ctx.moveTo(-6, -4);
    ctx.lineTo(0, .6);
    ctx.lineTo(6, -4);
  } else {
    ctx.moveTo(-6, 5);
    ctx.lineTo(-6, -1);
    ctx.lineTo(0, -6);
    ctx.lineTo(6, -1);
    ctx.lineTo(6, 5);
    ctx.closePath();
    ctx.moveTo(-3, 5);
    ctx.lineTo(-3, 1);
    ctx.lineTo(3, 1);
    ctx.lineTo(3, 5);
  }
  ctx.stroke();
  ctx.restore();
}

function marker(ctx, point, kind) {
  const color = kind === 'pickup' ? '#ffd368' : '#34e7e1';
  ctx.strokeStyle = `${color}85`;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
  ctx.stroke();
  glow(ctx, point.x, point.y, 23, `${color}80`);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 10, 0, Math.PI * 2);
  ctx.fill();
  symbol(ctx, point.x, point.y, kind);
}

function screenMarker(ctx, target, kind, view, zoom, safe) {
  const x = (target.x - view.x) * zoom;
  const y = (target.y - view.y) * zoom;
  const { left, right, top, bottom } = safe;
  if (x >= left - .01 && x <= right + .01 && y >= top - .01 && y <= bottom + .01) return;
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const dx = x - centerX;
  const dy = y - centerY;
  const trim = Math.min((right - centerX) / (Math.abs(dx) || .001), (bottom - centerY) / (Math.abs(dy) || .001));
  const at = { x: centerX + dx * trim, y: centerY + dy * trim, radius: 12 };
  marker(ctx, at, kind);
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = kind === 'pickup' ? '#ffd368' : '#34e7e1';
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(14, -5);
  ctx.lineTo(14, 5);
  ctx.fill();
  ctx.restore();
}

const patrolCar = { length: 25, width: 13, color: '#b9d7ef' };

function trackAxis(desired, offset, min, max) {
  const minWithGoal = Math.max(min, min - offset);
  const maxWithGoal = Math.min(max, max - offset);
  if (minWithGoal <= maxWithGoal) return Math.min(maxWithGoal, Math.max(minWithGoal, desired));
  return Math.min(max, Math.max(min, desired));
}

export function driveFrame(width, height, player, goal, { hudBottom, footerTop }) {
  const zoom = Math.max(1.2, Math.min(2.25, Math.min(width * 1.6, height) / 365));
  const padding = Math.max(24, goal.radius * zoom + 4);
  const side = Math.min(Math.max(28, padding), width * .16);
  const safe = {
    left: side,
    right: width - side,
    top: Math.min(hudBottom + padding, height * .44),
    bottom: Math.max(footerTop - padding, height * .56),
  };
  const lead = 39 * zoom;
  const projectedX = (goal.x - player.x) * zoom;
  const projectedY = (goal.y - player.y) * zoom;
  const x = trackAxis(width / 2 - Math.cos(player.heading) * lead, projectedX, safe.left, safe.right);
  const y = trackAxis((safe.top + safe.bottom) / 2 - Math.sin(player.heading) * lead, projectedY, safe.top, safe.bottom);
  const view = { x: player.x - x / zoom, y: player.y - y / zoom, width: width / zoom, height: height / zoom };
  return { zoom, safe, view };
}

export function paintDrive(canvas, drive, overlays) {
  const size = surface(canvas);
  if (!drive || !size) return;
  const { context: ctx, width, height } = size;
  const { player, vehicle, map, patrol, segment: { objective } } = drive;
  const kind = objective.pickup && !drive.pickedUp ? 'pickup' : 'destination';
  const goal = kind === 'pickup' ? objective.pickup : objective.destination;
  const { zoom, safe, view } = driveFrame(width, height, player, goal, overlays);
  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(-view.x, -view.y);
  paintWorld(ctx, map, view);
  for (const [index, mark] of drive.skidMarks.entries()) {
    ctx.save();
    ctx.translate(mark.x, mark.y);
    ctx.rotate(mark.heading);
    ctx.fillStyle = `rgb(4 9 16 / ${.13 + .37 * index / drive.skidMarks.length})`;
    ctx.fillRect(-4, -4.2, 5, 1);
    ctx.fillRect(-4, 3.2, 5, 1);
    ctx.restore();
  }
  marker(ctx, goal, kind);
  if (patrol) drawCar(ctx, patrol, patrolCar, true);
  drawCar(ctx, player, vehicle);
  ctx.restore();
  screenMarker(ctx, goal, kind, view, zoom, safe);
}

export function paintInset(canvas, map, segment, vehicle) {
  const size = surface(canvas);
  if (!size) return;
  const { context: ctx, width, height } = size;
  const { spawn, objective } = segment;
  const focus = objective.pickup ?? objective.destination;
  const zoom = Math.min(width / (Math.abs(spawn.x - focus.x) + 100), height / (Math.abs(spawn.y - focus.y) + 86), 1.15);
  const view = {
    x: (spawn.x + focus.x) / 2 - width / (zoom * 2),
    y: (spawn.y + focus.y) / 2 - height / (zoom * 2),
    width: width / zoom,
    height: height / zoom,
  };
  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(-view.x, -view.y);
  paintWorld(ctx, map, view);
  marker(ctx, focus, objective.pickup ? 'pickup' : 'destination');
  if (segment.patrol) {
    const { startGap } = segment.patrol;
    drawCar(ctx, { x: spawn.x - Math.cos(spawn.heading) * startGap, y: spawn.y - Math.sin(spawn.heading) * startGap,
      heading: spawn.heading }, patrolCar, true);
  }
  drawCar(ctx, spawn, vehicle);
  ctx.restore();
}

export function paintDistrict(canvas, nodes) {
  const size = surface(canvas, 1.35);
  if (!size) return;
  const { context: ctx, width, height } = size;
  const bands = Math.max(4, Math.round(height / 186));
  const interval = height / bands;
  ctx.fillStyle = '#13424b';
  ctx.fillRect(0, 0, width, height);
  const columns = Math.max(5, Math.floor(width / 74));
  const step = width / columns;
  for (let row = -1; row <= bands; row += 1) {
    const pattern = (row + bands) % bands;
    const y = row * interval + 8;
    const thickness = interval * .68;
    const off = pattern % 2 ? step * .55 : 0;
    ctx.fillStyle = pattern % 3 ? '#27323b' : '#403840';
    ctx.fillRect(0, y, width, thickness);
    ctx.fillStyle = '#70665c';
    ctx.fillRect(0, y, width, 2);
    ctx.fillRect(0, y + thickness - 1, width, 2);
    for (let col = -1; col <= columns; col += 1) {
      const x = col * step + off + 5;
      paintBlock(ctx, {
        x, y: y + 8, width: step * .45 + ((col + 1) * 13 + pattern * 7) % 14,
        height: thickness * .59, color: roofColors[(col + 1 + pattern) % roofColors.length],
      });
    }
  }
  if (!nodes.length) return;
  const path = new Path2D();
  const seam = width * .43;
  const points = [{ x: seam, y: 0 }, ...nodes, { x: seam, y: height }];
  path.moveTo(seam, 0);
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const middle = (a.y + b.y) / 2;
    path.bezierCurveTo(a.x, middle, b.x, middle, b.x, b.y);
  }
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#102030';
  ctx.lineWidth = 17;
  ctx.stroke(path);
  ctx.strokeStyle = '#86e6dd';
  ctx.lineWidth = 5;
  ctx.setLineDash([1, 13]);
  ctx.stroke(path);
  ctx.setLineDash([]);
}
