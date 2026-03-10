/**
 * Socket client for connecting to Cortex Desktop's MCP socket server
 */

import * as net from "node:net";

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
}

interface ActiveRequest {
  id: number;
  command: string;
}

const COMMAND_TIMEOUTS: Record<string, number> = {
  takeScreenshot: 60000,
  getDom: 60000,
  executeJs: 60000,
  default: 30000,
};

const DEFAULT_SOCKET_HOST = "127.0.0.1";
const DEFAULT_SOCKET_PORT = 4000;

function isSocketResponse(value: unknown): value is SocketResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.success === "boolean"
    && (candidate.id === undefined || Number.isInteger(candidate.id))
    && (candidate.error === undefined || typeof candidate.error === "string");
}

function normalizeHost(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function sanitizeSocketPort(value: number, fallback: number): number {
  return Number.isSafeInteger(value) && value > 0 && value <= 65535 ? value : fallback;
}

export function sanitizeSocketHost(value: string | undefined, fallback: string = DEFAULT_SOCKET_HOST): string {
  if (value == null) {
    return fallback;
  }

  const candidate = normalizeHost(value);
  if (!candidate) {
    return fallback;
  }

  const lowerCandidate = candidate.toLowerCase();
  if (lowerCandidate === "localhost") {
    return "localhost";
  }

  if (net.isIP(candidate) === 4) {
    return candidate.startsWith("127.") ? candidate : fallback;
  }

  if (net.isIP(candidate) === 6) {
    try {
      const normalized = new URL(`http://[${candidate}]`).hostname;
      return normalized === "[::1]" ? "::1" : fallback;
    } catch {
      return fallback;
    }
  }

  return fallback;
}

export function parsePort(value: string | undefined, fallback: number = DEFAULT_SOCKET_PORT): number {
  if (value == null) {
    return fallback;
  }

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return fallback;
  }

  return sanitizeSocketPort(Number(trimmed), fallback);
}

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
  private activeRequest: ActiveRequest | null = null;

  constructor(host: string = DEFAULT_SOCKET_HOST, port: number = DEFAULT_SOCKET_PORT) {
    this.host = sanitizeSocketHost(host, DEFAULT_SOCKET_HOST);
    this.port = sanitizeSocketPort(port, DEFAULT_SOCKET_PORT);
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

      let settled = false;
      const connectTimeout = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        this.connecting = false;
        if (this.socket) {
          this.socket.destroy();
          this.socket = null;
        }

        const err = new Error("Connection timeout");
        reject(err);
        this.drainConnectWaiters(err);
      }, 10000);

      this.socket.on("connect", () => {
        if (settled) {
          return;
        }

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
        clearTimeout(connectTimeout);
        console.error("[MCP Client] Connection closed");
        const wasConnected = this.connected;
        this.connected = false;
        this.connecting = false;
        this.socket = null;
        this.responseBuffer = "";
        this.rejectAllPending(new Error("Connection closed"));

        if (!settled && !wasConnected) {
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
    for (const waiter of waiters) {
      if (err) {
        waiter.reject(err);
      } else {
        waiter.resolve();
      }
    }
  }

  private reserveRequestSlot(command: string): number {
    if (this.activeRequest) {
      throw new Error(`Another request is already in progress: ${this.activeRequest.command}`);
    }

    const requestId = this.nextRequestId++;
    this.activeRequest = { id: requestId, command };
    return requestId;
  }

  private clearRequestSlot(requestId: number): void {
    if (this.activeRequest?.id === requestId) {
      this.activeRequest = null;
    }
  }

  private takePendingRequest(requestId?: number): PendingRequest | null {
    let entry: [number, PendingRequest] | undefined;

    if (requestId != null) {
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        entry = [requestId, pending];
      }
    } else {
      const firstEntry = this.pendingRequests.entries().next();
      if (!firstEntry.done) {
        entry = firstEntry.value;
      }
    }

    if (!entry) {
      return null;
    }

    const [id, pending] = entry;
    this.pendingRequests.delete(id);
    clearTimeout(pending.timeoutId);
    this.clearRequestSlot(id);
    return pending;
  }

  private handleData(data: Buffer): void {
    this.responseBuffer += data.toString();

    let newlineIndex: number;
    while ((newlineIndex = this.responseBuffer.indexOf("\n")) !== -1) {
      const jsonStr = this.responseBuffer.substring(0, newlineIndex);
      this.responseBuffer = this.responseBuffer.substring(newlineIndex + 1);

      if (!jsonStr.trim()) {
        continue;
      }

      try {
        const parsed = JSON.parse(jsonStr) as unknown;
        if (!isSocketResponse(parsed)) {
          throw new Error("Malformed response payload");
        }

        const activeRequest = this.activeRequest;
        if (!activeRequest) {
          console.error("[MCP Client] Received a response with no pending request");
          continue;
        }

        if (parsed.id != null && parsed.id !== activeRequest.id) {
          const pending = this.takePendingRequest(activeRequest.id);
          if (pending) {
            pending.reject(new Error(`Received response for unexpected request id ${parsed.id}`));
          }
          continue;
        }

        const pending = this.takePendingRequest(activeRequest.id);
        if (pending) {
          pending.resolve(parsed);
        } else {
          console.error("[MCP Client] Lost pending request state before response was processed");
        }
      } catch (err) {
        console.error("[MCP Client] Failed to parse response:", err, "Raw:", jsonStr.substring(0, 200));
        const pending = this.takePendingRequest();
        if (pending) {
          const message = err instanceof Error ? err.message : String(err);
          pending.reject(new Error(`Failed to parse response: ${message}`));
        }
      }
    }
  }

  private rejectAllPending(error: Error): void {
    const entries = Array.from(this.pendingRequests.entries());
    this.pendingRequests.clear();
    this.activeRequest = null;

    for (const [, pending] of entries) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
  }

  private getTimeout(command: string): number {
    return COMMAND_TIMEOUTS[command] ?? COMMAND_TIMEOUTS.default;
  }

  async sendCommand(command: string, payload: Record<string, unknown> = {}): Promise<SocketResponse> {
    const requestId = this.reserveRequestSlot(command);

    try {
      if (!this.connected || !this.socket) {
        let lastErr: unknown;
        for (let attempt = 0; attempt <= this.maxReconnectAttempts; attempt++) {
          try {
            if (attempt > 0) {
              console.error(`[MCP Client] Reconnect attempt ${attempt}/${this.maxReconnectAttempts}`);
              await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
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

      return await new Promise<SocketResponse>((resolve, reject) => {
        if (!this.socket || !this.connected) {
          this.clearRequestSlot(requestId);
          reject(new Error("Socket not connected"));
          return;
        }

        const timeout = this.getTimeout(command);
        const timeoutId = setTimeout(() => {
          const pending = this.takePendingRequest(requestId);
          if (pending) {
            console.error(`[MCP Client] Request timeout for command: ${command} (${timeout}ms)`);
            pending.reject(new Error(`Request timed out after ${timeout}ms`));
          }
        }, timeout);

        this.pendingRequests.set(requestId, {
          resolve,
          reject,
          timeoutId,
        });

        const request: SocketRequest = { id: requestId, command, payload };
        const json = JSON.stringify(request) + "\n";

        this.socket.write(json, (err) => {
          if (err) {
            const pending = this.takePendingRequest(requestId);
            if (pending) {
              pending.reject(err);
            }
          }
        });
      });
    } catch (err) {
      this.clearRequestSlot(requestId);
      throw err;
    }
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

export const socketClient = new CortexSocketClient(
  sanitizeSocketHost(process.env.CORTEX_MCP_HOST, DEFAULT_SOCKET_HOST),
  parsePort(process.env.CORTEX_MCP_PORT, DEFAULT_SOCKET_PORT),
);
