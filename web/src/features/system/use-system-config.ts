import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  enableProvider,
  fetchConfiguredProviders,
  fetchConnectedProviders,
  fetchLoginProviders,
  fetchModelRoles,
  fetchNativeSettings,
  fetchWebSettings,
  saveModelRoles,
  saveNativeSettings,
  saveWebSettings,
  type ConfiguredProvider,
  type ConnectedProvider,
  type LoginProvider,
  type ModelRoles,
  type NativeSettingsFile,
  type WebSettings,
  type WebSettingsPatch,
} from "@/api/system-config";

export const systemConfigKeys = {
  modelRoles: ["system", "model-roles"] as const,
  nativeSettings: ["system", "settings"] as const,
  webSettings: ["system", "web-settings"] as const,
  loginProviders: ["system", "auth", "providers"] as const,
  configuredProviders: ["system", "auth", "all-providers"] as const,
  connectedProviders: ["system", "connected-providers"] as const,
  models: ["models"] as const,
};

export function useModelRoles(): UseQueryResult<{ path: string; roles: ModelRoles }> {
  return useQuery({
    queryKey: systemConfigKeys.modelRoles,
    queryFn: fetchModelRoles,
    staleTime: 30_000,
  });
}

export function useSaveModelRoles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roles: ModelRoles) => saveModelRoles(roles),
    onSuccess: (roles) => {
      queryClient.setQueryData<{ path: string; roles: ModelRoles }>(
        systemConfigKeys.modelRoles,
        (previous) => ({ path: previous?.path ?? "", roles }),
      );
      void queryClient.invalidateQueries({ queryKey: systemConfigKeys.models });
    },
  });
}

export function useNativeSettings(): UseQueryResult<NativeSettingsFile> {
  return useQuery({
    queryKey: systemConfigKeys.nativeSettings,
    queryFn: fetchNativeSettings,
    staleTime: 15_000,
  });
}

export function useSaveNativeSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: NativeSettingsFile["settings"]) => saveNativeSettings(settings),
    onSuccess: (settings) => {
      queryClient.setQueryData<NativeSettingsFile>(
        systemConfigKeys.nativeSettings,
        (previous) => ({ path: previous?.path ?? "", settings }),
      );
      void queryClient.invalidateQueries({ queryKey: systemConfigKeys.models });
    },
  });
}

export function useWebSettings(): UseQueryResult<WebSettings> {
  return useQuery({
    queryKey: systemConfigKeys.webSettings,
    queryFn: fetchWebSettings,
    staleTime: 15_000,
  });
}

export function useSaveWebSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: WebSettingsPatch) => saveWebSettings(patch),
    onSuccess: (settings) => {
      queryClient.setQueryData<WebSettings>(systemConfigKeys.webSettings, settings);
    },
  });
}

export function useLoginProviders(): UseQueryResult<LoginProvider[]> {
  return useQuery({
    queryKey: systemConfigKeys.loginProviders,
    queryFn: fetchLoginProviders,
    staleTime: 30_000,
  });
}

export function useConfiguredProviders(): UseQueryResult<ConfiguredProvider[]> {
  return useQuery({
    queryKey: systemConfigKeys.configuredProviders,
    queryFn: fetchConfiguredProviders,
    staleTime: 30_000,
  });
}

export function useConnectedProviders(): UseQueryResult<ConnectedProvider[]> {
  return useQuery({
    queryKey: systemConfigKeys.connectedProviders,
    queryFn: fetchConnectedProviders,
    staleTime: 30_000,
  });
}

export function useEnableProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: string) => enableProvider(provider),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: systemConfigKeys.configuredProviders });
      void queryClient.invalidateQueries({ queryKey: systemConfigKeys.connectedProviders });
      void queryClient.invalidateQueries({ queryKey: systemConfigKeys.loginProviders });
      void queryClient.invalidateQueries({ queryKey: systemConfigKeys.models });
    },
  });
}

export function systemConfigErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
