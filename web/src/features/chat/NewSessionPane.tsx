import { useCallback, useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { fetchDefaultCwd, validateCwd } from "@/api/agent";
import type { ModelCatalog } from "@/api/agent";
import { basename, comparablePath } from "@/api/paths";
import type { ProjectSummary } from "@/api/workspace";
import { Composer } from "./Composer";
import { CwdPicker } from "./CwdPicker";
import { ModelPicker } from "./ModelPicker";
import styles from "./new-session.module.css";

export interface NewSessionInputView {
  cwd: string;
  text: string;
  provider?: string;
  modelId?: string;
  thinkingLevel?: string;
}

export interface NewSessionPaneProps {
  projects: ProjectSummary[];
  models: ModelCatalog;
  modelsLoading: boolean;
  busy: boolean;
  error: string | null;
  initialCwd?: string | null;
  onCancel: () => void;
  onCreate: (input: NewSessionInputView) => void | Promise<void>;
}

const CUSTOM_PATH = "__custom_path__";
const FALLBACK_THINKING_LEVELS = ["off", "auto"];

interface SelectedModel {
  provider: string;
  modelId: string;
}

function levelsForModel(models: ModelCatalog, model: SelectedModel | null): string[] {
  if (model === null) return FALLBACK_THINKING_LEVELS;
  const entry = models.modelList.find(
    (item) => item.provider === model.provider && item.id === model.modelId,
  );
  const fromEntry = entry?.thinkingLevels;
  if (fromEntry !== undefined && fromEntry.length > 0) return fromEntry;
  const fromCatalog = models.thinkingLevels[`${model.provider}:${model.modelId}`];
  if (fromCatalog !== undefined && fromCatalog.length > 0) return fromCatalog;
  return FALLBACK_THINKING_LEVELS;
}

export function NewSessionPane({
  projects,
  models,
  modelsLoading,
  busy,
  error,
  initialCwd = null,
  onCancel,
  onCreate,
}: NewSessionPaneProps): JSX.Element {
  const initialSeed = useRef(initialCwd ?? projects[0]?.path ?? "").current;
  const [cwd, setCwd] = useState(initialSeed);
  const [text, setText] = useState("");
  const [selectedModel, setSelectedModel] = useState<SelectedModel | null>(null);
  const [thinking, setThinking] = useState("auto");
  const [cwdLoading, setCwdLoading] = useState(initialSeed === "");
  const [cwdError, setCwdError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const autoResolved = useRef(false);
  const pathRef = useRef<HTMLInputElement>(null);
  const pending = busy || submitting;

  const loadDefaultCwd = useCallback(async () => {
    setCwdLoading(true);
    setCwdError(null);
    try {
      const path = await fetchDefaultCwd();
      setCwd((current) => (current.trim() === "" ? path : current));
    } catch (cause) {
      setCwdError(cause instanceof Error ? cause.message : "Unable to resolve a default workspace");
    } finally {
      setCwdLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoResolved.current || initialSeed !== "") return;
    autoResolved.current = true;
    void loadDefaultCwd();
  }, [initialSeed, loadDefaultCwd]);

  const effectiveModel = selectedModel ?? models.defaultModel;
  const thinkingLevels = levelsForModel(models, effectiveModel);
  const selectedProject = projects.find(
    (project) => comparablePath(project.path) === comparablePath(cwd),
  );

  const changePath = (next: string) => {
    setCwd(next);
    setCwdError(null);
    setLocalError(null);
    setPickerOpen(false);
    setCustomMode(false);
  };

  const chooseProject = (next: string) => {
    if (next === CUSTOM_PATH) {
      setCustomMode(true);
      pathRef.current?.focus();
      pathRef.current?.select();
      return;
    }
    changePath(next);
  };

  const submit = async (draft: string) => {
    if (pending) return;
    const prompt = draft.trim();
    if (prompt === "") {
      setLocalError("Write a prompt to start the session.");
      return;
    }
    const target = cwd.trim();
    if (target === "") {
      setLocalError("Choose a workspace folder for the session.");
      return;
    }
    setLocalError(null);
    setSubmitting(true);
    try {
      const validated = await validateCwd(target);
      await onCreate({
        cwd: validated.cwd,
        text: prompt,
        ...(selectedModel !== null
          ? { provider: selectedModel.provider, modelId: selectedModel.modelId }
          : {}),
        ...(thinking !== "auto" ? { thinkingLevel: thinking } : {}),
      });
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "Unable to create the session");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className={styles.pane}>
      <header className={styles.header}>
        <h2 className={styles.title}>New session</h2>
        <button type="button" className={styles.button} onClick={onCancel}>
          Cancel
        </button>
      </header>
      <div className={styles.body}>
        <section className={styles.section} aria-label="Workspace">
          <label className={styles.label} htmlFor="new-session-workspace">
            Workspace
          </label>
          <div className={styles.row}>
            <select
              id="new-session-workspace"
              className={styles.select}
              value={customMode ? CUSTOM_PATH : (selectedProject?.path ?? CUSTOM_PATH)}
              onChange={(event) => chooseProject(event.target.value)}
              disabled={pending}
            >
              {projects.map((project) => (
                <option key={project.path} value={project.path}>
                  {project.alias?.trim() || basename(project.path)}
                </option>
              ))}
              <option value={CUSTOM_PATH}>Custom path…</option>
            </select>
            <input
              ref={pathRef}
              className={styles.input}
              value={cwd}
              onChange={(event) => changePath(event.target.value)}
              placeholder="Workspace folder"
              aria-label="Workspace path"
              spellCheck={false}
              disabled={pending}
            />
            <button
              type="button"
              className={styles.button}
              onClick={() => setPickerOpen((open) => !open)}
              aria-expanded={pickerOpen}
              disabled={pending || cwdLoading}
            >
              Browse…
            </button>
          </div>
          {cwdLoading ? <p className={styles.note}>Resolving a default workspace…</p> : null}
          {cwdError !== null ? (
            <div className={styles.alert}>
              <span role="alert">{cwdError}</span>
              <button
                type="button"
                className={styles.button}
                onClick={() => void loadDefaultCwd()}
                disabled={cwdLoading}
              >
                Retry
              </button>
            </div>
          ) : null}
          {pickerOpen ? (
            <CwdPicker value={cwd} onChange={(next) => changePath(next)} disabled={pending} />
          ) : null}
        </section>
        <div className={styles.composerWrap}>
          <Composer
            value={text}
            onChange={setText}
            onSubmit={(draft) => submit(draft)}
            running={false}
            pending={pending}
            error={localError ?? error}
            placeholder="Describe the task for the new session…"
            submitLabel="Start session"
            hint="Enter to start · Shift+Enter for a new line"
            controls={
              <ModelPicker
                models={models.modelList}
                model={effectiveModel}
                thinkingLevel={thinking}
                thinkingLevels={thinkingLevels}
                loading={modelsLoading}
                disabled={pending}
                allowAutoThinking
                onChangeModel={(provider, modelId) => {
                  setSelectedModel({ provider, modelId });
                  setThinking("auto");
                }}
                onChangeThinking={setThinking}
              />
            }
          />
        </div>
      </div>
    </main>
  );
}
