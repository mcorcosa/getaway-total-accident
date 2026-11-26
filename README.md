# Getaway Total Accident

A top-down arcade driving comedy set in Palmera Bay. The accepted Chapter 1 Pixi build has 21 Canal Ward missions and one optional bonus per mission. Final story dialogue and production artwork remain open.

**Moving to a new machine.** Start with the [26 November PM handoff](docs/HANDOFF-2026-11-26.md) for the accepted checkpoint, verification evidence, role recovery, and restart prompt.

## Clone and run

After the Git Operator confirms the repository is available, clone it and open the checkout.

```sh
git clone https://github.com/mcorcosa/getaway-total-accident.git
cd getaway-total-accident
npm ci
node scripts/serve.mjs
```

Open [Chapter 1 locally](http://127.0.0.1:8080/) in a browser. Use HTTP to load the modules, authored JSON, and the local PixiJS `8.23.0` dependency from the locked npm install. Pass a port to the server if 8080 is busy. The final Windows verification used Node `24.11.1`, npm `11.6.2`, and installed Edge `158.0.4370.33`. [Build and checks](docs/chapter-1-build.md)

```sh
node scripts/check-content.mjs
node --test tests/runtime.test.mjs tests/authored-content.test.mjs
node --test tests/browser/acceptance.test.mjs
```

The browser suite uses an installed Edge, Chrome, or Chromium with a temporary profile. See the [build guide](docs/chapter-1-build.md) for controls, browser discovery, and the verified scope.

For the static package and deployment workflow, see [GitHub Pages](docs/chapter-1-build.md#github-pages).

## Resume on another machine

1. Open this checkout in the verified Codex sidebar project. The current local label is **Getaway Total Accident**. Use the [team roster](docs/team-roster.md) to verify the project binding.
2. Read the [latest PM handoff](docs/HANDOFF-2026-11-26.md) for the accepted state, current decisions, and recovery checks. The [earlier migration handoff](docs/MIGRATION-HANDOFF.md) records the foundation checkpoint.
3. If you need a new PM chat, paste the [PM startup prompt](docs/PROJECT-MANAGER-START-PROMPT.md) into a named chat in that project. Use the [team roster](docs/team-roster.md) to recover roles and routing.

The [working design](HEATWAVE-GETAWAY-DESIGN.md) holds the ordered Chapter 1 plan. The [legacy four-job prototype](heatwave-getaway-prototype.html) is kept for comparison. Browser saves live on the machine and browser origin where they were created.
