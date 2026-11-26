import { eligibleVehicles, vehicles } from '../vehicles.mjs';
import { art, button, clamp, colors, graphics, group, icon, money, panel, text } from './primitives.mjs';
import { car, teachingView } from './world-view.mjs';

const teachingMissions = new Set([0, 3, 8, 13]);
const failures = {
  wrecked: { title: 'Car wrecked', copy: 'The car was wrecked.', tint: 0xff894f },
  busted: { title: 'Caught by patrol', copy: 'The patrol caught up and stopped you.', tint: 0x74d9ff },
  'balance-limit': { title: 'Balance limit', copy: 'Your balance reached the save limit.', tint: colors.gold },
};
const vehicleLabel = id => `${vehicles[id].name} · Tier ${vehicles[id].tier}`;

function postcardModel(content, { phase, run, failure }) {
  const { mission } = run;
  const bonus = phase === 'bonus-briefing';
  if (phase === 'briefing' || bonus) {
    const segment = bonus ? mission.bonus : mission;
    return {
      context: bonus ? mission.title : content.chapter.title,
      title: bonus ? 'Bonus run' : mission.title,
      art: bonus ? 'bonus' : mission.id === 'C1-01' ? 'first-job' : 'canal-ward',
      copy: segment.flavour.replace(/^Nina:\s*/i, ''),
      instruction: segment.instructions.replace(/^Nina:\s*/i, ''),
      speaker: 'Nina',
      teach: !bonus && run.vehicleId && teachingMissions.has(content.chapter.missions.indexOf(mission)),
      actions: bonus ? [['Start Bonus', 'start', 'pink'], ['Back to Success', 'cancel-bonus']] :
        [['Play', 'start', 'pink'], ['Story', 'home']],
      details: bonus ? [
        ['Bonus payout', `+${money.format(segment.payout)}`],
        ['Haul at risk', money.format(run.haul)], ['Patrol', segment.patrol ? 'Active' : 'None'],
      ] : [],
    };
  }
  if (phase === 'success') {
    return {
      context: mission.title, title: 'Job complete', art: 'success', speaker: 'Nina',
      copy: `You have ${money.format(run.haul)} in the car. Bank it now or take one bonus run.`,
      details: [['Ready to bank', money.format(run.haul)]],
      actions: [['Continue to Story', 'bank', 'aqua'], ['Bonus', 'bonus', 'pink']],
    };
  }
  const style = failures[failure.reason];
  const loss = failure.lost ? ` You lost ${money.format(failure.lost)}.` : '';
  const clear = failure.bonus ? ' Your main job is still complete.' : '';
  return {
    context: mission.title, title: style.title, art: 'canal-ward', failure: { ...style, reason: failure.reason },
    copy: `${style.copy}${loss}${clear}`, details: [],
    actions: [['Replay', 'replay', 'pink'], ['Back to menu', 'home']],
  };
}

function failureArt(parent, model, run, w, y) {
  const { tint, reason } = model.failure;
  const root = group(parent, `failure-art:${reason}`, w * .63, y);
  const graphic = graphics(root);
  graphic.circle(0, 0, 37).fill({ color: 0x1c1930, alpha: .87 }).stroke({ color: tint, width: 1.5 });
  if (reason === 'wrecked') {
    const wreck = car(root, vehicles[run.vehicleId], 'wrecked-coupe');
    wreck.rotation = -.53;
    wreck.scale.set(1.52);
    for (let i = 0; i < 7; i += 1) {
      const angle = -.8 + i * .31;
      const a = 16 + i % 2 * 4;
      const b = a + 10;
      graphic.moveTo(Math.cos(angle) * a, Math.sin(angle) * a)
        .lineTo(Math.cos(angle) * b, Math.sin(angle) * b);
    }
    graphic.stroke({ color: tint, width: 1.6 });
  } else if (reason === 'busted') {
    graphic.poly([-28, -8, 24, -20, 7, 4]).fill({ color: 0xff4fa7, alpha: .64 })
      .poly([29, 9, -17, 26, -6, 2]).fill({ color: 0x3cd9ff, alpha: .64 });
    const patrol = car(root, { length: 25, width: 13, color: '#b9d7ef' }, 'stopped-by-patrol', true);
    patrol.rotation = -.8;
    patrol.scale.set(1.5);
  } else {
    icon(root, 'cash', 0, -1, 38, tint);
  }
}

function speech(parent, model, y, w, compact) {
  const bubble = group(parent, 'speech-bubble', 11, y);
  const fill = model.art === 'first-job' || model.art === 'canal-ward' ? 0xffeaf3 : 0xfff0d6;
  const edge = graphics(bubble);
  const offset = model.speaker ? 26 : 9;
  const copy = text(bubble, model.copy, 11, offset, {
    size: compact ? 14 : 17, color: colors.ink, width: w - 45, label: 'card-copy',
  });
  const h = Math.ceil(offset + copy.height + 8);
  edge.roundRect(0, 0, w - 22, h, 11).poly([31, 0, 43, -12, 51, 0]).fill(fill);
  if (model.speaker) {
    panel(bubble, 10, 7, 43, 16, 0xffa9cf, undefined, 6);
    text(bubble, model.speaker, 31, 15, { size: 11, color: colors.ink, center: true });
  }
  return h;
}

