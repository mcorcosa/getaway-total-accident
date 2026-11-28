# Vehicle art workflow

Create one vehicle identity for Story, Garage, and gameplay. Use the [working visual direction](../HEATWAVE-GETAWAY-DESIGN.md#visual-direction), the [vehicle registry](../src/vehicles.mjs), and the [project setup](ai-setup.md) before briefing the work.

## 1. Brief and select the reference

1. Get the vehicle ID and authored length and width from `src/vehicles.mjs`. Agree on the vehicle-specific body and paint, roof and silhouette, doors and glazing, bumpers, lamps, wheels, and recognizable details. Use the registry footprint for the sprite envelope. Route any change to collision stats, eligibility, unlocks, or saves as a separate game-design decision.
2. In built-in ImageGen, attach the approved [Canal Ward gameplay image](../assets/references/canal-ward-gameplay-style.png) as a style-only reference. Generate one master board of the same vehicle with front three-quarter for Garage, rear three-quarter for Story, a true side elevation, and a straight-down orthographic plan with the nose pointing right (`+x`). Compare silhouette, doors, glazing, bumpers, lamps, wheels, and paint across all views before selecting a board.
3. Save the selected master in `assets/references/vehicles/<vehicle-id>/`. Export exact quadrant crops where useful. Record the exact selected prompt, input path, source ID, and output filenames in the companion prompt record. Label the master as a preview or approved visual design according to the actual decision.

For future Story and Garage compositions, attach the matching master panel as the vehicle identity source. Preserve the vehicle’s silhouette, paint, doors, glazing, bumpers, lamps, and wheels as scene lighting and composition change.

## 2. Make and check the gameplay sprite

1. Attach the selected overhead crop directly to built-in ImageGen as the identity and edit input. Request a transparent plan-view sprite with the nose right. Fit the entire silhouette, including mirrors, inside the authored length and width at **4 px per world unit**. Correct proportions on the source before export, then resize uniformly. Keep the lamps unlit and leave headlight beams, glows, and cast shadows to runtime effects.
2. Package an sRGB RGBA PNG with at least **3 px of clean transparent border** and a centered pivot. Save it under `assets/gameplay/<district>/cars/` and add an entry to the district catalog using its existing schema. Record the filename, raster dimensions, scale, authored footprint, pixel pivot, orientation, repeat axes, and the packaged PNG’s SHA-256. Keep the exact chosen generation prompt, direct input, and source ID with asset provenance.
3. The Art Director independently checks the alpha bounds against the envelope, clean transparency, pivot and facing. Review the sprite on a dark gameplay background at **1.2 and 2.25 CSS px per world unit**, facing both ways. Check the front and rear still read correctly at those sizes.

## 3. Integrate and verify in Pixi

Engineering uses the existing [texture loader](../src/pixi/assets.mjs), [driving renderer](../src/pixi/world-view.mjs), [local server](../scripts/serve.mjs), and [Pages build](../scripts/build-pages.mjs). Keep a procedural body available while the texture loads or if it fails. Keep headlights and shadows separate and aligned with the moving car.

Set the sprite’s world width and height to `widthPx / pixelsPerUnit` and `heightPx / pixelsPerUnit`, using the full PNG including its transparent border. Set the normalized anchor to `(pivotPx.x / widthPx, pivotPx.y / heightPx)`. The hatchback anchor is `(0.5, 0.5)`. The authored footprint governs physics separately.

Before the car is available through normal play, exercise the real selection and driving path with an isolated chapter and ownership fixture. The [hatchback browser test](../tests/browser/city-hatchback.test.mjs) uses a fixture-only save and a delivery that accepts the car. Verify the sprite is centered at heading zero and after a real turn at **320×568**, **390×600**, and **1200×800**. Check separate effects, missing-texture fallback, and an ordinary Starter Coupe run. Confirm the packaged build loads the PNG under the Pages project subpath.

Run these from the repository root once dependencies are installed. The two browser checks use an installed Edge or Chrome. The named browser test is the hatchback example. For another vehicle, use its corresponding focused regression test.

```powershell
node scripts/check-content.mjs
node --test tests/runtime.test.mjs tests/authored-content.test.mjs tests/camera.test.mjs
npm.cmd run build:pages
node --test --test-reporter=spec tests/browser/city-hatchback.test.mjs tests/browser/pages-smoke.test.mjs
```

## City Hatchback example

The [master board](../assets/references/vehicles/city-hatchback/city-hatchback-turnaround.png) and [master prompt](../assets/references/vehicles/city-hatchback/generation-prompt.txt) establish the reference. The [asset guide](canal-ward-gameplay-assets.md#city-hatchback) records the exact selected sprite prompt, direct overhead input, and catalog. A **21 × 12 u** footprint gives an **84 × 48 px** envelope. The packaged **90 × 54 px** RGBA PNG sits at **4 px/u**, with alpha bounds **[3, 4, 87, 50)** in left, top, right, bottom order. Its **84 × 46 px** visible sprite has a **(45, 27) px** pivot and faces east at heading **0**.

## Handoffs

The Art Director briefs a named vehicle artist and independently accepts the art. The Engineering Manager assigns runtime work to a named implementer and independently verifies integration. Both managers report the implementer’s chat, model and effort, owned paths, source provenance, and test evidence. The shared Project Librarian records the provenance. Route Git work through the Git Operator when explicitly requested.

## Copy-ready vehicle brief

```text
Vehicle ID and display name: <id> / <name>
District and owned paths: <district> / <paths>
Authored footprint and source: <length × width world units> / src/vehicles.mjs
Identity: <body/silhouette, paint, doors/glass, bumper, lamps, wheels>
Style-only input: <approved gameplay reference>
Views: front 3/4 Garage, rear 3/4 Story, true side, overhead nose +x
Reference status: <preview or approved, with decision source>
Deliver: master, useful exact crops, transparent sRGB sprite at 4 px/u,
catalog entry, selected source IDs and exact prompts, and Art QA evidence.
Engineering handoff: <fixture/eligibility context, Pixi and package checks>
```
