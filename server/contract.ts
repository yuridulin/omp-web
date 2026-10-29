import { z } from "zod";
import { isRecord } from "../core/guards";

/**
 * Code-first route contract.
 *
 * Each `route.ts` exports a `contract` next to its handlers. The request
 * schemas validate input at the server boundary; the generator turns the same
 * objects into `contract/open-api.yaml`, so code and spec cannot drift.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

const HTTP_METHODS: readonly HttpMethod[] = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

export function isHttpMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(value);
}

export interface BodyContract {
  /** Media type, e.g. application/json or multipart/form-data. */
  contentType: string;
  schema?: z.ZodType;
}

export type ResponseContract =
  | z.ZodType
  | BodyContract
  | null;

export interface OperationContract {
  /** One-line human summary; also the OpenAPI operation summary. */
  summary: string;
  request?: {
    /** JSON body schema or a non-JSON body descriptor. */
    body?: z.ZodType | BodyContract;
    /** Flat query object; properties become individual OpenAPI parameters. */
    query?: z.ZodType;
  };
  /** Status code → response body; null means no body. */
  responses: Partial<Record<number, ResponseContract>>;
}

export type RouteContract = Partial<Record<HttpMethod, OperationContract>>;

/** The one error shape every route returns: `{ error, code }` plus details. */
export const errorEnvelope = z.looseObject({
  error: z.string(),
  code: z.string(),
});

/** Identity helper that keeps the contract typed at the route definition. */
export function routeContract(contract: RouteContract): RouteContract {
  return contract;
}

export function isZodSchema(value: unknown): value is z.ZodType {
  return isRecord(value) && typeof value.safeParse === "function";
}

export function isBodyContract(value: unknown): value is BodyContract {
  return isRecord(value)
    && typeof value.contentType === "string"
    && (value.schema === undefined || isZodSchema(value.schema));
}

function isOperation(value: unknown): value is OperationContract {
  if (!isRecord(value) || typeof value.summary !== "string" || !isRecord(value.responses)) return false;
  if (value.request === undefined) return true;
  if (!isRecord(value.request)) return false;
  const { body, query } = value.request;
  return (body === undefined || isZodSchema(body) || isBodyContract(body))
    && (query === undefined || isZodSchema(query));
}

/**
 * Validates an exported route contract. Returns null for a malformed export so
 * the generator and dispatcher can report it instead of trusting a cast.
 */
export function readRouteContract(value: unknown): RouteContract | null {
  if (!isRecord(value)) return null;
  const contract: RouteContract = {};
  for (const [method, operation] of Object.entries(value)) {
    if (!isHttpMethod(method) || !isOperation(operation)) return null;
    contract[method] = operation;
  }
  return contract;
}
