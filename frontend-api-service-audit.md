# Frontend API / Service Layer Audit

## Scope

Focused review of the frontend HTTP/service layer and its immediate shared utilities/callers:

- `src/api/admin.ts`
- `src/api/agents.ts`
- `src/api/share.ts`
- `src/hooks/useAgents.ts`
- `src/pages/admin/AdminSessions.tsx`
- `src/pages/share/SharedSession.tsx`
- `src/utils/config.ts`
- `src/context/SDKContext.tsx`
- `src/utils/retry.ts`
- `src/sdk/errors.ts`
- `src/utils/decorators.ts`
- `vite.config.ts`
- comparison-only evidence from `src/components/AgentsManager.tsx` and `src/components/DirectoryPicker.tsx`

## Executive Summary

The API modules under `src/api/` are small and readable, but they currently duplicate bare `fetch()` usage, bypass the app's configured backend base URL, and do not expose a shared contract for auth, cancellation, timeout, retries, or runtime response validation. The highest-risk issue is that the new service layer hardcodes relative `/api/v1...` routes while adjacent app code uses a configurable `serverUrl`; this makes admin/share/agent flows origin-dependent and internally inconsistent.

## Prioritized Findings

| ID | Severity | Finding | Primary Evidence |
|---|---|---|---|
| F1 | High | API modules bypass the configured backend base URL and the shared base-url utility is partially broken | `src/api/admin.ts:13,33`, `src/api/agents.ts:7,13`, `src/api/share.ts:7,13,35,58,75,91`, `src/utils/config.ts:7-20`, `src/context/SDKContext.tsx:166`, `vite.config.ts:309-351` |
| F2 | Medium | Error handling is lossy: most failures become generic strings, and the agent list path can silently degrade to empty data | `src/api/admin.ts:35-39,48-52,63-65,76-78,89-91,107-111,126-130,141-145`, `src/api/agents.ts:15-19,28-32,45-49,65-69,80-82,91-95,104-108,117-121,138-142`, `src/hooks/useAgents.ts:45-63` |
| F3 | Medium | No request cancellation, timeout, or retry contract exists for the audited HTTP calls | `src/api/admin.ts:18-145`, `src/api/agents.ts:12-143`, `src/api/share.ts:12-100`, `src/pages/admin/AdminSessions.tsx:43-67`, `src/pages/share/SharedSession.tsx:32-63`, `src/utils/decorators.ts:223-236`, `src/utils/retry.ts:50-98`, `src/sdk/errors.ts:490-530` |
| F4 | Medium | Auth/session behavior is an implicit same-origin assumption; sensitive flows have no explicit credentials or CSRF abstraction | `src/api/admin.ts:59-61,72-74,85-87,101-105,120-123`, `src/api/agents.ts:39-42,59-62,76-78,132-135`, `src/api/share.ts:35-39,58-61,75-77,91-94`, `src/utils/config.ts:7-20` |
| F5 | Low | Path segments are interpolated raw instead of URL-encoded | `src/api/admin.ts:59,72,85,139`, `src/api/agents.ts:26,59,76,102`, `src/api/share.ts:13,35,58,75,91` |
| F6 | Low | Response contracts are weak/inconsistent and rely entirely on unchecked `response.json()` / `blob()` | `src/types/admin.ts:48`, `src/api/admin.ts:100-111,117-130,136-145`, `src/api/agents.ts:19,32,49,69,95,108,121,142`, `src/api/share.ts:25,48,68` |

---

## Detailed Findings

### F1 — High — API modules bypass the configured backend base URL and the shared base-url utility is partially broken

**Evidence**

- The audited service modules hardcode relative API roots instead of consuming a shared base URL:
  - `src/api/admin.ts:13` → `const API_BASE = "/api/v1/admin";`
  - `src/api/agents.ts:7` → `const API_BASE = "/api/v1";`
  - `src/api/share.ts:7` → `const API_BASE = "/api/v1";`
- Those modules then issue bare relative requests such as:
  - `src/api/admin.ts:33`
  - `src/api/agents.ts:13,26,39,59,76,89,102,115,132`
  - `src/api/share.ts:13,35,58,75,91`
- The rest of the app already has a configurable backend base and uses it:
  - `src/utils/config.ts:7-20` defines mutable `apiBaseUrl`, exports `API_BASE_URL`, and exposes `updateApiBaseUrl()`.
  - `src/context/SDKContext.tsx:166` seeds `state.serverUrl` from `API_BASE_URL`.
  - `src/components/AgentsManager.tsx:96-103,324-328,388-436` calls `${state.serverUrl}/api/v1/agents...`.
  - `src/components/DirectoryPicker.tsx:28-36,61-65` calls `${state.serverUrl}/api/v1/files...`.
