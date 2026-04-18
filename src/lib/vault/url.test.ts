import { describe, expect, it } from "vitest";
import { normalizeVaultUrl, vaultIdFromUrl } from "./url";

describe("normalizeVaultUrl", () => {
  it("adds https when scheme is missing", () => {
    expect(normalizeVaultUrl("vault.example.com")).toBe("https://vault.example.com");
  });

  it("preserves http scheme for local URLs", () => {
    expect(normalizeVaultUrl("http://localhost:1940")).toBe("http://localhost:1940");
  });

  it("strips trailing slash", () => {
    expect(normalizeVaultUrl("http://localhost:1940/")).toBe("http://localhost:1940");
  });

  it("strips common API and OAuth suffixes", () => {
    expect(normalizeVaultUrl("http://localhost:1940/api")).toBe("http://localhost:1940");
    expect(normalizeVaultUrl("http://localhost:1940/mcp")).toBe("http://localhost:1940");
    expect(normalizeVaultUrl("http://localhost:1940/oauth/authorize")).toBe(
      "http://localhost:1940",
    );
    expect(normalizeVaultUrl("http://localhost:1940/.well-known/oauth-authorization-server")).toBe(
      "http://localhost:1940",
    );
  });

  it("preserves vault-scoped paths", () => {
    expect(normalizeVaultUrl("https://vault.example.com/vaults/work")).toBe(
      "https://vault.example.com/vaults/work",
    );
  });

  it("strips suffix after vault-scoped path", () => {
    expect(normalizeVaultUrl("https://vault.example.com/vaults/work/api")).toBe(
      "https://vault.example.com/vaults/work",
    );
  });

  it("lowercases the host", () => {
    expect(normalizeVaultUrl("https://VAULT.EXAMPLE.COM/")).toBe("https://vault.example.com");
  });

  it("strips query strings and fragments", () => {
    expect(normalizeVaultUrl("https://vault.example.com/?foo=bar#x")).toBe(
      "https://vault.example.com",
    );
  });

  it("rejects empty input", () => {
    expect(() => normalizeVaultUrl("")).toThrow(/required/i);
    expect(() => normalizeVaultUrl("   ")).toThrow(/required/i);
  });

  it("rejects malformed URLs", () => {
    expect(() => normalizeVaultUrl("::not a url")).toThrow(/valid URL/i);
  });
});

describe("vaultIdFromUrl", () => {
  it("derives a deterministic, filesystem-safe id", () => {
    expect(vaultIdFromUrl("http://localhost:1940")).toBe("localhost_1940");
    expect(vaultIdFromUrl("https://vault.example.com/vaults/work")).toBe(
      "vault.example.com_vaults_work",
    );
  });
});
