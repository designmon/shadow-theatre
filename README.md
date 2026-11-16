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
npm run dev        # the page, http://localhost:5173
npm run server     # recognition (needs an Anthropic API key, see below)
```

Open http://localhost:5173 in **Chrome**, allow the camera, press **F** for
fullscreen on the projector.

| Key | What it does |
|-----|--------------|
| F | fullscreen |
| C | re-calibrate (wall flashes a pattern for ~2 s) |
| D | debug view on/off (camera picture-in-picture, shadow in red) |
| R | start/stop recording a clip (downloads a `.webm` to send back) |

### Recognition key

The server reads `ANTHROPIC_API_KEY` (or an `ant auth login` profile). Without
it, shapes still peel off and drift away; they just aren't recognized.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run server
```

## Develop

```bash
npm test
npm run typecheck
```
