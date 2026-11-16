# Living Shadow Theater — Design (v1 prototype)

*2026-11-16*

## Intent

Shadow theater was a way of telling stories before cinema. This project makes it *alive*: you cast a hand shadow on a wall, the system recognizes what it is, and a projected shadow-creature peels off your shadow, completes itself into a full figure, and moves off across the wall on its own.

The magic must happen **in the room, on the wall** — not on a screen. The projected creatures look like shadows themselves (soft gray silhouettes), so you can't tell where the real shadow ends and the projected one begins.

Inspiration: [brendan's paper-bat video](https://x.com/builtwbrendan/status/2120703687819665907) — a paper-cutout bat's shadow is "taken over" by a projected gray bat that flies off and reacts to a hand. Our twist: **hands instead of paper cutouts**, and the system **enhances** the shape — hands can only make a dog's *head*, so the system completes the whole dog.

Long-term (not v1): creatures spin into short 10–15 s stories, talk, interact.

## Goals (v1)

1. Recognize 4 classic hand-shadow shapes: **dog, rabbit, butterfly, swan** — in the hand versions listed under "Hand versions" below.
2. While the performer **keeps holding** the shape, a projected creature **emerges from the edge of the real shadow**, morphs from "just the head/shape" into a complete figure, and moves away into open wall.
3. The creature's head/anchor starts **exactly aligned** with the real shadow (same position, size, angle), so there's no visible jump.
4. The creature moves **away from the performer** (toward the open side of the wall), never overlapping the performer's body shadow, so the full figure is visible.
5. Creatures are drawn in an original, bold, simple, geometric style — inspired by the *feel* of Keith Haring's flat animals (chunky, iconic, recognizable at a glance), rendered as soft gray shadow silhouettes.

## Non-goals (v1)

- Stories, narration, dialogue, voice, sound.
- Phone-only / screen-based versions (explicitly rejected: it must happen on the wall).
- Arbitrary shapes beyond the 4-creature cast (unknown shapes get a graceful fallback only).
- Multiple performers, multiple simultaneous creatures (nice if it falls out, not required).

## Anti-goals (a failure even if it "works")

- It looks like a cartoon playing on a screen: colorful, sharp-edged, clearly "projected video".
- The creature spawns somewhere unrelated to the hand, or visibly pops/jumps at the handoff.
- The creature runs into/behind the performer's body shadow, so the performer can't see it.
- It feels laggy: holding a pose for many seconds with nothing happening.
- Realistic/detailed creatures that clash with the chunky hand-shadow fidelity.

## Physical setup (decided)

```
  WALL  (projector shows a plain white "canvas")
    ▲    ✋  performer stands in the beam, often entering from one side
    │
 [XGIMI projector] ◄── HDMI ── [laptop]  (laptop = the brain)
 [laptop lid turned to face the wall; built-in webcam is the camera]
```

- **Light source = the projector itself.** No separate lamp. Dark room.
- **Camera = the laptop's built-in webcam**, lid facing the wall, placed **off to the side of / below the projector** (e.g. low on a table to one side, like the webcam in the reference video), *not* right at the lens. *(Builder's call, correcting an earlier suggestion:)* a camera at the projector's exact viewpoint can't see the shadow — the hand hides its own shadow from that angle. Off-axis costs nothing in accuracy: shadows lie on the wall plane, and the calibration maps the wall plane between camera and projector from any camera position. The whole projected area must be in frame. The performer won't look at the laptop screen.
- The laptop drives the projector over HDMI; the app runs fullscreen on the projector output.
- Fallback camera if the webcam proves inadequate (field of view, flicker): the user's phone placed beside the projector, streaming to the laptop. Not built unless needed.

## Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| Phone-only "magic window" (flashlight + phone, magic on phone screen) | Super portable, but the magic lives on a screen | **Rejected** — must happen in the room |
| Phone camera + laptop + projector | Phone may have better camera/placement, but needs streaming | Fallback only |
| **Laptop webcam + laptop + projector** | Simplest: no streaming, one device; webcam quality is plenty for high-contrast shadows | **Chosen** |
| Rear projection through a sheet | More theatrical, audience doesn't see hands; more to build | Later, maybe |

## Hand versions

Decided with the user (the most popular classic versions):

| Creature | Hand version | Notes |
|---|---|---|
| **Butterfly** | Two hands, thumbs hooked together, fingers spread as wings | The thumbs-hooked shape is *always* butterfly (no separate "bird"), which removes the bird/butterfly confusion |
| **Dog** | Classic dog head, one or two hands — **mouth open or closed both count** | A moving jaw is a nice cue to animate (bark) |
| **Swan** | Forearm as the neck, hand as head/beak | One-arm shape; the arm shadow becomes the long neck |
| **Rabbit** | The most common rabbit (two fingers up as ears) | Builder picks the classic one-hand version; two-hand version may also work |

Short clips of the user performing each will be recorded at milestone 0/1 and become the test set.

## How we develop & test

