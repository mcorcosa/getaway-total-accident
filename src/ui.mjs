import { Rectangle } from '../vendor/pixi.mjs';
import { startDrive } from './simulation.mjs';
import { vehicles } from './vehicles.mjs';
import { showCard } from './pixi/card.mjs';
import { showDrive } from './pixi/drive.mjs';
import { showMenu } from './pixi/menu.mjs';
import { button, clamp, clear, colors, graphics, group, panel, text } from './pixi/primitives.mjs';

const menus = new Set(['home', 'garage', 'shop', 'daily']);
const dialogs = new Set(['briefing', 'pause', 'success', 'failure', 'bonus-briefing']);
const escapeAction = { driving: 'pause', pause: 'resume', briefing: 'home', 'bonus-briefing': 'cancel-bonus', failure: 'home' };
const statusInput = new WeakMap();
const steeringDeadZone = 7;
const wheelHubRadius = 14;
const wheelLock = Math.PI / 2;
const wheelDeadZone = Math.PI / 36;

function wheelDelta(previous, current) {
  if (!previous || !current) return null;
  const cross = previous.x * current.y - previous.y * current.x;
  const dot = previous.x * current.x + previous.y * current.y;
  const chord = Math.hypot(current.x - previous.x, current.y - previous.y);
  // Ignore a straight crossing through the hub, even when no event lands inside it.
  if (dot < 0 && Math.abs(cross) < wheelHubRadius * chord) return null;
  return Math.atan2(cross, dot);
}

function pulledSteering(x, travel) {
  const horizontal = Math.abs(x) - steeringDeadZone;
  let magnitude = clamp(horizontal / (travel - steeringDeadZone), 0, 1);
  if (1 - magnitude < 1e-9) magnitude = 1;
  return x < 0 && magnitude > 0 ? -magnitude : magnitude;
}

function updateSteering(hold, point) {
  const { center, travel } = hold;
  let x = point.x - center.x;
  let y = point.y - center.y;
  const distance = Math.hypot(x, y);
  const rimPoint = distance >= wheelHubRadius ? { x, y } : null;
  const delta = wheelDelta(hold.rimPoint, rimPoint);
  hold.rimPoint = rimPoint;
  if (!hold.offset) hold.rotating = Boolean(rimPoint);
  if (!hold.rotating) {
    if (delta === null) hold.pendingTurn = 0;
    else if (delta) {
      const keepsTurning = hold.pendingTurn * delta > 0;
      hold.pendingTurn = keepsTurning ? hold.pendingTurn + delta : delta;
      // A center grab stays a proportional pull until it traces a deliberate arc.
      hold.rotating = keepsTurning && Math.abs(hold.pendingTurn) >= Math.PI / 12;
    }
  }
  if (distance > travel) {
    x = (x / distance) * travel;
    y = (y / distance) * travel;
  }
  let steering;
  if (hold.rotating) {
    hold.rotation += delta ?? 0;
    // The wheel art follows every turn. The car only takes a finite angle to reach full lock.
    hold.turnAngle = clamp(hold.turnAngle + (delta ?? 0), -wheelLock, wheelLock);
    const angle = Math.abs(hold.turnAngle);
    steering = angle <= wheelDeadZone ? 0 : Math.sign(hold.turnAngle) * (angle - wheelDeadZone) / (wheelLock - wheelDeadZone);
  } else {
    steering = pulledSteering(x, travel);
    hold.rotation = steering * .65;
    hold.turnAngle = steering ? Math.sign(steering) * wheelDeadZone + steering * (wheelLock - wheelDeadZone) : 0;
  }
  const previous = hold.offset;
  if (previous?.x === x && previous?.y === y && previous.steering === steering && previous.rotation === hold.rotation) return false;
  hold.offset = { x, y, steering, rotation: hold.rotation };
  return true;
}

