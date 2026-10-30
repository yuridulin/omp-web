import { describe, expect, it } from "vitest";
import { encodeFilePathForApi, fileApiUrl, isPathWithin, joinPath, relativePath, rootForPath } from "./paths";

describe("workspace paths", () => {
  it("encodes each path segment for the catch-all file route", () => {
    expect(encodeFilePathForApi("D:\\Work\\omp web\\src\\a b.ts")).toBe("D%3A/Work/omp%20web/src/a%20b.ts");
    expect(fileApiUrl("D:\\repo\\a.ts", { type: "read" })).toBe(
      "/api/workspace/files/D%3A/repo/a.ts?type=read",
    );
  });

  it("joins roots without losing the POSIX root", () => {
    expect(joinPath("/", "src", "a.ts")).toBe("/src/a.ts");
    expect(joinPath("D:\\repo", "src", "a.ts")).toBe("D:/repo/src/a.ts");
  });

  it("relativizes Windows paths case-insensitively", () => {
    expect(relativePath("d:\\Repo\\src\\A.ts", "D:\\repo")).toBe("src/A.ts");
    expect(relativePath("/repo/src/a.ts", "/repo")).toBe("src/a.ts");
  });

  it("matches paths against roots without prefix collisions", () => {
    expect(isPathWithin("/repo/src/a.ts", "/repo")).toBe(true);
    expect(isPathWithin("/repo", "/repo")).toBe(true);
    expect(isPathWithin("/repo-other/a.ts", "/repo")).toBe(false);
    expect(isPathWithin("D:\\Repo\\SRC\\A.ts", "d:/repo")).toBe(true);
    expect(isPathWithin("/anything", "/")).toBe(true);
  });

  it("selects the most specific root for a path", () => {
    expect(rootForPath(["/repo", "/repo/apps/web"], "/repo/apps/web/src/a.ts")).toBe("/repo/apps/web");
    expect(rootForPath(["/repo/apps/web", "/repo"], "/repo/src/a.ts")).toBe("/repo");
    expect(rootForPath(["/repo"], "/elsewhere/a.ts")).toBeNull();
  });
});
