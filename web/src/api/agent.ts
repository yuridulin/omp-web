import { api } from "./client";
import { isRecord } from "./guards";
import type { paths } from "./schema";

export type ModelsPayload = NonNullable<
  paths["/api/system/models"]["get"]["responses"][200]["content"]["application/json"]
>;
export type ModelEntry = ModelsPayload["modelList"][number];

export interface ModelCatalog {
  modelList: ModelEntry[];
  defaultModel: { provider: string; modelId: string } | null;
  thinkingLevels: Record<string, string[]>;
}

export interface LiveSessionModel {
  provider: string;
  modelId: string;
}

export interface LiveSessionState {
  model: LiveSessionModel | null;
  thinkingLevel: string | null;
}

export interface NewSessionInput {
  cwd: string;
  provider?: string;
  modelId?: string;
  thinkingLevel?: string;
}

export type ChatIntentBody = NonNullable<
  paths["/api/agent/sessions/{id}/intent"]["post"]["requestBody"]
>["content"]["application/json"];

export interface IntentDispatchResult {
  data: unknown;
  bootstrapped: boolean;
}

export interface CwdListing {
  path: string;
  parentPath: string | null;
  directories: { name: string; path: string }[];
  drives: { name: string; path: string }[];
}

export interface ValidatedCwd {
  cwd: string;
  projectRoot: string;
  projectKey: string;
}

/** Failure dispatch carries the server's message and stable error code. */
export class IntentError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = "IntentError";
    this.code = code;
  }
}

function errorInfo(value: unknown, status: number): { message: string; code: string | null } {
  if (isRecord(value)) {
    return {
      message: typeof value.error === "string" ? value.error : `HTTP ${status}`,
      code: typeof value.code === "string" ? value.code : null,
    };
  }
  return { message: `HTTP ${status}`, code: null };
}

export async function fetchModels(): Promise<ModelCatalog> {
  const { data, error, response } = await api.GET("/api/system/models");
  if (error) throw new Error(errorInfo(error, response.status).message);
  if (!data) throw new Error("Unexpected empty models response");
  return {
    modelList: data.modelList,
    defaultModel: data.defaultModel ?? null,
    thinkingLevels: data.thinkingLevels ?? {},
  };
}

export async function fetchLiveSessionState(sessionId: string): Promise<LiveSessionState> {
  const { data, error, response } = await api.GET("/api/agent/sessions/{id}/state", {
    params: { path: { id: sessionId } },
  });
  if (error) throw new Error(errorInfo(error, response.status).message);

  const state = data && isRecord(data.state) ? data.state : null;
  const rawModel = state && isRecord(state.model) ? state.model : null;
  const provider = rawModel && typeof rawModel.provider === "string" ? rawModel.provider : null;
  const modelId = rawModel && typeof rawModel.id === "string" ? rawModel.id : null;
  const model = provider !== null && modelId !== null ? { provider, modelId } : null;
  const thinkingLevel =
    state && typeof state.thinkingLevel === "string" ? state.thinkingLevel : null;

  return { model, thinkingLevel };
}

export async function createSession(input: NewSessionInput): Promise<string> {
  const { data, error, response } = await api.POST("/api/agent/sessions/new", {
    body: {
      cwd: input.cwd,
      type: "ensure_session",
      ...(input.provider !== undefined ? { provider: input.provider } : {}),
      ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
      ...(input.thinkingLevel !== undefined && input.thinkingLevel !== "auto"
        ? { thinkingLevel: input.thinkingLevel }
        : {}),
    },
  });
  if (error) throw new Error(errorInfo(error, response.status).message);
  if (!data?.sessionId) throw new Error("Unexpected empty session response");
  return data.sessionId;
}

async function postCommand(sessionId: string, type: string): Promise<void> {
  const { error, response } = await api.POST("/api/agent/sessions/{id}/command", {
    params: { path: { id: sessionId } },
    body: { type },
  });
  if (error) throw new Error(errorInfo(error, response.status).message);
}

/** Start a saved session's omp wrapper by asking it for state. */
export async function ensureLiveSession(sessionId: string): Promise<void> {
  await postCommand(sessionId, "get_state");
}

export async function dispatchIntent(
  sessionId: string,
  intent: ChatIntentBody,
): Promise<IntentDispatchResult> {
  const first = await api.POST("/api/agent/sessions/{id}/intent", {
    params: { path: { id: sessionId } },
    body: intent,
  });
  if (!first.error) return { data: first.data?.data, bootstrapped: false };

  const firstFailure = errorInfo(first.error, first.response.status);
  if (firstFailure.code !== "session_not_managed") {
    throw new IntentError(firstFailure.message, firstFailure.code);
  }

  await ensureLiveSession(sessionId);
  const retry = await api.POST("/api/agent/sessions/{id}/intent", {
    params: { path: { id: sessionId } },
    body: intent,
  });
  if (retry.error) {
    const retryFailure = errorInfo(retry.error, retry.response.status);
    throw new IntentError(retryFailure.message, retryFailure.code);
  }
  return { data: retry.data?.data, bootstrapped: true };
}

/** Read one deferred thinking block from a saved assistant message. */
export async function fetchThinking(
  sessionId: string,
  entryId: string,
  blockIndex: number,
): Promise<string> {
  const { data, error, response } = await api.GET(
    "/api/agent/sessions/{id}/entries/{entryId}/thinking",
    {
      params: {
        path: { id: sessionId, entryId },
        query: { blockIndex: String(blockIndex) },
      },
    },
  );
  if (error) throw new Error(errorInfo(error, response.status).message);
  if (!data || typeof data.thinking !== "string") {
    throw new Error("Unexpected empty thinking response");
  }
  return data.thinking;
}

export async function fetchDefaultCwd(): Promise<string> {
  const { data, error, response } = await api.POST("/api/workspace/default-cwd");
  if (error) throw new Error(errorInfo(error, response.status).message);
  if (!data?.cwd) throw new Error("Unexpected empty default cwd response");
  return data.cwd;
}

export async function browseCwd(path?: string): Promise<CwdListing> {
  const { data, error, response } = await api.GET("/api/workspace/cwd/browse", {
    params: { query: path ? { path } : {} },
  });
  if (error) throw new Error(errorInfo(error, response.status).message);
  if (!data) throw new Error("Unexpected empty cwd listing response");
  return {
    path: data.path,
    parentPath: data.parentPath ?? null,
    directories: data.directories ?? [],
    drives: data.drives ?? [],
  };
}

export async function validateCwd(cwd: string): Promise<ValidatedCwd> {
  const { data, error, response } = await api.POST("/api/workspace/cwd/validate", {
    body: { cwd },
  });
  if (error) throw new Error(errorInfo(error, response.status).message);
  if (!data) throw new Error("Unexpected empty cwd validation response");
  return {
    cwd: data.cwd,
    projectRoot: data.projectRoot,
    projectKey: data.projectKey,
  };
}
