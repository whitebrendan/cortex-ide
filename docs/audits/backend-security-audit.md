# Backend / Tauri Security Audit

## Scope

This audit covers the privileged Tauri backend surface under `src-tauri/`, with emphasis on:

- app-wide security posture in `src-tauri/tauri.conf.json` and `src-tauri/capabilities/default.json`
- privileged Tauri command handlers under `src-tauri/src/**`
- shell/process execution, filesystem access, SSH/remote/tunnel code, and secrets handling
- panic risks from `unwrap` / `expect` in privileged paths

Line references below are taken from the current `main` branch snapshot audited for this task.

## Executive summary

### Highest-severity findings

| Severity | Finding | Primary evidence |
| --- | --- | --- |
| **Critical** | SSH connections authenticate **without any host-key / known_hosts verification**, enabling silent MITM of credentials, remote commands, and file operations | `src-tauri/src/remote/manager.rs:175-295`, `src-tauri/src/ssh_terminal.rs:172-250` |
| **Critical** | Renderer-configured MCP HTTP/SSE servers only validate URL scheme, so the backend can be driven to reach localhost, LAN, and cloud-metadata targets (SSRF / internal network reachability) | `src-tauri/src/context_server/commands.rs:17-37`, `:108-190`; `src-tauri/src/context_server/protocol.rs:301-335`; `src-tauri/src/context_server/transport.rs:257-305` |
| **High** | Remote tunnel creation can expose **arbitrary localhost ports** to the hard-coded external relay without approval, allowlisting, or service ownership checks | `src-tauri/src/remote/tunnel.rs:119-123`, `:216-388`, `:577-592` |
| **High** | Multiple Tauri commands pass raw user-controlled strings into `open::that`, allowing unvalidated file / URI / custom-protocol launches from the privileged backend | `src-tauri/src/app/mod.rs:240-242`, `src-tauri/src/fs/operations.rs:584-597` |

### Positive controls already present

These controls are worth preserving while fixing the high-severity issues:

- The app CSP does **not** allow script `unsafe-eval` / `unsafe-inline`; remote `connect-src` entries are explicit (`src-tauri/tauri.conf.json:14-15`).
- Embedded browser webviews already reject non-loopback URLs to avoid exposing Tauri IPC to remote pages (`src-tauri/src/browser.rs:13-41`).
- Backend filesystem commands generally route through path-validation helpers rather than raw paths (`src-tauri/src/fs/operations.rs:29-35`, `src-tauri/src/fs/security.rs:119-275`).
- Terminal PTY creation filters a list of dangerous environment variables before spawning shells (`src-tauri/src/terminal/state.rs:173-185`).
- Secrets are stored in OS keyrings using `SecretString` / `ZeroizeOnDrop`, not plaintext JSON (`src-tauri/src/settings/secure_store.rs:15-62`, `src-tauri/src/remote/credentials.rs:17-166`).
- Settings and SSH profile files are permission-hardened to `0600` on Unix (`src-tauri/src/settings/storage.rs:67-93`, `src-tauri/src/remote/connection.rs:95-111`).

---

## Finding 1 — Critical: SSH host-key verification is missing in both SSH entry paths

### Why this matters

The backend establishes SSH sessions and immediately performs authentication, remote command execution, and file operations without validating the server host key against `known_hosts` or an equivalent trust store.

That means an on-path attacker can impersonate the target host and:

- capture passwords and key-based authentication attempts
- tamper with remote command output and remote file contents
- silently redirect all privileged remote filesystem and shell operations

Because these flows sit behind trusted Tauri commands, this is a backend trust-boundary failure rather than a UI-only issue.

### Evidence

#### Remote manager path

`src-tauri/src/remote/manager.rs:175-295`

- Opens a TCP socket to `profile.host:profile.port` (`:176-180`)
- Creates `ssh2::Session`, binds the TCP stream, and runs `handshake()` (`:187-195`)
- Proceeds directly to `userauth_password`, `userauth_pubkey_file`, or SSH agent auth (`:197-270`)
- No call to `session.host_key()`, `session.host_key_hash(...)`, `KnownHosts`, or any app-specific trust check appears before authentication

#### SSH PTY path

`src-tauri/src/ssh_terminal.rs:172-250`

- Opens the TCP socket (`:172-179`)
- Runs `Session::new()`, `set_tcp_stream`, and `handshake()` (`:181-188`)
- Immediately authenticates with password / key / agent (`:195-247`)
- Again, there is no host-key verification step before credentials are sent

### Impacted commands / surfaces

- `remote_connect`, `remote_connect_with_password`, `remote_connect_with_passphrase` (`src-tauri/src/remote/commands.rs:13-45`)
- all remote file and command operations hanging off a compromised connection, e.g. `remote_execute_command` (`src-tauri/src/remote/commands.rs:209-218`) and the manager methods it delegates to
- SSH PTY terminal sessions via `ssh_connect` / related commands in `src-tauri/src/ssh_terminal.rs`