- `vite.config.ts:309-351` defines the dev server but does **not** define a `server.proxy` for `/api`, so relative `/api/v1/...` requests are not being forwarded by Vite in development.
- `src/utils/config.ts:12,18-19` also contains a correctness bug: `API_BASE_URL` is exported as a one-time string snapshot, while `updateApiBaseUrl()` mutates only the private `apiBaseUrl` variable. Any runtime reconfiguration updates `getWsUrl()` behavior (`src/utils/config.ts:28-33`) but not imports of `API_BASE_URL` already captured by consumers like `SDKContext`.

**Impact**

- Admin/share/agent flows only work if the frontend happens to be served from the same origin that also answers `/api/v1/...`.
- The newer API layer is internally inconsistent with adjacent code that already expects an explicit backend origin.
- Runtime backend-base reconfiguration is not reliable even where the shared utility suggests it should be.
- This is a user-facing availability issue for core flows, not just a style concern.

**Recommendation**

- Move all audited `fetch()` calls behind a shared HTTP client that resolves the backend base once.
- Replace the frozen `API_BASE_URL` export with a getter or store-backed source of truth.
- Thread the same base/origin mechanism through admin/share/agent services instead of mixing relative URLs and `state.serverUrl`.
- If same-origin `/api` is intentional in development, add an explicit Vite proxy so the assumption is enforced instead of accidental.

---

### F2 — Medium — Error handling is lossy: most failures become generic strings, and the agent list path can silently degrade to empty data

**Evidence**

- Most service functions discard response status/body details and replace them with generic messages:
  - `src/api/admin.ts:35-39,48-52,63-65,76-78,89-91,107-111,126-130,141-145`
  - `src/api/agents.ts:15-19,28-32,45-49,65-69,80-82,91-95,104-108,117-121,138-142`
- `src/api/share.ts` only preserves limited semantics for `401`/`404` in two reads, but all other statuses still collapse to generic text:
  - `src/api/share.ts:15-25,41-48,64-68,79-80,97-99`
- `useAgents()` explicitly swallows both list failures by converting them to empty arrays before `Promise.all()` resolves:
  - `src/hooks/useAgents.ts:49-53`
  - Because both promises are caught locally, the outer `catch` at `src/hooks/useAgents.ts:57-60` does not run for those fetch failures.
- Adjacent callers then surface only coarse messages or just log errors:
  - `src/pages/admin/AdminSessions.tsx:56-63,95-143`
  - `src/pages/share/SharedSession.tsx:48-59,83-100`

**Impact**

- Users cannot distinguish between unauthorized, expired, rate-limited, malformed, or backend-down states.
- In the agent flow, a backend/auth outage can appear as “you have zero agents,” which is easy to misread as missing data.
- Operational debugging becomes much harder because status codes and backend messages are lost at the service boundary.

**Recommendation**

- Centralize response parsing so non-2xx responses preserve status, endpoint, and any structured error payload.
- Stop converting fetch failures to `[]` in `useAgents()`; propagate a typed error and let the UI decide how to render it.
- Standardize a small error type for HTTP calls (status, code, message, retriable, auth-related).

---

### F3 — Medium — No request cancellation, timeout, or retry contract exists for the audited HTTP calls

**Evidence**

- None of the audited service functions accept a `signal`, `timeoutMs`, or retry policy; each performs a bare `fetch()` directly:
  - `src/api/admin.ts:18-145`
  - `src/api/agents.ts:12-143`
  - `src/api/share.ts:12-100`
- The consuming pages work around this by toggling a local boolean instead of aborting the underlying request:
  - `src/pages/admin/AdminSessions.tsx:43-67`
  - `src/pages/share/SharedSession.tsx:32-63`
- The codebase already contains generic timeout/retry helpers that this layer does not use:
  - `src/utils/decorators.ts:223-236` (`withTimeout`)
  - `src/utils/retry.ts:50-98` (`withRetry`)
  - `src/sdk/errors.ts:490-530` (`withRetry` with recoverable-error policy)

**Impact**

- Route/filter changes can leave orphaned in-flight requests running to completion even after the UI no longer needs them.
- The service layer has no bounded latency behavior, so hung requests depend entirely on browser defaults.
- Transient failures are retried nowhere, even though the repo already carries retry utilities.

