import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { saveCapture } from '../../server/captures';

describe('saveCapture', () => {
  it('keeps each snapshot with its verdict, and a log line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cap-'));
    const png = Buffer.from([1, 2, 3]);
    const file = saveCapture(dir, png, { kind: 'rabbit', confidence: 0.42, facing: 'left', anchor: { x: 0.3, y: 0.2 } }, 1830, new Date('2026-11-17T10:20:30Z'));
    expect(file).toMatch(/2026-11-17T10-20-30.*rabbit-0\.42\.png$/);
    expect(readFileSync(join(dir, file))).toEqual(png);
    expect(readFileSync(join(dir, 'log.txt'), 'utf8')).toContain(`${file}\trabbit\t0.42\tleft\t1830ms`);
    expect(readdirSync(dir)).toHaveLength(2);
  });
});
