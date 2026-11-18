import type { Health } from '../src/setup/checklist';
import type { Recognition, Side } from '../src/types';
import { UNKNOWN } from './recognize';

/**
 * Shape recognition with Jev (TypeSafe's decision model) on OpenRouter's Decisions API.
 * One request, three typed questions about the cut-out: which animal, where its head is, which way it faces.
 * Docs: https://openrouter.ai/docs/guides/community/jev.md
 */
const ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
// Any OpenRouter decision model that takes images works here; compare them with `npm run bakeoff`.
export const MODEL = process.env.DECISION_MODEL || 'typesafe/jev-1.14'; // Box questions (puppets) need jev 1.14
const MIN_PROBABILITY = 0.5;
const TIMEOUT_MS = 6000;

const KINDS = {
  dog: 'A dog head made with one or two hands: snout pointing sideways, an ear on top; the mouth may be open or closed.',
  rabbit: 'A rabbit: two long upright ears (two fingers) above a rounded head.',
  butterfly: 'A butterfly: two hands joined at the hooked thumbs, fingers spread as two pairs of wings.',
  swan: 'A swan: the forearm held up as a long neck, the hand bent at the wrist as head and beak.',
  heart: 'A heart made with two hands: curled fingers form the two round lobes on top, the thumbs meet in the point at the bottom.',
  none: 'Anything else, or not clearly one of these.',
};

export async function recognizeWithJev(png: Buffer, apiKey: string, fetchFn: typeof fetch = fetch): Promise<Recognition> {
  try {
    const res = await fetchFn(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL,
        state: [
          'A hand-shadow puppet: the black silhouette of a person\'s hand (and part of the forearm) cast on a white wall.',
          { type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } },
        ],
        questions: {
          kind: { type: 'choice', instructions: 'Which shadow-puppet animal is this hand shadow making? Judge the overall gesture; hand shadows are rough.', criteria: KINDS },
          head: { type: 'box', instructions: "the animal's head in the hand-shadow silhouette image (for a butterfly or a heart: its middle)" },
          facing: {
            type: 'choice',
            instructions: "Which way does the animal's head (snout, beak) point in the image?",
            criteria: { right: 'Towards the right edge.', left: 'Towards the left edge.', up: 'Towards the top.', down: 'Towards the bottom.' },
          },
        },
      }),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 400);
      let msg = text;
      try { msg = JSON.parse(text).error?.message ?? text; } catch { /* not JSON */ }
      console.error('[jev] HTTP', res.status, msg);
      return { ...UNKNOWN, note: `Jev error ${res.status}: ${msg}`.slice(0, 160) };
    }
    const raw = await res.json();
    console.log('[jev] answers', JSON.stringify(raw.answers));
    const answers = raw.answers as {
      kind: { type: string; choice?: string; probabilities?: Record<string, number>; confidence?: number };
      head?: { type: string; box?: { top: number; bottom: number; left: number; right: number } };
      facing?: { type: string; choice?: Side };
    };
    if (answers.kind?.type === 'refusal' || !answers.kind?.choice) return { ...UNKNOWN, note: 'Jev declined to answer' };
    const kind = answers.kind.choice;
    // probabilities are optional in the answer; fall back to the choice's confidence
    const p = answers.kind.probabilities?.[kind] ?? answers.kind.confidence ?? 0;
    const box = answers.head?.box;
    const anchor = box ? { x: clamp01((box.left + box.right) / 2), y: clamp01((box.top + box.bottom) / 2) } : { x: 0.5, y: 0.5 };
    const facing = answers.facing?.choice ?? 'right';
    if (kind === 'none' || !(kind in KINDS)) return { kind: 'unknown', confidence: p, facing, anchor, note: `Jev: none of the shapes (${p.toFixed(2)})` };
    if (p < MIN_PROBABILITY) return { kind: 'unknown', confidence: p, facing, anchor, note: `Jev guessed ${kind}, too unsure (${p.toFixed(2)})` };
    return { kind: kind as Recognition['kind'], confidence: p, facing, anchor };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[jev] failed:', msg);
    return { ...UNKNOWN, note: `Jev unreachable: ${msg}`.slice(0, 160) };
  }
}

