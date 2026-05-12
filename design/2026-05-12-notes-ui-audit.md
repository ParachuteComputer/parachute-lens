# Notes UI audit + vault-selector design

> **Status:** `[DRAFT]` — research and proposal, May 2026.
> **Scope:** the Notes PWA at `parachute-notes`, read in the context of
> multi-vault hubs (Aaron now runs `boulder`, `default`, `gitcoin`,
> `techne`) and the surface-direction note in `parachute-patterns/research/`.
> **Out of scope:** any implementation. This is a design doc; subsequent
> PRs will pick changes off it.

Written after Aaron dogfooded the new vault MCP install on a four-vault
local hub. Two related prompts: (1) the specific gap that Notes doesn't
help the user pick *which* vault on a multi-vault hub, and (2) a broader
"good look over the Notes UI" in the context of the
[surface-direction research](../../parachute-patterns/research/parachute-surface-direction.md).

## North star (Aaron's framing, 2026-05-12)

Notes should serve as **a real notes-app replacement** for someone
migrating off Apple Notes or Obsidian. The aim:

- **As easy as Apple Notes** — open the app, start typing, friction
  near zero. Autosave invisible. Sync invisible. No "set up your
  vault" before you can write the first thing.
- **As flexible as Obsidian-ish** — wikilinks, tag schemas, structured
  metadata, multi-pane reading, surface-aware customization (Tag
  Roles today, more later).
- **Parachute-shaped** — anchored in vault primitives (notes / tags /
  links / attachments). Per-vault customization is the
  differentiating axis (an Obsidian user opens one vault and gets
  one workspace; a Parachute user might run four with distinct
  identities and stay in the same UI). The surface direction is the
  long-term frame.

The audit + sequencing below are read against this north star —
"does this make Notes a credible Apple-Notes replacement?" is a
load-bearing question for every improvement candidate.

Section 1 inventories what Notes is today. §2 zooms into the
vault-selector gap. §3 critiques the broader UI. §4 looks at all of it
through the surface-direction lens. §5 is the recommendation.

---

## Section 1: current state inventory

### Routes

Notes is a Vite + React + TypeScript PWA with twenty internal routes,
all mount-relative under `/notes/` (BrowserRouter `basename`). The set,
from `src/app/App.tsx:96-120`:

| Path | Component | Purpose |
|---|---|---|
| `/` | `NotesIndex` → `Notes` or `Home` | dispatch: notes list when a vault is connected, landing page otherwise |
| `/pinned`, `/archived`, `/untagged`, `/orphaned` | `Notes(preset)` | built-in views over the notes list |
| `/tags` | `Tags` | tag browser: pin, rename, merge |
| `/new` | `NoteNew` | create-note form |
| `/capture` | `Capture` | unified text + voice capture (single screen, since `feat/unified-capture-89`) |
| `/graph` | `VaultGraph` | full-vault force-graph |
| `/today` | `Today` | created / edited today |
| `/calendar` | `Calendar` | by-day chronological grid |
| `/activity` | `Activity` | recent edits, grouped today / yesterday / this week / older |
| `/n/:id`, `/n/:id/edit` | `NoteView`, `NoteEditor` | view + CodeMirror editor |
| `/:id`, `/:id/edit` | `NoteIdRedirect` | shim for pre-mount-refactor deep links (`src/app/App.tsx:75-79`) |
| `/add` | `AddVault` | OAuth start: paste hub URL → consent screen |
| `/oauth/callback` | `OAuthCallback` | code exchange → store vault + token |
| `/vaults` | `Vaults` | list connected vaults, switch active, remove |
| `/settings` | `Settings` | per-vault settings (path tree mode, tag roles) |

97 source files (`src/**/*.{ts,tsx}` excluding tests). Notes is large enough
to feel like a real app, small enough that the surface is still legible
in one read-through.

### Navigation primitives

Three navigation chrome elements:

