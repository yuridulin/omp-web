import { useEffect, useState, type FormEvent, type JSX } from "react";
import type {
  ExtensionQuestion,
  ExtensionRequest,
  ExtensionResponse,
} from "@/state/extension-store";
import type { ExtensionDialogClasses } from "./classes";

export interface ExtensionDialogProps {
  request: ExtensionRequest;
  classes: ExtensionDialogClasses;
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
  classes,
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
    <section className={classes.panel} aria-label={request.title}>
      <header className={classes.header}>
        <h2 className={classes.title}>{request.title}</h2>
        <span className={classes.method}>{request.method}</span>
      </header>

      <form className={classes.form} onSubmit={submit}>
        {request.method === "confirm" ? (
          <p className={classes.message}>{request.message}</p>
        ) : null}

        {request.method === "select" ? (
          <div className={classes.options} role="radiogroup" aria-label={request.title}>
            {request.options.map((option) => (
              <label key={option} className={classes.option}>
                <input
                  type="radio"
                  name={`extension-select-${request.id}`}
                  value={option}
                  aria-label={option}
                  checked={current.selectValue === option}
                  disabled={busy}
                  onChange={() => setDraft({ ...current, selectValue: option })}
                />
                <span className={classes.optionLabel}>{option}</span>
              </label>
            ))}
          </div>
        ) : null}

        {request.method === "input" ? (
          <input
            className={classes.input}
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
            className={request.promptStyle ? `${classes.input} ${classes.promptEditor}` : classes.input}
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
          <div className={classes.questions}>
            {request.questions.map((question) => {
              const entry = questionDraft(question);
              return (
                <fieldset key={question.id} className={classes.question}>
                  <legend className={classes.legend}>
                    {question.header ? (
                      <span className={classes.questionHeader}>{question.header}</span>
                    ) : null}
                    <span className={classes.questionText}>{question.question}</span>
                  </legend>
                  <div className={classes.options} role="group">
                    {question.options.map((option, index) => (
                      <label key={option.label} className={classes.option}>
                        <input
                          type={question.multi ? "checkbox" : "radio"}
                          name={`extension-ask-${request.id}-${question.id}`}
                          value={option.label}
                          aria-label={option.label}
                          checked={entry.selected.includes(option.label)}
                          disabled={busy}
                          onChange={() => toggleAskOption(question, option.label)}
                        />
                        <span className={classes.optionBody}>
                          <span className={classes.optionLabel}>{option.label}</span>
                          {index === question.recommended ? (
                            <span className={classes.recommended} aria-hidden="true">
                              recommended
                            </span>
                          ) : null}
                          {option.description !== undefined ? (
                            <span className={classes.optionDescription}>{option.description}</span>
                          ) : null}
                          {option.preview !== undefined ? (
                            <pre className={classes.preview}>{option.preview}</pre>
                          ) : null}
                        </span>
                      </label>
                    ))}
                    <label className={classes.option}>
                      {/* Same indicator column as the options so the row lines up. */}
                      <input
                        type={question.multi ? "checkbox" : "radio"}
                        className={classes.otherMarker}
                        checked={entry.custom.trim() !== ""}
                        readOnly
                        tabIndex={-1}
                        aria-hidden="true"
                      />
                      <span className={classes.optionLabel}>Other</span>
                      <input
                        className={`${classes.input} ${classes.otherInput}`}
                        type="text"
                        aria-label={`Other answer for ${question.question}`}
                        placeholder="Your answer"
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
          <p className={classes.error} role="alert">
            {error}
          </p>
        ) : null}

        <footer className={classes.footer}>
          <button
            type="button"
            className={classes.cancel}
            disabled={busy}
            onClick={() => respond({ cancelled: true })}
          >
            Cancel
          </button>
          <button type="submit" className={classes.submit} disabled={!canSubmit}>
            {request.method === "confirm" ? "Confirm" : "Submit"}
          </button>
        </footer>
      </form>
    </section>
  );
}
