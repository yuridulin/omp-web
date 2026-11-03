import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, SessionSnapshot } from "@/api/session-types";
import { writeDragPayload, type DragPayload } from "@/drag/payload";
import type { ChatSlotProps } from "@/slots/chat";
import { resetComposerStoreForTests } from "@/state/composer-store";
import { ChatSkin } from "./ChatSkin";

function fakeDataTransfer(): DataTransfer {
  const values = new Map<string, string>();
  return {
    setData: (type: string, value: string) => {
      values.set(type, value);
    },
    getData: (type: string) => values.get(type) ?? "",
    effectAllowed: "uninitialized",
  } as unknown as DataTransfer;
}

function props(onDropPayload: (payload: DragPayload) => void): ChatSlotProps {
  return {
    session: null,
    selected: "s1",
    snapshot: null,
    streamError: null,
    extensionRequest: null,
    extensionBusy: false,
    extensionError: null,
    onExtensionResponse: vi.fn(),
    models: [],
    modelsLoading: false,
    modelValue: null,
    thinkingLevel: "off",
    thinkingLevels: ["off"],
    modelLoading: false,
    onModelChange: vi.fn(),
    onThinkingChange: vi.fn(),
    running: false,
    queue: { steering: [], followUp: [] },
    sending: false,
    onSend: vi.fn(async () => {}),
    onAbort: vi.fn(),
    onRemoveQueued: vi.fn(),
    onPromoteQueued: vi.fn(),
    onDropPayload,
    historyMessages: [],
    historyEntryIds: [],
    hasOlderHistory: false,
    historyOlderEpoch: 0,
    onLoadOlderHistory: vi.fn(),
  };
}

function snapshot(messages: ChatMessage[], streamMessage: ChatMessage | null = null): SessionSnapshot {
  return {
    branching: null,
    draft: { value: "", images: [], files: [] },
    session: {
      sessionId: "s1",
      connection: "open",
      streamId: "stream",
      sequence: 1,
      run: { status: streamMessage ? "running" : "idle", error: null },
      messages,
      entryIds: messages.map((_, index) => `e${index}`),
      stream: { active: streamMessage !== null, message: streamMessage, held: [] },
      queue: { steering: [], followUp: [] },
      notices: [],
      historyRevision: 1,
      lastError: null,
    },
  };
}

beforeEach(() => {
  resetComposerStoreForTests();
});
afterEach(cleanup);

describe("chat skin drop target", () => {
  it("decodes a file payload on the composer and hands it to the callback", () => {
    const onDropPayload = vi.fn();
    const { container } = render(<ChatSkin {...props(onDropPayload)} />);
    const composer = container.querySelector("footer");
    expect(composer).toBeTruthy();

    const dataTransfer = fakeDataTransfer();
    writeDragPayload(dataTransfer, { kind: "file", path: "D:/repo/a.ts", root: "D:/repo" });
    fireEvent.drop(composer as Element, { dataTransfer });

    expect(onDropPayload).toHaveBeenCalledWith({ kind: "file", path: "D:/repo/a.ts", root: "D:/repo" });
  });

  it("ignores garbage drop data", () => {
    const onDropPayload = vi.fn();
    const { container } = render(<ChatSkin {...props(onDropPayload)} />);
    const composer = container.querySelector("footer");
    const dataTransfer = fakeDataTransfer();
    dataTransfer.setData("text/plain", "not a payload");
    fireEvent.drop(composer as Element, { dataTransfer });
    expect(onDropPayload).not.toHaveBeenCalled();
  });
});

describe("chat skin composer", () => {
  it("keeps typed text in the composer", () => {
    const { container } = render(<ChatSkin {...props(vi.fn())} />);
    const textarea = container.querySelector("textarea");
    expect(textarea).toBeTruthy();
    fireEvent.change(textarea as HTMLTextAreaElement, { target: { value: "hello from the dock" } });
    expect((textarea as HTMLTextAreaElement).value).toBe("hello from the dock");
  });
});

describe("chat skin new session draft", () => {
  it("is the normal empty chat with the same composer", () => {
    const { container } = render(<ChatSkin {...props(vi.fn())} selected={null} />);

    expect(screen.queryByText("Select a session")).toBeNull();
    expect(screen.getByText("New session")).toBeTruthy();
    expect(screen.getByText("No messages yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
    expect(screen.queryByLabelText("Workspace path")).toBeNull();

    const textarea = container.querySelector("textarea");
    fireEvent.change(textarea as HTMLTextAreaElement, { target: { value: "first prompt" } });
    expect((textarea as HTMLTextAreaElement).value).toBe("first prompt");
  });

  it("offers auto thinking only before the session exists", () => {
    const options = (): string[] =>
      Array.from(
        screen.getByLabelText("Thinking level").querySelectorAll("option"),
        (option) => (option as HTMLOptionElement).value,
      );

    const { unmount } = render(
      <ChatSkin {...props(vi.fn())} selected={null} thinkingLevel="auto" thinkingLevels={["off", "high"]} />,
    );
    expect(options()).toEqual(["auto", "off", "high"]);
    unmount();

    render(
      <ChatSkin {...props(vi.fn())} thinkingLevel="high" thinkingLevels={["off", "high"]} />,
    );
    expect(options()).toEqual(["off", "high"]);
  });
});

describe("chat skin live turn", () => {
  it("shows a waiting line while the agent has not produced a visible block", () => {
    render(<ChatSkin {...props(vi.fn())} running />);
    expect(screen.getByRole("status").textContent).toContain("Waiting for the agent");
  });

  it("hides the waiting line once streaming thinking is on screen", () => {
    render(
      <ChatSkin
        {...props(vi.fn())}
        running
        snapshot={snapshot([], { role: "assistant", content: [{ type: "thinking", thinking: "planning the edit" }] })}
      />,
    );

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("planning the edit")).toBeTruthy();
    expect(document.querySelector("details")?.hasAttribute("open")).toBe(true);
  });
});

describe("chat skin transcript shells", () => {
  it("defers markdown for rows above the tail", () => {
    const Original = globalThis.IntersectionObserver;
    class SilentObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }
    globalThis.IntersectionObserver = SilentObserver as unknown as typeof IntersectionObserver;

    try {
      const messages: ChatMessage[] = Array.from({ length: 30 }, (_, index) =>
        index === 0
          ? { role: "assistant", content: "**older** row" }
          : { role: "user", content: `message ${index}` },
      );
      const { container } = render(
        <ChatSkin
          {...props(vi.fn())}
          snapshot={snapshot(messages)}
          historyMessages={messages}
          historyEntryIds={messages.map((_, index) => `e${index}`)}
        />,
      );

      expect(container.querySelectorAll("[data-deferred='true']").length).toBe(18);
      expect(container.querySelector("strong")).toBeNull();
      expect(screen.getByText("**older** row")).toBeTruthy();
      expect(screen.getByText("message 29")).toBeTruthy();
    } finally {
      globalThis.IntersectionObserver = Original;
    }
  });
});
