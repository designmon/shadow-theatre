import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Recognition } from '../src/types';

/** Save what was sent to Claude and what it answered, so we can see why a shape was (not) recognized. */
export function saveCapture(dir: string, png: Buffer, rec: Recognition, ms: number, at = new Date()): string {
  mkdirSync(dir, { recursive: true });
  const stamp = at.toISOString().replace(/[:.]/g, '-');
  const file = `${stamp}-${rec.kind}-${rec.confidence.toFixed(2)}.png`;
  writeFileSync(join(dir, file), png);
  appendFileSync(join(dir, 'log.txt'), `${file}\t${rec.kind}\t${rec.confidence.toFixed(2)}\t${rec.facing}\t${ms}ms\n`);
  return file;
}
