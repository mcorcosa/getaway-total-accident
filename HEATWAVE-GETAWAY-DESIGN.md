# Getaway Total Accident game design

**Working design.** Getaway Total Accident is a top-down arcade driving comedy about Nina and Ray, a criminal couple trying to make one big score in Palmera Bay with a series of very bad plans. Drive a short job, reach a safehouse, and decide whether to bank the take or risk it on another job. Banked money opens new areas and buys cars that change how you play.

The owner confirmed the current game name on 26 November 2026 in PM chat `01a2175b-11c4-7230-9b26-0216587bad64`, message `01a217bf-40d2-7ca1-950b-6f166c34226d`.

The accepted Pixi Chapter 1 build carries forward the 21 authored Canal Ward missions. Missions 1 and 2 clear hands-off. In the local build, Mission 3 follows a straight street with a small right correction to a house-front finish. Bend practice starts at Mission 4, followed by pickup and pursuit practice. Level Design and Engineering verified the Mission 3 change locally on 27 November 2026. Release is pending. Use the single shared LAN server on port 8080. [Chapter 1 LAN runbook](docs/chapter-1-build.md#run-locally) · [26 November PM handoff](docs/HANDOFF-2026-11-26.md)

Story dialogue is placeholder copy, and production art remains open. The orange City Hatchback is the default for all 21 Chapter 1 missions and replays on the regular port-8080 LAN build. New saves start with it owned. Existing saves add the hatchback and retain owned cars, balances, mission progress, and valid pending payouts. A previously earned Coupe bonus still uses its saved car and condition. Level Design and Engineering verified all 21 main missions and 21 bonuses in simulation, and Engineering checked fresh saves and a carried-over Coupe bonus in Edge. Shop, Daily Missions, and Chapter 2 are unavailable. Platform SDK work, final balance, and driving feel remain open.

The [legacy four-job prototype](heatwave-getaway-prototype.html) remains available, with full-paying replays, one optional bonus per run, and a purchasable Neon Strip free-drive preview. It uses its original save. The rebuild stores progress separately.

## Visual direction

**Owner direction, revised 26 November 2026.** The Canal Ward gameplay image supplied by the owner in the Art Director chat is the visual reference. Use it directly in visual-generation prompts wherever relevant, including story postcards. Match its crisp, compact 3D geometry, consistent scale, and clean right-angle street and roof forms. Keep surfaces finely weathered and readable, with believable material response, natural light falloff, soft contact shadows, and restrained highlights. Clear forms, scale, and lighting carry the stylization.

The Canal Ward gameplay reference uses a straight-down view and warm pools of amber light from streetlamps and windows against wet charcoal pavement and deep teal canal water. Other scenes and districts can vary the camera, palette, and lighting with owner approval.

Present story panels as postcards. A portrait layout is allowed. The owner accepted the close-up of Nina pointing at an envelope as the First Job opening artwork. The detailed postcard layout and framing treatment for other story scenes are open. Ray drives, and Nina gives the missions. Preview dialogue is temporary.

**Game UI palette.** Use Ocean Drive for the game UI: midnight blue `#101C3A`, neon aqua `#34E7E1`, and hot pink `#FF4FA7`, with marigold `#FFD368` from Sunset Motel. Make hot pink and marigold visibly prominent on story and instruction screens, with less blue and smaller blue surfaces. The approved gameplay reference still guides world materials, scene palettes, and lighting.

## City and story

Palmera Bay is a fictional South Florida city. The Canal Ward has low bridges, marina slips, and sun-bleached motels. The Neon Strip has hotel service lanes, event traffic, and a beach causeway. Breakwater Port has moving gates, loading yards, and cranes over the water. The three areas give the campaign distinct looks and different things to do behind the wheel.

Author one shared map in reusable pieces. Each mission uses the portions it needs. Grow the map and plan its geography as new missions require space or connections. The district themes guide future additions. District layouts, map dimensions and topology, the first extension, and technical architecture remain open.

**Asset reuse.** Build new missions from a shared library of road and terrain pieces, vehicle visuals, and props. Use reusable sprites, shared tiles, or cached procedural assets for stable visuals, and share them across missions. Keep dynamic effects such as vehicle lights separate where useful.

**Current Pixi runtime.** Missions share authored world pieces, cached generated textures for roads, roofs, paving, water, light, and palms, and shared parametric drawing for roads, buildings, cars, lamps, and barricades. The [staged Canal Ward gameplay library](docs/canal-ward-gameplay-assets.md) contains separate PNG tiles and sprites with usage notes and their original prompts.

The player drives as Ray. Nina finds and presents the jobs. Their old crew cut them out of a score. Nina wants enough money for them to leave town together. Ray wants to take one job big enough that the old crew hears about it. They both enjoy what they do, and either one can be the voice of caution depending on the job. Their disagreement becomes the player's choice at the final safehouse.

Before each job, Nina sets up the mission in one postcard using a short speech bubble. A square teaching inset appears only when the job introduces a new objective or mechanic. After the job, the result postcard reacts to what happened, including whether they caught the ferry, took the road exit, or got busted. During a chase, save the radio for a line that changes what the player should do.

> **Nina** — Remember the guy who said we couldn't drive his car?  
> **Ray** — Which guy?  
> **Nina** — The one who just pulled into the marina.

The legacy prototype still has dialogue from the earlier roles.

## Campaign and gameplay

Introduce a new objective or mechanic in a focused job, then give players multiple practice missions using the same rules. Keep the mechanics, hazards, restrictions, and failure conditions the same across those practice missions. Routes and pickup placements can vary within those rules. Difficulty can hold steady or ease during practice. Move on to mastery challenges and combinations of familiar systems after players have had time to practice. Expand the number of missions per chapter. For later chapters, practice counts, chapter mission counts, and mission order remain open. Define gameplay and the rules of each job before writing its story.

Finish a main job once to unlock the next job in story order. The clear registers as soon as you meet the main objective, including reaching the finish point when there is one. District boundaries also require paid district access and a vehicle of the required tier.

### Mission objectives

1. **Collect and escape.** Collect the required package or packages, then reach the escape point.
2. **Delivery.** Drive to the destination.
3. **Survive pursuit.** Stay free through the pursuit timer. The mission can then direct the player to an exit.
4. **Beat the time.** Reach the required destination before the deadline.
5. **Ram and collect.** Knock loot loose from another car and collect it.
6. **Tailing.** Follow another car while keeping it in sight.
7. **Route manipulation.** Solve a route puzzle by changing which paths are available.
8. **Race.** Race other cars in a sprint or on a circuit.
9. **Ram and destroy.** Destroy other cars by ramming them.
10. **Catch.** Pursue and catch another car, taking the role the police play in a chase.

Escort missions are out of scope. A vehicle switch can be a scripted step within another objective. Cargo and capacity modify collection or delivery. Towing is a mechanic that can support an objective.

### Mechanics and open rules

Use automatic acceleration, left and right steering, braking, grip and skidding, and collisions. Players collect packages and reach destinations. Police, heat, and civilian traffic provide pressure. Navigation can use drawbridges, canal jumps, gates, barriers, and trains. Falling into water ends the attempt. Use timers for survival or deadline objectives, and keep the choice to bank the haul or risk it on one bonus.

The legacy prototype already exercises automatic driving, steering and braking, grip and skidding, collisions, pickups and destinations, the drawbridge, patrols and heat, traffic, survival and deadline timers, and the bank-or-risk choice. Canal jumps, water-fall failure, gates, barriers, trains, towing, and additional objective families are planned.

Open gameplay rules include the catch win condition, race placement and circuit lap counts, vehicle destruction thresholds, and the details of canal jumps and towing.

### Legacy Canal Ward jobs

**1. First Job — Get away with the cash.** Grab the $100, cross the drawbridge, and reach the safehouse. Crossing the middle bridge raises it behind you. After clearing the job, bank the $100 or risk it on a bonus pickup worth another $200. The pickup adds another bag and a second safehouse on the same map.

**2. Wrong Keys — Deliver a stolen car to a garage.** Start behind the wheel of the stolen coupe with the garage marked and a four-pip damage meter. Drive the coupe into the garage's marked bay. Any remaining durability is enough to finish, and arriving with at least three pips pays a clean-delivery bonus. The shortest route crosses a tight marina block. Staying on wider roads gives you room to turn but gives patrols more time to catch up. Base payout **$200**.

**3. Make Them Wait — Stay free for 40 seconds.** Start with a patrol already on your tail. Stay unbusted until the countdown hits zero, which marks a safehouse to finish the job. The game favors an exit ahead of you. Patrol pressure rises at 15 and 30 seconds if it hasn't already. A quiet block can buy you a breath, but parking there doesn't freeze the chase. The HUD shows **Survive 40s**, then switches to **Reach the safehouse**. Base payout **$250**.

**4. Last Ferry — Escape before the ramp closes.** Start with the take already in the car. You have **30 seconds** to drive onto the ferry. The ramp is visible across the canal. Missing the ferry closes the fast escape and opens a longer road exit with **15 seconds** left. Reaching either exit wins. Missing both fails the job. Base payout **$350**, with a bonus for catching the ferry.

### First playable Chapter 1

The owner approved this 21-mission sequence on 26 November 2026 for the first playable Chapter 1 rebuild in Canal Ward. Mission names are working labels. All main jobs are untimed.

Practice changes routes, approaches, or marker placements within the rules just learned. Keep the same patrol starting gap, speed, and capture rule across C1-14 to C1-18 and reuse that setup in C1-21. Street and landmark labels describe spatial needs. Grow the shared map as missions require it, and use placeholder story until gameplay and rules are settled. On C1-01 to C1-03, compact views can begin with a directional target cue that gives way to the world marker when it comes into view. Show nearby connected streets and houses or roofs beyond the mission’s drivable footprint. Mark closed streets clearly with barricades. Collision checks and patrol routing stay within the active road network.

**Chapter 1 mission length.** Give players more active driving on the route, including in the very first missions and the shortest optional bonuses. Keep the approved mission order and same-rule practice. Exact route lengths and drive times are playtest values. Level Design verified the longer routes locally on 26 November 2026 in normal gameplay at 60 Hz. These Starter Coupe timings count active driving only. In that 26 November build, the three straight hands-off drives C1-01, C1-02, and C1-03 went from 3.45, 4.48, and 4.60 seconds to 10.00, 10.92, and 12.68 seconds. The 21 main jobs went from 76.42 to 301.88 seconds combined and ran 10.00–19.90 seconds each. The 21 bonuses went from 38.33 to 137.58 seconds combined and ran 5.78–8.50 seconds each. C1-10 went from 1.22 to 11.85 seconds with the same single pickup, and C1-17 went from 0.77 to 15.27 seconds with the same patrol. Both coupes cleared all 42 segments and both branches of C1-07 and C1-16. The shared map gained eight reusable pieces and retained the original pieces.

Playtesting will tune exact placements, patrol values, bonus balancing, and test payouts. Later chapters remain open.

#### Reach the destination

- **C1-01 Reach the Marker.** Start aligned with the finish marker on a longer straight street. Automatic acceleration alone carries Ray into it to clear the job. The route is patrol-free.
- **C1-02 Same Goal, New Street.** Repeat the straight drive on another street, with more room to get used to the car before reaching the marker.
- **C1-03 Down the Block.** Follow the same straight northbound street, then steer slightly right near the end to reach the finish marker in front of a house.

#### Learn steering and braking

- **C1-04 First Bend.** Drive a longer approach before the same wide bend to the marked garage. Practice steering and braking with baseline grip and collision damage.
- **C1-05 Left Turn.** Take a longer approach to the same broad left bend to reach the garage.
- **C1-06 Right Turn.** Take a longer approach to the same broad right bend to reach the garage.
- **C1-07 Two Streets.** Choose either of two wide streets to reach the garage.
- **C1-08 Other Approach.** Reach the familiar garage from the opposite end of the block on a longer approach from the south.

#### Collect one package and escape

- **C1-09 First Pickup.** Collect one marked package and then reach the safehouse.
- **C1-10 Straight Pickup.** Collect the package on a straight street and reach the safehouse.
- **C1-11 Pickup After Left.** Collect the package after a left bend and reach the safehouse.
- **C1-12 Pickup After Right.** Collect the package after a right bend and reach the safehouse.
- **C1-13 Second Safehouse.** Collect the package on a familiar street and reach a different marked safehouse.

#### Deliver under pursuit

- **C1-14 First Pursuit.** Reach a familiar garage with one patrol already following.
- **C1-15 Second Garage.** Reach a different garage under the same pursuit rules.
- **C1-16 Two Ways Out.** Take either familiar route to the garage under the same pursuit rules.
- **C1-17 Different Start.** Reach a familiar garage from a different starting point under the same pursuit rules.
- **C1-18 Delivery Revisited.** Repeat an earlier delivery route under the same pursuit rules.

#### Revisit and combine

- **C1-19 Quiet Delivery.** Reach an earlier garage from a different street in a patrol-free revisit.
- **C1-20 Familiar Pickup.** Collect one package and reach a familiar safehouse in a patrol-free revisit.
- **C1-21 Pickup Under Pursuit.** Collect one package and reach the safehouse with the same one-patrol setup used for delivery practice.

### Working mission examples

These ideas illustrate the objective families and mechanics. Assign them to chapters after the learning progression is decided.

- **Shakedown** as a ram-and-collect example. Side bumps release bundles, and the player collects a bundle before reaching the safehouse.
- **Valet Ticket** as a tailing example. Follow a rival to the correct hotel garage while keeping a workable distance.
- **Gate Shift** as a route-puzzle example. Trigger two switches in an order that opens the preferred route to the exit.
- **Switch Seats** as an escape with a scripted vehicle swap. The player completes the route across both vehicles while cash and heat carry over.
- **Four on the Floor** as cargo collection or delivery with capacity limits. Its previous cross-category vehicle choice conflicts with the same-category briefing rule and remains open.
- **Hook and Run** as delivery using towing. Towing behaviour and the eligibility of alternate truck models remain open.

The working finale keeps the choice to bank and leave town or risk the haul on Ray's final job. Its campaign clear survives a bonus failure.

## Planned screen flow

### Home and Garage

**Story is Home.** Players scroll through the chapters and city map to find and replay missions. Show Nina and Ray's current chapter, the bank balance, and the next district's cost when relevant. Group missions by district in story order. Cleared missions remain visible with a short objective, normal payout, best banked payout, **Replay**, and a **Recap** of Nina and Ray's exchange. The next available job offers **Continue**. Locked jobs show which job comes before them. On return after a clear, select the next available job.

**Story map.** Use the full-bleed illustrated Palmera Bay map with a winding dotted path, numbered mission nodes, a district unlock on the path, and a bottom menu. Downward scrolling stops at the first mission, Level 1. Higher missions and districts remain reachable by scrolling in the other direction. Keep the artwork joins seamless between sections. The approved reference is screenshot 2 in the owner’s 26 November 2026 correction in the Art Director chat, message `01a21712-9f74-7eb0-84c6-6776e61d6062`.

**Story map and menus implementation.** On 26 November 2026 the owner reconfirmed the migrated Story map reference and directed the PM to bring the Story map and menus into line with the applicable mockups. Both instructions are in the restored Art Director chat `01a2177b-4f09-7483-90bc-3687ed8c70b1`, in messages `01a2178e-b46e-7883-b73c-d1de6315c816` and `01a21797-e38f-75e3-aed2-b5a550050e8c`. The earlier browser review of the Story/Home map and shared bottom navigation established visual fidelity for the HTML-based snapshot. The approved mockup and reviewed visuals guide the Pixi implementation. [Confirmed Story map reference](assets/references/story-map-approved.png) · [Browser review evidence](docs/chapter-1-build.md#story-map-and-shared-navigation-review)

**Presentation renderer.** On 26 November 2026 the owner required the map, controls, and all game presentation to be rendered entirely in Pixi, with HTML used solely to host the canvas. This includes the world, teaching inset, shared navigation, postcards, HUD, pause, and secondary menus. The decision is in PM chat `01a2175b-11c4-7230-9b26-0216587bad64`, message `01a217b1-3321-76d1-b8ca-b2b469fdd3c2`. Engineering, Art, and the PM accepted the revised Pixi build after technical verification and the desktop joins, illustration framing, and compact HUD revisions. The HTML-based work is preserved as historical evidence. [Checkpoint and review evidence](docs/HANDOFF-2026-11-26.md#current-implementation-and-evidence)

Home provides access to the separate **Garage** screen, balance, **Shop**, **Daily Missions**, and other menu entries. The Garage shows owned vehicles. Shop and Daily Missions are confirmed Home entries. Their destination scope is open. Garage visual design is deferred.

Replays pay the normal base amount and can award the same additional cash as a first clear. Both are banked the same way. Any cleared job can help fund area access or a better car. Cleared areas remain available, and players can bring an eligible newer car to an earlier job that permits selection.

### Mission panels and gameplay

1. **Pre-job postcard.** Use one postcard before each job. Nina delivers the story in a short speech bubble. Show a square teaching inset at the bottom only when the mission introduces a new objective or mechanic. Place **Play** and eligible car selection below the art. Replays open the same postcard.
2. **Gameplay.** Driving fills the viewport. Overlay exactly three icon-led indicators for the objective, car damage, and heat. Heat uses five fillable stars. Keep gameplay buttons above the driving view. Pause overlays gameplay.
3. **Result and bonus postcards.** Success, failure, and the bonus briefing reuse the pre-job postcard layout, with actions appropriate to each result. Failure uses reusable postcards selected by loss cause and offers **Replay** or **Back to menu**.

**Mobile driving controls.** The owner approved the horizontal thumb-pad prototype on 27 November 2026. Start anywhere on the bottom-right pad to set a fresh neutral point. Drag left or right for proportional steering, return to the starting horizontal position for neutral, or lift to clear the input. Vertical movement leaves steering unchanged. Full steering is reachable from either edge. Use the separate left pedal while steering to brake and stay stopped. Release the brake to resume automatic forward drive. Desktop bindings and canvas touch safeguards carry over. Engineering accepted the local prototype after Edge touch tests at 320×568 and 390×600. The pad produced zero steering on vertical drags that produced 31–35% steering on the old wheel. Both layouts cleared C1-01 through C1-05, including both bends at full condition. All 12 independent browser checks, 25 Node tests, and the packaged Pages smoke test passed. GitHub Pages still serves the previous wheel build as of 27 November 2026. Physical-phone playtesting remains open. Straightening assist is a separate proposal.

**Brake and touch holds.** Hold the brake to slow to a full stop and keep the car stationary for as long as the brake remains held. Releasing it resumes automatic forward drive. Braking deceleration is tuned to 220 world units/s². Touch holds stay within the game, with native browser selection suppressed during gameplay. Approved on 26 November 2026. The game canvas suppresses text selection and WebKit touch callouts in CSS and cancels `selectstart` and `contextmenu` events on the canvas. On 26 November 2026, the PM’s local Edge touch checks at 390×600 and 320×568 verified the car stayed stopped for 1.45 seconds after braking to a stop, second-finger steering worked, and release or cancellation resumed forward drive. Canvas-scoped selection and a trusted context-menu event passed in Edge. All 25 Node tests and full-campaign checks passed. The native overlay on a physical handset, including Safari, remains open for verification.

**District unlocks.** Show them on Home's Story map.

### Mission vehicle selection

A steal-a-vehicle mission locks the specified stolen vehicle. Other missions start with a mission default and, when selection is available, let the player choose an owned alternative from the same vehicle category as the default. The district's tier requirement still applies. Category describes the kind of vehicle. Tier determines district eligibility. How future chapter defaults relate to ownership or loaners is open.

### Success and bonus

Success offers exactly two actions, **Continue to Story** and **Bonus**. Continue immediately banks the haul and returns to Home. Bonus opens its briefing with **Start bonus** and **Back to success**. The latter returns to the success postcard so the player can still bank the main haul. Show the relevant timer, damage limit, or patrol count before the player starts the bonus. The follow-up is one tougher version of the same activity and uses the current car, map, and controls.

In the legacy four-job prototype, the Canal Ward bonuses begin at three patrols. **First Job** gives you 14 seconds to get another envelope to the south safehouse. **Wrong Keys** gives you 11 seconds to reach the second garage with at most one additional hit. **Make Them Wait** adds 25 seconds with faster patrols, then a safehouse exit. **Last Ferry** gives you 10 seconds to reach a single road exit. Damage and the unbanked haul carry into the bonus.

Starting the bonus puts the current haul back at risk. On bonus success, the total banks automatically and the player returns directly to Home. Home shows the updated balance for both banking paths. On bonus failure, the player loses the unbanked haul and one life and sees the same failure layout. Either way, the main job stays cleared and the next job stays unlocked. Each run offers at most one extra objective. At the finale, the same bank-or-bonus choice also determines the couple's ending.

## Cars, cash, and lives

Every vehicle has a **category** and a **tier**. The category tells you what the vehicle does well. The tier tells you which districts it qualifies for. Show both beside the speed, handling, damage resistance, and cargo stats. Vehicle categories include hatchback, coupe, supercar, van, and truck. Truck is one category with models ranging from pickups and off-road trucks to heavy work vehicles such as box trucks and tow trucks. How specialist jobs such as **Hook and Run** filter truck models for towing capability is open. Detailed category balance and truck model stats, handling, and cargo profiles are also open. Give each tier models in the same categories over time, so someone who likes the van can upgrade to a better van. Sample Tier 1 profiles:

- **Hatchback.** Tightest turns, moderate top speed, **3 damage pips**, **1 crate**. Fits narrow lanes.
- **Coupe.** Fast, stable on wider roads, **4 damage pips**, **2 crates**. An all-rounder for deliveries and escapes.
- **Supercar.** Highest top speed and quickest acceleration, **2 damage pips**, **1 crate**. Best when there's room to build speed.
- **Van.** Wide turns, lower top speed, **6 damage pips**, **4 crates**. Breaks through foam construction barriers without damage.

Driving stays automatic. Steering turns the body first, and the tires pull the car's momentum around over the next few frames. The hatchback grips sooner than the coupes. Fast turns leave short skid marks. On desktop, steer with **Left / Right** or **A / D** and brake with **Down**, **S**, or **Space**.

**Early vehicle pace.** Player vehicles have fixed speed stats. Players gain speed by unlocking or buying faster cars. Police and civilian NPC upgrades use explicitly authored speeds or fixed speed increases. Use these values directly across chapters, missions, and bonuses. Chapter 1 currently features player and patrol cars. Future civilian NPC speeds remain open. Verified locally on 26 November 2026. The catalog sets the Starter Coupe to 120, Street Coupe to 136, and City Hatchback to 116 world units per second. Each of the six Chapter 1 patrols uses an authored 54.4 world units per second. The active runtime and authored content have zero chapter, mission, or bonus speed multipliers. Both content validators and all 22 Node tests passed. Level Design verified that both coupes cleared all 21 main jobs and 21 bonuses with unchanged opening and patrol capture timing. In the later local acceleration pass, the first three models use gently reduced fixed acceleration values of 194 for the Starter Coupe, 209 for the Street Coupe, and 213 for the City Hatchback, in world units per second squared.

The player starts with a Tier 1 car. **Canal Ward requires Tier 1, Neon Strip requires Tier 2, and Breakwater Port requires Tier 3.** A Tier 2 hatchback should feel like a stronger hatchback and still carry less than a Tier 2 van. Starting with Tier 2, offer an affordable entry car and let players earn cash through replays for vehicles they want. On a replay that allows vehicle selection, higher tiers are eligible in earlier areas if the vehicle matches the mission's category.

Light wall scrapes bleed speed. Hard wall hits and car collisions cost a damage pip, and a hard hit against a wall or civilian car can knock you off your line. Sustained contact counts as one impact. At zero pips the car is wrecked and the attempt ends. Main jobs start with a fresh car. A bonus contract keeps the damage if you stay in the same car. A vehicle swap gives you the condition shown on the new car. Show cargo as **2 / 4 crates**. Capacity applies to bulky pickups. Cash bags use no slots.

Start with sparse civilian traffic and parked patrols off the opening route. Add more on later jobs. Driving close to a parked patrol raises heat by one and puts that car into the chase. Crashing into traffic also adds one heat and calls another patrol. Heat caps at five. The survival timer can bring heat up to its planned level and preserves heat you've already drawn from the streets.

Banked cash buys district safehouses and cars. Show both requirements together on the next district card, for example **Neon Strip access $600 · Tier 2 car from $600**. In the legacy four-job economy example, banking all Canal Ward base payouts earns **$900**. The **$1,200** combined cost leaves **$300** to earn by replaying an earlier job or banking optional objectives. A successful Last Ferry replay alone can cover the gap. Aim for a small number of successful replays at each area boundary, with more replay value for players who want several cars. Leave equipment purchases provisional until an optional arcade shooting job proves that aiming and steering are fun together.

Test **five regenerating lives**, one back every **25 minutes**. A failed attempt costs one life, whether the cause is a bust, a wreck, or missing a hard objective deadline. Each attempt charges only once. Banking and completing jobs cost nothing. A practice route stays available at zero lives. Test any cash refill separately from area prices so a player can judge what they're giving up.

## Chapter 1 playtesting

Use the accepted 21-mission foundation to playtest readability, difficulty, balance, driving feel, and progression. Refine story and production art after gameplay and rules are settled.
