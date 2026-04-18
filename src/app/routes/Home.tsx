import { useVaultInfo, useVaultStore } from "@/lib/vault";
import { Link } from "react-router";

export function Home() {
  const activeVault = useVaultStore((s) => s.getActiveVault());
  const info = useVaultInfo();

  if (!activeVault) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <p className="mb-8 font-serif text-xl italic text-fg-muted">
          A lens onto any Parachute Vault.
        </p>
        <h1 className="mb-4 font-serif text-5xl tracking-tight">Lens</h1>
        <p className="mb-10 text-fg-dim tracking-wide">
          Point it at a vault. Sign in. Browse, edit, visualize.
        </p>

        <Link
          to="/add"
          className="inline-block rounded-md bg-accent px-6 py-3 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Connect a vault
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="mb-2 text-sm uppercase tracking-wider text-fg-dim">Connected vault</p>
      <h1 className="mb-2 font-serif text-4xl tracking-tight">{activeVault.name}</h1>
      <p className="mb-10 font-mono text-sm text-fg-muted">{activeVault.url}</p>

      <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
        {info.isPending ? (
          <p className="text-fg-muted">Loading vault info…</p>
        ) : info.isError ? (
          <div>
            <p className="mb-1 font-medium text-red-400">Could not load vault info</p>
            <p className="text-sm text-fg-muted">{info.error.message}</p>
          </div>
        ) : info.data ? (
          <dl className="grid grid-cols-3 gap-8 text-center">
            <div>
              <dt className="text-xs uppercase tracking-wider text-fg-dim">Notes</dt>
              <dd className="mt-2 font-serif text-3xl text-fg">
                {info.data.stats?.noteCount ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-fg-dim">Tags</dt>
              <dd className="mt-2 font-serif text-3xl text-fg">{info.data.stats?.tagCount ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-fg-dim">Links</dt>
              <dd className="mt-2 font-serif text-3xl text-fg">
                {info.data.stats?.linkCount ?? 0}
              </dd>
            </div>
          </dl>
        ) : null}
      </div>

      <p className="mt-8 text-sm text-fg-dim">
        Note list and editor land in the next PRs. This page confirms the vault handshake works.
      </p>
    </div>
  );
}