1. **Header** (`src/components/Header.tsx`). Sticky top bar. Desktop:
   logo, links to Notes / Tags / Graph / Activity / + Capture, a vault
   `<select>`, a "Manage" button → `/vaults`, Settings link, sync
   status, install prompt, theme toggle. Mobile: logo + sync status +
   hamburger; menu panel hides everything else.
2. **BottomTabBar** (`src/components/BottomTabBar.tsx`). Mobile-only
   fixed bottom bar. Five tabs: Home, Tags, Capture, Search, Settings.
   No vault switcher.
3. **Notes-page sidebar** (`src/app/routes/Notes.tsx:313-389`). Tag
   browser, built-in views (Pinned / Archived / Untagged / Orphaned),
   saved views, optional folder accordion. Desktop two-column grid;
   mobile collapsed behind a "Folders & saved views" details
   disclosure.

Plus globally-mounted modals / banners: `Toaster`, `UpdateBanner`,
`ReconnectBanner`, `QuickSwitchMount` (Cmd+K), `InstallPrompt`,
`ThemeToggle`.

### Primary user flows

- **Connect a vault.** `/` (`Home`) → `useOriginVaultProbe()` probes the
  page origin then falls back to `http://127.0.0.1:1939` for
  loopback origins (`src/lib/vault/probe.ts:73-87`) → if probe hits,
  CTA renders "Looks like there's a vault at … → Connect" → `/add` with
  the URL prefilled → `beginOAuth` → hub consent → `/oauth/callback` →
  store vault + token via `addVault` (`src/lib/vault/store.ts:34-44`)
  → redirect to `/`.
- **Browse + filter.** `/` Notes list. Sort, filter by path-prefix,
  filter by tag(s) with any/all, show-archived toggle, search box,
  pinned-tags strip, saved views. All URL-state-backed (search params
  ↔ filter state, `Notes.tsx:91-108`) so views are shareable.
- **Read a note.** `/n/:id` → markdown, frontmatter summary, tag chips,
  inbound + outbound links, attachments, transcription status,
  neighborhood graph, pin/archive buttons, delete.
- **Edit a note.** `/n/:id/edit` → CodeMirror with live preview, 409
  conflict handling, tag editor.
- **Create a note.** `/new` → path, body, tags. Offline-first via the
  sync queue.
- **Capture.** `/capture` → unified text + voice + hashtag-extracted
  auto-tagging. Hold-to-record. Submit writes one queued create-note
  (plus an attachment + transcribe link when audio is present).
- **Switch vaults.** Header `<select>` or `/vaults` page.
- **Reconnect after auth expires.** `ReconnectBanner` (banner at top
  with "Reconnect to vault" button) reads from `useAuthHaltStore`.
- **Quick-switch.** Cmd+K opens `QuickSwitch`; ranked over notes +
  tags + recents + commands.
- **Manage tags.** `/tags`: list, search, sort, pin, rename, merge,
  select-many.

### Per-vault customization primitive

`useVaultSettings` (`src/lib/vault/settings.ts`) stores a single JSON
blob per vault inside `.parachute/notes/settings`, merge-on-409 across
devices. Tag roles (`pinned`/`archived`/`captureVoice`/`captureText`/`view`,
each user-remappable) and path-tree mode use it today.

This is the kernel of "Notes as a configured surface" — see §4.

### Where per-vault state is *singular*

Despite the multi-vault store, several places implicitly assume one
active vault at a time:

- **`useActiveVaultClient()`** (`src/lib/vault/queries.ts:21-37`). One
  client at a time; no way to query a non-active vault in the
  background (e.g. "captures across all vaults").
- **`useVaultStore.getActiveVault()` has 17 direct call sites and
  `useVaultStore` is touched across dozens of components.** Every
  route gates on active vault. No route takes a `vault` parameter;
  the URL never carries the vault.
- **URLs aren't vault-scoped.** `/n/abc123` works if and only if
  `abc123` belongs to whichever vault happens to be active. Switch
  vaults, click an old bookmark, get "note not found" or — worse — a
  different-vault note that happens to share the id.
