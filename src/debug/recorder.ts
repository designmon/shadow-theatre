/** Records the camera stream to a .webm the user can send back. */
export class Recorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  get recording(): boolean {
    return this.rec !== null;
  }

  toggle(stream: MediaStream): void {
    if (this.rec) {
      this.rec.stop();
      return;
    }
    this.chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '' });
    rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(this.chunks, { type: rec.mimeType || 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `shadow-clip-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      this.rec = null;
    };
    rec.start(250);
    this.rec = rec;
  }
}
