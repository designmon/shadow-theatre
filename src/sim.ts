/**
 * Dev-only simulator (?sim): replaces the webcam with a canvas that films the
 * stage like a camera would (slightly skewed, dimmer, a bit noisy) and adds a
 * fake performer: a body shadow on one side and an arm + hand shape that
 * reaches in, holds still, and pulls back. Lets the whole loop run without hardware.
 */
type Shape = 'dog' | 'rabbit' | 'butterfly' | 'swan' | 'blob' | 'point';

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
    // ?shift=<px>: after calibrating, the camera's view is a few pixels off (an imperfect calibration)
    const shift = t > 3 ? Number(params.get('shift') || 0) : 0;
    ctx.setTransform(0.85, 0.03, -0.02, 0.88, (params.has('crop') ? -110 : 40) + shift, 25 + shift * 0.5);
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
      let hx = 130 + reach * 200, hy = 262;
      let pose: Shape = shape;
      // ?wake: every other visit, point at the drawing resting in the bottom-right corner instead
      const visiting = shape === 'point' && params.has('wake') && Math.floor((t - start) / 9) % 2 === 1;
      if (visiting) { hx = 130 + reach * 340; hy = 262 + reach * 160; }
      if (shape === 'point' && cycle >= 5 && !visiting) pose = 'blob'; // close the hand into a fist: done
      if (shape === 'point' && cycle > 2.6 && cycle < 5 && !visiting) {
        // draw a loop with the fingertip (after holding still to get the laser)
        const a = ((cycle - 2.6) / 2.4) * Math.PI * 2;
        hx += Math.sin(a) * 70; hy += (1 - Math.cos(a)) * 35;
      }
      ctx.save(); ctx.lineWidth = 26 * big; ctx.strokeStyle = 'rgba(8,8,8,1)'; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(130, 263); ctx.lineTo(hx, hy + 1); ctx.stroke(); ctx.restore(); // arm
      ctx.save();
      ctx.translate(hx, hy);
      ctx.scale(big, big);
      drawHand(ctx, pose, 0, 0);
      ctx.restore();
    }
    if (params.has('warm')) {
      // warm lamps (like a real living room): orange light, strongest on the left, added on top —
      // the red channel runs into the top of the camera's range before the projector adds anything
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, 0, 640, 0);
      g.addColorStop(0, `rgba(235,150,60,${params.get('warm') || 0.85})`);
      g.addColorStop(1, `rgba(200,120,50,${0.5 * Number(params.get('warm') || 0.85)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 640, 480);
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
    if (params.has('noise')) {
      // a real (phone) camera: every pixel jitters a few levels, a little differently per colour
      const amp = Number(params.get('noise') || 8);
      const img = out.getImageData(0, 0, 640, 480), d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const common = (Math.random() + Math.random() - 1) * amp;
        for (let c = 0; c < 3; c++) d[i + c] += common + (Math.random() - 0.5) * amp;
      }
      out.putImageData(img, 0, 0);
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
  } else if (shape === 'point') {
    ctx.ellipse(x + 14, y, 20, 17, 0, 0, Math.PI * 2); // fist
    ctx.rect(x + 28, y - 4, 46, 8); // index finger
  } else {
    ctx.ellipse(x + 25, y, 35, 28, 0, 0, Math.PI * 2);
  }
  ctx.fill();
}
