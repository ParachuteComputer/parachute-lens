import { describe, expect, it, vi } from "vitest";
import { probeVaultAtOrigin } from "./probe";

const validMetadata = {
  issuer: "http://localhost:1940",
  authorization_endpoint: "http://localhost:1940/oauth/authorize",
  token_endpoint: "http://localhost:1940/oauth/token",
  registration_endpoint: "http://localhost:1940/oauth/register",
  response_types_supported: ["code"],
  code_challenge_methods_supported: ["S256"],
  grant_types_supported: ["authorization_code"],
  token_endpoint_auth_methods_supported: ["none"],
  scopes_supported: ["full", "read"],
};

function mockFetch(
  responses: Array<
    { ok?: boolean; status?: number; json?: unknown; text?: string } | "network-error"
  >,
) {
  const queue = [...responses];
  return vi.fn<typeof fetch>(async () => {
    const next = queue.shift();
    if (!next) throw new Error("unexpected fetch call");
    if (next === "network-error") throw new Error("network down");
    return {
      ok: next.ok ?? true,
      status: next.status ?? 200,
      json: async () => next.json,
      text: async () => next.text ?? "",
    } as Response;
  });
}

describe("probeVaultAtOrigin", () => {
  it("returns the origin when discovery succeeds", async () => {
    const fetchImpl = mockFetch([{ json: validMetadata }]);
    const result = await probeVaultAtOrigin("http://localhost:1940", 500, fetchImpl);
    expect(result).toBe("http://localhost:1940");
  });

  it("returns null on 404 without bubbling the error", async () => {
    const fetchImpl = mockFetch([{ ok: false, status: 404 }]);
    const result = await probeVaultAtOrigin("http://localhost:1940", 500, fetchImpl);
    expect(result).toBeNull();
  });

  it("returns null when metadata validation fails", async () => {
    const fetchImpl = mockFetch([
      { json: { ...validMetadata, code_challenge_methods_supported: ["plain"] } },
    ]);
    const result = await probeVaultAtOrigin("http://localhost:1940", 500, fetchImpl);
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    const fetchImpl = mockFetch(["network-error"]);
    const result = await probeVaultAtOrigin("http://localhost:1940", 500, fetchImpl);
    expect(result).toBeNull();
  });

  it("falls back to the port-stripped origin when the primary fails", async () => {
    // Primary (:8443) 404s; stripped origin (https://example.com) succeeds.
    const fetchImpl = mockFetch([
      { ok: false, status: 404 },
      { json: { ...validMetadata, issuer: "https://example.com" } },
    ]);
    const result = await probeVaultAtOrigin("https://example.com:8443", 500, fetchImpl);
    expect(result).toBe("https://example.com");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry when the origin has no port", async () => {
    const fetchImpl = mockFetch([{ ok: false, status: 404 }]);
    const result = await probeVaultAtOrigin("https://example.com", 500, fetchImpl);
    expect(result).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
