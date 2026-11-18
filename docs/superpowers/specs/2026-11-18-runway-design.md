# Runway animates the drawings: design

*2026-11-18*

## Intent

Drawings made with a fingertip on a real wall come alive as Runway video clips, projected back
in place. It's like Runway Labs' *Live Frame*, but physical. The near-term goal is a social clip
today; later, a demo for a Runway Labs application.

The user has Runway **Pro**. Those credits work only in the Runway **web app**, not the API. So:

- **Phase 1 (now):** a manual round-trip. The app exports images and prompts. The user
  generates in the web app and drops the clips into a folder. The app plays them on the wall.
- **Phase 2 (later, separate API credits):** the same round-trip done automatically by the server.

## Phase 1: manual round-trip

### 1. Export for Runway

**Per drawing.** When a drawing has been recognised (its label and motion are known, and its
clean version is in place), the app writes:

- `captures/runway-in/<id>.png`: 1280×720, plain white, the drawing alone and centred. It is
  black ink about 1.6× the wall's line weight, so it survives generation. The shape is what
  rests on the wall: the clean drawing if one exists, else the refined line.
- `captures/runway-in/<id>.txt`: the prompt. For example:
  > The hand-drawn butterfly comes alive and flutters its wings. Keep the exact same single-line
  > drawing style and line thickness, plain white background, no shading, no colour, no new
  > objects, static camera.
- `captures/runway-in/<id>.json`: what the app needs to put the clip back. That's the label, the
  motion, and how drawing coordinates map to image pixels.

`<id>` = `<yyyymmdd-hhmmss>-<label>`, e.g. `20261118-143205-butterfly`.

The action phrase comes from the label first, then the motion. Examples: butterfly → "flutters
its wings", dog → "trots happily, wagging its tail", flower → "sways gently in the breeze",
heart → "beats like a heart". Unrecognised drawings → "The hand-drawn doodle comes alive and
gently floats".

**Scene (key E).** The app writes `captures/runway-in/scene-<yyyymmdd-hhmmss>.png` at projector
resolution (the stage canvas's pixel size). It shows every drawing on the wall exactly where it
is now, as black ink on white, plus `.txt` and `.json` files. Scene prompt:

> These hand-drawn line drawings come alive together: [clauses]. Same line style, plain white
> background, nothing new added, static camera.

Clauses come from each drawing's action. One interaction is written in: a flyer (butterfly,
bird) and a flower or tree become "the butterfly flutters over and lands on the flower".
Repeated labels are numbered in the prompt ("the first cat", "the second cat").

A short on-wall note confirms the export ("saved for Runway: scene-…").

### 2. Bring clips back

- The user drops downloaded clips into `captures/runway-out/`, with names containing the id
  (`<id>.mp4` or `scene-….mp4`; `.webm` and `.mov` also work). Matching is by the id appearing
  in the file name, so "`<id> (1).mp4`" works too.
- The server checks the folder every second. It announces a file once its size has stopped
  changing (a copy in progress isn't announced). The page hears about it over Server-Sent
  Events (`/api/runway/events`), with the current list sent on connect. Clips are served from
  `/api/runway/out/<file>` with range requests, the same origin as the page, so the canvas
  stays readable and recordable.
- **A drawing's clip** plays the next time that drawing wakes (pointing at it while it rests).
  The drawing rises to its stage place and size. The clip then plays there, aligned so the
  drawing in the video sits exactly on the drawing on the wall. At the end it crossfades back to
  the still drawing, which holds for a moment and walks back to its place.
- **A scene clip** plays once across the whole wall when it arrives (and again with key V). The
  drawings fade out under it, and it crossfades back to them at the end.
- Clips belong to drawings from the current session. Drawings aren't kept across a page reload,
  so a clip for a drawing that no longer exists is simply ignored.

### 3. Shadow-safe projection

Black lines on the wall read as shadows (the reason the ink is blue). Every clip is recoloured
on the GPU before it reaches the wall:

1. Draw the frame to an offscreen canvas in greyscale with extra contrast, so an off-white
   background becomes white.
2. `screen` a fill of the ink blue over it: white stays white, black becomes ink blue, greys
   become a mix.
3. Draw that onto the stage with `multiply`: white leaves the wall (and any drawing under the
   clip) untouched, which works as transparent, and lines appear in ink blue.

Every recoloured pixel keeps full blue light, so the per-channel shadow detector reads it as lit
wall. The prediction of what's projected comes from the stage itself, so it already includes the
clip.

Check: the debug view (D) shows no red on a playing clip. An automated simulator check counts
shadow pixels while a clip plays with no hand in the light (it must be 0, including with
`?shift=5`).

R (record) captures the stage canvas, which now includes the clips.

### Done when

Draw a butterfly and a flower, press E, generate in Runway, drop the clips in, and point at the
drawings. The Runway versions play on the wall in blue with no false shadows, and R still
records.

## Phase 2: automatic via the Runway API (built 2026-11-18)

- `server/runway.ts` gains `generate(id)`. After the phase-1 export it uploads `<id>.png` and
  `<id>.txt` to Runway image-to-video, polls the task, and downloads the result into
  `captures/runway-out/<id>.mp4`. Phase 1's watcher and playback do the rest. Nothing on the
  page changes except the reveal below.
- The key lives in `RUNWAYML_API_SECRET` on the server only, never sent to the browser. With no
  key, phase 1 works as now. `RUNWAY_MODEL` picks the model (check the current model IDs in
  Runway's API docs when building, and use the Runway Dev plugin for Claude Code for the
  integration). Ratio 1280:720 to match the export.
- The drawing keeps its built-in animation straight away. When the Runway clip arrives (expect
  tens of seconds), it plays as a **slow reveal** the next time the drawing performs. There's no
  spinner. A faint shimmer along the line while waiting is the most it shows.
- Failures are logged on the server and never shown as errors on the wall. The drawing simply
  keeps its built-in animation.
- Cost guard: one generation per drawing, scenes only on E, and a daily cap in an env var.

### As built

- `server/runwayApi.ts` uses the official `@runwayml/sdk` (4.28): `imageToVideo.create(...)`
  followed by `.waitForTaskOutput()`, with a 10-minute timeout. Its errors (`TaskFailedError`,
  `TaskTimedOutError`) are logged and announced. Nothing is resubmitted automatically.
- The request is `{ model, promptImage: data URI, promptText (≤1000 chars), ratio: '1280:720',
  duration }`. Veo models take 4/6/8 s; the rest take 5. These are checked against the SDK's types
  because the docs site wasn't reachable from the build machine.
- The signed output URL expires, so the clip is downloaded to `.<id>.mp4.part` and renamed into
  `captures/runway-out/` when complete. The phase-1 watcher announces it.
- The page hears `{pending}` and `{failed}` on the same event stream. A drawing shimmers while
  pending. When its clip lands, `revealClip` plays it from wherever the drawing is: resting (it
  rises first), on stage (straight away), or walking to its place (once it gets there). It fades
  in over 2.2 s.
- The daily cap is kept in `captures/runway-in/.runway-generations.json`.
- Verified with mocked SDK tests, plus a simulator run where the real SDK talks to a local fake
  API through `RUNWAYML_BASE_URL`. No live generations were made.
