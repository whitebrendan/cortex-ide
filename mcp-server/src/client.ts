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
}

// Command-specific timeouts (in ms)
const COMMAND_TIMEOUTS: Record<string, number> = {
  takeScreenshot: 60000,
  getDom: 60000,
  executeJs: 60000,
  default: 30000,
};

const SOCKET_IDLE_TIMEOUT_MS = 60000;
const CONNECT_TIMEOUT_MS = 10000;
const MAX_RESPONSE_LINE_BYTES = 32 * 1024 * 1024;
const MAX_RESPONSE_BUFFER_BYTES = 36 * 1024 * 1024;
const RESPONSE_LOG_SNIPPET = 200;

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
      const socket = new net.Socket();
      this.socket = socket;
      socket.setTimeout(SOCKET_IDLE_TIMEOUT_MS);

      let settled = false;

      const settleConnectFailure = (error: Error, destroySocket: boolean): void => {
        if (!settled) {
          settled = true;
          reject(error);
        }

        this.recycleConnection(error, {
          destroySocket,
          rejectConnectWaiters: true,
        });
      };

      const connectTimeout = setTimeout(() => {
        settleConnectFailure(new Error("Connection timeout"), true);
      }, CONNECT_TIMEOUT_MS);

      socket.on("connect", () => {
        if (this.socket !== socket) {
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

      socket.on("data", (data) => {
        if (this.socket !== socket) {
          return;
        }

        this.handleData(data);
      });

      socket.on("timeout", () => {
        if (this.socket !== socket) {
          return;
        }

        clearTimeout(connectTimeout);

        const timeoutError = new Error("Socket idle timeout");
        console.error("[MCP Client] Socket idle timeout — destroying connection");

        if (!settled) {
          settleConnectFailure(timeoutError, true);
          return;
        }

        this.recycleConnection(timeoutError, { destroySocket: true });
      });

      socket.on("error", (err) => {
        if (this.socket !== socket) {
          return;
        }

        clearTimeout(connectTimeout);

        const socketError = err instanceof Error ? err : new Error(String(err));
        console.error("[MCP Client] Socket error:", socketError.message);

        if (!settled) {
          settleConnectFailure(socketError, true);
          return;
        }

        this.recycleConnection(socketError, { destroySocket: true });
      });

      socket.on("close", (hadError) => {
        if (this.socket !== socket) {
          return;
        }

        clearTimeout(connectTimeout);

        const closeError = hadError
          ? new Error("Connection closed due to socket error")
          : new Error("Connection closed");

        console.error("[MCP Client] Connection closed");

        if (!settled) {
          settleConnectFailure(closeError, false);
          return;
        }

        this.recycleConnection(closeError, { destroySocket: false });
      });

      socket.connect(this.port, this.host);
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

  private getOldestPendingRequestId(): number | null {
    const firstEntry = this.pendingRequests.keys().next();
    if (firstEntry.done) {
      return null;
    }

    return firstEntry.value;
  }

  private resolvePendingRequest(requestId: number, response: SocketResponse): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return false;
    }

    this.pendingRequests.delete(requestId);
    clearTimeout(pending.timeoutId);
    pending.resolve(response);
    return true;
  }

  private rejectPendingRequest(requestId: number, error: Error): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return false;
    }

    this.pendingRequests.delete(requestId);
    clearTimeout(pending.timeoutId);
    pending.reject(error);
    return true;
  }

  private recycleConnection(
    error: Error,
    options: { destroySocket?: boolean; rejectConnectWaiters?: boolean } = {},
  ): void {
    const { destroySocket = true, rejectConnectWaiters = false } = options;
    const socket = this.socket;

    this.connected = false;
    this.connecting = false;
    this.socket = null;
    this.responseBuffer = "";

    this.rejectAllPending(error);

    if (rejectConnectWaiters) {
      this.drainConnectWaiters(error);
    }

    if (destroySocket && socket && !socket.destroyed) {
      socket.destroy();
    }
  }

  private handleData(data: Buffer): void {
    this.responseBuffer += data.toString();

    if (this.responseBuffer.length > MAX_RESPONSE_BUFFER_BYTES) {
      const error = new Error(`Response buffer exceeded limit (${MAX_RESPONSE_BUFFER_BYTES} bytes)`);
      console.error("[MCP Client]", error.message);

      const oldestRequestId = this.getOldestPendingRequestId();
      if (oldestRequestId != null) {
        this.rejectPendingRequest(oldestRequestId, error);
      }

      this.recycleConnection(error);
      return;
    }

    let newlineIndex: number;

    while ((newlineIndex = this.responseBuffer.indexOf("\n")) !== -1) {
      const jsonStr = this.responseBuffer.substring(0, newlineIndex);
      this.responseBuffer = this.responseBuffer.substring(newlineIndex + 1);

      if (!jsonStr.trim()) {
        continue;
      }

      if (jsonStr.length > MAX_RESPONSE_LINE_BYTES) {
        const error = new Error(`Response line exceeded limit (${MAX_RESPONSE_LINE_BYTES} bytes)`);

        console.error(
          "[MCP Client]",
          error.message,
          "Raw:",
          jsonStr.substring(0, RESPONSE_LOG_SNIPPET),
        );

        const oldestRequestId = this.getOldestPendingRequestId();
        if (oldestRequestId != null) {
          this.rejectPendingRequest(oldestRequestId, error);
        }

        this.recycleConnection(error);
        return;
      }

      try {
        const response = JSON.parse(jsonStr) as SocketResponse;

        if (response.id != null) {
          if (!this.resolvePendingRequest(response.id, response)) {
            console.error(
              `[MCP Client] Orphan response id=${response.id}; pending=${this.pendingRequests.size}`,
            );
          }
          continue;
        }

        const oldestRequestId = this.getOldestPendingRequestId();
        if (oldestRequestId == null) {
          console.error("[MCP Client] Orphan response without id and no pending requests");
          continue;
        }

        this.resolvePendingRequest(oldestRequestId, response);
      } catch (e) {
        const parseMessage = e instanceof Error ? e.message : String(e);
        const error = new Error(`Failed to parse response: ${parseMessage}`);

        console.error(
          "[MCP Client] Failed to parse response:",
          parseMessage,
          "Raw:",
          jsonStr.substring(0, RESPONSE_LOG_SNIPPET),
        );

        const oldestRequestId = this.getOldestPendingRequestId();
        if (oldestRequestId != null) {
          this.rejectPendingRequest(oldestRequestId, error);
        }

        this.recycleConnection(error);
        return;
      }
    }
  }

  private rejectAllPending(error: Error): void {
    const requestIds = Array.from(this.pendingRequests.keys());
    for (const requestId of requestIds) {
      this.rejectPendingRequest(requestId, error);
    }
  }

  private getTimeout(command: string): number {
    return COMMAND_TIMEOUTS[command] ?? COMMAND_TIMEOUTS.default;
  }

  async sendCommand(command: string, payload: Record<string, unknown> = {}): Promise<SocketResponse> {
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

    return new Promise((resolve, reject) => {
      const socket = this.socket;
      if (!socket || !this.connected) {
        reject(new Error("Socket not connected"));
        return;
      }

      const requestId = this.nextRequestId++;
      const timeout = this.getTimeout(command);

      const timeoutId = setTimeout(() => {
        const timeoutError = new Error(`Request timed out after ${timeout}ms`);
        if (this.rejectPendingRequest(requestId, timeoutError)) {
          console.error(`[MCP Client] Request timeout for command: ${command} (${timeout}ms)`);
          this.recycleConnection(new Error(`Request timeout for command: ${command}`));
        }
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
      });

      const request: SocketRequest = { id: requestId, command, payload };
      const json = JSON.stringify(request) + "\n";

      socket.write(json, (err) => {
        if (!err) {
          return;
        }

        const writeError = err instanceof Error ? err : new Error(String(err));

        if (this.rejectPendingRequest(requestId, writeError)) {
          console.error(`[MCP Client] Socket write failed for command: ${command} (${writeError.message})`);
        }

        if (this.socket === socket) {
          this.recycleConnection(new Error(`Socket write failed: ${writeError.message}`));
        }
      });
    });
  }

  disconnect(): void {
    const disconnectError = new Error("Client disconnected");

    this.rejectAllPending(disconnectError);
    if (this.connectWaiters.length > 0) {
      this.drainConnectWaiters(disconnectError);
    }

    const socket = this.socket;
    this.socket = null;
    this.connected = false;
    this.connecting = false;
    this.responseBuffer = "";

    if (socket && !socket.destroyed) {
      socket.destroy();
    }
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
