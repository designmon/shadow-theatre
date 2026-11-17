import { describe, expect, it } from 'vitest';
import { handleHealth } from '../../server/health';

describe('server health', () => {
  it('reports Claude reachable with timing', async () => {
    const r = await handleHealth({ models: { retrieve: async () => ({ id: 'claude-opus-5-5' }) } });
    expect(r.ok).toBe(true);
    expect(r.claude).toBe('ok');
    expect(typeof r.ms).toBe('number');
  });

  it('explains a missing or bad key', async () => {
    const err = Object.assign(new Error('401'), { status: 401 });
    const r = await handleHealth({ models: { retrieve: async () => { throw err; } } });
    expect(r).toMatchObject({ ok: true, claude: 'bad-key' });
  });

  it('reports other failures without throwing', async () => {
    const r = await handleHealth({ models: { retrieve: async () => { throw new Error('ECONNRESET'); } } });
    expect(r).toMatchObject({ ok: true, claude: 'error' });
    expect(r.message).toContain('ECONNRESET');
  });

  it('reports no key when the client could not be created', async () => {
    expect(await handleHealth(null)).toMatchObject({ ok: true, claude: 'no-key' });
  });
});
