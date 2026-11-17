# Fingertip pen — design

*2026-11-17*

## Intent

Make drawing with your fingertip feel magical: your own line, refined as you draw, brought
to life. The user tried the first version on the wall: fingertip detection failed with the
whole hand in the light, the line was shaky and flat, drawings roamed the wall restlessly,
and nothing felt delightful. Shadow-puppet recognition is switched off to focus on this.

## Goals

1. **Fingertip tracking with the whole hand in the light** (thumb and knuckles visible):
   the pen point is the index fingertip, the part of the shadow furthest along from the arm.
2. **Your line, refined in real time:** jitter smoothed as you draw (One Euro filter), drawn
   as smooth curves, so a wobbly finger produces a confident line.
3. **Delight:** a glowing tip, golden sparkles trailing and drifting, ink blooming in behind.
4. **A visible finish:** the line settles from raw to refined, with a sparkle burst.
5. **Life that fits, calmly:** recognition (Jev: what it is + how it moves), then gentle
   life near where it was drawn. Wings flap with a small loop flight, a fish swims a small
   figure-eight, a heart beats, a star twinkles, a flower sways, anything else floats or bobs.

## Non-goals / anti-goals

- No AI redrawing: it stays the user's line, refined. (User's choice.)
- No roaming across the wall, and nothing leaves on its own.
- Shadow-puppet capture is off (code kept, disabled by a flag).

## How it works (builder's calls)

- **Start the pen:** hold the fingertip still for ~0.8 s → sparkle burst, pen on.
  **Draw:** move. **Finish:** hold still ~1.2 s, or pull the hand away.
- **Tip position:** furthest point along the shadow from where it enters the wall, refined
  by averaging the furthest few pixels; nudged a little past the tip so the cue lands on
  the wall, not on the finger.
- **Smoothing:** One Euro filter on the tip (min cutoff ~1.2 Hz, beta ~0.02 in projector
  px); the stroke is rendered with centripetal Catmull-Rom curves. On finish:
  simplify (Ramer-Douglas-Peucker) + resample + light Chaikin smoothing → refined line.
  If the end is near the start, it closes and becomes a solid ink shape.
- **Sparkles:** a small particle system in warm gold (the only colour on the wall besides
  the red cue), spawned at the tip while drawing and in bursts at start and finish.
  Excluded from shadow detection, like the line.
- **Motions:** fly, swim, slither, hop, walk, sway, float, plus **beat** (heart),
  **twinkle** (star), **spin** (sun). Each animates in place or in a small loop around
  where it was drawn.

## Left to the builder

Exact timings, particle counts, filter tuning, the motion curves.
