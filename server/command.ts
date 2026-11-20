/**
 * Voice commands: what the user says ("the plane lands and the fish gets on board, then they fly
 * off") becomes a little script the drawings act out. A language model (via OpenRouter) writes the
 * script from the words and a list of what's on the wall; only known actions and real drawings
 * get through. Without a key, a few simple phrases still work.
 */
export type SceneItem = { id: string; label: string; x: number; y: number; zone: string; selected?: boolean };
export type Step =
  | { do: 'goto'; who: string; near?: string; place?: Place; above?: boolean; ms?: number }
  | { do: 'ride'; who: string; on: string }
  | { do: 'unride'; who: string }
  | { do: 'leave'; who: string; side: 'left' | 'right' | 'up' | 'down' }
  | { do: 'home'; who: string }
  | { do: 'say'; who: string; text: string }
  | { do: 'trick'; who: string; kind: 'jump' | 'spin' | 'shake' | 'grow' | 'rain' }
  | { do: 'wait'; ms: number }
  | { do: 'draw'; what: string; place?: Place; near?: string };
export type Place = 'sky' | 'ground' | 'water' | 'left' | 'right' | 'center' | 'top' | 'bottom';
export type Plan = { story: string; steps: Step[]; note?: string };

export const COMMAND_MODEL = process.env.COMMAND_MODEL || 'anthropic/claude-haiku-5.5';
const PLACES: Place[] = ['sky', 'ground', 'water', 'left', 'right', 'center', 'top', 'bottom'];
const TRICKS = ['jump', 'spin', 'shake', 'grow', 'rain'];
const SIDES = ['left', 'right', 'up', 'down'];

const SYSTEM = `You direct a living drawing on a wall. Line drawings made with a fingertip (a plane, a fish, a cat…) act out what the person says.
Reply with JSON only: {"story": "<one or two short, warm sentences narrating what happens, present tense>", "steps": [ ... ]}.
Steps run in order. Each step is one of:
  {"do":"goto","who":ID,"near":ID}               go next to another drawing (add "above":true to hover over it, e.g. a bird over a flower)
  {"do":"goto","who":ID,"place":PLACE}           PLACE: sky, ground, water, left, right, center, top, bottom
  {"do":"ride","who":ID,"on":ID}                  get on/into/onto something (a passenger boards a plane, a cat rides the car); it then moves with it
  {"do":"unride","who":ID}                        get off
  {"do":"leave","who":ID,"side":"left|right|up|down"}  leave the wall that way (riders go too); it comes back by itself later
  {"do":"home","who":ID}                          go back to its own place
  {"do":"say","who":ID,"text":"…"}                a very short line in a speech bubble (max 5 words)
  {"do":"trick","who":ID,"kind":"jump|spin|shake|grow|rain"}   (rain: only for clouds)
  {"do":"wait","ms":N}                            a pause (300–2000)
  {"do":"draw","what":"cat","place":PLACE}        when the person asks to draw something NEW: a dotted outline appears for THEM to trace with their finger (you never draw it yourself). "what" = one or two plain words (cat, hot air balloon). Optional "near":ID instead of place. The story waits until they have traced it.
After a draw, later steps can use "new" as the ID of what they traced. In the story text, invite them to trace it ("Trace the dotted cat…").
Use only the IDs listed (and "new" after a draw). "this", "it", "these" mean the selected drawings. Something that isn't on the wall can't take part: narrate around it kindly.
Keep it to at most 12 steps. Land a plane by sending it to the ground first. Make it charming, like a picture book.`;

/** Keep only steps that make sense for this wall. */
export function validPlan(raw: unknown, items: SceneItem[]): Plan | null {
  const ids = new Set(items.map((i) => i.id));
  const hasDraw = Array.isArray((raw as { steps?: unknown })?.steps) && ((raw as { steps: { do?: string }[] }).steps).some((s) => s?.do === 'draw');
  if (hasDraw) ids.add('new');
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { story?: unknown; steps?: unknown };
  const steps: Step[] = [];
  for (const s of Array.isArray(r.steps) ? r.steps : []) {
    if (!s || typeof s !== 'object') continue;
    const x = s as Record<string, unknown>;
    const who = typeof x.who === 'string' && ids.has(x.who) ? x.who : null;
    switch (x.do) {
      case 'goto':
        if (who && ((typeof x.near === 'string' && ids.has(x.near) && x.near !== who) || PLACES.includes(x.place as Place))) steps.push({ do: 'goto', who, ...(typeof x.near === 'string' && ids.has(x.near) ? { near: x.near } : { place: x.place as Place }), above: !!x.above, ms: Math.max(600, Math.min(4000, Number(x.ms) || 1600)) });
        break;
      case 'ride': if (who && typeof x.on === 'string' && ids.has(x.on) && x.on !== who) steps.push({ do: 'ride', who, on: x.on }); break;
      case 'unride': if (who) steps.push({ do: 'unride', who }); break;
      case 'leave': if (who) steps.push({ do: 'leave', who, side: (SIDES.includes(x.side as string) ? x.side : 'right') as 'right' }); break;
      case 'home': if (who) steps.push({ do: 'home', who }); break;
      case 'say': if (who && typeof x.text === 'string' && x.text.trim()) steps.push({ do: 'say', who, text: x.text.trim().slice(0, 40) }); break;
      case 'trick': if (who && TRICKS.includes(x.kind as string)) steps.push({ do: 'trick', who, kind: x.kind as 'jump' }); break;
      case 'wait': steps.push({ do: 'wait', ms: Math.max(200, Math.min(3000, Number(x.ms) || 600)) }); break;
      case 'draw':
        if (typeof x.what === 'string' && x.what.trim()) steps.push({ do: 'draw', what: x.what.trim().toLowerCase().replace(/[^a-z ]/g, '').slice(0, 30), ...(typeof x.near === 'string' && ids.has(x.near) && x.near !== 'new' ? { near: x.near } : PLACES.includes(x.place as Place) ? { place: x.place as Place } : {}) });
        break;
    }
  }
  const story = typeof r.story === 'string' ? r.story.trim().slice(0, 240) : '';
  return steps.length || story ? { story, steps: steps.slice(0, 16) } : null;
}

