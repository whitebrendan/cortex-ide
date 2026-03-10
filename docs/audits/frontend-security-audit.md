# Frontend Security Audit

## Scope

This audit reviews renderer-side security boundaries in the SolidJS/Tauri frontend, with emphasis on:

- direct `invoke()` / `listen()` usage outside the safer SDK-style wrappers
- deep-link handling in `src/AppCore.tsx` and `src/utils/deepLink.ts`
- extension command / notification / permission event handling
- AI context bridges and renderer event buses
- risky `fetch` wrappers under `src/api/**`
- adjacent frontend integration points that expand the renderer attack surface

Primary files reviewed:

- `src/AppCore.tsx`
- `src/utils/deepLink.ts`
- `src/context/CommandContext.tsx`
- `src/context/ExtensionsContext.tsx`
- `src/context/SDKContext.tsx`
- `src/context/extensions/PluginAPIBridge.tsx`
- `src/components/extensions/PluginDialogs.tsx`
- `src/components/extensions/ExtensionHostBridge.tsx`
- `src/context/NodeExtensionHostContext.tsx`
- `src/components/ai/SlashCommandMenu.tsx`
- `src/utils/mcp-listeners.ts`
- `src/api/admin.ts`
- `src/api/agents.ts`
- `src/api/share.ts`

Boundary/origin references reviewed alongside the frontend:

- `src-tauri/src/deep_link.rs`
- `src-tauri/src/extensions/api/window.rs`
- `src-tauri/src/extensions/permissions.rs`
- `src-tauri/src/extensions/contributions.rs`

---

## Executive Summary

The frontend already contains some good defensive primitives (`safeInvoke`, `useTauriListen`, disabled MCP JS execution, sanitized markdown rendering), but the most privileged integration points still bypass those controls.

The main theme is **trusting backend/emitter payloads too early**:

1. deep-link events directly trigger file/workspace actions without renderer-side validation,
2. extension and plugin events are handled in multiple places with weak payload assumptions,
3. AI context is exposed through a global `window` event bus,
4. the MCP DOM bridge still allows broad renderer data extraction,
5. `src/api/**` wrappers interpolate path parameters raw and lack a single hardened fetch policy.

### Findings Overview

| ID | Severity | Title |
|---|---|---|
| FSEC-01 | High | Deep-link actions cross a privilege boundary without renderer-side validation |
| FSEC-02 | High | Extension command execution bypasses reviewed wrappers and unified trust checks |
| FSEC-03 | High | AI context bridge exposes selection and workspace data over global window events |
| FSEC-04 | High | MCP DOM bridge still enables renderer data exfiltration |
| FSEC-05 | Medium | Plugin/extension event ingress is fragmented and trusts payloads without runtime schemas |
| FSEC-06 | Medium | Async `listen()` setup patterns can leak privileged handlers across unmount/HMR |
| FSEC-07 | Medium | `SDKContext` re-exports raw `invoke`, making wrapper bypass easy |
| FSEC-08 | Medium | `src/api/**` wrappers treat path segments and network behavior unsafely |

---

## Existing Positive Controls

These controls already exist and should be reused instead of bypassed:

- `src/hooks/useTauriListen.ts:18-50` safely handles async Tauri listener setup and cleanup.
- `src/sdk/safe-invoke.ts:23-52` adds timeout handling and optional fallbacks around IPC calls.
- `src/utils/mcp-listeners.ts:49-64` fully disables `mcp:execute-js`, removing the highest-risk renderer RCE path.
- `src/components/ui/SafeHTML.tsx:10-68` sanitizes markdown-rendered HTML.
- `src/components/share/SharedMessageList.tsx:98-152` renders shared message/tool output as text, not raw HTML.

These controls are helpful, but they are not consistently applied to the highest-risk event and command surfaces.

---

## Findings

### FSEC-01 — Deep-link actions cross a privilege boundary without renderer-side validation
**Severity:** High

