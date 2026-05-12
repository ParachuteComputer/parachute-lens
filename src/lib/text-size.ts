// View-level text-size knob — a per-device zoom preference for editor + read
// views. Stored separately from theme because eye-days vary independently of
// light/dark preference. Three steps deliberate: more would force tiny CSS
// distinctions; fewer would skip the middle ground that "larger" reaches.
//
// Affects only how things render — the markdown on disk is untouched. The
// implementation is a `data-text-size="…"` attribute on `<html>` that gates
// three CSS-variable overrides in styles/index.css. Editor (CodeMirror) reads
// the variable through `font-size: var(--font-size-base)`; reader
// (MarkdownView) uses `.prose-note` whose `font-size: var(--font-size-prose)`
// scales together.
//
// Mirrors `theme.ts` in shape on purpose — same read/write/apply trio, same
// "default" sentinel-removes-attribute pattern.

export type TextSize = "default" | "larger" | "largest";

export const TEXT_SIZE_STORAGE_KEY = "notes:textSize";
export const TEXT_SIZES: TextSize[] = ["default", "larger", "largest"];

function isTextSize(v: unknown): v is TextSize {
  return v === "default" || v === "larger" || v === "largest";
}

export function readStoredTextSize(): TextSize {
  try {
    const v = localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
    return isTextSize(v) ? v : "default";
  } catch {
    return "default";
  }
}

export function writeStoredTextSize(size: TextSize): void {
  try {
    if (size === "default") localStorage.removeItem(TEXT_SIZE_STORAGE_KEY);
    else localStorage.setItem(TEXT_SIZE_STORAGE_KEY, size);
  } catch {
    // storage unavailable — caller still applies visually
  }
}

export function applyTextSize(size: TextSize, root: HTMLElement = document.documentElement): void {
  if (size === "default") root.removeAttribute("data-text-size");
  else root.setAttribute("data-text-size", size);
}

export function textSizeLabel(size: TextSize): string {
  if (size === "larger") return "Larger";
  if (size === "largest") return "Largest";
  return "Default";
}
