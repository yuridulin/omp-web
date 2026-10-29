import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { usageReportSchema } from "@/server/schemas/system";
import { apiErrorBody } from "@/lib/api-utils";
import { getUsageReport } from "@/lib/usage-service";
import type { UsageGranularity, UsageTimeRange } from "@/lib/usage-types";

export const contract = routeContract({
  GET: {
    summary: "Aggregate omp session token usage and cost into a report",
    request: {
      query: z.object({
        range: z.union([z.enum(["today", "7d", "30d", "90d", "month", "all"]), z.string()]).optional(),
        granularity: z.union([z.enum(["daily", "monthly", "projects"]), z.string()]).optional(),
        project: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        refresh: z.string().optional(),
      }),
    },
    responses: {
      200: usageReportSchema,
      500: errorEnvelope,
    },
  },
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rangeParam = url.searchParams.get("range");
    const granularityParam = url.searchParams.get("granularity");
    const projectParam = url.searchParams.get("project");
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const refreshParam = url.searchParams.get("refresh");

    const validRanges: UsageTimeRange[] = ["today", "7d", "30d", "90d", "month", "all"];
    const range: UsageTimeRange = validRanges.includes(rangeParam as UsageTimeRange)
      ? (rangeParam as UsageTimeRange)
      : "30d";

    const validGranularities: UsageGranularity[] = ["daily", "monthly", "projects"];
    const granularity: UsageGranularity = validGranularities.includes(granularityParam as UsageGranularity)
      ? (granularityParam as UsageGranularity)
      : "daily";

    const from = fromParam ? parseInt(fromParam, 10) : undefined;
    const to = toParam ? parseInt(toParam, 10) : undefined;
    const forceRefresh = refreshParam === "true" || refreshParam === "1";

    const report = await getUsageReport({
      range,
      granularity,
      project: projectParam || undefined,
      from: !isNaN(from as number) ? from : undefined,
      to: !isNaN(to as number) ? to : undefined,
      forceRefresh,
    });

    return json(report);
  } catch (error) {
    return json(apiErrorBody(error), { status: 500 });
  }
}