**Evidence**
- `src/AppCore.tsx:244-283` listens for `deep:link` and immediately calls `openFile`, `openWorkspace`, `addFolder`, or dispatches follow-on UI events.
- `src/utils/deepLink.ts:61-110` executes privileged navigation/file actions based purely on the incoming `DeepLinkAction` shape.
- `src-tauri/src/deep_link.rs:43-67` parses raw URLs into `DeepLinkAction` values.
- `src-tauri/src/deep_link.rs:292` emits the parsed action into the frontend via `deep:link`.

**What is happening**
The frontend treats `listen<DeepLinkAction>("deep:link", ...)` as if it were runtime validation. It is not. The generic only helps TypeScript; it does not verify that the payload actually matches the expected schema.

Once the event arrives, the renderer immediately:
- opens files,
- opens or switches workspaces,
- adds folders,
- dispatches `editor:goto-line`, `diff:open`, and `settings:open-tab` events.

**Why this matters**
This is a privilege boundary: backend parsing/output, deep-link handling, and any event emitter with access to the Tauri bus are upstream of the renderer. If the upstream parser is buggy, the source is compromised, or another backend component emits an unexpected payload, the renderer performs privileged actions without a second validation step.

**Impact**
- arbitrary workspace switching or folder addition from malformed or spoofed payloads
- opening attacker-controlled file paths or diff targets
- confusing UI state changes triggered by unverified event payloads
- loss of a clean audit trail for which deep-link actions were actually approved by renderer policy

**Remediation proposal**
1. Add a dedicated deep-link ingress wrapper, e.g. `src/sdk/deep-links.ts`, that performs runtime validation with a schema library or explicit guards before any UI action occurs.
2. Move renderer-side action dispatch out of `AppCore.tsx` and into that wrapper, with explicit allowlisting of action types.
3. Re-check path safety in the renderer for `OpenFolder` / `AddFolder` flows and require workspace-trust confirmation before switching/adding roots.
4. Reject malformed payloads early and emit structured telemetry rather than falling through to best-effort UI actions.

---

### FSEC-02 — Extension command execution bypasses reviewed wrappers and unified trust checks
**Severity:** High

**Evidence**
- `src/context/CommandContext.tsx:70-95` directly invokes `vscode_execute_builtin_command` and `vscode_execute_command` for extension commands.
- `src/context/CommandContext.tsx:97-128` loads extension commands and wires them to more direct `invoke()` calls.
- `src/context/ExtensionsContext.tsx:676-683` directly calls `invoke("execute_extension_command", { command, args })`.
- `src/context/NodeExtensionHostContext.tsx:227-233` exposes a generic `call_extension_api()` bridge.
- `src-tauri/src/extensions/contributions.rs:178-205` defines backend extension command execution.

**What is happening**
Multiple frontend surfaces can trigger extension commands or extension APIs directly, and they do so without going through a single reviewed wrapper that can enforce policy, telemetry, validation, or trust checks.

**Why this matters**
Extension commands are a privilege boundary because the command identifier often comes from extension manifests or extension-host state rather than first-party UI code alone. Spreading direct command execution across multiple contexts makes it difficult to answer basic security questions:

- Which commands are allowed from which UI surfaces?
- Are command identifiers validated against a registered manifest?
- Is workspace trust checked before executing commands that touch the filesystem/process/network?
- Is there one place to log and rate-limit command invocation?

**Impact**
- harder to prevent command spoofing or accidental execution of unintended commands
- duplicated execution logic makes it easy for future code to bypass safety checks
- auditability and incident response are weakened because there is no single command broker

**Remediation proposal**
1. Introduce a single typed extension-command broker under `src/sdk/extension-host-proxy.ts` (or a new `src/sdk/extensions.ts`).
2. Route all extension command execution through that broker.
3. Validate command IDs against the currently registered manifest contributions before invoking backend commands.
4. Attach command provenance (`sourceExtension`, UI surface, workspace trust state) to every execution call.
5. Remove raw extension command `invoke()` usage from `CommandContext` and `ExtensionsContext` after the broker lands.

---

### FSEC-03 — AI context bridge exposes selection and workspace data over global window events
**Severity:** High

