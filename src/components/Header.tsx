import { InstallPrompt } from "@/components/InstallPrompt";
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";
import { TextSizeControl } from "@/components/TextSizeControl";
import { ThemeToggle } from "@/components/ThemeToggle";
import { VaultPopover } from "@/components/VaultPopover";
import { useVaultStore } from "@/lib/vault";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";

export function Header() {
  const location = useLocation();
  const hasVaults = useVaultStore((s) => Object.keys(s.vaults).length > 0);
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu whenever the route changes — otherwise a tap on a
  // nav link would leave the panel open over the destination page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger, not a value used in the body
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <header
      className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <nav className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 md:px-6 md:py-5">
        <Link
          to="/"
          className="font-serif text-lg tracking-tight text-fg hover:text-accent md:text-xl"
        >
          Parachute Notes
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-3 md:flex">
          {hasVaults ? (
            <>
              <Link to="/" className="text-sm text-fg-muted hover:text-accent">
                Notes
              </Link>
              <Link to="/tags" className="text-sm text-fg-muted hover:text-accent">
                Tags
              </Link>
              <Link to="/graph" className="text-sm text-fg-muted hover:text-accent">
                Graph
              </Link>
              <Link to="/activity" className="text-sm text-fg-muted hover:text-accent">
                Activity
              </Link>
              <Link to="/capture" className="text-sm text-fg-muted hover:text-accent">
                + Capture
              </Link>
              <VaultPopover />
              <Link to="/settings" className="text-sm text-fg-muted hover:text-accent">
                Settings
              </Link>
              <SyncStatusIndicator />
              <InstallPrompt />
              <TextSizeControl />
              <ThemeToggle />
            </>
          ) : (
            <>
              <span className="text-sm text-fg-dim">No vault connected</span>
              <InstallPrompt />
              <TextSizeControl />
              <ThemeToggle />
            </>
          )}
        </div>

        {/* Mobile cluster: sync status (always visible) + hamburger */}
        <div className="flex items-center gap-2 md:hidden">
          {hasVaults ? <SyncStatusIndicator /> : null}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card text-fg-muted hover:text-accent"
          >
            <span aria-hidden="true" className="font-mono text-base leading-none">
              {menuOpen ? "✕" : "☰"}
            </span>
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div id="mobile-menu" className="border-t border-border bg-bg/95 px-4 py-4 md:hidden">
          {hasVaults ? (
            <div className="flex flex-col gap-3">
              <Link to="/graph" className="py-1 text-sm text-fg hover:text-accent">
                Graph
              </Link>
              <Link to="/activity" className="py-1 text-sm text-fg hover:text-accent">
                Activity
              </Link>
              <div className="mt-1">
                <span className="mb-1 block text-xs uppercase tracking-wider text-fg-dim">
                  Active vault
                </span>
                <VaultPopover variant="inline" />
              </div>
              <div className="mt-1 flex items-center gap-3">
                <InstallPrompt />
                <TextSizeControl />
                <ThemeToggle />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-fg-dim">No vault connected</p>
              <div className="flex items-center gap-3">
                <InstallPrompt />
                <TextSizeControl />
                <ThemeToggle />
              </div>
            </div>
          )}
        </div>
      ) : null}
    </header>
  );
}
