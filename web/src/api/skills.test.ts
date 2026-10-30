import { describe, expect, it } from "vitest";
import type { SkillUpdate } from "./skills";
import {
  findSkillUpdate,
  isUpdateAvailable,
  parseSkillListing,
  skillUpdateLabel,
  updateKey,
} from "./skills";

function update(overrides: Partial<SkillUpdate>): SkillUpdate {
  return { package: "pkg", scope: "global", state: "update-available", ...overrides };
}

describe("skill update helpers", () => {
  const updates: SkillUpdate[] = [
    update({ package: "alpha", scope: "global" }),
    update({ package: "alpha", scope: "project", state: "up-to-date" }),
    update({ package: "beta", scope: "global", state: "unsupported" }),
  ];

  it("builds stable keys from scope and package", () => {
    expect(updateKey("alpha", "global")).toBe("global:alpha");
    expect(updateKey("alpha", "project")).toBe("project:alpha");
  });

  it("finds the update for the exact package and scope", () => {
    const found = findSkillUpdate(updates, "alpha", "project");
    expect(found?.state).toBe("up-to-date");
    expect(findSkillUpdate(updates, "missing", "global")).toBeNull();
  });

  it("only treats update-available as actionable", () => {
    expect(isUpdateAvailable(findSkillUpdate(updates, "alpha", "global"))).toBe(true);
    expect(isUpdateAvailable(findSkillUpdate(updates, "alpha", "project"))).toBe(false);
    expect(isUpdateAvailable(null)).toBe(false);
  });

  it("labels every check state", () => {
    expect(skillUpdateLabel("up-to-date")).toBe("Up to date");
    expect(skillUpdateLabel("update-available")).toBe("Update available");
    expect(skillUpdateLabel("unsupported")).toBe("Not checkable");
    expect(skillUpdateLabel("error")).toBe("Check failed");
    expect(skillUpdateLabel("other")).toBe("Unknown");
  });
});

describe("skills parser", () => {
  it("normalizes empty and malformed listings", () => {
    expect(parseSkillListing(null)).toEqual({ skills: [], diagnostics: [] });
    const listing = parseSkillListing({
      skills: [
        {
          name: "demo",
          description: "Demo skill",
          filePath: "/skills/demo/SKILL.md",
          baseDir: "/skills/demo",
          disableModelInvocation: true,
          sourceInfo: { scope: "project" },
          install: { package: "demo", scope: "project", source: "github", canCheckForUpdates: true },
        },
        { description: "missing filePath" },
      ],
      diagnostics: [
        { type: "warning", message: "watch out", path: "/skills/demo" },
        { type: "bogus" },
      ],
    });
    expect(listing.skills).toHaveLength(1);
    expect(listing.skills[0]?.disableModelInvocation).toBe(true);
    expect(listing.skills[0]?.install?.scope).toBe("project");
    expect(listing.diagnostics).toHaveLength(1);
    expect(listing.diagnostics[0]?.type).toBe("warning");
  });
});
