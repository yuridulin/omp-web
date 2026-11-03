import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/api/agent", () => ({
  fetchThinking: vi.fn(),
}));

import { fetchThinking } from "@/api/agent";
import type { ChatMessage } from "@/api/session-types";
import type { JSX } from "react";
import { MessageView, type MessageViewProps } from "./MessageView";
import { testTranscriptClasses } from "./test-classes";

function TranscriptRow(props: Omit<MessageViewProps, "classes">): JSX.Element {
  return <MessageView classes={testTranscriptClasses} {...props} />;
}

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
      <TranscriptRow message={{ role: "user", content: "**bold** and `inline`\n\n```ts\nconst x = 1;\n```" }} />,
    );

    expect(screen.getByText("user")).toBeTruthy();
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("inline").tagName).toBe("CODE");
    expect(container.querySelector("pre code")?.textContent).toContain("const x = 1;");
  });

  it("never injects raw HTML from markdown", () => {
    const { container } = render(
      <TranscriptRow message={{ role: "assistant", content: "hello <script>alert(1)</script> world" }} />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("hello");
    expect(container.textContent).toContain("world");
  });

  it("opens links in a new tab and strips unsafe protocols", () => {
    render(
      <TranscriptRow
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
      <TranscriptRow
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
      <TranscriptRow
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
      <TranscriptRow
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
    render(<TranscriptRow message={{ role: "developer", content: "system note" }} />);
    expect(screen.getByText("developer")).toBeTruthy();
    expect(screen.getByText("system note")).toBeTruthy();
  });

  it("renders no placeholder for an empty assistant body", () => {
    const { container } = render(<TranscriptRow message={assistant([])} />);
    expect(container.querySelector('[data-role="assistant"]')).not.toBeNull();
    expect(container.textContent).not.toContain("(no content)");
  });

  it("marks streaming assistant messages", () => {
    const { container } = render(
      <TranscriptRow message={assistant("partial")} streaming />,
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
      <TranscriptRow
        message={assistant([
          { type: "text", text: "Checking" },
          { type: "toolCall", toolCallId: "call-1", toolName: "read", input: { path: "a.ts" } },
        ])}
        toolResults={toolResults}
      />,
    );

    expect(screen.getByText("read")).toBeTruthy();
    expect(screen.getByText("a.ts")).toBeTruthy();
    expect(screen.queryByText("done")).toBeNull();
    expect(screen.getByText("file body")).toBeTruthy();
    expect(container.textContent).toContain('"path": "a.ts"');
    expect(container.querySelector('[data-pending="false"]')).not.toBeNull();
  });

  it("opens a tool call while the turn is still streaming", () => {
    const { container } = render(
      <TranscriptRow
        streaming
        message={assistant([
          { type: "toolCall", toolCallId: "call-live", toolName: "bash", input: { command: "ls" } },
        ])}
      />,
    );

    expect(container.querySelector("details")?.hasAttribute("open")).toBe(true);
    expect(screen.getByText("running…")).toBeTruthy();
  });

  it("labels a tool call while its arguments are still streaming", () => {
    render(
      <TranscriptRow
        streaming
        message={assistant([
          {
            type: "toolCall",
            toolCallId: "call-partial",
            toolName: "bash",
            arguments: {},
            partialArgs: '{"command": "sleep 12; echo probe2", "i": "Running the pro',
          },
        ])}
      />,
    );

    expect(screen.getByText("bash")).toBeTruthy();
    expect(screen.getByText("Running the pro")).toBeTruthy();
    expect(screen.getByText("running…")).toBeTruthy();
  });

  it("keeps a settled tool call collapsed", () => {
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
      <TranscriptRow
        message={assistant([
          { type: "toolCall", toolCallId: "call-1", toolName: "read", input: { path: "a.ts" } },
        ])}
        toolResults={toolResults}
      />,
    );

    expect(container.querySelector("details")?.hasAttribute("open")).toBe(false);
    expect(screen.getByText("a.ts")).toBeTruthy();
    expect(screen.queryByText("done")).toBeNull();
  });

  it("keeps a historical tool call collapsed while it is still awaiting a result", () => {
    const { container } = render(
      <TranscriptRow
        message={assistant([
          { type: "toolCall", toolCallId: "call-2", toolName: "grep", input: { pattern: "x" } },
        ])}
      />,
    );

    expect(container.querySelector("details")?.hasAttribute("open")).toBe(false);
    expect(screen.getByText("x")).toBeTruthy();
    expect(screen.queryByText("awaiting result")).toBeNull();
  });

  it("shows an awaiting state when no result is paired", () => {
    const { container } = render(
      <TranscriptRow
        message={assistant([
          { type: "toolCall", toolCallId: "call-2", toolName: "grep", input: { pattern: "x" } },
        ])}
      />,
    );

    expect(screen.getByText("x")).toBeTruthy();
    expect(screen.queryByText("awaiting result")).toBeNull();
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
      <TranscriptRow
        message={assistant([
          { type: "toolCall", toolCallId: "call-3", toolName: "bash", input: { command: "false" } },
        ])}
        toolResults={toolResults}
      />,
    );

    expect(screen.getByText("error")).toBeTruthy();
    expect(container.querySelectorAll('[data-error="true"]').length).toBeGreaterThan(0);
  });

  it("shows the command name instead of the raw command", () => {
    render(
      <TranscriptRow
        message={assistant([
          {
            type: "toolCall",
            toolCallId: "call-name",
            toolName: "bash",
            input: { i: "Checking docker availability", command: "docker --version" },
          },
        ])}
      />,
    );

    expect(screen.getByText("Checking docker availability")).toBeTruthy();
    expect(screen.queryByText("docker --version")).toBeNull();
  });
});

