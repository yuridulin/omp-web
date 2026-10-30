import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  countUnread,
  createNotificationId,
  parseNotificationEvent,
  parseNotificationFrame,
  parseNotificationHistory,
  parseNotificationHistoryEntry,
  parseNotificationPrefs,
  renderNotification,
  urlBase64ToUint8Array,
  type NotificationEvent,
  type NotificationHistoryEntry,
} from "@/api/notifications";
import { NotificationToasts, ToastQueueProvider } from "@/features/notifications/NotificationToasts";

afterEach(cleanup);

const completed: NotificationEvent = {
  type: "completed",
  sessionId: "session-1",
  sessionName: "Fix parser",
};

describe("parseNotificationPrefs", () => {
  it("falls back to the documented defaults for unusable input", () => {
    expect(parseNotificationPrefs(null)).toEqual({
      enabled: false,
      types: { completed: true, input: true, error: true, modelSwitch: false },
      whenActive: "toast",
      locale: "en",
    });
    expect(parseNotificationPrefs("nope").enabled).toBe(false);
  });

  it("keeps valid fields and rejects out-of-range values individually", () => {
    expect(
      parseNotificationPrefs({
        enabled: true,
        types: { completed: false, input: "yes", error: true, modelSwitch: true },
        whenActive: "system",
        locale: "ja",
      }),
    ).toEqual({
      enabled: true,
      types: { completed: false, input: true, error: true, modelSwitch: true },
      whenActive: "system",
      locale: "ja",
    });
    expect(parseNotificationPrefs({ whenActive: "email", locale: "not a locale!" })).toMatchObject({
      whenActive: "toast",
      locale: "en",
    });
  });
});

describe("event and history parsing", () => {
  it("parses optional event fields and aliases", () => {
    expect(
      parseNotificationEvent({
        type: "modelSwitch",
        sessionId: "s1",
        sessionName: null,
        from: "a",
        to: "b",
        aliases: ["old-1"],
      }),
    ).toEqual({
      type: "modelSwitch",
      sessionId: "s1",
      sessionName: null,
      from: "a",
      to: "b",
      aliases: ["old-1"],
    });
    expect(parseNotificationEvent({ type: "bogus", sessionId: "s1" })).toBeNull();
    expect(parseNotificationEvent({ type: "error", sessionId: 4 })).toBeNull();
  });

  it("drops malformed history rows individually", () => {
    const payload = {
      entries: [
        { id: "one", event: completed, at: 10, read: false },
        { id: "two", event: completed, at: Number.NaN, read: false },
        { id: 3, event: completed, at: 10, read: false },
        null,
      ],
    };
    expect(parseNotificationHistory(payload)).toEqual([{ id: "one", event: completed, at: 10, read: false }]);
    expect(parseNotificationHistory({ entries: "no" })).toEqual([]);
    expect(parseNotificationHistoryEntry({ id: "x", event: completed, at: 5, read: true })).toEqual({
      id: "x",
      event: completed,
      at: 5,
      read: true,
    });
  });

  it("parses only well-formed notification frames", () => {
    expect(
      parseNotificationFrame({ type: "notification", kind: "os", event: completed }),
    ).toEqual({ kind: "os", event: completed });
    expect(parseNotificationFrame({ type: "notification", kind: "sms", event: completed })).toBeNull();
    expect(parseNotificationFrame({ type: "running", kind: "toast", event: completed })).toBeNull();
    expect(parseNotificationFrame({ type: "notification", kind: "toast", event: { type: "error" } })).toBeNull();
  });
});

describe("history helpers", () => {
  const entries: NotificationHistoryEntry[] = [
    { id: "a", event: completed, at: 3, read: false },
    { id: "b", event: completed, at: 2, read: true },
    { id: "c", event: completed, at: 1, read: false },
  ];

  it("counts unread entries", () => {
    expect(countUnread(entries)).toBe(2);
    expect(countUnread([])).toBe(0);
  });

  it("generates ids the server accepts and keeps them distinct", () => {
    const first = createNotificationId();
    const second = createNotificationId();
    expect(first).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(second).not.toBe(first);
  });

  it("decodes a base64url VAPID key", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(urlBase64ToUint8Array("-_8"))).toEqual([251, 255]);
  });
});

describe("renderNotification", () => {
  it("renders each type in English", () => {
    expect(renderNotification(completed, "en")).toMatchObject({
      title: "Fix parser",
      body: "Task finished.",
      url: "/?session=session-1",
      tag: "session-1:completed",
      sessionId: "session-1",
    });
    expect(
      renderNotification({ type: "input", sessionId: "s1", sessionName: null, detail: "Which model?" }, "en"),
    ).toMatchObject({ title: "omp session", body: "Waiting for your answer: Which model?" });
    expect(
      renderNotification(
        { type: "modelSwitch", sessionId: "s1", sessionName: "S", from: "a", to: "b" },
        "en",
      ).body,
    ).toBe("Switched a → b.");
  });

  it("uses the requested locale and falls back to English", () => {
    expect(renderNotification(completed, "ja").body).toBe("タスクが完了しました。");
    expect(renderNotification(completed, "zh-CN").body).toBe("任务已完成。");
    expect(renderNotification(completed, "de").body).toBe("Task finished.");
  });

  it("renders the test body and clips long details", () => {
    expect(renderNotification({ type: "test", sessionId: "", sessionName: "omp web" }, "en")).toMatchObject({
      body: "Notifications are working.",
      url: "/",
    });
    const body = renderNotification(
      { type: "error", sessionId: "s1", sessionName: "S", detail: "x".repeat(300) },
      "en",
    ).body;
    expect(body.startsWith("Run failed: ")).toBe(true);
    expect(body.endsWith("…")).toBe(true);
    expect(body.length).toBeLessThan(200);
  });
});

describe("NotificationToasts", () => {
  it("opens the event and dismisses when a toast is clicked", () => {
    const onDismiss = vi.fn();
    const onOpen = vi.fn();
    render(
      <ToastQueueProvider
        toasts={[{ id: "t1", event: completed }]}
        locale="en"
        onDismiss={onDismiss}
        onOpen={onOpen}
      >
        <NotificationToasts />
      </ToastQueueProvider>,
    );
    fireEvent.click(screen.getByText("Task finished."));
    expect(onOpen).toHaveBeenCalledWith(completed);
    expect(onDismiss).toHaveBeenCalledWith("t1");
  });

  it("renders nothing without queued toasts", () => {
    render(
      <ToastQueueProvider toasts={[]} locale="en" onDismiss={vi.fn()} onOpen={vi.fn()}>
        <NotificationToasts />
      </ToastQueueProvider>,
    );
    expect(screen.queryByText("Task finished.")).toBeNull();
  });
});
