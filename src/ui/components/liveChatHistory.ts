import type { Message } from "src/types";

/** Replace partial transcripts in place and serialize history writes, including the final save. */
export class LiveChatHistory {
  private transcript: Message[] = [];
  private timer: number | null = null;
  private saving: Promise<void> = Promise.resolve();
  private finished = false;
  readonly initialMessages: Message[];

  constructor(
    messages: Message[],
    private save: (messages: Message[]) => Promise<void>,
    private onError: (error: unknown) => void,
  ) {
    this.initialMessages = [...messages];
  }

  get messages(): Message[] { return [...this.initialMessages, ...this.transcript]; }

  update(transcript: Message[]): Message[] | null {
    if (this.finished) return null;
    this.transcript = [...transcript];
    this.clearTimer();
    if (transcript.length) this.timer = window.setTimeout(() => {
      this.timer = null;
      this.enqueueSave();
    }, 1000);
    return this.messages;
  }

  finish(transcript: Message[]): Promise<void> {
    if (this.finished) return this.saving;
    this.finished = true;
    this.transcript = [...transcript];
    this.clearTimer();
    if (transcript.length) this.enqueueSave();
    return this.saving;
  }

  private clearTimer() {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private enqueueSave() {
    const snapshot = this.messages;
    this.saving = this.saving.then(() => this.save(snapshot)).catch(error => this.onError(error));
  }
}
