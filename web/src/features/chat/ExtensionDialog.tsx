import { useEffect, useState, type FormEvent, type JSX } from "react";
import type {
  ExtensionQuestion,
  ExtensionRequest,
  ExtensionResponse,
} from "@/state/extension-store";
import styles from "./extension-dialog.module.css";

export interface ExtensionDialogProps {
  request: ExtensionRequest;
  busy?: boolean;
  error?: string | null;
  onRespond: (response: ExtensionResponse) => void | Promise<void>;
}

interface AskDraft {
  selected: string[];
  custom: string;
}

interface DialogDraft {
  requestId: string;
  selectValue: string;
  text: string;
  ask: Record<string, AskDraft>;
}

const emptyAskDraft: AskDraft = { selected: [], custom: "" };

function initialDraft(request: ExtensionRequest): DialogDraft {
  const ask: Record<string, AskDraft> = {};
  if (request.method === "ask") {
    for (const question of request.questions) ask[question.id] = { ...emptyAskDraft };
  }
  return {
    requestId: request.id,
    selectValue: "",
    text: request.method === "editor" ? (request.prefill ?? "") : "",
    ask,
  };
}

export function ExtensionDialog({
  request,
  busy = false,
  error = null,
  onRespond,
}: ExtensionDialogProps): JSX.Element {
  const [draft, setDraft] = useState(() => initialDraft(request));
  // A new request must never inherit the previous form's state. Adjusting
  // during render (rather than in an effect) avoids painting stale values.
  const current = draft.requestId === request.id ? draft : initialDraft(request);
  if (draft.requestId !== request.id) setDraft(current);

  useEffect(() => {
    if (busy) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      void onRespond({ cancelled: true });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onRespond]);

  const respond = (response: ExtensionResponse): void => {
    if (busy) return;
    void onRespond(response);
  };

  const questionDraft = (question: ExtensionQuestion): AskDraft =>
    current.ask[question.id] ?? emptyAskDraft;

  const toggleAskOption = (question: ExtensionQuestion, label: string): void => {
    const entry = questionDraft(question);
    if (question.multi) {
      const selected = entry.selected.includes(label)
        ? entry.selected.filter((value) => value !== label)
        : [...entry.selected, label];
      setDraft({
        ...current,
        ask: { ...current.ask, [question.id]: { ...entry, selected } },
      });
    } else {
      setDraft({
        ...current,
        ask: {
          ...current.ask,
          [question.id]: { selected: [label], custom: "" },
        },
      });
    }
  };

  const changeAskCustom = (question: ExtensionQuestion, value: string): void => {
    const entry = questionDraft(question);
    const selected = question.multi || value.trim() === "" ? entry.selected : [];
    setDraft({
      ...current,
      ask: { ...current.ask, [question.id]: { selected, custom: value } },
    });
  };

  const askReady =
    request.method !== "ask" ||
    request.questions.every((question) => {
      if (question.multi) return true;
      const entry = questionDraft(question);
      return entry.selected.length > 0 || entry.custom.trim() !== "";
    });

  const canSubmit =
    !busy &&
    askReady &&
    (request.method !== "select" || current.selectValue !== "");

  const submitResponse = (): void => {
    if (!canSubmit) return;
    switch (request.method) {
      case "select":
        respond({ value: current.selectValue });
        return;
      case "confirm":
        respond({ confirmed: true });
        return;
      case "input":
      case "editor":
        respond({ value: current.text });
        return;
      case "ask":
        respond({
          answers: request.questions.map((question) => {
            const entry = questionDraft(question);
            const customInput = entry.custom.trim();
            return {
              id: question.id,
              selectedOptions: entry.selected,
              ...(customInput !== "" ? { customInput } : {}),
            };
          }),
        });
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    submitResponse();
  };

  return (
    <section className={styles.panel} aria-label={request.title}>
      <header className={styles.header}>
        <h2 className={styles.title}>{request.title}</h2>
        <span className={styles.method}>{request.method}</span>
      </header>

      <form className={styles.form} onSubmit={submit}>
        {request.method === "confirm" ? (
          <p className={styles.message}>{request.message}</p>
        ) : null}

        {request.method === "select" ? (
          <div className={styles.options} role="radiogroup" aria-label={request.title}>
            {request.options.map((option) => (
              <label key={option} className={styles.option}>
                <input
                  type="radio"
                  name={`extension-select-${request.id}`}
                  value={option}
                  aria-label={option}
                  checked={current.selectValue === option}
                  disabled={busy}
                  onChange={() => setDraft({ ...current, selectValue: option })}
                />
                <span className={styles.optionLabel}>{option}</span>
              </label>
            ))}
          </div>
        ) : null}

        {request.method === "input" ? (
          <input
            className={styles.input}
            type="text"
            aria-label="Response"
            {...(request.placeholder !== undefined ? { placeholder: request.placeholder } : {})}
            value={current.text}
            disabled={busy}
            onChange={(event) => setDraft({ ...current, text: event.target.value })}
          />
        ) : null}

        {request.method === "editor" ? (
          <textarea
            className={request.promptStyle ? `${styles.input} ${styles.promptEditor}` : styles.input}
            aria-label="Response"
            rows={6}
            value={current.text}
            disabled={busy}
            onChange={(event) => setDraft({ ...current, text: event.target.value })}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                submitResponse();
              }
            }}
          />
        ) : null}

        {request.method === "ask" ? (
          <div className={styles.questions}>
            {request.questions.map((question) => {
              const entry = questionDraft(question);
              return (
                <fieldset key={question.id} className={styles.question}>
                  <legend className={styles.legend}>
                    {question.header ? (
                      <span className={styles.questionHeader}>{question.header}</span>
                    ) : null}
                    <span className={styles.questionText}>{question.question}</span>
                  </legend>
                  <div className={styles.options} role="group">
                    {question.options.map((option, index) => (
                      <label key={option.label} className={styles.option}>
                        <input
                          type={question.multi ? "checkbox" : "radio"}
                          name={`extension-ask-${request.id}-${question.id}`}
                          value={option.label}
                          aria-label={option.label}
                          checked={entry.selected.includes(option.label)}
                          disabled={busy}
                          onChange={() => toggleAskOption(question, option.label)}
                        />
                        <span className={styles.optionBody}>
                          <span className={styles.optionLabel}>{option.label}</span>
                          {index === question.recommended ? (
                            <span className={styles.recommended} aria-hidden="true">
                              recommended
                            </span>
                          ) : null}
                          {option.description !== undefined ? (
                            <span className={styles.optionDescription}>{option.description}</span>
                          ) : null}
                          {option.preview !== undefined ? (
                            <pre className={styles.preview}>{option.preview}</pre>
                          ) : null}
                        </span>
                      </label>
                    ))}
                    <label className={styles.option}>
                      <span className={styles.optionLabel}>Other</span>
                      <input
                        className={styles.input}
                        type="text"
                        aria-label={`Other answer for ${question.question}`}
                        placeholder="Other"
                        value={entry.custom}
                        disabled={busy}
                        onChange={(event) => changeAskCustom(question, event.target.value)}
                      />
                    </label>
                  </div>
                </fieldset>
              );
            })}
          </div>
        ) : null}

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.cancel}
            disabled={busy}
            onClick={() => respond({ cancelled: true })}
          >
            Cancel
          </button>
          <button type="submit" className={styles.submit} disabled={!canSubmit}>
            {request.method === "confirm" ? "Confirm" : "Submit"}
          </button>
        </footer>
      </form>
    </section>
  );
}
