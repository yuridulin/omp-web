import { useState } from "react";
import type { JSX } from "react";
import type { ProviderQuotaWindow, UsageGranularity, UsageRange } from "@/api/system-usage";
import {
  USAGE_GRANULARITIES,
  USAGE_RANGES,
  formatCompactNumber,
  formatCost,
  formatNumber,
  formatPercent,
  formatQuotaReset,
} from "@/api/system-usage";
import { useProviderUsage, useUsageReport } from "./use-system-data";
import styles from "./usage-panel.module.css";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseRange(value: string): UsageRange {
  return (USAGE_RANGES as readonly string[]).includes(value) ? (value as UsageRange) : "30d";
}

function parseGranularity(value: string): UsageGranularity {
  return (USAGE_GRANULARITIES as readonly string[]).includes(value)
    ? (value as UsageGranularity)
    : "daily";
}

export function UsagePanel(): JSX.Element {
  const [range, setRange] = useState<UsageRange>("30d");
  const [granularity, setGranularity] = useState<UsageGranularity>("daily");
  const usage = useUsageReport(range, granularity);
  const quota = useProviderUsage();

  const report = usage.data;
  const refreshing = usage.isFetching || quota.isFetching;
  const empty =
    report !== undefined &&
    report.summary.totalTokens === 0 &&
    report.providers.length === 0 &&
    report.modelBreakdown.length === 0 &&
    report.projectBreakdown.length === 0;

  return (
    <section className={styles.panel} aria-label="Usage">
      <header className={styles.header}>
        <div className={styles.titleWrap}>
          <h2 className={styles.title}>Usage</h2>
          <span className={styles.subtitle}>
            Token and cost totals derived from recorded omp sessions
          </span>
        </div>
        <div className={styles.controls}>
          <label className={styles.field}>
            Range
            <select
              className={styles.select}
              value={range}
              onChange={(event) => setRange(parseRange(event.target.value))}
            >
              {USAGE_RANGES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Group
            <select
              className={styles.select}
              value={granularity}
              onChange={(event) => setGranularity(parseGranularity(event.target.value))}
            >
              {USAGE_GRANULARITIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={styles.button}
            disabled={refreshing}
            onClick={() => {
              void usage.refetch();
              void quota.refetch();
            }}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {usage.isPending ? <div className={styles.message}>Loading usage…</div> : null}
      {usage.error ? (
        <div className={styles.error} role="alert">
          {describeError(usage.error)}
        </div>
      ) : null}

      {report ? (
        <>
          <div className={styles.cards}>
            <div className={styles.card}>
              <span className={styles.cardLabel}>Total cost</span>
              <span className={styles.cardValue}>{formatCost(report.summary.totalCost)}</span>
              <span className={styles.cardHint}>
                {formatCost(report.summary.cacheSavings)} cache savings
              </span>
            </div>
            <div className={styles.card}>
              <span className={styles.cardLabel}>Tokens</span>
              <span className={styles.cardValue}>{formatCompactNumber(report.summary.totalTokens)}</span>
              <span className={styles.cardHint}>
                {formatCompactNumber(report.summary.inputTokens)} in ·{" "}
                {formatCompactNumber(report.summary.outputTokens)} out
              </span>
            </div>
            <div className={styles.card}>
              <span className={styles.cardLabel}>Active days</span>
              <span className={styles.cardValue}>{formatNumber(report.summary.activeDays)}</span>
              <span className={styles.cardHint}>
                {formatCompactNumber(report.summary.tokensPerActiveDay)} tokens/day
              </span>
            </div>
            <div className={styles.card}>
              <span className={styles.cardLabel}>Cache hit</span>
              <span className={styles.cardValue}>{formatPercent(report.summary.cachePercentage)}</span>
              <span className={styles.cardHint}>
                {formatCompactNumber(report.summary.cacheReadTokens)} read tokens
              </span>
            </div>
          </div>

          {empty ? <div className={styles.empty}>No usage recorded for this range.</div> : null}

          <div className={styles.grid}>
            <section className={styles.block} aria-label="Provider usage">
              <h3 className={styles.blockTitle}>Providers</h3>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th className={styles.numeric}>Tokens</th>
                      <th className={styles.numeric}>Cost</th>
                      <th className={styles.numeric}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.providers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className={styles.muted}>
                          No provider activity
                        </td>
                      </tr>
                    ) : (
                      report.providers.map((row) => (
                        <tr key={row.provider}>
                          <td>
                            <span className={styles.providerName}>
                              <span
                                className={styles.swatch}
                                style={row.color ? { background: row.color } : undefined}
                              />
                              <span className={styles.truncate}>{row.name}</span>
                            </span>
                          </td>
                          <td className={styles.numeric}>{formatCompactNumber(row.tokens)}</td>
                          <td className={styles.numeric}>{formatCost(row.cost)}</td>
                          <td className={styles.numeric}>{formatPercent(row.share)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={styles.block} aria-label="Model usage">
              <h3 className={styles.blockTitle}>Models</h3>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Provider</th>
                      <th className={styles.numeric}>Tokens</th>
                      <th className={styles.numeric}>Cost</th>
                      <th className={styles.numeric}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.modelBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={styles.muted}>
                          No model activity
                        </td>
                      </tr>
                    ) : (
                      report.modelBreakdown.map((row) => (
                        <tr key={`${row.provider}:${row.model}`}>
                          <td className={styles.truncate} title={row.model}>
                            {row.model}
                          </td>
                          <td className={styles.truncate}>{row.provider}</td>
                          <td className={styles.numeric}>{formatCompactNumber(row.tokens)}</td>
                          <td className={styles.numeric}>{formatCost(row.cost)}</td>
                          <td className={styles.numeric}>{formatPercent(row.share)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={styles.block} aria-label="Project usage">
              <h3 className={styles.blockTitle}>Projects</h3>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th className={styles.numeric}>Sessions</th>
                      <th className={styles.numeric}>Tokens</th>
                      <th className={styles.numeric}>Cost</th>
                      <th className={styles.numeric}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.projectBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={styles.muted}>
                          No project activity
                        </td>
                      </tr>
                    ) : (
                      report.projectBreakdown.map((row) => (
                        <tr key={row.project}>
                          <td className={styles.truncate} title={row.project}>
                            {row.projectName}
                          </td>
                          <td className={styles.numeric}>{formatNumber(row.sessionsCount)}</td>
                          <td className={styles.numeric}>{formatCompactNumber(row.tokens)}</td>
                          <td className={styles.numeric}>{formatCost(row.cost)}</td>
                          <td className={styles.numeric}>{formatPercent(row.share)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div className={styles.footer}>
            {formatNumber(report.scanInfo.transcriptsScanned)} transcripts ·{" "}
            {formatNumber(report.scanInfo.usageRecordsCount)} records ·{" "}
            {report.scanInfo.durationSeconds.toFixed(2)}s scan
          </div>
        </>
      ) : null}

      <section className={styles.quotaSection} aria-label="Provider quotas">
        <div className={styles.quotaHead}>
          <h3 className={styles.blockTitle}>Provider quotas</h3>
          {quota.data?.generatedAt ? (
            <span className={styles.muted}>
              {new Date(quota.data.generatedAt).toLocaleString()}
            </span>
          ) : null}
        </div>
        {quota.isPending ? <div className={styles.message}>Loading quotas…</div> : null}
        {quota.error ? (
          <div className={styles.error} role="alert">
            {describeError(quota.error)}
          </div>
        ) : null}
        {quota.data && quota.data.reports.length === 0 ? (
          <div className={styles.empty}>No provider quota reports.</div>
        ) : null}
        {quota.data && quota.data.reports.length > 0 ? (
          <div className={styles.quotaGrid}>
            {quota.data.reports.map((reportEntry, index) => {
              const windows: { label: string; window: ProviderQuotaWindow | undefined }[] = [
                { label: "5h", window: reportEntry.fiveHour },
                { label: "7d", window: reportEntry.sevenDay },
                { label: "30d", window: reportEntry.monthly },
              ];
              const meta = [
                reportEntry.plan,
                reportEntry.tier,
                reportEntry.bucket,
                reportEntry.accountLabel,
                reportEntry.modelId,
              ].filter((entry): entry is string => Boolean(entry));
              return (
                <article className={styles.quotaCard} key={`${reportEntry.provider}-${index}`}>
                  <div className={styles.quotaHeader}>
                    <span className={styles.quotaName}>{reportEntry.provider}</span>
                    <span className={styles.quotaMeta}>
                      {reportEntry.noLimits ? "No limits" : meta.join(" · ")}
                    </span>
                  </div>
                  {reportEntry.noLimits ? (
                    <span className={styles.muted}>This provider does not report quota windows.</span>
                  ) : (
                    <div className={styles.windows}>
                      {windows.map(({ label, window }) =>
                        window ? (
                          <div className={styles.window} key={label}>
                            <span className={styles.windowLabel}>{label}</span>
                            <div className={styles.bar}>
                              <div
                                className={styles.barFill}
                                data-high={window.percent >= 80 ? "true" : "false"}
                                data-critical={window.percent >= 95 ? "true" : "false"}
                                style={{ width: `${Math.min(100, Math.max(0, window.percent))}%` }}
                              />
                            </div>
                            <span className={styles.windowPercent}>
                              {formatPercent(window.percent, 0)}
                            </span>
                          </div>
                        ) : null,
                      )}
                    </div>
                  )}
                  <span className={styles.reset}>
                    {windows
                      .map(({ label, window }) => {
                        const reset = formatQuotaReset(window);
                        return reset ? `${label} ${reset}` : "";
                      })
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </section>
  );
}
