# Critical Fixes

## MCP server socket client hardening

- **Scope:** `mcp-server/src/client.ts`, `mcp-server/test/client.test.ts`
- **Risk addressed:** The MCP sidecar client previously accepted any `CORTEX_MCP_HOST` value and allowed overlapping requests on a socket flow that is effectively single-flight. That combination could let the sidecar connect to a non-loopback target and could also misassociate responses when concurrent commands were sent.
- **Remediation:**
  - Restrict `CORTEX_MCP_HOST` to loopback-only values (`localhost`, `127.0.0.0/8`, `::1`) and fall back safely to `127.0.0.1` for anything else.
  - Tighten `CORTEX_MCP_PORT` parsing so only digit-only values in the valid TCP range are accepted.
  - Enforce a single in-flight socket request at the client boundary and reject unexpected response IDs instead of resolving whichever request happens to be pending.
  - Keep diagnostics on stderr so stdio JSON-RPC output remains clean.
- **Tests added:** `mcp-server/test/client.test.ts` covers loopback host sanitization, strict port parsing, overlapping request rejection, and unexpected response ID handling.
- **Verification:** `cd /workspace/ide/mcp-server && npm test`; `cd /workspace/ide/mcp-server && npm run build`
