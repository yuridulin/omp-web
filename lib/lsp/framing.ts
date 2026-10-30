/**
 * LSP base protocol framing: `Content-Length: <bytes>\r\n\r\n<json>`.
 * Total at the chunk boundary: partial headers and bodies stay buffered until
 * they complete; malformed frames throw `LspProtocolError` and the caller kills
 * the server.
 */

export const LSP_MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
const HEADER_END = Buffer.from("\r\n\r\n", "ascii");

export class LspProtocolError extends Error {}

export function encodeLspMessage(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii");
  return Buffer.concat([header, body]);
}

export function createLspParser(onMessage: (message: unknown) => void): (chunk: Buffer) => void {
  let buffer: Buffer = Buffer.alloc(0);
  return (chunk: Buffer): void => {
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf(HEADER_END);
      if (headerEnd < 0) return;

      const header = buffer.subarray(0, headerEnd).toString("ascii");
      let length: number | null = null;
      for (const line of header.split("\r\n")) {
        const separator = line.indexOf(":");
        if (separator < 0) continue;
        if (line.slice(0, separator).trim().toLowerCase() !== "content-length") continue;
        const raw = line.slice(separator + 1).trim();
        const parsed = Number(raw);
        if (!Number.isInteger(parsed) || parsed < 0) {
          throw new LspProtocolError(`Invalid Content-Length: ${raw}`);
        }
        length = parsed;
      }
      if (length === null) throw new LspProtocolError("Missing Content-Length header");
      if (length > LSP_MAX_MESSAGE_BYTES) {
        throw new LspProtocolError(`Message exceeds ${LSP_MAX_MESSAGE_BYTES} bytes`);
      }

      const bodyStart = headerEnd + HEADER_END.length;
      if (buffer.length < bodyStart + length) return;
      const body = buffer.subarray(bodyStart, bodyStart + length).toString("utf8");
      buffer = buffer.subarray(bodyStart + length);

      let message: unknown;
      try {
        message = JSON.parse(body);
      } catch {
        throw new LspProtocolError("Invalid JSON payload");
      }
      onMessage(message);
    }
  };
}
