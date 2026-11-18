import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClipWatcher, safeName, saveRunwayInput, serveClip } from '../../server/runway';

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'rw-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('Runway files (phase 1)', () => {
  it('only safe names', () => {
    expect(safeName('20261118-143205-butterfly')).toBe('20261118-143205-butterfly');
    expect(safeName('scene-20261118-143205')).toBe('scene-20261118-143205');
    expect(safeName('../etc/passwd')).toBeNull();
    expect(safeName('a b')).toBeNull();
  });
  it('saves the image, the prompt and what is needed to put the clip back', () => {
    const d = tmp();
    saveRunwayInput({ name: 'x-1', png: Buffer.from('png').toString('base64'), prompt: 'The hand-drawn cat…', meta: { label: 'cat' } }, d);
    expect(readFileSync(join(d, 'x-1.png'), 'utf8')).toBe('png');
    expect(readFileSync(join(d, 'x-1.txt'), 'utf8')).toBe('The hand-drawn cat…\n');
    expect(JSON.parse(readFileSync(join(d, 'x-1.json'), 'utf8'))).toEqual({ label: 'cat' });
    expect(() => saveRunwayInput({ name: '../x', png: '', prompt: '', meta: {} }, d)).toThrow();
  });
  it('announces a clip once it has finished copying, and again when replaced', () => {
    const d = tmp(), w = new ClipWatcher(d), got: string[] = [];
    w.onClip((f) => got.push(f));
    writeFileSync(join(d, 'a.mp4'), 'xx');
    writeFileSync(join(d, 'notes.txt'), 'not a clip');
    w.scan(); expect(got).toEqual([]); // still copying?
    writeFileSync(join(d, 'a.mp4'), 'xxxx');
    w.scan(); expect(got).toEqual([]); // it grew: still copying
    w.scan(); expect(got).toEqual(['a.mp4']); // settled
    w.scan(); expect(got).toEqual(['a.mp4']); // once
    writeFileSync(join(d, 'a.mp4'), 'yyyyyy'); // re-generated
    w.scan(); w.scan(); expect(got).toEqual(['a.mp4', 'a.mp4']);
  });
  it('serves clips with range requests, nothing outside the folder', async () => {
    const d = tmp();
    writeFileSync(join(d, 'c.mp4'), '0123456789');
    const srv: Server = createServer((req, res) => serveClip(req, res, decodeURIComponent(req.url!.slice(1)), d));
    await new Promise<void>((r) => srv.listen(0, r));
    const port = (srv.address() as { port: number }).port;
    const part = await fetch(`http://127.0.0.1:${port}/c.mp4`, { headers: { range: 'bytes=2-5' } });
    expect(part.status).toBe(206);
    expect(await part.text()).toBe('2345');
    expect((await fetch(`http://127.0.0.1:${port}/c.mp4`)).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${port}/..%2Fsecret.mp4`)).status).toBe(404);
    srv.close();
  });
});
