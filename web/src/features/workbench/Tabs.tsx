import type { WorkbenchTab } from "@/layout/layout-store";
import styles from "./workbench.module.css";

interface TabsProps {
  tabs: WorkbenchTab[];
  activeTabId: string | null;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
}

export function Tabs({ tabs, activeTabId, onActivate, onClose }: TabsProps) {
  if (tabs.length === 0) return <div className={styles.noTabs}>No open files</div>;
  return (
    <div className={styles.tabStrip} role="tablist">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={tab.id === activeTabId ? styles.tabActive : styles.tab}
          role="tab"
          aria-selected={tab.id === activeTabId}
          tabIndex={0}
          onClick={() => onActivate(tab.id)}
          onAuxClick={(event) => {
            if (event.button === 1) {
              event.preventDefault();
              onClose(tab.id);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onActivate(tab.id);
            }
          }}
          title={tab.path}
        >
          <span className={tab.preview ? styles.tabTitlePreview : styles.tabTitle}>{tab.title}</span>
          <button
            className={styles.tabClose}
            aria-label={`Close ${tab.title}`}
            onClick={(event) => {
              event.stopPropagation();
              onClose(tab.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
