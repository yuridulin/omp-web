/**
 * Framing for omp's NDJSON RPC transport.
 *
 * The algorithm lives in core. Buffer is a Uint8Array, so the host re-exports
 * that implementation instead of keeping a second decoder.
 */
export {
  encodeRpcCommand,
  MAX_INBOUND_COMMAND_BYTES,
  MAX_RPC_FRAME_BYTES,
  MAX_RPC_REASSEMBLED_BYTES,
  RpcFrameDecoder,
} from "../../core/rpc-frame";
export type { RpcFrameRecord, RpcProtocolVersion } from "../../core/rpc-frame";
