/** Creatures are drawn as "no light" with a soft edge so they read as real shadows. */
export const SHADOW = { color: '#000', blurPx: 3 };

export function applyShadowStyle(ctx: CanvasRenderingContext2D, alpha = 1): void {
  ctx.fillStyle = SHADOW.color;
  ctx.strokeStyle = SHADOW.color;
  ctx.filter = `blur(${SHADOW.blurPx}px)`;
  ctx.globalAlpha = alpha;
}