/** Without a model: a few plain phrases ("the dog jumps", "the bird flies to the flower"). */
export function simplePlan(text: string, items: SceneItem[]): Plan {
  const t = text.toLowerCase();
  const draw = /\bdraw\s+(?:me\s+)?(?:a|an|some|the)?\s*([a-z]+)/.exec(t) ?? /\b(?:make|add)\s+(?:me\s+)?(?:a|an|some)\s+([a-z]+)/.exec(t);
  if (draw) return { story: `Trace the dotted ${draw[1]} to draw it.`, steps: [{ do: 'draw', what: draw[1] }], note: 'simple (no language model)' };
  const named = items.filter((i) => t.includes(i.label)).sort((a, b) => t.indexOf(a.label) - t.indexOf(b.label)); // the first one mentioned is the subject
  const actors = named.length ? named : items.filter((i) => i.selected);
  const steps: Step[] = [];
  for (const a of actors) {
    const other = named.find((o) => o.id !== a.id && t.indexOf(o.label) > t.indexOf(a.label));
    if (/(jump|hop)/.test(t)) steps.push({ do: 'trick', who: a.id, kind: 'jump' });
    else if (/(spin|dance|twirl)/.test(t)) steps.push({ do: 'trick', who: a.id, kind: 'spin' });
    else if (/(grow|big)/.test(t)) steps.push({ do: 'trick', who: a.id, kind: 'grow' });
    else if (/(sleep|nap)/.test(t)) steps.push({ do: 'say', who: a.id, text: 'zzz' });
    else if (/(leave|fly away|fly off|go away)/.test(t)) steps.push({ do: 'leave', who: a.id, side: 'right' });
    else if (other && /( to | visit| over)/.test(t)) { steps.push({ do: 'goto', who: a.id, near: other.id, above: /(fly|over)/.test(t) }); break; }
    else if (/(come back|home)/.test(t)) steps.push({ do: 'home', who: a.id });
    else steps.push({ do: 'trick', who: a.id, kind: 'jump' });
    if (other) break;
  }
  return { story: steps.length ? text.trim().replace(/^./, (c) => c.toUpperCase()) : '', steps, note: 'simple (no language model)' };
}

/** Ask the model for a script. Never throws: falls back to the simple phrases. */
export async function planCommand(text: string, items: SceneItem[], apiKey: string | undefined, fetchFn: typeof fetch = fetch, model = COMMAND_MODEL): Promise<Plan> {
  if (!apiKey) return simplePlan(text, items);
  const wall = items.map((i) => `${i.id}: a ${i.label} in the ${i.zone}${i.selected ? ' (selected)' : ''}`).join('\n') || '(nothing on the wall yet)';
  try {
    const res = await fetchFn('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        model,
        max_tokens: 900,
        temperature: 0.7,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `On the wall:\n${wall}\n\nThe person says: "${text}"` },
        ],
      }),
    });
    if (!res.ok) return { ...simplePlan(text, items), note: `${model} error ${res.status}` };
    const body = await res.json();
    const content: string = body?.choices?.[0]?.message?.content ?? '';
    const json = content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1);
    const plan = validPlan(JSON.parse(json), items);
    return plan ?? { ...simplePlan(text, items), note: 'the model gave nothing usable' };
  } catch (err) {
    return { ...simplePlan(text, items), note: `${model} unreachable: ${err instanceof Error ? err.message : err}` };
  }
}

/**
 * Something the app has no drawing for ("a giraffe"): the model sketches it as a few simple lines,
 * like a quick doodle, in a 100 x 100 box. Null when there's no key or it can't.
 */
export async function sketch(what: string, apiKey: string | undefined, fetchFn: typeof fetch = fetch, model = COMMAND_MODEL): Promise<number[][][] | null> {
  if (!apiKey) return null;
  try {
    const res = await fetchFn('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        model,
        max_tokens: 2500,
        temperature: 0.4,
        messages: [
          { role: 'system', content: 'You draw simple, charming single-line doodles, like a minimalist picture book: clear outline, a few key features (eyes, ears, wheels…), side view facing right. Reply with JSON only: {"strokes": [[[x,y],[x,y],...], ...]} in a 100 x 100 box (y down), 2 to 10 strokes, 6 to 40 points each, smooth curves made of many points.' },
          { role: 'user', content: `Draw: ${what}` },
        ],
      }),
    });
    if (!res.ok) return null;
    const content: string = (await res.json())?.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
    const strokes = (Array.isArray(parsed?.strokes) ? parsed.strokes : [])
      .map((st: unknown) => (Array.isArray(st) ? st : []).filter((p: unknown) => Array.isArray(p) && p.length >= 2 && Number.isFinite(+p[0]) && Number.isFinite(+p[1])).map((p: number[]) => [Math.max(0, Math.min(100, +p[0])), Math.max(0, Math.min(100, +p[1]))]))
      .filter((st: number[][]) => st.length >= 2)
      .slice(0, 12);
    return strokes.length ? strokes : null;
  } catch {
    return null;
  }
}

