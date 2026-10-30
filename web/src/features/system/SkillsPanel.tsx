import { useEffect, useState } from "react";
import type { JSX } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SkillUpdate } from "@/api/skills";
import {
  checkSkillUpdates,
  findSkillUpdate,
  isUpdateAvailable,
  setSkillModelInvocation,
  skillUpdateLabel,
  updateKey,
  updateSkillPackage,
} from "@/api/skills";
import { useSkills } from "./use-system-data";
import styles from "./skills-panel.module.css";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface SkillsPanelProps {
  root: string | null;
}

export function SkillsPanel({ root }: SkillsPanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const skills = useSkills(root);
  const [updates, setUpdates] = useState<SkillUpdate[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setUpdates([]);
    setError(null);
    setNotice(null);
  }, [root]);

  const cwd = root;

  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ["system-skills", cwd] });
  };

  const runAction = async (key: string, action: () => Promise<void>): Promise<void> => {
    setPending(key);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setPending(null);
    }
  };

  const listing = skills.data;
  const busy = pending !== null;

  return (
    <section className={styles.panel} aria-label="Skills">
      <header className={styles.header}>
        <div className={styles.titleWrap}>
          <h2 className={styles.title}>Skills</h2>
          <span className={styles.subtitle} title={root ?? undefined}>
            {root ?? "No workspace selected"}
          </span>
        </div>
        <div className={styles.actions}>
          {cwd ? (
            <>
              <button
                type="button"
                className={styles.button}
                disabled={busy}
                onClick={() => {
                  void runAction("check", async () => {
                    const next = await checkSkillUpdates(cwd);
                    setUpdates(next);
                    setNotice(
                      next.length === 0
                        ? "No installable skill packages were checked."
                        : `Checked ${next.length} installed package${next.length === 1 ? "" : "s"}.`,
                    );
                  });
                }}
              >
                {pending === "check" ? "Checking…" : "Check updates"}
              </button>
              <button
                type="button"
                className={styles.button}
                disabled={skills.isFetching}
                onClick={() => {
                  void skills.refetch();
                }}
              >
                {skills.isFetching ? "Refreshing…" : "Refresh"}
              </button>
            </>
          ) : null}
        </div>
      </header>

      {!cwd ? (
        <div className={styles.empty}>Select a project to inspect its skills.</div>
      ) : (
        <>
          {error ? (
            <div className={styles.error} role="alert">
              {error}
            </div>
          ) : null}
          {notice ? <div className={styles.notice}>{notice}</div> : null}
          {skills.isPending ? <div className={styles.message}>Loading skills…</div> : null}
          {skills.error ? (
            <div className={styles.error} role="alert">
              {describeError(skills.error)}
            </div>
          ) : null}
          {listing && listing.skills.length === 0 ? (
            <div className={styles.empty}>No skills resolved for this workspace.</div>
          ) : null}

          {listing && listing.skills.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Skill</th>
                    <th>Scope</th>
                    <th>Model</th>
                    <th>Install</th>
                  </tr>
                </thead>
                <tbody>
                  {listing.skills.map((skill) => {
                    const install = skill.install;
                    const update = install
                      ? findSkillUpdate(updates, install.package, install.scope)
                      : null;
                    const key = install ? updateKey(install.package, install.scope) : null;
                    const toggleKey = `toggle:${skill.filePath}`;
                    const toggleDisabled = busy || skill.togglable === false;
                    return (
                      <tr key={skill.filePath}>
                        <td>
                          <div className={styles.nameCell}>
                            <span className={styles.name}>{skill.name}</span>
                            <span className={styles.description} title={skill.description}>
                              {skill.description || "No description"}
                            </span>
                            <span className={styles.mono} title={skill.filePath}>
                              {skill.filePath}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={styles.scope}>
                            {skill.sourceInfo.scope ?? install?.scope ?? "unknown"}
                          </span>
                        </td>
                        <td>
                          <label className={styles.toggle}>
                            <input
                              type="checkbox"
                              checked={!skill.disableModelInvocation}
                              disabled={toggleDisabled}
                              aria-label={`Allow model invocation for ${skill.name}`}
                              onChange={(event) => {
                                const disable = !event.target.checked;
                                void runAction(toggleKey, async () => {
                                  await setSkillModelInvocation(skill.filePath, disable, cwd);
                                  await invalidate();
                                  setNotice(
                                    `${skill.name}: model invocation ${disable ? "disabled" : "enabled"}.`,
                                  );
                                });
                              }}
                            />
                            {skill.disableModelInvocation ? "Off" : "On"}
                          </label>
                        </td>
                        <td>
                          {install ? (
                            <div className={styles.install}>
                              <div className={styles.installLine}>
                                <span className={styles.package}>{install.package}</span>
                                <span className={styles.scope}>{install.scope}</span>
                              </div>
                              <span className={styles.mono} title={install.source}>
                                {install.source}
                              </span>
                              {update ? (
                                <span
                                  className={styles.update}
                                  data-state={update.state}
                                  title={update.message ?? undefined}
                                >
                                  {skillUpdateLabel(update.state)}
                                  {update.latestVersion
                                    ? ` · ${update.currentVersion ?? "?"} → ${update.latestVersion}`
                                    : ""}
                                </span>
                              ) : install.canCheckForUpdates ? (
                                <span className={styles.update} data-state="unsupported">
                                  Not checked
                                </span>
                              ) : (
                                <span className={styles.update} data-state="unsupported">
                                  Update check unavailable
                                </span>
                              )}
                              {update && isUpdateAvailable(update) && key ? (
                                <div className={styles.actionCell}>
                                  <button
                                    type="button"
                                    className={styles.button}
                                    data-active="true"
                                    disabled={busy}
                                    onClick={() => {
                                      void runAction(`update:${key}`, async () => {
                                        const result = await updateSkillPackage(
                                          cwd,
                                          install.package,
                                          install.scope,
                                        );
                                        setUpdates((previous) =>
                                          previous.filter(
                                            (entry) =>
                                              !(
                                                entry.package === install.package &&
                                                entry.scope === install.scope
                                              ),
                                          ),
                                        );
                                        await invalidate();
                                        setNotice(
                                          result.success
                                            ? `Updated ${install.package}.`
                                            : `Update of ${install.package} did not report success.`,
                                        );
                                      });
                                    }}
                                  >
                                    {pending === `update:${key}` ? "Updating…" : "Update"}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className={styles.mono}>Not installed from a package</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {listing && listing.diagnostics.length > 0 ? (
            <section className={styles.diagnostics} aria-label="Skill diagnostics">
              <h3 className={styles.diagnosticsTitle}>
                Diagnostics ({listing.diagnostics.length})
              </h3>
              <ul className={styles.diagnosticList}>
                {listing.diagnostics.map((diagnostic, index) => (
                  <li
                    className={styles.diagnostic}
                    data-type={diagnostic.type}
                    key={`${diagnostic.type}-${diagnostic.path ?? "global"}-${index}`}
                  >
                    <span className={styles.diagnosticType}>{diagnostic.type}</span>
                    <span>{diagnostic.message}</span>
                    {diagnostic.path ? (
                      <span className={styles.diagnosticPath} title={diagnostic.path}>
                        {diagnostic.path}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
