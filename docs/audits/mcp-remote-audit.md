# MCP / Remote Surface Audit

## Scope

This audit reviews the MCP and remote-facing surfaces implemented in:

- `mcp-server/src/index.ts`
- `mcp-server/src/client.ts`
- `src-tauri/src/mcp/**`
- `src-tauri/src/context_server/**`
- `src-tauri/src/remote/**`
- `src-tauri/src/app/mod.rs`

The focus is on trust boundaries, stdio/JSON-RPC behavior, path handling, socket usage, SSH/tunnel exposure, and logging hygiene (`no console.log` / no stdout pollution).

## Trust boundaries

1. **External MCP client → Node MCP server over stdio JSON-RPC**
   - `mcp-server/src/index.ts:13-16`, `mcp-server/src/index.ts:841-847`
2. **Node MCP server → Tauri app over local TCP socket**
   - `mcp-server/src/client.ts:47-50`, `mcp-server/src/client.ts:206-253`
   - `src-tauri/src/app/mod.rs:436-438`
3. **Tauri backend → frontend/webview via app events and `window.eval`**
   - `src-tauri/src/mcp/tools.rs:449-574`, `src-tauri/src/mcp/tools.rs:710-848`
4. **Tauri backend → external context servers over HTTP/SSE**
   - `src-tauri/src/context_server/commands.rs:17-37`
   - `src-tauri/src/context_server/protocol.rs:301-336`
5. **Tauri backend → remote SSH hosts / public relay**
   - `src-tauri/src/remote/manager.rs:154-331`
   - `src-tauri/src/remote/tunnel.rs:216-333`, `src-tauri/src/remote/tunnel.rs:335-480`

## Executive summary

The reviewed code already contains several meaningful controls: renderer-configured stdio context servers are blocked, stdio framing code enforces a 10 MB message cap, SSH credentials are stored in the OS keyring, tunnel URLs require `wss://` and reject private/loopback hosts, and the reviewed MCP code avoids `console.log`/`println!` style stdout pollution.

The highest-risk issues are:

1. **The Tauri MCP automation socket is a privileged local control plane with no authentication** when enabled, and it exposes DOM access, JavaScript execution, OS input simulation, window management, and localStorage access.
2. **The Node socket client and Rust socket server disagree on request/response correlation**: the client sends IDs, but the Rust socket protocol ignores them, so concurrent or malformed responses can be misattributed.
3. **The Node workspace tools are powerful and locally destructive by design** (`read_file`, `write_file`, `run_terminal_command`) and include avoidable hardening gaps: string-prefix path checks without symlink canonicalization, `shell: true`, and unbounded output buffering.
4. **Remote HTTP, SSH, and tunnel features intentionally cross strong trust boundaries** and need tighter policy, clearer scoping, and better transport hardening.

## Controls already present

- **Workspace path prefix guard in Node MCP server**: `resolveSafePath()` anchors requests under `WORKSPACE_ROOT` and rejects obvious traversal attempts (`mcp-server/src/index.ts:62-78`).
- **Renderer-configured stdio context servers are blocked**: only `http`/`https` context servers are accepted from the frontend (`src-tauri/src/context_server/commands.rs:17-37`, tests at `src-tauri/src/context_server/commands.rs:521-579`).
- **Content-Length framing includes a hard size cap** for the Rust stdio transports (`src-tauri/src/context_server/transport.rs:13-15`, `src-tauri/src/context_server/transport.rs:121-128`, `src-tauri/src/context_server/transport.rs:229-236`).
- **Tunnel URLs are validated** to require `wss://` and reject loopback/private hosts (`src-tauri/src/remote/tunnel.rs:68-83`, `src-tauri/src/remote/tunnel.rs:86-117`).
- **SSH secrets are kept in the keyring** and profile files are stored separately with restrictive permissions (`src-tauri/src/remote/credentials.rs:16-61`, `src-tauri/src/remote/manager.rs:66-90`).
- **Stdout hygiene is mostly respected**: the reviewed Node MCP files use `console.error`, not `console.log`, and the Rust files use `tracing` rather than `println!`.

