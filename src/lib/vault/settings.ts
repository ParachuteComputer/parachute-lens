import { enqueue } from "@/lib/sync/queue";
import { useSync } from "@/providers/SyncProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type VaultClient, VaultConflictError, VaultNotFoundError } from "./client";
import { isOffline, useActiveVaultClient, withOfflineFallback } from "./queries";
import { DEFAULT_TAG_ROLES, type TagRoles, loadTagRoles, normalizeTagRoles } from "./tag-roles";
import type { Note } from "./types";

// Per-vault settings live in a single note at this path. We stash the payload
// in the note's metadata (under a `lens` key, so other modules could
// theoretically share the file) and leave the note body empty. See
// CLAUDE.md — "Tag roles" section for the motivation: without a vault-hosted
// canonical copy, per-device localStorage can't sync across Aaron's laptop /
// tablet / phone.
export const SETTINGS_NOTE_PATH = ".parachute/lens/settings";

export const SETTINGS_SCHEMA_VERSION = 1;

// The `lens` sub-object of the settings note's metadata. Namespaced so a future
// cross-module settings convention can layer on without collision.
export interface LensSettings {
  schemaVersion: number;
  tagRoles: TagRoles;
}

export const DEFAULT_LENS_SETTINGS: LensSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  tagRoles: { ...DEFAULT_TAG_ROLES },
};

export function normalizeLensSettings(raw: unknown): LensSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_LENS_SETTINGS, tagRoles: { ...DEFAULT_TAG_ROLES } };
  }
  const r = raw as { schemaVersion?: unknown; tagRoles?: unknown };
  const schemaVersion =
    typeof r.schemaVersion === "number" ? r.schemaVersion : SETTINGS_SCHEMA_VERSION;
  const tagRoles = normalizeTagRoles(r.tagRoles);
  return { schemaVersion, tagRoles };
}

export function extractLensSettings(note: Note | null | undefined): LensSettings {
  if (!note || !note.metadata || typeof note.metadata !== "object") {
    return { ...DEFAULT_LENS_SETTINGS, tagRoles: { ...DEFAULT_TAG_ROLES } };
  }
  const meta = note.metadata as Record<string, unknown>;
  return normalizeLensSettings(meta.lens);
}

// Patch type mirrors LensSettings but lets callers supply only the fields
// they want to change — including a partial tagRoles (e.g. bump `pinned` only).
export interface LensSettingsPatch {
  schemaVersion?: number;
  tagRoles?: Partial<TagRoles>;
}

export function applySettingsPatch(base: LensSettings, patch: LensSettingsPatch): LensSettings {
  return {
    schemaVersion: patch.schemaVersion ?? base.schemaVersion,
    tagRoles: patch.tagRoles
      ? normalizeTagRoles({ ...base.tagRoles, ...patch.tagRoles })
      : base.tagRoles,
  };
}

// ---------------------------------------------------------------------------
// localStorage cache
//
// The cache lets us paint instantly on mount before the vault fetch resolves,
// and serves as offline fallback. `dirty` marks a local change that hasn't
// been confirmed-written to the vault — on next online mount we re-push it.
// ---------------------------------------------------------------------------

const CACHE_PREFIX = "lens:settings:";

function cacheKey(vaultId: string): string {
  return CACHE_PREFIX + vaultId;
}

export interface SettingsCacheEntry {
  settings: LensSettings;
  // The server-side `updated_at` of the settings note as we last observed it.
  // Used as `if_updated_at` for optimistic concurrency on PATCH. Null when
  // the note hasn't been written yet.
  noteUpdatedAt: string | null;
  // True once we've confirmed the note exists on the vault. Lets us pick POST
  // vs. PATCH for the first write without another round-trip.
  noteExists: boolean;
  // True when we've applied a local change we haven't confirmed landed on the
  // server yet. Cleared on successful write-through.
  dirty: boolean;
}