### Concrete patch guidance

1. Add a **single shared verifier** used by both `RemoteManager::connect` and `SSHTerminalState::connect`.
2. After `handshake()` and **before any `userauth_*` call**, fetch the presented host key via `session.host_key()` / SHA-256 fingerprint helpers.
3. Compare against:
   - the user’s `~/.ssh/known_hosts`, or
   - an app-managed host trust store with TOFU only on first connect.
4. Fail closed on mismatch. Do **not** continue to authentication when the fingerprint changed unexpectedly.
5. Surface the fingerprint to the UI and require explicit user approval only for first-seen keys.
6. Record approvals / changes in audit logs to support incident review.

A safe end state is: **no remote auth or remote command execution occurs until host identity is verified**.

---

## Finding 2 — Critical: MCP HTTP/SSE context servers can be used as an SSRF / internal-network primitive

### Why this matters

Renderer-configured context servers are intentionally restricted away from stdio, but the remaining HTTP/SSE path only checks that the URL scheme is `http` or `https`.

That leaves the backend willing to connect to:

- `http://127.0.0.1:*`
- `http://localhost:*`
- RFC1918 / LAN hosts
- cloud metadata endpoints
- DNS-rebinding targets
- plaintext remote HTTP endpoints

Because these requests are performed by the Rust backend, they bypass normal browser-origin restrictions and inherit local network reachability.

### Evidence

#### Validation only checks scheme

`src-tauri/src/context_server/commands.rs:17-37`

- `validate_context_server_config()` rejects renderer-provided `stdio` servers (`:19-21`)
- but for `Http | Sse` it only parses the URL and allows any `http` / `https` scheme (`:22-34`)
- there is no localhost/private-IP denial, DNS resolution check, or HTTPS-only rule for non-loopback destinations

#### The validated config is used directly for backend connection

`src-tauri/src/context_server/commands.rs:108-190`

- `mcp_connect()` loads the saved config (`:114-123`)
- then calls `McpClientBuilder::new(config).connect_and_initialize().await` (`:134-135`)

#### HTTP/SSE transport performs raw backend requests

`src-tauri/src/context_server/protocol.rs:301-335`

- `McpClientBuilder::connect()` maps `ServerType::Http | ServerType::Sse` directly to `McpClient::new_http(url, headers)` (`:316-324`)

`src-tauri/src/context_server/transport.rs:257-305`

- `AsyncHttpTransport::new()` builds a plain `reqwest::Client` (`:264-275`)
- `request()` performs a direct POST to the configured endpoint (`:278-305`)
- no SSRF policy, host validation, or protected client configuration is applied

### Existing safer pattern in the repo

The codebase already contains a stronger SSRF defense path used elsewhere:

- `src-tauri/src/ai/mod.rs:612-620` validates URLs with SSRF protection and builds the HTTP client from that policy
- `src-tauri/src/cortex_engine/security/ssrf.rs:217-235` validates protocol, localhost/private ranges, and DNS resolution

### Concrete patch guidance

1. In `validate_context_server_config()`, validate URLs with the existing SSRF helper rather than a scheme-only parse.
2. Reuse `crate::cortex_engine::security::ssrf::validate_url_for_fetch(...)` or `SsrfProtection::with_config(...)` for context-server URLs.
3. Enforce:
   - `https://` for non-loopback hosts
   - `http://` only for loopback / explicitly trusted local development servers
   - denial of private, loopback, link-local, metadata, and rebinding-prone destinations by default
4. Build the `reqwest::Client` through the SSRF-protection path so runtime requests inherit the same restrictions.
5. Add regression tests for `localhost`, `127.0.0.1`, RFC1918 ranges, metadata IPs, and rebinding-sensitive hostnames.

---

## Finding 3 — High: Remote tunnel creation can publish arbitrary localhost services to an external relay

### Why this matters

The tunnel subsystem can expose any local port on `127.0.0.1` to `relay.cortex.dev`. The only current validation is “port != 0”. There is no user approval, no service allowlist, no ownership check, and no restriction to app-launched dev servers.

A compromised renderer, malicious extension, or unsafe future command path could use this to publish sensitive local services such as databases, Docker APIs, admin panels, or cloud credential helpers.

### Evidence

#### Port validation is minimal

`src-tauri/src/remote/tunnel.rs:119-123`

- `validate_local_port()` only rejects `0`
- it does not classify risky ports or verify what process is listening

#### Tunnel relay task bridges public WebSocket traffic to localhost

`src-tauri/src/remote/tunnel.rs:216-332`

- connects to the relay via WebSocket (`:225-248`)
- then opens `127.0.0.1:{local_port}` locally (`:252-267`)
- forwards WebSocket binary frames to the local TCP socket and vice versa (`:269-330`)