- **`cross-tab-sync`** (`src/lib/vault/cross-tab-sync.ts`) syncs the
  active-vault id across tabs. With vault-in-URL it would want to
  become per-tab.
- Saved views are stored as notes in the active vault — naturally
  per-vault. Good.

### What's currently friction

- **Header doing too much.** Desktop: 7 nav links + vault switcher +
  Manage + sync + install + theme. A lot for one 60px row.
- **The notes list page is the only page with the sidebar.** Tags,
  Today, Calendar, Activity all use a centered single-column layout.
  Switching between them feels like switching sub-apps.
- **Search is hidden on desktop.** The only search input is buried on
  the notes list under filters. Cmd+K covers it for keyboard users;
  mobile gets a bottom-tab Search; casual desktop users have no
  glanceable search box.
- **Three create-note doors** (Capture, `/new`, Cmd+K → /new), all
  slightly different in shape.
- **The connect-a-vault flow doesn't handle multi-vault.** §2.
- **Reconnect-on-auth-expired is good; "vault unreachable" isn't.** A
  vault that's online-but-process-down surfaces as a raw "Could not
  load notes: fetch failed" instead of the friendly banner.
- **Fresh-vault empty states read like errors.** `/today`, `/calendar`,
  `/activity`, `/orphaned`, `/untagged` all render correctly when
  empty but a brand-new vault has a long "this app looks broken"
  stretch.
- **Settings is grab-bag IA** — three sections (folder tree, tag
  roles, install badge) from three mental models. Fine for now, will
  need shape as the per-vault config surface grows.

---

## Section 2: vault selector (specific)

### Where Notes gets its vault URL today

OAuth flow: user pastes hub URL on `/add` → `beginOAuth(hubUrl)` → hub
renders consent screen → operator picks vault → `/oauth/callback`
captures `token.services.vault.url` and `token.vault` and calls
`addVault({ url, name, … })` (`OAuthCallback.tsx:42-64`).

A token is bound to one vault (JWT `vault` claim). Four vaults = four
tokens = four `VaultRecord`s = four OAuth round-trips. Today's "vault
selector" is the hub's consent screen, and a user who wants a second
vault has to know to go back to `/add` and run the dance again. No UI
prompt says "you have four vaults — want to connect them all?"

### Hub's vault-list endpoint

The hub already publishes `GET /.well-known/parachute.json` — public,
no Bearer required. Same-origin in standard installs (Notes lives at
`/notes/` on the hub origin); `Access-Control-Allow-Origin: *` covers
cross-origin deployments (e.g. Tailscale funnel with split mount).
Returns a `vaults: []` array of `{ name, url, version, managementUrl? }`
per the `WellKnownVaultEntry` interface at
`parachute-hub/src/well-known.ts:11-22`. The hub admin SPA itself
uses this endpoint at `parachute-hub/web/ui/src/lib/api.ts:69-92`. Notes
can call it against any hub URL and get the operator-visible vault list.

Caveat: operator-visible vaults are not the same as *user-accessible*
vaults — the well-known list returns all vaults regardless of OAuth
identity. The hub will gatekeep at consent, so the worst case is a
friendly "this hub doesn't think you can access that vault" on click.

**Open implementation question — hub origin discovery.** The popover
needs to know which hub URL to fetch `/.well-known/parachute.json`
against. Today `VaultRecord` stores the hub URL as `issuer` (captured
at OAuth time, visible at `OAuthCallback.tsx:54`), but it isn't
surfaced as a clean "hub origin" field for non-OAuth uses. Phase 2
either derives the hub origin from `issuer` or stores it as a distinct
field at connect time. Flagging here; design call lands with the
popover PR.

### Design proposal: where the vault picker lives

Three options, ranked by my judgment of leverage. None is mutually
exclusive.

**Option A: top-of-screen popover (deepen the existing `<select>`).**