## Findings

### 1. High — Unauthenticated local TCP MCP socket exposes a privileged automation surface

**Evidence**

- The app wires the MCP socket server to loopback TCP on port 4000: `src-tauri/src/app/mod.rs:436-438`.
- The socket layer supports TCP listeners with no authentication or handshake: `src-tauri/src/mcp/socket_server.rs:178-186`, `src-tauri/src/mcp/socket_server.rs:266-283`, `src-tauri/src/mcp/socket_server.rs:300-357`.
- The server is auto-started in debug builds: `src-tauri/src/app/mod.rs:534-544`.
- `mcp_get_config` advertises high-privilege tools such as `executeJs`, `manageWindow`, `textInput`, `mouseMovement`, `manageLocalStorage`, and `sendTextToElement`: `src-tauri/src/mcp/commands.rs:129-171`.
- The command dispatcher exposes those operations directly: `src-tauri/src/mcp/tools.rs:132-160`, with concrete implementations at `src-tauri/src/mcp/tools.rs:517-626`, `src-tauri/src/mcp/tools.rs:628-708`, `src-tauri/src/mcp/tools.rs:710-848`.

**Why it matters**

Any local process that can reach `127.0.0.1:4000` can potentially drive the Cortex UI, execute JavaScript in the webview, simulate keyboard/mouse input at the OS level, manipulate window state, and read or mutate localStorage. Loopback binding is better than a public bind, but it is still a strong trust boundary: it trusts every local process equally.

**Proposed remediation**

- Default to IPC / local socket transport instead of TCP where practical.
- If TCP remains available, require an ephemeral auth token or capability secret before honoring commands.
- Consider making the most dangerous commands (`executeJs`, input simulation, localStorage mutation) opt-in or debug-only.
- Add connection telemetry and explicit operator-facing warnings when the automation socket is active.

### 2. High — Request/response correlation is broken between the Node client and the Rust socket server

**Evidence**

- The Node client sends request IDs and expects optional response IDs: `mcp-server/src/client.ts:7-18`, `mcp-server/src/client.ts:232-253`.
- The Node client resolves by ID when possible, but otherwise falls back to “first pending request”: `mcp-server/src/client.ts:163-179`.
- The Rust socket protocol does not carry request IDs at all; the request type is just `{ command, payload }` and the response type is `{ success, data, error }`: `src-tauri/src/mcp/socket_server.rs:31-46`.
- Responses are serialized without any ID field: `src-tauri/src/mcp/socket_server.rs:344-348`.

**Why it matters**

This makes concurrent requests unreliable and weakens integrity of the local RPC channel. A delayed, malformed, or injected response can satisfy the wrong pending request. The current fallback behavior is especially risky because it silently accepts an unmatched response instead of failing closed.

**Proposed remediation**

- Add an explicit `id` field to the Rust socket request/response types and echo it back on every response.
- Remove the Node client’s “first pending request” fallback and reject unmatched responses.
- Add tests for concurrent in-flight commands and deliberate out-of-order responses.

### 3. High — The Node workspace tools expose a broad local filesystem/shell surface and rely on weak path/shell hardening

**Evidence**

- `WORKSPACE_ROOT` is derived from env or `cwd`: `mcp-server/src/index.ts:62-63`.
- `resolveSafePath()` performs only `path.resolve()` + string-prefix checks: `mcp-server/src/index.ts:71-78`.
- Workspace file operations use that guard:
  - `read_file`: `mcp-server/src/index.ts:534-564`
  - `write_file`: `mcp-server/src/index.ts:566-590`
  - `list_directory`: `mcp-server/src/index.ts:592-627`
- `search_code` builds `new RegExp(args.pattern)` and scans matching files in-process: `mcp-server/src/index.ts:629-684`.
- `run_terminal_command` executes with `shell: true`: `mcp-server/src/index.ts:686-707`.
- `run_terminal_command` accumulates full stdout/stderr in memory and only truncates after the process exits: `mcp-server/src/index.ts:709-731`.

**Why it matters**

This MCP server is intentionally powerful, but several details widen the blast radius:

