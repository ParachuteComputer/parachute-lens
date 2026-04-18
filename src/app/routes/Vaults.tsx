import { useVaultStore } from "@/lib/vault";
import { Link } from "react-router";

export function Vaults() {
  const vaults = useVaultStore((s) => s.vaults);
  const activeVaultId = useVaultStore((s) => s.activeVaultId);
  const removeVault = useVaultStore((s) => s.removeVault);
  const setActiveVault = useVaultStore((s) => s.setActiveVault);

  const list = Object.values(vaults).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-serif text-4xl tracking-tight">Vaults</h1>
        <Link
          to="/add"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Add vault
        </Link>
      </div>

      {list.length === 0 ? (
        <p className="text-fg-muted">No vaults connected yet.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((vault) => {
            const isActive = vault.id === activeVaultId;
            return (
              <li
                key={vault.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-lg text-fg">{vault.name}</span>
                    {isActive ? (
                      <span className="rounded bg-accent/10 px-2 py-0.5 text-xs text-accent">
                        active
                      </span>
                    ) : null}
                    <span className="rounded border border-border px-2 py-0.5 text-xs text-fg-dim">
                      {vault.scope}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-fg-muted">{vault.url}</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  {!isActive ? (
                    <button
                      type="button"
                      onClick={() => setActiveVault(vault.id)}
                      className="text-fg-muted hover:text-accent"
                    >
                      Make active
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Remove ${vault.name}? The access token will be deleted.`)) {
                        removeVault(vault.id);
                      }
                    }}
                    className="text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