Notes already has a `<select>` in the desktop header and mobile menu
(`Header.tsx:71-82`). It only *switches among connected* vaults —
adding a new one requires going to `/add` separately. Turn it into a
richer popover that lists (a) connected vaults with active marker,
(b) the hub's other available vaults with "Connect" inline next to
each, (c) "Add a different hub" at the bottom. One popover, two
mount points (header + mobile-bottom-tab).

Ship-first candidate: cheap (one component, one well-known fetch),
solves Aaron's gap, generalizes (tooltips, vault grouping later).

**Option B: vault name in the URL.**

`/v/techne/n/abc123` instead of `/n/abc123`. Pros: shareable deep
links, two tabs/two vaults, symmetric with the hub's `/vault/<name>/`
URL shape. Cons: touches every route (six patterns become twelve+);
vault renames become URL-breaking changes; old bookmarks to removed
vaults need a graceful 404. Worth doing as a follow-up to Option A,
not in place of it.

**Option C: settings-page picker.** Worst of the three. Invisible
at a glance, slow to switch. The `/vaults` page already serves as
management; once Option A exists, that page becomes
*management-only* (remove, see legacy-URL warning, see version).

**Option D: login-step picker on the Notes side.** Duplicates the
hub's consent screen. Defer unless a future cloud deployment mints
multi-vault tokens in one round-trip.

### Per-vault scope-token implications

A `VaultRecord` carries one `StoredToken`; tokens carry one `vault`
claim. Switching active vault is purely client-side — the next API
call uses the new vault's token automatically because
`useActiveVaultClient` rebuilds the client from the freshly-active
record (`queries.ts:21-37`).

If the new vault has no stored token (popover "Connect" click on an
unconnected vault), Notes runs OAuth against the hub for that vault.
Worth confirming with the hub steward whether `/oauth/authorize`
honours a `vault=<name>` hint to pre-select on the consent screen.
`beginOAuth` (`src/lib/vault/oauth.ts:43-93`) builds the authorize
URL as the last step after DCR + metadata discovery — adding the
hint is a URL-decoration on `authorizeUrl.searchParams`, not a
structural change. Plumb a small `params: Record<string,string>`
options bag through and append at the last step. Cheaper than it
sounds. Worst case if hub ignores the hint: consent screen renders
the picker as today.

### URL routing — vault name in the URL?

Per Option B: yes, eventually. Not in the first PR. The win is small
while Notes has the header `<select>`; it grows with cross-device
deep links and multi-tab workflows. Track as follow-up.

---

## Section 3: broader UI improvements

Ten candidates, in roughly the order I'd ship them. Each has a
description, a scope guess (S = a day, M = a few days, L = a week+),
and a leverage read.

### 1. Vault popover (§2 Option A). S, **high leverage.**

### 2. Real top-level search bar. S, high leverage.

Cmd+K is power-user; casual users don't find it. A slim search input
in the header that opens Cmd+K when focused (or an inline dropdown on
desktop). The header gets crowded — pair with #3.

### 3. Reshape header + bottom-tab bar. M, medium leverage.

After popover + search land, the header should be:
`[ Logo ] [ Search ] ── [ Vault popover ] [ Sync ] [ Menu ]`. Move
nav (Notes/Tags/Graph/Activity/Capture) into a left sidebar (desktop)
or keep on the bottom-tab bar (mobile). Header is chrome, not nav. A
surface-customizable Notes wants chrome small and consistent, with
the meat swappable — see §4.

### 4. Per-tab vault state. M, medium leverage.

`cross-tab-sync` syncs the active vault id across tabs. Useful for
one-vault-at-a-time; surprising for "boulder tab" + "techne tab"
side-by-side. Proposal: `ACTIVE_KEY` moves to sessionStorage; the
vaults-and-tokens map stays in localStorage. Cross-tab "I added a new
vault" still propagates; "I switched" doesn't. Prerequisite for
vault-in-URL.

### 5. Unify "create note" entry points. S, medium leverage.

