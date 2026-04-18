import { useQuery } from "@tanstack/react-query";
import { VaultClient } from "./client";
import { useVaultStore } from "./store";

export function useActiveVaultClient(): VaultClient | null {
  const vault = useVaultStore((s) => s.getActiveVault());
  const token = useVaultStore((s) => s.getActiveToken());
  if (!vault || !token) return null;
  return new VaultClient({ vaultUrl: vault.url, accessToken: token.accessToken });
}

export function useVaultInfo() {
  const client = useActiveVaultClient();
  const activeId = useVaultStore((s) => s.activeVaultId);

  return useQuery({
    queryKey: ["vaultInfo", activeId],
    enabled: !!client,
    queryFn: () => client!.vaultInfo(true),
    staleTime: 30_000,
  });
}
