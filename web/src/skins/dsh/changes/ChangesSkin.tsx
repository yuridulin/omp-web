import { ChangesList } from "@/features/workbench/ChangesList";
import type { ChangesSlotProps } from "@/slots/changes";

export function ChangesSkin(props: ChangesSlotProps) {
  return <ChangesList {...props} />;
}
