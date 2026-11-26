import { createGame } from './game-state.mjs';
import { loadContent } from './content-loader.mjs';
import { progressStore } from './save.mjs';
import { STEP } from './simulation.mjs';
import { gameUI } from './ui.mjs';

const keyMap = new Map([
  ['ArrowLeft', 'left'], ['KeyA', 'left'], ['ArrowRight', 'right'], ['KeyD', 'right'],
  ['ArrowDown', 'brake'], ['KeyS', 'brake'], ['Space', 'brake'],
]);
const fixture = new URLSearchParams(location.search).get('fixture') === '1';

function startApp(content) {
  const notice = document.getElementById('notice');
  const store = progressStore(content.chapter, {
    fixture,
    getStorage: () => localStorage,
    onNotice(message) {
      notice.textContent = message;
      notice.hidden = !message;
    },
  });
  const game = createGame(content, store);
  const keys = new Map();
  const pointers = new Map();
  const controls = [...document.querySelectorAll('[data-drive]')];
  let lastFrame;
  let accumulator = 0;

  function input() {
    const active = new Set(keys.values());
    for (const { dataset } of pointers.values()) active.add(dataset.drive);
    return { left: active.has('left'), right: active.has('right'), brake: active.has('brake') };
  }

  function displayInput() {
    const held = input();
    for (const control of controls) control.dataset.held = String(held[control.dataset.drive]);
  }

  function clearInput() {
    keys.clear();
    for (const [id, control] of pointers) {
      if (control.hasPointerCapture(id)) control.releasePointerCapture(id);
    }
    pointers.clear();
    displayInput();
    accumulator = 0;
    lastFrame = undefined;
  }

  function act(action, value) {
    const previous = game.state.phase;
    if (!game.dispatch(action, value)) return false;
    if (previous !== game.state.phase) {
      clearInput();
      ui.render();
    }
    return true;
  }

  const ui = gameUI(content, game, act);
  document.getElementById('loading').hidden = true;
  ui.render();

  function keyDown(event) {
    if (game.state.phase !== 'driving' || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      if (!event.repeat) act('pause');
    } else {
      const focusedButton = document.activeElement?.closest('button');
      const activate = event.code === 'Space' || event.code === 'Enter';
      const direction = activate && focusedButton ? focusedButton.dataset.drive : keyMap.get(event.code);
      if (direction) {
        event.preventDefault();
        if (!event.repeat) keys.set(event.code, direction);
        displayInput();
      }
    }
  }

  function clearPointer(event) {
    pointers.delete(event.pointerId);
    displayInput();
  }

  document.addEventListener('keydown', keyDown);
  document.addEventListener('keyup', event => {
    keys.delete(event.code);
    displayInput();
  });
  document.getElementById('play').addEventListener('focusout', () => {
    if (game.state.phase === 'driving') clearInput();
  });
  for (const control of controls) {
    control.addEventListener('pointerdown', event => {
      if (game.state.phase !== 'driving' || event.button !== 0) return;
      event.preventDefault();
      control.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, control);
      displayInput();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      control.addEventListener(type, clearPointer);
    }
  }
  function pauseOnLeave() {
    if (!act('pause')) clearInput();
  }
  window.addEventListener('blur', pauseOnLeave);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseOnLeave();
  });

  function frame(now) {
    if (game.state.phase === 'driving') {
      accumulator += Math.min(.1, (now - (lastFrame ?? now)) / 1000);
      lastFrame = now;
      const settings = input();
      while (accumulator >= STEP) {
        accumulator -= STEP;
        if (game.tick(settings, STEP)) {
          clearInput();
          ui.render();
          break;
        }
      }
      if (game.state.phase === 'driving') ui.draw();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

try {
  startApp(await loadContent({ fixture }));
} catch (error) {
  document.getElementById('load-title').textContent = 'Chapter 1 could not load';
  document.getElementById('load-detail').textContent = error.message;
  document.getElementById('fixture-link').hidden = fixture;
}