function detailRows(parent, model, y, w, compact) {
  if (!model.details.length) return y;
  const gap = 5;
  const row = group(parent, 'payout-details', 0, y);
  const single = model.details.length === 1;
  const cell = (w - gap * (model.details.length - 1)) / model.details.length;
  for (const [i, [label, value]] of model.details.entries()) {
    const px = i * (cell + gap);
    panel(row, px, 0, cell, single ? 30 : 35, 0x28233c, 0xa8774d, 7);
    text(row, label, px + 8, single ? 7 : 3, { size: compact ? 11 : 12 });
    const amount = text(row, value, px + cell - 8, single ? 5 : 16, {
      size: single ? 16 : 14, color: colors.gold, label: `payout:${label}`,
    });
    amount.anchor.x = 1;
  }
  return y + (single ? 39 : 44);
}

function instruction(parent, model, game, y, w, compact) {
  if (!model.instruction) return y;
  const { run } = game.state;
  const root = group(parent, 'instruction', 0, y);
  const size = model.teach ? (compact ? 63 : 78) : 0;
  const left = size ? size + 16 : 10;
  const caption = graphics(root);
  const label = text(root, model.teach ? 'DRIVING LESSON' : 'OBJECTIVE', left, 7, {
    size: 10, spacing: .5, color: 0x422a40, weight: '800',
  });
  const copy = text(root, model.instruction, left, label.y + 15, {
    size: compact ? 12 : 14, color: 0x312137, width: w - left - 8, label: 'card-instruction',
  });
  const h = Math.max(size + 12, copy.y + copy.height + 7);
  caption.roundRect(0, 0, w, h, 9).fill(colors.gold).stroke({ color: 0xffedaa, width: 1 });
  if (model.teach) teachingView(root, game.mapFor(run.mission.id), run.mission, vehicles[run.vehicleId], 6, 6, size);
  return y + h + 8;
}

function actionButtons(parent, actions, y, w, controls, compact, disabled, stacked = false) {
  const h = stacked ? 48 : 44;
  const cell = stacked ? w : (w - 7) / 2;
  for (const [i, [label, action, primary]] of actions.entries()) {
    const row = stacked ? y + i * (h + 10) : y;
    button(parent, controls, {
      id: `card:${action}`, name: label, caption: label, action, primary,
      x: stacked ? 0 : i * (cell + 7), y: row, w: cell, h,
      size: compact ? 13 : 15, glyph: ['start', 'resume'].includes(action) ? 'play' : undefined,
      enabled: !(disabled && action === 'start'),
    });
  }
  return y + (stacked ? 2 * h + 10 : h);
}

function vehicleChoice(parent, game, y, w, controls, ui, compact) {
  const { run, progress } = game.state;
  const choices = eligibleVehicles(run.mission, progress.ownedVehicleIds);
  const choose = run.mission.allowVehicleSelection && !run.mission.stolenVehicleId && choices.length;
  if (!choose) {
    panel(parent, 0, y, w, 34, 0x281c38, 0xa77098, 8);
    text(parent, run.vehicleId ? vehicleLabel(run.vehicleId) : 'No eligible owned vehicle is available.',
      11, y + 8, { size: compact ? 12 : 14, label: 'vehicle-locked' });
    return { bottom: y + 42 };
  }
  const selected = vehicleLabel(run.vehicleId);
  const make = button(parent, controls, {
    id: 'vehicle-picker', name: `Vehicle, ${selected}`, role: 'combobox', expanded: ui.vehicleOpen,
    x: 0, y, w, h: 41, enter: ui.toggleVehicle,
  });
  panel(make.node, 1, 1, w - 2, 39, 0x362444, 0xa77098, 8);
  text(make.node, 'Vehicle', 10, 12, { size: compact ? 12 : 14, color: 0xffc3df });
  text(make.node, selected, compact ? 65 : 83, 12, { size: compact ? 12 : 14, label: 'selected-vehicle' });
  const arrow = icon(make.node, 'right', w - 15, 21, 17, colors.paper);
  arrow.rotation = Math.PI / 2;
  arrow.position.set(w - 7, 12);
  if (!ui.vehicleOpen) return { bottom: y + 49 };

  return {
    bottom: y + 49,
    popup() {
      const list = group(parent, 'eligible-vehicles', 0, y - choices.length * 44 - 5);
      panel(list, 0, 0, w, choices.length * 44 + 3, 0x101c3a, colors.pink);
      for (const [i, id] of choices.entries()) {
        button(list, controls, {
          id: `vehicle:${id}`, caption: vehicleLabel(id), name: vehicleLabel(id), role: 'option',
          selected: id === run.vehicleId, x: 4, y: i * 44 + 2, w: w - 8, h: 39,
          primary: id === run.vehicleId ? 'aqua' : undefined,
          enter: () => ui.chooseVehicle(id), size: 13,
        });
      }
    },
  };
}

