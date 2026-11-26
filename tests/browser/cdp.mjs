import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const host = '127.0.0.1';
const profilePrefix = 'gtc-chapter1-browser-profile-';
const programFiles = process.env.ProgramFiles ?? 'C:/Program Files';
const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)';

export async function poll(read, description, timeout = 5000) {
  const end = Date.now() + timeout;
  do {
    const value = await read();
    if (value) return value;
    await delay(40);
  } while (Date.now() < end);
  throw new Error(`Timed out waiting for ${description}`);
}

async function browserPath() {
  const candidates = process.env.GTC_BROWSER ? [process.env.GTC_BROWSER] : [
    join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium',
  ];
  for (const file of candidates) {
    try {
      await access(file);
      return resolve(file);
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
    }
  }
  throw new Error('Set GTC_BROWSER to the path of an installed Edge, Chrome or Chromium executable.');
}

class Connection {
  #socket;
  #id = 0;
  #pending = new Map();
  #listeners = new Set();

  constructor(socket) {
    this.#socket = socket;
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      const request = this.#pending.get(message.id);
      if (request) {
        this.#pending.delete(message.id);
        clearTimeout(request.timer);
        if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
        else request.resolve(message.result);
      } else if (message.method) {
        for (const listener of this.#listeners) listener(message);
      }
    });
    socket.addEventListener('close', () => {
      for (const request of this.#pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error(`Browser disconnected during ${request.method}`));
      }
      this.#pending.clear();
    });
  }

  send(method, params = {}, sessionId) {
    if (this.#socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`Browser disconnected before ${method}`));
    }
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 5000);
      this.#pending.set(id, { method, resolve, reject, timer });
      this.#socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  close() {
    this.#socket.close();
  }
}

export async function launchBrowser() {
  const executable = await browserPath();
  const tempRoot = await realpath(tmpdir());
  const profile = await mkdtemp(join(tempRoot, profilePrefix));
  assert.equal(dirname(profile), tempRoot, 'Browser profile must be a direct child of the temp directory');
  assert.ok(basename(profile).startsWith(profilePrefix));
  const child = spawn(executable, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--enable-unsafe-swiftshader',
    `--user-data-dir=${profile}`, `--remote-debugging-address=${host}`, '--remote-debugging-port=0', 'about:blank',
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr = (stderr + chunk).slice(-3000); });
  const exit = once(child, 'exit').then(([code, signal]) => ({ code, signal }), error => ({ error }));
  let stopped;
  void exit.then(result => { stopped = result; });
  let connection;

  async function close() {
    if (connection) {
      await connection.send('Browser.close').catch(() => {});
      connection.close();
    }
    if (!stopped) await Promise.race([exit, delay(5000, undefined, { ref: false })]);
    if (!stopped) {
      child.kill();
      await Promise.race([exit, delay(2000)]);
    }
    assert.ok(stopped, `Headless browser process ${child.pid} did not exit`);
    child.stderr.destroy();
    const removalPath = await realpath(profile);
    assert.equal(dirname(removalPath), tempRoot, 'Browser profile resolved outside the temp directory');
    assert.equal(removalPath, profile, 'Browser profile resolved to a different path');
    await rm(removalPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }

  try {
    const endpoint = await poll(async () => {
      if (stopped) throw new Error(`Headless browser exited: ${stopped.error?.message ?? stopped.code}\n${stderr}`);
      let address;
      try {
        address = await readFile(join(profile, 'DevToolsActivePort'), 'utf8');
      } catch (error) {
        if (['ENOENT', 'EBUSY', 'EPERM'].includes(error.code)) return undefined;
        throw error;
      }
      const [port, endpointPath] = address.trim().split(/\r?\n/);
      return /^\d+$/.test(port) && Number(port) > 0 && Number(port) <= 65535 &&
        /^\/devtools\/browser\/[a-f\d-]+$/i.test(endpointPath) && `ws://${host}:${port}${endpointPath}`;
    }, 'the browser loopback endpoint', 10000);
    const socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error('Could not connect to the local browser debug endpoint'));
      }, 5000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Local browser WebSocket failed')); }, { once: true });
    });
    connection = new Connection(socket);
    const version = await connection.send('Browser.getVersion');
    return { connection, version: version.product, executable, close };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Browser startup and cleanup failed');
    }
    throw error;
  }
}

