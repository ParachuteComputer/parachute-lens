import { useEffect, useState } from "react";
import { discoverAuthServer } from "./discovery";
import { useVaultStore } from "./store";

export type ProbeStatus = "probing" | "found" | "not-found" | "skipped";

export interface ProbeResult {
  status: ProbeStatus;
  origin: string | null;
}

const DEFAULT_TIMEOUT_MS = 2500;

// Probe an origin for a Parachute Vault by fetching RFC 8414 metadata. Returns
// the origin on success, null on any failure (network, non-200, bad metadata,
// timeout). If the given origin has a non-default port and fails, retry with
// the port stripped — covers reverse-proxy setups (e.g. Tailscale serve) where
// Lens is reachable at :8443 but the vault is on :443.
export async function probeVaultAtOrigin(
  origin: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch.bind(globalThis),
): Promise<string | null> {
  const tryOnce = async (candidate: string): Promise<string | null> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const withSignal: typeof fetch = (input, init) =>
      fetchImpl(input, { ...(init ?? {}), signal: ctrl.signal });
    try {
      await discoverAuthServer(candidate, withSignal);
      return candidate;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const primary = await tryOnce(origin);
  if (primary) return primary;

  try {
    const url = new URL(origin);
    if (url.port) {
      url.port = "";
      return await tryOnce(url.origin);
    }
  } catch {}
  return null;
}

// Probe the current window's origin on mount, but skip if the user already has
// vaults in storage — their choice is already made and a probe would just be
// noise + a wasted request.
export function useOriginVaultProbe(): ProbeResult {
  const hasVaults = useVaultStore((s) => Object.keys(s.vaults).length > 0);
  const [result, setResult] = useState<ProbeResult>(() => ({
    status: hasVaults ? "skipped" : "probing",
    origin: null,
  }));

  useEffect(() => {
    if (hasVaults) {
      setResult({ status: "skipped", origin: null });
      return;
    }
    let cancelled = false;
    setResult({ status: "probing", origin: null });
    probeVaultAtOrigin(window.location.origin).then((found) => {
      if (cancelled) return;
      setResult(found ? { status: "found", origin: found } : { status: "not-found", origin: null });
    });
    return () => {
      cancelled = true;
    };
  }, [hasVaults]);

  return result;
}
