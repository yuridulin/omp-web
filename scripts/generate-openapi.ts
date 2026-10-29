#!/usr/bin/env bun
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { stringify } from "yaml";
import { z } from "zod";
import {
  errorEnvelope,
  isBodyContract,
  readRouteContract,
  type BodyContract,
  type HttpMethod,
  type OperationContract,
} from "../server/contract.ts";
import { isRecord } from "../core/guards.ts";

/**
 * Generates `contract/open-api.yaml` from the `contract` export of every route.
 *
 * Deterministic by construction: routes, paths, methods, parameters and status
 * codes are emitted in a fixed order, with no timestamps.
 */

const ROUTES_ROOT = join(import.meta.dir, "..", "server", "routes");
const OUTPUT = join(import.meta.dir, "..", "contract", "open-api.yaml");
const METHOD_ORDER: HttpMethod[] = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

const STATUS_TEXT: Record<string, string> = {
  "200": "OK",
  "201": "Created",
  "204": "No Content",
  "304": "Not Modified",
  "400": "Bad Request",
  "401": "Unauthorized",
  "403": "Forbidden",
  "404": "Not Found",
  "409": "Conflict",
  "413": "Payload Too Large",
  "422": "Unprocessable Entity",
  "500": "Internal Server Error",
  "502": "Bad Gateway",
  "503": "Service Unavailable",
};

function collectRoutes(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectRoutes(full));
    else if (entry.name === "route.ts") files.push(full);
  }
  return files;
}

function jsonSchema(schema: z.ZodType, io: "input" | "output"): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { io, unrepresentable: "any" }) as Record<string, unknown>;
  const { $schema: _ignored, ...rest } = raw;
  return rest;
}

function openApiPath(segments: string[]): string {
  const rendered = segments.map((segment) => {
    if (segment.startsWith("[...")) return `{${segment.slice(4, -1)}}`;
    if (segment.startsWith("[")) return `{${segment.slice(1, -1)}}`;
    return segment;
  });
  return `/${["api", ...rendered].join("/")}`;
}

function pathParameters(segments: string[]): Record<string, unknown>[] {
  const parameters: Record<string, unknown>[] = [];
  for (const segment of segments) {
    if (segment.startsWith("[...")) {
      parameters.push({
        name: segment.slice(4, -1),
        in: "path",
        required: true,
        description: "Remaining path segments",
        schema: { type: "string" },
      });
    } else if (segment.startsWith("[")) {
      parameters.push({
        name: segment.slice(1, -1),
        in: "path",
        required: true,
        schema: { type: "string" },
      });
    }
  }
  return parameters;
}

function queryParameters(schema: z.ZodType | undefined): Record<string, unknown>[] {
  if (!schema) return [];
  const json = jsonSchema(schema, "input");
  const properties = (json.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = new Set(Array.isArray(json.required) ? json.required : []);
  return Object.keys(properties).sort().map((name) => ({
    name,
    in: "query",
    required: required.has(name),
    schema: properties[name],
  }));
}

function contentFor(body: z.ZodType | BodyContract, io: "input" | "output"): Record<string, unknown> {
  if (isBodyContract(body)) {
    return {
      [body.contentType]: body.schema ? { schema: jsonSchema(body.schema, io) } : {},
    };
  }
  return { "application/json": { schema: jsonSchema(body, io) } };
}

function responsesFor(operation: OperationContract): Record<string, unknown> {
  const responses: Record<string, unknown> = {};
  const statuses = Object.keys(operation.responses).sort((a, b) => Number(a) - Number(b));
  for (const status of statuses) {
    const schema = operation.responses[Number(status)];
    if (schema === null || schema === undefined) {
      responses[status] = { description: STATUS_TEXT[status] ?? "Response" };
    } else if (isBodyContract(schema)) {
      responses[status] = {
        description: STATUS_TEXT[status] ?? "Response",
        content: contentFor(schema, "output"),
      };
    } else {
      responses[status] = {
        description: STATUS_TEXT[status] ?? "Response",
        content: contentFor(schema, "output"),
      };
    }
  }
  responses.default = {
    description: "Error",
    content: {
      "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } },
    },
  };
  return responses;
}

async function buildDocument(): Promise<{ document: Record<string, unknown>; count: number }> {
  const paths: Record<string, Record<string, unknown>> = {};
  const missing: string[] = [];
  const files = collectRoutes(ROUTES_ROOT).sort();

  for (const file of files) {
    const relativeDir = relative(ROUTES_ROOT, dirname(file));
    const segments = relativeDir.split(/[\\/]/).filter(Boolean);
    // Routes are discovered from the filesystem at generation time, so a
    // static import cannot express this module set.
    const loaded: unknown = await import(pathToFileURL(file).href);
    const exported = isRecord(loaded) && "contract" in loaded ? loaded.contract : undefined;
    if (exported === undefined) {
      missing.push(relative(process.cwd(), file));
      continue;
    }
    const contract = readRouteContract(exported);
    if (!contract) {
      throw new Error(`Invalid route contract: ${relative(process.cwd(), file)}`);
    }
    const path = openApiPath(segments);
    const pathItem: Record<string, unknown> = {};
    for (const method of METHOD_ORDER) {
      const operation = contract[method];
      if (!operation) continue;
      const parameters = [...pathParameters(segments), ...queryParameters(operation.request?.query)];
      pathItem[method.toLowerCase()] = {
        summary: operation.summary,
        ...(parameters.length > 0 ? { parameters } : {}),
        ...(operation.request?.body
          ? {
              requestBody: {
                required: true,
                content: contentFor(operation.request.body, "input"),
              },
            }
          : {}),
        responses: responsesFor(operation),
      };
    }
    if (Object.keys(pathItem).length === 0) {
      throw new Error(`Route contract has no operations: ${relative(process.cwd(), file)}`);
    }
    if (paths[path]) throw new Error(`Duplicate route path: ${path}`);
    paths[path] = pathItem;
  }

  if (missing.length > 0) {
    throw new Error(`Routes without an exported contract:\n${missing.map((file) => `  ${file}`).join("\n")}`);
  }

  const sortedPaths = Object.fromEntries(
    Object.entries(paths).sort(([a], [b]) => a.localeCompare(b)),
  );

  return {
    count: files.length,
    document: {
      openapi: "3.1.0",
      info: {
        title: "omp-web API",
        version: "1.0.0",
        description: "Local web console for the omp agent. Generated from server/routes contracts.",
      },
      paths: sortedPaths,
      components: {
        schemas: { ErrorEnvelope: jsonSchema(errorEnvelope, "output") },
      },
    },
  };
}

const { document, count } = await buildDocument();
const yaml = `# Generated by scripts/generate-openapi.ts. Do not edit.\n${stringify(document, {
  lineWidth: 0,
  aliasDuplicateObjects: false,
})}`;

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(OUTPUT, "utf8");
  } catch {
    // Missing artifact is stale by definition.
  }
  if (current !== yaml) {
    console.error("contract/open-api.yaml is stale. Run `bun run contract`.");
    process.exit(1);
  }
  console.log(`contract/open-api.yaml is current (${count} routes)`);
} else {
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, yaml);
  console.log(`wrote contract/open-api.yaml (${count} routes)`);
}
