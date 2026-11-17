# Living Shadow Theater

Make a hand shadow on a projected wall. The system recognizes it (dog, rabbit,
butterfly, swan) and a shadow-creature peels off your shadow and runs away
across the wall.

## Setup in the room

1. **Dark room.** The XGIMI Halo is the only light. Point it at a white wall
   and let it finish auto-focus/auto-keystone (they can stay on).
2. **Laptop:** plug the MacBook into the projector over HDMI. In macOS
   *Displays*, turn on **mirroring** (simplest) or drag the browser window
   onto the projector display.
3. **Camera:** turn the laptop so its lid (webcam) faces the wall. Put it
   **off to the side of / below the projector**, not right at the lens, so
   the camera can see your shadow beside your hand. The whole projected
   picture must be in view (check with the debug view).
4. Stand in the beam, coming in from one side of the wall.

## Run

```bash
npm install
export OPENROUTER_API_KEY=<your OpenRouter key>   # Jev recognition (or ANTHROPIC_API_KEY for Claude)
npm start          # page (http://localhost:5173) + recognition server together
```

(`npm run dev` and `npm run server` still start them separately.)

Open http://localhost:5173 in **Chrome**, allow the camera, press **F** for
fullscreen on the projector.

| Key | What it does |
|-----|--------------|
| F | fullscreen |
| C | re-calibrate (wall flashes a pattern for ~2 s) |
| D | debug view on/off (camera picture-in-picture, shadow in red) |
| R | start/stop recording a clip (downloads a `.webm` to send back) |

### First time in the room

1. Start both `npm run dev` and `npm run server`, open the page, press **F**.
   It re-calibrates by itself after going fullscreen (the wall flashes
   black → four squares → white). **Stay out of the beam while it does.**
2. The **setup panel** on the wall shows four checks and a big camera view:
   - **Camera**: pick which camera to use (an iPhone via Continuity Camera
     works great: prop it next to the projector, pointing at the wall).
     The choice is remembered.
   - **Sees the wall**: ✓ once the camera found the projector's 4 squares.
     ✕ means it can't see the projected picture: aim the camera at it, press **C**.
   - **Recognition**: ✓ when `npm run server` is running and Claude accepts your key.
   - **Your shadow**: ✓ once it sees your hand in the light (shown red in the camera view).

   If calibration fails, the card says how many of the 4 squares it saw and
   shows the camera picture from that moment, with what lit up in red.
   Usual fixes: make the room dark, step out of the beam, get the whole
   projected picture into the camera view, then press **C**.

   When all four are green the panel fades out. **S** brings it back,
   **D** shows a small debug view instead.
3. Stand at one side, reach in, make a shape and hold it still for about a second.
4. Watch the server terminal: it prints each answer and how long it took,
   e.g. `dog (0.92) in 2140 ms`. If it's often over ~4 s, tell Claude — a
   faster model may be worth it.
5. Press **R** to record a few clips (one per creature) and send them back.

If the projector gets bumped, it re-aligns by itself after a second; if that
fails it asks you to step out of the beam and press **C**.

### Recognition key

With `OPENROUTER_API_KEY` set, the server uses a decision model on OpenRouter (Jev by default:
fast, cheap). Otherwise it falls back to Claude via `ANTHROPIC_API_KEY`. Without either,
drawings still come alive; they just float, unrecognised. Keys stay in your terminal and the
local server. They are never sent to the browser.

```bash
export OPENROUTER_API_KEY=sk-or-...
npm start
```

## Draw with your fingertip

Your hand is the pen, with three gestures:

| Gesture | What happens |
| --- | --- |
| **Point one finger** and rest it a moment | a thin ring closes, a soft burst: the pen is on, at your fingertip |
| **Move while pointing** | you draw. The newest bit of line glows blue → violet → pink, then settles into black ink. Your own line, smoothed as you go |
| **Open your hand** | lifts the pen: move somewhere else, point again for the next stroke (eyes, whiskers…) |
| **Close your hand into a fist** | done. (Pulling your hand out of the light also finishes) |

When you finish, your line is refined (a rough heart, star or circle eases toward a clean one),
recognised, and briefly labelled. Then it moves the way that thing moves: a heart beats, a cat
or dog walks (each in its own way), a bird flies, a fish swims, a star twinkles, the sun turns,
a flower sways. After a few seconds it **walks to its place in a row along the bottom of the
wall**, filling from the bottom-right corner. **Point at a resting drawing** and hold for half a
second (a ring fills around it) and it wakes up and performs again. Nine drawings fit in the
row; after that the oldest makes room.

Colours were chosen to read on a projected wall: black ink, plus a blue / violet / pink accent
only where something is happening (the pen, the freshest line, bursts, the wake ring).
Shadow-puppet animals are switched off for now (`PUPPETS` in `src/main.ts`).

### Which model recognises the drawings

Any OpenRouter *decision* model that accepts images works; the default is Jev
(`typesafe/jev-1.14`). To try another, set `DECISION_MODEL` before `npm start`:

```bash
export DECISION_MODEL=google/gemini-decision-1
```

Every drawing you make is saved to `captures/doodles/` with what the model said. To compare
models on *your* drawings (answer and speed):

```bash
npm run bakeoff
```

That runs Jev 1.14, Gemini Decision 1, GPT-6 Luna Decisions, Liquid d1.2-ultra and Perplexity
Decider (free) over every saved drawing. For an accuracy score, add lines like
`2026-11-17T20-01-02-123Z-heart.png<TAB>heart` to `captures/doodles/truth.txt`. To pick
models: `npm run bakeoff -- typesafe/jev-1.14 google/gemini-decision-1`.

## Try it without a projector

`http://localhost:5173/?sim=dog` (or `rabbit`, `butterfly`, `swan`, `point` for drawing; add `&wake`
to also point at the resting drawings; `&warm`, `&ambient=0.6` and `&noise=6` imitate lamps, a lit room and a phone camera) replaces
the webcam with a simulator: it films the page like a camera and adds a fake
arm and hand that reach in and hold still.

## Develop

```bash
npm test
npm run typecheck
```
