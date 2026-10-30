import type { ChangeEvent, JSX } from "react";
import type { ModelEntry } from "@/api/agent";
import styles from "./model-picker.module.css";

export interface ModelPickerProps {
  models: ModelEntry[];
  model: { provider: string; modelId: string } | null;
  thinkingLevel: string;
  thinkingLevels: string[];
  loading?: boolean;
  disabled?: boolean;
  allowAutoThinking?: boolean;
  onChangeModel: (provider: string, modelId: string) => void;
  onChangeThinking: (level: string) => void;
}

const DEFAULT_VALUE = "";
const NO_MODELS_VALUE = "__no_models__";

function decodeModel(value: string): { provider: string; modelId: string } | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [provider, modelId] = parsed;
    if (typeof provider !== "string" || typeof modelId !== "string") return null;
    return { provider, modelId };
  } catch {
    return null;
  }
}

function groupByProvider(models: ModelEntry[]): Array<{ provider: string; entries: ModelEntry[] }> {
  const groups = new Map<string, ModelEntry[]>();
  for (const entry of models) {
    const entries = groups.get(entry.provider);
    if (entries) {
      entries.push(entry);
    } else {
      groups.set(entry.provider, [entry]);
    }
  }
  return Array.from(groups, ([provider, entries]) => ({ provider, entries }));
}

function thinkingOptions(thinkingLevels: string[], current: string, allowAuto: boolean): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const push = (level: string) => {
    if (!seen.has(level)) {
      seen.add(level);
      result.push(level);
    }
  };
  if (allowAuto) push("auto");
  for (const level of thinkingLevels) push(level);
  push(current);
  return result;
}

export function ModelPicker({
  models,
  model,
  thinkingLevel,
  thinkingLevels,
  loading = false,
  disabled = false,
  allowAutoThinking = false,
  onChangeModel,
  onChangeThinking,
}: ModelPickerProps): JSX.Element {
  const inactive = loading || disabled;
  const groups = groupByProvider(models);
  const selectedModel = model;
  const currentModelValue = selectedModel
    ? JSON.stringify([selectedModel.provider, selectedModel.modelId])
    : DEFAULT_VALUE;
  const modelMissing =
    selectedModel !== null &&
    !models.some(
      (entry) => entry.provider === selectedModel.provider && entry.id === selectedModel.modelId,
    );
  const thinking = thinkingOptions(thinkingLevels, thinkingLevel, allowAutoThinking);

  const handleModelChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = decodeModel(event.target.value);
    if (next) onChangeModel(next.provider, next.modelId);
  };

  return (
    <div className={styles.picker}>
      <label className={styles.field}>
        <span className={styles.label}>Model</span>
        <select
          className={styles.select}
          value={currentModelValue}
          onChange={handleModelChange}
          disabled={inactive}
          aria-label="Model"
        >
          {selectedModel === null ? <option value={DEFAULT_VALUE}>Default model</option> : null}
          {models.length === 0 ? (
            <option value={NO_MODELS_VALUE} disabled>
              No models
            </option>
          ) : null}
          {modelMissing && selectedModel ? (
            <option value={currentModelValue}>{`${selectedModel.provider} / ${selectedModel.modelId}`}</option>
          ) : null}
          {groups.map((group) => (
            <optgroup key={group.provider} label={group.provider}>
              {group.entries.map((entry) => (
                <option key={`${entry.provider}:${entry.id}`} value={JSON.stringify([entry.provider, entry.id])}>
                  {entry.name || entry.id}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Thinking</span>
        <select
          className={styles.select}
          value={thinkingLevel}
          onChange={(event) => onChangeThinking(event.target.value)}
          disabled={inactive}
          aria-label="Thinking level"
        >
          {thinking.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
