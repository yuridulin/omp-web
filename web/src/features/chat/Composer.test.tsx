import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Composer } from "./Composer";

afterEach(cleanup);

interface ComposerOverrides {
  value?: string;
  running?: boolean;
  pending?: boolean;
  onAbort?: () => void;
}

function renderComposer(overrides: ComposerOverrides = {}) {
  const onSubmit = vi.fn();
  const onChange = vi.fn();
  const { pending, onAbort } = overrides;
  render(
    <Composer
      value={overrides.value ?? "hello"}
      onChange={onChange}
      onSubmit={onSubmit}
      running={overrides.running ?? false}
      {...(pending === undefined ? {} : { pending })}
      {...(onAbort === undefined ? {} : { onAbort })}
    />,
  );
  return { onSubmit, onChange, textarea: screen.getByRole("textbox", { name: "Message" }) };
}

describe("Composer", () => {
  it("sends on Enter while idle", () => {
    const { onSubmit, textarea } = renderComposer();
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("hello", "send");
    expect((textarea as HTMLTextAreaElement).value).toBe("hello");
  });

  it("queues a follow-up on Enter while running", () => {
    const { onSubmit, textarea } = renderComposer({ running: true });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("hello", "followUp");
  });

  it("steers on Ctrl+Enter while running", () => {
    const { onSubmit, textarea } = renderComposer({ running: true });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledWith("hello", "steer");
  });

  it("invokes abort from the Stop button", () => {
    const onAbort = vi.fn();
    renderComposer({ running: true, onAbort });
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it("refuses to submit an empty draft", () => {
    const { onSubmit, textarea } = renderComposer({ value: "   " });
    fireEvent.keyDown(textarea, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("trims surrounding whitespace before submitting", () => {
    const { onSubmit, textarea } = renderComposer({ value: "  hello  " });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("hello", "send");
  });

  it("keeps Shift+Enter as a newline", () => {
    const { onSubmit, textarea } = renderComposer();
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("leaves abort enabled while a submit is pending", () => {
    const onAbort = vi.fn();
    renderComposer({ running: true, pending: true, onAbort });
    const stop = screen.getByRole("button", { name: "Stop" });
    expect((stop as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Queue" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
