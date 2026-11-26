# Canal Ward starter gameplay assets

The reusable Canal Ward library contains three repeatable materials, two vehicles, two buildings, and three props. The [main catalog](../assets/gameplay/canal-ward/catalog.json) indexes the sprites and links to the [road catalog](../assets/gameplay/canal-ward/roads/catalog.json). The catalogs give the shipped dimensions, footprints, pivots, orientation, repeat axes, and SHA-256 hashes.

The standalone library passed Art, Engineering, and PM verification. The PNGs are staged for composition. The live Pixi renderer continues to use the authored world geometry, cached generated textures, and shared drawing routines. Authored road, collision, and patrol data remain authoritative.

## Use in a composition

- **Scale and anchor.** All ten files are sRGB PNGs at **4 pixels per world unit**. Use the PNG dimensions divided by four for its visible size in world units. Align the catalog’s `pivotPx` to the authored world anchor. For a normalized sprite anchor, divide the pivot coordinates by their corresponding PNG dimensions.
- **Orientation.** World `+x` points east and `+y` points south. Vehicle sprites face east at zero radians. Building fronts face south. The palm and lamp project south from their ground anchors. Place the barricade with its long axis along `+x` and its striped face south, then rotate it for the closure.
- **Footprint and lighting.** Use the authored footprint for placement and collision. The visible sprite can project beyond it, as with the palm crown or building facade. Keep light spill, vehicle beams, and flashing patrol lights in separate effect layers.
- **Repeats.** Tile asphalt and pavers along both axes. Repeat the curb only along its local `x` axis, with paving on the north side and the road-facing bevel to the south in its source orientation. Rotate the strip as needed and clip the repeat to the authored edge.

## Packaged PNGs

- **Materials.** [Wet charcoal asphalt](../assets/gameplay/canal-ward/roads/asphalt-wet-charcoal.png), [sidewalk stone pavers](../assets/gameplay/canal-ward/roads/sidewalk-stone-pavers.png), [straight stone curb](../assets/gameplay/canal-ward/roads/curb-stone-straight.png).
- **Vehicles.** [Starter Coupe](../assets/gameplay/canal-ward/cars/starter-coupe.png), [patrol car](../assets/gameplay/canal-ward/cars/patrol.png).
- **Buildings.** [Canal house](../assets/gameplay/canal-ward/buildings/canal-house.png), [neighborhood garage](../assets/gameplay/canal-ward/buildings/neighborhood-garage.png).
- **Props.** [Striped barricade](../assets/gameplay/canal-ward/props/striped-barricade.png), [street lamp](../assets/gameplay/canal-ward/props/street-lamp.png), [Canal palm](../assets/gameplay/canal-ward/props/canal-palm.png).

## Selected built-in ImageGen prompts

Attach the [Canal Ward gameplay style reference](../assets/references/canal-ward-gameplay-style.png) as **Image 1**. The prompts below are the selected generation prompts, saved verbatim. The catalogs govern the packaged sizes and footprints. The packaged paver tile uses a 6 × 6 grid, and the garage footprint is 52 × 32 world units.

The **Canal Ward Road and Curb Asset Implementer** (`01a218c8-6d29-7ac1-8805-55a3f871d031`, `gpt-6.2-sol` High) prepared the three road materials using periodic crops and seam blending. The **Canal Ward Vehicle, Building and Prop Sprite Implementer** (`01a218c8-af21-79c3-88a1-bac5b491e1d9`, `gpt-6.2-sol` High) sliced the cutouts, packaged their transparent alpha and padding, and recorded their pivots at the shared scale. The packaged barricade came from a multi-prop sheet. Separate generations supplied the street lamp and Canal palm.

### Asphalt

Generation `exec-3c2fa21b-47fc-48f4-9018-6624bf8bde48` · Opaque background

```text
Use case: style-transfer
Asset type: square repeatable asphalt surface bitmap for a top-down 2D driving game.
Image 1 is a direct style and material reference only. Transfer the wet charcoal road material in its darker, unlit straight street interior to a standalone texture. Create a new surface sample with none of the reference's street layout or objects.
Full-bleed square, exact straight-down orthographic camera, one flat level plane. Deep cool charcoal (near #252d33), wet dense urban asphalt with very fine compact aggregate, tiny non-directional irregularities and restrained diffuse damp sheen. Keep the aggregate perceptible at a 256 by 256 raster without becoming chunky. Crisp understated material rendering and fine weathering, as in the reference. Even dim cool ambient illumination, fairly uniform where the entire image meets itself. Every area must have the same useful level of texture: no large stains, patches, prominent cracks, pools, gradients, external shadows, or signatures that would form a visible pattern in a 2 by 2 repeat. Make opposite sides join naturally on both axes; treat both sets of opposite boundaries as interior points of the same material.
Only solid opaque asphalt is visible to all four corners. No paving, road markings or paint, water, lamp reflections, props, text, borders, framing, or embedded gameplay elements.
```

### Sidewalk pavers