**Evidence**
- `src/AppCore.tsx:288-345` registers `ai:request-selection`, `ai:request-workspace`, and `ai:request-terminal` listeners on `window`, then dispatches global response events.
- `src/components/ai/SlashCommandMenu.tsx:255-272` requests selection by dispatching `ai:request-selection` and resolves the first `ai:selection-response` it sees.
- `src/components/ai/SlashCommandMenu.tsx:307-323` does the same for workspace data via `ai:request-workspace` / `ai:workspace-response`.

**What is happening**
Sensitive editor/workspace context is being bridged through a page-global custom-event bus. Requests and responses are not correlated with request IDs, origins, or capability tokens.

**Why this matters**
Any script running in the same renderer context can:
- dispatch `ai:request-selection` or `ai:request-workspace`,
- observe or spoof the response events,
- race the legitimate handler with a fake response,
- harvest editor selections, file paths, and workspace roots.

Even if the current codebase is trusted, this pattern becomes high-risk once extension UI, webview-style content, or other injected renderer code can coexist in the same window.

**Impact**
- data exposure of current selection, active file path, workspace folder list, and active root
- spoofed or stale context being injected into AI flows
- impossible to attribute who requested sensitive context

**Remediation proposal**
1. Replace the global `window` event bus with a scoped context API or explicit callback plumbing between the slash-command UI and editor/workspace providers.
2. If an event-based bridge must remain, add per-request IDs and only accept matching response IDs.
3. Gate path-returning responses behind workspace-trust checks and minimize returned data (e.g. avoid returning full folder lists when a single root is sufficient).
4. Add a small first-party broker module so this bridge is centralized and testable instead of living inside `AppCore.tsx`.

---

### FSEC-04 — MCP DOM bridge still enables renderer data exfiltration
**Severity:** High

**Evidence**
- `src/AppCore.tsx:164-175` lazily initializes MCP listeners for the renderer.
- `src/utils/mcp-listeners.ts:49-64` disables `mcp:execute-js` entirely.
- `src/utils/mcp-listeners.ts:69-96` still answers `mcp:get-dom` by returning either `document.documentElement.outerHTML` or a selected node’s `outerHTML`.

**What is happening**
The most dangerous renderer code-execution path is disabled, but the renderer still exposes a broad DOM extraction channel over MCP events.

**Why this matters**
The DOM often contains:
- current file names and paths,
- chat transcripts,
- inline secrets copied into the UI,
- extension state,
- notification content,
- form inputs or transient tokens.

Returning the full document HTML is effectively a data-exfiltration primitive. Disabling JS execution reduces integrity risk, but the confidentiality risk remains significant.

**Impact**
- full renderer-state disclosure to a remote/control-plane surface
- accidental leakage of sensitive UI content that was never intended for MCP consumers
- easier abuse chaining with CSS-selector discovery and repeated polling

**Remediation proposal**
1. Disable `mcp:get-dom` outside explicit debug/dev modes or behind a user-controlled trust setting.
2. Replace raw HTML output with a reduced, redacted representation (for example: accessibility tree, selected subtree allowlist, or a size-limited sanitized summary).
3. Add hard caps on selector scope and response size.
4. Redact known sensitive containers (chat bodies, API key settings, credential dialogs, secret inputs).
5. Require an explicit “frontend automation enabled” state before these listeners are registered.

---

### FSEC-05 — Plugin/extension event ingress is fragmented and trusts payloads without runtime schemas
**Severity:** Medium

**Evidence**
- `src/AppCore.tsx:220-227` handles `extension:notification` with `event: any` and directly forwards `message` to toasts.
- `src/context/extensions/PluginAPIBridge.tsx:123-259` listens for plugin events and rebroadcasts `plugin:view-update`, `plugin:open-document`, and `plugin:save-all` into global `window` custom events.
- `src/components/extensions/PluginDialogs.tsx:121-173` separately listens for `plugin:show-quick-pick`, `plugin:show-input-box`, and `plugin:show-message`.
- `src/components/extensions/ExtensionHostBridge.tsx:48-76` adds another listener layer for `plugin:show-message`, `plugin:register-command`, and `plugin:execute-command`, even though the handlers are no-ops.
- `src/context/NodeExtensionHostContext.tsx:307-380` casts untyped extension-host messages and trusts `params` shapes directly.
- `src-tauri/src/extensions/api/window.rs:140-180` emits `plugin:show-message`.
- `src-tauri/src/extensions/permissions.rs:309-335` emits `plugin:permission-request` and waits for frontend approval.

