import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, JSX, ReactNode } from "react";
import {
  formatAgentEnv,
  parseAgentEnv,
  readNativeBoolean,
  readNativeString,
  updateNativeSetting,
  type NativeSettings,
  type WebSettings,
} from "@/api/system-config";
import { isRecord } from "@/api/guards";
import {
  systemConfigErrorMessage,
  useNativeSettings,
  useSaveNativeSettings,
  useSaveWebSettings,
  useWebSettings,
} from "./use-system-config";
import styles from "./settings-form.module.css";

interface Option {
  value: string;
  label: string;
}

const THINKING_OPTIONS: readonly Option[] = [
  { value: "auto", label: "auto" },
  { value: "minimal", label: "minimal" },
  { value: "low", label: "low" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" },
  { value: "xhigh", label: "xhigh" },
  { value: "max", label: "max" },
];

const VERBOSITY_OPTIONS: readonly Option[] = [
  { value: "low", label: "low" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" },
];

const PERSONALITY_OPTIONS: readonly Option[] = [
  { value: "default", label: "default" },
  { value: "friendly", label: "friendly" },
  { value: "pragmatic", label: "pragmatic" },
  { value: "none", label: "none" },
];

const APPROVAL_MODE_OPTIONS: readonly Option[] = [
  { value: "always-ask", label: "always ask" },
  { value: "write", label: "write" },
  { value: "yolo", label: "yolo" },
];

const BASH_APPROVAL_OPTIONS: readonly Option[] = [
  { value: "allow", label: "allow" },
  { value: "prompt", label: "prompt" },
  { value: "deny", label: "deny" },
];

const EXTENSION_APPROVAL_OPTIONS: readonly Option[] = [
  { value: "allow", label: "allow" },
  { value: "prompt", label: "prompt" },
];

/** Validate the JSON textarea before it reaches the server's stricter parser. */
function parseLspServersText(
  text: string,
): { servers: WebSettings["lsp"]["servers"] } | { error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { servers: [] };
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return { error: "Language server definitions must be valid JSON." };
  }
  if (!Array.isArray(value)) return { error: "Language server definitions must be a JSON array." };
  const servers: WebSettings["lsp"]["servers"] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return { error: "Each language server must be an object." };
    const { id, languages, command, args, env } = entry;
    if (typeof id !== "string" || !id.trim()) return { error: "Every server needs a non-empty id." };
    if (!Array.isArray(languages) || languages.some((language) => typeof language !== "string")) {
      return { error: `Server ${id}: languages must be an array of strings.` };
    }
    if (typeof command !== "string" || !command.trim()) {
      return { error: `Server ${id}: command must be a non-empty string.` };
    }
    if (args !== undefined && (!Array.isArray(args) || args.some((arg) => typeof arg !== "string"))) {
      return { error: `Server ${id}: args must be an array of strings.` };
    }
    if (env !== undefined && (!isRecord(env) || Object.values(env).some((item) => typeof item !== "string"))) {
      return { error: `Server ${id}: env must map names to strings.` };
    }
    const server: WebSettings["lsp"]["servers"][number] = {
      id,
      languages: languages as string[],
      command,
      args: (args as string[] | undefined) ?? [],
    };
    if (env && isRecord(env)) server.env = env as Record<string, string>;
    servers.push(server);
  }
  return { servers };
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: readonly Option[];
  allowUnset: boolean;
  disabled: boolean;
  onChange(value: string): void;
}