/** Is the OpenRouter key accepted? (GET /api/v1/key, free) */
export async function jevHealth(apiKey: string, fetchFn: typeof fetch = fetch): Promise<Health> {
  const started = Date.now();
  try {
    const res = await fetchFn('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 401 || res.status === 403) return { ok: true, claude: 'bad-key', provider: 'Jev' };
    if (!res.ok) return { ok: true, claude: 'error', message: `OpenRouter HTTP ${res.status}`, provider: 'Jev' };
    return { ok: true, claude: 'ok', ms: Date.now() - started, provider: 'Jev' };
  } catch (err) {
    return { ok: true, claude: 'error', message: err instanceof Error ? err.message : String(err), provider: 'Jev' };
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.5));

/** What a fingertip drawing might be. 'something' = anything else (it still comes alive). */
/** What a fingertip drawing can be. A short hint helps the model with rough, one-line drawings. */
export const DOODLE_HINTS: Record<string, string | null> = {
  heart: 'A heart: two round bumps on top meeting in a point at the bottom.',
  star: 'A star with points (usually five).',
  circle: 'A plain circle or oval, nothing else.',
  sun: 'A circle with rays or lines around it.',
  moon: 'A crescent moon.',
  cloud: 'A bumpy, puffy cloud outline.',
  flower: 'A flower: petals around a centre, maybe a stem.',
  tree: 'A tree: a trunk with a round or pointed top.',
  cat: 'A cat: pointy ears, whiskers or a long curling tail.',
  dog: 'A dog: floppy ears, snout, legs, wagging tail.',
  rabbit: 'A rabbit or bunny: long ears.',
  bird: 'A bird, or a simple "m"-shaped flying bird.',
  butterfly: 'A butterfly: two pairs of wings either side of a body.',
  fish: 'A fish: oval body with a triangle tail.',
  snake: 'A snake: a long wavy or zigzag line, maybe with a head.',
  turtle: 'A turtle: a dome shell with little legs and a head.',
  house: 'A house: a square with a triangle roof.',
  face: 'A face or smiley: a circle with eyes and a mouth.',
  person: 'A person or stick figure.',
  car: 'A car: a body on two wheels.',
  boat: 'A boat or ship: a hull on water, maybe a sail.',
  plane: 'An aeroplane.',
  something: 'Anything else, or unclear.',
};
export const DOODLE_THINGS = Object.keys(DOODLE_HINTS);
const DOODLE_MOTIONS = {
  fly: 'It would fly: bird, butterfly, bat, bee, plane, dragon, a heart with wings.',
  swim: 'It would swim: fish, whale, shark, octopus, boat.',
  slither: 'It would slither or wriggle: snake, worm, eel, a long wavy line.',
  hop: 'It would hop or bounce: rabbit, frog, kangaroo, ball, heart, star.',
  walk: 'It would walk: dog, cat, horse, person, any animal with legs, a house on legs.',
  sway: 'It stays and sways: flower, tree, plant, grass.',
  float: 'It would float or drift: cloud, balloon, face, a shape or scribble, anything else.',
  beat: 'It beats or pulses: heart.',
  twinkle: 'It twinkles or sparkles: star, diamond, a sparkle.',
  spin: 'It turns slowly: sun, wheel, spiral, flower head.',
};
export type DoodleRecognition = { what: string; motion: keyof typeof DOODLE_MOTIONS; confidence: number; note?: string; alternatives?: { what: string; p: number }[] };

/** "What did they draw, and how would it move?" — one fast Jev request. Never throws. */
export async function recognizeDoodleWithJev(png: Buffer, apiKey: string, fetchFn: typeof fetch = fetch, model = MODEL): Promise<DoodleRecognition> {
  const fallback = (note: string): DoodleRecognition => ({ what: 'something', motion: 'float', confidence: 0, note });
  try {
    const res = await fetchFn(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model,
        state: ['A simple line drawing made with a fingertip on a wall (black lines on white). It is rough and wobbly, like a child\'s doodle: judge the overall shape and its key features (ears, wings, tail, petals, wheels, roof), not the line quality.', { type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } }],
        questions: {
          what: { type: 'choice', instructions: 'What does this drawing most look like?', criteria: DOODLE_HINTS },
          motion: { type: 'choice', instructions: 'If this drawing came alive, how would it move?', criteria: DOODLE_MOTIONS },
        },
      }),
    });
    if (!res.ok) return fallback(`${model} error ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    const { answers } = await res.json();
    const what = answers?.what?.choice ?? 'something';
    const motion = (answers?.motion?.choice in DOODLE_MOTIONS ? answers.motion.choice : 'float') as DoodleRecognition['motion'];
    const probs: Record<string, number> = answers?.what?.probabilities ?? {};
    const confidence = probs[what] ?? answers?.what?.confidence ?? 0;
    // the runner-up guesses: when it isn't sure, the drawing asks you (cat or dog?)
    const alternatives = Object.entries(probs).filter(([k]) => k !== 'something').map(([k, p]) => ({ what: k, p: Number(p) || 0 })).sort((a, b) => b.p - a.p).slice(0, 3);
    // "something" but with a fair runner-up: take the best real guess, so a rough drawing still
    // becomes something nice (rather than staying a scribble)
    if (what === 'something' && alternatives[0] && alternatives[0].p >= 0.18) return { what: alternatives[0].what, motion, confidence: alternatives[0].p, alternatives };
    return { what, motion, confidence, alternatives };
  } catch (err) {
    return fallback(`${model} unreachable: ${err instanceof Error ? err.message : err}`);
  }
}
