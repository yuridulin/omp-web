import { useQuery } from "@tanstack/react-query";
import { fetchLiveSessionState } from "@/api/agent";

export interface SessionModelFallback {
  model: { provider: string; modelId: string } | null;
  thinkingLevel: string | null;
}

export interface SessionModelValue {
  provider: string;
  modelId: string;
  thinkingLevel: string;
}

export interface SessionModelResult {
  value: SessionModelValue | null;
  loading: boolean;
  refetch: () => Promise<unknown>;
}

export function useSessionModel(
  sessionId: string | null,
  fallback: SessionModelFallback | null,
): SessionModelResult {
  const query = useQuery({
    queryKey: ["session-live-model", sessionId],
    queryFn: async () => {
      if (sessionId === null) return { model: null, thinkingLevel: null };
      return fetchLiveSessionState(sessionId);
    },
    enabled: sessionId !== null,
    staleTime: 5_000,
  });

  const live = query.data;
  const model = live?.model ?? fallback?.model ?? null;
  const thinkingLevel = live?.thinkingLevel ?? fallback?.thinkingLevel ?? "off";
  const value: SessionModelValue | null = model
    ? { provider: model.provider, modelId: model.modelId, thinkingLevel }
    : null;

  return { value, loading: query.isLoading, refetch: () => query.refetch() };
}
