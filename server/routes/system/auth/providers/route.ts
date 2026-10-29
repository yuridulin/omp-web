import { z } from "zod";
import { routeContract } from "@/server/contract";
import { type OmpLoginProvider, runUtilityCommand } from "@/lib/omp/rpc-utility";

export const contract = routeContract({
  GET: {
    summary: "List login-capable providers from omp's /login list with their auth state",
    responses: {
      200: z.looseObject({
        providers: z.array(z.looseObject({
          id: z.string(),
          name: z.string(),
          usesCallbackServer: z.boolean(),
          loggedIn: z.boolean(),
        })),
      }),
      500: z.looseObject({ providers: z.array(z.unknown()), error: z.string(), code: z.string() }),
    },
  },
});

// Login-capable providers via the omp RPC get_login_providers command. This is
// omp's own /login list (OAuth subscriptions plus key-creation flows), so no
// hardcoded exclusions or display-name overrides are needed anymore.
export async function GET() {
  try {
    const response = await runUtilityCommand<{ providers?: unknown }>(
      { type: "get_login_providers" },
      30_000,
    );
    const providers = Array.isArray(response.providers)
      ? response.providers.filter((provider): provider is OmpLoginProvider => (
        typeof provider === "object" && provider !== null
        && typeof (provider as OmpLoginProvider).id === "string"
        && typeof (provider as OmpLoginProvider).name === "string"
        && typeof (provider as OmpLoginProvider).authenticated === "boolean"
      ))
      : [];
    const result = providers
      .filter((p) => p.available !== false)
      .map((p) => ({
        id: p.id,
        name: p.name,
        usesCallbackServer: false,
        loggedIn: p.authenticated,
      }));
    return Response.json({ providers: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ providers: [], error: message, code: "internal_error" }, { status: 500 });
  }
}
