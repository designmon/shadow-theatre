/**
 * Listening for a voice command, in the browser: Chrome's speech recognition turns what you say
 * into text as you speak, and a microphone level meter drives the sound-wave animation. There's no
 * reply: what you say just happens on the wall.
 */
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export class VoiceInput {
  listening = false;
  /** What it heard so far (final + what it's still hearing). */
  text = '';
  error: string | null = null;
  private finalText = '';
  private rec: Recognition | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Uint8Array | null = null;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;

  static supported(): boolean {
    const w = window as unknown as Record<string, unknown>;
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  }

  async start(): Promise<void> {
    if (this.listening) return;
    this.listening = true;
    this.text = this.finalText = '';
    this.error = null;
    const w = window as unknown as Record<string, new () => Recognition>;
    const R = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!R) { this.error = 'this browser has no speech recognition (use Chrome)'; return; }
    const rec = new R();
    rec.lang = navigator.language || 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.finalText += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      this.text = (this.finalText + interim).trim();
    };
    rec.onerror = (e) => { if (e.error !== 'no-speech' && e.error !== 'aborted') this.error = e.error === 'not-allowed' ? 'microphone not allowed' : e.error; };
    rec.onend = () => { if (this.listening) { try { rec.start(); } catch { /* already started */ } } }; // keep listening through pauses
    this.rec = rec;
    try { rec.start(); } catch { /* ignore */ }
    // the level meter for the sound wave (best-effort)
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.ctx = new AudioContext();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      src.connect(this.analyser);
      this.buf = new Uint8Array(this.analyser.fftSize);
    } catch { /* no level meter: the wave just idles */ }
  }

  /** Stop listening; returns what was said. */
  stop(): string {
    this.listening = false;
    try { this.rec?.stop(); } catch { /* ignore */ }
    this.rec = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    this.stream = null; this.ctx = null; this.analyser = null;
    return this.text.trim();
  }

  /** How loud right now, 0..1. */
  level(): number {
    if (!this.analyser || !this.buf) return 0;
    this.analyser.getByteTimeDomainData(this.buf as Uint8Array<ArrayBuffer>);
    let s = 0;
    for (const v of this.buf) { const x = (v - 128) / 128; s += x * x; }
    return Math.min(1, Math.sqrt(s / this.buf.length) * 4);
  }
}
