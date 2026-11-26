import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadContent } from '../src/content-loader.mjs';
import { createGame } from '../src/game-state.mjs';
import { driveFrame } from '../src/renderer.mjs';
import { progressStore } from '../src/save.mjs';
import { NEUTRAL_INPUT } from '../src/simulation.mjs';
import { distance } from '../src/world.mjs';

const authoredContent = () => loadContent({
  fetcher: async url => new Response(await readFile(url)),
});

// These are the Level Design author's validated routes for the authored map.
const [northwest, northeast, southwest, southeast, junction] =
  [[128, 128], [448, 128], [128, 448], [448, 448], [288, 448]].map(([x, y]) => ({ x, y }));
const mainTurns = new Map([
  [4, [northwest]], [5, [northeast]], [6, [northeast]], [7, [junction, southwest, northwest]],
  [9, [northwest]], [11, [northwest]], [12, [southwest]], [13, [southwest]],
  [14, [northeast]], [15, [northeast]], [16, [junction, southwest, northwest]], [18, [northwest]],
  [19, [southeast]], [20, [northwest]], [21, [northwest]],
]);
const bonusTurns = new Map([
  [9, [northwest]], [10, [northwest]], [11, [northwest]], [12, [southwest]], [13, [southwest]],
  [14, [northeast]], [15, [northeast]], [16, [northwest]], [17, [northwest]], [18, [northwest]], [19, [southeast]],
]);

function guide(path) {
  const legs = [];
  let length = 0;
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1];
    const to = path[index];
    const span = distance(from, to);
    legs.push({ from, start: length, span, x: to.x - from.x, y: to.y - from.y });
    length += span;
  }
  const turns = legs.slice(1).map(leg => leg.start);
  const pointAlong = (leg, fraction) => ({ x: leg.from.x + fraction * leg.x, y: leg.from.y + fraction * leg.y });
  let covered = 0;
  return player => {
    let nearest = covered;
    let error = Infinity;
    for (const leg of legs) {
      const dot = (player.x - leg.from.x) * leg.x + (player.y - leg.from.y) * leg.y;
      const fraction = Math.max(0, Math.min(1, dot / leg.span ** 2));
      const offset = leg.start + fraction * leg.span;
      const gap = distance(player, pointAlong(leg, fraction));
      if (offset >= covered - 15 && gap < error) {
        nearest = offset;
        error = gap;
      }
    }
    covered = Math.max(covered, nearest);
    const lookAhead = Math.min(length, covered + 32);
    const leg = legs.find(leg => leg.start + leg.span >= lookAhead) ?? legs.at(-1);
    const target = pointAlong(leg, (lookAhead - leg.start) / leg.span);
    const angle = Math.atan2(target.y - player.y, target.x - player.x) - player.heading;
    const turn = Math.atan2(Math.sin(angle), Math.cos(angle));
    const nearBend = turns.some(offset => offset - covered < 63 && offset - covered > -18);
    return { left: turn < -.035, right: turn > .035, brake: nearBend && player.speed > 80 };
  };
}

function followRoute(game, turns, neutral, label) {
  const { drive } = game.state.run;
  const path = [drive.segment.spawn, ...turns, drive.segment.objective.destination];
  const nextInput = neutral ? () => NEUTRAL_INPUT : guide(path);
  for (let i = 0; i < 1_200 && game.state.phase === 'driving'; i += 1) {
    game.tick(nextInput(drive.player));
  }
  assert.equal(drive.outcome?.kind, 'success', `${label} did not clear`);
  assert.equal(drive.pickedUp, Boolean(drive.segment.objective.pickup), `${label} pickup`);
  assert.equal(drive.damage, drive.vehicle.maxDamage, `${label} damage`);
}

test('the authored chapter loads through the standard loader and all three opening jobs clear without steering or braking', async () => {
  const content = await authoredContent();
  const storage = { getItem: () => null, setItem: () => {} };
  const store = progressStore(content.chapter, { getStorage: () => storage });
  const game = createGame(content, store);
  let bank = 0;
  for (const mission of content.chapter.missions.slice(0, 3)) {
    assert.equal(game.dispatch('open', mission.id), true);
    assert.equal(game.dispatch('start'), true, `${mission.id} does not have a usable starter car`);
    const target = mission.objective.destination;
    const { view, zoom } = driveFrame(320, 568, mission.spawn, target, { hudBottom: 112, footerTop: 483 });
    const targetX = (target.x - view.x) * zoom;
    const targetY = (target.y - view.y) * zoom;
    const ring = target.radius * zoom;
    assert.ok(targetX > 24 && targetX < 296 && targetY > 125 && targetY < 470,
      `${mission.id} starts with its target outside the unobstructed compact playfield`);
    assert.ok(targetY - ring > 112 && targetY + ring < 483,
      `${mission.id} starts with its target ring under a compact overlay`);
    for (let i = 0; i < 1_800 && game.state.phase === 'driving'; i += 1) game.tick(NEUTRAL_INPUT);
    assert.equal(game.state.phase, 'success', `${mission.id} did not finish with neutral input`);
    assert.equal(game.state.run.damage, game.state.run.drive.vehicle.maxDamage);
    game.dispatch('bank');
    bank += mission.payout;
    assert.equal(game.state.progress.bank, bank);
  }
});

test('all 21 authored mains and bonuses clear with steering and braking through an uninterrupted campaign', async () => {
  const content = await authoredContent();
  const records = new Map();
  const storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
  const getStorage = () => storage;
  const store = progressStore(content.chapter, { getStorage });
  const game = createGame(content, store);
  let bank = 0;

  for (const [index, mission] of content.chapter.missions.entries()) {
    const order = index + 1;
    assert.equal(game.dispatch('open', mission.id), true, mission.id);
    assert.equal(game.dispatch('start'), true, mission.id);
    followRoute(game, mainTurns.get(order) ?? [], order <= 3, `${mission.id} main`);
    assert.equal(game.state.phase, 'success');
    assert.equal(game.state.progress.cleared.at(-1), mission.id);
    assert.equal(game.state.progress.bank, bank);
    assert.equal(game.state.run.haul, mission.payout);

    assert.equal(game.dispatch('bonus'), true);
    assert.equal(game.dispatch('start'), true);
    followRoute(game, bonusTurns.get(order) ?? [], order <= 8, `${mission.id} bonus`);
    bank += mission.payout + mission.bonus.payout;
    assert.equal(game.state.phase, 'home');
    assert.equal(game.state.progress.bank, bank);
  }

  const reloaded = createGame(content, progressStore(content.chapter, { getStorage }));
  assert.equal(reloaded.state.phase, 'home');
  assert.equal(reloaded.state.progress.pending, null);
  assert.equal(reloaded.state.progress.bank, bank);
  assert.deepEqual(reloaded.state.progress.cleared, content.chapter.missions.map(mission => mission.id));
});
