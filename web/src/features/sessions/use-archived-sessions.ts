import { useQuery } from "@tanstack/react-query";
import { fetchArchivedSessions } from "@/api/agent";

/**
 * Archived sessions are only listed when the rail's archive filter is open:
 * the server has to scan every gzip in omp's archive tree for the list.
 */
export function useArchivedSessions(enabled: boolean) {
  return useQuery({
    queryKey: ["archived-sessions"],
    queryFn: fetchArchivedSessions,
    enabled,
    staleTime: 10_000,
  });
}
