import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

export function useSessions() {
  return useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/agent/sessions");
      if (error) throw new Error(error.error ?? "Request failed");
      if (!data) throw new Error("Unexpected empty response");
      return data;
    },
    refetchInterval: 5000,
  });
}
