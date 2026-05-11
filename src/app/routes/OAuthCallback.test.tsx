import { OAuthCallback } from "@/app/routes/OAuthCallback";
import { savePendingOAuth } from "@/lib/vault/storage";
import type { PendingOAuthState } from "@/lib/vault/types";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pending: PendingOAuthState = {
  issuerUrl: "http://localhost:1940",
  issuer: "http://localhost:1940",
  tokenEndpoint: "http://localhost:1940/oauth/token",
  clientId: "client-123",
  codeVerifier: "verifier-abc",
  state: "state-xyz",
  redirectUri: "http://localhost:3000/oauth/callback",
  scope: "vault:read vault:write",
  startedAt: "2026-05-11T00:00:00.000Z",
};

function mockTokenResponse(response: { ok?: boolean; status?: number; body: string }) {
  const impl = vi.fn<typeof fetch>(async () => {
    return {
      ok: response.ok ?? false,
      status: response.status ?? 401,
      json: async () => JSON.parse(response.body),
      text: async () => response.body,
    } as Response;
  });
  vi.stubGlobal("fetch", impl);
  return impl;
}

function renderCallback() {
  return render(
    <MemoryRouter initialEntries={["/oauth/callback?code=auth-code&state=state-xyz"]}>
      <Routes>
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route path="/add" element={<div>Add vault page</div>} />
        <Route path="/" element={<div>Home page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OAuthCallback pending-approval rendering", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders an 'Open approval page' link when the hub includes approve_url", async () => {
    savePendingOAuth(pending);
    const approveUrl = "http://localhost:1940/admin/approve-client/client-123";
    mockTokenResponse({
      body: JSON.stringify({
        error: "invalid_client",
        error_description: "client is registered but has not been approved by the hub operator",
        approve_url: approveUrl,
        cli_alternative: "parachute auth approve-client client-123",
      }),
    });

    renderCallback();

    const link = await screen.findByRole("link", { name: /open approval page/i });
    expect(link).toHaveAttribute("href", approveUrl);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByText(/your hub admin needs to approve this app/i)).toBeInTheDocument();
    // CLI alternative is shown as the secondary path.
    expect(screen.getByText(/parachute auth approve-client client-123/)).toBeInTheDocument();
    // Does NOT show the raw "Connection failed" error UI.
    expect(screen.queryByText(/connection failed/i)).not.toBeInTheDocument();
  });

  it("renders the CLI fallback alone when a pre-#240 hub omits approve_url", async () => {
    savePendingOAuth(pending);
    mockTokenResponse({
      body: JSON.stringify({
        error: "invalid_client",
        error_description: "client pending approval",
        cli_alternative: "parachute auth approve-client client-123",
      }),
    });

    renderCallback();

    await waitFor(() => {
      expect(screen.getByText(/waiting for hub approval/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: /open approval page/i })).not.toBeInTheDocument();
    expect(screen.getByText(/parachute auth approve-client client-123/)).toBeInTheDocument();
  });

  it("falls back to the generic 'Connection failed' UI for non-pending-approval errors", async () => {
    savePendingOAuth(pending);
    mockTokenResponse({
      body: JSON.stringify({
        error: "invalid_grant",
        error_description: "authorization code expired",
      }),
      status: 400,
    });

    renderCallback();

    await waitFor(() => {
      expect(screen.getByText(/connection failed/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/waiting for hub approval/i)).not.toBeInTheDocument();
  });
});
