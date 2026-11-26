# Getaway Totally Accidental

A top-down arcade driving comedy set in Palmera Bay. The current build is the first playable Chapter 1 foundation, with 21 Canal Ward missions and one optional bonus per mission. Story dialogue and artwork are provisional.

## Clone and run

After the Git Operator confirms the repository is available, clone it and open the checkout.

```sh
git clone https://github.com/mcorcosa/getaway-total-accident.git
cd getaway-total-accident
node scripts/serve.mjs
```

Open [Chapter 1 locally](http://127.0.0.1:8080/) in a browser. Use HTTP so the browser can load the modules and authored JSON. Pass a port to the server if 8080 is busy. The project uses browser modules and Node.js built-ins, so there is no package install or build step. Start with a supported Node.js LTS with the built-in WebSocket client, such as Node 24 LTS. The acceptance run used Node 25.6.0 and installed Edge 158. [Node release status](https://nodejs.org/en/about/previous-releases) · [Node WebSocket API](https://nodejs.org/download/release/v24.0.2/docs/api/globals.html#websocket)

```sh
node scripts/check-content.mjs
node --test tests/runtime.test.mjs tests/authored-content.test.mjs
node --test tests/browser/acceptance.test.mjs
```

The browser suite uses an installed Edge, Chrome, or Chromium with a temporary profile. See the [build guide](docs/chapter-1-build.md) for controls, browser discovery, and the verified scope.

## Resume on another machine

1. Open this checkout as the **Grand Theft Casual** project in Codex.
2. Read the [migration handoff](docs/MIGRATION-HANDOFF.md) for the accepted state, current decisions, and recovery checks.
3. If you need a new PM chat, paste the [PM startup prompt](docs/PROJECT-MANAGER-START-PROMPT.md) into a named chat in that project. Use the [team roster](docs/team-roster.md) to recover roles and routing.

The [working design](HEATWAVE-GETAWAY-DESIGN.md) holds the ordered Chapter 1 plan. The [legacy four-job prototype](heatwave-getaway-prototype.html) is kept for comparison. Browser saves live on the machine and browser origin where they were created.