function SelectField({ label, value, options, allowUnset, disabled, onChange }: SelectFieldProps) {
  const known = options.some((option) => option.value === value);
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <select
        className={styles.select}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.currentTarget.value)}
      >
        {allowUnset ? <option value="">unset</option> : null}
        {!known && value.length > 0 ? <option value={value}>{value}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface ToggleFieldProps {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange(checked: boolean): void;
}

function ToggleField({ label, checked, disabled, onChange }: ToggleFieldProps) {
  return (
    <label className={styles.toggle}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function Section(props: { title: string; children: ReactNode; meta?: string }) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>{props.title}</h3>
      {props.meta ? <span className={styles.sectionMeta}>{props.meta}</span> : null}
      <div className={styles.fields}>{props.children}</div>
    </div>
  );
}

export function SettingsForm(): JSX.Element {
  const settingsQuery = useNativeSettings();
  const saveSettings = useSaveNativeSettings();
  const webQuery = useWebSettings();
  const saveWeb = useSaveWebSettings();

  const [draft, setDraft] = useState<NativeSettings | null>(null);
  const [nativeFeedback, setNativeFeedback] = useState<string | null>(null);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const [webDraft, setWebDraft] = useState<WebSettings | null>(null);
  const [envText, setEnvText] = useState("");
  const [lspServersText, setLspServersText] = useState("");
  const [envErrors, setEnvErrors] = useState<string[]>([]);
  const [webFeedback, setWebFeedback] = useState<string | null>(null);
  const [webError, setWebError] = useState<string | null>(null);

  useEffect(() => {
    if (settingsQuery.data) setDraft(settingsQuery.data.settings);
  }, [settingsQuery.data]);

  useEffect(() => {
    if (!webQuery.data) return;
    setWebDraft(webQuery.data);
    setEnvText(formatAgentEnv(webQuery.data.agentEnv));
    setLspServersText(JSON.stringify(webQuery.data.lsp.servers, null, 2));
  }, [webQuery.data]);

  const nativeDirty = useMemo(() => {
    if (!draft || !settingsQuery.data) return false;
    return JSON.stringify(draft) !== JSON.stringify(settingsQuery.data.settings);
  }, [draft, settingsQuery.data]);

  const nativeBusy = saveSettings.isPending;
  const webBusy = saveWeb.isPending;

  const update = (path: readonly string[], value: unknown) => {
    setDraft((current) => (current ? updateNativeSetting(current, path, value) : current));
    setNativeFeedback(null);
    setNativeError(null);
  };

  const saveNative = async () => {
    if (!draft || nativeBusy) return;
    setNativeFeedback(null);
    setNativeError(null);
    try {
      await saveSettings.mutateAsync(draft);
      setNativeFeedback("Settings saved");
    } catch (cause) {
      setNativeError(systemConfigErrorMessage(cause));
    }
  };

  const updateWeb = (patch: Partial<Pick<WebSettings, "autoResumeSessions" | "agentToolsEnabled" | "lsp">>) => {
    setWebDraft((current): WebSettings | null => (current ? { ...current, ...patch } : current));
    setWebFeedback(null);
    setWebError(null);
  };

  const saveWebSettings = async () => {
    if (!webDraft || webBusy) return;
    setWebFeedback(null);
    setWebError(null);
    const parsed = parseAgentEnv(envText);
    setEnvErrors(parsed.errors);
    if (parsed.errors.length > 0) {
      setWebError("Fix the agent environment errors before saving.");
      return;
    }
    const lsp = parseLspServersText(lspServersText);
    if ("error" in lsp) {
      setWebError(lsp.error);
      return;
    }
    try {
      const saved = await saveWeb.mutateAsync({
        autoResumeSessions: webDraft.autoResumeSessions,
        agentToolsEnabled: webDraft.agentToolsEnabled,
        agentEnv: parsed.values,
        lsp: { enabled: webDraft.lsp.enabled, servers: lsp.servers },
      });
      setWebDraft(saved);
      setEnvText(formatAgentEnv(saved.agentEnv));
      setLspServersText(JSON.stringify(saved.lsp.servers, null, 2));
      setWebFeedback("Web settings saved");
    } catch (cause) {
      setWebError(systemConfigErrorMessage(cause));
    }
  };

  const settings = draft;

  return (
    <div className={styles.panel}>
      <section className={styles.block} aria-label="Native settings">
        <header className={styles.header}>
          <h2 className={styles.title}>Settings</h2>
          <span className={styles.meta}>{settingsQuery.data?.path ?? "config.yml"}</span>
        </header>

        {settingsQuery.isLoading ? <p className={styles.status}>Loading settings…</p> : null}
        {settingsQuery.isError ? (
          <p className={styles.error} role="alert">
            {systemConfigErrorMessage(settingsQuery.error)}
          </p>
        ) : null}
        {settingsQuery.isSuccess && !settings ? (
          <p className={styles.empty}>No settings returned.</p>
        ) : null}

        {settings ? (
          <>
            <div className={styles.sections}>
              <Section title="Model behaviour">
                <SelectField
                  label="Default thinking level"
                  value={readNativeString(settings, ["defaultThinkingLevel"], "")}
                  options={THINKING_OPTIONS}
                  allowUnset
                  disabled={nativeBusy}
                  onChange={(value) => update(["defaultThinkingLevel"], value === "" ? undefined : value)}
                />
                <SelectField
                  label="Text verbosity"
                  value={readNativeString(settings, ["textVerbosity"], "")}
                  options={VERBOSITY_OPTIONS}
                  allowUnset
                  disabled={nativeBusy}
                  onChange={(value) => update(["textVerbosity"], value === "" ? undefined : value)}
                />
                <SelectField
                  label="Personality"
                  value={readNativeString(settings, ["personality"], "")}
                  options={PERSONALITY_OPTIONS}
                  allowUnset
                  disabled={nativeBusy}
                  onChange={(value) => update(["personality"], value === "" ? undefined : value)}
                />
                <ToggleField
                  label="Hide thinking block"
                  checked={readNativeBoolean(settings, ["hideThinkingBlock"], false)}
                  disabled={nativeBusy}
                  onChange={(checked) => update(["hideThinkingBlock"], checked)}
                />
                <ToggleField
                  label="External thinking"
                  checked={readNativeBoolean(settings, ["externalThinking"], false)}
                  disabled={nativeBusy}
                  onChange={(checked) => update(["externalThinking"], checked)}
                />
              </Section>

              <Section title="Tools & approvals">
                <SelectField
                  label="Approval mode"
                  value={readNativeString(settings, ["tools", "approvalMode"], "")}
                  options={APPROVAL_MODE_OPTIONS}
                  allowUnset
                  disabled={nativeBusy}
                  onChange={(value) => update(["tools", "approvalMode"], value === "" ? undefined : value)}
                />
                <SelectField
                  label="Bash approval"
                  value={readNativeString(settings, ["tools", "approval", "bash"], "")}
                  options={BASH_APPROVAL_OPTIONS}
                  allowUnset
                  disabled={nativeBusy}
                  onChange={(value) => update(["tools", "approval", "bash"], value === "" ? undefined : value)}
                />
                <SelectField
                  label="Extension approval"
                  value={readNativeString(settings, ["tools", "approval", "extension"], "")}
                  options={EXTENSION_APPROVAL_OPTIONS}
                  allowUnset
                  disabled={nativeBusy}
                  onChange={(value) =>
                    update(["tools", "approval", "extension"], value === "" ? undefined : value)
                  }
                />
              </Section>

              <Section title="MCP">
                <ToggleField
                  label="Enable project config"
                  checked={readNativeBoolean(settings, ["mcp", "enableProjectConfig"], true)}
                  disabled={nativeBusy}
                  onChange={(checked) => update(["mcp", "enableProjectConfig"], checked)}
                />
                <ToggleField
                  label="Render markdown results"
                  checked={readNativeBoolean(settings, ["mcp", "renderMarkdownResults"], true)}
                  disabled={nativeBusy}
                  onChange={(checked) => update(["mcp", "renderMarkdownResults"], checked)}
                />
                <ToggleField
                  label="Notifications"
                  checked={readNativeBoolean(settings, ["mcp", "notifications"], true)}
                  disabled={nativeBusy}
                  onChange={(checked) => update(["mcp", "notifications"], checked)}
                />
              </Section>

              <Section title="Reliability">
                <ToggleField
                  label="Retry on failure"
                  checked={readNativeBoolean(settings, ["retry", "enabled"], true)}
                  disabled={nativeBusy}
                  onChange={(checked) => update(["retry", "enabled"], checked)}
                />
                <ToggleField
                  label="Compaction"
                  checked={readNativeBoolean(settings, ["compaction", "enabled"], true)}
                  disabled={nativeBusy}
                  onChange={(checked) => update(["compaction", "enabled"], checked)}
                />
              </Section>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={nativeBusy || !nativeDirty}
                onClick={() => void saveNative()}
              >
                {nativeBusy ? "Saving…" : "Save settings"}
              </button>
              {nativeDirty ? <span className={styles.dirty}>unsaved</span> : null}
              {nativeFeedback ? <span className={styles.success}>{nativeFeedback}</span> : null}
            </div>
            {nativeError ? (
              <p className={styles.error} role="alert">
                {nativeError}
              </p>
            ) : null}
          </>
        ) : null}
      </section>

      <section className={styles.block} aria-label="Web settings">
        <header className={styles.header}>
          <h2 className={styles.title}>Web settings</h2>
          <span className={styles.meta}>omp-web server settings</span>
        </header>

        {webQuery.isLoading ? <p className={styles.status}>Loading web settings…</p> : null}
        {webQuery.isError ? (
          <p className={styles.error} role="alert">
            {systemConfigErrorMessage(webQuery.error)}
          </p>
        ) : null}

        {webDraft ? (
          <>
            <div className={styles.sections}>
              <Section title="Sessions">
                <ToggleField
                  label="Auto-resume sessions"
                  checked={webDraft.autoResumeSessions}
                  disabled={webBusy}
                  onChange={(checked) => updateWeb({ autoResumeSessions: checked })}
                />
                <ToggleField
                  label="Agent tools enabled"
                  checked={webDraft.agentToolsEnabled}
                  disabled={webBusy}
                  onChange={(checked) => updateWeb({ agentToolsEnabled: checked })}
                />
              </Section>

              <Section title="Language servers">
                <ToggleField
                  label="Enable language servers"
                  checked={webDraft.lsp.enabled}
                  disabled={webBusy}
                  onChange={(checked) => updateWeb({ lsp: { ...webDraft.lsp, enabled: checked } })}
                />
                <p className={styles.hint}>
                  Built-in presets: <code>typescript</code> (bundled server) and <code>csharp</code>
                  {" "}(<code>csharp-ls</code> or <code>omnisharp</code> on PATH). New servers apply to
                  documents opened after saving.
                </p>
                <textarea
                  className={styles.textarea}
                  aria-label="Language server definitions (JSON)"
                  spellCheck={false}
                  value={lspServersText}
                  disabled={webBusy}
                  rows={8}
                  placeholder={'[\n  {\n    "id": "typescript",\n    "languages": ["typescript"],\n    "command": "typescript-language-server",\n    "args": ["--stdio"]\n  }\n]'}
                  onChange={(event) => {
                    setLspServersText(event.currentTarget.value);
                    setWebFeedback(null);
                    setWebError(null);
                  }}
                />
              </Section>

              <div className={styles.envSection}>
                <h3 className={styles.sectionTitle}>Agent environment</h3>
                <p className={styles.hint}>
                  One <code>KEY=VALUE</code> per line. Blank lines and <code>#</code> comments are
                  ignored; omp-web keeps its own plumbing variables reserved.
                </p>
                <textarea
                  className={styles.textarea}
                  aria-label="Agent environment"
                  spellCheck={false}
                  value={envText}
                  disabled={webBusy}
                  rows={6}
                  placeholder={"HTTPS_PROXY=http://proxy.local:8080"}
                  onChange={(event) => {
                    setEnvText(event.currentTarget.value);
                    setEnvErrors([]);
                    setWebFeedback(null);
                    setWebError(null);
                  }}
                />
                {envErrors.length > 0 ? (
                  <ul className={styles.envErrors}>
                    {envErrors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={webBusy}
                onClick={() => void saveWebSettings()}
              >
                {webBusy ? "Saving…" : "Save web settings"}
              </button>
              {webFeedback ? <span className={styles.success}>{webFeedback}</span> : null}
            </div>
            {webError ? (
              <p className={styles.error} role="alert">
                {webError}
              </p>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