describe("MessageView thinking", () => {
  it("counts thinking seconds while the block is live and keeps them", () => {
    vi.useFakeTimers();
    try {
      const message = {
        role: "assistant",
        timestamp: 50,
        content: [{ type: "thinking", thinking: "still going" }],
      };
      const { rerender } = render(
        <TranscriptRow sessionId="think-clock" streaming message={message} />,
      );

      expect(screen.getByText("0s")).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByText("2s")).toBeTruthy();

      rerender(<TranscriptRow sessionId="think-clock" message={message} />);
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByText("2s")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the saved call duration on a finished thinking block", () => {
    render(
      <TranscriptRow
        message={{
          role: "assistant",
          duration: 1815,
          content: [{ type: "thinking", thinking: "done" }],
        }}
      />,
    );

    expect(screen.getByText("2s")).toBeTruthy();
  });

  it("opens thinking while the turn is streaming", () => {
    const { container } = render(
      <TranscriptRow
        streaming
        message={assistant([{ type: "thinking", thinking: "still going" }])}
      />,
    );

    expect(container.querySelector("details")?.hasAttribute("open")).toBe(true);
    expect(screen.getByText("still going")).toBeTruthy();
  });

  it("keeps saved thinking collapsed", async () => {
    const { container } = render(
      <TranscriptRow message={assistant([{ type: "thinking", thinking: "already done" }])} />,
    );

    expect(container.querySelector("details")?.hasAttribute("open")).toBe(false);
    await waitFor(() => expect(screen.getByText("already done")).toBeTruthy());
    expect(container.querySelector("details")?.hasAttribute("open")).toBe(false);
  });

  it("renders non-deferred thinking content", async () => {
    render(
      <TranscriptRow
        message={assistant([{ type: "thinking", thinking: "pondering the problem" }])}
      />,
    );
    await waitFor(() => expect(screen.getByText("pondering the problem")).toBeTruthy());
  });

  it("fetches a deferred thinking block on first open", async () => {
    fetchThinkingMock.mockResolvedValue("deep thought");

    render(
      <TranscriptRow
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
      <TranscriptRow
        message={assistant([{ type: "thinking", thinking: "", deferred: true }])}
        sessionId="session-1"
        entryId="entry-1"
      />,
    );

    fireEvent.click(screen.getByText("Thinking"));

    expect(await screen.findByText("gone")).toBeTruthy();
  });

  it("renders only the summary for a non-deferred empty block", () => {
    const { container } = render(<TranscriptRow message={assistant([{ type: "thinking", thinking: "" }])} />);
    expect(screen.getByText("Thinking")).toBeTruthy();
    expect(container.querySelector("details")?.textContent).toBe("Thinking");
  });
});
