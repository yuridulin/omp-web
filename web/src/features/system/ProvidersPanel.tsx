import type { JSX } from "react";
import type { ConnectedProvider } from "@/api/system-config";
import {
  systemConfigErrorMessage,
  useConfiguredProviders,
  useConnectedProviders,
  useEnableProvider,
  useLoginProviders,
} from "./use-system-config";
import styles from "./providers-panel.module.css";

function loginBadge(loggedIn: boolean): { className: string; label: string } {
  return loggedIn
    ? { className: styles.badgeOn ?? "", label: "connected" }
    : { className: styles.badgeOff ?? "", label: "not connected" };
}

export function ProvidersPanel(): JSX.Element {
  const loginProviders = useLoginProviders();
  const configuredProviders = useConfiguredProviders();
  const connectedProvidersQuery = useConnectedProviders();
  const enableProvider = useEnableProvider();

  const logins = loginProviders.data ?? [];
  const configured = configuredProviders.data ?? [];
  const connected: ConnectedProvider[] = connectedProvidersQuery.data ?? [];
  const disabledCount = connected.filter((provider) => provider.disabled).length;
  const pendingProvider = enableProvider.isPending ? enableProvider.variables : undefined;

  return (
    <section className={styles.panel} aria-label="Providers">
      <header className={styles.header}>
        <h2 className={styles.title}>Providers</h2>
        <span className={styles.meta}>
          {logins.length} login · {configured.length} configured · {connected.length} connected
          {disabledCount > 0 ? ` · ${disabledCount} disabled` : ""}
        </span>
      </header>

      {enableProvider.isError ? (
        <p className={styles.error} role="alert">
          {systemConfigErrorMessage(enableProvider.error)}
        </p>
      ) : null}

      <div className={styles.sections}>
        <section className={styles.section} aria-label="Login providers">
          <h3 className={styles.sectionTitle}>Login providers</h3>
          {loginProviders.isLoading ? <p className={styles.status}>Loading…</p> : null}
          {loginProviders.isError ? (
            <p className={styles.error} role="alert">
              {systemConfigErrorMessage(loginProviders.error)}
            </p>
          ) : null}
          {!loginProviders.isLoading && logins.length === 0 ? (
            <p className={styles.empty}>No login-capable providers reported.</p>
          ) : null}
          <ul className={styles.list}>
            {logins.map((provider) => {
              const badge = loginBadge(provider.loggedIn);
              return (
                <li key={provider.id} className={styles.row}>
                  <span className={styles.name}>{provider.name || provider.id}</span>
                  <span className={styles.id}>{provider.id}</span>
                  {provider.usesCallbackServer ? (
                    <span className={styles.tag}>callback server</span>
                  ) : null}
                  <span className={badge.className}>{badge.label}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className={styles.section} aria-label="Configured providers">
          <h3 className={styles.sectionTitle}>Configured providers</h3>
          {configuredProviders.isLoading ? <p className={styles.status}>Loading…</p> : null}
          {configuredProviders.isError ? (
            <p className={styles.error} role="alert">
              {systemConfigErrorMessage(configuredProviders.error)}
            </p>
          ) : null}
          {!configuredProviders.isLoading && configured.length === 0 ? (
            <p className={styles.empty}>No providers currently resolve models.</p>
          ) : null}
          <ul className={styles.list}>
            {configured.map((provider) => (
              <li key={provider.id} className={styles.row}>
                <span className={styles.name}>{provider.displayName || provider.id}</span>
                <span className={styles.id}>{provider.id}</span>
                <span className={styles.count}>{provider.modelCount} models</span>
                <span className={provider.configured ? styles.badgeOn : styles.badgeOff}>
                  {provider.configured ? "configured" : "unconfigured"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section} aria-label="Connected model providers">
          <h3 className={styles.sectionTitle}>Connected providers</h3>
          {connectedProvidersQuery.isLoading ? <p className={styles.status}>Loading…</p> : null}
          {connectedProvidersQuery.isError ? (
            <p className={styles.error} role="alert">
              {systemConfigErrorMessage(connectedProvidersQuery.error)}
            </p>
          ) : null}
          {!connectedProvidersQuery.isLoading && connected.length === 0 ? (
            <p className={styles.empty}>No connected providers.</p>
          ) : null}
          <ul className={styles.list}>
            {connected.map((provider) => (
              <li key={provider.id} className={styles.row}>
                <span className={styles.name}>{provider.name || provider.id}</span>
                <span className={styles.id}>{provider.id}</span>
                <span className={provider.disabled ? styles.badgeOff : styles.badgeOn}>
                  {provider.disabled ? "disabled" : "enabled"}
                </span>
                {provider.disabled ? (
                  <button
                    type="button"
                    className={styles.button}
                    disabled={enableProvider.isPending}
                    onClick={() => enableProvider.mutate(provider.id)}
                  >
                    {pendingProvider === provider.id ? "Enabling…" : "Enable"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
