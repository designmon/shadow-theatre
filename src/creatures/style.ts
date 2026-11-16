/** Creatures are drawn as "no light" with a soft edge so they read as real shadows. */
export const SHADOW = { color: '#000', blurPx: 3 };
let blurOn = true;
export function setBlur(on: boolean): void {
  blurOn = on;
}

export function applyShadowStyle(ctx: CanvasRenderingContext2D, alpha = 1): void {
  ctx.fillStyle = SHADOW.color;
  ctx.strokeStyle = SHADOW.color;
  ctx.filter = blurOn ? `blur(${SHADOW.blurPx}px)` : 'none';
  ctx.globalAlpha = alpha;
}