Generation `exec-a18d5c61-3e4c-4f49-badb-61083a906809` · Opaque background

```text
Use case: style-transfer
Asset type: square repeatable sidewalk surface bitmap for a top-down 2D driving game.
Image 1 is a direct style and material reference only. Transfer the cool grey dressed stone sidewalk material from shaded areas in the Canal Ward reference into a new standalone surface sample. Take no street layout or other objects from it.
Full-bleed square, exact straight-down orthographic camera, plane perpendicular to camera, clean squared geometry. A regular edge-aligned grid of exactly eight square pavers across by eight square pavers down, oriented horizontally and vertically, with modestly narrow even joints. Place the crop along the center of identical-width joints, keeping block pitch even and the pattern aligned across repeat boundaries. Cool blue-grey charcoal stone, slightly lighter than adjacent wet charcoal asphalt, small fine mineral texture and mild tile-to-tile variation in muted tone. Restrained bevels and soft local contact shade in joints, crisp at game scale. Soft cool uniform ambient illumination, minimal highlights and no dramatic outdoor lighting. All grid cells should have similar visual weight with no exceptional stone or baked motif that stands out in 2 by 2 repeats.
Entire frame filled with opaque pavers. No curb edging, asphalt, lamp highlights, reflections of objects, water, stains spanning cells, props, text, borders, framing, or gameplay elements.
```

### Straight curb

Generation `exec-f041c289-2f81-4c90-8efa-28de4c3cedb7` · Transparent background

```text
Use case: style-transfer
Asset type: straight repeatable horizontal stone curb strip bitmap, compact top-down driving game geometry.
Image 1 is a direct style and material reference only. Transfer only the appearance of the slim beveled stone curb between paving and dark asphalt in the Canal Ward reference. The output is a new isolated straight curb material sample.
Exact straight-down orthographic camera. One single perfectly horizontal very long slim rectangular curb, long axis left to right, with the paver-facing edge at the top (north), the asphalt-facing worn shallow bevel along the bottom (south), and dim directional relief confined to that bevel. It is continuous and exits the image at left and right with open repeat ends: no caps, end cuts, or transparent padding at either end. Make a simple rhythm of evenly spaced straight vertical stone joints in cool muted blue-grey stone, fine mineral weathering, subtle variation. Use a centered thin horizontal strip so cropping a narrow section is straightforward. Its depth is roughly one sixth to one eighth of a block's length. Uniform cool diffuse ambient illumination, gentle slightly lighter lip and minimal shade, crisp geometry. Texture should read at 11 pixels of depth. Balance joint contrast and all stones for left-to-right repeat, without obvious highlight or dominant block. No sloping or wavy line, perspective, glow, background shadows, actual asphalt or sidewalk surface, other items, foliage, water, text, borders or framing. Preserve transparency above and below the straight curb.
```

### Canal house and neighborhood garage

Generation `exec-ae09c2a5-67b7-474a-b564-54d7c5b2f0e6` · Transparent background

```text
Use case: stylized-concept. Asset type: production raster gameplay building sprite cutouts for an original arcade driving game. Image 1 is the direct style-only reference. Match its crisp orthographic coastal-night miniature buildings with subtly weathered flat concrete, restrained highlights, exact sensible right angles, believable cool blue fill and small warm openings. Generate a transparent landscape sheet with exactly two complete widely separated self-contained building silhouettes, substantial transparent outer margin and central gutter. Use aligned orthographic top-down gameplay view: plan-view flat roof is dominant, only a short south/front façade visible below each roof toward screen bottom, vertical left/right boundaries without converging or diagonal axes. Front door base lies at the bottom of the projected silhouette. On the left, one compact residential 28 wide by 32 deep footprint, near-square pale warm-gray weathered stucco concrete roof on a muted coral-sand coastal home, low neat coping, a compact ventilation stack and two small subdued amber residential windows. On the right, one distinctly wider low neighborhood garage/storefront with nominal footprint 52 wide by 36 deep, cool slate-blue roof with worn low straight parapet and two grouped HVAC details, broad simple paneled garage bay and two small amber openings in a tan-gray façade. The wall is modest in vertical depth and both volumes share one consistent shading direction and relative scale. Everything is unbranded. No roads, land or paving, planters, exterior scenery, people, text, labels, checkerboard, huge warm pools, halos, dark exterior cast shadows or background color. Keep any contact shadow within a couple pixels at runtime. True transparent RGBA background, only these two full buildings, with no overlapping pixels between them.
```

### Starter Coupe and patrol car

Generation `exec-cea40d3f-704c-4115-9f94-10a464e589c8` · Transparent background