#### Tunnel creation automatically targets the hard-coded relay

`src-tauri/src/remote/tunnel.rs:335-388`

- generates a connection code (`:346-349`)
- stores tunnel metadata (`:354-366`)
- immediately spawns the relay bridge task (`:376-384`)

#### Tauri command exposes the feature directly

`src-tauri/src/remote/tunnel.rs:577-592`

- `remote_tunnel_create(local_port, auth_provider, name, state)` directly delegates to `TunnelManager::create(...)`
- no additional approval or authorization gate is applied at the command boundary

### Notes

- `remote_tunnel_connect()` does validate externally supplied tunnel URLs to `wss://` and rejects private/loopback relay hosts (`src-tauri/src/remote/tunnel.rs:68-83`, `:391-479`), which is good.
- The issue is specifically the **egress exposure of arbitrary localhost services** in the create path.

### Concrete patch guidance

1. Put `remote_tunnel_create` behind an explicit **user approval** flow.
2. Require the backend to verify that the target port is:
   - loopback-only, and
   - owned by Cortex or an explicitly approved workspace process.
3. Add a denylist / policy gate for especially sensitive ports and local services.
4. Persist user consent per `(workspace, process, port)` rather than treating every port as equally safe.
5. Emit auditable events containing the local port, resolved process metadata, and relay target.
6. Consider short-lived signed authorization tokens rather than relying solely on an 8-character connection code path.

---

## Finding 4 — High: Raw `open::that(...)` calls allow unvalidated file / URI launches from privileged commands

### Why this matters

Several Tauri commands forward raw user-controlled strings into `open::that(...)` without parsing or allowlisting. On desktop platforms, that can trigger:

- custom URI handlers
- arbitrary local file opens
- unexpected protocol launches
- shell-level escalation of any renderer compromise or malicious extension behavior

This is especially risky for `shell_open`, because terminal or editor content often contains attacker-controlled link text.

### Evidence

#### Generic browser opener

`src-tauri/src/app/mod.rs:240-242`

- `open_in_browser(url: String)` passes the raw string directly to `open::that(&url)`
- no scheme validation is performed

#### Generic file / shell openers

`src-tauri/src/fs/operations.rs:584-597`

- `fs_open_with_default(path: String)` directly calls `open::that(&path)` (`:584-588`)
- `shell_open(path: String)` does the same (`:593-597`)
- unlike the other filesystem commands, these paths do **not** call `validate_path_for_read` / `validate_path_for_write`

### Existing safer pattern in the repo

`src-tauri/src/browser.rs:13-41` already contains a stricter URL validator that:

- limits schemes to `http` / `https`
- rejects non-loopback hosts to prevent exposing Tauri IPC

That validator shows the project already accepts the need for command-side URL validation.

### Concrete patch guidance

1. Split the current behavior into separate commands:
   - `open_external_url`
   - `open_local_path`
2. For URL opens, parse with `url::Url` and allow only explicitly approved schemes (ideally just `http` / `https`; add others only with a strong product reason).
3. For local-path opens, require:
   - a real filesystem path
   - existence checks
   - `fs::security` validation (`validate_path_for_read` at minimum)
4. For `shell_open`, disallow non-file URIs entirely unless there is an explicit user confirmation step.
5. Reuse the `browser::validate_browser_url()` approach or extract a shared validator instead of leaving validation to the OS opener.

---

## Capability / CSP posture

### What is good

- CSP is explicit and avoids script `unsafe-eval` / `unsafe-inline` (`src-tauri/tauri.conf.json:14-15`).
- The debug MCP bridge is loopback-bound (`src-tauri/src/lib.rs:132-137`).

### What is broader than necessary

#### Global Tauri injection is enabled

`src-tauri/tauri.conf.json:12-16`

- `withGlobalTauri: true` increases the blast radius of any renderer compromise or unintended embedded-content exposure.

#### Default capability set is very wide

`src-tauri/capabilities/default.json:6-63`

Highlights:

- `shell:allow-open` (`:33`)
- `shell:allow-spawn` with `args: true` for `git`, `node`, `npm`, `npx`, `cargo`, `python`, `python3` (`:35-45`)
- `fs:default` (`:61`)
- `mcp-bridge:default` (`:62`)

#### Plugins are globally registered

`src-tauri/src/lib.rs:123-137`

- shell, dialog, clipboard, process, OS, notification, and fs plugins are all registered at startup

### Posture assessment

I do **not** rate the broad capability set as one of the top four active high-severity bugs by itself, because the audited frontend code did not surface a direct call path using the shell / fs / process plugins. However, the current posture leaves very little headroom if the renderer, an extension surface, or an embedded loopback page is ever compromised.

### Recommended hardening

