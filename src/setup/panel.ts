import type { Gray, Mask } from '../types';
import type { Checklist } from './checklist';

const ICON = { ok: '✓', fail: '✕', pending: '●' };

/**
 * The setup panel, projected on the wall: a checklist and a big camera view.
 * Dark text on white so it stays readable when projected.
 */
export class SetupPanel {
  readonly root: HTMLDivElement;
  private list: HTMLUListElement;
  private preview: HTMLCanvasElement;
  private picker: HTMLSelectElement;
  private img: ImageData | null = null;
  visible = true;

  constructor(onPickCamera: (id: string) => void) {
    this.root = document.createElement('div');
    this.root.id = 'setup';
    this.root.innerHTML = `
      <h1>Shadow theatre setup</h1>
      <ul></ul>
      <label class="cam">Camera <select></select></label>
      <canvas width="320" height="240"></canvas>
      <p class="keys">C calibrate · S show/hide this · D debug · F fullscreen</p>`;
    document.body.appendChild(this.root);
    this.list = this.root.querySelector('ul')!;
    this.preview = this.root.querySelector('canvas')!;
    this.picker = this.root.querySelector('select')!;
    this.picker.addEventListener('change', () => onPickCamera(this.picker.value));
  }

  setCameras(cams: MediaDeviceInfo[], currentLabel: string): void {
    this.picker.innerHTML = '';
    cams.forEach((c, i) => {
      const o = document.createElement('option');
      o.value = c.deviceId;
      o.textContent = c.label || `Camera ${i + 1}`;
      o.selected = c.label === currentLabel;
      this.picker.appendChild(o);
    });
  }

  show(on: boolean): void {
    this.visible = on;
    this.root.style.display = on ? '' : 'none';
  }

  render(list: Checklist): void {
    this.list.innerHTML = list.items().map((i) =>
      `<li class="${i.state}"><b>${ICON[i.state]}</b><span class="label">${i.label}</span><span class="detail">${escape(i.detail)}</span></li>`,
    ).join('');
  }

  /** Camera view with what it reads as shadow in red. */
  drawCamera(frame: Gray, mask: Mask): void {
    if (this.preview.width !== frame.width) { this.preview.width = frame.width; this.preview.height = frame.height; }
    if (!this.img || this.img.width !== frame.width) this.img = new ImageData(frame.width, frame.height);
    const d = this.img.data;
    for (let i = 0, j = 0; j < frame.data.length; i += 4, j++) {
      const v = frame.data[j];
      if (mask.data[j]) { d[i] = 230; d[i + 1] = v >> 2; d[i + 2] = v >> 2; } else { d[i] = d[i + 1] = d[i + 2] = v; }
      d[i + 3] = 255;
    }
    this.preview.getContext('2d')!.putImageData(this.img, 0, 0);
  }

  /** Where the panel sits on the stage, in stage (device) pixels — excluded from shadow detection. */
  rect(): { x: number; y: number; w: number; h: number } | null {
    if (!this.visible) return null;
    const r = this.root.getBoundingClientRect();
    return { x: r.x * devicePixelRatio, y: r.y * devicePixelRatio, w: r.width * devicePixelRatio, h: r.height * devicePixelRatio };
  }
}

function escape(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}
