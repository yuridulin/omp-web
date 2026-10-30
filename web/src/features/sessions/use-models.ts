import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { fetchModels, type ModelCatalog } from "@/api/agent";

export function useModels(): UseQueryResult<ModelCatalog> {
  return useQuery({
    queryKey: ["models"],
    queryFn: fetchModels,
    staleTime: 60_000,
  });
}
