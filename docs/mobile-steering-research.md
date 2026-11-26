# Mobile steering research

26 November 2026. Research for the Chapter 1 touch steering rework after playtest feedback that small inputs turn the car too far and course corrections are hard to finish. The current design pairs the bottom-right steering wheel with a separate left brake pedal. [Working design](../HEATWAVE-GETAWAY-DESIGN.md)

## What developers document

- **GRID Autosport mobile.** Feral’s Wheel Touch mode steers by rotating the on-screen wheel and places the pedals on the opposite side. The standard and more sensitive Pro presets share the same gesture, and steering can be tuned separately. Feral also documented making its default touch steering easier in a subsequent iOS update. [Feral controls FAQ, section 6](https://www.feralinteractive.com/en/faqs/gridautosport/latest/ios/) · [Feral touch controls update](https://www.feralinteractive.com/en/news/grid-autosport-for-ios-enhances-controls-in-second-update/?platform=mquest)
- **Rush Rally 3 and Rush Rally Origins.** Brownmonster documents customizable touch and tilt controls in Rush Rally 3 and resizable, movable touch buttons in the top-down Origins. A separate Rush Rally 3 Switch update note describes an optional counter-steering aid that acts when the car starts sliding and can help with button steering. [Rush Rally 3](https://rushrally.co.uk/rushrally3/index.html) · [Rush Rally Origins](https://www.rushrally.co.uk/rushrallyorigins/) · [Brownmonster’s update note](https://www.rushrally.co.uk/blog/2020/0011_missing_options/index.html)
- **Reckless Racing 3.** Pixelbite’s listing documents customizable touch controls and a tilt option. Its release notes mention a sensitivity slider for gamepads specifically. [Pixelbite’s App Store listing](https://apps.apple.com/us/app/reckless-racing-3/id882453590)
- **Unity Input System.** The platform manual describes a position-based stick with bounded displacement from the initial touch and pointer-up as the end of the gesture. Its separate deadzone processor suppresses small inputs around center and scales the remaining range. These are toolkit behaviors. [On-screen sticks](https://docs.unity3d.com/Packages/com.unity.inputsystem@1.4/manual/OnScreen.html#on-screen-sticks) · [Stick deadzone processor](https://docs.unity3d.com/Packages/com.unity.inputsystem@1.4/api/UnityEngine.InputSystem.Processors.StickDeadzoneProcessor.html)

## Prototype direction to test

Our 60 Hz baseline replay at 390 px wide mapped a 15 px pull to 0.270 steering input. A 200 ms pulse at full driving speed changed heading by 8.19°. Recentering added no further heading change, but the car still moved 5.79 units laterally in the next 0.4 s. An opposite pulse at half the steering input for the same 200 ms (12 ticks) left 4.14° of heading change. These are project measurements from the PM’s baseline replay.

Make sideways displacement the primary fine-adjustment gesture. Give it a narrow neutral band and a gentler response just outside center, rising smoothly to full steer at the edge. Crossing center should let the player steer the other way immediately, and release should clear steering input immediately. Keep deliberate rim rotation continuous through 180° and a full turn, with steering easing as the player unwinds. Keep the separate brake usable throughout. This is a proposal for our controls. Tune the steering response in our own playtest.

On C1-01, compare small left and right corrections and how often players need an opposite correction at 320×568 and 390×600. On C1-04–06, check turning range and steering while braking. Watch steering input, car heading and travel direction separately after release so residual lateral motion can be traced to the correct part of the handling.

## Verified local result

In the PM’s before-and-after Edge touch replay at 390 CSS px wide on 26 November 2026, the same 15 CSS px hub pull held for 200 ms at cruising speed changed heading by 8.39° before the rework and 4.28° after. The hub reached exact neutral during a continuous pass through center, and the opposite command recovered heading and course. This browser replay is separate from the 60 Hz baseline above.

In a matched 60 Hz replay at the same screen width, the 15 px steering input fell from 0.270 to 0.158 and the 200 ms heading change fell from 8.19° to 3.86°. Lateral travel in the 400 ms after returning to neutral fell from 5.79 to 2.73 world units. The equal-duration, half-amplitude opposite pulse left 1.96° of heading change, down from 4.14°.

The build tested here selected the gesture when the thumb landed. Hub starts used sideways position for the entire touch, with a 9 CSS px neutral band on either side of center and a progressive response. Rim starts allowed continuous rotation and unwinding. Release cleared either gesture. Touch steering used full authority at low speeds and in the tested build’s reverse mode, tapering to 80% at forward top speed. Course corrections remained under the driver’s control. The owner subsequently removed brake-to-reverse from the design.