- The path guard does **not** canonicalize symlinks. A path that stays under `WORKSPACE_ROOT` textually but traverses a symlink to somewhere else would bypass the intended boundary.
- `shell: true` expands the risk surface for command execution and makes argv safety assumptions brittle.
- `search_code` allows user-supplied regexes and reads files in-process with no complexity budget or cancellation.
- Output truncation happens after full buffering, so a noisy command can still consume significant memory before the truncation logic runs.

**Proposed remediation**

- Replace string-prefix path checks with canonicalized/realpath-based validation and optionally disallow symlink traversal outside the workspace.
- Avoid `shell: true` unless it is explicitly required; prefer direct process execution with argv.
- Bound command output while streaming, not only after collection.
- For code search, prefer a constrained subprocess such as `rg` with explicit limits, or add regex complexity / file-size guards.
- Clarify tool descriptions so “absolute path” support only means paths that still resolve inside the workspace root.

### 4. Medium — Framing and size limits are inconsistent: stdio paths are capped, local TCP paths are not

**Evidence**

- The Rust stdio transports enforce `MAX_MESSAGE_SIZE = 10 * 1024 * 1024`: `src-tauri/src/context_server/transport.rs:13-15`, enforced at `src-tauri/src/context_server/transport.rs:121-128` and `src-tauri/src/context_server/transport.rs:229-236`.
- The Node socket client appends incoming bytes to an unbounded `responseBuffer` until it sees `\n`: `mcp-server/src/client.ts:153-159`.
- The Rust socket server reads one newline-delimited line at a time with `read_line()` and has no explicit line length cap: `src-tauri/src/mcp/socket_server.rs:309-339`.

**Why it matters**

A malicious or buggy peer can force memory growth by withholding the terminating newline or by sending very large single-line payloads. This is a pure transport-hardening issue: the code already has a better pattern for stdio MCP framing, but the local TCP automation protocol does not apply the same discipline.

**Proposed remediation**

- Add explicit maximum frame/line sizes on both the Rust socket server and the Node client.
- Prefer a framed protocol with declared lengths instead of newline-delimited JSON.
- Fail closed on oversized frames and log only bounded metadata.

### 5. Medium — DOM/JS request handling inside the Tauri MCP tools uses app-global event names with no correlation ID

**Evidence**

- `handle_get_dom()` installs an app-wide one-time listener on `"mcp:get-dom-response"` and emits `"mcp:get-dom"` to the target window: `src-tauri/src/mcp/tools.rs:462-479`, then waits up to 5 seconds: `src-tauri/src/mcp/tools.rs:482-512`.
- `handle_execute_js()` does the same with `"mcp:execute-js-response"`: `src-tauri/src/mcp/tools.rs:530-543`, `src-tauri/src/mcp/tools.rs:545-571`.

**Why it matters**

These flows rely on shared app-level event names and do not attach a request ID or caller identity. If multiple requests are active, or if other renderer/plugin code can emit the same response events, the wrong response can satisfy the wrong caller. This is an internal trust-boundary problem between the backend and frontend/event bus.

**Proposed remediation**

- Add per-request correlation IDs to the emitted payload and require the response event to echo them.
- Scope listeners more narrowly where possible.
- Treat renderer-originated responses as untrusted until they match the expected request metadata.

### 6. Medium — Context-server HTTP/SSE connections are partially hardened, but still allow broad outbound reach and ignore configured timeouts

**Evidence**

- Renderer-configured stdio servers are explicitly rejected; only `http`/`https` URLs are accepted: `src-tauri/src/context_server/commands.rs:17-37`.
- The config still allows arbitrary `headers`, `working_directory`, and `timeout_ms`: `src-tauri/src/context_server/types.rs:18-39`.
- `McpClientBuilder` treats `ServerType::Http | ServerType::Sse` identically and calls `new_http()`: `src-tauri/src/context_server/protocol.rs:316-325`.
- `AsyncHttpTransport` uses a fixed 60-second timeout and forwards all configured headers: `src-tauri/src/context_server/transport.rs:265-287`, `src-tauri/src/context_server/transport.rs:289-304`.

