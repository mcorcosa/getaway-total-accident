import { paintDistrict, paintDrive, paintInset } from './renderer.mjs';
import { startDrive } from './simulation.mjs';
import { eligibleVehicles, vehicles } from './vehicles.mjs';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const menuPhases = ['home', 'garage', 'shop', 'daily'];
const drivingPhases = ['driving', 'pause', 'success', 'failure', 'bonus-briefing'];
const teachingMissions = new Set([0, 3, 8, 13]);
const nodeOffsets = [24, 52, 12, 40, 6, 33, 51, 15];
const failureMessages = {
  wrecked: 'The car was wrecked.',
  busted: 'The patrol caught up and stopped you.',
  'balance-limit': 'Your balance reached the save limit.',
};

function element(tag, text, className) {
  const item = document.createElement(tag);
  if (text) item.textContent = text;
  if (className) item.className = className;
  return item;
}

function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function button(label, action, secondary = false) {
  const control = element('button', label, secondary ? 'secondary' : '');
  control.type = 'button';
  control.dataset.action = action;
  return control;
}

export function gameUI(content, game, act) {
  const byId = id => document.getElementById(id);
  const { state } = game;
  const { chapter, fixture } = content;
  const menu = byId('menu');
  const menuContext = byId('menu-context');
  const menuTitle = byId('menu-title');
  const completion = byId('menu-completion');
  const menuBank = byId('menu-bank');
  const detail = byId('menu-detail');
  const scroll = byId('route-scroll');
  const route = byId('route-map');
  const mapPath = byId('map-path');
  const list = byId('mission-list');
  const play = byId('play');
  const stage = byId('stage');
  const objective = byId('objective');
  const hud = byId('driving-hud');
  const footer = byId('play-footer');
  const objectiveIcon = byId('hud-objective-icon');
  const damage = byId('hud-damage');
  const heat = byId('hud-heat');
  const dialog = byId('postcard');
  const label = byId('card-label');
  const title = byId('card-title');
  const copy = byId('card-copy');
  const instruction = byId('card-instruction');
  const inset = byId('teaching-inset');
  const field = byId('vehicle-field');
  const select = byId('vehicle-select');
  const locked = byId('vehicle-locked');
  const actions = byId('card-actions');
  let leadingCopy;
  let trailingCopy;
  let tileHeight = 0;
  let scrollOffset = 0;
  let lastPhase;
  let lastMissionId;
  let lastCleared = -1;
  let recentlyCleared = false;
  let staticDrive;

  function copyMap() {
    const duplicate = route.cloneNode(true);
    duplicate.removeAttribute('id');
    duplicate.setAttribute('aria-hidden', 'true');
    for (const node of duplicate.querySelectorAll('[id]')) node.removeAttribute('id');
    for (const control of duplicate.querySelectorAll('button')) control.tabIndex = -1;
    return duplicate;
  }

  function layoutLoop() {
    const height = route.offsetHeight;
    if (!height || !leadingCopy) return;
    const bounds = route.getBoundingClientRect();
    const points = [...route.querySelectorAll('.node-number, .route-end')].map(node => {
      const box = node.getBoundingClientRect();
      return { x: box.left + box.width / 2 - bounds.left, y: box.top + box.height / 2 - bounds.top };
    });
    paintDistrict(mapPath, points);
    for (const duplicate of [leadingCopy, trailingCopy]) {
      const canvas = duplicate.querySelector('canvas');
      canvas.width = mapPath.width;
      canvas.height = mapPath.height;
      canvas.getContext('2d').drawImage(mapPath, 0, 0);
    }
    if (tileHeight !== height) {
      tileHeight = height;
      scroll.scrollTop = height + scrollOffset % height;
    }
  }

  function buildMap() {
    const { cleared } = state.progress;
    leadingCopy?.remove();
    trailingCopy?.remove();
    tileHeight = 0;
    list.replaceChildren();
    chapter.missions.forEach((mission, index) => {
      const row = element('li');
      const status = index < cleared.length ? 'replay' : index === cleared.length ? 'play' : 'locked';
      const control = button('', 'open');
      control.className = 'mission-button';
      control.style.setProperty('--offset', `${nodeOffsets[index % nodeOffsets.length]}%`);
      control.dataset.status = status;
      control.dataset.mission = mission.id;
      control.disabled = status === 'locked';
      if (status === 'play') control.setAttribute('aria-current', 'step');
      const nodeNumber = element('span', String(index + 1), 'node-number');
      const description = element('span', mission.title);
      description.append(element('span', { replay: 'Replay', play: 'Play', locked: 'Locked' }[status], 'node-status'));
      control.append(nodeNumber, description);
      row.append(control);
      list.append(row);
    });
    if (!fixture) {
      const row = element('li');
      row.append(element('span', 'Neon Strip · Unavailable', 'route-end'));
      list.append(row);
    }
    leadingCopy = copyMap();
    trailingCopy = copyMap();
    route.before(leadingCopy);
    route.after(trailingCopy);
    lastCleared = cleared.length;
  }

  scroll.addEventListener('scroll', () => {
    if (!tileHeight || scroll.hidden || state.phase !== 'home') return;
    const position = scroll.scrollTop;
    if (position < tileHeight) scroll.scrollTop = position + tileHeight;
    if (position >= tileHeight * 2) scroll.scrollTop = position - tileHeight;
    scrollOffset = scroll.scrollTop - tileHeight;
  }, { passive: true });
  scroll.addEventListener('mousedown', event => {
    if (event.target.closest('[aria-hidden="true"] button')) event.preventDefault();
  });
  new ResizeObserver(layoutLoop).observe(route);

  function renderMenu(phase) {
    const { cleared } = state.progress;
    const complete = !fixture && cleared.length === chapter.missions.length;
    completion.hidden = phase !== 'home' || !complete;
    menuBank.textContent = money.format(state.progress.bank);
    menuBank.setAttribute('aria-label', `Bank balance ${money.format(state.progress.bank)}`);
    menuTitle.textContent = ({ home: fixture ? chapter.title : 'Palmera Bay', garage: 'Garage', shop: 'Shop', daily: 'Daily Missions' })[phase];
    menuContext.textContent = phase === 'home' && !fixture ? `Story · ${chapter.title}` : 'Getaway Totally Accidental';
    for (const control of menu.querySelectorAll('.bottom-menu button')) {
      if (control.dataset.action === phase) control.setAttribute('aria-current', 'page');
      else control.removeAttribute('aria-current');
    }
    scroll.hidden = phase !== 'home';
    detail.hidden = phase === 'home';
    if (phase === 'home') {
      const unlocked = recentlyCleared || (lastCleared >= 0 && cleared.length > lastCleared);
      if (lastCleared !== cleared.length) buildMap();
      layoutLoop();
      scroll.scrollTop = tileHeight + scrollOffset;
      const controls = [...list.querySelectorAll('button')];
      const prior = controls.find(control => control.dataset.mission === lastMissionId);
      if (unlocked) {
        const next = controls[cleared.length] ?? controls.at(-1);
        const offset = next.getBoundingClientRect().top - route.getBoundingClientRect().top;
        scrollOffset = Math.max(0, offset - scroll.clientHeight / 3);
        scroll.scrollTop = tileHeight + scrollOffset;
        (complete ? completion : next).focus({ preventScroll: true });
        recentlyCleared = false;
        return;
      }
      const restore = ['briefing', 'success', 'failure', 'driving', 'pause'].includes(lastPhase) && prior;
      (restore || menuTitle).focus({ preventScroll: true });
      return;
    }
    detail.replaceChildren();
    if (phase === 'garage') {
      for (const id of state.progress.ownedVehicleIds) {
        const vehicle = vehicles[id];
        const car = element('article', '', 'garage-car');
        car.append(element('h2', vehicle.name),
          element('p', `Tier ${vehicle.tier} · ${vehicle.category} · ${vehicle.maxDamage} condition pips`));
        detail.append(car);
      }
    } else {
      detail.append(element('p', phase === 'shop' ? 'The Shop is currently unavailable.' : 'Daily Missions are currently unavailable.'));
    }
    menuTitle.focus({ preventScroll: true });
  }

  function showVehicle(run) {
    const options = eligibleVehicles(run.mission, state.progress.ownedVehicleIds);
    field.hidden = false;
    const choice = run.mission.allowVehicleSelection && !run.mission.stolenVehicleId && options.length > 0;
    select.hidden = !choice;
    field.querySelector('label').hidden = !choice;
    locked.hidden = choice;
    if (choice) {
      select.replaceChildren(...options.map(id => {
        const option = element('option', `${vehicles[id].name} · Tier ${vehicles[id].tier}`);
        option.value = id;
        return option;
      }));
      select.value = run.vehicleId;
    } else {
      locked.textContent = run.vehicleId ? `${vehicles[run.vehicleId].name} · Tier ${vehicles[run.vehicleId].tier}` :
        'No eligible owned vehicle is available.';
    }
  }

  function renderPostcard(phase) {
    dialog.dataset.phase = phase;
    const { run, failure } = state;
    let card;
    field.hidden = true;
    inset.hidden = true;
    instruction.hidden = true;
    if (phase === 'briefing' || phase === 'bonus-briefing') {
      const bonus = phase === 'bonus-briefing';
      const segment = bonus ? run.mission.bonus : run.mission;
      card = {
        label: 'Nina',
        title: bonus ? 'Bonus run' : run.mission.title,
        copy: segment.flavour.replace(/^Nina:\s*/i, ''),
        actions: bonus ? [['Start Bonus', 'start'], ['Back to Success', 'cancel-bonus']] : [['Play', 'start'], ['Story', 'home']],
      };
      instruction.hidden = false;
      instruction.textContent = segment.instructions.replace(/^Nina:\s*/i, '');
      dialog.setAttribute('aria-describedby', 'card-copy card-instruction');
      if (!bonus) {
        showVehicle(run);
        inset.hidden = !teachingMissions.has(chapter.missions.indexOf(run.mission)) || !run.vehicleId;
      }
    } else {
      dialog.setAttribute('aria-describedby', 'card-copy');
      if (phase === 'success') {
        card = {
          label: 'Mission result', title: 'Job complete',
          copy: `You have ${money.format(run.haul)} in the car. Bank it now or take one bonus run.`,
          actions: [['Continue to Story', 'bank'], ['Bonus', 'bonus']],
        };
      } else if (phase === 'failure') {
        const loss = failure.lost ? ` You lost ${money.format(failure.lost)}.` : '';
        const clear = failure.bonus ? ' Your main job is still complete.' : '';
        card = {
          label: 'Mission result', title: 'Job failed',
          copy: `${failureMessages[failure.reason]}${loss}${clear}`,
          actions: [['Replay', 'replay'], ['Back to menu', 'home']],
        };
      } else {
        card = {
          label: '', title: 'Paused',
          copy: 'Leaving ends this attempt.',
          actions: [['Resume', 'resume'], ['Back to menu', 'home']],
        };
      }
    }
    label.hidden = !card.label;
    label.textContent = card.label;
    title.textContent = card.title;
    copy.textContent = card.copy;
    actions.replaceChildren(...card.actions.map(([text, action], index) => button(text, action, index > 0)));
    if (phase === 'briefing' && !run.vehicleId) actions.firstElementChild.disabled = true;
    if (!dialog.open) dialog.showModal();
    if (!inset.hidden) paintInset(inset, game.mapFor(run.mission.id), run.mission, vehicles[run.vehicleId]);
    title.focus({ preventScroll: true });
  }

  function draw() {
    const { run } = state;
    const drive = run?.drive ?? staticDrive;
    if (!drive || play.hidden) return;
    const collecting = drive.segment.objective.pickup && !drive.pickedUp;
    const goal = collecting ? 'Pick up the package' : 'Reach the marker';
    const incident = drive.incidentTime > 0 ? drive.incident : '';
    setText(objectiveIcon, collecting ? '✉' : '⌂');
    setText(objective, incident ? `${goal} · ${incident}` : goal);
    const condition = drive.vehicle.maxDamage;
    setText(damage, `${'■'.repeat(drive.damage)}${'□'.repeat(condition - drive.damage)}`);
    damage.setAttribute('aria-label', `${drive.damage} of ${condition} condition pips`);
    setText(heat, drive.patrol ? '★☆☆☆☆' : '☆☆☆☆☆');
    heat.setAttribute('aria-label', drive.patrol ? 'Heat 1 of 5' : 'Heat 0 of 5');
    paintDrive(stage, drive, { hudBottom: hud.getBoundingClientRect().bottom, footerTop: footer.getBoundingClientRect().top });
  }

  function render() {
    const { phase, run } = state;
    if (phase === lastPhase) return;
    document.body.dataset.phase = phase;
    if (run) {
      lastMissionId = run.mission.id;
      recentlyCleared ||= run.firstClear;
    }
    if (menuPhases.includes(phase)) {
      if (dialog.open) dialog.close();
      menu.hidden = false;
      play.hidden = true;
      renderMenu(phase);
    } else {
      menu.hidden = phase !== 'briefing';
      play.hidden = !drivingPhases.includes(phase);
      staticDrive = null;
      if (!play.hidden && !run.drive) {
        staticDrive = startDrive(run.mission, game.mapFor(run.mission.id), vehicles[run.vehicleId], run.damage);
      }
      if (phase === 'driving') {
        if (dialog.open) dialog.close();
        stage.focus({ preventScroll: true });
      } else {
        renderPostcard(phase);
      }
      draw();
    }
    lastPhase = phase;
  }

  document.addEventListener('click', event => {
    const control = event.target.closest('button[data-action]');
    if (control) act(control.dataset.action, control.dataset.mission);
  });
  select.addEventListener('change', () => {
    if (act('vehicle', select.value) && !inset.hidden) {
      const { run } = state;
      paintInset(inset, game.mapFor(run.mission.id), run.mission, vehicles[run.vehicleId]);
    }
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    const escape = { pause: 'resume', briefing: 'home', 'bonus-briefing': 'cancel-bonus', failure: 'home' }[state.phase];
    if (escape) act(escape);
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button:not(:disabled), select')]
      .filter(node => !node.hidden && !node.closest('[hidden]'));
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === title)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  new ResizeObserver(() => {
    draw();
    if (!inset.hidden && state.run) {
      const { run } = state;
      paintInset(inset, game.mapFor(run.mission.id), run.mission, vehicles[run.vehicleId]);
    }
  }).observe(stage);

  return { render, draw };
}
