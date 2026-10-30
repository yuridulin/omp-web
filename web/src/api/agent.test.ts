import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IntentError,
  createSession,
  dispatchIntent,
  fetchLiveSessionState,
  fetchModels,
} from "./agent";

const apiMock = vi.hoisted(() => ({
  GET: vi.fn(),
  POST: vi.fn(),
}));

vi.mock("./client", () => ({ api: apiMock }));

function ok(data: unknown, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

function fail(error: unknown, status: number) {
  return { data: undefined, error, response: new Response(null, { status }) };
}

beforeEach(() => {
  apiMock.GET.mockReset();
  apiMock.POST.mockReset();
});

describe("createSession", () => {
  it("posts ensure_session with cwd and omits thinkingLevel for auto", async () => {
    apiMock.POST.mockResolvedValueOnce(ok({ success: true, sessionId: "sess-1", data: {} }));

    const sessionId = await createSession({
      cwd: "D:/repo",
      provider: "anthropic",
      modelId: "claude",
      thinkingLevel: "auto",
    });

    expect(sessionId).toBe("sess-1");
    expect(apiMock.POST).toHaveBeenCalledTimes(1);
    expect(apiMock.POST).toHaveBeenCalledWith("/api/agent/sessions/new", {
      body: {
        cwd: "D:/repo",
        type: "ensure_session",
        provider: "anthropic",
        modelId: "claude",
      },
    });
  });

  it("forwards an explicit thinkingLevel and throws the server message", async () => {
    apiMock.POST.mockResolvedValueOnce(fail({ error: "bad cwd", code: "invalid_cwd" }, 400));

    await expect(createSession({ cwd: "/repo", thinkingLevel: "high" })).rejects.toThrow(
      "bad cwd",
    );
    expect(apiMock.POST.mock.calls[0]?.[1]).toEqual({
      body: { cwd: "/repo", type: "ensure_session", thinkingLevel: "high" },
    });
  });
});

describe("dispatchIntent", () => {
  it("bootstraps a saved session and retries once after session_not_managed", async () => {
    apiMock.POST
      .mockResolvedValueOnce(fail({ error: "session not managed", code: "session_not_managed" }, 409))
      .mockResolvedValueOnce(ok({ success: true, data: {} }))
      .mockResolvedValueOnce(ok({ ok: true, data: { queued: true } }));

    const result = await dispatchIntent("sess-1", { kind: "prompt", text: "hello" });

    expect(result).toEqual({ data: { queued: true }, bootstrapped: true });
    expect(apiMock.POST.mock.calls).toEqual([
      [
        "/api/agent/sessions/{id}/intent",
        { params: { path: { id: "sess-1" } }, body: { kind: "prompt", text: "hello" } },
      ],
      [
        "/api/agent/sessions/{id}/command",
        { params: { path: { id: "sess-1" } }, body: { type: "get_state" } },
      ],
      [
        "/api/agent/sessions/{id}/intent",
        { params: { path: { id: "sess-1" } }, body: { kind: "prompt", text: "hello" } },
      ],
    ]);
  });

  it("returns data without bootstrapping on a first-attempt success", async () => {
    apiMock.POST.mockResolvedValueOnce(ok({ ok: true, data: { accepted: 1 } }));

    const result = await dispatchIntent("sess-1", { kind: "abort" });

    expect(result).toEqual({ data: { accepted: 1 }, bootstrapped: false });
    expect(apiMock.POST).toHaveBeenCalledTimes(1);
  });

  it("maps non-bootstrap failures to IntentError with the server message and code", async () => {
    apiMock.POST.mockResolvedValueOnce(fail({ error: "nope", code: "bad_request" }, 400));

    const failure: unknown = await dispatchIntent("sess-1", { kind: "abort" }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(IntentError);
    expect(failure).toMatchObject({ message: "nope", code: "bad_request" });
    expect(apiMock.POST).toHaveBeenCalledTimes(1);
  });
});

describe("fetchLiveSessionState", () => {
  it("parses the live model and thinking level", async () => {
    apiMock.GET.mockResolvedValueOnce(
      ok({
        running: true,
        state: { model: { provider: "anthropic", id: "claude-sonnet" }, thinkingLevel: "high" },
      }),
    );

    await expect(fetchLiveSessionState("sess-1")).resolves.toEqual({
      model: { provider: "anthropic", modelId: "claude-sonnet" },
      thinkingLevel: "high",
    });
    expect(apiMock.GET).toHaveBeenCalledWith("/api/agent/sessions/{id}/state", {
      params: { path: { id: "sess-1" } },
    });
  });

  it("returns nulls for a saved session without live state", async () => {
    apiMock.GET.mockResolvedValueOnce(ok({ running: false }));

    await expect(fetchLiveSessionState("sess-1")).resolves.toEqual({
      model: null,
      thinkingLevel: null,
    });
  });

  it("tolerates malformed state by returning nulls", async () => {
    apiMock.GET.mockResolvedValueOnce(
      ok({ running: true, state: { model: "claude", thinkingLevel: 7 } }),
    );

    await expect(fetchLiveSessionState("sess-1")).resolves.toEqual({
      model: null,
      thinkingLevel: null,
    });
  });
});

describe("fetchModels", () => {
  it("returns the catalog fields and defaults absent thinkingLevels to {}", async () => {
    const modelList = [{ id: "claude", name: "Claude", provider: "anthropic" }];
    apiMock.GET.mockResolvedValueOnce(
      ok({ models: {}, modelList, defaultModel: null, anthropicSlowMode: false }),
    );

    await expect(fetchModels()).resolves.toEqual({
      modelList,
      defaultModel: null,
      thinkingLevels: {},
    });
  });

  it("preserves thinkingLevels when present", async () => {
    const thinkingLevels = { anthropic: ["off", "high"] };
    apiMock.GET.mockResolvedValueOnce(
      ok({
        models: {},
        modelList: [],
        defaultModel: { provider: "anthropic", modelId: "claude" },
        thinkingLevels,
        anthropicSlowMode: false,
      }),
    );

    await expect(fetchModels()).resolves.toEqual({
      modelList: [],
      defaultModel: { provider: "anthropic", modelId: "claude" },
      thinkingLevels,
    });
  });
});