**Why it matters**

The good news is that the renderer cannot ask the backend to spawn arbitrary stdio processes. The remaining issue is outbound network trust: a configured server can point to arbitrary `http(s)` destinations, including private infrastructure, localhost-adjacent services, or cloud metadata endpoints, because only scheme validation is applied. The `timeout_ms` field is also ignored, and `Sse` is currently treated as plain HTTP rather than a distinct transport.

**Proposed remediation**

- Add SSRF-style host filtering or an allowlist policy for context server URLs, especially for private, loopback, and link-local ranges.
- Honor `timeout_ms` from configuration.
- Either implement real SSE transport semantics or reject `ServerType::Sse` until supported.
- Consider restricting or redacting sensitive headers in UI-configured server definitions.

### 7. Medium — The MCP bridge uses a canonicalized script path, but still trusts `node` on PATH and does not consume child stderr

**Evidence**

- The bridge resolves `mcp-server/dist/index.js` via canonicalized path lookup: `src-tauri/src/mcp/bridge.rs:96-112`.
- It launches that script with `AsyncStdioTransport::new("node", ...)`: `src-tauri/src/mcp/bridge.rs:37-59`.
- The async stdio transport pipes `stdin`, `stdout`, and `stderr`, but only captures stdin/stdout handles: `src-tauri/src/context_server/transport.rs:156-181`.
- The bridge request path does validate JSON-RPC version and response ID once the process is running: `src-tauri/src/mcp/bridge.rs:142-200`.

**Why it matters**

The script path is well constrained, which is good. The remaining trust issues are process-level:

- The runtime still depends on whatever `node` binary resolves from PATH.
- Child stderr is piped but not drained, so a noisy child can block itself or at least make diagnosis harder.

**Proposed remediation**

- Prefer a known/bundled Node runtime or resolve a trusted path explicitly.
- Drain child stderr asynchronously into bounded/redacted tracing output.
- Add health checks for child process exit and clearer operator-facing error reporting.

### 8. High — Remote SSH operations are not bounded to a remote workspace, and some recursive operations shell out

**Evidence**

- SSH credentials are loaded from the keyring before connection: `src-tauri/src/remote/manager.rs:163-169`, with storage implemented in `src-tauri/src/remote/credentials.rs:16-61`.
- The connection layer authenticates to arbitrary `host:port` pairs from the profile: `src-tauri/src/remote/manager.rs:175-195`, `src-tauri/src/remote/manager.rs:197-269`.
- Remote filesystem operations mostly just expand `~/` and then act on the resulting path:
  - directory listing: `src-tauri/src/remote/manager.rs:489-550`
  - file read: `src-tauri/src/remote/manager.rs:613-631`
  - file write: `src-tauri/src/remote/manager.rs:709-720`
  - stat: `src-tauri/src/remote/manager.rs:979-1004`
- Recursive delete shells out to `rm -rf`: `src-tauri/src/remote/manager.rs:802-809`.
- Recursive directory creation shells out to `mkdir -p`: `src-tauri/src/remote/manager.rs:849-855`.
- Remote command execution sends raw shell text, optionally prefixed with `cd 'dir' &&`: `src-tauri/src/remote/manager.rs:936-950`.
- The Tauri commands expose password/passphrase-based connection and remote command execution directly: `src-tauri/src/remote/commands.rs:25-45`, `src-tauri/src/remote/commands.rs:208-219`.

**Why it matters**

This feature is intentionally powerful, but the current design does not distinguish “operate inside the selected remote workspace” from “act anywhere on the remote host.” Recursive destructive operations rely on shell commands rather than SFTP walking, which increases dependence on quoting correctness and shell semantics.

**Proposed remediation**

- Introduce an explicit remote-root policy for file operations when a workspace root is known.
- Reserve raw shell execution for clearly labeled “full remote shell” actions.
- Replace recursive `rm -rf` / `mkdir -p` shell-outs with direct recursive SFTP logic where feasible.
- Add higher-fidelity audit logging for destructive remote actions without logging secrets.

