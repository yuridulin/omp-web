import { z } from "zod";
import { isZodSchema, type OperationContract } from "./contract.ts";
import { json } from "./http.ts";

/** Query string as a flat object; repeated keys become arrays. */
function queryObject(url: URL): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams) {
    const existing = out[key];
    if (existing === undefined) out[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else out[key] = [existing, value];
  }
  return out;
}

function invalid(target: "body" | "query", error: z.ZodError): Response {
  return json({
    error: `Invalid request ${target}`,
    code: "invalid_request",
    details: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  }, { status: 400 });
}

/**
 * Validates a request against its operation contract before the handler runs.
 * Body parsing is a clone, so the handler still receives the untouched stream.
 */
export async function validateRequest(
  contract: OperationContract,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (contract.request?.query) {
    const parsed = contract.request.query.safeParse(queryObject(url));
    if (!parsed.success) return invalid("query", parsed.error);
  }
  if (contract.request?.body && isZodSchema(contract.request.body)) {
    let body: unknown;
    try {
      body = await request.clone().json();
    } catch {
      return json({ error: "Invalid JSON request body", code: "invalid_json" }, { status: 400 });
    }
    const parsed = contract.request.body.safeParse(body);
    if (!parsed.success) return invalid("body", parsed.error);
  }
  return null;
}
