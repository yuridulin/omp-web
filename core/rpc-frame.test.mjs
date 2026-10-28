import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  encodeRpcCommand,
  MAX_INBOUND_COMMAND_BYTES,
  MAX_RPC_FRAME_BYTES,
  RpcFrameDecoder,
} = await jiti.import("./rpc-frame.ts");

/** Outbound v2 chunk records exactly as omp emits them. */
function chunkRecords(frame, chunkId, payloadBytes = 256 * 1024) {
  const bytes = Buffer.from(JSON.stringify(frame), "utf8");
  const count = Math.ceil(bytes.byteLength / payloadBytes);
  return Array.from({ length: count }, (_, index) => ({
    type: "rpc_chunk",
    chunkId,
    index,
    count,
    byteLength: bytes.byteLength,
    data: bytes.subarray(index * payloadBytes, (index + 1) * payloadBytes).toString("base64"),
  }));
}

test("an oversized inbound command stays one unchunked JSONL record", () => {
  const command = { id: "w1", type: "prompt", images: [{ type: "image", data: "A".repeat(2 * 1024 * 1024) }] };
  const line = encodeRpcCommand(command);
  assert.ok(Buffer.byteLength(line, "utf8") > MAX_RPC_FRAME_BYTES);
  assert.equal(line.split("\n").length, 2, "one record plus its terminator");
  assert.deepEqual(JSON.parse(line), command);
  assert.equal(line.includes('"rpc_chunk"'), false);
});

test("a command above the inbound cap fails before any write", () => {
  const command = { id: "w1", type: "prompt", message: "x".repeat(MAX_INBOUND_COMMAND_BYTES) };
  assert.throws(() => encodeRpcCommand(command), /inbound transport limit/);
});

test("an unchunked command decodes as a complete frame", () => {
  const decoder = new RpcFrameDecoder();
  const command = { id: "w1", type: "prompt", message: "hi" };
  assert.deepEqual(decoder.push(JSON.parse(encodeRpcCommand(command))), command);
});

test("the decoder reassembles the oversized outbound frames omp sends", () => {
  const frame = { type: "message_end", text: "x".repeat(MAX_RPC_FRAME_BYTES) };
  const records = chunkRecords(frame, "event-1");
  assert.ok(records.length > 1);

  const decoder = new RpcFrameDecoder();
  let decoded;
  for (const record of records) decoded = decoder.push(record);
  assert.deepEqual(decoded, frame);
});

test("the decoder rejects chunk reordering and sequence mismatches", () => {
  const frame = { type: "message_end", text: "x".repeat(MAX_RPC_FRAME_BYTES) };
  const records = chunkRecords(frame, "event-1");
  assert.throws(() => new RpcFrameDecoder().push(records[1]), /start at index 0/);

  const decoder = new RpcFrameDecoder();
  decoder.push(records[0]);
  assert.throws(() => decoder.push({ ...records[1], chunkId: "other" }), /sequence mismatch/);
});

test("a whole frame between chunks interrupts the sequence", () => {
  const frame = { type: "message_end", text: "x".repeat(MAX_RPC_FRAME_BYTES) };
  const records = chunkRecords(frame, "event-1");
  const decoder = new RpcFrameDecoder();
  decoder.push(records[0]);
  assert.throws(() => decoder.push({ type: "notice", message: "hi" }), /interrupted/);
});

test("invalid chunk metadata and payloads are rejected", () => {
  const frame = { type: "message_end", text: "x".repeat(MAX_RPC_FRAME_BYTES) };
  const records = chunkRecords(frame, "event-1");
  for (const record of [
    { ...records[0], chunkId: "" },
    { ...records[0], index: -1 },
    { ...records[0], count: 1 },
    { ...records[0], count: 1000 },
    { ...records[0], index: 2 },
    { ...records[0], byteLength: MAX_RPC_FRAME_BYTES - 1 },
    { ...records[0], byteLength: 65 * 1024 * 1024 },
    { ...records[0], data: "not base64!" },
    { ...records[0], data: "A" },
    { ...records[0], data: 5 },
  ]) {
    assert.throws(() => new RpcFrameDecoder().push(record), /invalid RPC chunk|start at index 0/, JSON.stringify({ ...record, data: undefined }));
  }
});

test("a declared length that does not match the payload fails", () => {
  const frame = { type: "message_end", text: "x".repeat(MAX_RPC_FRAME_BYTES) };
  const records = chunkRecords(frame, "event-1");
  const decoder = new RpcFrameDecoder();
  decoder.push(records[0]);
  const short = { ...records[1], byteLength: records[1].byteLength + 10 };
  // The metadata mismatch is caught before the length check.
  assert.throws(() => decoder.push(short), /sequence mismatch/);
});

test("a non-object or untyped physical record is rejected", () => {
  const decoder = new RpcFrameDecoder();
  for (const value of [null, 5, "frame", [], {}]) {
    assert.throws(() => decoder.push(value), /must be an object|RPC frame/);
  }
});
