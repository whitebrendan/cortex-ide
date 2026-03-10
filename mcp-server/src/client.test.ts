import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { CortexSocketClient, parsePort } from "./client.ts";

type TimeoutHandle = ReturnType<typeof setTimeout>;

type PendingEntry = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: TimeoutHandle;
  command: string;
};

interface FakeSocketOptions {
  onConnect?: (socket: FakeSocket) => void;
  onWrite?: (socket: FakeSocket, data: string, callback?: (error?: Error | null) => void) => void;
}

class FakeSocket extends EventEmitter {
  public readonly writes: string[] = [];
  public destroyed = false;
  public timeoutMs = 0;
  public connectCalls = 0;
  public connectedHost: string | null = null;
  public connectedPort: number | null = null;
  private readonly options: FakeSocketOptions;

  constructor(options: FakeSocketOptions = {}) {
    super();
    this.options = options;
  }

  setTimeout(timeout: number): this {
    this.timeoutMs = timeout;
    return this;
  }

  connect(port: number, host: string): void {
    this.connectCalls += 1;
    this.connectedPort = port;
    this.connectedHost = host;

    if (this.options.onConnect) {
      this.options.onConnect(this);
      return;
    }

    queueMicrotask(() => {
      this.emit("connect");
    });
  }

  write(data: string, callback?: (error?: Error | null) => void): boolean {
    this.writes.push(data);

    if (this.options.onWrite) {
      this.options.onWrite(this, data, callback);
      return true;
    }

    queueMicrotask(() => {
      callback?.(null);
    });
    return true;
  }

  destroy(): void {
    this.destroyed = true;
  }

  emitData(frame: string): void {
    this.emit("data", Buffer.from(frame));
  }

  emitError(error: Error): void {
    this.emit("error", error);
  }

  emitClose(): void {
    this.emit("close");
  }

  emitTimeout(): void {
    this.emit("timeout");
  }
}

function createClient(
  sockets: FakeSocket[],
  options: {
    maxReconnectAttempts?: number;
    commandTimeouts?: Partial<Record<string, number>>;
    connectTimeoutMs?: number;
  } = {},
): CortexSocketClient {
  let nextSocketIndex = 0;

  return new CortexSocketClient("127.0.0.1", 4000, {
    socketFactory: () => {
      const socket = sockets[nextSocketIndex];
      assert.ok(socket, `Unexpected socket creation at index ${nextSocketIndex}`);
      nextSocketIndex += 1;
      return socket;
    },
    connectTimeoutMs: options.connectTimeoutMs ?? 100,
    socketIdleTimeoutMs: 5_000,
    maxReconnectAttempts: options.maxReconnectAttempts ?? 0,
    commandTimeouts: {
      default: 200,
      ...options.commandTimeouts,
    },
  });
}

