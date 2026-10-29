import { z } from "zod";
import { json } from "@/server/http";
import { routeContract } from "@/server/contract";
import { homedir } from "os";

export const contract = routeContract({
  GET: {
    summary: "Return the server user's home directory",
    responses: {
      200: z.object({ home: z.string() }),
    },
  },
});

export async function GET() {
  return json({ home: homedir() });
}
