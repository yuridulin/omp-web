import { useQuery } from "@tanstack/react-query";
import { fetchMcpInventory, type McpReport } from "@/api/mcp";
import { fetchSkills, type SkillListing } from "@/api/skills";
import {
  fetchProviderUsage,
  fetchUsageReport,
  type ProviderUsage,
  type UsageGranularity,
  type UsageRange,
} from "@/api/system-usage";

export function useUsageReport(range: UsageRange, granularity: UsageGranularity) {
  return useQuery({
    queryKey: ["system-usage", range, granularity],
    queryFn: () => fetchUsageReport(range, granularity),
    staleTime: 30_000,
  });
}

export function useProviderUsage() {
  return useQuery<ProviderUsage>({
    queryKey: ["system-provider-usage"],
    queryFn: fetchProviderUsage,
    staleTime: 60_000,
  });
}

export function useSkills(root: string | null) {
  return useQuery<SkillListing>({
    queryKey: ["system-skills", root],
    queryFn: () => fetchSkills(root as string),
    enabled: Boolean(root),
    staleTime: 10_000,
  });
}

export function useMcpInventory(root: string | null, sessionId: string | null) {
  return useQuery<McpReport>({
    queryKey: ["system-mcp", root, sessionId],
    queryFn: () => fetchMcpInventory({ cwd: root, sessionId }),
    enabled: Boolean(root || sessionId),
    staleTime: 5_000,
  });
}
