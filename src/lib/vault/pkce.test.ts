import { describe, expect, it } from "vitest";
import { deriveCodeChallenge, generateCodeVerifier, generateState } from "./pkce";

describe("generateCodeVerifier", () => {
  it("produces URL-safe base64 of reasonable length", () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(v.length).toBeGreaterThanOrEqual(43);
  });

  it("is non-deterministic across calls", () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });

  it("rejects out-of-range entropy", () => {
    expect(() => generateCodeVerifier(16)).toThrow();
    expect(() => generateCodeVerifier(128)).toThrow();
  });
});

describe("deriveCodeChallenge (S256)", () => {
  it("matches the RFC 7636 test vector", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const expected = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    expect(await deriveCodeChallenge(verifier)).toBe(expected);
  });

  it("is deterministic for the same verifier", async () => {
    const verifier = generateCodeVerifier();
    expect(await deriveCodeChallenge(verifier)).toBe(await deriveCodeChallenge(verifier));
  });
});

describe("generateState", () => {
  it("produces a URL-safe random string", () => {
    expect(generateState()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
