/**
 * Socket client for connecting to Cortex Desktop's MCP socket server.
 */

import * as net from "node:net";

interface SocketRequest {
  id: number;
  command: string;
  payload: Record<string, unknown>;
}

export interface SocketResponse {
  id?: number;
  success: boolean;
  data?: unknown;
  error?: string;
}

type TimeoutHandle = ReturnType<typeof setTimeout>;

interface PendingRequest {
  resolve: (response: SocketResponse) => void;
  reject: (error: Error) => void;
  timeoutId: TimeoutHandle;
  command: string;
}

interface ConnectWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
}

interface SocketLike {
  setTimeout(timeout: number): SocketLike;
  on(event: string, listener: (...args: unknown[]) => void): SocketLike;
  connect(port: number, host: string): void;
  write(data: string, callback?: (error?: Error | null) => void): boolean;
  destroy(): void;
}

interface CortexSocketClientOptions {
  socketFactory?: () => SocketLike;
  connectTimeoutMs?: number;
  socketIdleTimeoutMs?: number;
  maxReconnectAttempts?: number;
  commandTimeouts?: Partial<Record<string, number>>;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4000;
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_SOCKET_IDLE_TIMEOUT_MS = 60_000;

const COMMAND_TIMEOUTS: Record<string, number> = {
  takeScreenshot: 60_000,
  getDom: 60_000,
  executeJs: 60_000,
  default: 30_000,
};

function asError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string" && error.trim()) {
    return new Error(error);
  }

  return new Error(fallbackMessage);
}

function isSocketResponse(value: unknown): value is SocketResponse {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const response = value as Record<string, unknown>;

  if (typeof response.success !== "boolean") {
    return false;
  }

  const id = response.id;
  if (id != null && (typeof id !== "number" || !Number.isInteger(id) || id < 0)) {
    return false;
  }

  if (response.error != null && typeof response.error !== "string") {
    return false;
  }

  return true;
}

export class CortexSocketClient {
  private socket: SocketLike | null = null;
  private readonly host: string;
  private readonly port: number;
  private connected = false;
  private connecting = false;
  private responseBuffer = "";
  private pendingRequests = new Map<number, PendingRequest>();
  private nextRequestId = 1;
  private readonly maxReconnectAttempts: number;
  private connectWaiters: ConnectWaiter[] = [];
  private requestQueue: Promise<void> = Promise.resolve();
  private readonly socketFactory: () => SocketLike;
  private readonly connectTimeoutMs: number;
  private readonly socketIdleTimeoutMs: number;
  private readonly commandTimeouts: Record<string, number>;

  constructor(host: string = DEFAULT_HOST, port: number = DEFAULT_PORT, options: CortexSocketClientOptions = {}) {
    this.host = host;
    this.port = port;
    this.socketFactory = options.socketFactory ?? (() => new net.Socket());
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.socketIdleTimeoutMs = options.socketIdleTimeoutMs ?? DEFAULT_SOCKET_IDLE_TIMEOUT_MS;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 3;
    const commandTimeouts: Record<string, number> = { ...COMMAND_TIMEOUTS };
    if (options.commandTimeouts) {
      for (const [command, timeout] of Object.entries(options.commandTimeouts)) {
        if (typeof timeout === "number" && Number.isFinite(timeout) && timeout > 0) {
          commandTimeouts[command] = timeout;
        }
      }
    }
    this.commandTimeouts = commandTimeouts;
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
    this.responseBuffer = "";

    const socket = this.socketFactory();
    this.socket = socket;
    socket.setTimeout(this.socketIdleTimeoutMs);

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let connectTimeoutId: TimeoutHandle | undefined;

      const finish = (error: Error | null) => {
        if (settled) {
          return;
        }

        settled = true;
        this.connecting = false;
        if (connectTimeoutId) {
          clearTimeout(connectTimeoutId);
        }

        if (error) {
          this.connected = false;
          reject(error);
          this.drainConnectWaiters(error);
          return;
        }

        this.connected = true;
        console.error(`[MCP Client] Connected to Cortex Desktop at ${this.host}:${this.port}`);
        resolve();
        this.drainConnectWaiters(null);
      };

      socket.on("connect", () => {
        if (this.socket !== socket) {
          return;
        }

        finish(null);
      });

      socket.on("data", (data) => {
        if (this.socket !== socket) {
          return;
        }

        if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
          this.handleData(data);
          return;
        }

        this.handleData(String(data));
      });

      socket.on("timeout", () => {
        if (this.socket !== socket) {
          return;
        }

        const error = new Error("Socket idle timeout");
        console.error("[MCP Client] Socket idle timeout — destroying connection");
        finish(error);
        this.closeSocket(socket, error);
      });

      socket.on("error", (error) => {
        const socketError = asError(error, "Socket error");
        console.error("[MCP Client] Socket error:", socketError.message);
        finish(socketError);

        if (this.socket === socket) {
          this.closeSocket(socket, socketError);
        }
      });

      socket.on("close", () => {
        const closeError = settled ? new Error("Connection closed") : new Error("Connection closed before established");
        console.error("[MCP Client] Connection closed");

        if (!settled) {
          finish(closeError);
        }

        if (this.socket === socket) {
          this.closeSocket(socket, closeError);
        }
      });

      connectTimeoutId = setTimeout(() => {
        if (settled) {
          return;
        }

        const error = new Error(`Connection timeout after ${this.connectTimeoutMs}ms`);
        console.error("[MCP Client] Connection timeout");
        finish(error);
        this.closeSocket(socket, error);
      }, this.connectTimeoutMs);

