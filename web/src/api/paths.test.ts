import { describe, expect, it } from "vitest";
import { encodeFilePathForApi, fileApiUrl, joinPath, relativePath } from "./paths";

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
});
