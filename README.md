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

The server reads `ANTHROPIC_API_KEY` (or an `ant auth login` profile). Without
it, shapes still peel off and drift away; they just aren't recognized.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run server
```

## Try it without a projector

`http://localhost:5173/?sim=dog` (or `rabbit`, `butterfly`, `swan`) replaces
the webcam with a simulator: it films the page like a camera and adds a fake
arm and hand that reach in and hold still.

## Develop

```bash
npm test
npm run typecheck
```