function finish(parent, w, h, width, height) {
  const scale = Math.min(1, (height - 20) / h, (width - 16) / (w + 12));
  parent.scale.set(scale);
  parent.position.set(Math.round((width - w * scale) / 2), Math.round((height - h * scale) / 2));
}

function pause(parent, { width, height }, controls) {
  const w = Math.min(width - 47, 446);
  const root = group(parent, 'pause-dialog');
  panel(root, -16, -10, w + 32, 225, 0x111c34, 0x6ecbd0, 16, .98);
  panel(root, 0, 5, 38, 2, colors.aqua, undefined, 1);
  panel(root, 44, 5, 13, 2, colors.pink, undefined, 1);
  text(root, 'PAUSED', 0, 17, { label: 'card-title', size: clamp(w * .099, 29, 41), weight: '650' });
  text(root, 'Leaving ends this attempt.', 0, 66, { label: 'card-copy', size: 14, color: colors.faded });
  actionButtons(root, [['Resume', 'resume', 'aqua'], ['Back to menu', 'home']], 92, w, controls, width < 430, false, true);
  finish(root, w, 208, width, height);
}

export function showCard(parent, textures, content, game, { width, height }, controls, ui) {
  const { phase, run } = game.state;
  const backdrop = group(parent, 'modal-scrim');
  if (phase === 'briefing') {
    art(backdrop, textures.map, 0, 0, width, height, { label: 'briefing-backdrop' });
    graphics(backdrop).rect(0, 0, width, height).fill({ color: 0x20152b, alpha: .87 });
  } else {
    graphics(backdrop).rect(0, 0, width, height).fill({ color: 0x071126, alpha: phase === 'pause' ? .60 : .85 });
  }
  if (phase === 'pause') {
    pause(parent, { width, height }, controls);
    return;
  }

  const model = postcardModel(content, game.state);
  const root = group(parent, `postcard:${phase}`);
  const compact = width < 480 || height < 630;
  const w = Math.min(width - 34, 485);
  const border = phase === 'success' ? 0xdab879 : 0xf477b7;
  const blush = phase === 'briefing';
  const back = graphics(root, 'postcard-frame');
  const heading = text(root, model.title, 0, 27, {
    size: compact ? 28 : 37, weight: '700', width: w, label: 'card-title',
  });
  const badge = text(root, model.context, w - 8, 2, {
    size: compact ? 11 : 12, color: blush ? colors.ink : colors.gold, label: 'card-context',
  });
  badge.anchor.x = 1;
  const tag = panel(root, w - badge.width - 15, -2, badge.width + 15, 21, blush ? colors.gold : 0x202a48,
    blush ? 0xffecaa : colors.edge, 7);
  root.setChildIndex(tag, 1);
  const artY = heading.y + heading.height + 7;
  const texture = textures[model.art];
  const naturalHeight = (w - 2) * texture.height / texture.width;
  const opener = model.art === 'first-job';
  const bonus = model.art === 'bonus';
  const defaultHeight = clamp(Math.round(height * (model.instruction ? .275 : .32)), 126, 255);
  const imageHeight = opener ? naturalHeight : bonus ? Math.max(defaultHeight, naturalHeight * .66) : defaultHeight;
  const image = group(root, 'illustration-and-dialogue');
  const imageBack = graphics(image, 'postcard-illustration-frame');
  const portrait = art(image, texture, 1, artY + 1, w - 2, imageHeight, {
    label: `postcard-art:${model.art}`, radius: 13, vertical: opener || bonus ? 0 : .48,
  });
  if (model.failure) {
    portrait.tint = 0x736483;
    failureArt(image, model, run, w, artY + imageHeight * .45);
  }
  const speechY = artY + imageHeight + (opener ? 13 : -17);
  const bubble = speech(image, model, speechY, w, compact);
  let y = speechY + bubble + 8;
  imageBack.roundRect(0, artY, w, y - artY, 14).fill(0x191d37).stroke({ color: border, width: 1.5 });
  y += 8;
  y = instruction(root, model, game, y, w, compact);
  y = detailRows(root, model, y, w, compact);
  const choice = blush ? vehicleChoice(root, game, y, w, controls, ui, compact) : { bottom: y };
  const end = actionButtons(root, model.actions, choice.bottom, w, controls, compact, blush && !run.vehicleId);
  choice.popup?.();
  back.roundRect(-9, -9, w + 18, end + 21, 16).fill(blush ? 0x231a36 : 0x101b35)
    .stroke({ color: blush ? 0xa96293 : 0x496683, width: 1 });
  finish(root, w, end + 8, width, height);
}