**Recommendation**

- Add a shared request helper that accepts `AbortSignal`, timeout, and optional retry behavior.
- Expose `signal` through service functions used by pages with reactive reloads.
- Only retry idempotent reads, and keep admin/share mutations non-retried unless the server supports idempotency keys.

---

### F4 — Medium — Auth/session behavior is an implicit same-origin assumption; sensitive flows have no explicit credentials or CSRF abstraction

**Evidence**

- Sensitive mutations are sent with only `Content-Type` and no explicit credential or auth policy:
  - `src/api/admin.ts:59-61,72-74,85-87,101-105,120-123`
  - `src/api/agents.ts:39-42,59-62,76-78,132-135`
  - `src/api/share.ts:35-39,58-61,75-77,91-94`
- No audited module composes an auth header, passes `credentials`, or adds any client-side anti-CSRF signal/header.
- `src/utils/config.ts:7-20` and `src/context/SDKContext.tsx:166` show the app already anticipates a separately configured backend URL, which means “browser default same-origin cookie behavior” is not a safe implicit assumption for this service layer.

**Impact**

- If these routes are served from a separate origin, browser defaults will not send cookies unless the client opts into the right credentials mode.
- If same-origin cookies are the intended auth mechanism for admin routes, that security contract is undocumented and not centralized.
- This is both a correctness risk and a security-hardening gap.

**Recommendation**

- Decide explicitly whether auth is cookie-based or token-based.
- Enforce that policy in one shared HTTP client (`credentials`, auth header injection, CSRF header/token if applicable).
- Document which endpoints are intentionally public (`share`) vs privileged (`admin`, agent management).

---

### F5 — Low — Path segments are interpolated raw instead of URL-encoded

**Evidence**

- Raw path interpolation is used throughout the audited modules:
  - Admin: `src/api/admin.ts:59,72,85,139`
  - Agents: `src/api/agents.ts:26,59,76,102`
  - Share: `src/api/share.ts:13,35,58,75,91`
- None of those call sites wrap `sessionId`, `agentId`, or `token` with `encodeURIComponent()` before embedding them in the URL path.

**Impact**

- Requests can break or target unintended routes if IDs/tokens ever contain reserved URL characters.
- This is currently a hardening/correctness issue; severity rises if any of those identifiers become user-controlled or file-name-derived.

**Recommendation**

- Centralize path composition and encode every dynamic path segment.
- Avoid hand-building endpoint strings in each module.

---

### F6 — Low — Response contracts are weak/inconsistent and rely entirely on unchecked `response.json()` / `blob()`

**Evidence**

- `BulkAction` includes `"export"` in the type union (`src/types/admin.ts:48`), but `bulkAction()` expects a JSON `{ success, failed }` response (`src/api/admin.ts:97-111`) while export is handled by a separate blob endpoint (`src/api/admin.ts:117-130`). That is a contract drift waiting to be misused.
- `fetchSessionDetails()` returns `AdminSession & { messages: unknown[] }` (`src/api/admin.ts:136-145`), which punts the most sensitive part of the payload to `unknown[]` instead of a stable response shape.
- Most successful responses are trusted without any runtime validation:
  - `src/api/agents.ts:19,32,49,69,95,108,121,142`
  - `src/api/share.ts:25,48,68`
  - `src/api/admin.ts:39,52,111,130,145`

**Impact**

- Backend response drift will surface as runtime breakage rather than a controlled parse failure.
- The admin API surface is easier to call incorrectly because type-level action names and transport behavior do not fully match.
- Debugging malformed responses is harder because the service layer never checks content type or schema.

**Recommendation**

- Split `BulkAction` into only the JSON-count actions (`delete`, `archive`, `restore`) and keep export as its own dedicated command.
- Replace `unknown[]` with a typed message model for admin session details.
- Add a shared response parser with runtime validation for critical payloads.

---

## Suggested Remediation Order

1. **Fix the base/origin contract first** (`F1`). Until that is centralized, every other improvement sits on an unreliable transport path.
2. **Normalize error handling next** (`F2`) so the UI can tell auth failures, missing resources, and server outages apart.
3. **Add cancellation/timeout/auth behavior in one shared client** (`F3`, `F4`).
4. **Tighten hardening and response contracts** (`F5`, `F6`).

## Notes

- This audit intentionally stays focused on the API/service boundary and only cites adjacent callers/utilities where needed to show impact.
- No production code was changed as part of this review; this file is the deliverable.
