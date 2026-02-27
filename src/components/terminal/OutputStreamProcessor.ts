/**
 * Output stream processor for chunked processing with debounced flushing.
 * Optimized for high-throughput terminal output.
 *
 * Performance optimizations:
 * - Pre-allocated buffer array to reduce GC pressure
 * - Uses array-based buffer to avoid repeated string concatenation
 * - Batched acknowledgments to reduce IPC overhead
 */

import { OUTPUT_CHUNK_SIZE, OUTPUT_FLUSH_DEBOUNCE_MS, ACK_BATCH_SIZE } from "./TerminalPanelTypes";

export class OutputStreamProcessor {
  private bufferChunks: string[] = [];
  private bufferLength = 0;
  private readonly chunkSize: number;
  private flushTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private pendingCallback: ((chunk: string) => void) | null = null;
  private pendingAckBytes = 0;
  private ackCallback: ((bytes: number) => void) | null = null;

  constructor(chunkSize: number = OUTPUT_CHUNK_SIZE) {
    this.chunkSize = chunkSize;
  }

  setAckCallback(callback: (bytes: number) => void): void {
    this.ackCallback = callback;
  }

  processChunked(data: string, callback: (chunk: string) => void): void {
    this.bufferChunks.push(data);
    this.bufferLength += data.length;
    this.pendingCallback = callback;

    this.pendingAckBytes += data.length;

    while (this.bufferLength >= this.chunkSize) {
      const fullBuffer = this.bufferChunks.join('');
      const chunk = fullBuffer.substring(0, this.chunkSize);
      const remainder = fullBuffer.substring(this.chunkSize);

      this.bufferChunks = remainder.length > 0 ? [remainder] : [];
      this.bufferLength = remainder.length;

      callback(chunk);
    }

    if (this.pendingAckBytes >= ACK_BATCH_SIZE && this.ackCallback) {
      this.ackCallback(this.pendingAckBytes);
      this.pendingAckBytes = 0;
    }

    if (this.bufferLength > 0 && !this.flushTimeoutId) {
      this.flushTimeoutId = setTimeout(() => {
        this.flushImmediate();
      }, OUTPUT_FLUSH_DEBOUNCE_MS);
    }
  }

  private flushImmediate(): void {
    if (this.bufferLength > 0 && this.pendingCallback) {
      const data = this.bufferChunks.join('');
      this.bufferChunks = [];
      this.bufferLength = 0;
      this.pendingCallback(data);
    }
    this.flushTimeoutId = null;

    if (this.pendingAckBytes > 0 && this.ackCallback) {
      this.ackCallback(this.pendingAckBytes);
      this.pendingAckBytes = 0;
    }
  }

  flush(callback: (chunk: string) => void): void {
    if (this.flushTimeoutId) {
      clearTimeout(this.flushTimeoutId);
      this.flushTimeoutId = null;
    }
    if (this.bufferLength > 0) {
      const data = this.bufferChunks.join('');
      this.bufferChunks = [];
      this.bufferLength = 0;
      callback(data);
    }

    if (this.pendingAckBytes > 0 && this.ackCallback) {
      this.ackCallback(this.pendingAckBytes);
      this.pendingAckBytes = 0;
    }
  }

  cancel(): void {
    if (this.flushTimeoutId) {
      clearTimeout(this.flushTimeoutId);
      this.flushTimeoutId = null;
    }
    this.bufferChunks = [];
    this.bufferLength = 0;
    this.pendingCallback = null;
    this.pendingAckBytes = 0;
  }

  dispose(): void {
    this.cancel();
    this.ackCallback = null;
    this.pendingCallback = null;
  }

  isDisposed(): boolean {
    return this.ackCallback === null && this.pendingCallback === null && this.bufferChunks.length === 0;
  }
}
