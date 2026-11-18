import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskFailedError } from '@runwayml/sdk';
import { RunwayGenerator, requestFor, type RunwayClient } from '../../server/runwayApi';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'rwapi-')); dirs.push(root);
  const inDir = join(root, 'in'), outDir = join(root, 'out');
  mkdirSync(inDir);
  writeFileSync(join(inDir, 'd-1.png'), Buffer.from([137, 80, 78, 71]));
  writeFileSync(join(inDir, 'd-1.txt'), 'The hand-drawn butterfly comes alive and flutters its wings.\n');
  return { inDir, outDir };
}
const okClient = () => {
  const create = vi.fn((_body: Record<string, unknown>) => ({ waitForTaskOutput: async () => ({ id: 'task-1', output: ['https://signed.example/clip.mp4'] }) }));
  return { client: { imageToVideo: { create } } as unknown as RunwayClient, create };
};
const fetchClip = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));

describe('Runway API (phase 2)', () => {
  it('sends the image as a data URI with its prompt at 16:9, and keeps its own copy of the clip', async () => {
    const { inDir, outDir } = setup(), { client, create } = okClient();
    const g = new RunwayGenerator(client, { inDir, outDir, fetchFn: fetchClip as unknown as typeof fetch });
    const status: unknown[] = [];
    g.onStatus((s) => status.push(s));
    expect(await g.generate('d-1')).toBe('d-1.mp4');
    const body = create.mock.calls[0][0];
    expect(body).toMatchObject({ model: 'gen4_turbo', ratio: '1280:720', duration: 5, promptText: 'The hand-drawn butterfly comes alive and flutters its wings.' });
    expect(String(body.promptImage)).toMatch(/^data:image\/png;base64,/);
    expect([...readFileSync(join(outDir, 'd-1.mp4'))]).toEqual([1, 2, 3]);
    expect(status).toEqual([{ pending: 'd-1' }]);
  });
  it('one generation per drawing', async () => {
    const { inDir, outDir } = setup(), { client, create } = okClient();
    const g = new RunwayGenerator(client, { inDir, outDir, fetchFn: fetchClip as unknown as typeof fetch });
    await Promise.all([g.generate('d-1'), g.generate('d-1')]);
    await g.generate('d-1'); // the clip is already there
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('stops at the daily cap', async () => {
    const { inDir, outDir } = setup(), { client, create } = okClient();
    const g = new RunwayGenerator(client, { inDir, outDir, dailyCap: 0, fetchFn: fetchClip as unknown as typeof fetch });
    const status: unknown[] = [];
    g.onStatus((s) => status.push(s));
    expect(await g.generate('d-1')).toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(status[0]).toMatchObject({ failed: 'd-1' });
  });
  it('a failed task leaves no clip and says why (the drawing keeps its own animation)', async () => {
    const { inDir, outDir } = setup();
    const failed = new TaskFailedError({ id: 't', status: 'FAILED', failure: 'content moderation', failureCode: 'SAFETY.INPUT', createdAt: '' } as never);
    const client = { imageToVideo: { create: () => ({ waitForTaskOutput: async () => { throw failed; } }) } } as unknown as RunwayClient;
    const g = new RunwayGenerator(client, { inDir, outDir, fetchFn: fetchClip as unknown as typeof fetch });
    const status: { failed?: string; why?: string }[] = [];
    g.onStatus((s) => status.push(s as never));
    expect(await g.generate('d-1')).toBeNull();
    expect(existsSync(join(outDir, 'd-1.mp4'))).toBe(false);
    expect(status[1].why).toMatch(/content moderation.*SAFETY\.INPUT/);
  });
  it('Veo takes 4, 6 or 8 seconds', () => {
    expect(requestFor('veo3.1_fast', 'x', 'y').duration).toBe(4);
    expect(requestFor('gen4.5', 'x', 'y').duration).toBe(5);
  });
});
