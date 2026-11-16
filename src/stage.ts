export type Stage = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; size(): { w: number; h: number } };

/** Fullscreen canvas that is what the projector shows. */
export function createStage(): Stage {
  const canvas = document.createElement('canvas');
  canvas.id = 'stage';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const resize = () => {
    canvas.width = Math.round(window.innerWidth * devicePixelRatio);
    canvas.height = Math.round(window.innerHeight * devicePixelRatio);
  };
  resize();
  window.addEventListener('resize', resize);
  return { canvas, ctx, size: () => ({ w: canvas.width, h: canvas.height }) };
}

export function clearWhite(stage: Stage): void {
  const { ctx, canvas } = stage;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