**What is happening**
The same extension/plugin event families are consumed in multiple frontend locations, with inconsistent typing and no shared runtime schema validation.

In addition, `PluginAPIBridge` rebroadcasts several payloads as global custom events even though no active consumers were found for:
- `plugin:view-update`
- `plugin:open-document`
- `plugin:save-all`

This broadens the renderer event surface without a clear product need.

**Why this matters**
- A malformed backend payload can poison UI state or create inconsistent behavior across consumers.
- Duplicate listener stacks make it easy for security fixes to land in one place but not others.
- Global rebroadcasting means any same-window script can subscribe to or spoof extension-originated events.

**Impact**
- spoofed extension notifications/dialogs
- inconsistent permission/message handling between bridges
- unnecessary expansion of renderer-visible privileged events

**Remediation proposal**
1. Centralize plugin/extension event ingress in a single bridge module.
2. Validate each payload family with runtime schemas before it touches UI state.
3. Expose derived read-only context state to consumers instead of rebroadcasting raw payloads through `window.dispatchEvent(...)`.
4. Remove unused rebroadcasts (`plugin:view-update`, `plugin:open-document`, `plugin:save-all`) until a first-party consumer exists.
5. Replace `any` and unchecked `Record<string, unknown>` casts with discriminated unions plus validation.

---

### FSEC-06 — Async `listen()` setup patterns can leak privileged handlers across unmount/HMR
**Severity:** Medium

**Evidence**
- safer pattern exists in `src/hooks/useTauriListen.ts:18-50`
- leak-prone patterns appear in:
  - `src/AppCore.tsx:216-227`
  - `src/AppCore.tsx:240-283`
  - `src/components/ai/AgentActivityFeed.tsx:356-369`
  - `src/components/ai/AgentActivityFeed.tsx:606-608`
  - `src/components/extensions/PluginDialogs.tsx:121-173`

**What is happening**
Several components do:

- `onMount(async () => { unlisten = await listen(...) })`
- `onCleanup(() => unlisten?.())`

If the component unmounts before `listen()` resolves, cleanup runs before `unlisten` is assigned. When the promise later resolves, the listener stays alive with no owner left to unregister it.

**Why this matters**
This is more than a memory issue when the listener is privileged:
- stale listeners may keep processing extension, deep-link, or AI events after UI teardown,
- HMR or view remounts can duplicate handlers,
- duplicate permission or notification prompts are easier to trigger.

**Impact**
- handler duplication
- stale event processing after teardown
- noisy or misleading permission/notification flows

**Remediation proposal**
1. Replace all ad hoc async listener setup with `useTauriListen` / `useTauriListeners` where possible.
2. Where a custom pattern is still required, copy the same mounted-flag approach used in `useTauriListen`.
3. Audit all event listeners registered from `AppCore.tsx` first, since those listeners sit closest to privileged app-wide actions.

---

### FSEC-07 — `SDKContext` re-exports raw `invoke`, making wrapper bypass easy
**Severity:** Medium

**Evidence**
- `src/context/SDKContext.tsx:885-905` exposes `invoke: (cmd, args) => invoke(cmd, args)` from the shared SDK context.
- `src/context/SDKContext.tsx:864-866` already demonstrates the preferred pattern by using `useTauriListen("cortex:event", ...)` for the primary AI event stream.

**What is happening**
The SDK context is meant to be the reviewed front door for the Cortex session pipeline, but it still hands raw `invoke()` back to consumers.

**Why this matters**
Once raw `invoke` is re-exported from shared context, future feature code can bypass timeout handling, wrapper-level telemetry, structured error mapping, or command allowlists without adding any new imports.

**Impact**
- policy drift over time
- inconsistent IPC behavior and logging
- easier introduction of new privileged calls without review

