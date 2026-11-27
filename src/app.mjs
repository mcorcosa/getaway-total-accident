import { createGame } from './game-state.mjs';
import { loadContent } from './content-loader.mjs';
import { progressStore } from './save.mjs';
import { STEP } from './simulation.mjs';

const keyMap = new Map([
  ['ArrowLeft', 'left'], ['KeyA', 'left'], ['ArrowRight', 'right'], ['KeyD', 'right'],
  ['ArrowDown', 'brake'], ['KeyS', 'brake'], ['Space', 'brake'],
]);
const params = new URLSearchParams(location.search);
const localEngineering = !document.documentElement.hasAttribute('data-pages-build');
const fixture = localEngineering && params.get('fixture') === '1';
const canvas = document.getElementById('stage');
for (const type of ['selectstart', 'contextmenu']) {
  canvas.addEventListener(type, event => event.preventDefault());
}

function start(app, gameUI, content, textures, attachObservation) {
  let notice = '';
  let ui;
  let dirty = true;
  let lastFrame;
  let accumulator = 0;
  const store = progressStore(content.chapter, {
    fixture, getStorage: () => localStorage,
    onNotice(message) { notice = message; ui?.notice(message); },
  });
  const game = createGame(content, store);
  const keys = new Map();
  const captures = new Set();
  const coarsePointer = window.matchMedia('(any-pointer: coarse)');

  function input() {
    const active = new Set([...keys.values(), ...ui.heldDirections()]);
    const left = active.has('left');
    const right = active.has('right');
    const pad = left || right ? undefined : ui.steeringInput();
    const steering = pad?.steering ?? Number(right) - Number(left);
    const held = { left: left || steering < 0, right: right || steering > 0, brake: active.has('brake'), steering };
    if (pad?.touch && steering) held.touchSteering = true;
    return held;
  }

  function clearPointerInput() {
    ui.cancel();
    for (const id of captures) {
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    }
    captures.clear();
  }

  function clearInput() {
    keys.clear();
    clearPointerInput();
    accumulator = 0;
    lastFrame = undefined;
  }

  function act(action, value) {
    const previous = game.state.phase;
    if (!game.dispatch(action, value)) return false;
    if (previous !== game.state.phase) clearInput();
    ui.show(previous === game.state.phase);
    return true;
  }

  function capture(id) {
    if (!canvas.hasPointerCapture(id)) canvas.setPointerCapture(id);
    captures.add(id);
  }

  function press(code, direction, repeat) {
    if (!repeat) keys.set(code, direction);
    ui.draw(input());
  }

  function present() {
    app.render();
    dirty = false;
  }

  ui = gameUI(app, content, textures, game, {
    act, input, capture, press,
    hasTouchInput: () => coarsePointer.matches || navigator.maxTouchPoints > 0,
    invalidate() { dirty = true; },
    present,
  });
  ui.notice(notice);
  ui.show();
  canvas.focus({ preventScroll: true });
  attachObservation?.(app, ui, game, input);

  canvas.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (ui.key(event)) {
      event.preventDefault();
      return;
    }
    const direction = keyMap.get(event.code);
    if (game.state.phase !== 'driving' || !direction) return;
    event.preventDefault();
    press(event.code, direction, event.repeat);
  });
  window.addEventListener('keyup', event => {
    if (keys.delete(event.code)) ui.draw(input());
  });
  canvas.addEventListener('blur', () => {
    clearInput();
    ui.draw(input());
  });

  function release(event) {
    captures.delete(event.pointerId);
    if (ui.release(event.pointerId)) ui.draw(input());
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    window.addEventListener(type, release, true);
  }

  function pauseOnLeave() {
    if (!act('pause')) {
      clearInput();
      ui.draw(input());
    }
  }
  window.addEventListener('blur', pauseOnLeave);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseOnLeave(); });
  new ResizeObserver(() => {
    if (!resize(app)) return;
    if (game.state.phase === 'driving') clearPointerInput();
    ui.show(true);
  }).observe(canvas);
  coarsePointer.addEventListener('change', () => {
    if (game.state.phase !== 'driving') return;
    clearPointerInput();
    ui.show(true);
  });

  function frame(now) {
    if (game.state.phase === 'driving') {
      accumulator += Math.min(.1, (now - (lastFrame ?? now)) / 1000);
      lastFrame = now;
      const held = input();
      while (accumulator >= STEP) {
        accumulator -= STEP;
        if (game.tick(held, STEP)) {
          clearInput();
          ui.show();
          break;
        }
      }
      if (game.state.phase === 'driving') ui.draw(held);
    }
    if (dirty) present();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function resize(app) {
  const { clientWidth: width, clientHeight: height } = canvas;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (!width || !height || (width === app.screen.width && height === app.screen.height && ratio === app.renderer.resolution)) return false;
  app.renderer.resize(width, height, ratio);
  canvas.style.removeProperty('width');
  canvas.style.removeProperty('height');
  return true;
}

try {
  const { Application } = await import('../vendor/pixi.mjs');
  const app = new Application();
  await app.init({
    canvas, width: canvas.clientWidth, height: canvas.clientHeight, autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2), background: '#101c3a',
    autoStart: false, preference: 'webgl', antialias: true,
    accessibilityOptions: { enabledByDefault: false, activateOnTab: false },
  });
  // CSS owns the viewport dimensions, including changes in the mobile browser toolbar.
  canvas.style.removeProperty('width');
  canvas.style.removeProperty('height');
  const { gameUI, statusScene } = await import('./ui.mjs');
  const { loadImages } = await import('./pixi/assets.mjs');
  statusScene(app, 'Loading Palmera Bay');
  try {
    const [content, textures] = await Promise.all([loadContent({ fixture }), loadImages()]);
    const observer = localEngineering && params.get('observe') === '1' ? await import('./pixi/observe.mjs') : null;
    resize(app);
    start(app, gameUI, content, textures, observer?.attachObservation);
  } catch (error) {
    const renderError = () => statusScene(app, 'Chapter 1 could not load', error.message, localEngineering && !fixture);
    renderError();
    new ResizeObserver(() => { if (resize(app)) renderError(); }).observe(canvas);
  }
} catch (error) {
  canvas.setAttribute('aria-label', 'Getaway Total Accident could not initialize its Pixi renderer.');
  document.title = 'Getaway Total Accident — Renderer unavailable';
  console.error(error);
}
