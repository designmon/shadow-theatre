/**
 * Which decision model recognises your drawings best and fastest?
 * Runs every saved drawing (captures/doodles/*.png, saved by the app) through each model.
 * Optional answer key: add `<file>\t<thing>` lines to captures/doodles/truth.txt.
 *
 *   OPENROUTER_API_KEY=... npm run bakeoff
 *   npm run bakeoff -- typesafe/jev-1.14 google/gemini-decision-1     (pick models)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recognizeDoodleWithJev } from '../server/jev';

const DIR = 'captures/doodles';
const MODELS = process.argv.slice(2).length ? process.argv.slice(2) : ['typesafe/jev-1.14', 'google/gemini-decision-1', 'openai/gpt-6-luna-decisions', 'liquid/d1.2-ultra', 'perplexity/pplx-decider-v1.3:free'];
const key = process.env.OPENROUTER_API_KEY;
if (!key) throw new Error('export OPENROUTER_API_KEY first');
if (!existsSync(DIR)) throw new Error(`no drawings yet: draw a few on the wall first (they are saved in ${DIR})`);

const files = readdirSync(DIR).filter((f) => f.endsWith('.png')).sort();
const truth = new Map<string, string>();
if (existsSync(join(DIR, 'truth.txt'))) for (const line of readFileSync(join(DIR, 'truth.txt'), 'utf8').split('\n')) {
  const [f, t] = line.split('\t');
  if (f && t) truth.set(f.trim(), t.trim());
}
const expected = (f: string) => truth.get(f);
console.log(`${files.length} drawings, ${MODELS.length} models${truth.size ? `, ${truth.size} with an answer key` : ' (no truth.txt: showing answers only)'}\n`);

const rows: Record<string, { right: number; judged: number; ms: number[]; errors: number }> = {};
for (const model of MODELS) rows[model] = { right: 0, judged: 0, ms: [], errors: 0 };
for (const f of files) {
  const png = readFileSync(join(DIR, f));
  const line = [f.padEnd(44)];
  for (const model of MODELS) {
    const t0 = Date.now();
    const rec = await recognizeDoodleWithJev(png, key, fetch, model);
    const ms = Date.now() - t0, r = rows[model];
    if (rec.note) r.errors++;
    else r.ms.push(ms);
    const want = expected(f);
    if (want && !rec.note) { r.judged++; if (rec.what === want) r.right++; }
    line.push(`${rec.note ? 'ERR' : rec.what}/${ms}ms`.padEnd(22));
    if (rec.note && r.errors === 1) console.log(`  ${model}: ${rec.note}`);
  }
  console.log(line.join(''));
}
const median = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);
console.log('\nmodel                              accuracy     median   errors');
for (const model of MODELS) {
  const r = rows[model];
  console.log(`${model.padEnd(35)}${(r.judged ? `${r.right}/${r.judged}` : '—').padEnd(13)}${`${median(r.ms)} ms`.padEnd(9)}${r.errors}`);
}
console.log('\nUse the winner:  export DECISION_MODEL=<model>   then npm start');