export function loadCachedSettings(vaultId: string): SettingsCacheEntry | null {
  try {
    const raw = localStorage.getItem(cacheKey(vaultId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SettingsCacheEntry>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      settings: normalizeLensSettings(parsed.settings),
      noteUpdatedAt: typeof parsed.noteUpdatedAt === "string" ? parsed.noteUpdatedAt : null,
      noteExists: parsed.noteExists === true,
      dirty: parsed.dirty === true,
    };
  } catch {
    return null;
  }
}

export function saveCachedSettings(vaultId: string, entry: SettingsCacheEntry): void {
  try {
    localStorage.setItem(cacheKey(vaultId), JSON.stringify(entry));
  } catch {
    // storage unavailable — best-effort only
  }
}

export function deleteCachedSettings(vaultId: string): void {
  try {
    localStorage.removeItem(cacheKey(vaultId));
  } catch {
    // storage unavailable — best-effort only
  }
}

// One-time migration from legacy per-vault localStorage. Leaves the legacy
// `lens:tag-roles:<vaultId>` key in place so a same-device rollback still
// finds its data; a follow-up release cycle will clean it up.
function seedFromLegacyTagRoles(vaultId: string): LensSettings | null {
  if (typeof localStorage === "undefined") return null;
  const legacyRaw = localStorage.getItem(`lens:tag-roles:${vaultId}`);
  if (!legacyRaw) return null;
  const legacyRoles = loadTagRoles(vaultId);
  return {
    ...DEFAULT_LENS_SETTINGS,
    tagRoles: legacyRoles,
  };
}

function resolveInitialEntry(vaultId: string): SettingsCacheEntry {
  const cached = loadCachedSettings(vaultId);
  if (cached) return cached;
  const legacy = seedFromLegacyTagRoles(vaultId);
  if (legacy) {
    // Mark as dirty so the first online fetch pushes this up to the vault.
    return { settings: legacy, noteUpdatedAt: null, noteExists: false, dirty: true };
  }
  return {
    settings: { ...DEFAULT_LENS_SETTINGS, tagRoles: { ...DEFAULT_TAG_ROLES } },
    noteUpdatedAt: null,
    noteExists: false,
    dirty: false,
  };
}

// ---------------------------------------------------------------------------
// Write path — POST for first-ever-write, PATCH with if_updated_at otherwise.
// Handles 409 by refetching and retrying once; caller surfaces "conflict"
// status if that still fails.
// ---------------------------------------------------------------------------

async function writeSettingsToVault(
  client: VaultClient,
  next: LensSettings,
  prior: { noteUpdatedAt: string | null; noteExists: boolean },
  signal?: AbortSignal,
): Promise<SettingsCacheEntry> {
  const payload = { lens: next };

  // First-ever write — the note doesn't exist, POST to create.
  if (!prior.noteExists) {
    try {
      const created = await client.createNote(
        { path: SETTINGS_NOTE_PATH, content: "", metadata: payload },
        { signal },
      );
      return {
        settings: next,
        noteUpdatedAt: created.updatedAt ?? created.createdAt ?? null,
        noteExists: true,
        dirty: false,
      };
    } catch (err) {
      // Another device raced us to POST. Refetch and PATCH.
      if (err instanceof VaultConflictError || isPathTakenError(err)) {
        return patchWithRefetch(client, next, signal);
      }
      throw err;
    }
  }

  // Note exists and we have a baseline — optimistic PATCH.
  if (prior.noteUpdatedAt) {
    try {
      const updated = await client.updateNote(
        SETTINGS_NOTE_PATH,
        { metadata: payload, if_updated_at: prior.noteUpdatedAt },
        { signal },
      );
      return {
        settings: next,
        noteUpdatedAt: updated.updatedAt ?? prior.noteUpdatedAt,
        noteExists: true,
        dirty: false,
      };
    } catch (err) {
      if (err instanceof VaultConflictError) {
        return patchWithRefetch(client, next, signal);
      }
      throw err;
    }
  }

  // Note exists but we lost the baseline — refetch to recover it, then PATCH.
  return patchWithRefetch(client, next, signal);
}

async function patchWithRefetch(
  client: VaultClient,
  next: LensSettings,
  signal?: AbortSignal,
): Promise<SettingsCacheEntry> {
  let note: Note | null = null;
  try {
    note = await client.getNote(SETTINGS_NOTE_PATH);
  } catch (err) {
    if (!(err instanceof VaultNotFoundError)) throw err;
    note = null;
  }
  if (!note) {
    // Someone deleted the settings note between our last fetch and this retry.
    // POST a fresh one with the caller's intended payload.
    const created = await client.createNote(
      { path: SETTINGS_NOTE_PATH, content: "", metadata: { lens: next } },
      { signal },
    );
    return {
      settings: next,
      noteUpdatedAt: created.updatedAt ?? created.createdAt ?? null,
      noteExists: true,
      dirty: false,
    };
  }
  const baseline = note.updatedAt ?? note.createdAt;
  const updated = await client.updateNote(
    SETTINGS_NOTE_PATH,
    { metadata: { lens: next }, if_updated_at: baseline },
    { signal },
  );
  return {
    settings: next,
    noteUpdatedAt: updated.updatedAt ?? baseline ?? null,
    noteExists: true,
    dirty: false,
  };
}

// The vault returns a descriptive error body when creating a note whose path
// is already in use. Different vault versions phrase it differently, so we
// duck-type on a substring of the server's complaint.
function isPathTakenError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("already exists") || msg.includes("duplicate") || msg.includes("conflict");
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export type SettingsStatus = "loading" | "synced" | "offline" | "conflict";

export interface UseVaultSettingsResult {
  settings: LensSettings;
  update: (patch: LensSettingsPatch) => Promise<void>;
  status: SettingsStatus;
}

// Fetch-once-per-mount + write-through hook. Callers pass the active vault's
// id; returns the current merged settings (defaults ← localStorage ← vault),
// an `update(patch)` that writes to both places, and a status hint for UIs
// that want to render a sync badge.
export function useVaultSettings(vaultId: string | null): UseVaultSettingsResult {
  const client = useActiveVaultClient();
  const qc = useQueryClient();
  const { db } = useSync();

  // Initial state from cache (or legacy seed) — paints instantly before the
  // vault fetch resolves.
  const initial = useMemo<SettingsCacheEntry>(() => {
    if (!vaultId) {
      return {
        settings: { ...DEFAULT_LENS_SETTINGS, tagRoles: { ...DEFAULT_TAG_ROLES } },
        noteUpdatedAt: null,
        noteExists: false,
        dirty: false,
      };
    }
    return resolveInitialEntry(vaultId);
  }, [vaultId]);

  const [entry, setEntry] = useState<SettingsCacheEntry>(initial);
  const [status, setStatus] = useState<SettingsStatus>(client ? "loading" : "offline");

  // Re-read from cache / seed when the active vault changes.
  useEffect(() => {
    setEntry(initial);
    setStatus(client ? "loading" : "offline");
  }, [initial, client]);

  // Remote fetch. On 404 we use defaults but DO NOT eagerly create the note —
  // that happens lazily on the first `update()` (unless the cache is marked
  // dirty from a legacy-seed migration, in which case the on-fetch reconcile
  // pushes up).
  const fetchQuery = useQuery({
    queryKey: ["vault-settings", vaultId],
    enabled: !!vaultId && !!client,
    queryFn: async () => {
      try {
        const note = await client!.getNote(SETTINGS_NOTE_PATH);
        if (note) {
          return {
            settings: extractLensSettings(note),
            noteUpdatedAt: note.updatedAt ?? note.createdAt ?? null,
            noteExists: true,
          };
        }
        return { settings: null, noteUpdatedAt: null, noteExists: false };
      } catch (err) {
        if (err instanceof VaultNotFoundError) {
          return { settings: null, noteUpdatedAt: null, noteExists: false };
        }
        throw err;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  // When the fetch lands, reconcile: push a pending dirty local change up, or
  // accept whatever the server has. Intentionally fires on fresh fetch only —
  // depending on `entry` would re-fire on every local edit and fight with the
  // optimistic write path.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reconcile only on a fresh fetch, not on every local state change
  useEffect(() => {
    if (!vaultId || !client || !fetchQuery.data) return;
    const remote = fetchQuery.data;

    // Local changes pending → push our version up. The server's current state
    // becomes the baseline we PATCH against.
    if (entry.dirty) {
      void (async () => {
        try {
          const result = await writeSettingsToVault(client, entry.settings, {
            noteUpdatedAt: remote.noteUpdatedAt,
            noteExists: remote.noteExists,
          });
          setEntry(result);
          saveCachedSettings(vaultId, result);
          setStatus("synced");
          qc.invalidateQueries({ queryKey: ["vault-settings", vaultId] });
        } catch {
          // Still failing — leave dirty, keep current UI state, surface offline.
          setStatus("offline");
        }
      })();
      return;
    }

    // No local pending change — trust the server.
    const nextEntry: SettingsCacheEntry = remote.settings
      ? {
          settings: remote.settings,
          noteUpdatedAt: remote.noteUpdatedAt,
          noteExists: true,
          dirty: false,
        }
      : {
          settings: entry.settings,
          noteUpdatedAt: null,
          noteExists: false,
          dirty: false,
        };
    setEntry(nextEntry);
    saveCachedSettings(vaultId, nextEntry);
    setStatus("synced");
  }, [vaultId, client, fetchQuery.data]);

  // Surface error status from the fetch itself (e.g. network failure while
  // mounted online then going offline).
  useEffect(() => {
    if (fetchQuery.isError) setStatus("offline");
  }, [fetchQuery.isError]);

  const update = useCallback(
    async (patch: LensSettingsPatch) => {
      if (!vaultId) return;
      const next = applySettingsPatch(entry.settings, patch);

      // localStorage write-through is instant; set dirty so we re-push if the
      // vault call fails.
      const optimisticEntry: SettingsCacheEntry = {
        settings: next,
        noteUpdatedAt: entry.noteUpdatedAt,
        noteExists: entry.noteExists,
        dirty: true,
      };
      setEntry(optimisticEntry);
      saveCachedSettings(vaultId, optimisticEntry);

      if (!client) {
        setStatus("offline");
        return;
      }

      const enqueueFallback =
        db && entry.noteExists
          ? async () => {
              // When the note exists but we're offline, queue a PATCH. `force:
              // true` tells the vault to skip the if_updated_at precondition
              // — we don't have a reliable baseline once the drain runs later.
              await enqueue(
                db,
                {
                  kind: "update-note",
                  targetId: SETTINGS_NOTE_PATH,
                  payload: { metadata: { lens: next }, force: true },
                },
                { vaultId },
              );
              // Treat as enqueued from the UI's perspective — cache stays
              // dirty until the next online fetch reconciles the result.
              return null as unknown as SettingsCacheEntry;
            }
          : null;

      try {
        const result = await withOfflineFallback(
          (signal) =>
            writeSettingsToVault(
              client,
              next,
              { noteUpdatedAt: entry.noteUpdatedAt, noteExists: entry.noteExists },
              signal,
            ),
          enqueueFallback,
        );
        if (result) {
          setEntry(result);
          saveCachedSettings(vaultId, result);
          setStatus("synced");
          qc.invalidateQueries({ queryKey: ["vault-settings", vaultId] });
        } else {
          // Enqueued — leave dirty, report offline so UI can surface it.
          setStatus(isOffline() ? "offline" : "synced");
        }
      } catch (err) {
        if (err instanceof VaultConflictError) {
          setStatus("conflict");
        } else {
          setStatus("offline");
        }
      }
    },
    [vaultId, client, db, entry, qc],
  );

  return { settings: entry.settings, update, status };
}

// ---------------------------------------------------------------------------
// Tag-roles wrapper — keeps the pre-existing surface the rest of Lens uses.
// Lives here, not in tag-roles.ts, to avoid a cycle (settings imports from
// tag-roles for types and normalization helpers).
// ---------------------------------------------------------------------------

export function useTagRoles(vaultId: string | null): {
  roles: TagRoles;
  setRoles: (next: TagRoles | null) => void;
} {
  const { settings, update } = useVaultSettings(vaultId);
  const setRoles = useCallback(
    (next: TagRoles | null) => {
      if (!vaultId) return;
      const patch = next ?? { ...DEFAULT_TAG_ROLES };
      void update({ tagRoles: normalizeTagRoles(patch) });
    },
    [vaultId, update],
  );
  return { roles: settings.tagRoles, setRoles };
}