The builder works remotely; only the user has the projector, laptop and room. So:
- Every milestone ships as a page the user opens on their laptop, with a **debug view** (camera feed, detected shadow, calibration overlay) and a way to **record a short clip** to send back.
- Development runs against those recorded clips plus a simulated projector→camera loop; the user tests live at each milestone.

## How it behaves

1. **Idle:** projector shows a white wall. (Optionally very faint ambient touches — not required.)
2. **Performer enters** from an edge; body and arm shadows appear. System tracks all real shadow regions.
3. **Shape held** (~0.5–1 s reasonably still): system recognizes it (dog / rabbit / butterfly / swan / unknown) and determines where the "creature anchor" is (e.g. the dog's head, its facing direction) and which side is open (away from the performer's body shadow — the large shadow region connected to a frame edge).
4. **Peel-off (no release needed):** a projected gray copy of the shape emerges from the shadow's open-side edge, and as it slides away it morphs into the full geometric creature (dog: head stays dog-head-like, body/legs/tail grow in).
5. **Go:** the creature does its thing in the open space — dog trots off (maybe a little shake/"bark" puff), rabbit hops, butterfly flutters up and around, swan glides away (neck sways, maybe a wing flap) — and exits the wall or fades.
6. Performer can hold, move, or make another shape; next creature can follow.
7. **Unknown shape:** a gray copy of the actual silhouette peels off and gently drifts/dissolves, so it never just "does nothing".

### Physical constraint the design relies on
Anything projected where the performer's hands/body block the beam lands on the performer, not the wall. So creatures must be born at the **edge** of the real shadow and move outward; the app keeps projecting plain white inside real-shadow regions so real shadows stay crisp.

## Technical shape (proposed — builder may refine)

- **App:** a web page running fullscreen in the laptop's browser on the projector output; webcam via `getUserMedia`. A small local server is fine if needed (e.g. to hold an API key).
- **Calibration (one-time, ~10 s at startup):** projector shows a known pattern; camera finds it; compute camera→projector mapping (homography) so a shadow seen at camera pixel X can be drawn at the exact matching projector pixel.
- **Shadow segmentation:** dark room + white projection → real shadows are near-black against bright. The app always knows what it is projecting, so it predicts what the wall *should* look like and treats only *unexpected* darkness as real shadow — its own creatures are masked out, not told apart by brightness. Must cope with webcam auto-exposure and possible projector flicker/banding (DLP).
- **Recognition:** classify the hand-region silhouette into the cast. Likely a vision-capable LLM (e.g. Claude) given the silhouette image and the fixed cast list, returning structured output: creature, confidence, anchor point, facing direction. A local classifier or shape heuristics may be used instead or as a pre-filter if latency is a problem. Thumbs-hooked = butterfly, by definition (no bird in the cast).
- **Creatures:** hand-built (by the builder) jointed geometric silhouettes — head, body, legs, tail, wings as simple shapes — animated procedurally (walk/hop/flutter/flap cycles). Rendered to **match the real shadow** as closely as possible (projecting black ≈ a real shadow, since both are "no projector light"), with edges softened to match the real shadow's edge blur — the goal is that the handoff is invisible. *(Settled from the intent: "can't tell where the real shadow ends.")*
- **Morph:** interpolate from the captured real silhouette (or a simplified version of it) to the creature's full shape while translating toward the open side.

## Success looks like

The user stands at the edge of the projected wall, makes a dog head with their hands, holds it about a second, and a gray dog grows out of their shadow — whole body, legs, tail — and trots away across the open wall, visibly a dog, looking like a shadow. Works most of the time (aim ~4 of 5 tries) for all four creatures, in the user's room, with their XGIMI and laptop.

## Milestones (suggested order)

0. **Throwaway camera test:** webcam view + live outline of the real shadow projected back onto the wall. Confirms camera framing, exposure, flicker, and that the laptop webcam is good enough.
1. Calibration + reliable real-shadow segmentation.
2. Peel-off of the raw silhouette (unknown-shape fallback) — proves alignment and open-side direction.
3. Recognition of the 4 shapes.
4. Geometric creatures + morph + motion.
5. Stretch: creature shies away from a hand shadow (like the reference video).

## Left to the builder

- Exact segmentation and calibration techniques; flicker handling.
- Recognition approach (LLM vs local vs hybrid), model choice, prompt.
- Creature art and animation implementation — but the user will want to see and react to the creature look early (show sketches/mockups of the 4 creatures before polishing).
- Timing values (hold duration, animation lengths).
- Browser specifics. **Hardware (from the user): MacBook (built-in webcam; an iPhone via Continuity Camera is a free fallback camera) + XGIMI Halo (DLP projector).** Expect DLP flicker/banding on camera; macOS browsers generally can't lock webcam exposure, so handle exposure drift in software.
- The Halo's auto-keystone and autofocus **stay on** (user requirement). Autofocus only changes sharpness, not geometry — harmless. Auto-keystone changes the picture's shape, but only re-triggers when the projector is moved/bumped. So: calibrate after the projector has settled, offer a one-key quick recalibration (~1–2 s pattern flash), and ideally detect misalignment automatically (projected content no longer where expected) and recalibrate on its own.
