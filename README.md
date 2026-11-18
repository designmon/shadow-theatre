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
| **Point one finger** and rest it a moment | a thin ring closes: the pen is on, at your fingertip |
| **Move while pointing** | you draw one continuous line, as slowly and as small as you like (there is no timer). If your fingertip's shadow disappears into your hand's own shadow, the pen carries on with your hand's movement and picks the fingertip up again when it shows |
| **Close your hand** (a fist, hand at rest) | the drawing is finished, in about a third of a second. (Pulling your hand out of the light also finishes) |

When you finish, a clean drawing of what it is draws itself over your line and it moves the
way that thing moves: a heart beats, a cat or dog walks, a bird flies, a fish swims. Then it goes
to the **composition** on the right side of the wall, a little landscape that builds up as you
draw:
- **Sky:** birds, butterflies, planes, clouds, stars, and the sun or moon in the corner.
- **Ground:** animals, flowers, trees, houses, people and cars, standing on a ground line and
  sized sensibly (a tree is taller than a cat).
- **Water:** boats on the waves, fish just below.

The scene adds its own quiet details: grass by the plants, waves, and two far-off birds following
a bird. Point at a drawing in the composition for half a second to wake it.

**Stories.** At rest the drawings stay still. Now and then (about every half minute) they play a little scene together, with a short caption under
it: the bird visits the flower, the dog wants to play and the cat isn't impressed, a cloud rains
on the flower and it grows, the sun wakes everyone up.

**Select a drawing** with a click (a quick fist over it, then open your hand). A dashed ring
shows it's selected; in what you say next, "this" or "it" means the selected drawing.

**Voice commands.** **Wave** your open hand and a sketched sound wave appears in the top-right
corner: it's listening, and shows what it hears. Say what should happen, e.g. *"the plane lands,
the fish gets on, and they fly off"*. Then show a **stop sign** (open palm, held still; drop your
hand once after waving first) or click **send**. The drawings act it out and the story panel
(bottom left) tells it. There's no spoken reply. **M** on the keyboard starts and sends too.

**Ask the AI to draw:** *"draw a cat"*, *"draw a hot air balloon over the house"*. An AI pen
comes in from the side and draws it stroke by stroke, and then it comes alive like your own
drawings. Things the app knows (cat, dog, boat, flower…) are drawn from its clean drawings;
anything else is sketched by the model.
It uses Chrome's speech recognition (allow the microphone once) and, with `OPENROUTER_API_KEY`,
`anthropic/claude-haiku-5.5` on OpenRouter to turn your words into actions (`COMMAND_MODEL` picks
another). Without the key only simple phrases work ("the dog jumps").

**How the pen finds your fingertip:** it finds your palm (the widest part of the hand's shadow)
and your fingers (what sticks out of it), and draws with the tip of the longest finger. It stays
on that finger while you draw, so a thumb or knuckle can't steal the pen, whichever way your arm
comes in. A guard checks the tip against your palm: if the finger's faint tip reads shorter for
a moment the pen holds its place (no sliding back along the finger), and a sudden hop to another
part of the hand isn't believed until it holds steady.

The ink is a vivid blue, not black: to the camera black ink looks exactly like a shadow, while
blue ink still sends the projector's full blue light and reads as lit wall. The accent (blue →
violet → magenta) appears only where something is happening: the pen, the freshest line, bursts,
the wake ring.
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

## Runway: let Runway animate the drawings

**Phase 1 (by hand, with Runway Pro in the web app).**

1. Draw. Each recognised drawing is also saved for Runway:
   - `captures/runway-in/<id>.png` (1280×720, the drawing alone, centred, bold black on white)
   - `<id>.txt` (the prompt to paste)
   - `<id>.json` (used to put the clip back in place)

   The id looks like `20261118-143205-butterfly`.
2. Press **E** to save the whole wall: `captures/runway-in/scene-<time>.png` (every drawing where
   it is now, at projector resolution), with its prompt in `scene-<time>.txt`.
3. In the Runway web app, use image to video: upload the `.png`, paste the `.txt`, use 16:9, and
   generate.
4. Download the clip into `captures/runway-out/`, named after the image (`<id>.mp4`,
   `scene-<time>.mp4`). A name that contains the id also works.
5. The page notices it within a second ("Runway clip ready — point at the butterfly").
   - **Point at that drawing** in the bottom row. It rises, plays the Runway clip in its place,
     and fades back to the still drawing.
   - **A scene clip** plays across the whole wall as soon as it arrives. **V** plays it again.

Clips are recoloured to the blue ink before they reach the wall, so the camera never mistakes
them for shadows. White becomes see-through, so other drawings show through.

Clips match drawings made since the page was opened. A reload starts a fresh wall.

**Phase 2 (automatic, with Runway API credits).** Create an API key in the Runway Developer
Portal and add it to the server's environment, in the same place as your other keys (never in
the browser):

```bash
echo 'export RUNWAYML_API_SECRET="PASTE_KEY_HERE"' >> ~/.zshrc
```

Then every recognised drawing is sent to Runway on its own:
- While Runway works (tens of seconds), the drawing keeps its own animation and a faint shimmer
  runs along its line.
- When the clip arrives, the drawing comes back up by itself and the clip fades in slowly.
- **E** sends the whole wall too.
- If a generation fails, the drawing keeps its own animation, and the reason is logged in the
  terminal.

Options (all optional, in the server's environment):
- `RUNWAY_MODEL`: default `gen4_turbo`. Others in the SDK include `gen4.5`, `veo3.1` and
  `veo3.1_fast`.
- `RUNWAY_DURATION`: in seconds. The default is 5, or 4 for Veo.
- `RUNWAY_DAILY_CAP`: default 20 generations a day, counted across restarts.

Each generation uses API credits.

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
