/**
 * Socket client for connecting to Cortex Desktop's MCP socket server
 */

import * as net from "net";

interface SocketRequest {
  id: number;
  command: string;
  payload: Record<string, unknown>;
}

interface SocketResponse {
  id?: number;
  success: boolean;
  data?: unknown;
  error?: string;
}

interface PendingRequest {
  resolve: (response: SocketResponse) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
  command: string;
}

// Command-specific timeouts (in ms)
const COMMAND_TIMEOUTS: Record<string, number> = {
  takeScreenshot: 60000,
  getDom: 60000,
  executeJs: 60000,
  default: 30000,
};

export class CortexSocketClient {
  private socket: net.Socket | null = null;
  private host: string;
  private port: number;
  private connected: boolean = false;
  private connecting: boolean = false;
  private responseBuffer: string = "";
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private nextRequestId: number = 1;
  private maxReconnectAttempts: number = 3;
  private connectWaiters: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

  constructor(host: string = "127.0.0.1", port: number = 4000) {
    this.host = host;
    this.port = port;
  }

  async connect(): Promise<void> {
    if (this.connected && this.socket) {
      return;
    }

    if (this.connecting) {
      return new Promise<void>((resolve, reject) => {
        this.connectWaiters.push({ resolve, reject });
      });
    }

    this.connecting = true;

    return new Promise<void>((resolve, reject) => {
      this.socket = new net.Socket();

      this.socket.setTimeout(60000);

      const connectTimeout = setTimeout(() => {
        this.connecting = false;
        if (this.socket) {
          this.socket.destroy();
          this.socket = null;
        }
        const err = new Error("Connection timeout");
        reject(err);
        this.drainConnectWaiters(err);
      }, 10000);

      let settled = false;

      this.socket.on("connect", () => {
        clearTimeout(connectTimeout);
        this.connected = true;
        this.connecting = false;
        settled = true;
        console.error(`[MCP Client] Connected to Cortex Desktop at ${this.host}:${this.port}`);
        resolve();
        this.drainConnectWaiters(null);
      });

      this.socket.on("data", (data) => {
        this.handleData(data);
      });

      this.socket.on("timeout", () => {
        console.error("[MCP Client] Socket idle timeout — destroying connection");
        if (this.socket) {
          this.socket.destroy();
        }
      });

      this.socket.on("error", (err) => {
        clearTimeout(connectTimeout);
        console.error("[MCP Client] Socket error:", err.message);
        this.connected = false;
        this.connecting = false;

        this.rejectAllPending(err);

        if (!settled) {
          settled = true;
          reject(err);
          this.drainConnectWaiters(err);
        }
      });

      this.socket.on("close", () => {
        console.error("[MCP Client] Connection closed");
        const wasClosed = !this.connected;
        this.connected = false;
        this.connecting = false;
        this.socket = null;
        this.responseBuffer = "";

        this.rejectAllPending(new Error("Connection closed"));

        if (!settled && !wasClosed) {
          settled = true;
          const err = new Error("Connection closed before established");
          reject(err);
          this.drainConnectWaiters(err);
        }
      });

      this.socket.connect(this.port, this.host);
    });
  }

  private drainConnectWaiters(err: Error | null): void {
    const waiters = this.connectWaiters;
    this.connectWaiters = [];
    for (const w of waiters) {
      if (err) {
        w.reject(err);
      } else {
        w.resolve();
      }
    }
  }

  private handleData(data: Buffer): void {
    this.responseBuffer += data.toString();

    let newlineIndex: number;
    while ((newlineIndex = this.responseBuffer.indexOf("\n")) !== -1) {
      const jsonStr = this.responseBuffer.substring(0, newlineIndex);
      this.responseBuffer = this.responseBuffer.substring(newlineIndex + 1);

      if (!jsonStr.trim()) continue;

      try {
        const response = JSON.parse(jsonStr) as SocketResponse;

        if (response.id != null && this.pendingRequests.has(response.id)) {
          const pending = this.pendingRequests.get(response.id)!;
          this.pendingRequests.delete(response.id);
          clearTimeout(pending.timeoutId);
          pending.resolve(response);
        } else {
          const firstEntry = this.pendingRequests.entries().next();
          if (!firstEntry.done) {
            const [id, pending] = firstEntry.value;
            this.pendingRequests.delete(id);
            clearTimeout(pending.timeoutId);
            pending.resolve(response);
          }
        }
      } catch (e) {
        console.error("[MCP Client] Failed to parse response:", e, "Raw:", jsonStr.substring(0, 200));
        const firstEntry = this.pendingRequests.entries().next();
        if (!firstEntry.done) {
          const [id, pending] = firstEntry.value;
          this.pendingRequests.delete(id);
          clearTimeout(pending.timeoutId);
          pending.reject(new Error(`Failed to parse response: ${e}`));
        }
      }
    }
  }

  private rejectAllPending(error: Error): void {
    const entries = Array.from(this.pendingRequests.entries());
    this.pendingRequests.clear();
    for (const [, pending] of entries) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
  }

  private getTimeout(command: string): number {
    return COMMAND_TIMEOUTS[command] ?? COMMAND_TIMEOUTS["default"];
  }

  async sendCommand(command: string, payload: Record<string, unknown> = {}): Promise<SocketResponse> {
    if (!this.connected || !this.socket) {
      let lastErr: unknown;
      for (let attempt = 0; attempt <= this.maxReconnectAttempts; attempt++) {
        try {
          if (attempt > 0) {
            console.error(`[MCP Client] Reconnect attempt ${attempt}/${this.maxReconnectAttempts}`);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
          await this.connect();
          break;
        } catch (err) {
          lastErr = err;
          if (attempt === this.maxReconnectAttempts) {
            throw lastErr;
          }
        }
      }
    }

    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error("Socket not connected"));
        return;
      }

      const requestId = this.nextRequestId++;
      const timeout = this.getTimeout(command);

      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          console.error(`[MCP Client] Request timeout for command: ${command} (${timeout}ms)`);
          reject(new Error(`Request timed out after ${timeout}ms`));
        }
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
        command,
      });

      const request: SocketRequest = { id: requestId, command, payload };
      const json = JSON.stringify(request) + "\n";

      this.socket.write(json, (err) => {
        if (err) {
          if (this.pendingRequests.has(requestId)) {
            const pending = this.pendingRequests.get(requestId)!;
            this.pendingRequests.delete(requestId);
            clearTimeout(pending.timeoutId);
            pending.reject(err);
          }
        }
      });
    });
  }

  disconnect(): void {
    this.rejectAllPending(new Error("Client disconnected"));

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
    }

    this.responseBuffer = "";
    this.connectWaiters = [];
  }

  isConnected(): boolean {
    return this.connected && this.socket !== null;
  }
}

function parsePort(value: string | undefined, fallback: number): number {
  if (value == null) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

// Singleton instance
export const socketClient = new CortexSocketClient(
  process.env.CORTEX_MCP_HOST || "127.0.0.1",
  parsePort(process.env.CORTEX_MCP_PORT, 4000),
);