### 9. Medium — Tunnel support correctly restricts user-supplied tunnel URLs, but it still exposes localhost services through a public relay and has unclear auth-token semantics

**Evidence**

- User-supplied tunnel URLs must be `wss://` and must not target private/loopback hosts: `src-tauri/src/remote/tunnel.rs:68-83`, `src-tauri/src/remote/tunnel.rs:86-117`.
- Built tunnels use the public relay domain `relay.cortex.dev`: `src-tauri/src/remote/tunnel.rs:198-200`, and public URLs are built at `src-tauri/src/remote/tunnel.rs:357`.
- The relay task connects the relay to `127.0.0.1:{local_port}` on the local machine: `src-tauri/src/remote/tunnel.rs:225-253`, then forwards bytes both ways at `src-tauri/src/remote/tunnel.rs:273-331`.
- `store_auth_token()` stores only a provider tag (`"github"` or `"microsoft"`) in the keyring, not a real bearer token: `src-tauri/src/remote/tunnel.rs:171-181`.
- `remote_tunnel_connect()` will connect to any validated public `wss://` URL and keep the websocket open: `src-tauri/src/remote/tunnel.rs:391-480`.

**Why it matters**

This feature intentionally creates public reachability into local services, which is a high-trust action. The code does apply meaningful URL validation, but the relay model and auth assumptions need to be explicit. The current `store_auth_token()` name suggests a secret is being stored, while the implementation only persists a provider label.

**Proposed remediation**

- Make tunnel creation an explicitly high-risk, user-confirmed action with clear warnings about exposing localhost services.
- Clarify the authentication model in code and rename `store_auth_token()` if no secret token is actually stored.
- Document relay trust assumptions and consider stronger domain/certificate pinning or signed session material.

### 10. Low — Logging hygiene is mostly correct, but stderr logs still need redaction discipline

**Evidence**

- The Node MCP server uses `StdioServerTransport` for stdio JSON-RPC and connects it in `main()`: `mcp-server/src/index.ts:13-16`, `mcp-server/src/index.ts:841-847`.
- Operational logs go to stderr via `console.error`, not `console.log`: `mcp-server/src/client.ts:88`, `mcp-server/src/client.ts:98`, `mcp-server/src/client.ts:106`, `mcp-server/src/client.ts:120`, `mcp-server/src/client.ts:212`, `mcp-server/src/client.ts:238`, `mcp-server/src/index.ts:849-865`.
- One parse-failure path logs a raw response fragment: `mcp-server/src/client.ts:181`.
- The reviewed Rust surfaces use `tracing` and do not rely on stdout-oriented print macros.

**Why it matters**

The core constraint is correct: stdout must remain clean for JSON-RPC/stdio traffic. The remaining issue is that stderr/tracing can still leak sensitive payload fragments if raw protocol content or secrets are logged during failures.

**Proposed remediation**

- Preserve the current “no stdout logging” rule as a hard requirement.
- Redact or omit raw payload fragments from parse failures and transport errors.
- Keep command names/statuses in logs, but avoid logging request payloads or credential-bearing headers.

## Prioritized remediation roadmap

### Immediate

1. Add authentication and request IDs to the local MCP automation socket.
2. Replace newline-delimited ad hoc framing with bounded, explicit framing on the Node ↔ Tauri socket path.
3. Remove `shell: true` from `run_terminal_command` where possible, and harden workspace path validation with canonicalization / symlink checks.
4. Add explicit size limits to local TCP message buffering on both sides.

### Short term

5. Add correlation IDs to backend ↔ frontend event-based DOM/JS flows.
6. Add SSRF/private-address filtering and real timeout handling for context-server HTTP/SSE connections.
7. Drain child stderr for stdio-spawned MCP processes and resolve a trusted `node` binary path.
8. Split remote SSH “workspace-bounded file ops” from “full shell” capabilities.

### Follow-up

9. Replace recursive shell-based SSH operations with direct recursive SFTP logic.
10. Clarify tunnel auth semantics and add stronger operator-facing warnings for public relay exposure.
11. Add targeted tests for concurrent MCP requests, malformed frames, oversized frames, and event-response misrouting.
