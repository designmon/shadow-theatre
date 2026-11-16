# Living Shadow Theater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser app on a MacBook that watches a projected white wall through the built-in webcam, recognizes a held hand shadow (dog, rabbit, butterfly, swan), and projects a matching geometric shadow-creature that peels off the real shadow and moves away into open wall.

**Architecture:** A Vite + TypeScript single-page app runs fullscreen on the XGIMI (via HDMI). Each frame: grab a small grayscale webcam frame → compare with the *expected* wall brightness (from calibration + what we're currently projecting) → real-shadow mask → find the performer's shadow, its "puppet" tip and the open side → when held still, snapshot the tip, start a peel-off immediately (hides latency) and ask a tiny local Node server, which calls Claude vision, what it is → morph the peel-off into the rigged creature, which walks/hops/flutters/glides off. All geometry lives in camera space until drawing, where a homography maps it to projector space.

**Tech Stack:** TypeScript, Vite, Vitest (+ jsdom only where a canvas isn't needed), Canvas 2D, `getUserMedia`, `MediaRecorder`; Node 20+ server using `node:http`, `tsx`, `@anthropic-ai/sdk`, `zod`.

**Spec:** `docs/superpowers/specs/2026-11-16-living-shadow-theater-design.md`

## Global Constraints

- Cast is exactly: `dog`, `rabbit`, `butterfly`, `swan`, plus fallback `unknown`. Thumbs-hooked two-hand shape = `butterfly` (there is no bird).
- Dog counts with mouth open or closed.
- Creatures render as **black** (no projector light) with softened edges, on a **white** stage — they must look like real shadows. No color anywhere on the stage except the debug overlay.
- Creatures are born at the edge of the real shadow and move toward the open side; never into the performer's body shadow.
- The performer never needs to release the pose; peel-off starts while they hold it.
- Hardware: MacBook built-in webcam (lid facing the wall, beside/below the projector, off-axis), XGIMI Halo. Auto-keystone and autofocus stay ON — handle re-alignment in software (key `C` + automatic detection).
- Claude model: `claude-opus-5-5`, `output_config.effort: "low"`, structured output via Zod. Server-side refusal fallback on (`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`); a refusal or any error resolves to `unknown`.
- API key lives only in the Node server's environment (`ANTHROPIC_API_KEY` or an `ant auth login` profile), never in browser code.
- Processing resolution: camera frames downscaled to **320×240** grayscale.
- Timing defaults: hold **700 ms** at IoU ≥ **0.85**; recognition timeout **4000 ms**; peel-off slide **600 ms**; morph **500 ms**.
- Keys: `F` fullscreen, `C` calibrate, `D` debug overlay, `R` start/stop recording a clip (downloads `.webm`).

## Review Focus

1. **Webcam auto-exposure jump when a big body shadow enters** — expected: shadow detection stays stable (gain normalization in Task 3 test `normalizes exposure gain`).
2. **Shadow touches no frame edge (hand only, or paper cutout floating mid-wall)** — expected: whole blob is the puppet; open side = direction with the most free wall (Task 4 test `free-floating blob picks the emptiest side`).
3. **Projector gets bumped and auto-keystone reshapes the image** — expected: misalignment detected, auto-recalibration (Task 9 test `alignment score drops when shifted`).
4. **No API key / server down / slow network** — expected: peel-off still happens and resolves to the `unknown` drift-away (Task 7 tests `client times out to unknown`, `server error resolves unknown`).
5. **The app's own black creatures being seen by the camera as new shadows** — expected: never triggers recognition (Task 3 test `ignores pixels we project dark`).

---

## File Structure

```
living-shadow-theater/
  package.json, tsconfig.json, vite.config.ts, index.html, creatures.html
  server/
    index.ts            node:http server on :8787, POST /api/recognize
    recognize.ts        handleRecognize(): Claude call + schema
  src/
    types.ts            Gray, Mask, Pt, Box, H, Side, CreatureKind, Recognition
    main.ts             bootstrap, key bindings, frame loop, state machine
    camera.ts           startCamera, grabGray
    stage.ts            fullscreen projector canvas + draw loop
    calibration/
      homography.ts     solveHomography, applyH, invertH, warpMask
      pattern.ts        drawCalibrationPattern, findMarkers
      calibrate.ts      runCalibration -> Calibration
      alignment.ts      alignmentScore
    vision/
      shadowMask.ts     buildExpected, shadowMask
      blobs.ts          findBlobs
      scene.ts          analyzeScene
      hold.ts           HoldDetector, iou
      snapshot.ts       maskToPng
    recognize/client.ts recognize()
    creatures/
      style.ts          SHADOW style constants, drawShadowPath helper
      path.ts           planPath
      rig.ts            Part, Rig, drawRig
      dog.ts rabbit.ts butterfly.ts swan.ts
      index.ts          createCreature
      peel.ts           PeelOff
    debug/
      overlay.ts        drawDebug
      recorder.ts       Recorder
    creatures-preview.ts  mockup page for creatures.html
  tests/ (mirrors src/ and server/)
```

---

### Task 1: Scaffold + camera test (milestone 0)

The user runs this in their room the same day to check the webcam, framing, flicker and exposure. Projects white; shows a picture-in-picture of the camera and the detected shadow outline; `R` records a clip.

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts` (proxy `/api` → `http://localhost:8787`), `index.html`, `src/types.ts`, `src/camera.ts`, `src/stage.ts`, `src/main.ts`, `src/vision/shadowMask.ts`, `src/debug/overlay.ts`, `src/debug/recorder.ts`, `README.md` (setup: laptop placement, `npm i`, `npm run dev`, open in Chrome, `F` for fullscreen on the projector display)
- Test: `tests/vision/shadowMask.test.ts`

**Interfaces:**
- Produces (`src/types.ts`):
  ```ts
  export type Gray = { width: number; height: number; data: Uint8ClampedArray }; // 1 byte/px luminance
  export type Mask = { width: number; height: number; data: Uint8Array };        // 0|1
  export type Pt = { x: number; y: number };
  export type Box = { x: number; y: number; w: number; h: number };
  export type H = number[]; // 3x3 row-major, length 9
  export type Side = 'left' | 'right' | 'up' | 'down';
  export type CreatureKind = 'dog' | 'rabbit' | 'butterfly' | 'swan' | 'unknown';
  export type Recognition = { kind: CreatureKind; confidence: number; facing: Side; anchor: Pt /* 0..1 in snapshot */ };
  ```
- Produces: `startCamera(): Promise<{ video: HTMLVideoElement; stream: MediaStream }>`; `grabGray(video, w = 320, h = 240): Gray`; `createStage(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; size(): { w: number; h: number } }`; `shadowMask(frame: Gray, expected: Gray | null, ratio = 0.45): Mask` (with `expected === null`: global threshold at `ratio ×` the 90th-percentile brightness); `drawDebug(ctx, info: { frame: Gray; mask: Mask; scene?: unknown; fps: number })`; `class Recorder { toggle(stream: MediaStream): void }`.

- [ ] **Step 1: Scaffold** — `npm init`, add deps (`vite`, `typescript`, `vitest`, `tsx`, `@anthropic-ai/sdk`, `zod`), scripts `dev` (vite), `server` (tsx server/index.ts), `test` (vitest run). `git init` and commit the scaffold.
- [ ] **Step 2: Write failing tests** `tests/vision/shadowMask.test.ts`:
  - `marks dark region as shadow without expected`: 320×240 frame at 200, a 40×40 square at 20 → mask has 1600 ones, all inside the square.
  - `ignores mid-gray noise`: frame 200 with pixels at 150 → zero ones.
- [ ] **Step 3: Run** `npx vitest run tests/vision/shadowMask.test.ts` → FAIL (module missing).
- [ ] **Step 4: Implement** `shadowMask` (null-expected path only for now), camera, stage (fills white), overlay (PiP 25% size top-left: camera gray + mask in red), recorder (`MediaRecorder` on the camera stream, downloads `shadow-clip-<timestamp>.webm`), main (loop: grab → mask → draw white + debug when `D`).
- [ ] **Step 5: Run** tests → PASS. `npm run dev`, open in Chromium headless via Playwright with a fake camera (`--use-fake-device-for-media-stream`) and confirm no console errors.
- [ ] **Step 6: Commit** `feat: scaffold and camera test page`.

### Task 2: Homography + calibration

**Files:**
- Create: `src/calibration/homography.ts`, `src/calibration/pattern.ts`, `src/calibration/calibrate.ts`
- Modify: `src/main.ts` (key `C`; auto-run calibration on start)
- Test: `tests/calibration/homography.test.ts`, `tests/calibration/pattern.test.ts`

**Interfaces:**
- Produces: `solveHomography(src: Pt[], dst: Pt[]): H` (DLT, ≥4 points); `applyH(h: H, p: Pt): Pt`; `invertH(h: H): H`; `warpMask(mask: Mask, h: H /* maps OUTPUT px -> INPUT px */, outW: number, outH: number): Mask` (nearest-neighbour inverse mapping).
- Produces: `drawCalibrationPattern(ctx, w, h): Pt[]` — black screen with 4 white 60×60 squares, centers inset 12% from each corner, returns centers TL, TR, BR, BL; `findMarkers(lit: Gray, dark: Gray): Pt[] | null` — diff `lit − dark`, threshold, 4 largest blobs (uses `findBlobs` from Task 4 — if Task 4 isn't done yet, implement a minimal flood fill here and swap later), ordered TL, TR, BR, BL by centroid; `null` if fewer than 4.
- Produces: `type Calibration = { camToProj: H; projToCam: H; whiteRef: Gray }`; `runCalibration(stage, video): Promise<Calibration>` — show black (grab `dark` after 400 ms), show pattern (grab `lit` after 400 ms), solve, show full white (grab `whiteRef` after 400 ms, averaged over 5 frames to suppress DLP flicker).

- [ ] **Step 1: Failing tests**
  - `identity maps points to themselves`; `recovers a known perspective`: build H from 4 hand-picked pairs, `applyH` on a 5th point equals the ground-truth projective transform within 0.01 px; `invertH round-trips` within 1e-6.
  - `warpMask translates`: a 10×10 square warped by a pure +5 px x-translation lands 5 px right.
  - `findMarkers finds four squares in order`: synthetic lit/dark frames with 4 bright squares under a mild perspective → returned points within 1.5 px of truth, TL..BL order; `findMarkers returns null with 3 squares`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** (DLT with 8×8 linear solve via Gaussian elimination, h33 = 1).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: camera-projector calibration`.

### Task 3: Shadow segmentation against the expected wall

**Files:**
- Modify: `src/vision/shadowMask.ts`
- Test: `tests/vision/shadowMask.test.ts`

**Interfaces:**
- Consumes: `Calibration`, `warpMask`.
- Produces: `buildExpected(whiteRef: Gray, projectedDarkCam: Mask): Gray` — copy of `whiteRef` with pixels set to 0 where we project black (mapped into camera space); `shadowMask(frame, expected, ratio = 0.45)` — ignores pixels whose expected value < 40; estimates `gain = median(frame / expected)` over lit pixels whose ratio > 0.7 (i.e. unshadowed), then marks shadow where `frame < ratio × gain × expected`.

- [ ] **Step 1: Failing tests**
  - `detects shadow on non-uniform wall`: whiteRef with a left→right gradient 120..240; frame = whiteRef with a square at 15% brightness → mask equals the square (±2% pixels).
  - `normalizes exposure gain`: same frame but every pixel ×0.6 (camera darkened) → same mask.
  - `ignores pixels we project dark`: projectedDarkCam covers a region where frame is black → no shadow there.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: expected-brightness shadow segmentation`.

### Task 4: Blobs + scene analysis (puppet tip, open side)

**Files:**
- Create: `src/vision/blobs.ts`, `src/vision/scene.ts`
- Test: `tests/vision/blobs.test.ts`, `tests/vision/scene.test.ts`

**Interfaces:**
- Produces: `type Blob = { area: number; box: Box; pixels: Int32Array /* indices */; touches: Record<Side, number> /* border px count per side */ }`; `findBlobs(mask: Mask, minArea = 150): Blob[]` (4-connected, sorted by area desc).
- Produces: `type Scene = { puppet: Mask; puppetBox: Box; entry: Side | null; openSide: Side; bodyBox: Box | null }`; `analyzeScene(mask: Mask, blobs: Blob[]): Scene | null` (null when no blob).
  Algorithm: take the largest blob. `entry` = side with the most border pixels (null if none). If `entry` set: the **puppet** is the blob's pixels within `0.3 × frame dimension` (along the entry axis) of its far extreme; `openSide` = opposite of `entry`, except entry `down` → open `up`; `bodyBox` = box of the remaining pixels. If `entry` null: puppet = whole blob; `openSide` = side with the largest gap between blob box and frame edge; `bodyBox` null.

- [ ] **Step 1: Failing tests**
  - `findBlobs separates two squares` (2 blobs, areas right, touches all 0); `drops specks below minArea`.
  - `arm from the left: open side is right`: synthetic body block on the left edge + horizontal arm + a 30×30 "hand" at x≈200 → `entry 'left'`, `openSide 'right'`, `puppetBox` contains the hand and starts at x ≥ 130.
  - `arm from the bottom: open side is up`.
  - `free-floating blob picks the emptiest side`: blob at x 20..80 mid-height → `openSide 'right'`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: scene analysis for puppet and open side`.

### Task 5: Hold detection + snapshot

**Files:**
- Create: `src/vision/hold.ts`, `src/vision/snapshot.ts`
- Test: `tests/vision/hold.test.ts`

**Interfaces:**
- Produces: `iou(a: Mask, b: Mask): number`; `class HoldDetector { constructor(opts?: { holdMs?: number; minIou?: number; cooldownMs?: number /* default 1500 */ }); push(puppet: Mask, tMs: number): boolean /* true exactly once per hold */; reset(): void }`. Compares each frame with the frame that started the current stillness run.
- Produces: `maskToPng(mask: Mask, box: Box, pad = 12): Promise<Blob>` — black silhouette on white, cropped to box + pad, scaled so the long side is 256 px (browser `OffscreenCanvas`).

- [ ] **Step 1: Failing tests**
  - `fires after 700 ms of stillness` (same mask at t=0..800 step 33 → true once, at the first t ≥ 700).
  - `does not fire while moving` (mask shifted 8 px each frame → never).
  - `fires once, then cooldown` (keeps holding to t=3000 → exactly one more fire only after release + new hold, none during cooldown).
  - `iou of identical is 1, disjoint is 0`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: hold detection and silhouette snapshot`.

### Task 6: Peel-off with the raw silhouette (unknown fallback, end-to-end)

Proves alignment and direction before any AI: hold any shape → its black copy slides out of the shadow toward the open side and drifts/dissolves.

**Files:**
- Create: `src/creatures/style.ts`, `src/creatures/path.ts`, `src/creatures/peel.ts`
- Modify: `src/main.ts` (state: `watching → peeling`; spawn a `PeelOff` on hold; add creature's projected-dark mask to `buildExpected` each frame), `src/stage.ts` (draw active creatures)
- Test: `tests/creatures/path.test.ts`, `tests/creatures/peel.test.ts`

**Interfaces:**
- Consumes: `Scene`, `Calibration`, `warpMask`, `applyH`.
- Produces (`style.ts`): `SHADOW = { color: '#000', blurPx: 3 }`.
- Produces (`path.ts`): `type Spawn = { anchorBox: Box /* projector px */; facing: Side; openSide: Side; wall: { w: number; h: number }; avoid: Box | null }`; `planPath(spawn: Spawn, seed?: number): Pt[]` — starts at the anchorBox center, first segment heads to `openSide` for at least `anchorBox.w`, gentle wander, ends ≥ 1 creature-width outside the wall on a side that is not the `avoid` side.
- Produces (`peel.ts`): `interface Creature { readonly kind: CreatureKind; update(dtMs: number): void; draw(ctx: CanvasRenderingContext2D): void; readonly done: boolean; darkMask(w: number, h: number): Mask /* projector px it currently darkens */ }`; `class PeelOff implements Creature { constructor(silhouette: HTMLCanvasElement | OffscreenCanvas, spawn: Spawn); resolve(rec: Recognition): void }` — slides 600 ms toward `openSide` by one anchor width (born adjacent to the real shadow, never over it), then waits for `resolve`; on `unknown` (or no resolve within 4000 ms) it drifts along `planPath` while fading out over 2 s.

- [ ] **Step 1: Failing tests**
  - `path starts at anchor center`; `first move is toward open side` (for each Side); `path never enters avoid box` (inflated by 10 px, 50 random seeds); `path ends off-wall`.
  - `peel starts aligned`: at t=0 the drawn bounding box equals `anchorBox` (±1 px) — test via `darkMask` bbox.
  - `peel never overlaps the source shadow after slide`: at t=600 `darkMask` bbox doesn't intersect `anchorBox`.
  - `unresolved peel finishes as unknown`: after 6100 ms with no `resolve`, `done === true`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: silhouette peel-off with open-side path`.
- [ ] **Step 6: User checkpoint** — ask the user to try it live with any shadow and send a clip (`R`). Fix alignment/direction issues before continuing.

### Task 7: Recognition (server + client)

**Files:**
- Create: `server/recognize.ts`, `server/index.ts`, `src/recognize/client.ts`
- Modify: `src/main.ts` (on hold: `maskToPng` → `recognize` → `peel.resolve`)
- Test: `tests/server/recognize.test.ts`, `tests/recognize/client.test.ts`

**Interfaces:**
- Produces (server): `RecognitionSchema` (Zod: `kind` enum of the 5 kinds, `confidence` 0..1, `facing` enum of Side, `anchor` `{x,y}` 0..1); `handleRecognize(png: Buffer, client: Pick<Anthropic, 'beta'>): Promise<Recognition>`; HTTP `POST /api/recognize` (body `image/png`) → JSON `Recognition`; any thrown error → `200` with `{ kind: 'unknown', confidence: 0, facing: 'right', anchor: { x: 0.5, y: 0.5 } }` and a server log line.
- Request: `client.beta.messages.parse({ model: 'claude-opus-5-5', max_tokens: 1024, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'low', format: zodOutputFormat(RecognitionSchema) }, system: <prompt>, messages: [{ role: 'user', content: [image base64 png, text] }] })`. If the installed SDK has no `beta.messages.parse`, use `beta.messages.create` with the same `output_config.format` and `JSON.parse` + `RecognitionSchema.parse` the text. If `stop_reason === 'refusal'` or `parsed_output` is null → unknown. Map `kind` to `unknown` when `confidence < 0.5`.
- System prompt (exact intent, builder may word-smith): the image is a black hand-shadow silhouette on white made by a person's hands/arm; classify into dog (classic dog head, mouth open or closed), rabbit (two-finger ears), butterfly (two hands with hooked thumbs, fingers as wings), swan (forearm as long neck, hand as head/beak), or unknown; `anchor` = the creature's head (for butterfly: body center); `facing` = direction the head points.
- Produces (client): `recognize(png: Blob, timeoutMs = 4000): Promise<Recognition>` — never rejects; timeout/network/non-200 → unknown.

- [ ] **Step 1: Failing tests** (server with a fake client object; no network)
  - `returns parsed recognition`; `low confidence becomes unknown`; `refusal resolves unknown`; `server error resolves unknown` (fake throws).
  - client: `client times out to unknown` (fetch never resolves, fake timers); `client passes through server JSON`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Live smoke test** (only if credentials are available: `ant auth status` or `ANTHROPIC_API_KEY`): post 4 hand-drawn test silhouettes (`tests/fixtures/*.png`, drawn programmatically: dog head, rabbit ears, butterfly, swan neck) and print results. Report what came back; don't tune the prompt beyond obvious errors until the user's real clips exist.
- [ ] **Step 6: Commit** `feat: Claude shadow recognition`.

### Task 8: Geometric creatures + preview page

**Files:**
- Create: `src/creatures/rig.ts`, `src/creatures/dog.ts`, `rabbit.ts`, `butterfly.ts`, `swan.ts`, `src/creatures/index.ts`, `creatures.html`, `src/creatures-preview.ts`
- Test: `tests/creatures/creatures.test.ts`

**Interfaces:**
- Produces (`rig.ts`): `type Part = { name: string; path: Path2D | ((ctx) => void); pivot: Pt; parent?: string; angle: number }`; `type Rig = { parts: Part[]; headBox: Box /* in rig units */ }`; `drawRig(ctx, rig, at: { x: number; y: number; scale: number; flipX: boolean })`.
- Produces (`index.ts`): `createCreature(kind: Exclude<CreatureKind, 'unknown'>, spawn: Spawn): Creature` — scale chosen so the rig's `headBox` (wings span for butterfly) matches `spawn.anchorBox`; follows `planPath(spawn)`; motion: dog trot (4-leg cycle, tail wag, one head-bob "bark"), rabbit hop arcs, butterfly flutter (wing scaleX oscillation) rising in loops, swan glide (neck sway, one wing raise). Bold, flat, chunky geometric shapes (rounded rectangles, circles, triangles) — Haring-like *feel*, original drawings.
- `creatures.html`: white page, all four creatures looping side by side, large — this is the mockup the user reviews.

- [ ] **Step 1: Failing tests** (for each of the 4 kinds)
  - `head aligns with anchor at t=0`: transformed `headBox` within 2 px of `spawn.anchorBox`.
  - `stays finite`: 300 updates of 33 ms → no NaN in position/angles.
  - `eventually done`: `done` within 15 s for a 1920×1080 wall.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Screenshot** `creatures.html` with Playwright (deviceScaleFactor 2) and send it to the user.
- [ ] **Step 6: User checkpoint** — user approves the creature look (or gives changes) before Task 9.
- [ ] **Step 7: Commit** `feat: geometric shadow creatures`.

### Task 9: Morph, full flow, auto-recalibration

**Files:**
- Modify: `src/creatures/peel.ts` (`resolve` with a known kind → 500 ms morph: silhouette cross-fades/scales into the creature whose head sits where the silhouette's anchor is, then hands over to the creature's motion), `src/main.ts`
- Create: `src/calibration/alignment.ts`
- Test: `tests/creatures/peel.test.ts`, `tests/calibration/alignment.test.ts`

**Interfaces:**
- Consumes: `createCreature`, `Recognition.anchor` (convert 0..1 snapshot coords → projector px via the snapshot box and `camToProj`).
- Produces: `alignmentScore(frame: Gray, whiteRef: Gray, projectedDarkCam: Mask): number` — fraction of `projectedDarkCam` pixels that the camera sees dark (`frame < 0.45 × whiteRef × gain`); main recalibrates automatically when the projected-dark area ≥ 1500 cam px and the score < 0.5 for 15 consecutive frames.

- [ ] **Step 1: Failing tests**
  - `resolve(dog) morphs then runs`: after resolve + 500 ms, `kind === 'dog'` and the darkMask head region overlaps the silhouette anchor area.
  - `alignment score high when aligned` (> 0.9); `alignment score drops when shifted` (mask shifted 25 px → < 0.5).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS (whole suite: `npm test`).
- [ ] **Step 5: Commit** `feat: morph into creatures and self-healing alignment`.
- [ ] **Step 6: User checkpoint** — user performs all four shapes ~5 times each, records clips; target ≈4/5 success per creature. Clips become `tests/fixtures/` regression material and inform prompt/threshold tuning.

### Task 10 (stretch): Creatures shy away from a hand

**Files:** Modify `src/creatures/index.ts`, `src/main.ts`. Test: `tests/creatures/shy.test.ts`.

**Interfaces:** `Creature.avoid?(box: Box /* projector px */): void` — when a new real-shadow blob comes within 1 creature-width, the creature veers away from it for 800 ms.

- [ ] **Step 1: Failing test** `veers away from nearby hand`: distance to the box after 800 ms is larger than without `avoid`.
- [ ] **Step 2–4:** run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** `feat: creatures react to hands`.
