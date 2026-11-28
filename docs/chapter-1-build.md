# Chapter 1 build and checks

The accepted Pixi Chapter 1 build opens the authored 21-mission Canal Ward sequence. Missions 1 and 2 clear hands-off. In the local build, Mission 3 follows a straight street with a small right correction to a house-front finish. Bend practice starts at Mission 4, followed by pickup and pursuit practice. The Mission 3 change is pending release. Story dialogue is placeholder copy, and production world and failure art and detailed Garage visuals remain open. The player starts with one owned Starter Coupe. Vehicle eligibility is covered by tests. Shop, Daily Missions, and Chapter 2 are unavailable. This build runs locally. Platform SDK integration, final balance, and driving feel are pending. [26 November PM handoff](HANDOFF-2026-11-26.md)

## Run locally

From the project root, run:

```powershell
npm ci
node scripts/serve.mjs
```

Open [Chapter 1](http://127.0.0.1:8080/) in a browser. Use the HTTP address so the browser can load the modules and authored JSON. The server listens only on `127.0.0.1`. If port 8080 is busy, run `node scripts/serve.mjs 8081` and open the printed address. Stop the server with **Ctrl+C**.

`index.html` hosts one focusable canvas. The server serves PixiJS `8.23.0` at `/vendor/pixi.mjs` from the locked local install. The normal URL loads authored content from `src/content/world.json` and `src/content/chapter1.json`. `?fixture=1` selects the engineering fixture with its own save key. `?observe=1` opt-in exposes read-only test observations. The rebuild’s save is scoped to the browser origin and profile. The legacy `heatwave-getaway-prototype.html` uses its own save key.

## GitHub Pages

Push to `main` to publish. GitHub Actions builds and deploys the game automatically. Check the latest deploy in [GitHub Actions](https://github.com/mcorcosa/getaway-total-accident/actions/workflows/pages.yml), then open [Getaway Total Accident](https://mcorcosa.github.io/getaway-total-accident/). The hosted game and localhost keep separate browser saves.

**Optional local check.** From the project root, run the following to package the site and smoke-test it under the repository subpath. The test starts its own local server and clears and banks Mission 1.

```sh
npm ci
npm run build:pages
node --test --test-reporter=spec tests/browser/pages-smoke.test.mjs
```

## Controls

- Acceleration is automatic. Missions 1 and 2 can clear with hands off the controls.
- Steer with **Left / Right** or **A / D**. Brake with **Down**, **S**, or **Space**.
- On touch in the **local prototype**, put your thumb anywhere on the **bottom-right steering pad** and slide sideways. A small slide turns gently. Return to where your thumb started horizontally or lift it to stop steering. Hold the **left pedal** to brake while steering.
- Hold the brake to stop and stay stopped. Release it to move forward automatically.
- As of 27 November 2026, the hosted GitHub Pages build uses the earlier steering wheel. Start on its center for sideways corrections or on its outer rim to rotate.
- Pause with **Esc** or the on-screen **Pause** button.

## Run checks

```powershell
node scripts/check-content.mjs
node --test tests/runtime.test.mjs tests/authored-content.test.mjs
node --test --test-reporter=spec tests/browser/acceptance.test.mjs
```

The browser suite starts its own local server and launches an installed Edge, Chrome, or Chromium with an isolated temporary profile. It uses Node.js's built-in WebSocket client and prints its screenshot directory. Set `GTC_BROWSER` to the browser executable path if detection fails.

**Revised Pixi checkpoint, 26 November 2026.** Engineering independently validated all 21 missions and passed all 15 unchanged Node tests and all 14 installed Edge tests. The Windows run used Node `24.11.1`, npm `11.6.2`, Edge `158.0.4370.33`, and PixiJS `8.23.0` in WebGL. The suite checks single-canvas compliance, real pointer, multitouch and keyboard input, Story wrap, compact collisions, resize and focus, fixture isolation, and bank, bonus, reload, and replay flows. Art passed the desktop joins, compact and desktop postcard framing, and compact collision-HUD revisions. The PM accepted the frozen build. [Checkpoint evidence and scope](HANDOFF-2026-11-26.md#current-implementation-and-evidence)

**Foundation verification on 26 November 2026.** All 21 missions passed content validation. All 15 runtime and authored-content tests passed, including an uninterrupted steering and braking simulation through all 21 main jobs and 21 bonuses. The PM independently passed all seven browser acceptance tests in installed Edge. Those representative checks covered desktop at 1200×800 and touch at 390×600 and 320×568, opening-target visibility, clears and reloads, single banking, bonus return, success and failure, damage carryover, and Story scroll wrap and menus.

## Pixi presentation migration

On 26 November 2026 the owner required Pixi to render the Story map, game controls, and all game presentation. HTML serves solely as the canvas host. The instruction is in PM chat `01a2175b-11c4-7230-9b26-0216587bad64`, message `01a217b1-3321-76d1-b8ca-b2b469fdd3c2`. The HTML-based postcard and HUD work is paused, with its partial changes preserved.

**Pixi Game UI Implementer** (`01a217b3-3544-71e1-9d30-c02d153a126c`, `gpt-6.2-sol` High requested) completed the accepted migration and visual revisions. The pre-port backup stayed on the original machine. Six independent Edge captures are portable under `docs/evidence/2026-11-26/`. [Assignment ownership and status](team-roster.md#pixi-presentation-migration)

## Story map and shared navigation review

**Assignment A, reviewed 26 November 2026.** Engineering independently passed content validation, all 15 Node tests, and all eight installed Edge browser tests on the HTML-based handoff snapshot. The checks covered live Play across the wrap, reload and single banking, keyboard replay, and menu destinations. The normal authored build retained the live 21-mission progression. The fourth navigation tile said **Story** and opened Home. The locked Neon Strip marker followed mission 21.

The Art Director passed the Story/Home map and shared bottom navigation visuals at 390×600, 320×568, and 1200×800 with no blocking revisions. Art verified that screenshots at equivalent wrap positions were byte-identical in both directions. The PM opened the comparison. The reviewed visuals carry forward as a target for the Pixi implementation. The independent side-by-side capture is a temporary local file at `C:\Users\Trust Chain\AppData\Local\Temp\gtc-chapter1-browser-evidence-5vjFdM\story-target-vs-actual.png`. [Owner-confirmed Story map reference](../assets/references/story-map-approved.png)

Engineering stored the reviewed snapshot’s SHA-256 file hashes in command `exec-13344bfe-7f89-4ff1-b60b-01d2aad3fb88` in turn `01a21799-44e6-7b81-8e75-db78b8e7fdc5`. Art’s visual pass is in turn `01a217ab-0f69-75c3-bcba-473b4a3f9ceb`.

## Implementation credits

- Runtime foundation · `01a21715-58f8-7240-a570-6a6639be9a2f` · Sol High
- Authored world · `01a21718-8bd6-7933-9b8d-0fb0c5da16de` · Sol Medium
- Authored missions · `01a21717-f2b1-70e2-9305-357cf6b441c4` · Sol High
- Browser acceptance · `01a21721-79e6-7972-b510-5268325bbac8` · Sol High
- Story/Home map and shared navigation · `01a21799-e7d2-71b1-b09d-b78e6ff82194` · `gpt-6.2-sol` High requested