export function statusScene(app, title, detail, fixtureLink) {
  const { width, height } = app.screen;
  const previous = statusInput.get(app);
  previous?.events.abort();
  clear(app.stage);
  app.stage.eventMode = 'static';
  app.stage.hitArea = new Rectangle(0, 0, width, height);
  text(app.stage, title, 18, Math.min(height * .16, 72), {
    size: clamp(width * .061, 22, 37), width: width - 36, label: 'loading-title',
  });
  if (detail) text(app.stage, detail, 18, Math.min(height * .16, 72) + 81, {
    size: 15, width: Math.min(width - 36, 570), color: colors.faded,
  });
  if (fixtureLink) {
    const x = 18;
    const y = height - 83;
    const w = Math.min(252, width - 36);
    const { node } = button(app.stage, [], {
      id: 'open-fixture', name: 'Open engineering fixture', caption: 'Open engineering fixture',
      primary: 'aqua', x, y, w, h: 44,
    });
    const ring = graphics(app.stage, 'fixture-focus').roundRect(x - 3, y - 3, w + 6, 50, 10)
      .stroke({ width: 2, color: colors.aqua });
    ring.visible = Boolean(previous?.focused);
    const events = new AbortController();
    const options = { signal: events.signal };
    const state = { events, focused: ring.visible };
    statusInput.set(app, state);
    function showFocus(focused) {
      state.focused = ring.visible = focused;
      app.render();
    }
    const open = () => location.assign('?fixture=1');
    node.on('pointertap', open);
    app.canvas.addEventListener('keydown', event => {
      if (event.code === 'Tab' && !state.focused) {
        event.preventDefault();
        showFocus(true);
      } else if (state.focused && (event.code === 'Enter' || event.code === 'Space')) {
        event.preventDefault();
        if (!event.repeat) open();
      }
    }, options);
    app.canvas.addEventListener('blur', () => showFocus(false), options);
    if (!previous) app.canvas.focus({ preventScroll: true });
  }
  app.render();
}

