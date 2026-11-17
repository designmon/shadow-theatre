/**
 * Dev-only simulator (?sim): replaces the webcam with a canvas that films the
 * stage like a camera would (slightly skewed, dimmer, a bit noisy) and adds a
 * fake performer: a body shadow on one side and an arm + hand shape that
 * reaches in, holds still, and pulls back. Lets the whole loop run without hardware.
 */
type Shape = 'dog' | 'rabbit' | 'butterfly' | 'swan' | 'blob';

export function installSimCamera(stage: () => HTMLCanvasElement): void {
  const params = new URLSearchParams(location.search);
  const shape = (params.get('sim') || 'blob') as Shape;
  const cam = document.createElement('canvas');
  cam.width = 640;
  cam.height = 480;
  const out = cam.getContext('2d')!;
  // ?room: the wall is only part of the camera view, with furniture around it that
  // catches some projector spill light (like a camera off to the side, further away)
  const room = params.has('room');
  const sceneCanvas = room ? document.createElement('canvas') : cam;
  sceneCanvas.width = 640;
  sceneCanvas.height = 480;
  const ctx = sceneCanvas.getContext('2d')!;
  const big = params.has('big') ? 1.8 : 1;
  const t0 = performance.now();
  const probe = document.createElement('canvas');
  probe.width = probe.height = 4;
  const pctx = probe.getContext('2d', { willReadFrequently: true })!;

  const draw = () => {
    const t = (performance.now() - t0) / 1000;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, 640, 480);
    // the wall: stage filmed with a mild skew (camera off to the side)
    ctx.save();
    // ?crop: the camera misses the left part of the picture
    ctx.setTransform(0.85, 0.03, -0.02, 0.88, params.has('crop') ? -110 : 40, 25);
    ctx.filter = 'brightness(0.85)';
    ctx.drawImage(stage(), 0, 0, 640, 480);
    ctx.restore();
    // ?cover: someone standing in front of the top-right of the wall the whole time
    if (params.has('cover')) { ctx.fillStyle = '#080808'; ctx.fillRect(470, 20, 170, 200); }
    // performer appears after calibration (~3 s), reaches in, holds, leaves
    const start = Number(params.get('start') ?? 3); // ?start=<s>: when the performer first walks in
    const cycle = (t - start) % 9;
    if (t > start && cycle < 6) {
      const reach = Math.min(1, cycle / 1.2) * (cycle > 5 ? Math.max(0, 6 - cycle) : 1);
      ctx.fillStyle = 'rgba(8,8,8,1)';
      ctx.fillRect(40, 140, 90, 360); // body against the left of the wall
      const hx = 130 + reach * 200;
      ctx.fillRect(130, 250, hx - 130, 26 * big); // arm
      ctx.save();
      ctx.translate(hx, 262);
      ctx.scale(big, big);
      drawHand(ctx, shape, 0, 0);
      ctx.restore();
    }
    if (params.has('ambient')) {
      // room light: everything gets brighter, so shadows are only a bit darker than the wall
      ctx.fillStyle = `rgba(200,200,200,${params.get('ambient') || 0.6})`;
      ctx.fillRect(0, 0, 640, 480);
    }
    if (room) {
      // how bright is the projected picture right now (spill light on the furniture)
      pctx.drawImage(stage(), 0, 0, 4, 4);
      const px = pctx.getImageData(0, 0, 4, 4).data;
      let lum = 0;
      for (let i = 0; i < px.length; i += 4) lum += px[i];
      const spill = Math.round(25 + (lum / 16) * 0.25);
      out.fillStyle = '#151515';
      out.fillRect(0, 0, 640, 480);
      out.fillStyle = `rgb(${spill},${spill},${spill})`;
      out.fillRect(20, 60, 90, 300); // a bookshelf beside the wall
      out.fillRect(540, 300, 80, 160); // a chair
      out.fillStyle = '#060606';
      out.fillRect(40, 120, 50, 30); out.fillRect(40, 220, 50, 30); // books (dark)
      out.drawImage(sceneCanvas, 150, 110, 380, 285); // the wall, smaller in view
    }
    requestAnimationFrame(draw);
  };
  draw();

  const stream = cam.captureStream(30);
  navigator.mediaDevices.getUserMedia = async () => stream;
}

function drawHand(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number) {
  // drawn around (x, y)
  ctx.beginPath();
  if (shape === 'dog') {
    ctx.ellipse(x + 30, y - 5, 38, 26, 0, 0, Math.PI * 2);
    ctx.moveTo(x + 60, y - 10); ctx.lineTo(x + 95, y - 2); ctx.lineTo(x + 60, y + 14); // snout
    ctx.moveTo(x + 15, y - 25); ctx.lineTo(x + 22, y - 55); ctx.lineTo(x + 35, y - 28); // ear
  } else if (shape === 'rabbit') {
    ctx.ellipse(x + 25, y, 30, 24, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 25, y - 50, 7, 30, -0.15, 0, Math.PI * 2);
    ctx.ellipse(x + 42, y - 48, 7, 30, 0.2, 0, Math.PI * 2);
  } else if (shape === 'butterfly') {
    ctx.ellipse(x + 20, y - 30, 30, 40, -0.5, 0, Math.PI * 2);
    ctx.ellipse(x + 20, y + 30, 30, 40, 0.5, 0, Math.PI * 2);
  } else if (shape === 'swan') {
    ctx.rect(x - 10, y - 90, 18, 100);
    ctx.ellipse(x + 10, y - 95, 22, 13, 0, 0, Math.PI * 2);
    ctx.moveTo(x + 28, y - 100); ctx.lineTo(x + 55, y - 92); ctx.lineTo(x + 28, y - 88);
  } else {
    ctx.ellipse(x + 25, y, 35, 28, 0, 0, Math.PI * 2);
  }
  ctx.fill();
}
