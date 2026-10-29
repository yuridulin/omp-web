import { z } from "zod";
import { json, readJson } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { invalidateModelsCache } from "@/lib/models-cache";
import { enableProvider } from "@/lib/omp/model-roles";
import { disposeUtilityRpc } from "@/lib/omp/rpc-utility";

export const contract = routeContract({
  POST: {
    summary: "Re-enable a disabled provider",
    request: { body: z.object({ provider: z.string() }) },
    responses: {
      200: z.looseObject({ success: z.literal(true) }),
      400: errorEnvelope,
    },
  },
});

export async function POST(request: Request) {
  try {
    const parsed = await readJson<{ provider?: unknown }>(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
    if (typeof body.provider !== "string" || !body.provider.trim()) {
      return json({ error: "provider is required", code: "provider_required" }, { status: 400 });
    }
    enableProvider(body.provider);
    invalidateModelsCache();
    disposeUtilityRpc();
    return json({ success: true });
  } catch (error) {
    return json({ error: String(error), code: "provider_enable_failed" }, { status: 400 });
  }
}
