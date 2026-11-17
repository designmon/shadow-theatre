export type Gray = { width: number; height: number; data: Uint8ClampedArray }; // 1 byte/px luminance
export type Mask = { width: number; height: number; data: Uint8Array }; // 0|1
export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };
export type H = number[]; // 3x3 row-major, length 9
export type Side = 'left' | 'right' | 'up' | 'down';
export type CreatureKind = 'dog' | 'rabbit' | 'butterfly' | 'swan' | 'heart' | 'unknown';
/** `note`: why it came out the way it did (shown in the debug view), e.g. an API error or a low-confidence guess. */
export type Recognition = { kind: CreatureKind; confidence: number; facing: Side; anchor: Pt /* 0..1 in snapshot */; note?: string };
