import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { McpPanel } from "./McpPanel";
import { ModelsPanel } from "./ModelsPanel";
import { ProvidersPanel } from "./ProvidersPanel";
import { SettingsForm } from "./SettingsForm";
import { SkillsPanel } from "./SkillsPanel";
import { UsagePanel } from "./UsagePanel";
import styles from "./system-panel.module.css";

type SystemTab = "settings" | "models" | "providers" | "usage" | "skills" | "mcp";

const TABS: readonly { id: SystemTab; label: string }[] = [
  { id: "settings", label: "Settings" },
  { id: "models", label: "Models" },
  { id: "providers", label: "Providers" },
  { id: "usage", label: "Usage" },
  { id: "skills", label: "Skills" },
  { id: "mcp", label: "MCP" },
];

export interface SystemPanelProps {
  root: string | null;
  sessionId: string | null;
  onClose: () => void;
}

/**
 * Right-side sheet for system configuration. Only the active tab is mounted so
 * opening the panel fires one section's queries instead of all six.
 */
export function SystemPanel({ root, sessionId, onClose }: SystemPanelProps): JSX.Element {
  const [tab, setTab] = useState<SystemTab>("settings");
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      // A blocking dialog (extension request) consumes Escape first and calls
      // preventDefault, so the sheet stays open underneath it.
      if (event.key !== "Escape" || event.defaultPrevented) return;
      onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <aside
      className={styles.panel}
      role="dialog"
      aria-label="System"
      tabIndex={-1}
      ref={panelRef}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>System</h2>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          title="Close system panel"
          aria-label="Close system panel"
        >
          ×
        </button>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="System sections">
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`system-tab-${item.id}`}
              aria-selected={active}
              aria-controls="system-tabpanel"
              className={active ? styles.tabActive : styles.tab}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        className={styles.body}
        role="tabpanel"
        id="system-tabpanel"
        aria-labelledby={`system-tab-${tab}`}
      >
        {tab === "settings" ? <SettingsForm /> : null}
        {tab === "models" ? <ModelsPanel /> : null}
        {tab === "providers" ? <ProvidersPanel /> : null}
        {tab === "usage" ? <UsagePanel /> : null}
        {tab === "skills" ? <SkillsPanel root={root} /> : null}
        {tab === "mcp" ? <McpPanel root={root} sessionId={sessionId} /> : null}
      </div>
    </aside>
  );
}
