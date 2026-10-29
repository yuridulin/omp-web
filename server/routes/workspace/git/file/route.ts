import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { gitFileContentsSchema } from "@/server/schemas/git";
import { gitErrorResponse, requireWorkspace } from "@/server/workspace-access";
import { getGitFileContents } from "@/lib/git-changes";
import { comparableProjectPath } from "@/lib/comparable-path";
import { isWindowsAbsolutePath } from "@/lib/file-access";

const contentSide = z.string().regex(/^(HEAD|INDEX|WORKTREE|EMPTY|[0-9a-fA-F]{4,64})$/);

export const contract = routeContract({
  GET: {
    summary: "Return before/after text for one file between two git states",
    request: {
      query: z.object({
        cwd: z.string(),
        path: z.string(),
        from: contentSide.optional(),
        to: contentSide.optional(),
        oldPath: z.string().optional(),
      }),
    },
    responses: {
      200: gitFileContentsSchema,
      400: errorEnvelope,
      403: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

function isAbsolute(value: string): boolean {
  return value.startsWith("/") || isWindowsAbsolutePath(value);
}

function isInside(root: string, target: string): boolean {
  const rootKey = comparableProjectPath(root);
  const targetKey = comparableProjectPath(target);
  return targetKey === rootKey || targetKey.startsWith(`${rootKey}/`);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const gate = await requireWorkspace(params.get("cwd"));
  if (!gate.ok) return gate.response;
  const filePath = params.get("path")?.trim() ?? "";
  if (!filePath || !isAbsolute(filePath)) {
    return json({ error: "path must be an absolute path", code: "path_must_be_absolute" }, { status: 400 });
  }
  if (!isInside(gate.cwd, filePath)) {
    return json({ error: "Access denied", code: "access_denied" }, { status: 403 });
  }
  const oldPath = params.get("oldPath")?.trim() || undefined;
  if (oldPath && (!isAbsolute(oldPath) || !isInside(gate.cwd, oldPath))) {
    return json({ error: "Access denied", code: "access_denied" }, { status: 403 });
  }
  try {
    return json(
      await getGitFileContents(gate.cwd, filePath, {
        ...(params.get("from") ? { from: params.get("from") as string } : {}),
        ...(params.get("to") ? { to: params.get("to") as string } : {}),
        ...(oldPath ? { oldPath } : {}),
      }),
    );
  } catch (error) {
    return gitErrorResponse(error);
  }
}
