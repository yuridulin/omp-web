import { isRecord } from "@/api/guards";

/**
 * Total parser for message content blocks. Every function in this module
 * accepts untrusted boundary data and degrades to empty/plain text instead of
 * throwing, so a malformed SSE frame can never take the transcript down.
 */

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ImageSource {
  type?: string;
  media_type?: string;
  data?: string;
  url?: string;
}

export interface ImageBlock {
  type: "image";
  data?: string;
  mimeType?: string;
  url?: string;
  source?: ImageSource;
}

export interface ThinkingContentBlock {
  type: "thinking";
  thinking: string;
  deferred: boolean;
}

export interface ToolCallBlock {
  type: "toolCall";
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}

export type ContentBlock = TextBlock | ImageBlock | ThinkingContentBlock | ToolCallBlock;

function safeImageUrl(input: string): string | null {
  const value = input.trim();
  if (value === "") return null;
  if (value.startsWith("data:image/") || value.startsWith("blob:")) return value;
  if (value.startsWith("/")) return value.startsWith("//") ? null : value;
  if (/^https?:\/\//i.test(value)) return value;
  return null;
}

function toDataUrl(data: string, mimeType: string): string {
  if (data.startsWith("data:")) return data;
  const mime = /^image\/[a-z0-9.+-]+$/i.test(mimeType) ? mimeType : "image/png";
  return `data:${mime};base64,${data}`;
}

/**
 * Resolve an image block (or a raw image URL) to a renderable `src`.
 * Accepts `url`, a top-level `data`/`mimeType` pair, or `source.url`/
 * `source.data`/`source.media_type`; only http(s), `/`, `data:image/`, and
 * `blob:` URLs are allowed.
 */
export function imageSrc(image: unknown): string | null {
  if (typeof image === "string") return safeImageUrl(image);
  if (!isRecord(image)) return null;

  if (typeof image.url === "string") {
    const direct = safeImageUrl(image.url);
    if (direct) return direct;
  }
  if (typeof image.data === "string" && image.data.length > 0) {
    const mimeType = typeof image.mimeType === "string" ? image.mimeType : "image/png";
    const data = safeImageUrl(toDataUrl(image.data, mimeType));
    if (data) return data;
  }
  const sourceRecord = image.source;
  if (isRecord(sourceRecord)) {
    if (typeof sourceRecord.url === "string") {
      const sourceUrl = safeImageUrl(sourceRecord.url);
      if (sourceUrl) return sourceUrl;
    }
    if (typeof sourceRecord.data === "string" && sourceRecord.data.length > 0) {
      const mimeType =
        typeof sourceRecord.media_type === "string"
          ? sourceRecord.media_type
          : typeof image.mimeType === "string"
            ? image.mimeType
            : "image/png";
      const data = safeImageUrl(toDataUrl(sourceRecord.data, mimeType));
      if (data) return data;
    }
  }
  return null;
}

function parseImage(record: Record<string, unknown>): ImageBlock {
  const block: ImageBlock = { type: "image" };
  if (typeof record.data === "string") block.data = record.data;
  if (typeof record.mimeType === "string") block.mimeType = record.mimeType;
  if (typeof record.url === "string") block.url = record.url;
  const sourceRecord = record.source;
  if (isRecord(sourceRecord)) {
    const source: ImageSource = {};
    if (typeof sourceRecord.type === "string") source.type = sourceRecord.type;
    if (typeof sourceRecord.media_type === "string") source.media_type = sourceRecord.media_type;
    if (typeof sourceRecord.data === "string") source.data = sourceRecord.data;
    if (typeof sourceRecord.url === "string") source.url = sourceRecord.url;
    block.source = source;
  }
  return block;
}

function parseBlock(value: unknown): ContentBlock | null {
  if (typeof value === "string") return { type: "text", text: value };
  if (!isRecord(value)) return null;

  switch (value.type) {
    case "text":
      return { type: "text", text: typeof value.text === "string" ? value.text : "" };
    case "image":
      return parseImage(value);
    case "thinking":
      return {
        type: "thinking",
        thinking: typeof value.thinking === "string" ? value.thinking : "",
        deferred: value.deferred === true,
      };
    case "toolCall":
    case "tool_call":
      return {
        type: "toolCall",
        toolCallId:
          typeof value.toolCallId === "string"
            ? value.toolCallId
            : typeof value.id === "string"
              ? value.id
              : "",
        toolName:
          typeof value.toolName === "string"
            ? value.toolName
            : typeof value.name === "string"
              ? value.name
              : "tool",
        input: isRecord(value.input) ? value.input : {},
      };
    default:
      // Unknown block types fall back to their textual payload, if any.
      if (typeof value.text === "string") return { type: "text", text: value.text };
      return null;
  }
}

/** Normalize `string | ContentBlock[] | unknown` into renderable blocks. */
export function contentBlocks(content: unknown): ContentBlock[] {
  if (Array.isArray(content)) {
    const blocks: ContentBlock[] = [];
    for (const item of content) {
      const block = parseBlock(item);
      if (block) blocks.push(block);
    }
    return blocks;
  }
  const block = parseBlock(content);
  return block ? [block] : [];
}

/**
 * Plain text for a tool result. Text blocks are joined; images and malformed
 * entries are skipped. Structured results fall back to pretty JSON.
 */
export function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (typeof item === "string") {
        parts.push(item);
        continue;
      }
      if (!isRecord(item) || item.type === "image") continue;
      if (typeof item.text === "string") {
        parts.push(item.text);
        continue;
      }
      if (typeof item.content === "string") parts.push(item.content);
    }
    return parts.join("\n");
  }
  if (isRecord(content)) {
    if (content.type === "image") return "";
    if (typeof content.text === "string") return content.text;
    if (typeof content.content === "string") return content.content;
    if (Array.isArray(content.content)) return toolResultText(content.content);
    const json = prettyJson(content);
    return json === "{}" ? "" : json;
  }
  if (typeof content === "number" || typeof content === "boolean") return String(content);
  return "";
}

/** Renderable image sources carried by a tool result, in order. */
export function toolResultImages(content: unknown): string[] {
  const images: string[] = [];
  const add = (value: unknown) => {
    if (!isRecord(value) || value.type !== "image") return;
    const src = imageSrc(value);
    if (src) images.push(src);
  };
  if (Array.isArray(content)) {
    for (const item of content) add(item);
  } else if (isRecord(content) && Array.isArray(content.content)) {
    for (const item of content.content) add(item);
  } else {
    add(content);
  }
  return images;
}

/** Human-facing label for a message role. */
export function roleLabel(role: string): string {
  const value = role.trim();
  switch (value) {
    case "assistant":
      return "assistant";
    case "user":
      return "user";
    case "toolResult":
    case "tool":
      return "tool result";
    case "bashExecution":
      return "bash";
    case "pythonExecution":
      return "python";
    case "developer":
      return "developer";
    case "fileMention":
      return "file";
    case "custom":
      return "custom";
    case "system":
      return "system";
    default:
      return value === "" ? "message" : value;
  }
}

/** Pretty JSON for tool arguments/results; never throws on odd input. */
export function prettyJson(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    const text = JSON.stringify(value, null, 2);
    return text ?? String(value);
  } catch {
    return String(value);
  }
}

/** Join CSS module class names, dropping empty/false entries. */
export function joinClassNames(...names: Array<string | false | null | undefined>): string {
  return names.filter((name): name is string => typeof name === "string" && name.length > 0).join(" ");
}