```text
Use case: stylized-concept. Asset type: production raster gameplay car sprite cutouts for an original arcade driving game. Image 1 is the direct style-only reference. Match its compact coastal-night miniature rendering, believable tight material highlights, cool ambient fill and geometric clarity. Generate a transparent horizontal sheet with exactly TWO widely separated complete cars, side by side, centered around 25% and 75% of the canvas with large clear transparent gutters and borders. Both are true straight-down orthographic viewed directly from above, NEITHER has a perspective view or visible side face, both oriented horizontally with their FRONT pointing RIGHT (east). At the left a hot pink #FF4FA7 compact Starter Coupe, slender 24:13 length-to-width silhouette, distinct curved sports coupe cabin, dark windshield and rear window, charcoal glazing, restrained molded bumpers and recognizable unlit headlamp housings. At the right a cool blue-and-ivory-white coastal police patrol sedan, 25:13 length-to-width, cool blue front and rear with pale roof and white door shoulders, unmistakable compact bar with red and blue lens plastics but switched off. Classically readable silhouettes with detail large enough for roughly 30px-long gameplay. Wheels mostly tucked, restrained body reflections, use clean precisely edged dark glass and at most subtle near-contact occlusion inside the silhouette. Transparent alpha substrate everywhere outside the two cars. No text, letters, numbers, badges, markings that resemble writing, labels, background, backdrop, checkerboard, road, water, cast shadows, motion trails, headlight beams or police glows. A polished original game sprite sheet, only these two full cars.
```

### Striped barricade

Generation `exec-321d3194-e574-431f-85c2-4a20e40cc1c4` · Transparent background

```text
Use case: stylized-concept. Create a production game prop atlas on genuine empty transparent alpha. Image 1 is direct style reference for ONLY tiny orthographic sprite geometry and material detail. Treat the assets in neutral cool studio illumination without the reference's environmental lighting. Draw three widely spaced hard-edged cutouts only, no background color or haze at all, with perfectly empty separations. The top-left is a coastal palm viewed almost straight down, a circular asymmetric spreading deep olive and teal-green leaf canopy, with a short visible trunk ending in an unadorned clean visible base near the bottom of the sprite. The top-right is a top-down outdoor post light with a short foreshortened dark teal metal pole and round physical footing, a small lens of amber-colored glass with the bulb switched off. The lower center is a small heavy horizontal construction barricade, low and foreshortened, two short steel feet, painted matte burnt yellow and charcoal warning stripes on south face. Render deliberate solid silhouettes with detailed self-occlusion. No text, markings other than the barricade stripes, luminous or emissive effects, ambient bloom, cast shadow, aura or translucency anywhere beyond the physical edges, ground contact plane, paper, road, local diffused pools, border, checkerboard or backdrop. Actual empty alpha outside each and every object. Preserve hard edge detail on transparency. Distinct compact game silhouettes readable around 25 CSS pixels.
```

### Street lamp

Generation `exec-bb497f1d-1921-461f-bc65-2657822b505a` · Transparent background

```text
Use case: stylized-concept. Asset type: ONE small reusable transparent raster game sprite of a Canal Ward coastal street lamp, isolated. Image 1 is the direct style-only reference. Match the small amber-topped outdoor street lamps beside the buildings in that image, their metal finish and overhead read. True orthographic camera directly overhead with just enough south reveal for a narrow stem and a tiny separate base to appear toward the screen bottom. Use a simple old coastal dark forged-metal post with a warm pale-amber globe at its top, like a nearly round pearl with a subtle dark metal rim, no glass rings, screws, or frontal spotlight housing. The globe is the top of a small street lamp housing, physically circular in plan view. At the far side of the globe include a subtle metal edge. Its visible pole segment is short and skinny (only about one globe diameter's displacement from the globe center to the base center), roughly vertical in the sprite; making a compact total outline under three globe diameters tall. Dark circular ground footing, smaller than the globe. Finely weathered, cool muted ambient fill, amber inside the globe only. Flat alpha beyond the sharp physical silhouette. NO glow, halo, contact patch, rays, glare, ground plane, cast shadow, scenic background, checkerboard, matte, photographic perspective, cast light or text. Center one whole cutout with generous space. Readable with a globe less than 4 screen pixels wide.
```

### Canal palm

Generation `exec-ae8f8868-a58f-476d-9e25-f0d951a4fb16` · Transparent background

```text
Use case: stylized-concept. Asset type: ONE reusable transparent raster game sprite, overhead Canal Ward palm tree. Image 1 is the direct style-only reference. Match the palm canopy shape and coastal nighttime miniature rendering in the reference. Exact orthographic true top-down scene, optical axis perpendicular to ground. Seen principally as a mostly circular compact radial broad coconut frond crown, eight primary branches believably alternating, organic uneven leaf silhouette with clean separations, dark blue-green and a few olive leaf-face highlights. The outer crown fills almost the whole silhouette, use subtle shaded overlap. A short foreshortened piece of ringed physical trunk and small natural cut-shaped foot can barely be seen beneath the lower half of the crown, near but not necessarily beyond the lowest frond. No garden, rock, planters, cast shadow, glows, matte, color haze, road, background scenery, text or checkerboard. Especially avoid a front view or a long fully visible trunk. Only solid physical pixels, actual transparent alpha beyond the crown, separated frond outlines and tiny physical trunk. Whole isolated centered object.
```
