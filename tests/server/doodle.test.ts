import { describe, expect, it } from 'vitest';
import { DOODLE_THINGS, recognizeDoodleWithJev } from '../../server/jev';

const png = Buffer.from([1, 2, 3]);
describe('recognizeDoodleWithJev', () => {
  it('asks what the drawing is and how it would move', async () => {
    let body: any;
    const fetchFn = async (_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ answers: {
        what: { type: 'choice', choice: 'fish', probabilities: { fish: 0.8 } },
        motion: { type: 'choice', choice: 'swim', probabilities: { swim: 0.9 } },
      } }));
    };
    const r = await recognizeDoodleWithJev(png, 'k', fetchFn as typeof fetch);
    expect(r).toMatchObject({ what: 'fish', motion: 'swim' });
    expect(Object.keys(body.questions.what.criteria)).toEqual(DOODLE_THINGS);
    expect(Object.keys(body.questions.motion.criteria)).toContain('fly');
  });

  it('anything unclear still gets a way to move (float)', async () => {
    const r = await recognizeDoodleWithJev(png, 'k', (async () => new Response('bad', { status: 400 })) as typeof fetch);
    expect(r).toMatchObject({ what: 'something', motion: 'float' });
  });
});
