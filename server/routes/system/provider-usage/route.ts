import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { providerUsageSnapshotSchema } from "@/server/schemas/system";
import { getProviderUsage } from "@/lib/provider-usage";

export const contract = routeContract({
  GET: {
    summary: "Return omp's provider quota usage windows",
    request: {
      query: z.object({
        provider: z.string().optional(),
        model: z.string().optional(),
        refresh: z.string().optional(),
      }),
    },
    responses: {
      200: providerUsageSnapshotSchema,
      400: errorEnvelope,
      502: errorEnvelope,
    },
  },
});

const IDENTIFIER_RE = /^[A-Za-z0-9._:/-]{1,200}$/;

function readIdentifier(value: string | null): string | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return IDENTIFIER_RE.test(trimmed) ? trimmed : undefined;
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const rawProvider = searchParams.get("provider");
  const rawModel = searchParams.get("model");
  const provider = readIdentifier(rawProvider);
  const modelId = readIdentifier(rawModel);

  if ((rawProvider !== null && !provider) || (rawModel !== null && !modelId)) {
    return json(
      { error: "Invalid provider or model identifier", code: "invalid_usage_query" },
      { status: 400 },
    );
  }

  try {
    return json(await getProviderUsage({ provider, modelId }, searchParams.get("refresh") === "true"));
  } catch {
    return json(
      { error: "Provider usage is currently unavailable", code: "provider_usage_unavailable" },
      { status: 502 },
    );
  }
}
