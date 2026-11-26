# Chapter 1 build and checks

The accepted first playable Chapter 1 foundation opens the authored 21-mission Canal Ward sequence. Three straight-to-marker jobs lead into steering, pickup, and pursuit practice. Story dialogue is placeholder copy and art is provisional. The player starts with one owned Starter Coupe. Vehicle eligibility is covered by tests. Shop, Daily Missions, and Chapter 2 are unavailable. This build runs locally. Platform SDK integration, final balance, and driving feel are pending.

## Run locally

From the project root, run:

```powershell
node scripts/serve.mjs
```

Open [Chapter 1](http://127.0.0.1:8080/) in a browser. Use the HTTP address so the browser can load the modules and authored JSON. The server listens only on `127.0.0.1`. If port 8080 is busy, run `node scripts/serve.mjs 8081` and open the printed address. Stop the server with **Ctrl+C**.

`index.html` loads the runtime in `src/` and the authored `src/content/world.json` and `src/content/chapter1.json`. The normal URL loads authored content. The separate `?fixture=1` route is for engineering checks and uses its own save key. The rebuild keeps a separate browser save from the legacy `heatwave-getaway-prototype.html`, which remains available as the earlier four-job build.

## Controls

- Acceleration is automatic. The first mission can clear with hands off the controls.
- Steer with **Left / Right** or **A / D**. Brake with **Down**, **S**, or **Space**.
- On touch, press and hold the on-screen **Left**, **Brake**, or **Right** controls.
- Pause with **Esc** or the on-screen **Pause** button.

## Run checks

```powershell
node scripts/check-content.mjs
node --test tests/runtime.test.mjs tests/authored-content.test.mjs
node --test tests/browser/acceptance.test.mjs
```

The browser suite starts its own local server and launches an installed Edge, Chrome, or Chromium with an isolated temporary profile. It uses Node.js's built-in WebSocket client and prints its screenshot directory. Set `GTC_BROWSER` to the browser executable path if detection fails.

**Verification on 26 November 2026.** All 21 missions passed content validation. All 15 runtime and authored-content tests passed, including an uninterrupted steering and braking simulation through all 21 main jobs and 21 bonuses. The PM independently passed all seven browser acceptance tests in installed Edge. Those representative checks covered desktop at 1200×800 and touch at 390×600 and 320×568, opening-target visibility, clears and reloads, single banking, bonus return, success and failure, damage carryover, and Story scroll wrap and menus.

## Implementation credits

- Runtime foundation · `01a21715-58f8-7240-a570-6a6639be9a2f` · Sol High
- Authored world · `01a21718-8bd6-7933-9b8d-0fb0c5da16de` · Sol Medium
- Authored missions · `01a21717-f2b1-70e2-9305-357cf6b441c4` · Sol High
- Browser acceptance · `01a21721-79e6-7972-b510-5268325bbac8` · Sol High