- Remove unused plugin permissions instead of carrying `default`-style grants forward.
- Narrow shell / fs / process permissions per window or per feature instead of applying them globally.
- Revisit whether `withGlobalTauri` is still required.
- Keep the debug MCP bridge loopback-only and debug-only.

---

## Filesystem posture review

### Strong points

- Core filesystem commands validate paths before operating (`src-tauri/src/fs/operations.rs:29-35`).
- The validators account for traversal, symlink escape, restricted write targets, and destructive delete cases (`src-tauri/src/fs/security.rs:119-275`).

### Important nuance

`src-tauri/src/fs/security.rs` is a **traversal guard**, not a true sandbox. Its allowed-root model intentionally includes broad developer locations such as `/home`, `/Users`, `/tmp`, and Windows user/development roots. That is reasonable for an IDE, but it means the security boundary depends heavily on renderer integrity and command-level validation.

The unvalidated `open::that(...)` commands are currently the clearest place where the project steps outside that otherwise-consistent model.

---

## Secrets handling review

### Positive findings

#### App/API secrets

- `src-tauri/src/settings/secure_store.rs:15-62` stores API secrets in OS keyrings using `SecretString`
- settings commands operate on existence / mutation state rather than returning plaintext secrets to the UI (`src-tauri/src/settings/commands.rs:367-410`)
- settings hydration only stores presence flags in config (`src-tauri/src/settings/storage.rs:152-156`)

#### SSH credentials

- `src-tauri/src/remote/credentials.rs:17-166` stores passwords/passphrases in the OS keyring
- runtime credentials are wrapped in `SecretString`
- `SecureAuthCredentials` is marked `ZeroizeOnDrop` (`src-tauri/src/remote/credentials.rs:100-107`)
- SSH profile files are persisted without secrets and hardened to `0600` (`src-tauri/src/remote/manager.rs:67-82`, `src-tauri/src/remote/connection.rs:95-111`)

### Remaining concern

Secret storage is materially better than the network-trust posture around it. In other words: the app stores SSH credentials correctly, but the missing host-key verification still allows those credentials to be sent to an attacker-controlled host.

---

## `unwrap` / `expect` review for privileged paths

I did **not** find a current critical/high-severity panic-on-error issue in the audited privileged paths.

Observed cases were low-risk:

- `src-tauri/src/remote/tunnel.rs:25-29` uses `expect(...)` for a compile-time constant regex
- most other `unwrap` / `expect` hits surfaced during the audit were in tests, not live privileged code paths (for example under `src-tauri/src/settings/storage.rs` test sections)

This area still deserves normal hygiene, but it is not one of the top backend security risks compared with the network-trust issues above.

---

## Latent risk to watch: factory executor bypasses the normal path / URL safety helpers, but does not appear wired into execution yet

The factory executor contains code that would be security-sensitive if activated:

- local shell execution via `sh -c` / `cmd /C` (`src-tauri/src/factory/executor/helpers.rs:67-111`)
- raw file reads / writes / deletes with no reuse of `fs::security` (`src-tauri/src/factory/executor/actions.rs:83-197`)
- raw HTTP requests with no SSRF protection reuse (`src-tauri/src/factory/executor/helpers.rs:113-176`, `src-tauri/src/factory/executor/actions.rs:199-253`)

However, the current start command only creates and stores an `ExecutionState`:

- `src-tauri/src/factory/commands.rs:205-256`

I did not find a current command path that invokes `WorkflowExecutor::execute(...)` from that entrypoint, so I am **not** rating this as an active high-severity finding in the current build. It should still be treated as a prerequisite hardening item before factory execution is fully wired up.

Recommended future guardrails for that code:

- reuse `fs::security` for all local path actions
- reuse the existing SSRF protections for HTTP actions
- do not expose arbitrary shell execution without explicit approval / sandbox policy

---

## Remediation priority

1. **Fix SSH host-key verification first** — this protects credentials and the entire remote-development trust model.
2. **Apply SSRF protections to context-server HTTP/SSE connections** — this closes a backend network pivot.
3. **Add explicit authorization and port policy to remote tunnel creation** — this blocks localhost service exfiltration.
4. **Validate all `open::that(...)` inputs** — this reduces the impact of renderer/extension compromise and attacker-controlled links.
5. **Tighten capabilities / plugin exposure** once the active bugs above are fixed.

## Suggested patch order

- Introduce a shared `ssh_trust.rs` helper and use it from both `remote/manager.rs` and `ssh_terminal.rs`.
- Add a shared URL-validation helper backed by `cortex_engine::security::ssrf` and use it from `context_server/commands.rs` / transport creation.
- Add a user-approval + allowlist layer to `remote_tunnel_create`.
- Replace raw `open::that(...)` commands with validated URL/path-specific commands.
- Trim unused capability grants from `default.json` and revisit `withGlobalTauri`.
