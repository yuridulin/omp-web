import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import type { ModelEntry } from "@/api/agent";
import {
  formatModelSelector,
  fromModelRoleRows,
  toModelRoleRows,
  type ModelRoleRow,
} from "@/api/system-config";
import { useModels } from "@/features/sessions/use-models";
import { systemConfigErrorMessage, useModelRoles, useSaveModelRoles } from "./use-system-config";
import styles from "./models-panel.module.css";

interface ProviderGroup {
  provider: string;
  entries: ModelEntry[];
}

function groupByProvider(models: readonly ModelEntry[]): ProviderGroup[] {
  const groups = new Map<string, ModelEntry[]>();
  for (const entry of models) {
    const existing = groups.get(entry.provider);
    if (existing) {
      existing.push(entry);
    } else {
      groups.set(entry.provider, [entry]);
    }
  }
  return Array.from(groups, ([provider, entries]) => ({ provider, entries })).sort((left, right) =>
    left.provider.localeCompare(right.provider),
  );
}

function modelDetail(entry: ModelEntry): string {
  const parts: string[] = [];
  if (typeof entry.contextWindow === "number" && entry.contextWindow > 0) {
    parts.push(`${Math.round(entry.contextWindow / 1000)}k ctx`);
  }
  if (entry.thinkingLevels && entry.thinkingLevels.length > 0) {
    parts.push(`thinking: ${entry.thinkingLevels.join("/")}`);
  }
  if (entry.supportsFastMode) parts.push("fast");
  if (entry.supportsSlowMode) parts.push("slow");
  return parts.join(" · ");
}

export function ModelsPanel(): JSX.Element {
  const modelsQuery = useModels();
  const rolesQuery = useModelRoles();
  const saveRoles = useSaveModelRoles();
  const [rows, setRows] = useState<ModelRoleRow[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const modelList = modelsQuery.data?.modelList ?? [];
  const defaultModel = modelsQuery.data?.defaultModel ?? null;
  const groups = useMemo(() => groupByProvider(modelList), [modelList]);
  const selectors = useMemo(
    () => modelList.map((entry) => formatModelSelector(entry.provider, entry.id)),
    [modelList],
  );
  const storedRoles = rolesQuery.data?.roles;

  useEffect(() => {
    if (storedRoles) setRows(toModelRoleRows(storedRoles));
  }, [storedRoles]);

  const savedRows = useMemo(() => toModelRoleRows(storedRoles ?? {}), [storedRoles]);
  const dirty = JSON.stringify(toModelRoleRows(fromModelRoleRows(rows))) !== JSON.stringify(savedRows);
  const busy = saveRoles.isPending;

  const updateRow = (index: number, patch: Partial<ModelRoleRow>) => {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? { role: patch.role ?? row.role, model: patch.model ?? row.model }
          : row,
      ),
    );
    setFeedback(null);
  };

  const addRow = () => {
    setRows((current) => [...current, { role: "", model: "" }]);
    setFeedback(null);
  };

  const removeRow = (index: number) => {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
    setFeedback(null);
  };

  const save = async () => {
    if (busy || !dirty) return;
    setSaveError(null);
    setFeedback(null);
    try {
      const next = await saveRoles.mutateAsync(fromModelRoleRows(rows));
      setRows(toModelRoleRows(next));
      setFeedback("Model roles saved");
    } catch (cause) {
      setSaveError(systemConfigErrorMessage(cause));
    }
  };

  return (
    <section className={styles.panel} aria-label="Models">
      <header className={styles.header}>
        <h2 className={styles.title}>Models</h2>
        <span className={styles.meta}>
          {modelList.length} model{modelList.length === 1 ? "" : "s"} · default{" "}
          {defaultModel ? formatModelSelector(defaultModel.provider, defaultModel.modelId) : "unset"}
        </span>
      </header>

      {modelsQuery.isLoading ? <p className={styles.status}>Loading model registry…</p> : null}
      {modelsQuery.isError ? (
        <p className={styles.error} role="alert">
          {systemConfigErrorMessage(modelsQuery.error)}
        </p>
      ) : null}

      <div className={styles.columns}>
        <div className={styles.column}>
          <h3 className={styles.sectionTitle}>Registry</h3>
          {!modelsQuery.isLoading && groups.length === 0 ? (
            <p className={styles.empty}>No models reported by omp.</p>
          ) : null}
          <div className={styles.groups}>
            {groups.map((group) => (
              <div key={group.provider} className={styles.group}>
                <div className={styles.groupHeader}>
                  <span className={styles.provider}>{group.provider}</span>
                  <span className={styles.count}>{group.entries.length}</span>
                </div>
                <ul className={styles.modelList}>
                  {group.entries.map((entry) => {
                    const isDefault =
                      defaultModel !== null &&
                      defaultModel.provider === entry.provider &&
                      defaultModel.modelId === entry.id;
                    return (
                      <li key={`${entry.provider}:${entry.id}`} className={styles.modelRow}>
                        <span className={styles.modelName}>{entry.name || entry.id}</span>
                        <span className={styles.modelId}>{entry.id}</span>
                        {isDefault ? <span className={styles.badge}>default</span> : null}
                        <span className={styles.modelDetail}>{modelDetail(entry)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.column}>
          <h3 className={styles.sectionTitle}>Model roles</h3>
          <p className={styles.hint}>
            Values use <code>provider/modelId</code> selectors and are stored in{" "}
            {rolesQuery.data?.path || "config.yml"}.
          </p>

          {rolesQuery.isLoading ? <p className={styles.status}>Loading roles…</p> : null}
          {rolesQuery.isError ? (
            <p className={styles.error} role="alert">
              {systemConfigErrorMessage(rolesQuery.error)}
            </p>
          ) : null}

          <div className={styles.roles}>
            {rows.length === 0 && !rolesQuery.isLoading ? (
              <p className={styles.empty}>No roles configured.</p>
            ) : null}
            {rows.map((row, index) => (
              <div className={styles.roleRow} key={`role-${index}`}>
                <input
                  className={styles.input}
                  value={row.role}
                  placeholder="role"
                  aria-label={`Role ${index + 1} name`}
                  disabled={busy}
                  onChange={(event) => updateRow(index, { role: event.currentTarget.value })}
                />
                <input
                  className={styles.input}
                  value={row.model}
                  placeholder="provider/model"
                  aria-label={`Role ${row.role || index + 1} model`}
                  list="models-panel-selectors"
                  disabled={busy}
                  onChange={(event) => updateRow(index, { model: event.currentTarget.value })}
                />
                <button
                  type="button"
                  className={styles.removeButton}
                  aria-label={`Remove role ${row.role || index + 1}`}
                  disabled={busy}
                  onClick={() => removeRow(index)}
                >
                  ×
                </button>
              </div>
            ))}
            <datalist id="models-panel-selectors">
              {selectors.map((selector) => (
                <option key={selector} value={selector} />
              ))}
            </datalist>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.button} disabled={busy} onClick={addRow}>
              Add role
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={busy || !dirty || rolesQuery.isError}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save"}
            </button>
            {dirty ? <span className={styles.dirty}>unsaved</span> : null}
          </div>

          {feedback ? <p className={styles.success}>{feedback}</p> : null}
          {saveError ? (
            <p className={styles.error} role="alert">
              {saveError}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