Three doors today (Capture, `/new`, Cmd+K → /new). Make Capture
canonical; `/new` becomes "Capture with the typed affordance
pre-expanded"; Cmd+K's "New note" routes to `/capture`. Capture
already handles both modes — presentation change, not logic.

### 6. Network-error banner matching the auth-error banner. S, medium leverage.

`ReconnectBanner` is a great pattern. Reuse it for vault-unreachable:
when `useNotes` fails with `fetch failed` on an active vault, show
"Vault isn't responding — check the hub" instead of an in-content
error. Mirror auth-halt's auto-detect on the network side.

### 7. Empty-state copy for fresh vaults. S, low-medium leverage.

`/today`, `/calendar`, `/activity`, `/orphaned`, `/untagged` render
correctly when empty but read like errors. Teach instead: "This vault
has no notes from today yet — try [Capture](/capture)."

### 8. Vault badge on every route. S, low-medium leverage.

The notes-list header shows the active vault name (`Notes.tsx:269`),
most other routes don't. With 4+ vaults, knowing which one you're in
matters constantly. A thin strip below the header on every route, or
a colored dot keyed to a per-vault accent (item #10).

### 9. Authoring polish: structured form above the editor. M, medium leverage.

CodeMirror today edits the raw body + frontmatter. A small structured
form above the body for common fields (title / path / summary /
tags), still backed by frontmatter underneath. Relevant for
surface-direction's "rich rendering hooks via metadata" angle.

### 10. Surface-aware theming hooks. M, **high strategic value.**

Brand tokens (accent, bg, fg, card, border) live in `src/styles.css`
but aren't user-configurable — every Notes install looks the same.
Move them to CSS variables read from `useVaultSettings`. First knob:
`accent`. Aaron's four vaults each get their own accent color,
instantly distinguishable. Wiring is trivial; value compounds when
surface-direction lands.

### 11. View-level text-size control. S, medium leverage.

A simple zoom knob — "Default / Larger / Largest" — affecting font-size
on the editor + read views. **Crucially: a view preference, not a
content preference.** The markdown on disk is untouched; the operator
just sees bigger text while typing or reading. Stored per-device in
`localStorage` (most ergonomic — different devices, different eye
days), with an optional per-vault default via `useVaultSettings`. UI
shape: small dropdown in Settings or a one-click stepper in the
header. Apple Notes has this as a system-wide gesture; Notes should
match the affordance because operators expect it.

### 12. Unify capture surfaces — one entry, smart defaults. M, **high leverage.**

Today there are three creation paths: `/new` (full NoteForm),
TextCapture (`src/lib/capture/`, the quick text route), and
MemoCapture (voice). They're separate routes with separate component
trees and overlapping logic. Aaron's directive: **collapse the
duality.** One create-or-edit interface where the "quick" experience
is just the same surface with default-filled values:

- Title: auto-generated (timestamp + first line, or empty if both).
- Tags: defaulted per the `captureText` / `captureVoice` role (already
  per-vault via Tag Roles — see §1).
- Path: defaulted to vault-default (currently "Notes/" or similar
  per-vault convention).
- Body: the focused element; cursor lands there on entry.
- "More fields" affordance: collapsible structured form (per item #9)
  for path/tags overrides when wanted, hidden when not.

The "quick" feel is preserved by what's visible by default — a big
text area, autosave, no friction. The "long-typed" feel is the same
surface with the form expanded. **Removing the duality removes
duplicated code, reduces decision friction for the operator, and
unifies how Tag Roles flow through capture.**

MemoCapture stays distinct because the *input modality* is different
(microphone → upload → transcription) — but once recording stops, it
hands off to the unified create surface with the audio attached. So
even voice-capture lands in the same edit surface, not a parallel one.

### Considered and discarded

- Activity-feed-as-landing (defer; big mental-model shift, no clear win).
- Vault graph cross-fade between vaults (visually neat, no value).
- AI-assisted capture in Notes itself (that's agent's lane, not surface's).

---

## Section 4: surface-direction engagement

The
[surface-direction note](../../parachute-patterns/research/parachute-surface-direction.md)
proposes a third layer (surface) above vault + agent. Surface is for
humans, agent for AI; both consume vault. Surface should work in two
modes (static SSG and active runtime), with the same code capable of
both. Notes today is "one specific surface, bespoke."

### What does Notes look like through the surface lens?

Read the changes as if Notes is the *first instance* of the surface
abstraction. Concrete implications for each big choice in §3:

- **Vault selector (§2).** Surface-instance-aware: a static read-only
  deploy might pre-wire to `vault.boulder` and have no picker; an
  operator deploy is multi-vault. Never hardcode "show the picker" —
  drive it from a config blob.
- **Chrome reshape (#3).** A research surface and a journal surface
  want different top-level routes. Avoid hardcoded route lists in
  the chrome — read from config, default to today's set.
- **Per-tab vault state (#4).** Foundation for "same code, two vaults
  simultaneously" — precondition for the static-vs-active duality
  in the surface note.
- **Theming (#10).** Direct fit. Brand tokens become the first knob
  on the surface-config object — same plumbing for a static
  civic-wiki deploy as for Aaron's active multi-vault PWA.
- **Authoring (#9).** Tension flagged: if notes are sometimes plain
  markdown (portable) and sometimes MDX-style rich, the editor needs
  to know which mode. A frontmatter `surface:` field carries the
  hint, but that's a vault schema decision — worth raising on
  patterns#54.

### Architectural debt that would block a surface refactor

- **Routes are hardcoded in `App.tsx:96-120`.** A surface-instance
  refactor wants routes to be data-driven. Medium refactor cost.
- **Static component imports.** Swapping `NoteView` for an
  "MDX-aware NoteView" needs an import-by-name registry. Small-to-medium.
- **Brand tokens aren't user-overridable.** Item #10 is the first step.
  Small.
- **Tag Roles is the prototype** of what surface-config should look
  like — per-vault, stored in the vault's own settings note,
  dynamically read at point of use. Rename `useSurfaceSettings(vaultId)`,
  broaden the schema, and the pattern scales. Notes already made a
  good architectural decision here; preserve and extend it.
  - Note for the renaming PR: the underlying type is `LensSettings`
    (`src/lib/vault/settings.ts:28`), residue from the brief
    Notes→Lens rename. The hook rename should be a coordinated
    migration — hook → type → the `metadata.notes` stored key — not
    just a name change at the surface. The legacy `lens` storage path
    fallback is intentional and stays.

### Comments on the open questions from the surface-direction doc

- **Q1 (framework).** Notes' usage favors *active* mode (PWA, OAuth,
  real-time writes). Astro's static-first DNA is a poor fit for
  "Notes is the canonical surface" (Q5); it's plausible for
  "Notes coexists with a new generic surface." My read: ship
  "Notes-as-canonical-configured" first, revisit on evidence.
- **Q2 (content format).** Markdown today; the vault stores opaque
  text. Lowest-risk path: keep markdown, add an opt-in
  `surface: mdx` metadata flag for rich notes. Editor flips modes
  when it sees the flag.
- **Q3 (component library).** Punt until Q2 has an answer.
- **Q4 (customizability).** Theme: ship now (item #10).
  Layouts: next quarter. Custom components: defer.
- **Q5 (Notes-PWA relationship).** Lean canonical-and-configured.
  Notes already has the per-vault config primitive (tag roles); the
  active-mode plumbing is hard-won. Counter to weigh: a static
  surface bundle for WovenBoulder-shaped vaults is smaller and
  cheaper — Notes-as-canonical may be over-equipped for that case.
  Open.
- **Q6 (authoring).** Markdown + small structured form (item #9)
  covers most. MDX toggle for advanced users when Q2 lands.
- **Q7 (federation).** Notes' usage doesn't push this. Defer.
- **Q8 (revision history).** Vault tracks `updated_at` only; Notes
  renders it. Richer history is a vault schema change first.

**Naming.** "Surface" reduces to the Q5 answer: if Notes becomes
canonical, "surface" likely disappears in favor of
"Notes + Notes-config"; if a separate generic surface ships,
"surface" is fine for the generic thing.

---

## Section 5: recommendation

### Single highest-leverage improvement to ship next

**The vault popover in the header (§2 Option A + §3 item #1).**

Solves Aaron's surfaced gap. Cheap (one component, one well-known
fetch, no new route). Doesn't preclude anything. Sets the chrome up
for future improvements (popover becomes the natural home for
vault-management affordances). Scope: S (a day).

### Suggested sequencing for the broader audit

Reordered 2026-05-12 to weight Aaron's north-star framing — Apple-Notes-
grade ease, Obsidian-flex, Parachute-shape — alongside the named gap.
Authoring ease is now ranked higher than chrome refinement: someone
migrating from Apple Notes will judge the app by how it feels to type
in it on day one.

1. **Vault popover** (§3 item #1). S. The named gap.
2. **Unified create flow** (§3 item #12). M. Collapse the
   capture/new-note duality. **High leverage for the Apple-Notes-
   replacement framing** — every operator who opens the app to "just
   write something" hits this surface first.
3. **View-level text-size control** (§3 item #11). S. The "match Apple
   Notes' affordance" piece. Cheap to ship alongside #2 if the unified
   surface PR is open anyway.
4. **Empty-state copy + connection-error banner** (§3 items #6, #7).
   S each. Polish pass on "this app feels like it works."
5. **Top-level search bar + header reshape** (§3 items #2, #3).
   M combined. Bigger chrome change; do it once the popover proves
   the right place for vault chrome to live.
6. **Per-tab vault state** (§3 item #4). M. Foundation work. Pairs
   well with #7.
7. **Vault-in-URL** (§2 Option B). M. Deep-link parity.
8. **Surface-aware theming** (§3 item #10). M. First real
   "Notes-as-configured" knob. Strategic, not tactical.
9. **Authoring polish — structured form** (§3 item #9). M.
   Quality-of-life on top of the unified surface.

That sequence treats §2 (specific gap) as the immediate win,
unified-capture as the next high-leverage authoring fix, polish in the
middle, then steps that progressively de-bespoke Notes toward
"first instance of the surface abstraction" without committing to
that frame.

### Things Aaron should weigh before approving the next PR

- **Multi-vault posture.** Notes as multi-vault command-center, or a
  single-vault writing tool with occasional drop-ins? Both fit the
  proposal; the answer drives how prominent the popover gets.
- **Brand-coherence timing.** If the canopy/surface naming lands
  soon, doing the header reshape *after* the name saves a redo.
- **Static-surface commitment.** If a static side-build is imminent
  (WovenBoulder-shaped), make sure §4-friendly config-blob driving
  stays the discipline. I've kept proposals on that side.
- **Vault count at scale.** Four today; twenty later? The popover
  wants search/filter past ~10. Out of scope for PR #1 but worth
  watching.

### What this audit isn't recommending

Not a Notes-vs-generic-surface split, not an MDX/framework
migration, not a deprecation of any current feature, not federation
or cross-vault merge.

---

## Sibling artifacts

- [`parachute-patterns/research/parachute-surface-direction.md`](../../parachute-patterns/research/parachute-surface-direction.md) — the surface direction note.
- [`parachute-patterns#54`](https://github.com/ParachuteComputer/parachute-patterns/issues/54) — surface-direction tracking issue.
- `parachute-notes/CLAUDE.md` — repo conventions, mount-path architecture, tag-roles pattern.
- `parachute-hub/src/well-known.ts` — `/.well-known/parachute.json` source of truth for the vault list.

*Drafted 2026-05-12. Read it as a starting point for discussion; the
section 5 sequence is the working proposal but every item is up for
pushback.*