      socket.connect(this.port, this.host);
    });
  }

  private drainConnectWaiters(error: Error | null): void {
    const waiters = this.connectWaiters;
    this.connectWaiters = [];

    for (const waiter of waiters) {
      if (error) {
        waiter.reject(error);
      } else {
        waiter.resolve();
      }
    }
  }

  private handleData(data: string | Uint8Array): void {
    const chunk = typeof data === "string" ? data : new TextDecoder().decode(data);
    this.responseBuffer += chunk;

    let newlineIndex = this.responseBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const jsonStr = this.responseBuffer.slice(0, newlineIndex);
      this.responseBuffer = this.responseBuffer.slice(newlineIndex + 1);

      if (jsonStr.trim()) {
        const protocolError = this.processResponseLine(jsonStr);
        if (protocolError) {
          console.error(
            "[MCP Client] Protocol error:",
            protocolError.message,
            "Raw:",
            jsonStr.slice(0, 200),
          );
          this.closeSocket(this.socket, protocolError);
          break;
        }
      }

      newlineIndex = this.responseBuffer.indexOf("\n");
    }
  }

  private processResponseLine(jsonStr: string): Error | null {
    let parsed: unknown;

    try {
      parsed = JSON.parse(jsonStr);
    } catch (error) {
      return new Error(`Failed to parse response: ${asError(error, "Invalid JSON response").message}`);
    }

    if (!isSocketResponse(parsed)) {
      return new Error("Invalid response shape");
    }

    const response = parsed;

    if (response.id != null) {
      return this.resolvePendingRequest(response.id, response)
        ? null
        : new Error(`Received response for unknown request id: ${response.id}`);
    }

    const oldestPendingId = this.getOldestPendingRequestId();
    if (oldestPendingId == null) {
      console.error("[MCP Client] Received response without a pending request");
      return null;
    }

    if (this.pendingRequests.size > 1) {
      return new Error("Received response without id while multiple requests were pending");
    }

    return this.resolvePendingRequest(oldestPendingId, response)
      ? null
      : new Error("Failed to resolve oldest pending request");
  }

  private getOldestPendingRequestId(): number | null {
    const firstEntry = this.pendingRequests.keys().next();
    return firstEntry.done ? null : firstEntry.value;
  }

  private settlePendingRequest(requestId: number, handler: (pendingRequest: PendingRequest) => void): boolean {
    const pendingRequest = this.pendingRequests.get(requestId);
    if (!pendingRequest) {
      return false;
    }

    this.pendingRequests.delete(requestId);
    clearTimeout(pendingRequest.timeoutId);
    handler(pendingRequest);
    return true;
  }

  private resolvePendingRequest(requestId: number, response: SocketResponse): boolean {
    return this.settlePendingRequest(requestId, (pendingRequest) => {
      pendingRequest.resolve(response);
    });
  }

  private rejectPendingRequest(requestId: number, error: Error): boolean {
    return this.settlePendingRequest(requestId, (pendingRequest) => {
      pendingRequest.reject(error);
    });
  }

  private rejectAllPending(error: Error): void {
    const entries = Array.from(this.pendingRequests.entries());
    this.pendingRequests.clear();

    for (const [, pendingRequest] of entries) {
      clearTimeout(pendingRequest.timeoutId);
      pendingRequest.reject(error);
    }
  }

  private closeSocket(socket: SocketLike | null, error: Error): void {
    const isCurrentSocket = socket != null && this.socket === socket;

    if (isCurrentSocket) {
      this.socket = null;
      this.connected = false;
      this.connecting = false;
      this.responseBuffer = "";
    }

    if (socket) {
      try {
        socket.destroy();
      } catch {
        console.error("[MCP Client] Failed to destroy socket cleanly");
      }
    }

    if (isCurrentSocket) {
      this.rejectAllPending(error);
    }
  }

  private getTimeout(command: string): number {
    return this.commandTimeouts[command] ?? this.commandTimeouts.default;
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected && this.socket) {
      return;
    }

    let lastError = new Error("Socket not connected");

    for (let attempt = 0; attempt <= this.maxReconnectAttempts; attempt += 1) {
      try {
        if (attempt > 0) {
          console.error(`[MCP Client] Reconnect attempt ${attempt}/${this.maxReconnectAttempts}`);
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }

        await this.connect();
        return;
      } catch (error) {
        lastError = asError(error, "Failed to connect to socket");
      }
    }

    throw lastError;
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.requestQueue;
    let release: () => void = () => undefined;

    this.requestQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous.catch(() => undefined);

    try {
      return await operation();
    } finally {
      release();
    }
  }

  async sendCommand(command: string, payload: Record<string, unknown> = {}): Promise<SocketResponse> {
    return this.runExclusive(async () => {
      await this.ensureConnected();

      return new Promise<SocketResponse>((resolve, reject) => {
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
            this.closeSocket(socket, timeoutError);
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

        socket.write(json, (error) => {
          if (!error) {
            return;
          }

          const writeError = asError(error, `Failed to write command '${command}' to socket`);
          console.error("[MCP Client] Socket write error:", writeError.message);
          this.closeSocket(socket, writeError);
        });
      });
    });
  }

  disconnect(): void {
    const error = new Error("Client disconnected");
    this.closeSocket(this.socket, error);

    if (this.connectWaiters.length > 0) {
      this.drainConnectWaiters(error);
    }
  }

  isConnected(): boolean {
    return this.connected && this.socket !== null;
  }
}

export function parsePort(value: string | undefined, fallback: number): number {
  if (value == null) {
    return fallback;
  }

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return fallback;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : fallback;
}

export const socketClient = new CortexSocketClient(
  (typeof process !== "undefined" && process.env.CORTEX_MCP_HOST) || DEFAULT_HOST,
  parsePort(typeof process !== "undefined" ? process.env.CORTEX_MCP_PORT : undefined, DEFAULT_PORT),
);
