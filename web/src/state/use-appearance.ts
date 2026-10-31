import { useSyncExternalStore } from "react";
import { getAppearance, subscribeAppearance, type AppearanceState } from "./appearance-store";

export function useAppearance(): AppearanceState {
  return useSyncExternalStore(subscribeAppearance, getAppearance, getAppearance);
}
