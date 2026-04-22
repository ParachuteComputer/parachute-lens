# parachute-notes

A browser-based companion for any Parachute Vault. Vite + React + TypeScript, installable PWA, served at `/notes/` under the ecosystem origin. OAuth 2.1 + PKCE + RFC 7591 DCR against the vault (discovery now probes hub-origin per PR #55).

> **Naming history.** The package and mount path were briefly renamed `lens` / `/lens/` in rc.1 before the team reverted to "Notes" on 2026-04-22 ahead of launch. Internal identifiers that hold user data across that rename are preserved intentionally: the IndexedDB name stays `parachute-lens`, the `lens:*` localStorage key prefix stays, and the settings note is read from its legacy path once on 404 fallback. See PR #74 for the full revert.

## Mount-path architecture

Notes lives at `/notes/` externally and uses mount-relative internal routes.

- **Vite `base`** = `/notes/` — asset URLs, PWA manifest scope, service worker
- **BrowserRouter `basename`** = `/notes` (from `import.meta.env.BASE_URL`)
- **Internal routes** — `/`, `/:id`, `/:id/edit`, `/pinned`, `/tags`, `/new`, `/add` — no `/notes/` prefix. React Router v7 ranked routing picks static routes over `/:id` correctly.
- **OAuth redirect URI** — `BASE_URL + "oauth/callback"` via `basePathPrefix()` in `src/lib/vault/oauth.ts`
- **Deep-link shim** — `/:id` + `/:id/edit` redirect to the right internal routes (PR #54) for pre-refactor bookmarks

Canonical source for this convention: `parachute-patterns/patterns/mount-path-convention.md` (once patterns steward publishes).

## Tag roles — the per-vault customization primitive

Features that rely on a specific tag name (e.g. "this is a pinned note", "this
is a voice capture") must **not** hardcode the tag. Different users have
different vault conventions; hardcoding forces one convention on everyone and
collides with tags they already use.

Instead, add the tag to the `TagRoles` object and read it at the point of use.

### Where it lives

- Type + helpers: `src/lib/vault/tag-roles.ts`
- Settings UI: `TagRolesSection` in `src/app/routes/Settings.tsx`
- Vault storage: `.parachute/notes/settings` note, `metadata.notes` sub-object
  (legacy reads at `.parachute/lens/settings` / `metadata.lens` fall through
  once, then get rewritten at the new path on next change)

### Current roles

| Key | Default | Used by |
|---|---|---|
| `pinned` | `pinned` | (reserved for #25 pinned views) |
| `archived` | `archived` | (reserved for #25 archived views) |
| `captureVoice` | `voice` | `src/app/routes/MemoCapture.tsx` |
| `captureText` | `quick` | `src/app/routes/TextCapture.tsx` |

### Adding a new role

1. Add the key to `TagRoles` and a sensible default to `DEFAULT_TAG_ROLES` in
   `src/lib/vault/tag-roles.ts`. Include it in `TAG_ROLE_KEYS` and add an
   entry to `ROLE_LABELS` in `Settings.tsx` so the settings UI renders it.
2. At the feature's point of use, read the role with
   `const { roles } = useTagRoles(activeVault?.id ?? null);`
   and pass `roles.<yourKey>` where the tag is needed. Don't inline the key
   name; don't add a fallback to a literal tag string in the feature code.
3. If your feature queries notes by the role tag, filter on `roles.<yourKey>`
   from `useTagRoles`, not on a hardcoded string.
4. Remember: remapping a role never retags existing notes. The role points at
   the new tag going forward only. Make that explicit in any UI where the
   mapping change has user-visible consequences.

### Pattern: per-vault UI/integration settings in general

Other per-vault settings follow the same shape via the `useVaultSettings` hook,
which stores a single JSON blob inside the `.parachute/notes/settings` note
and merges-on-409 across devices. Reach for it (not a new store pattern) when
you need "a small JSON blob that belongs to a single vault and rarely
changes."

## Transcription is vault-level, not Notes-level

Notes uploads audio attachments. When the attachment POST body carries
`{ transcribe: true }`, the vault's transcription-worker picks the job up
and (if scribe is wired) overwrites the note's `_Transcript pending._`
placeholder with the actual transcript. Notes has no scribe client, no
scribe settings UI, and no direct knowledge of whether transcription is
configured — that's the vault's concern. If a user wants voice memos with
transcripts, they configure scribe in the vault once, not per-device.

## Post-merge hygiene

When a PR is merged, locally:

```
git checkout main && git pull
```

Aaron runs Notes via `bun link` + `parachute start notes` in development — the linked install follows whatever branch is checked out. Leaving the repo on a feature branch after merge means Aaron's running stale feature-branch code, not the merged main. Caught 2026-04-21.