export function gameUI(app, content, textures, game, effects) {
  const { stage, canvas } = app;
  const { state } = game;
  const scroll = { offset: 0, min: null, max: null };
  const swipe = new Set();
  const drivingPointers = new Map();
  let drag;
  let previous;
  let lastMission;
  let knownClear = -1;
  let map;
  let drawDrive;
  let controls;
  let focus = null;
  let focusRing;
  let vehicleOpen = false;
  let notice = '';
  let wasCleared = false;
  let staticDrive;

  function focusCanvas() {
    if (document.activeElement !== canvas) canvas.focus({ preventScroll: true });
  }

  function drawFocus() {
    focusRing.clear();
    if (document.activeElement !== canvas) return;
    const control = controls.find(item => item.id === focus);
    if (!control?.node.visible) return;
    const area = control.node.hitArea;
    const start = control.node.toGlobal({ x: 0, y: 0 });
    const end = control.node.toGlobal({ x: area.width, y: area.height });
    focusRing.roundRect(start.x - 2.5, start.y - 2.5, end.x - start.x + 5, end.y - start.y + 5, 10)
      .stroke({ color: colors.aqua, width: 2.5 });
  }

  function focusOn(id, reveal = false) {
    focus = id;
    const control = controls.find(item => item.id === id);
    if (reveal && control?.reveal && control.node.eventMode !== 'static') control.reveal();
    drawFocus();
    effects.invalidate();
  }

  function chooseVehicle(value) {
    vehicleOpen = false;
    effects.act('vehicle', value);
    focusOn('vehicle-picker');
  }

  function toggleVehicle() {
    vehicleOpen = !vehicleOpen;
    show(true);
    const option = vehicleOpen && controls.find(item => item.role === 'option' && item.selected);
    focusOn(option ? option.id : 'vehicle-picker');
  }

  function activate(control) {
    if (control?.enter) control.enter();
    else if (control?.action) effects.act(control.action, control.value);
  }

  function bindControl(control) {
    if (!control.enabled) return;
    const { node } = control;
    if (vehicleOpen && control.role !== 'option' && control.role !== 'combobox') {
      node.eventMode = 'none';
      return;
    }
    if (control.drive || control.steeringTravel) {
      const kind = control.drive ?? 'steer';
      node.on('pointerdown', e => {
        if (e.button !== 0 || state.phase !== 'driving' || drivingPointers.has(kind)) return;
        focusCanvas();
        const hold = { id: e.pointerId, direction: control.drive };
        if (control.steeringTravel) {
          const { width, height } = node.hitArea;
          hold.center = node.toGlobal({ x: width / 2, y: height / 2 });
          hold.travel = control.steeringTravel;
          hold.rotation = 0;
          hold.turnAngle = 0;
          updateSteering(hold, e.global);
        }
        effects.capture(e.pointerId);
        drivingPointers.set(kind, hold);
        draw(effects.input());
      });
    } else if (control.action || control.enter) {
      node.on('pointertap', e => {
        if (e.button !== 0 || swipe.delete(e.pointerId)) return;
        focusCanvas();
        activate(control);
      });
    }
  }

  function show(preserve = false) {
    const { phase, run } = state;
    const size = { width: app.screen.width, height: app.screen.height };
    if (run) {
      lastMission = run.mission.id;
      wasCleared ||= run.firstClear;
    }
    if (phase !== previous && phase !== 'briefing') vehicleOpen = false;
    clear(stage);
    stage.eventMode = 'static';
    stage.hitArea = new Rectangle(0, 0, size.width, size.height);
    controls = [];
    map = null;
    drawDrive = null;

    if (menus.has(phase)) {
      const root = group(stage, `menu:${phase}`);
      map = showMenu(root, textures, content, phase, state.progress, size, controls, scroll);
    } else {
      if (phase !== 'briefing') {
        if (!run.drive && (!staticDrive || phase !== previous && previous === 'home')) {
          staticDrive = startDrive(run.mission, game.mapFor(run.mission.id), vehicles[run.vehicleId], run.damage);
        }
        const drive = run.drive ?? staticDrive;
        const base = group(stage, 'drive-scene');
        const active = phase === 'driving';
        const touch = size.width < 680 || effects.hasTouchInput();
        let safeArea;
        if (touch) {
          const style = getComputedStyle(canvas);
          const inset = edge => parseFloat(style.getPropertyValue(`--drive-safe-${edge}`)) || 0;
          safeArea = { left: inset('left'), right: inset('right'), bottom: inset('bottom') };
        }
        drawDrive = showDrive(base, drive, size, active ? controls : null, { touch, safeArea });
        if (!active) base.eventMode = 'none';
      }
      if (dialogs.has(phase)) {
        const root = group(stage, `dialog:${phase}`);
        showCard(root, textures, content, game, size, controls, { vehicleOpen, toggleVehicle, chooseVehicle });
      }
    }

    controls.forEach(bindControl);
    const noticeLayer = group(stage, 'save-status');
    if (notice) {
      const width = Math.min(size.width - 16, 400);
      const x = size.width - width - 8;
      const copy = text(noticeLayer, notice, x + 10, 9, { size: 13, width: width - 20, label: 'save-notice' });
      const backing = panel(noticeLayer, x, 4, width, copy.height + 12, 0x231833, colors.gold, 7);
      noticeLayer.setChildIndex(backing, 0);
    }
    focusRing = graphics(stage, 'keyboard-focus');
    if (phase !== previous && !preserve) focus = null;
    if (map) {
      const count = state.progress.cleared.length;
      const initial = knownClear < 0;
      const newlyCleared = wasCleared || (!initial && count > knownClear);
      const active = controls.find(item => item.status === 'play') ?? controls.filter(item => item.action === 'open').at(-1);
      if (initial || newlyCleared) {
        active?.reveal();
        if (newlyCleared) focus = count === content.chapter.missions.length ? 'story-map' : active?.id;
      } else if (!preserve && ['briefing', 'failure', 'pause', 'success'].includes(previous)) {
        focus = `mission:${lastMission}`;
      }
      knownClear = count;
      wasCleared = false;
    }
    if (!controls.some(item => item.id === focus)) focus = null;
    // Rebuilding Story on resize should keep the chosen viewport, even if its focused pin is offscreen.
    if (focus) focusOn(focus, !preserve || !map);
    previous = phase;
    if (phase === 'driving' || dialogs.has(phase)) focusCanvas();
    draw(effects.input());
    // Commit the new screen before subsequent pointer events can hit it.
    effects.present();
  }

  function draw(input) {
    drawDrive?.(input, drivingPointers.get('steer')?.offset);
    effects.invalidate();
  }

  function visibleControls() {
    return controls.filter(item => {
      if (!item.enabled || item.steeringTravel) return false;
      if (vehicleOpen) return item.role === 'option';
      return true;
    });
  }

  function scrollMapTo(offset) {
    if (!map?.position(offset)) return;
    drawFocus();
    effects.invalidate();
  }

  function key(event) {
    const { code, repeat } = event;
    if (code === 'Escape' && vehicleOpen) {
      if (!repeat) toggleVehicle();
      return true;
    }
    if (code === 'Escape' && escapeAction[state.phase]) {
      if (!repeat) effects.act(escapeAction[state.phase]);
      return true;
    }
    const enabled = visibleControls();
    const current = enabled.findIndex(item => item.id === focus);
    const control = enabled[current];
    if (code === 'Tab') {
      if (!enabled.length) return false;
      const change = event.shiftKey ? -1 : 1;
      const initial = event.shiftKey ? enabled.length - 1 : 0;
      if (!dialogs.has(state.phase) && current >= 0 && (current + change < 0 || current + change >= enabled.length)) {
        focusOn(null);
        return false;
      }
      const index = current < 0 ? initial : (current + change + enabled.length) % enabled.length;
      focusOn(enabled[index].id, true);
      return true;
    }
    if (vehicleOpen && ['ArrowUp', 'ArrowDown'].includes(code) && enabled.length) {
      const next = (current + (code === 'ArrowUp' ? -1 : 1) + enabled.length) % enabled.length;
      focusOn(enabled[next].id);
      return true;
    }
    if (control?.role === 'tab' && ['ArrowLeft', 'ArrowRight'].includes(code)) {
      const tabs = enabled.filter(item => item.role === 'tab');
      const i = tabs.indexOf(control);
      focusOn(tabs[(i + (code === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length].id);
      return true;
    }
    if (map) {
      const { offset } = scroll;
      const page = app.screen.height * .7;
      const destinations = {
        ArrowUp: offset - 65, ArrowDown: offset + 65, PageUp: offset - page, PageDown: offset + page,
        Home: scroll.min, End: scroll.max,
      };
      if (Object.hasOwn(destinations, code)) {
        scrollMapTo(destinations[code]);
        return true;
      }
    }
    if ((code === 'Space' || code === 'Enter') && control) {
      if (control.drive && state.phase === 'driving') effects.press(code, control.drive, repeat);
      else if (!repeat) activate(control);
      return true;
    }
    return false;
  }

  stage.on('pointerdown', e => {
    swipe.delete(e.pointerId);
    if (map && !drag && e.button === 0 && e.global.y < app.screen.height - 58) {
      focusCanvas();
      drag = { start: e.global.y, last: e.global.y, id: e.pointerId };
      effects.capture(e.pointerId);
    }
  });
  stage.on('globalpointermove', e => {
    if (!drag || drag.id !== e.pointerId) return;
    if (swipe.has(e.pointerId) || Math.abs(e.global.y - drag.start) >= 7) {
      swipe.add(e.pointerId);
      scrollMapTo(scroll.offset + (drag.last - e.global.y));
      drag.last = e.global.y;
    }
  });

  function release(id) {
    if (drag?.id === id) drag = undefined;
    for (const [kind, hold] of drivingPointers) {
      if (hold.id === id) return drivingPointers.delete(kind);
    }
    return false;
  }

  canvas.addEventListener('pointermove', event => {
    const hold = drivingPointers.get('steer');
    if (!hold || hold.id !== event.pointerId) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const point = {
      x: (event.clientX - bounds.left) * app.screen.width / bounds.width,
      y: (event.clientY - bounds.top) * app.screen.height / bounds.height,
    };
    if (updateSteering(hold, point)) draw(effects.input());
  });
  canvas.addEventListener('wheel', event => {
    if (!map || event.ctrlKey) return;
    event.preventDefault();
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? app.screen.height : 1;
    scrollMapTo(scroll.offset + event.deltaY * multiplier);
  }, { passive: false });
  canvas.addEventListener('focus', () => { if (focusRing) drawFocus(); effects.invalidate(); });
  canvas.addEventListener('blur', () => { if (focusRing) drawFocus(); effects.invalidate(); });

  return {
    show, draw, key, release,
    steering: () => drivingPointers.get('steer')?.offset.steering ?? 0,
    *heldDirections() {
      for (const { direction } of drivingPointers.values()) {
        if (direction) yield direction;
      }
    },
    cancel() { drag = undefined; swipe.clear(); drivingPointers.clear(); },
    notice(value) { notice = value; },
    observation: () => ({ controls, focus, scroll, modal: dialogs.has(state.phase) ? state.phase : null }),
  };
}