function getPendingCount(client: CortexSocketClient): number {
  return (client as unknown as { pendingRequests: Map<number, unknown> }).pendingRequests.size;
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("parsePort only accepts fully numeric in-range ports", () => {
  assert.equal(parsePort(undefined, 4000), 4000);
  assert.equal(parsePort("4100", 4000), 4100);
  assert.equal(parsePort(" 4100 ", 4000), 4100);
  assert.equal(parsePort("4000abc", 1234), 1234);
  assert.equal(parsePort("0", 1234), 1234);
  assert.equal(parsePort("65536", 1234), 1234);
  assert.equal(parsePort("-1", 1234), 1234);
  assert.equal(parsePort("", 1234), 1234);
});

test("sendCommand resolves id-less responses when only one request is pending", async () => {
  const socket = new FakeSocket();
  const client = createClient([socket]);

  const responsePromise = client.sendCommand("ping", { probe: true });
  await flushAsyncWork();

  assert.equal(socket.writes.length, 1);
  assert.deepEqual(JSON.parse(socket.writes[0]), {
    id: 1,
    command: "ping",
    payload: { probe: true },
  });

  socket.emitData('{"success":true,"data":{"pong":true}}\n');

  const response = await responsePromise;
  assert.deepEqual(response, {
    success: true,
    data: { pong: true },
  });
  assert.equal(getPendingCount(client), 0);
});

test("sendCommand serializes requests so id-less responses remain unambiguous", async () => {
  const socket = new FakeSocket();
  const client = createClient([socket]);

  const firstResponse = client.sendCommand("ping", { sequence: 1 });
  const secondResponse = client.sendCommand("getDom", { sequence: 2 });

  await flushAsyncWork();
  assert.equal(socket.writes.length, 1);

  socket.emitData('{"success":true,"data":"first"}\n');
  assert.equal((await firstResponse).data, "first");

  await flushAsyncWork();
  assert.equal(socket.writes.length, 2);
  assert.deepEqual(JSON.parse(socket.writes[1]), {
    id: 2,
    command: "getDom",
    payload: { sequence: 2 },
  });

  socket.emitData('{"success":true,"data":"second"}\n');
  assert.equal((await secondResponse).data, "second");
  assert.equal(getPendingCount(client), 0);
});

test("id-less responses are rejected when multiple requests are pending", async () => {
  const socket = new FakeSocket();
  const client = createClient([socket]);
  await client.connect();

  let firstReject: ((error: Error) => void) | undefined;
  let secondReject: ((error: Error) => void) | undefined;

  const firstResponse = new Promise<never>((_resolve, reject) => {
    firstReject = reject;
  });
  const secondResponse = new Promise<never>((_resolve, reject) => {
    secondReject = reject;
  });

  const pendingRequests = (client as unknown as {
    pendingRequests: Map<number, PendingEntry>;
  }).pendingRequests;

  pendingRequests.set(1, {
    resolve: () => undefined,
    reject: (error) => firstReject?.(error),
    timeoutId: setTimeout(() => undefined, 1_000),
    command: "first",
  });
  pendingRequests.set(2, {
    resolve: () => undefined,
    reject: (error) => secondReject?.(error),
    timeoutId: setTimeout(() => undefined, 1_000),
    command: "second",
  });

  socket.emitData('{"success":true,"data":"ambiguous"}\n');

  await Promise.all([
    assert.rejects(firstResponse, /multiple requests were pending/),
    assert.rejects(secondResponse, /multiple requests were pending/),
  ]);
  assert.equal(getPendingCount(client), 0);
  assert.equal(socket.destroyed, true);
});

test("malformed JSON rejects the active request and clears pending state", async () => {
  const socket = new FakeSocket();
  const client = createClient([socket]);

  const responsePromise = client.sendCommand("ping", {});
  await flushAsyncWork();

  socket.emitData('{"success":true\n');

  await assert.rejects(responsePromise, /Failed to parse response/);
  assert.equal(getPendingCount(client), 0);
  assert.equal(socket.destroyed, true);
  assert.equal(client.isConnected(), false);
});

test("invalid response shapes reject the active request and close the socket", async () => {
  const socket = new FakeSocket();
  const client = createClient([socket]);

  const responsePromise = client.sendCommand("ping", {});
  await flushAsyncWork();

  socket.emitData('{"success":"yes"}\n');

  await assert.rejects(responsePromise, /Invalid response shape/);
  assert.equal(getPendingCount(client), 0);
  assert.equal(socket.destroyed, true);
});

test("unexpected responses without pending requests are ignored", async () => {
  const socket = new FakeSocket();
  const client = createClient([socket]);

  await client.connect();
  assert.equal(client.isConnected(), true);

  socket.emitData('{"success":true,"data":"orphan"}\n');
  await flushAsyncWork();

  assert.equal(client.isConnected(), true);
  assert.equal(getPendingCount(client), 0);
});

test("unknown response ids are treated as protocol errors", async () => {
  const socket = new FakeSocket();
  const client = createClient([socket]);

  const responsePromise = client.sendCommand("ping", {});
  await flushAsyncWork();

  socket.emitData('{"id":999,"success":true,"data":"wrong"}\n');

  await assert.rejects(responsePromise, /unknown request id: 999/);
  assert.equal(getPendingCount(client), 0);
  assert.equal(socket.destroyed, true);
});

test("socket write errors reject and clean up pending requests", async () => {
  const socket = new FakeSocket({
    onWrite: (_socket, _data, callback) => {
      queueMicrotask(() => {
        callback?.(new Error("write failed"));
      });
    },
  });
  const client = createClient([socket]);

  await assert.rejects(client.sendCommand("ping", {}), /write failed/);
  assert.equal(getPendingCount(client), 0);
  assert.equal(socket.destroyed, true);
});

test("socket close rejects outstanding requests", async () => {
  const socket = new FakeSocket();
  const client = createClient([socket]);

  const responsePromise = client.sendCommand("ping", {});
  await flushAsyncWork();

  socket.emitClose();

  await assert.rejects(responsePromise, /Connection closed/);
  assert.equal(getPendingCount(client), 0);
  assert.equal(client.isConnected(), false);
});

test("request timeouts reject and remove pending requests", async () => {
  const socket = new FakeSocket();
  const client = createClient([socket], {
    commandTimeouts: { ping: 25, default: 25 },
  });

  await assert.rejects(client.sendCommand("ping", {}), /Request timed out after 25ms/);
  assert.equal(getPendingCount(client), 0);
  assert.equal(socket.destroyed, true);
});

test("sendCommand reconnects after an initial connect error", async () => {
  const failingSocket = new FakeSocket({
    onConnect: (socket) => {
      queueMicrotask(() => {
        socket.emitError(new Error("first connect failed"));
      });
    },
  });
  const healthySocket = new FakeSocket();
  const client = createClient([failingSocket, healthySocket], {
    maxReconnectAttempts: 1,
  });

  const responsePromise = client.sendCommand("ping", {});

  await new Promise((resolve) => setTimeout(resolve, 1_050));
  assert.equal(healthySocket.writes.length, 1);

  healthySocket.emitData('{"success":true,"data":{"reconnected":true}}\n');

  const response = await responsePromise;
  assert.deepEqual(response, {
    success: true,
    data: { reconnected: true },
  });
  assert.equal(failingSocket.destroyed, true);
  assert.equal(healthySocket.destroyed, false);
});
