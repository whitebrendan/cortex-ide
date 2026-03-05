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

const CONNECT_TIMEOUT_MS = 10000;
const SOCKET_IDLE_TIMEOUT_MS = 60000;
const MIN_NON_PRIVILEGED_PORT = 1024;
const MAX_PORT = 65535;

function toError(value: unknown, fallbackMessage: string): Error {
  if (value instanceof Error) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return new Error(value);
  }

  return new Error(fallbackMessage);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isValidRequestId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function parseSocketRequest(value: unknown): SocketRequest {
  if (!isPlainObject(value)) {
    throw new Error("Socket request must be an object");
  }

  const id = value.id;
  if (!isValidRequestId(id)) {
    throw new Error("Socket request id must be a positive integer");
  }

  const command = value.command;
  if (typeof command !== "string" || command.trim().length === 0) {
    throw new Error("Socket request command must be a non-empty string");
  }

  const payload = value.payload;
  if (!isPlainObject(payload)) {
    throw new Error("Socket request payload must be an object");
  }

  return {
    id,
    command: command.trim(),
    payload,
  };
}

function parseSocketResponse(value: unknown): SocketResponse {
  if (!isPlainObject(value)) {
    throw new Error("Socket response must be an object");
  }

  const success = value.success;
  if (typeof success !== "boolean") {
    throw new Error("Socket response success must be a boolean");
  }

  const response: SocketResponse = { success };

  if ("id" in value) {
    const id = value.id;
    if (!isValidRequestId(id)) {
      throw new Error("Socket response id must be a positive integer");
    }
    response.id = id;
  }

  if ("error" in value && value.error !== undefined) {
    const errorMessage = value.error;
    if (typeof errorMessage !== "string") {
      throw new Error("Socket response error must be a string");
    }
    response.error = errorMessage;
  }

  if ("data" in value) {
    response.data = value.data;
  }

  return response;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      let connectTimeout: NodeJS.Timeout | null = null;

      const clearConnectTimeout = (): void => {
        if (connectTimeout) {
          clearTimeout(connectTimeout);
          connectTimeout = null;
        }
      };

      const settle = (error: Error | null): void => {
        if (settled) {
          return;
        }

        settled = true;
        clearConnectTimeout();
        this.connecting = false;

        if (error) {
          this.connected = false;
          if (this.socket === socket) {
            this.socket = null;
          }
          reject(error);
          this.drainConnectWaiters(error);
          return;
        }

        this.connected = true;
        resolve();
        this.drainConnectWaiters(null);
      };

      connectTimeout = setTimeout(() => {
        const timeoutError = new Error("Connection timeout");
        console.error(`[MCP Client] ${timeoutError.message}`);
        settle(timeoutError);
        socket.destroy();
      }, CONNECT_TIMEOUT_MS);

      socket.on("connect", () => {
        if (this.socket !== socket) {
          socket.destroy();
          return;
        }

        console.error(`[MCP Client] Connected to Cortex Desktop at ${this.host}:${this.port}`);
        settle(null);
      });

      socket.on("data", (data) => {
        if (this.socket !== socket) {
          return;
        }

        try {
          this.handleData(data);
        } catch (error) {
          const err = toError(error, "Failed to process socket data");
          console.error("[MCP Client] Failed to process socket data:", err.message);
          this.rejectAllPending(err);
        }
      });

      socket.on("timeout", () => {
        if (this.socket !== socket) {
          return;
        }

        console.error("[MCP Client] Socket idle timeout — destroying connection");
        socket.destroy(new Error("Socket idle timeout"));
      });

      socket.on("error", (error) => {
        if (this.socket !== socket) {
          return;
        }

        const err = toError(error, "Socket error");
        console.error("[MCP Client] Socket error:", err.message);
        this.connected = false;
        this.connecting = false;
        this.socket = null;
        this.responseBuffer = "";
        this.rejectAllPending(err);

        settle(err);
      });

      socket.on("close", () => {
        if (this.socket !== socket) {
          return;
        }

        console.error("[MCP Client] Connection closed");
        this.connected = false;
        this.connecting = false;
        this.socket = null;
        this.responseBuffer = "";

        const closeError = new Error("Connection closed");
        this.rejectAllPending(closeError);

        if (!settled) {
          settle(new Error("Connection closed before established"));
        }
      });

      try {
        socket.connect(this.port, this.host);
      } catch (error) {
        const err = toError(error, "Connection failed");
        console.error("[MCP Client] Socket connect failed:", err.message);
        this.connected = false;
        this.connecting = false;
        this.socket = null;
        this.responseBuffer = "";
        this.rejectAllPending(err);
        settle(err);
      }
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

  private takePendingRequest(requestId: number): PendingRequest | null {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return null;
    }

    this.pendingRequests.delete(requestId);
    clearTimeout(pending.timeoutId);
    return pending;
  }

  private resolvePendingRequest(requestId: number, response: SocketResponse): boolean {
    const pending = this.takePendingRequest(requestId);
    if (!pending) {
      return false;
    }

    pending.resolve(response);
    return true;
  }

  private rejectPendingRequest(requestId: number, error: Error): boolean {
    const pending = this.takePendingRequest(requestId);
    if (!pending) {
      return false;
    }

    pending.reject(error);
    return true;
  }

  private resolveFirstPendingRequest(response: SocketResponse): boolean {
    const firstEntry = this.pendingRequests.entries().next();
    if (firstEntry.done) {
      return false;
    }

    return this.resolvePendingRequest(firstEntry.value[0], response);
  }

  private rejectFirstPendingRequest(error: Error): boolean {
    const firstEntry = this.pendingRequests.entries().next();
    if (firstEntry.done) {
      return false;
    }

    return this.rejectPendingRequest(firstEntry.value[0], error);
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
        const response = parseSocketResponse(parsed);

        if (response.id != null) {
          if (!this.resolvePendingRequest(response.id, response)) {
            console.error(`[MCP Client] Received response for unknown request id: ${response.id}`);
          }
          continue;
        }

        if (!this.resolveFirstPendingRequest(response)) {
          console.error("[MCP Client] Received response but no pending requests are waiting");
        }
      } catch (error) {
        const err = toError(error, "Failed to parse socket response");
        console.error("[MCP Client] Failed to parse response:", err.message, "Raw:", jsonStr.substring(0, 200));
        if (!this.rejectFirstPendingRequest(new Error(`Invalid socket response: ${err.message}`))) {
          console.error("[MCP Client] Dropped invalid response because no pending request exists");
        }
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
    return COMMAND_TIMEOUTS[command] ?? COMMAND_TIMEOUTS["default"];
  }

  private async ensureConnectedWithRetry(): Promise<void> {
    if (this.connected && this.socket) {
      return;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxReconnectAttempts; attempt++) {
      try {
        if (attempt > 0) {
          console.error(`[MCP Client] Reconnect attempt ${attempt}/${this.maxReconnectAttempts}`);
          await wait(1000 * attempt);
        }

        await this.connect();
        return;
      } catch (error) {
        lastError = toError(error, "Failed to connect to Cortex Desktop");
      }
    }

    throw lastError ?? new Error("Failed to connect to Cortex Desktop");
  }

  async sendCommand(command: string, payload: Record<string, unknown> = {}): Promise<SocketResponse> {
    const commandName = typeof command === "string" ? command.trim() : "";
    if (!commandName) {
      throw new Error("Command must be a non-empty string");
    }

    if (!isPlainObject(payload)) {
      throw new Error("Payload must be an object");
    }

    await this.ensureConnectedWithRetry();

    return new Promise<SocketResponse>((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error("Socket not connected"));
        return;
      }

      const requestId = this.nextRequestId++;
      const timeout = this.getTimeout(commandName);

      const timeoutId = setTimeout(() => {
        const timeoutError = new Error(`Request timed out after ${timeout}ms`);
        if (this.rejectPendingRequest(requestId, timeoutError)) {
          console.error(`[MCP Client] Request timeout for command: ${commandName} (${timeout}ms)`);
        }
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
        command: commandName,
      });

      let request: SocketRequest;
      try {
        request = parseSocketRequest({ id: requestId, command: commandName, payload });
      } catch (error) {
        const validationError = toError(error, "Invalid socket request");
        this.rejectPendingRequest(requestId, validationError);
        return;
      }

      let json: string;
      try {
        json = JSON.stringify(request) + "\n";
      } catch (error) {
        const serializationError = toError(error, "Failed to serialize socket request");
        this.rejectPendingRequest(requestId, serializationError);
        return;
      }

      try {
        this.socket.write(json, (error) => {
          if (!error) {
            return;
          }

          const writeError = toError(error, `Failed to send command: ${commandName}`);
          this.rejectPendingRequest(requestId, writeError);
        });
      } catch (error) {
        const writeError = toError(error, `Failed to send command: ${commandName}`);
        this.rejectPendingRequest(requestId, writeError);
      }
    });
  }

  disconnect(): void {
    const disconnectError = new Error("Client disconnected");
    this.rejectAllPending(disconnectError);
    this.connected = false;
    this.connecting = false;

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    this.responseBuffer = "";
    this.drainConnectWaiters(disconnectError);
  }

  isConnected(): boolean {
    return this.connected && this.socket !== null;
  }
}

function isAllowedPort(port: number): boolean {
  return Number.isSafeInteger(port) && port >= MIN_NON_PRIVILEGED_PORT && port <= MAX_PORT;
}

function parsePort(value: string | undefined, fallback: number): number {
  const safeFallback = isAllowedPort(fallback) ? fallback : 4000;

  if (typeof value !== "string") {
    return safeFallback;
  }

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return safeFallback;
  }

  const parsed = Number(trimmed);
  return isAllowedPort(parsed) ? parsed : safeFallback;
}

// Singleton instance
export const socketClient = new CortexSocketClient(
  process.env.CORTEX_MCP_HOST || "127.0.0.1",
  parsePort(process.env.CORTEX_MCP_PORT, 4000),
);
