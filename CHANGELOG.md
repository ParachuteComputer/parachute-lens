# Changelog

## Unreleased

### Graceful vault-unreachable UX

- **feat(ui): banner + status dot + retry backoff when vault is unreachable
  (0.3.15-rc.2).** Replaces the raw 502 / blank-screen + console-error
  behaviour Aaron hit after a Mac restart left vault un-started (notes#113).
  - **`VaultUnreachableError`** distinguishes 5xx and network-level failures
    (ECONNREFUSED, DNS, fetch TypeError) from auth/conflict/not-found in
    `VaultClient.request()`. Auth-halt and 4xx errors still mean the vault
    *answered*, so they don't touch reachability state.
  - **`useVaultReachabilityStore`** runs the per-vault state machine
    `healthy → retrying → down`. Promotion to `down` after 3 consecutive
    failures (or an immediate `ECONNREFUSED`). Exponential backoff for the
    recovery probe: 1s → 2s → 4s → 8s → 16s → 30s (cap matches the sync
    engine tick). Not persisted to localStorage — unlike auth-halt, this
    state should re-probe from scratch on reload.
  - **`useReachabilityProbe`** schedules a single `setTimeout` per active
    vault, pings `GET /api/vault` at `nextProbeAt`, and on success the
    client's own `onReachability("healthy")` flush clears the store. Probe
    auto-invalidates `notes`/`tags`/`vaultInfo`/`note` query keys so cached
    data refreshes on recovery.
  - **`VaultStatusBanner`** (renamed from `ReconnectBanner`) covers both
    failure axes with one component: auth-halt has precedence over
    unreachable (different recovery paths — re-OAuth vs wait/retry). The
    unreachable banner offers `Retry now` (forces a probe + invalidates
    queries) and `Dismiss` (one-shot escape hatch via `resetToHealthy`).
    Local-vault operator hint (`Try `parachute start vault``) is shown
    only for loopback / `.local` URLs.
  - **`SyncStatusIndicator`** gains a 5th tone `unreachable` ("Vault down",
    `bg-red-400`). Precedence: `halted → unreachable → offline → syncing →
    online`. Auth-halt still wins; unreachable beats `navigator.onLine`
    because it points at a more specific recovery.
  - **`QueryProvider` retry policy** pauses React Query retries on
    `VaultUnreachableError` once the store crosses `down` — this is what
    stops the `/api/notes` 404 hammering in the vault log (every list/get
    call legitimately hits `/api/notes?...`; nothing was stopping React
    Query from retrying twice per query forever). While still `retrying`
    (≤2 failures) one retry is allowed so a single blip self-heals
    without ever showing the banner.
  - **Tests.** `client.test.ts` adds 502/503/TypeError/AbortError mappings
    and the `healthy` reset on 4xx. `reachability-store.test.ts` covers
    the full state machine + backoff index growth + per-vault isolation.
    `VaultStatusBanner.test.tsx` covers both modes, the auth-halt-wins
    precedence, the loopback hint, the Retry/Dismiss buttons, and
    `isLoopbackOrLocal`. `SyncStatusIndicator.test.tsx` adds the
    `Vault down` tone test (above offline in precedence).

### Vault popover (header)

- **feat(ui): vault popover + hub-discovery + OAuth `vault=<name>` hint
  (0.3.15-rc.1).** Replaces the bare `<select>` switcher in the header
  with a popover that surfaces the operator's full hub-side vault list
  alongside the locally-connected vaults. Implements §2 of
  [`design/2026-05-12-notes-ui-audit.md`](./design/2026-05-12-notes-ui-audit.md);
  the first item in the §5 ship sequence.
  - **Two sections.** "Connected" lists vaults Notes has tokens for
    (active vault gets a filled accent dot + "current" tag; the rest
    are one click to switch). "Available from your hub" lists vaults
    published at `<hub>/.well-known/parachute.json` that Notes hasn't
    connected to yet, each with an inline "Connect" button. Footer
    links to the existing `/vaults` management page.
  - **Hub-origin discovery.** Derived from `VaultRecord.issuer` (which
    under hub-as-issuer is the hub origin itself, captured at OAuth
    time in `OAuthCallback.tsx`) — no schema change to the stored
    record, no migration. For a standalone-vault deployment the
    well-known fetch returns no peers and the Available section is
    omitted (graceful degradation).
  - **OAuth `vault=<name>` hint (Path A).** `beginOAuth` now accepts an
    `options.params` bag appended to the authorize URL last, guarded
    so caller-supplied params can never overwrite standard OAuth/PKCE
    params. Notes sends `vault=<name>` so future hubs that adopt the
    hint can pre-select on the consent screen; pre-#240 hubs ignore it
    and the picker renders as today.
  - **Mobile.** Same component, rendered as `variant="inline"` inside
    the existing hamburger menu — replaces the mobile `<select>` plus
    the standalone "Manage vaults" button.

### Design

## 0.3.14 (2026-05-11)

### OAuth pending-approval UX

- **feat(oauth): consume hub's `approve_url` field from the
  pending-approval response.** When `/oauth/token` answers with
  `error: "invalid_client"` and the hub#240 hint fields
  (`approve_url`, `cli_alternative`), `completeOAuth` now throws a
  typed `PendingApprovalError` instead of folding the raw JSON into a
  generic "Token exchange failed" string. The `OAuthCallback` route
  renders a dedicated "Waiting for hub approval" screen with a
  one-click "Open approval page" link (the hub's
  `/admin/approve-client/<id>` SPA route) plus the
  `parachute auth approve-client …` CLI as a secondary path.
  Back-compat: pre-#240 hubs that emit only `cli_alternative` still
  surface the friendly screen with the CLI fallback alone; an
  `invalid_client` response with no hint fields (unknown client_id,
  revoked client) falls through to the generic error UI rather than
  getting swallowed into the approval flow. Defense-in-depth: only
  `http(s)` `approve_url` schemes make it to the rendered `href` —
  any other scheme (`javascript:`, malformed) is dropped at parse
  time, with the CLI alternative still surfaced if present.

## 0.3.13 (2026-05-10)

### Module manifest

- **docs(module): declare `uiUrl: "/notes"` per
  [`patterns/module-ui-declaration.md`](https://github.com/ParachuteComputer/parachute-patterns/blob/main/patterns/module-ui-declaration.md).**
  Lets hub render the Notes discovery tile dynamically from the
  well-known doc instead of from its hardcoded `SERVICE_LABELS` map.
  No runtime change in Notes itself; the field is opaque to the PWA.

## 0.3.12 (2026-05-09)

### OAuth / DCR

- **feat(oauth): include credentials on DCR registration so hub session
  cookie reaches /oauth/register (#106).** Adds `credentials: 'include'`
  to the `POST /oauth/register` fetch in `src/lib/vault/discovery.ts` so
  the browser sends the `parachute_hub_session` cookie when registering.
  Companion to hub#199 (hub-side auto-approve) and agent#140 (sibling
  fix on agent's SPA).

  **Scope:** Same-origin auto-approve (notes loaded at `<hub>/notes/` →
  DCR at `<hub>/oauth/register`) activates as soon as hub#199/200 lands.
  Cross-origin auto-approve (e.g. notes on a cloudflare URL → hub on
  tailnet) does NOT work yet — it requires hub-side CORS with
  `Access-Control-Allow-Credentials`, a first-party origin allowlist, and
  a `SameSite` relaxation or alternative credential, tracked at
  parachute-hub#201. Until that lands, cross-origin DCR continues to
  register as `pending` and requires manual `parachute auth approve-client`.

## 0.3.11 (2026-05-05)

First `@latest` publish since launch (`0.3.0`). Bundles every change merged
since launch into a single tagged release plus the discovery-protocol fix
needed for hub well-known to resolve notes correctly.

### Discovery / module protocol

- **fix(spa): serve `.parachute/info` as JSON before SPA catch-all (#102).**
  Notes' Vite preview SPA fallback was matching `/.parachute/info` and
  `/notes/.parachute/info` and returning the index.html shell, so hub's
  well-known builder couldn't read notes' module identity. The
  `infoEndpointPlugin` now registers Connect middleware at both the
  basePath-prefixed path (`/notes/.parachute/info`) and the root
  (`/.parachute/info`) — matching the canonical contract used by vault and
  scribe (no `.json` extension). The middleware runs before sirv and the
  SPA fallback. Build still emits `dist/.parachute/info` as a static asset
  for static-deploy scenarios.

### Accessibility

- **fix(a11y): visible RouteFallback with announceable status (#98).** The
  route-level lazy fallback now renders a visible spinner with `role="status"`
  so screen readers announce route transitions.
- **fix(a11y): explicit `aria-live="polite"` on RouteFallback + smoke test
  (#101).** Hardens the fallback's announcement contract and adds a
  regression test.

### Feature work and cleanup since launch

- **chore: closeout — capture race + queue nit + route-level lazy (#96).**
- **feat: unified single-screen capture (#94).** Capture flow consolidated.
- **feat: saved-view management UI + cluster-A closeout (#93).**
- **sync: reconnect banner + cross-tab vault sync (#92).**
- **Cleanup bundle: pinned hint, group test, vault-switch reset, settings
  drain, module.json (#90).**
- **fix: capture `if_updated_at` baseline for offline note edits (#88).**
- **feat: OAuth via hub-as-issuer with refresh + DCR cache (#83).**
- **release: 0.3.2 (+ ignore `.claude` in lint/test) (#82).**
- **docs: update parachute-cli refs to parachute-hub (#81).**
- **feat: probe local hub at :1939 when same-origin probe fails (#80).**
- **docs(readme): status note — PWA install flow coming with public
  exposure (#77).**

### Repo hygiene

- **chore: gitignore `.claude/` stray artifacts.** Local agent worktrees /
  scheduled-task locks no longer show up as untracked files.

## 0.3.0 (2026-04-23)

Launch.
