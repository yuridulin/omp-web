import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/api/agent", () => ({
  fetchThinking: vi.fn(),
}));

import { fetchThinking } from "@/api/agent";
import type { ChatMessage } from "@/api/session-types";
import { MessageView } from "./MessageView";

const fetchThinkingMock = vi.mocked(fetchThinking);

beforeEach(() => {
  fetchThinkingMock.mockReset();
});

afterEach(cleanup);

function assistant(content: unknown): ChatMessage {
  return { role: "assistant", content };
}

describe("MessageView roles", () => {
  it("renders user markdown text and code", () => {
    const { container } = render(
      <MessageView message={{ role: "user", content: "**bold** and `inline`\n\n```ts\nconst x = 1;\n```" }} />,
    );

    expect(screen.getByText("user")).toBeTruthy();
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("inline").tagName).toBe("CODE");
    expect(container.querySelector("pre code")?.textContent).toContain("const x = 1;");
  });

  it("never injects raw HTML from markdown", () => {
    const { container } = render(
      <MessageView message={{ role: "assistant", content: "hello <script>alert(1)</script> world" }} />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("hello");
    expect(container.textContent).toContain("world");
  });

  it("opens links in a new tab and strips unsafe protocols", () => {
    render(
      <MessageView
        message={{
          role: "assistant",
          content: "[ok](https://example.com) [bad](javascript:alert(1))",
        }}
      />,
    );

    const ok = screen.getByText("ok").closest("a");
    expect(ok?.getAttribute("target")).toBe("_blank");
    expect(ok?.getAttribute("rel")).toContain("noreferrer");
    expect(ok?.getAttribute("rel")).toContain("noopener");

    const bad = screen.getByText("bad").closest("a");
    expect(bad?.getAttribute("href") ?? "").not.toContain("javascript:");
  });

  it("renders user images with lazy loading", () => {
    render(
      <MessageView
        message={{
          role: "user",
          content: [
            { type: "text", text: "look" },
            { type: "image", source: { media_type: "image/png", data: "AAAA" } },
          ],
        }}
      />,
    );

    const image = screen.getByAltText("attached image");
    expect(image.getAttribute("src")).toBe("data:image/png;base64,AAAA");
    expect(image.getAttribute("loading")).toBe("lazy");
  });

  it("renders a standalone tool result with its role label", () => {
    render(
      <MessageView
        message={{
          role: "toolResult",
          toolCallId: "t1",
          toolName: "read",
          content: [{ type: "text", text: "boom" }],
          isError: true,
        }}
      />,
    );

    expect(screen.getByText("tool result")).toBeTruthy();
    expect(screen.getByText("read")).toBeTruthy();
    expect(screen.getByText("boom")).toBeTruthy();
  });

  it("renders bash execution command and output", () => {
    render(
      <MessageView
        message={{
          role: "bashExecution",
          content: "",
          command: "ls -la",
          output: "total 0",
          exitCode: 0,
        }}
      />,
    );

    expect(screen.getByText("bash")).toBeTruthy();
    expect(screen.getByText("ls -la")).toBeTruthy();
    expect(screen.getByText("total 0")).toBeTruthy();
    expect(screen.getByText("exit 0")).toBeTruthy();
  });

  it("renders unknown roles as subdued text", () => {
    render(<MessageView message={{ role: "developer", content: "system note" }} />);
    expect(screen.getByText("developer")).toBeTruthy();
    expect(screen.getByText("system note")).toBeTruthy();
  });

  it("marks streaming assistant messages", () => {
    const { container } = render(
      <MessageView message={assistant("partial")} streaming />,
    );
    expect(container.querySelector('[data-role="assistant"]')?.getAttribute("data-streaming")).toBe("true");
    expect(screen.getByText("partial")).toBeTruthy();
  });
});

describe("MessageView tool calls", () => {
  it("pairs a tool call with its result from toolResults", () => {
    const toolResults = new Map<string, ChatMessage>([
      [
        "call-1",
        {
          role: "toolResult",
          toolCallId: "call-1",
          toolName: "read",
          content: [{ type: "text", text: "file body" }],
        },
      ],
    ]);

    const { container } = render(
      <MessageView
        message={assistant([
          { type: "text", text: "Checking" },
          { type: "toolCall", toolCallId: "call-1", toolName: "read", input: { path: "a.ts" } },
        ])}
        toolResults={toolResults}
      />,
    );

    expect(screen.getByText("read")).toBeTruthy();
    expect(screen.getByText("done")).toBeTruthy();
    expect(screen.getByText("file body")).toBeTruthy();
    expect(container.textContent).toContain('"path": "a.ts"');
    expect(container.querySelector('[data-pending="false"]')).not.toBeNull();
  });

  it("shows an awaiting state when no result is paired", () => {
    const { container } = render(
      <MessageView
        message={assistant([
          { type: "toolCall", toolCallId: "call-2", toolName: "grep", input: { pattern: "x" } },
        ])}
      />,
    );

    expect(screen.getByText("awaiting result")).toBeTruthy();
    expect(screen.getByText("No result yet.")).toBeTruthy();
    expect(container.querySelector('[data-pending="true"]')).not.toBeNull();
  });

  it("flags error results", () => {
    const toolResults = new Map<string, ChatMessage>([
      [
        "call-3",
        {
          role: "toolResult",
          toolCallId: "call-3",
          content: [{ type: "text", text: "failed" }],
          isError: true,
        },
      ],
    ]);

    const { container } = render(
      <MessageView
        message={assistant([
          { type: "toolCall", toolCallId: "call-3", toolName: "bash", input: { command: "false" } },
        ])}
        toolResults={toolResults}
      />,
    );

    expect(screen.getByText("error")).toBeTruthy();
    expect(container.querySelectorAll('[data-error="true"]').length).toBeGreaterThan(0);
  });
});

describe("MessageView thinking", () => {
  it("renders non-deferred thinking content", () => {
    render(
      <MessageView
        message={assistant([{ type: "thinking", thinking: "pondering the problem" }])}
      />,
    );
    expect(screen.getByText("pondering the problem")).toBeTruthy();
  });

  it("fetches a deferred thinking block on first open", async () => {
    fetchThinkingMock.mockResolvedValue("deep thought");

    render(
      <MessageView
        message={assistant([{ type: "thinking", thinking: "", deferred: true }])}
        sessionId="session-1"
        entryId="entry-1"
      />,
    );

    expect(fetchThinkingMock).not.toHaveBeenCalled();
    expect(screen.queryByText("deep thought")).toBeNull();

    fireEvent.click(screen.getByText("Thinking"));

    expect(await screen.findByText("deep thought")).toBeTruthy();
    expect(fetchThinkingMock).toHaveBeenCalledTimes(1);
    expect(fetchThinkingMock).toHaveBeenCalledWith("session-1", "entry-1", 0);
  });

  it("shows an error state when deferred thinking fails", async () => {
    fetchThinkingMock.mockRejectedValue(new Error("gone"));

    render(
      <MessageView
        message={assistant([{ type: "thinking", thinking: "", deferred: true }])}
        sessionId="session-1"
        entryId="entry-1"
      />,
    );

    fireEvent.click(screen.getByText("Thinking"));

    expect(await screen.findByText("gone")).toBeTruthy();
  });

  it("shows an empty state for a non-deferred empty block", () => {
    render(<MessageView message={assistant([{ type: "thinking", thinking: "" }])} />);
    expect(screen.getByText("No thinking content.")).toBeTruthy();
  });
});
