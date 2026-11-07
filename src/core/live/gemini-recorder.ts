// Embedded so AudioWorklet needs no server route or extra plugin asset.
export const GEMINI_LIVE_RECORDER_SOURCE = String.raw`
// Capture mono microphone audio as 16 kHz, little-endian PCM16 in 40 ms frames.
// Keep the fractional resampling state across render quanta (e.g. 44.1 kHz).
class GeminiLiveRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.reset();
    this.port.onmessage = () => this.reset();
  }
  reset() {
    this.frame = new DataView(new ArrayBuffer(640 * 2));
    this.index = 0;
    this.remaining = this.ratio;
    this.sum = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const sample of input) {
      let available = 1;
      while (available > 1e-8) {
        const portion = Math.min(available, this.remaining);
        this.sum += sample * portion;
        this.remaining -= portion;
        available -= portion;
        if (this.remaining < 1e-8) {
          const value = Math.max(-1, Math.min(1, this.sum / this.ratio));
          this.frame.setInt16(this.index++ * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
          this.sum = 0;
          this.remaining = this.ratio;
          if (this.index === 640) {
            this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
            this.frame = new DataView(new ArrayBuffer(640 * 2));
            this.index = 0;
          }
        }
      }
    }
    return true;
  }
}
registerProcessor('gemini-live-recorder', GeminiLiveRecorder);
`;
