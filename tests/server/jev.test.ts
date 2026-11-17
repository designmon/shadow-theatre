import { describe, expect, it } from 'vitest';
import { jevHealth, recognizeWithJev } from '../../server/jev';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });
const answers = (kind: string, p: number) => ({
  answers: {
    kind: { type: 'choice', choice: kind, confidence: 0.9, probabilities: { dog: 0, rabbit: 0, butterfly: 0, swan: 0, heart: 0, none: 0, [kind]: p } },
    head: { type: 'box', box: { top: 0.1, bottom: 0.3, left: 0.6, right: 0.9 }, confidence: 0.8 },
    facing: { type: 'choice', choice: 'right', confidence: 0.9, probabilities: { right: 0.9, left: 0.1, up: 0, down: 0 } },
  },
});

describe('recognizeWithJev', () => {
  it('asks Jev 1.14 about the cut-out image: which animal, where the head is, which way it faces', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(answers('dog', 0.9))); };
    await recognizeWithJev(png, 'sk-or-test', fetchFn as typeof fetch);
    expect(calls[0].url).toBe('https://openrouter.ai/api/alpha/decisions');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sk-or-test');
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.model).toBe('typesafe/jev-1.14');
    expect(body.state[1]).toEqual({ type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } });
    expect(Object.keys(body.questions.kind.criteria)).toEqual(['dog', 'rabbit', 'butterfly', 'swan', 'heart', 'none']);
    expect(body.questions.head.type).toBe('box');
    expect(body.questions.facing.type).toBe('choice');
  });

  it('maps the answers to a recognition (anchor = middle of the head box)', async () => {
    const r = await recognizeWithJev(png, 'k', reply(200, answers('rabbit', 0.82)) as typeof fetch);
    expect(r).toEqual({ kind: 'rabbit', confidence: 0.82, facing: 'right', anchor: { x: 0.75, y: 0.2 } });
  });

  it('"none" or a low probability becomes unknown', async () => {
    expect((await recognizeWithJev(png, 'k', reply(200, answers('none', 0.9)) as typeof fetch)).kind).toBe('unknown');
    expect((await recognizeWithJev(png, 'k', reply(200, answers('swan', 0.3)) as typeof fetch)).kind).toBe('unknown');
  });

  it('an HTTP error or network failure becomes unknown', async () => {
    expect((await recognizeWithJev(png, 'k', reply(401, { error: { message: 'bad key' } }) as typeof fetch)).kind).toBe('unknown');
    expect((await recognizeWithJev(png, 'k', (async () => { throw new Error('offline'); }) as typeof fetch)).kind).toBe('unknown');
  });
});

describe('jevHealth', () => {
  it('ok when OpenRouter accepts the key', async () => {
    expect(await jevHealth('k', reply(200, { data: { label: 'x' } }) as typeof fetch)).toMatchObject({ ok: true, claude: 'ok', provider: 'Jev' });
  });
  it('bad-key on 401', async () => {
    expect(await jevHealth('k', reply(401, {}) as typeof fetch)).toMatchObject({ claude: 'bad-key', provider: 'Jev' });
  });
});

describe('heart', () => {
  it('recognises the two-hand heart', async () => {
    expect((await recognizeWithJev(png, 'k', reply(200, answers('heart', 0.8)) as typeof fetch)).kind).toBe('heart');
  });
});
