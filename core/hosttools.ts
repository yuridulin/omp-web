/**
 * Host-tool bridge: the capabilities omp-web registers so the agent can act on
 * the user's browser and workspace (open a URL, raise a notification, open a
 * file tab), plus the `pi-web:` resources its read/write tools may resolve.
 *
 * This module owns only the pure half of the bridge: the advertised tool and
 * scheme definitions, execution over a handler port, the `host_*` frame
 * parsers, and the result frames. Opening a window, raising a notification or
 * touching the clipboard is the host's job, injected through handlers.
 */

import { isRecord } from "./guards";
import { safeOpenUrl } from "./urls";

export interface HostToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface HostUriScheme {
  scheme: string;
  description: string;
  writable: boolean;
}

export const HOST_TOOL_DEFINITIONS: readonly HostToolDefinition[] = [
  {
    name: "open_url",
    description: "Open a URL in the user's browser.",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "notify",
    description: "Show a browser notification to the user.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        message: { type: "string", description: "Optional notification body." },
      },
      required: ["title"],
    },
  },
  {
    name: "open_file",
    description: "Open a file in the workspace file viewer.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Absolute or workspace-relative file path." } },
      required: ["path"],
    },
  },
];

/**
 * URI schemes the agent's read/write tools can resolve through the web UI.
 * `pi-web://clipboard` reads and writes the user's clipboard (best effort: the
 * browser may gate both behind a permission prompt).
 */
export const HOST_URI_SCHEMES: readonly HostUriScheme[] = [
  {
    scheme: "pi-web",
    description: "Browser-integrated resources: pi-web://clipboard reads/writes the user's clipboard via the web UI.",
    writable: true,
  },
];

export interface HostToolHandlers {
  /** Open a validated URL; returns the result text reported to the agent. */
  openUrl(url: string): string;
  /** Open a file tab; may return the result text reported to the agent. */
  openFile?(path: string, name: string): string | void;
  /** Raise a notification. A denied permission is not an error. */
  notify?(title: string, message: string): void | Promise<void>;
}

export interface HostToolResult {
  text: string;
  isError: boolean;
}

/**
 * Execute a host tool and return the toolResult the agent sees. The result
 * texts are part of the wire contract: the reference host sends them verbatim.
 */
export async function runHostTool(
  toolName: string,
  args: Record<string, unknown>,
  handlers: HostToolHandlers,
): Promise<HostToolResult> {
  switch (toolName) {
    case "open_url": {
      const raw = typeof args.url === "string" ? args.url : "";
      // Unsafe input is reported as an error only when the agent actually sent
      // something; a missing URL is a quiet refusal.
      if (!safeOpenUrl(raw)) return { text: "Unsafe or invalid URL not opened", isError: raw.length > 0 };
      return { text: handlers.openUrl(raw), isError: false };
    }
    case "notify": {
      const title = typeof args.title === "string" ? args.title : "OMP";
      const message = typeof args.message === "string" ? args.message : "";
      if (handlers.notify) {
        try {
          await handlers.notify(title, message);
        } catch {
          // Blocked permission or a dismissed prompt: the call still succeeded.
        }
      }
      return { text: "Notification shown", isError: false };
    }
    case "open_file": {
      const path = typeof args.path === "string" ? args.path : "";
      if (!path) return { text: "No path provided", isError: true };
      let text: string | void = undefined;
      if (handlers.openFile) {
        try {
          // `path.split(/[\\/]/).pop()` is the basename; a trailing separator
          // leaves it empty, so fall back to the full path.
          text = handlers.openFile(path, path.split(/[\\/]/).pop() || path);
        } catch {
          // A failed navigation still counts as handled.
        }
      }
      return { text: text || `Opened ${path}`, isError: false };
    }
    default:
      return { text: `Host tool "${toolName}" is not available in omp-web`, isError: true };
  }
}

export interface HostToolCall {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
}

/** A `host_tool_call` frame; null when the frame cannot be answered. */
export function parseHostToolCall(frame: unknown): HostToolCall | null {
  if (!isRecord(frame)) return null;
  const id = frame.id;
  const toolName = frame.toolName;
  if (typeof id !== "string" || !id) return null;
  if (typeof toolName !== "string" || !toolName) return null;
  const args = isRecord(frame.arguments) ? frame.arguments : isRecord(frame.args) ? frame.args : {};
  return { id, toolName, args };
}

/** The `host_tool_result` frame answering a `host_tool_call`. */
export function hostToolResultFrame(id: string, result: HostToolResult): Record<string, unknown> {
  return {
    type: "host_tool_result",
    id,
    isError: result.isError,
    result: { content: [{ type: "text", text: result.text }] },
  };
}

export interface HostUriRequest {
  id: string;
  url: string;
  operation: "read" | "write";
  content?: string;
}

/** A `host_uri_request` frame; null when the frame cannot be answered. */
export function parseHostUriRequest(frame: unknown): HostUriRequest | null {
  if (!isRecord(frame)) return null;
  const id = frame.id;
  const url = frame.url;
  if (typeof id !== "string" || !id) return null;
  if (typeof url !== "string" || !url) return null;
  const request: HostUriRequest = {
    id,
    url,
    // Only an explicit "write" is a write; anything else reads.
    operation: frame.operation === "write" ? "write" : "read",
  };
  if (typeof frame.content === "string") request.content = frame.content;
  return request;
}

export interface HostUriResultPayload {
  content?: string;
  contentType?: "text/markdown" | "application/json" | "text/plain";
  isError?: boolean;
  error?: string;
}

/** The `host_uri_result` frame answering a `host_uri_request`; absent fields
 * stay absent so the agent does not mistake "no content" for an empty read. */
export function hostUriResultFrame(id: string, payload: HostUriResultPayload): Record<string, unknown> {
  const frame: Record<string, unknown> = { type: "host_uri_result", id };
  if (payload.content !== undefined) frame.content = payload.content;
  if (payload.contentType !== undefined) frame.contentType = payload.contentType;
  if (payload.isError !== undefined) frame.isError = payload.isError;
  if (payload.error !== undefined) frame.error = payload.error;
  return frame;
}
