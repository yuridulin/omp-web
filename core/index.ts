/**
 * Public surface of the session core.
 *
 * A front end imports this barrel only: state types, the intent vocabulary, the
 * machine, and the pure engines behind it. No module here imports React, the
 * DOM, fetch, storage or timers — hosts supply those through ports.
 */

export * from "./state";
export * from "./reducer";
export * from "./machine";
export * from "./history";
export * from "./commands";
export * from "./drafts";
export * from "./branching";
export * from "./slash";
export * from "./web-commands";
export * from "./ports";
export type { FrameCursor, WireEvent } from "./protocol";
export * from "./urls";
export * from "./hosttools";
export * from "./extensions";
export * from "./subagents";
export * from "./models";
export * from "./catalog";
export * from "./usage";
export * from "./todos";
export * from "./display";
export * from "./search";
export * from "./btw";
export * from "./notifications";
export * from "./prediction";
export * from "./attachments";
export * from "./preferences";
export * from "./tool-presets";
export * from "./navigation";
export * from "./fork";
export * from "./compaction";
export * from "./transcript";
export * from "./coalescer";
