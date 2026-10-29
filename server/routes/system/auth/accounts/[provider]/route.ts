import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { invalidateModelsCache } from "@/lib/models-cache";
import { runUtilityCommand } from "@/lib/omp/rpc-utility";

/** Entry of omp's `get_logout_accounts` response. Labels never carry a raw key. */
interface OmpProviderAccount {
  credentialId: number;
  label: string;
  detail: string;
  type: "api_key" | "oauth";
}

// omp releases older than the get_logout_accounts/logout RPC answer "Unknown command".
const UNSUPPORTED = "Unknown command";

const accountSchema = z.looseObject({
  credentialId: z.number(),
  label: z.string(),
  detail: z.string(),
  type: z.enum(["api_key", "oauth"]),
});

export const contract = routeContract({
  GET: {
    summary: "List the credentials omp stores for one provider",
    responses: {
      200: z.looseObject({ supported: z.boolean(), accounts: z.array(accountSchema) }),
      500: errorEnvelope,
    },
  },
  DELETE: {
    summary: "Remove one stored credential for a provider; omp falls back to the next account",
    request: { query: z.object({ credentialId: z.string() }) },
    responses: {
      200: z.looseObject({ ok: z.literal(true) }),
      400: errorEnvelope,
      500: errorEnvelope,
      501: errorEnvelope,
    },
  },
});

function isAccount(value: unknown): value is OmpProviderAccount {
  if (typeof value !== "object" || value === null) return false;
  const a = value as Record<string, unknown>;
  return Number.isInteger(a.credentialId) && typeof a.label === "string" && typeof a.detail === "string"
    && (a.type === "api_key" || a.type === "oauth");
}

// omp's `active` flag is relative to the utility process's own throwaway
// session, not to any chat, so it is deliberately not passed on.
/** Stored credentials omp holds for one provider. */
export async function GET(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  try {
    const { accounts } = await runUtilityCommand<{ accounts?: unknown }>(
      { type: "get_logout_accounts", providerId: provider },
      30_000,
    );
    const list = Array.isArray(accounts) ? accounts.filter(isAccount) : [];
    return json({
      supported: true,
      accounts: list.map(({ credentialId, label, detail, type }) => ({ credentialId, label, detail, type })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(UNSUPPORTED)) return json({ supported: false, accounts: [] });
    return json({ error: message, code: "internal_error" }, { status: 500 });
  }
}

/** Remove one stored credential (`?credentialId=`); omp picks the next account. */
export async function DELETE(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const raw = new URL(req.url).searchParams.get("credentialId") ?? "";
  const credentialId = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(credentialId)) {
    return json({ error: "credentialId must be an integer", code: "invalid_credential_id" }, { status: 400 });
  }
  const { provider } = await params;
  try {
    await runUtilityCommand({ type: "logout", providerId: provider, credentialId }, 60_000);
    invalidateModelsCache();
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(UNSUPPORTED)) {
      return json(
        {
          error: "omp-web cannot disconnect accounts with this omp version. Update omp, or run `omp` in a terminal and use /logout.",
          code: "logout_unsupported",
        },
        { status: 501 },
      );
    }
    return json({ error: message, code: "internal_error" }, { status: 500 });
  }
}
