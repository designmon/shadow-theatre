import type { Health } from '../src/setup/checklist';
import type { Recognition, Side } from '../src/types';
import { UNKNOWN } from './recognize';

/**
 * Shape recognition with Jev (TypeSafe's decision model) on OpenRouter's Decisions API.
 * One request, three typed questions about the cut-out: which animal, where its head is, which way it faces.
 * Docs: https://openrouter.ai/docs/guides/community/jev.md
 */
const ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
const MODEL = 'typesafe/jev-1.14'; // Box questions need 1.14
const MIN_PROBABILITY = 0.5;
const TIMEOUT_MS = 6000;

const KINDS = {
  dog: 'A dog head made with one or two hands: snout pointing sideways, an ear on top; the mouth may be open or closed.',
  rabbit: 'A rabbit: two long upright ears (two fingers) above a rounded head.',
  butterfly: 'A butterfly: two hands joined at the hooked thumbs, fingers spread as two pairs of wings.',
  swan: 'A swan: the forearm held up as a long neck, the hand bent at the wrist as head and beak.',
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
          head: { type: 'box', instructions: "the animal's head in the hand-shadow silhouette image (for a butterfly: the middle of its body)" },
          facing: {
            type: 'choice',
            instructions: "Which way does the animal's head (snout, beak) point in the image?",
            criteria: { right: 'Towards the right edge.', left: 'Towards the left edge.', up: 'Towards the top.', down: 'Towards the bottom.' },
          },
        },
      }),
    });
    if (!res.ok) {
      console.error('[jev] HTTP', res.status, (await res.text()).slice(0, 300));
      return UNKNOWN;
    }
    const { answers } = (await res.json()) as {
      answers: {
        kind: { choice: string; probabilities: Record<string, number> };
        head?: { box: { top: number; bottom: number; left: number; right: number } };
        facing?: { choice: Side };
      };
    };
    const kind = answers.kind.choice;
    const p = answers.kind.probabilities?.[kind] ?? 0;
    const box = answers.head?.box;
    const anchor = box ? { x: clamp01((box.left + box.right) / 2), y: clamp01((box.top + box.bottom) / 2) } : { x: 0.5, y: 0.5 };
    const facing = answers.facing?.choice ?? 'right';
    if (kind === 'none' || !(kind in KINDS) || p < MIN_PROBABILITY) return { kind: 'unknown', confidence: p, facing, anchor };
    return { kind: kind as Recognition['kind'], confidence: p, facing, anchor };
  } catch (err) {
    console.error('[jev] failed:', err instanceof Error ? err.message : err);
    return UNKNOWN;
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