**Remediation proposal**
1. Remove raw `invoke` from the public `SDKContext` value.
2. Replace it with typed methods or a constrained broker built on `safeInvoke`.
3. If truly needed for advanced consumers, expose a narrowly-scoped executor that enforces logging, timeouts, and command allowlisting.

---

### FSEC-08 — `src/api/**` wrappers treat path segments and network behavior unsafely
**Severity:** Medium

**Evidence**
- `src/api/share.ts:12-25`, `31-49`, `54-100`
- `src/api/admin.ts:18-39`, `58-145`
- `src/api/agents.ts:12-143`
- `src/pages/share/SharedSession.tsx:33-46` passes the route token directly into the share API wrapper.

**What is happening**
The frontend API wrappers are very thin and currently:
- interpolate `token`, `sessionId`, and `agentId` directly into path strings,
- do not call `encodeURIComponent()` for path segments,
- do not use `AbortController`/timeouts,
- do not enforce response `Content-Type` or response schema validation,
- rely on ambient fetch defaults rather than explicit request policy.

**Why this matters**
This is a security-relevant robustness issue rather than just a DX issue.

Raw path interpolation can lead to path confusion if a token or ID contains reserved URL characters such as `/`, `?`, or `#`. This is especially relevant for share tokens, which come from route params (`/share/:token`) and are not normalized before use.

The lack of a shared fetch policy also means admin/share/agent screens have no consistent timeout, cancellation, credential, or schema-validation behavior.

**Impact**
- path confusion or route smuggling via unencoded identifiers
- stale responses racing into UI state on token/page changes
- over-trusting malformed JSON or unexpected response types
- implicit security policy instead of explicit request policy

**Remediation proposal**
1. Add a shared `apiFetch()` helper under `src/api/` that:
   - encodes path segments,
   - applies timeouts and `AbortController`,
   - validates response `Content-Type`,
   - parses via runtime schemas for high-risk responses,
   - centralizes structured error mapping.
2. Update all wrappers in `src/api/admin.ts`, `src/api/agents.ts`, and `src/api/share.ts` to use that helper.
3. Encode all path parameters with `encodeURIComponent()` before interpolation.
4. Replace page-level “cancelled flag” logic with actual request cancellation for token-driven screens like `SharedSessionPage`.

---

## Adjacent Watchlist

These items are not the highest-priority findings for the requested scope, but they are worth tracking because they can widen the renderer trust boundary if more extension UI wiring is added later.

### Watchlist-01 — Webview bridge uses permissive `postMessage("*")` channels
**Evidence**
- `src/context/WebviewContext.tsx:237-255` injects a message bridge into script-enabled iframe content.
- `src/context/WebviewContext.tsx:389-392` posts messages back into the iframe with `"*"` target origin.

**Observation**
The current webview system defaults to sandboxing, which is good, but if extension-contributed HTML panels are later wired into this path, the origin-free message bridge should be hardened before that rollout.

**Recommendation**
If extension UI begins using this system, require explicit origin binding, per-webview capability tokens, and a smaller host/webview message contract.

---

## Prioritized Remediation Order

1. **Lock down deep-link ingress** (`AppCore.tsx`, `src/utils/deepLink.ts`, new `src/sdk/deep-links.ts`).
2. **Replace global AI request/response events** with a scoped bridge or request-ID based broker.
3. **Reduce MCP DOM exposure** and gate listener registration behind explicit trust/debug state.
4. **Centralize extension event ingress and command execution** behind validated wrappers.
5. **Migrate raw async `listen()` call sites** to `useTauriListen`-style setup.
6. **Land a shared `apiFetch()` helper** and migrate `src/api/**`.
7. **Remove raw `invoke` from `SDKContext`** so future features are pushed toward approved wrappers.

---

## Suggested Follow-up Work

- Add renderer-side tests for deep-link payload rejection and AI context request correlation.
- Add a lint rule or codemod to flag new direct `listen()` / `invoke()` usage outside approved wrappers.
- Document a short “frontend privileged surfaces” policy in `docs/` so future contributors know when to use `safeInvoke`, `useTauriListen`, and centralized brokers.