const keys = {
  ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, Enter: 13, Escape: 27, Space: 32, Tab: 9,
};

export async function openPage(connection, url, { width = 1200, height = 800, mobile = false } = {}) {
  const { browserContextId } = await connection.send('Target.createBrowserContext', { disposeOnDetach: true });
  const errors = [];
  const responses = new Map();
  const requests = new Map();
  let unsubscribe;
  const close = async () => {
    unsubscribe?.();
    await connection.send('Target.disposeBrowserContext', { browserContextId });
  };

  try {
    const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => connection.send(method, params, sessionId);
    unsubscribe = connection.subscribe(event => {
      if (event.sessionId !== sessionId) return;
      const { method, params } = event;
      if (method === 'Runtime.exceptionThrown') {
        const details = params.exceptionDetails;
        errors.push(details.exception?.description ?? details.text);
      }
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
        errors.push(`console.error: ${params.args.map(arg => arg.value ?? arg.description).join(' ')}`);
      }
      if (method === 'Network.requestWillBeSent') requests.set(params.requestId, params.request.url);
      if (method === 'Network.responseReceived') {
        const { status, url: responseUrl } = params.response;
        const pathname = new URL(responseUrl).pathname;
        responses.set(pathname, status);
        // Chromium may request a favicon even when the document declares none.
        if (status >= 400 && !(pathname === '/favicon.ico' && status === 404 && params.type === 'Other')) {
          errors.push(`HTTP ${status} ${responseUrl}`);
        }
      }
      if (method === 'Network.loadingFailed' && !params.canceled) {
        errors.push(`${params.errorText} ${requests.get(params.requestId) ?? params.requestId}`);
      }
    });
    await Promise.all(['Runtime.enable', 'Network.enable', 'Page.enable'].map(method => send(method)));
    await send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height,
    });
    if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
    await send('Page.bringToFront');
    const navigation = await send('Page.navigate', { url });
    assert.ok(!navigation.errorText, navigation.errorText);

    async function read(fn, ...args) {
      const values = args.map(arg => JSON.stringify(arg)).join(', ');
      const result = await send('Runtime.evaluate', {
        expression: `(${fn})(${values})`, returnByValue: true, awaitPromise: true,
      });
      if (result.exceptionDetails) {
        const details = result.exceptionDetails;
        throw new Error(details.exception?.description ?? details.text);
      }
      return result.result.value;
    }

    async function center(id) {
      return read(id => {
        const scene = window.__getawayScene();
        const control = scene.controls.find(item => item.id === id);
        if (!control?.visible) throw new Error(`Hidden or missing control ${id}`);
        const box = control.bounds;
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        if (document.elementFromPoint(x, y) !== document.querySelector('canvas')) throw new Error(`Control ${id} is outside the canvas`);
        return { x, y };
      }, id);
    }

    async function click(selector, count = 1) {
      const point = await center(selector);
      for (let n = 1; n <= count; n += 1) {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: n });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: n });
      }
    }

    async function key(code, type, modifiers = 0) {
      const virtualKey = keys[code];
      assert.ok(virtualKey, `Missing CDP mapping for ${code}`);
      const text = code === 'Enter' && type === 'rawKeyDown' ? '\r' : undefined;
      await send('Input.dispatchKeyEvent', {
        type: text ? 'keyDown' : type, code, key: code, text, unmodifiedText: text,
        windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey, modifiers,
      });
    }

    async function press(code, modifiers = 0) {
      await key(code, 'rawKeyDown', modifiers);
      await key(code, 'keyUp', modifiers);
    }

    async function pixels() {
      const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      return Buffer.from(result.data, 'base64');
    }

    async function screenshot(path) {
      await writeFile(path, await pixels());
    }

    async function background() {
      const other = await connection.send('Target.createTarget', { url: 'about:blank', browserContextId });
      await connection.send('Target.activateTarget', { targetId: other.targetId });
      return async () => {
        await connection.send('Target.closeTarget', { targetId: other.targetId });
        await send('Page.bringToFront');
      };
    }

    return { send, read, center, click, key, press, pixels, screenshot, background, close, errors, responses, requests };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Browser page setup and cleanup failed');
    }
    throw error;
  }
}
