import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ExtensionRequest } from "@/state/extension-store";
import { ExtensionDialog } from "./ExtensionDialog";

afterEach(cleanup);

const confirmRequest: ExtensionRequest = {
  id: "confirm-1",
  method: "confirm",
  title: "Delete session",
  message: "This cannot be undone.",
};

describe("ExtensionDialog", () => {
  it("confirms and cancels a confirm request", () => {
    const onRespond = vi.fn();
    const { rerender } = render(
      <ExtensionDialog request={confirmRequest} onRespond={onRespond} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onRespond).toHaveBeenCalledWith({ confirmed: true });

    rerender(<ExtensionDialog request={{ ...confirmRequest, id: "confirm-2" }} onRespond={onRespond} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onRespond).toHaveBeenLastCalledWith({ cancelled: true });
  });

  it("cancels on Escape", () => {
    const onRespond = vi.fn();
    render(<ExtensionDialog request={confirmRequest} onRespond={onRespond} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onRespond).toHaveBeenCalledWith({ cancelled: true });
  });

  it("submits typed input", () => {
    const onRespond = vi.fn();
    const request: ExtensionRequest = {
      id: "input-1",
      method: "input",
      title: "Session name",
      placeholder: "Name",
    };
    render(<ExtensionDialog request={request} onRespond={onRespond} />);

    const field = screen.getByRole("textbox", { name: "Response" });
    fireEvent.change(field, { target: { value: "alpha" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onRespond).toHaveBeenCalledWith({ value: "alpha" });
  });

  it("seeds and submits an editor prefill", () => {
    const onRespond = vi.fn();
    const request: ExtensionRequest = {
      id: "editor-1",
      method: "editor",
      title: "Edit prompt",
      prefill: "original",
      promptStyle: true,
    };
    render(<ExtensionDialog request={request} onRespond={onRespond} />);

    const field = screen.getByRole("textbox", { name: "Response" }) as HTMLTextAreaElement;
    expect(field.value).toBe("original");
    fireEvent.change(field, { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onRespond).toHaveBeenCalledWith({ value: "changed" });
  });

  it("requires a selection in a select request", () => {
    const onRespond = vi.fn();
    const request: ExtensionRequest = {
      id: "select-1",
      method: "select",
      title: "Choose mode",
      options: ["fast", "safe"],
    };
    render(<ExtensionDialog request={request} onRespond={onRespond} />);

    const submit = screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: "safe" }));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(onRespond).toHaveBeenCalledWith({ value: "safe" });
  });

  it("answers a single-select ask only after a choice", () => {
    const onRespond = vi.fn();
    const request: ExtensionRequest = {
      id: "ask-1",
      method: "ask",
      title: "Plan",
      questions: [
        {
          id: "q1",
          question: "Which target?",
          options: [{ label: "web" }, { label: "server", description: "service" }],
          recommended: 0,
        },
      ],
    };
    render(<ExtensionDialog request={request} onRespond={onRespond} />);

    const submit = screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.getByText("recommended")).toBeTruthy();
    expect(screen.getByText("service")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "server" }));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(onRespond).toHaveBeenCalledWith({
      answers: [{ id: "q1", selectedOptions: ["server"] }],
    });
  });

  it("collects multiple ask selections, including an empty multi-select", () => {
    const onRespond = vi.fn();
    const request: ExtensionRequest = {
      id: "ask-2",
      method: "ask",
      title: "Features",
      questions: [
        {
          id: "q1",
          question: "Extras?",
          multi: true,
          options: [{ label: "docs" }, { label: "tests" }],
        },
      ],
    };
    const { rerender } = render(<ExtensionDialog request={request} onRespond={onRespond} />);

    const submit = screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(onRespond).toHaveBeenLastCalledWith({
      answers: [{ id: "q1", selectedOptions: [] }],
    });

    fireEvent.click(screen.getByRole("checkbox", { name: "docs" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "tests" }));
    rerender(<ExtensionDialog request={{ ...request, id: "ask-3" }} onRespond={onRespond} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "docs" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onRespond).toHaveBeenLastCalledWith({
      answers: [{ id: "q1", selectedOptions: ["docs"] }],
    });
  });

  it("supports an other answer for a single-select question", () => {
    const onRespond = vi.fn();
    const request: ExtensionRequest = {
      id: "ask-4",
      method: "ask",
      title: "Reason",
      questions: [
        {
          id: "q1",
          question: "Why?",
          options: [{ label: "speed" }],
        },
      ],
    };
    render(<ExtensionDialog request={request} onRespond={onRespond} />);

    fireEvent.click(screen.getByRole("radio", { name: "speed" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Other answer for Why?" }), {
      target: { value: "custom" },
    });
    expect((screen.getByRole("radio", { name: "speed" }) as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onRespond).toHaveBeenCalledWith({
      answers: [{ id: "q1", selectedOptions: [], customInput: "custom" }],
    });
  });

  it("renders errors and disables actions while busy", () => {
    const onRespond = vi.fn();
    render(
      <ExtensionDialog
        request={confirmRequest}
        busy
        error="Response failed"
        onRespond={onRespond}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe("Response failed");
    const confirm = screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement;
    const cancel = screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(cancel.disabled).toBe(true);

    fireEvent.click(confirm);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onRespond).not.toHaveBeenCalled();
  });

  it("resets form state when the request id changes", () => {
    const request: ExtensionRequest = {
      id: "input-a",
      method: "input",
      title: "First",
    };
    const { rerender } = render(<ExtensionDialog request={request} onRespond={vi.fn()} />);
    const field = screen.getByRole("textbox", { name: "Response" }) as HTMLInputElement;
    fireEvent.change(field, { target: { value: "stale" } });
    expect(field.value).toBe("stale");

    rerender(<ExtensionDialog request={{ ...request, id: "input-b", title: "Second" }} onRespond={vi.fn()} />);
    expect((screen.getByRole("textbox", { name: "Response" }) as HTMLInputElement).value).toBe("");
  });
});
