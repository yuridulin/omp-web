import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Composer } from "./Composer";
import { testComposerClasses } from "./test-classes";
import type { ComposerImage } from "@/state/composer-store";

afterEach(cleanup);

interface ComposerOverrides {
  value?: string;
  images?: readonly ComposerImage[];
  running?: boolean;
  pending?: boolean;
  onAbort?: () => void;
  onAddImages?: (images: ComposerImage[]) => void;
  onRemoveImage?: (id: string) => void;
}

function renderComposer(overrides: ComposerOverrides = {}) {
  const onSubmit = vi.fn();
  const onChange = vi.fn();
  const { pending, onAbort, onAddImages, onRemoveImage, images } = overrides;
  render(
    <Composer
      value={overrides.value ?? "hello"}
      classes={testComposerClasses}
      onChange={onChange}
      onSubmit={onSubmit}
      running={overrides.running ?? false}
      {...(images === undefined ? {} : { images })}
      {...(pending === undefined ? {} : { pending })}
      {...(onAbort === undefined ? {} : { onAbort })}
      {...(onAddImages === undefined ? {} : { onAddImages })}
      {...(onRemoveImage === undefined ? {} : { onRemoveImage })}
    />,
  );
  return { onSubmit, onChange, textarea: screen.getByRole("textbox", { name: "Message" }) };
}

function pasteFile(textarea: HTMLElement, file: File): void {
  fireEvent.paste(textarea, {
    clipboardData: {
      items: [{ kind: "file", type: file.type, getAsFile: () => file }],
      files: [file],
    },
  });
}

const image: ComposerImage = { id: "image-1", data: "AAAA", mimeType: "image/png", size: 3 };

describe("Composer", () => {
  it("sends on Enter while idle", () => {
    const { onSubmit, textarea } = renderComposer();
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("hello", "send", []);
    expect((textarea as HTMLTextAreaElement).value).toBe("hello");
  });

  it("queues a follow-up on Enter while running", () => {
    const { onSubmit, textarea } = renderComposer({ running: true });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("hello", "followUp", []);
  });

  it("steers on Ctrl+Enter while running", () => {
    const { onSubmit, textarea } = renderComposer({ running: true });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledWith("hello", "steer", []);
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
    expect(onSubmit).toHaveBeenCalledWith("hello", "send", []);
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

  it("attaches an image pasted into the composer", async () => {
    const onAddImages = vi.fn();
    const { textarea } = renderComposer({ onAddImages });
    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
    pasteFile(textarea, file);

    await waitFor(() => expect(onAddImages).toHaveBeenCalledTimes(1));
    const [added] = onAddImages.mock.calls[0] as [ComposerImage[]];
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ mimeType: "image/png", size: 3 });
    expect(added[0]?.data.length).toBeGreaterThan(0);
  });

  it("sends an image-only draft and removes an attachment", () => {
    const onRemoveImage = vi.fn();
    const { onSubmit, textarea } = renderComposer({
      value: "",
      images: [image],
      onRemoveImage,
    });

    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("", "send", [image]);

    fireEvent.click(screen.getByRole("button", { name: "Remove image 1" }));
    expect(onRemoveImage).toHaveBeenCalledWith("image-1");
  });

  it("reports a paste the attachment budget refuses", async () => {
    const onAddImages = vi.fn();
    const { textarea } = renderComposer({ onAddImages });
    const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "huge.png", {
      type: "image/png",
    });
    pasteFile(textarea, file);

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("5MB or smaller"));
    expect(onAddImages).not.toHaveBeenCalled();
  });
});
