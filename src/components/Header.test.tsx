import { Header } from "@/components/Header";
import { useVaultStore } from "@/lib/vault/store";
import type { VaultRecord } from "@/lib/vault/types";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeVault(partial: Partial<VaultRecord> & Pick<VaultRecord, "id" | "url">): VaultRecord {
  return {
    name: "",
    issuer: partial.url,
    clientId: "client-test",
    scope: "full",
    addedAt: "2026-04-18T00:00:00.000Z",
    lastUsedAt: "2026-04-18T00:00:00.000Z",
    ...partial,
  };
}

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  );
}

describe("Header vault label fallback", () => {
  beforeEach(() => {
    useVaultStore.setState({ vaults: {}, activeVaultId: null });
    // Stub fetch so the popover's well-known fetcher doesn't escape into a
    // real network call during component render.
    global.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ vaults: [], services: [] }),
        }) as Response,
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    useVaultStore.setState({ vaults: {}, activeVaultId: null });
    vi.restoreAllMocks();
  });

  it("renders the vault name when present", () => {
    useVaultStore.setState({
      vaults: { a: makeVault({ id: "a", url: "http://localhost:1940", name: "default" }) },
      activeVaultId: "a",
    });
    renderHeader();
    expect(screen.getByRole("button", { name: /active vault: default/i })).toBeInTheDocument();
  });

  it("falls back to the URL host when name is empty", () => {
    useVaultStore.setState({
      vaults: { a: makeVault({ id: "a", url: "https://vault.example.com:8443/api", name: "" }) },
      activeVaultId: "a",
    });
    renderHeader();
    expect(
      screen.getByRole("button", { name: /active vault: vault\.example\.com:8443/i }),
    ).toBeInTheDocument();
  });

  it("falls back to the raw URL when both name and URL are unparseable", () => {
    useVaultStore.setState({
      vaults: { a: makeVault({ id: "a", url: "not a url", name: "" }) },
      activeVaultId: "a",
    });
    renderHeader();
    expect(screen.getByRole("button", { name: /active vault: not a url/i })).toBeInTheDocument();
  });
});
