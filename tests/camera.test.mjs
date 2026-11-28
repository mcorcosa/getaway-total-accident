import assert from 'node:assert/strict';
import { test } from 'node:test';
import { driveFrame } from '../src/renderer.mjs';

const phone = { width: 320, height: 568, hudBottom: 100, footerTop: 496 };

test('changing the objective and ring radius at the same car pose leaves the camera in place', () => {
  const car = { x: 318, y: 1660, heading: Math.PI };
  const pickup = { x: 300, y: 1660, radius: 18 };
  const destination = { x: 128, y: 1520, radius: 24 };
  const frame = goal => driveFrame(phone.width, phone.height, car, goal, phone);
  assert.deepEqual(frame(pickup).view, frame(destination).view);
  assert.deepEqual(frame(pickup).view, frame({ ...pickup, radius: 36 }).view);
});

test('at a constant heading each northbound driving step moves the camera by the car displacement', () => {
  const goal = { x: 128, y: 224, radius: 24 };
  const rows = [phone, { width: 390, height: 600, hudBottom: 100, footerTop: 528 },
    { width: 1200, height: 800, hudBottom: 61, footerTop: 709 }];
  for (const { width, height, ...overlay } of rows) {
    const frame = y => driveFrame(width, height, { x: 128, y, heading: -Math.PI / 2 }, goal, overlay);
    for (let y = 540; y > goal.y + goal.radius; y -= 2) {
      const previous = frame(y);
      const current = frame(y - 2);
      assert.ok(Math.abs(current.view.y - previous.view.y + 2) < 1e-9,
        `${width}×${height} at y=${y}: camera moved ${(current.view.y - previous.view.y) * current.zoom} px`);
    }
  }
});
