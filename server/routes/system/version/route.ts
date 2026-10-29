import { z } from "zod";
import { json } from "@/server/http";
import { routeContract } from "@/server/contract";
import { getOmpVersion } from "@/lib/omp/omp-cli";

export const contract = routeContract({
  GET: {
    summary: "Probe the installed omp binary version",
    responses: {
      200: z.looseObject({ version: z.string().nullable() }),
    },
  },
});

/** Runtime probe of the installed omp binary ("omp/17.1.3"), separate from the
 * build-time omp-web version — the two can legitimately drift. */
export async function GET() {
  const version = await getOmpVersion();
  return json({ version });
}
