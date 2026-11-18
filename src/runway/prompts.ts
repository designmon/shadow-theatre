/** Runway prompts, built from what a drawing was recognised as and how it moves. */

const STYLE = 'Keep the exact same single-line drawing style and line thickness, plain white background, no shading, no colour, no new objects, static camera.';
const SCENE_STYLE = 'Same line style, plain white background, nothing new added, static camera.';

/** What it does, by what it is (first) or how it moves. */
const BY_LABEL: Record<string, string> = {
  butterfly: 'flutters its wings',
  bird: 'flaps its wings and flies',
  fish: 'swims, its tail swishing',
  dog: 'trots happily, wagging its tail',
  cat: 'walks with a slow, graceful stride, flicking its tail',
  rabbit: 'hops',
  turtle: 'walks slowly, its head bobbing',
  snake: 'slithers in a wavy line',
  flower: 'sways gently in the breeze',
  tree: 'sways in the wind',
  heart: 'beats like a heart',
  star: 'twinkles, its points pulsing',
  sun: 'slowly turns, its rays shimmering',
  moon: 'gently rocks',
  cloud: 'drifts slowly',
  boat: 'bobs on the waves',
  car: 'drives forward, its wheels turning',
  plane: 'flies forward',
  house: 'gently breathes, its door swinging open and shut',
  face: 'smiles and blinks',
  person: 'waves and dances',
  circle: 'rolls and bounces',
};
const BY_MOTION: Record<string, string> = {
  fly: 'flies in a small loop', swim: 'swims', slither: 'slithers', hop: 'hops', walk: 'walks a few steps',
  sway: 'sways gently', float: 'gently floats', beat: 'pulses like a heartbeat', twinkle: 'twinkles', spin: 'slowly turns',
};
const FLYERS = new Set(['butterfly', 'bird']);
const PERCHES = ['flower', 'tree'];

const named = (label: string) => (label && label !== 'something' ? label : 'doodle');
export function actionFor(label: string, motion: string): string {
  return BY_LABEL[label] ?? BY_MOTION[motion] ?? 'gently floats';
}

export function drawingPrompt(label: string, motion: string): string {
  return `The hand-drawn ${named(label)} comes alive and ${actionFor(label, motion)}. ${STYLE}`;
}

/** The whole wall: each drawing's action, with a flyer landing on a flower or tree if there is one. */
export function scenePrompt(items: { label: string; motion: string }[]): string {
  if (!items.length) return `This blank wall stays still. ${SCENE_STYLE}`;
  // "the cat", or "the first cat" / "the second cat" when there are several
  const counts = new Map<string, number>(), seen = new Map<string, number>();
  for (const it of items) counts.set(named(it.label), (counts.get(named(it.label)) ?? 0) + 1);
  const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
  const names = items.map((it) => {
    const n = named(it.label), k = (seen.get(n) ?? 0) + 1;
    seen.set(n, k);
    return (counts.get(n) ?? 0) > 1 ? `the ${ORD[k - 1] ?? `#${k}`} ${n}` : `the ${n}`;
  });
  const clauses: string[] = [];
  const used = new Set<number>();
  const perch = items.findIndex((it) => PERCHES.includes(it.label));
  const flyer = items.findIndex((it) => FLYERS.has(it.label));
  if (perch >= 0 && flyer >= 0) {
    const verb = items[flyer].label === 'butterfly' ? 'flutters' : 'flies';
    clauses.push(`${names[flyer]} ${verb} over and lands on ${names[perch]}`);
    clauses.push(`${names[perch]} ${actionFor(items[perch].label, items[perch].motion)}`);
    used.add(flyer); used.add(perch);
  }
  items.forEach((it, i) => { if (!used.has(i)) clauses.push(`${names[i]} ${actionFor(it.label, it.motion)}`); });
  return `These hand-drawn line drawings come alive together: ${clauses.join('; ')}. ${SCENE_STYLE}`;
}
