import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LENS_SETTINGS,
  SETTINGS_NOTE_PATH,
  SETTINGS_SCHEMA_VERSION,
  applySettingsPatch,
  deleteCachedSettings,
  extractLensSettings,
  loadCachedSettings,
  normalizeLensSettings,
  saveCachedSettings,
} from "./settings";
import { DEFAULT_TAG_ROLES } from "./tag-roles";
import type { Note } from "./types";

describe("settings note path is stable", () => {
  it("pins the vault path so concurrent devices agree", () => {
    // Changing this would make already-deployed installs lose their settings.
    // Bump schemaVersion and migrate instead if the shape needs to change.
    expect(SETTINGS_NOTE_PATH).toBe(".parachute/lens/settings");
  });
});

describe("normalizeLensSettings", () => {
  it("returns defaults for null/undefined/non-object", () => {
    expect(normalizeLensSettings(null)).toEqual(DEFAULT_LENS_SETTINGS);
    expect(normalizeLensSettings(undefined)).toEqual(DEFAULT_LENS_SETTINGS);
    expect(normalizeLensSettings("nope")).toEqual(DEFAULT_LENS_SETTINGS);
    expect(normalizeLensSettings(42)).toEqual(DEFAULT_LENS_SETTINGS);
  });

  it("fills missing tagRoles with defaults", () => {
    const out = normalizeLensSettings({ schemaVersion: 1 });
    expect(out.schemaVersion).toBe(1);
    expect(out.tagRoles).toEqual(DEFAULT_TAG_ROLES);
  });

  it("merges partial tagRoles over defaults", () => {
    const out = normalizeLensSettings({
      schemaVersion: 1,
      tagRoles: { pinned: "starred" },
    });
    expect(out.tagRoles.pinned).toBe("starred");
    expect(out.tagRoles.archived).toBe(DEFAULT_TAG_ROLES.archived);
  });

  it("defaults schemaVersion when missing", () => {
    const out = normalizeLensSettings({ tagRoles: {} });
    expect(out.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
  });
});

describe("extractLensSettings", () => {
  it("returns defaults for a null note", () => {
    expect(extractLensSettings(null)).toEqual(DEFAULT_LENS_SETTINGS);
  });

  it("returns defaults when metadata is missing or non-object", () => {
    const note: Note = { id: "n1", createdAt: "2026-04-22T00:00:00Z" };
    expect(extractLensSettings(note)).toEqual(DEFAULT_LENS_SETTINGS);
  });

  it("returns defaults when metadata.lens is missing", () => {
    const note: Note = {
      id: "n1",
      createdAt: "2026-04-22T00:00:00Z",
      metadata: { other: "value" },
    };
    expect(extractLensSettings(note)).toEqual(DEFAULT_LENS_SETTINGS);
  });

  it("reads the lens sub-object from metadata", () => {
    const note: Note = {
      id: "n1",
      createdAt: "2026-04-22T00:00:00Z",
      metadata: {
        lens: {
          schemaVersion: 1,
          tagRoles: { pinned: "favs", archived: "done" },
        },
      },
    };
    const out = extractLensSettings(note);
    expect(out.tagRoles.pinned).toBe("favs");
    expect(out.tagRoles.archived).toBe("done");
    expect(out.tagRoles.captureVoice).toBe(DEFAULT_TAG_ROLES.captureVoice);
  });
});

describe("applySettingsPatch", () => {
  it("returns base unchanged for an empty patch", () => {
    const out = applySettingsPatch(DEFAULT_LENS_SETTINGS, {});
    expect(out).toEqual(DEFAULT_LENS_SETTINGS);
  });

  it("shallow-merges tagRoles onto the base", () => {
    const base = {
      ...DEFAULT_LENS_SETTINGS,
      tagRoles: { ...DEFAULT_TAG_ROLES, pinned: "starred" },
    };
    const out = applySettingsPatch(base, {
      tagRoles: { archived: "done" },
    });
    // Preserves the earlier pinned override and adds archived.
    expect(out.tagRoles.pinned).toBe("starred");
    expect(out.tagRoles.archived).toBe("done");
    expect(out.tagRoles.captureVoice).toBe(DEFAULT_TAG_ROLES.captureVoice);
  });

  it("normalizes incoming tagRoles (strips #, trims, falls back on blank)", () => {
    const out = applySettingsPatch(DEFAULT_LENS_SETTINGS, {
      tagRoles: { pinned: "  #fav  ", archived: "   " },
    });
    expect(out.tagRoles.pinned).toBe("fav");
    expect(out.tagRoles.archived).toBe(DEFAULT_TAG_ROLES.archived);
  });

  it("updates schemaVersion when the patch names one", () => {
    const out = applySettingsPatch(DEFAULT_LENS_SETTINGS, { schemaVersion: 2 });
    expect(out.schemaVersion).toBe(2);
  });
});

describe("cache round-trip", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("returns null when nothing is cached", () => {
    expect(loadCachedSettings("v1")).toBeNull();
  });

  it("persists the full entry and reloads it verbatim", () => {
    const entry = {
      settings: { ...DEFAULT_LENS_SETTINGS, tagRoles: { ...DEFAULT_TAG_ROLES, pinned: "fav" } },
      noteUpdatedAt: "2026-04-22T12:00:00Z",
      noteExists: true,
      dirty: false,
    };
    saveCachedSettings("v1", entry);
    const out = loadCachedSettings("v1");
    expect(out).toEqual(entry);
  });

  it("scopes by vaultId", () => {
    saveCachedSettings("v1", {
      settings: { ...DEFAULT_LENS_SETTINGS, tagRoles: { ...DEFAULT_TAG_ROLES, pinned: "one" } },
      noteUpdatedAt: null,
      noteExists: false,
      dirty: true,
    });
    saveCachedSettings("v2", {
      settings: { ...DEFAULT_LENS_SETTINGS, tagRoles: { ...DEFAULT_TAG_ROLES, pinned: "two" } },
      noteUpdatedAt: null,
      noteExists: false,
      dirty: false,
    });
    expect(loadCachedSettings("v1")?.settings.tagRoles.pinned).toBe("one");
    expect(loadCachedSettings("v2")?.settings.tagRoles.pinned).toBe("two");
  });

  it("returns null on malformed JSON", () => {
    localStorage.setItem("lens:settings:v1", "not-json{");
    expect(loadCachedSettings("v1")).toBeNull();
  });

  it("deleteCachedSettings removes the entry", () => {
    saveCachedSettings("v1", {
      settings: DEFAULT_LENS_SETTINGS,
      noteUpdatedAt: null,
      noteExists: false,
      dirty: false,
    });
    deleteCachedSettings("v1");
    expect(loadCachedSettings("v1")).toBeNull();
  });

  it("normalizes a partially-formed cached entry on load", () => {
    // A previous Lens build could have written an entry with a stale shape.
    // Load should be tolerant rather than dropping the whole cache.
    localStorage.setItem(
      "lens:settings:v1",
      JSON.stringify({ settings: { tagRoles: { pinned: "starred" } } }),
    );
    const out = loadCachedSettings("v1");
    expect(out?.settings.tagRoles.pinned).toBe("starred");
    expect(out?.settings.tagRoles.archived).toBe(DEFAULT_TAG_ROLES.archived);
    expect(out?.noteUpdatedAt).toBeNull();
    expect(out?.noteExists).toBe(false);
    expect(out?.dirty).toBe(false);
  });
});
