import type { ChatClasses } from "@/features/chat/classes";
import composer from "./composer.module.css";
import extensionDialog from "./extension-dialog.module.css";
import modelPicker from "./model-picker.module.css";
import queue from "./queue-panel.module.css";
import runningAgents from "./running-agents.module.css";
import transcript from "./transcript.module.css";

/**
 * CSS Modules expose an index signature, so a module cannot structurally
 * satisfy a precise class map. These casts are the one seam where the skin
 * asserts it authored every class the feature components ask for.
 */
export const dshChatClasses: ChatClasses = {
  transcript: transcript as unknown as ChatClasses["transcript"],
  composer: composer as unknown as ChatClasses["composer"],
  queue: queue as unknown as ChatClasses["queue"],
  modelPicker: modelPicker as unknown as ChatClasses["modelPicker"],
  extensionDialog: extensionDialog as unknown as ChatClasses["extensionDialog"],
  runningAgents: runningAgents as unknown as ChatClasses["runningAgents"],
};
