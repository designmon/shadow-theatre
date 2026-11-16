import type { Box, CreatureKind, Mask, Side } from '../types';

export type Spawn = { anchorBox: Box /* projector px */; facing: Side; openSide: Side; wall: { w: number; h: number }; avoid: Box | null };

export interface Creature {
  readonly kind: CreatureKind;
  update(dtMs: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  readonly done: boolean;
  /** Projector pixels this creature currently darkens (so the camera ignores them). */
  darkMask(w: number, h: number): Mask;
}

export const DIRS: Record<Side, { x: number; y: number }> = {
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
};
