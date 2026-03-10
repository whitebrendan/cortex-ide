import test from "node:test";
import assert from "node:assert/strict";

import { CortexSocketClient, parsePort, sanitizeSocketHost } from "../src/client.ts";

test("sanitizeSocketHost only allows loopback targets", () => {
  assert.equal(sanitizeSocketHost(undefined, "127.0.0.1"), "127.0.0.1");
  assert.equal(sanitizeSocketHost("localhost", "127.0.0.1"), "localhost");
  assert.equal(sanitizeSocketHost("127.0.0.42", "127.0.0.1"), "127.0.0.42");
  assert.equal(sanitizeSocketHost("::1", "127.0.0.1"), "::1");
  assert.equal(sanitizeSocketHost("[::1]", "127.0.0.1"), "::1");
  assert.equal(sanitizeSocketHost("192.168.1.10", "127.0.0.1"), "127.0.0.1");
  assert.equal(sanitizeSocketHost("example.com", "127.0.0.1"), "127.0.0.1");
});

test("parsePort rejects malformed or out-of-range values", () => {
  assert.equal(parsePort(undefined, 4000), 4000);
  assert.equal(parsePort("4001", 4000), 4001);
  assert.equal(parsePort(" 4002 ", 4000), 4002);
  assert.equal(parsePort("4000abc", 4000), 4000);
  assert.equal(parsePort("65536", 4000), 4000);
  assert.equal(parsePort("0", 4000), 4000);
  assert.equal(parsePort("-1", 4000), 4000);
});

test("sendCommand rejects overlapping requests before touching the socket", async () => {
  const client = new CortexSocketClient("127.0.0.1", 4000);
  const fakeSocket = {
    write: (_json: string, callback?: (err?: Error | null) => void) => {
      callback?.(null);
      return true;
    },
    destroy: () => undefined,
  };

  Object.assign(client as unknown as Record<string, unknown>, {
    connected: true,
    socket: fakeSocket,
  });

  const firstRequest = client.sendCommand("ping", {});
  await assert.rejects(
    client.sendCommand("getDom", {}),
    /Another request is already in progress: ping/,
  );

  const handleData = (client as unknown as { handleData(data: Buffer): void }).handleData.bind(client);
  handleData(Buffer.from('{"id":1,"success":true,"data":{"ok":true}}\n'));

  const response = await firstRequest;
  assert.equal(response.success, true);
  assert.deepEqual(response.data, { ok: true });
});

test("unexpected response ids fail the active request instead of cross-resolving", async () => {
  const client = new CortexSocketClient("127.0.0.1", 4000);
  const fakeSocket = {
    write: (_json: string, callback?: (err?: Error | null) => void) => {
      callback?.(null);
      return true;
    },
    destroy: () => undefined,
  };

  Object.assign(client as unknown as Record<string, unknown>, {
    connected: true,
    socket: fakeSocket,
  });

  const request = client.sendCommand("ping", {});
  const handleData = (client as unknown as { handleData(data: Buffer): void }).handleData.bind(client);
  handleData(Buffer.from('{"id":999,"success":true}\n'));

  await assert.rejects(request, /Received response for unexpected request id 999/);
});
