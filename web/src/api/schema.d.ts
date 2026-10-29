// Generated from contract/open-api.yaml by scripts/generate-web-types.ts. Do not edit.
export interface paths {
    "/api/agent/agents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List agent definitions from user, project, and bundled scopes */
        get: {
            parameters: {
                query?: {
                    cwd?: string;
                    scope?: "all" | "user" | "project" | "bundled";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            agents: unknown[];
                            diagnostics: unknown[];
                            userPath: string;
                            projectPath: string | null;
                            bundledPath?: string | null;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        /** Overwrite an existing agent definition */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        scope: "user" | "project";
                        cwd?: string;
                        name: string;
                        previousName?: string;
                        agent: {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                            path: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Payload Too Large */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        /** Write an agent definition, or unpack the bundled agents into a scope */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        action?: string;
                        /** @enum {string} */
                        scope: "user" | "project";
                        cwd?: string;
                        name?: string;
                        previousName?: string;
                        agent?: {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Payload Too Large */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        /** Delete an agent definition from a scope */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        scope: "user" | "project";
                        cwd?: string;
                        name: string;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                            path: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Payload Too Large */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/agent/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Open the browser's multiplexed SSE stream for live agent events */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "text/event-stream": unknown;
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        /** Subscribe or unsubscribe a subscription on an open event stream connection */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        connectionId: string;
                        subscribe?: {
                            id: string;
                            channel: {
                                /** @enum {string} */
                                kind: "running" | "notifications" | "session" | "file" | "workspace" | "host-tools";
                                clientId?: string;
                                sessionId?: string;
                                path?: string;
                                root?: string;
                            } & {
                                [key: string]: unknown;
                            };
                        } & {
                            [key: string]: unknown;
                        };
                        unsubscribe?: string;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            ok: true;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Payload Too Large */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/agent/plugins": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List installed omp plugins and their resources for a workspace */
        get: {
            parameters: {
                query?: {
                    cwd?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            packages: ({
                                source: string;
                                /** @enum {string} */
                                scope: "global" | "project";
                                filtered: boolean;
                                disabled: boolean;
                                installedPath?: string;
                                packageName?: string;
                                version?: string;
                                configuredVersion?: string;
                                counts: {
                                    extensions: number;
                                    skills: number;
                                    prompts: number;
                                    themes: number;
                                } & {
                                    [key: string]: unknown;
                                };
                                resources: ({
                                    /** @enum {string} */
                                    kind: "extension" | "skill" | "prompt" | "theme";
                                    name: string;
                                    path: string;
                                    relativePath: string;
                                } & {
                                    [key: string]: unknown;
                                })[];
                                /** @enum {string} */
                                status: "loaded" | "installed" | "missing" | "disabled";
                            } & {
                                [key: string]: unknown;
                            })[];
                            totals: {
                                extensions: number;
                                skills: number;
                                prompts: number;
                                themes: number;
                            } & {
                                [key: string]: unknown;
                            };
                            diagnostics: ({
                                /** @enum {string} */
                                type: "warning" | "error";
                                message: string;
                                source?: string;
                                path?: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        /** Run a plugin action (install, remove, update, disable, enable) and return the refreshed list */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        action?: "install" | "remove" | "update" | "disable" | "enable";
                        source?: string;
                        /** @enum {string} */
                        scope?: "global" | "project";
                        cwd?: string;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            packages: ({
                                source: string;
                                /** @enum {string} */
                                scope: "global" | "project";
                                filtered: boolean;
                                disabled: boolean;
                                installedPath?: string;
                                packageName?: string;
                                version?: string;
                                configuredVersion?: string;
                                counts: {
                                    extensions: number;
                                    skills: number;
                                    prompts: number;
                                    themes: number;
                                } & {
                                    [key: string]: unknown;
                                };
                                resources: ({
                                    /** @enum {string} */
                                    kind: "extension" | "skill" | "prompt" | "theme";
                                    name: string;
                                    path: string;
                                    relativePath: string;
                                } & {
                                    [key: string]: unknown;
                                })[];
                                /** @enum {string} */
                                status: "loaded" | "installed" | "missing" | "disabled";
                            } & {
                                [key: string]: unknown;
                            })[];
                            totals: {
                                extensions: number;
                                skills: number;
                                prompts: number;
                                themes: number;
                            } & {
                                [key: string]: unknown;
                            };
                            diagnostics: ({
                                /** @enum {string} */
                                type: "warning" | "error";
                                message: string;
                                source?: string;
                                path?: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/agent/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List on-disk sessions with their live running child ids */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            sessions: ({
                                path: string;
                                id: string;
                                cwd: string;
                                name?: string;
                                created: string;
                                modified: string;
                                lastMessageAt?: string;
                                messageCount: number;
                                firstMessage: string;
                                parentSessionId?: string;
                                projectRoot?: string;
                                projectKey?: string;
                                worktreeBranch?: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                            runningSessionIds: string[];
                            runningSessions: ({
                                id: string;
                                cwd: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Modified */
                304: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/agent/sessions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read a session's header, projected tree, transcript context, and optional live state */
        get: {
            parameters: {
                query?: {
                    deferMedia?: string;
                    deferThinking?: string;
                    includeState?: string;
                };
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            sessionId: string;
                            filePath: string;
                            info: {
                                path: string;
                                id: string;
                                cwd: string;
                                name?: string;
                                created?: string;
                                modified: string;
                                messageCount: number;
                                firstMessage: string;
                                parentSessionId?: string;
                            } & {
                                [key: string]: unknown;
                            };
                            leafId: string | null;
                            tree: unknown[];
                            context: {
                                messages: unknown[];
                                entryIds: string[];
                                thinkingLevel: string;
                                model: ({
                                    provider: string;
                                    modelId: string;
                                } & {
                                    [key: string]: unknown;
                                }) | null;
                                todoPhases: unknown[];
                            } & {
                                [key: string]: unknown;
                            };
                            agent?: {
                                running: boolean;
                                state?: unknown;
                            } & {
                                [key: string]: unknown;
                            };
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Payload Too Large */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        /** Delete a session file and its artifacts, re-parenting its children */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            ok: true;
                            skippedChildren?: ({
                                id: string;
                                reason: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        /** Rename a session (through the live omp child when it is running) */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        name: string;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            ok: true;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Payload Too Large */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/agent/sessions/{id}/archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Stop the live child and archive a session with its sibling artifacts */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            ok: true;
                            /** @constant */
                            archived: true;
                            archivedPath: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/agent/sessions/{id}/auto-name": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Generate a session title with omp, falling back to the first user message */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            title: string;
                            generated: boolean;
                            usage: unknown | null;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/agent/sessions/{id}/bash-output": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Serve a bash execution's full output (JSON inline, or a text/plain attachment with download=1) */
        get: {
            parameters: {
                query?: {
                    download?: "1";
                    path?: string;
                };
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                            data: {
                                output: string;
                            } & {
                                [key: string]: unknown;
                            };
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Payload Too Large */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                            data: {
                                size: number;
                                maxBytes: number;
                            } & {
                                [key: string]: unknown;
                            };
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/agent/sessions/{id}/command": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Send an omp RPC command to a session, spawning its child when needed */
        post: {
            parameters: {
                query?: {
                    advisor?: "1";
                };
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        type: string;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                            data: unknown;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Payload Too Large */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/agent/sessions/{id}/context": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read a session transcript context (full, boundary ids, or an incremental sync page) */
        get: {
            parameters: {
                query?: {
                    boundary?: "1";
                    cursor?: string;
                    deferMedia?: string;
                    deferThinking?: string;
                    includePreCompaction?: string;
                    leafId?: string;
                    limit?: string;
                    sync?: "1";
                };
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            context?: {
                                messages: unknown[];
                                entryIds: string[];
                                thinkingLevel: string;
                                model: ({
                                    provider: string;
                                    modelId: string;
                                } & {
                                    [key: string]: unknown;
                                }) | null;
                                todoPhases: unknown[];
                            } & {
                                [key: string]: unknown;
                            };
                            entryIds?: string[];
                            sessionId?: string;
                            leafId?: string | null;
                            snapshot?: unknown | null;
                            /** @enum {string} */
                            mode?: "append" | "replace";
                            baseEntryId?: string | null;
                            cursor?: unknown;
                            hasMore?: boolean;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Payload Too Large */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/agent/sessions/{id}/entries/{entryId}/thinking": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read one deferred thinking block from an assistant message */
        get: {
            parameters: {
                query: {
                    blockIndex: string;
                };
                header?: never;
                path: {
                    id: string;
                    entryId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            thinking: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/agent/sessions/{id}/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Download or inline a self-contained HTML rendering of a session */
        get: {
            parameters: {
                query?: {
                    inline?: "1";
                };
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "text/html; charset=utf-8": unknown;
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/agent/sessions/{id}/intent": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Dispatch a chat intent through the session's core state machine */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @constant */
                        kind: "prompt";
                        text: string;
                        images?: unknown[];
                    } | {
                        /** @constant */
                        kind: "steer";
                        text: string;
                    } | {
                        /** @constant */
                        kind: "follow-up";
                        text: string;
                    } | {
                        /** @constant */
                        kind: "abort";
                    } | {
                        /** @constant */
                        kind: "abort-compaction";
                    } | {
                        /** @constant */
                        kind: "compact";
                        instructions?: string;
                    } | {
                        /** @constant */
                        kind: "queue-remove";
                        /** @enum {string} */
                        queue: "steering" | "followUp";
                        text: string;
                    } | {
                        /** @constant */
                        kind: "queue-promote";
                        text: string;
                    } | {
                        /** @constant */
                        kind: "edit-entry";
                        entryId: string;
                        text: string;
                    } | {
                        /** @constant */
                        kind: "fork-entry";
                        entryId: string;
                        withEdits: boolean;
                    } | {
                        /** @constant */
                        kind: "navigate-leaf";
                        leafId: string | null;
                    } | {
                        /** @constant */
                        kind: "toggle-pre-compaction";
                    } | {
                        /** @constant */
                        kind: "select-model";
                        provider: string;
                        modelId: string;
                    } | {
                        /** @constant */
                        kind: "set-thinking";
                        /** @enum {string} */
                        level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "auto";
                    } | {
                        /** @constant */
                        kind: "set-fast-mode";
                        enabled: boolean;
                    } | {
                        /** @constant */
                        kind: "set-slow-mode";
                        enabled: boolean;
                    } | {
                        /** @constant */
                        kind: "set-auto-compaction";
                        enabled: boolean;
                    } | {
                        /** @constant */
                        kind: "set-interrupt-mode";
                        /** @enum {string} */
                        mode: "immediate" | "wait";
                    } | {
                        /** @constant */
                        kind: "set-streaming-mode";
                        /** @enum {string} */
                        mode: "steer" | "followUp";
                    } | {
                        /** @constant */
                        kind: "set-session-name";
                        name: string;
                    } | {
                        /** @constant */
                        kind: "extension-response";
                        requestId: string;
                        response: {
                            [key: string]: unknown;
                        };
                    } | {
                        /** @constant */
                        kind: "draft-edit";
                        patch: {
                            text?: string;
                            images?: {
                                data: string;
                                mimeType: string;
                            }[];
                            files?: {
                                name: string;
                                mimeType: string;
                                content: string;
                                size: number;
                            }[];
                        };
                    } | {
                        /** @constant */
                        kind: "draft-clear";
                    } | {
                        /** @constant */
                        kind: "refresh-state";
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            ok: true;
                            data?: unknown;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/agent/sessions/{id}/state": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read a session's live omp state and the server authority's core snapshot */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            running: boolean;
                            state?: unknown;
                            snapshot?: unknown;
                            exited?: {
                                id: string;
                                cwd: string;
                                at: number;
                                code: number | null;
                                signal: string | null;
                                detail: string;
                            } & {
                                [key: string]: unknown;
                            };
                            /** @constant */
                            recovered?: true;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/agent/sessions/{id}/subagents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List the on-disk subagent roster recovered from a session's task results */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            subagents: unknown[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/agent/sessions/{id}/subagents/{subagentId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read a page of a subagent's transcript, or its final completion artifact (mode=completion) */
        get: {
            parameters: {
                query?: {
                    fromByte?: string;
                    mode?: "completion";
                };
                header?: never;
                path: {
                    id: string;
                    subagentId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            sessionFile: string;
                            fromByte?: number;
                            nextByte?: number;
                            reset?: boolean;
                            messages?: unknown[];
                            completion?: string | null;
                            truncated?: boolean;
                            error?: string;
                            totalBytes?: number;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/agent/sessions/archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List archived (gzip) sessions from omp's archive tree */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            archives: ({
                                key: string;
                                id: string;
                                cwd: string;
                                name?: string;
                                created: string;
                                archivedAt: string;
                                messageCount: number;
                                firstMessage: string;
                                size: number;
                                /** @enum {string} */
                                status?: "complete" | "interrupted" | "aborted" | "error" | "pending" | "unknown";
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        /** Restore an archived session back into the active session list */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        key: string;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            ok: true;
                            sessionId: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/agent/sessions/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Import a native omp session .jsonl file into the session tree */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        fileName: string;
                        content: string;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                            sessionFile: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Payload Too Large */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/agent/sessions/new": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Spawn a new omp session (and optionally send its first command) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        cwd: string;
                        type: string;
                        message?: string;
                        provider?: string;
                        modelId?: string;
                        toolNames?: string[];
                        thinkingLevel?: string;
                        advisor?: boolean;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                            sessionId: string;
                            data: unknown;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Payload Too Large */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/agent/sessions/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Stream session-content search scores as NDJSON batches */
        get: {
            parameters: {
                query?: {
                    q?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/x-ndjson": unknown;
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/auth/accounts/{provider}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List the credentials omp stores for one provider */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    provider: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            supported: boolean;
                            accounts: ({
                                credentialId: number;
                                label: string;
                                detail: string;
                                /** @enum {string} */
                                type: "api_key" | "oauth";
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        /** Remove one stored credential for a provider; omp falls back to the next account */
        delete: {
            parameters: {
                query: {
                    credentialId: string;
                };
                header?: never;
                path: {
                    provider: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            ok: true;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Response */
                501: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/auth/all-providers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List providers that currently resolve models (configured providers only) */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            providers: ({
                                id: string;
                                displayName: string;
                                configured: boolean;
                                modelCount: number;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            providers: unknown[];
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/auth/api-key/{provider}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Report whether a provider is configured (never returns the key itself) */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    provider: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            provider: string;
                            displayName: string;
                            configured: boolean;
                            models: number;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        /** Not supported: API keys cannot be stored from omp-web */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    provider: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Response */
                501: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        /** Not supported: API keys cannot be removed from omp-web */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    provider: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Response */
                501: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/auth/login/{provider}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Stream the interactive omp login flow as server-sent events (auth, prompt_request, progress, success, error, cancelled) */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    provider: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "text/event-stream": unknown;
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        /** Submit the pasted authorization code or redirect URL for a pending login token */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    provider: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        token: string;
                        code: string;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            ok: true;
                            provider: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/auth/providers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List login-capable providers from omp's /login list with their auth state */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            providers: ({
                                id: string;
                                name: string;
                                usesCallbackServer: boolean;
                                loggedIn: boolean;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            providers: unknown[];
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/home": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Return the server user's home directory */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            home: string;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/mcp": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List project-level, user-level, and live MCP server configuration */
        get: {
            parameters: {
                query?: {
                    advisor?: string;
                    cwd?: string;
                    live?: string;
                    sessionId?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            root: string | null;
                            path: string | null;
                            exists: boolean;
                            servers: ({
                                name: string;
                                config: {
                                    [key: string]: unknown;
                                };
                            } & {
                                [key: string]: unknown;
                            })[];
                            user: {
                                path: string;
                                disabledServers: string[];
                                error?: string;
                                servers: ({
                                    name: string;
                                    /** @enum {string} */
                                    status: "configured" | "disabled";
                                    type: string;
                                    enabled: boolean;
                                    valid: boolean;
                                } & {
                                    [key: string]: unknown;
                                })[];
                            } & {
                                [key: string]: unknown;
                            };
                            inventory: ({
                                name: string;
                                source: string;
                                /** @enum {string} */
                                status: "connected" | "connecting" | "not_connected" | "inactive" | "disabled" | "configured";
                                type?: string;
                                sourcePath?: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                            liveServers?: ({
                                name: string;
                                source: string;
                                /** @enum {string} */
                                status: "connected" | "connecting" | "not_connected" | "inactive" | "disabled" | "configured";
                                type?: string;
                                sourcePath?: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                            liveError?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        /** Validate an MCP server configuration without writing it */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        name: string;
                        server: {
                            /** @enum {string} */
                            type?: "stdio" | "http" | "sse";
                            command?: string;
                            url?: string;
                            args?: string[];
                            env?: {
                                [key: string]: string;
                            };
                            headers?: {
                                [key: string]: string;
                            };
                            cwd?: string;
                            enabled?: boolean;
                            timeout?: number;
                            /** @enum {string} */
                            requestIdFormat?: "number" | "string";
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                            message: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Payload Too Large */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        /** Create or update an MCP server in the project config */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        cwd: string;
                        name: string;
                        server: {
                            /** @enum {string} */
                            type?: "stdio" | "http" | "sse";
                            command?: string;
                            url?: string;
                            args?: string[];
                            env?: {
                                [key: string]: string;
                            };
                            headers?: {
                                [key: string]: string;
                            };
                            cwd?: string;
                            enabled?: boolean;
                            timeout?: number;
                            /** @enum {string} */
                            requestIdFormat?: "number" | "string";
                        } & {
                            [key: string]: unknown;
                        };
                        previousName?: string;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                            path: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Payload Too Large */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        /** Delete an MCP server from the project config */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        cwd: string;
                        name: string;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                            path: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Payload Too Large */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        /** Enable, disable, or reload an MCP server inside a live session */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        sessionId: string;
                        /** @enum {string} */
                        action: "enable" | "disable" | "reload";
                        name?: string;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/system/model-roles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read the configured model roles */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            path: string;
                            roles: {
                                [key: string]: string;
                            };
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        /** Replace the model roles map */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        roles: {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                            roles: {
                                [key: string]: string;
                            };
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/models": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List the omp model registry, default model, and connected providers */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            models: {
                                [key: string]: string;
                            };
                            modelList: ({
                                id: string;
                                name: string;
                                provider: string;
                                thinkingLevels?: string[];
                                supportsFastMode?: boolean;
                                supportsSlowMode?: boolean;
                                contextWindow?: number;
                                maxTokens?: number;
                            } & {
                                [key: string]: unknown;
                            })[];
                            defaultModel: ({
                                provider: string;
                                modelId: string;
                            } & {
                                [key: string]: unknown;
                            }) | null;
                            thinkingLevels: {
                                [key: string]: string[];
                            };
                            connectedProviders?: ({
                                id: string;
                                name: string;
                                disabled: boolean;
                            } & {
                                [key: string]: unknown;
                            })[];
                            modelError?: string;
                            anthropicSlowMode: boolean;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/models-config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read models.yml, or its parse error when the file is unparseable */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            providers?: {
                                [key: string]: {
                                    baseUrl?: string;
                                    apiKey?: string;
                                    api?: string;
                                    /** @enum {string} */
                                    auth?: "apiKey" | "none" | "oauth";
                                    headers?: {
                                        [key: string]: string;
                                    };
                                    compat?: {
                                        [key: string]: unknown;
                                    };
                                    models?: ({
                                        id: string;
                                        name?: string;
                                        api?: string;
                                        baseUrl?: string;
                                        reasoning?: boolean;
                                        thinking?: {
                                            mode?: string;
                                            efforts?: string[];
                                            defaultLevel?: string;
                                            effortMap?: {
                                                [key: string]: string;
                                            };
                                        } & {
                                            [key: string]: unknown;
                                        };
                                        input?: string[];
                                        contextWindow?: number;
                                        maxTokens?: number;
                                        headers?: {
                                            [key: string]: string;
                                        };
                                        cost?: {
                                            input?: number;
                                            output?: number;
                                            cacheRead?: number;
                                            cacheWrite?: number;
                                        } & {
                                            [key: string]: unknown;
                                        };
                                        compat?: {
                                            [key: string]: unknown;
                                        };
                                    } & {
                                        [key: string]: unknown;
                                    })[];
                                    modelOverrides?: {
                                        [key: string]: unknown;
                                    };
                                } & {
                                    [key: string]: unknown;
                                };
                            };
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        /** Replace models.yml (refuses to overwrite an unparseable file unless overwrite=true) */
        put: {
            parameters: {
                query?: {
                    overwrite?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        providers?: {
                            [key: string]: {
                                baseUrl?: string;
                                apiKey?: string;
                                api?: string;
                                /** @enum {string} */
                                auth?: "apiKey" | "none" | "oauth";
                                headers?: {
                                    [key: string]: string;
                                };
                                compat?: {
                                    [key: string]: unknown;
                                };
                                models?: ({
                                    id: string;
                                    name?: string;
                                    api?: string;
                                    baseUrl?: string;
                                    reasoning?: boolean;
                                    thinking?: {
                                        mode?: string;
                                        efforts?: string[];
                                        defaultLevel?: string;
                                        effortMap?: {
                                            [key: string]: string;
                                        };
                                    } & {
                                        [key: string]: unknown;
                                    };
                                    input?: string[];
                                    contextWindow?: number;
                                    maxTokens?: number;
                                    headers?: {
                                        [key: string]: string;
                                    };
                                    cost?: {
                                        input?: number;
                                        output?: number;
                                        cacheRead?: number;
                                        cacheWrite?: number;
                                    } & {
                                        [key: string]: unknown;
                                    };
                                    compat?: {
                                        [key: string]: unknown;
                                    };
                                } & {
                                    [key: string]: unknown;
                                })[];
                                modelOverrides?: {
                                    [key: string]: unknown;
                                };
                            } & {
                                [key: string]: unknown;
                            };
                        };
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/models-config/catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Search the models.dev catalog and recommend an add-model preset */
        get: {
            parameters: {
                query?: {
                    baseUrl?: string;
                    limit?: string;
                    provider?: string;
                    q?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            models: ({
                                key: string;
                                providerId: string;
                                providerName: string;
                                providerBaseUrl?: string;
                                id: string;
                                name: string;
                                reasoning?: boolean;
                                input?: string[];
                                contextWindow?: number;
                                maxTokens?: number;
                                cost: {
                                    input?: number;
                                    output?: number;
                                    cacheRead?: number;
                                    cacheWrite?: number;
                                } & {
                                    [key: string]: unknown;
                                };
                            } & {
                                [key: string]: unknown;
                            })[];
                            recommendation: {
                                exactMatches: number;
                                /** @enum {string} */
                                metadataMethod: "provider" | "base-url" | "consensus" | "none";
                                matchedProviderId?: string;
                                matchedProviderName?: string;
                                preset: {
                                    name?: string;
                                    reasoning?: boolean;
                                    input?: string[];
                                    contextWindow?: number;
                                    maxTokens?: number;
                                    cost?: {
                                        input?: number;
                                        output?: number;
                                        cacheRead?: number;
                                        cacheWrite?: number;
                                    } & {
                                        [key: string]: unknown;
                                    };
                                } & {
                                    [key: string]: unknown;
                                };
                                price: {
                                    /** @enum {string} */
                                    status: "reliable" | "unreliable";
                                    reason?: string;
                                    method?: string;
                                    cost?: {
                                        input?: number;
                                        output?: number;
                                        cacheRead?: number;
                                        cacheWrite?: number;
                                    } & {
                                        [key: string]: unknown;
                                    };
                                    providerId?: string;
                                    providerName?: string;
                                    support?: number;
                                    total?: number;
                                } & {
                                    [key: string]: unknown;
                                };
                            } & {
                                [key: string]: unknown;
                            };
                            source: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Gateway */
                502: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/models-config/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Check that a candidate provider/model resolves in an isolated omp registry */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        providerName: string;
                        provider: {
                            [key: string]: unknown;
                        };
                        model: {
                            id: string;
                        } & {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            ok: boolean;
                            latencyMs?: number;
                            responseText?: string;
                            error?: string;
                            code?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            ok?: false;
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            ok: false;
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/notifications/devices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Return the VAPID public key and whether this device has a push subscription */
        get: {
            parameters: {
                query?: {
                    deviceId?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            publicKey: string;
                            subscribed: boolean;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        /** Store this device's notification prefs and optional push subscription (an omitted subscription keeps the stored one) */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        deviceId: string;
                        prefs?: unknown;
                        subscription?: unknown;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            subscribed: boolean;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/notifications/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List every persisted notification, newest first */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            entries: ({
                                id: string;
                                event: {
                                    /** @enum {string} */
                                    type: "completed" | "input" | "error" | "modelSwitch" | "test";
                                    sessionId: string;
                                    sessionName: string | null;
                                    detail?: string;
                                    from?: string;
                                    to?: string;
                                    aliases?: string[];
                                } & {
                                    [key: string]: unknown;
                                };
                                at: number;
                                read: boolean;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        /** Remove one history entry by id, or clear the whole history with all=1 */
        delete: {
            parameters: {
                query?: {
                    all?: string;
                    id?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            ok: true;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        /** Mark notification history entries as read (at most 100 ids) */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        ids: string[];
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            ok: true;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Payload Too Large */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/system/notifications/presence": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Report which session this tab shows so other tabs can suppress duplicate notifications */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        clientId: string;
                        deviceId: string;
                        visible: boolean;
                        sessionId?: string | null;
                        seq: number;
                    };
                };
            };
            responses: {
                /** @description No Content */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/notifications/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Send one test push notification to a device */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        deviceId: string;
                    };
                };
            };
            responses: {
                /** @description No Content */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Gateway */
                502: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/provider-usage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Return omp's provider quota usage windows */
        get: {
            parameters: {
                query?: {
                    model?: string;
                    provider?: string;
                    refresh?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            generatedAt: number | null;
                            reports: ({
                                provider: string;
                                accountLabel?: string;
                                accountIndex?: number;
                                plan?: string;
                                modelId?: string;
                                tier?: string;
                                bucket?: string;
                                noLimits?: boolean;
                                fiveHour?: {
                                    percent: number;
                                    resetMinutes?: number;
                                    resetHours?: number;
                                } & {
                                    [key: string]: unknown;
                                };
                                sevenDay?: {
                                    percent: number;
                                    resetMinutes?: number;
                                    resetHours?: number;
                                } & {
                                    [key: string]: unknown;
                                };
                                monthly?: {
                                    percent: number;
                                    resetMinutes?: number;
                                    resetHours?: number;
                                } & {
                                    [key: string]: unknown;
                                };
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Gateway */
                502: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/providers/enable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Re-enable a disabled provider */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        provider: string;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read omp's native settings file */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            path: string;
                            settings: {
                                /** @enum {string} */
                                defaultThinkingLevel?: "auto" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
                                providers?: {
                                    /** @enum {string} */
                                    autoThinkingSource?: "classifier" | "vendor";
                                } & {
                                    [key: string]: unknown;
                                };
                                hideThinkingBlock?: boolean;
                                externalThinking?: boolean;
                                /** @enum {string} */
                                textVerbosity?: "low" | "medium" | "high";
                                /** @enum {string} */
                                personality?: "default" | "friendly" | "pragmatic" | "none";
                                advisor?: {
                                    enabled?: boolean;
                                    subagents?: boolean;
                                    /** @enum {string} */
                                    syncBacklog?: "1" | "3" | "5" | "off";
                                    immuneTurns?: number;
                                } & {
                                    [key: string]: unknown;
                                };
                                tools?: {
                                    /** @enum {string} */
                                    approvalMode?: "always-ask" | "write" | "yolo";
                                    approval?: {
                                        /** @enum {string} */
                                        bash?: "allow" | "prompt" | "deny";
                                        /** @enum {string} */
                                        extension?: "allow" | "prompt";
                                    } & {
                                        [key: string]: unknown;
                                    };
                                } & {
                                    [key: string]: unknown;
                                };
                                skills?: {
                                    showStartupDiagnostics?: boolean;
                                } & {
                                    [key: string]: unknown;
                                };
                                enabledModels?: string[];
                                disabledProviders?: string[];
                                modelProviderOrder?: string[];
                                registryHasScopedEntries?: boolean;
                                retry?: {
                                    enabled?: boolean;
                                    maxRetries?: number;
                                    modelFallback?: boolean;
                                    /** @enum {string} */
                                    fallbackRevertPolicy?: "cooldown-expiry" | "never";
                                    fallbackChains?: {
                                        [key: string]: string[];
                                    };
                                } & {
                                    [key: string]: unknown;
                                };
                                compaction?: {
                                    enabled?: boolean;
                                    midTurnEnabled?: boolean;
                                    methodOrder?: string[];
                                    autoContinue?: boolean;
                                    keepRecentTokens?: number;
                                } & {
                                    [key: string]: unknown;
                                };
                                memory?: {
                                    /** @enum {string} */
                                    backend?: "off" | "local" | "mnemopi" | "hindsight";
                                } & {
                                    [key: string]: unknown;
                                };
                                autolearn?: {
                                    enabled?: boolean;
                                    autoContinue?: boolean;
                                    minToolCalls?: number;
                                } & {
                                    [key: string]: unknown;
                                };
                                mnemopi?: {
                                    /** @enum {string} */
                                    scoping?: "global" | "per-project" | "per-project-tagged";
                                    autoRecall?: boolean;
                                    autoRetain?: boolean;
                                    noEmbeddings?: boolean;
                                } & {
                                    [key: string]: unknown;
                                };
                                mcp?: {
                                    enableProjectConfig?: boolean;
                                    renderMarkdownResults?: boolean;
                                    notifications?: boolean;
                                    notificationDebounceMs?: number;
                                } & {
                                    [key: string]: unknown;
                                };
                            } & {
                                [key: string]: unknown;
                            };
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        /** Replace omp's native settings (rejects ambiguous enabledModels entries) */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        settings: {
                            /** @enum {string} */
                            defaultThinkingLevel?: "auto" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
                            providers?: {
                                /** @enum {string} */
                                autoThinkingSource?: "classifier" | "vendor";
                            } & {
                                [key: string]: unknown;
                            };
                            hideThinkingBlock?: boolean;
                            externalThinking?: boolean;
                            /** @enum {string} */
                            textVerbosity?: "low" | "medium" | "high";
                            /** @enum {string} */
                            personality?: "default" | "friendly" | "pragmatic" | "none";
                            advisor?: {
                                enabled?: boolean;
                                subagents?: boolean;
                                /** @enum {string} */
                                syncBacklog?: "1" | "3" | "5" | "off";
                                immuneTurns?: number;
                            } & {
                                [key: string]: unknown;
                            };
                            tools?: {
                                /** @enum {string} */
                                approvalMode?: "always-ask" | "write" | "yolo";
                                approval?: {
                                    /** @enum {string} */
                                    bash?: "allow" | "prompt" | "deny";
                                    /** @enum {string} */
                                    extension?: "allow" | "prompt";
                                } & {
                                    [key: string]: unknown;
                                };
                            } & {
                                [key: string]: unknown;
                            };
                            skills?: {
                                showStartupDiagnostics?: boolean;
                            } & {
                                [key: string]: unknown;
                            };
                            enabledModels?: string[];
                            disabledProviders?: string[];
                            modelProviderOrder?: string[];
                            registryHasScopedEntries?: boolean;
                            retry?: {
                                enabled?: boolean;
                                maxRetries?: number;
                                modelFallback?: boolean;
                                /** @enum {string} */
                                fallbackRevertPolicy?: "cooldown-expiry" | "never";
                                fallbackChains?: {
                                    [key: string]: string[];
                                };
                            } & {
                                [key: string]: unknown;
                            };
                            compaction?: {
                                enabled?: boolean;
                                midTurnEnabled?: boolean;
                                methodOrder?: string[];
                                autoContinue?: boolean;
                                keepRecentTokens?: number;
                            } & {
                                [key: string]: unknown;
                            };
                            memory?: {
                                /** @enum {string} */
                                backend?: "off" | "local" | "mnemopi" | "hindsight";
                            } & {
                                [key: string]: unknown;
                            };
                            autolearn?: {
                                enabled?: boolean;
                                autoContinue?: boolean;
                                minToolCalls?: number;
                            } & {
                                [key: string]: unknown;
                            };
                            mnemopi?: {
                                /** @enum {string} */
                                scoping?: "global" | "per-project" | "per-project-tagged";
                                autoRecall?: boolean;
                                autoRetain?: boolean;
                                noEmbeddings?: boolean;
                            } & {
                                [key: string]: unknown;
                            };
                            mcp?: {
                                enableProjectConfig?: boolean;
                                renderMarkdownResults?: boolean;
                                notifications?: boolean;
                                notificationDebounceMs?: number;
                            } & {
                                [key: string]: unknown;
                            };
                        } & {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                            settings: {
                                /** @enum {string} */
                                defaultThinkingLevel?: "auto" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
                                providers?: {
                                    /** @enum {string} */
                                    autoThinkingSource?: "classifier" | "vendor";
                                } & {
                                    [key: string]: unknown;
                                };
                                hideThinkingBlock?: boolean;
                                externalThinking?: boolean;
                                /** @enum {string} */
                                textVerbosity?: "low" | "medium" | "high";
                                /** @enum {string} */
                                personality?: "default" | "friendly" | "pragmatic" | "none";
                                advisor?: {
                                    enabled?: boolean;
                                    subagents?: boolean;
                                    /** @enum {string} */
                                    syncBacklog?: "1" | "3" | "5" | "off";
                                    immuneTurns?: number;
                                } & {
                                    [key: string]: unknown;
                                };
                                tools?: {
                                    /** @enum {string} */
                                    approvalMode?: "always-ask" | "write" | "yolo";
                                    approval?: {
                                        /** @enum {string} */
                                        bash?: "allow" | "prompt" | "deny";
                                        /** @enum {string} */
                                        extension?: "allow" | "prompt";
                                    } & {
                                        [key: string]: unknown;
                                    };
                                } & {
                                    [key: string]: unknown;
                                };
                                skills?: {
                                    showStartupDiagnostics?: boolean;
                                } & {
                                    [key: string]: unknown;
                                };
                                enabledModels?: string[];
                                disabledProviders?: string[];
                                modelProviderOrder?: string[];
                                registryHasScopedEntries?: boolean;
                                retry?: {
                                    enabled?: boolean;
                                    maxRetries?: number;
                                    modelFallback?: boolean;
                                    /** @enum {string} */
                                    fallbackRevertPolicy?: "cooldown-expiry" | "never";
                                    fallbackChains?: {
                                        [key: string]: string[];
                                    };
                                } & {
                                    [key: string]: unknown;
                                };
                                compaction?: {
                                    enabled?: boolean;
                                    midTurnEnabled?: boolean;
                                    methodOrder?: string[];
                                    autoContinue?: boolean;
                                    keepRecentTokens?: number;
                                } & {
                                    [key: string]: unknown;
                                };
                                memory?: {
                                    /** @enum {string} */
                                    backend?: "off" | "local" | "mnemopi" | "hindsight";
                                } & {
                                    [key: string]: unknown;
                                };
                                autolearn?: {
                                    enabled?: boolean;
                                    autoContinue?: boolean;
                                    minToolCalls?: number;
                                } & {
                                    [key: string]: unknown;
                                };
                                mnemopi?: {
                                    /** @enum {string} */
                                    scoping?: "global" | "per-project" | "per-project-tagged";
                                    autoRecall?: boolean;
                                    autoRetain?: boolean;
                                    noEmbeddings?: boolean;
                                } & {
                                    [key: string]: unknown;
                                };
                                mcp?: {
                                    enableProjectConfig?: boolean;
                                    renderMarkdownResults?: boolean;
                                    notifications?: boolean;
                                    notificationDebounceMs?: number;
                                } & {
                                    [key: string]: unknown;
                                };
                            } & {
                                [key: string]: unknown;
                            };
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/skills": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List the skills omp resolves for a workspace, with install and togglability info */
        get: {
            parameters: {
                query: {
                    cwd: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            skills: ({
                                name: string;
                                description: string;
                                filePath: string;
                                baseDir: string;
                                disableModelInvocation: boolean;
                                sourceInfo: {
                                    source?: string;
                                    scope?: string;
                                } & {
                                    [key: string]: unknown;
                                };
                                install?: {
                                    package: string;
                                    /** @enum {string} */
                                    scope: "global" | "project";
                                    source: string;
                                    sourceType?: string;
                                    skillsShUrl?: string;
                                    skillPath?: string;
                                    ref?: string;
                                    versionHash?: string;
                                    canCheckForUpdates: boolean;
                                } & {
                                    [key: string]: unknown;
                                };
                                togglable?: boolean;
                            } & {
                                [key: string]: unknown;
                            })[];
                            diagnostics: ({
                                /** @enum {string} */
                                type: "error" | "warning" | "info";
                                message: string;
                                path?: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Toggle disable-model-invocation on a SKILL.md file */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        filePath: string;
                        disableModelInvocation: boolean;
                        cwd?: string;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                            disableModelInvocation: boolean;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/system/skills/check": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Check installed skills for available updates, optionally for one package and scope */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        cwd: string;
                        package?: string;
                        /** @enum {string} */
                        scope?: "global" | "project";
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            updates: ({
                                package: string;
                                /** @enum {string} */
                                scope: "global" | "project";
                                /** @enum {string} */
                                state: "up-to-date" | "update-available" | "unsupported" | "error";
                                currentVersion?: string;
                                latestVersion?: string;
                                message?: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/skills/install": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Install a skills.sh package globally or into a project's .agents/skills directory */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        package: string;
                        scope?: string;
                        cwd?: string;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                            output: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/skills/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Search skills.sh for installable skill packages (limit clamped to 1-50) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        query: string;
                        limit?: number | string;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            results: ({
                                package: string;
                                installs: string;
                                url: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/skills/update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Update one installed skill package and return its refreshed listing */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        cwd: string;
                        package: string;
                        /** @enum {string} */
                        scope: "global" | "project";
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                            skill?: {
                                name: string;
                                description: string;
                                filePath: string;
                                baseDir: string;
                                disableModelInvocation: boolean;
                                sourceInfo: {
                                    source?: string;
                                    scope?: string;
                                } & {
                                    [key: string]: unknown;
                                };
                                install?: {
                                    package: string;
                                    /** @enum {string} */
                                    scope: "global" | "project";
                                    source: string;
                                    sourceType?: string;
                                    skillsShUrl?: string;
                                    skillPath?: string;
                                    ref?: string;
                                    versionHash?: string;
                                    canCheckForUpdates: boolean;
                                } & {
                                    [key: string]: unknown;
                                };
                                togglable?: boolean;
                            } & {
                                [key: string]: unknown;
                            };
                            output: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/stt": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List live transcription jobs for one composer scope, newest first */
        get: {
            parameters: {
                query: {
                    scope: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            jobs: ({
                                id: string;
                                /** @enum {string} */
                                status: "pending" | "done" | "error" | "gone";
                                error?: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        /** Upload audio (multipart: file, optional scope/owner/after) and start a server-side transcription job */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "multipart/form-data": unknown;
                };
            };
            responses: {
                /** @description Response */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            jobId: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Payload Too Large */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Response */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Response */
                501: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/stt/{jobId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Poll a transcription job (status only; the transcript is returned by claiming it) */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    jobId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            /** @enum {string} */
                            status: "pending" | "done" | "error" | "gone";
                            error?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        /** Retry a failed transcription job with the audio the server kept */
        post: {
            parameters: {
                query?: {
                    owner?: string;
                };
                header?: never;
                path: {
                    jobId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            /** @enum {string} */
                            status: "pending" | "done" | "error" | "gone";
                            error?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Response */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Response */
                501: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        /** Claim a finished transcript (claim token), or discard the job when no claim is given */
        delete: {
            parameters: {
                query?: {
                    claim?: string;
                    owner?: string;
                };
                header?: never;
                path: {
                    jobId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            /** @enum {string} */
                            status: "pending" | "done" | "error" | "gone";
                            error?: string;
                            text?: string;
                            /** @enum {string} */
                            after?: "send" | "steer" | "followup";
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/stt/{jobId}/audio": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Stream the audio kept with a live job; the body is the uploaded audio type (served as audio/*, or application/octet-stream) */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    jobId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/octet-stream": unknown;
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Check, prepare, commit, restart, or acknowledge an omp self-update */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        action: "check" | "restart" | "update" | "commit" | "status" | "acknowledge";
                        force?: boolean;
                        attemptId?: string;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": ({
                            currentVersion: string | null;
                            availableVersion: string | null;
                            updateAvailable: boolean;
                            updateCommand: string;
                            updatesDisabled?: boolean;
                        } & {
                            [key: string]: unknown;
                        }) | ({
                            /** @constant */
                            success: true;
                            sessionsRestarted: number;
                        } & {
                            [key: string]: unknown;
                        }) | (({
                            attemptId: string;
                            /** @enum {string} */
                            state: "prepared" | "running" | "succeeded" | "failed";
                            /** @enum {string} */
                            stage?: "preparing" | "stopping" | "installing" | "restarting" | "finalizing";
                            fromVersion: string;
                            targetVersion: string;
                            preparedAt: string;
                            startedAt?: string;
                            finishedAt?: string;
                            recovered?: boolean;
                            error?: string;
                            cleanupReady?: boolean;
                        } & {
                            [key: string]: unknown;
                        }) | null) | ({
                            /** @constant */
                            acknowledged: true;
                            attemptId: string;
                        } & {
                            [key: string]: unknown;
                        });
                    };
                };
                /** @description Response */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": ({
                            attemptId: string;
                            targetVersion: string;
                        } & {
                            [key: string]: unknown;
                        }) | ({
                            /** @constant */
                            accepted: true;
                            attemptId: string;
                        } & {
                            [key: string]: unknown;
                        });
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Payload Too Large */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Response */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/usage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Aggregate omp session token usage and cost into a report */
        get: {
            parameters: {
                query?: {
                    from?: string;
                    granularity?: ("daily" | "monthly" | "projects") | string;
                    project?: string;
                    range?: ("today" | "7d" | "30d" | "90d" | "month" | "all") | string;
                    refresh?: string;
                    to?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            timeRange: "today" | "7d" | "30d" | "90d" | "month" | "all";
                            /** @enum {string} */
                            granularity: "daily" | "monthly" | "projects";
                            summary: {
                                totalCost: number;
                                totalTokens: number;
                                inputTokens: number;
                                outputTokens: number;
                                reasoningTokens: number;
                                cacheReadTokens: number;
                                cacheWriteTokens: number;
                                cacheSavings: number;
                                activeDays: number;
                                tokensPerActiveDay: number;
                                cachePercentage: number;
                                costQuality: {
                                    providerReported: number;
                                    modelPriced: number;
                                    unpriced: number;
                                } & {
                                    [key: string]: unknown;
                                };
                            } & {
                                [key: string]: unknown;
                            };
                            providers: ({
                                provider: string;
                                name: string;
                                cost: number;
                                tokens: number;
                                share: number;
                                color: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                            timeSeries: ({
                                date: string;
                                label: string;
                                timestamp: number;
                                totalCost: number;
                                totalTokens: number;
                                byProvider: {
                                    [key: string]: {
                                        cost: number;
                                        tokens: number;
                                    } & {
                                        [key: string]: unknown;
                                    };
                                };
                            } & {
                                [key: string]: unknown;
                            })[];
                            modelBreakdown: ({
                                model: string;
                                provider: string;
                                cost: number;
                                tokens: number;
                                inputTokens: number;
                                outputTokens: number;
                                cacheReadTokens: number;
                                cacheWriteTokens: number;
                                reasoningTokens: number;
                                share: number;
                                recordsCount: number;
                            } & {
                                [key: string]: unknown;
                            })[];
                            dayBreakdown: ({
                                date: string;
                                label: string;
                                cost: number;
                                tokens: number;
                                inputTokens: number;
                                outputTokens: number;
                                cacheReadTokens: number;
                                share: number;
                            } & {
                                [key: string]: unknown;
                            })[];
                            projectBreakdown: ({
                                project: string;
                                projectName: string;
                                cost: number;
                                tokens: number;
                                share: number;
                                sessionsCount: number;
                            } & {
                                [key: string]: unknown;
                            })[];
                            scanInfo: {
                                transcriptsScanned: number;
                                transcriptsOutsideWindow: number;
                                usageRecordsCount: number;
                                durationSeconds: number;
                                scannedAt: number;
                            } & {
                                [key: string]: unknown;
                            };
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/version": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Probe the installed omp binary version */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            version: string | null;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/system/web-settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read omp-web's own server-side settings */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            autoResumeSessions: boolean;
                            agentToolsEnabled: boolean;
                            agentEnv: {
                                [key: string]: string;
                            };
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        /** Patch omp-web's server-side settings and apply them to running sessions */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        autoResumeSessions?: boolean;
                        agentToolsEnabled?: boolean;
                        agentEnv?: string | {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            autoResumeSessions: boolean;
                            agentToolsEnabled: boolean;
                            agentEnv: {
                                [key: string]: string;
                            };
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspace/cwd/browse": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List readable subdirectories for the workspace directory picker (drive list on Windows without a path) */
        get: {
            parameters: {
                query?: {
                    path?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            path: string;
                            parentPath: string | null;
                            directories: ({
                                name: string;
                                path: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                            drives?: ({
                                name: string;
                                path: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspace/cwd/validate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Validate a candidate workspace directory and resolve its project root */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        cwd: string;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                            cwd: string;
                            projectRoot: string;
                            projectKey: string;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspace/default-cwd": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create today's default workspace directory (~/omp-cwd-YYYYMMDD) if missing and return it */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            cwd: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspace/files/{path}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List, read, download, or preview a workspace file by path (returned as JSON for list/meta/text reads; binary for read/download of media; HTML for docx preview) */
        get: {
            parameters: {
                query?: {
                    sessionId?: string;
                    type?: "list" | "read" | "download" | "meta" | "preview";
                };
                header?: never;
                path: {
                    /** @description Remaining path segments */
                    path: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": ({
                            path: string;
                            entries: ({
                                name: string;
                                isDir: boolean;
                                size: number;
                                modified: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        }) | ({
                            content: string;
                            language: string;
                            size: number;
                        } & {
                            [key: string]: unknown;
                        }) | ({
                            size: number;
                            language: string;
                            mime: string;
                            previewKind: ("pdf" | "docx") | null;
                        } & {
                            [key: string]: unknown;
                        });
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Payload Too Large */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        /** Write a text file (creating parent directories by default) */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Remaining path segments */
                    path: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        content: string;
                        createParents?: boolean;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            ok: true;
                            path: string;
                            bytes: number;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Payload Too Large */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        /** Upload files into a workspace directory (multipart form field `files`), or check target conflicts with type=upload-check and a JSON { fileNames } body */
        post: {
            parameters: {
                query?: {
                    conflict?: "error" | "overwrite" | "skip";
                    type?: "upload" | "upload-check";
                };
                header?: never;
                path: {
                    /** @description Remaining path segments */
                    path: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "multipart/form-data": unknown;
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": ({
                            uploaded: string[];
                            skipped: string[];
                            errors: ({
                                name: string;
                                error: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        }) | ({
                            conflicts: string[];
                            nonReplaceable: string[];
                        } & {
                            [key: string]: unknown;
                        });
                    };
                };
                /** @description Response */
                207: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            uploaded: string[];
                            skipped: string[];
                            errors: ({
                                name: string;
                                error: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                            conflicts: string[];
                            nonReplaceable: string[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Payload Too Large */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        /** Delete a workspace file, or a directory with recursive=1 */
        delete: {
            parameters: {
                query?: {
                    recursive?: "1" | "true";
                };
                header?: never;
                path: {
                    /** @description Remaining path segments */
                    path: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            ok: true;
                            path: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        /** Rename or move a workspace file or directory */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Remaining path segments */
                    path: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        to: string;
                        overwrite?: boolean;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            ok: true;
                            from: string;
                            to: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/workspace/git/branches": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List local branches and the current branch */
        get: {
            parameters: {
                query: {
                    cwd: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            current: string | null;
                            branches: ({
                                name: string;
                                head: string;
                                current: boolean;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspace/git/checkout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Check out a local branch (optionally create it) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        cwd: string;
                        branch: string;
                        create?: boolean;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            branch: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspace/git/commit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Commit staged changes (optionally amend or limit to paths) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        cwd: string;
                        message: string;
                        amend?: boolean;
                        paths?: string[];
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            commit: string;
                            status: {
                                isGitRepository: boolean;
                                repositoryRoot: string | null;
                                files: ({
                                    filePath: string;
                                    status: string;
                                    code: string;
                                    indexStatus: string;
                                    worktreeStatus: string;
                                    collapseReason?: string;
                                } & {
                                    [key: string]: unknown;
                                })[];
                            } & {
                                [key: string]: unknown;
                            };
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspace/git/diff": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Return the working-tree diff for one changed file as JSON (supported: false when no textual diff exists) */
        get: {
            parameters: {
                query: {
                    cwd: string;
                    path: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            supported: boolean;
                            status?: string;
                            patch?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspace/git/stage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Stage repository changes (explicit paths or all) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        cwd: string;
                        paths?: string[];
                        all?: boolean;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            isGitRepository: boolean;
                            repositoryRoot: string | null;
                            files: ({
                                filePath: string;
                                status: string;
                                code: string;
                                indexStatus: string;
                                worktreeStatus: string;
                                collapseReason?: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspace/git/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Return git working-tree status for one workspace directory */
        get: {
            parameters: {
                query: {
                    cwd: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            isGitRepository: boolean;
                            repositoryRoot: string | null;
                            files: ({
                                filePath: string;
                                status: string;
                                code: string;
                                indexStatus: string;
                                worktreeStatus: string;
                                collapseReason?: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspace/git/unstage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Unstage repository changes (explicit paths or all staged paths) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        cwd: string;
                        paths?: string[];
                        all?: boolean;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            isGitRepository: boolean;
                            repositoryRoot: string | null;
                            files: ({
                                filePath: string;
                                status: string;
                                code: string;
                                indexStatus: string;
                                worktreeStatus: string;
                                collapseReason?: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspace/github-repo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Resolve the GitHub repository (owner/name) configured as a remote for one workspace directory */
        get: {
            parameters: {
                query: {
                    cwd: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            repo: string | null;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspace/index": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Return the workspace file index, or ranked fuzzy matches when q is set */
        get: {
            parameters: {
                query: {
                    cwd: string;
                    kind?: "file";
                    limit?: number;
                    q?: string;
                    refresh?: "1";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": ({
                            files: string[];
                            truncated: boolean;
                        } & {
                            [key: string]: unknown;
                        }) | ({
                            matches: ({
                                path: string;
                                isDir: boolean;
                            } & {
                                [key: string]: unknown;
                            })[];
                            truncated?: boolean;
                        } & {
                            [key: string]: unknown;
                        });
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspace/media/{hash}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Return a tool-result image by content hash (image/*, WebP thumbnail when thumb is set; 404/415 are plain-text bodies) */
        get: {
            parameters: {
                query?: {
                    thumb?: string;
                };
                header?: never;
                path: {
                    hash: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/octet-stream": unknown;
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "text/plain": unknown;
                    };
                };
                /** @description Response */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "text/plain": unknown;
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspace/projects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List registered and session-discovered workspace projects (hidden entries excluded) */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            projects: ({
                                path: string;
                                addedAt?: string;
                                alias?: string;
                                sortOrder?: number;
                                pinOrder?: number;
                                launchConfig?: {
                                    profile?: string;
                                    advisor?: boolean;
                                    extraArgs?: string[];
                                } & {
                                    [key: string]: unknown;
                                };
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        /** Register a workspace directory as a project and authorize its file root */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        cwd: string;
                        launchConfig?: {
                            profile?: string;
                            advisor?: boolean;
                            extraArgs?: string[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            project: {
                                path: string;
                                addedAt?: string;
                                alias?: string;
                                sortOrder?: number;
                                pinOrder?: number;
                                launchConfig?: {
                                    profile?: string;
                                    advisor?: boolean;
                                    extraArgs?: string[];
                                } & {
                                    [key: string]: unknown;
                                };
                            } & {
                                [key: string]: unknown;
                            };
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        /** Hide a project from the sidebar without touching its directory or sessions */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        cwd: string;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        /** Update project presentation (alias / sort order / pin order / launch config), single or batched via updates */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        cwd?: string;
                        alias?: string | null;
                        sortOrder?: number | null;
                        pinOrder?: number | null;
                        launchConfig?: ({
                            profile?: string;
                            advisor?: boolean;
                            extraArgs?: string[];
                        } & {
                            [key: string]: unknown;
                        }) | null;
                        updates?: {
                            cwd: string;
                            alias?: string | null;
                            sortOrder?: number | null;
                            pinOrder?: number | null;
                            launchConfig?: ({
                                profile?: string;
                                advisor?: boolean;
                                extraArgs?: string[];
                            } & {
                                [key: string]: unknown;
                            }) | null;
                        }[];
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            projects: ({
                                path: string;
                                addedAt?: string;
                                alias?: string;
                                sortOrder?: number;
                                pinOrder?: number;
                                launchConfig?: {
                                    profile?: string;
                                    advisor?: boolean;
                                    extraArgs?: string[];
                                } & {
                                    [key: string]: unknown;
                                };
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/workspace/projects/clone": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Clone a Git repository into a parent directory, streaming NDJSON frames (output chunks then done / cancelled / error) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        id: string;
                        parent: string;
                        url: string;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/x-ndjson": unknown;
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        /** Cancel an in-flight clone started with the given id */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        id: string;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            ok: true;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/workspace/worktrees": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List git worktrees of the project containing cwd, with the current one flagged */
        get: {
            parameters: {
                query: {
                    cwd: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            projectRoot: string;
                            projectKey: string;
                            isGit: boolean;
                            isTopLevel: boolean;
                            currentWorktreePath: string | null;
                            worktrees: ({
                                path: string;
                                branch: string | null;
                                isMain: boolean;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        put?: never;
        /** Create a git worktree for a new or existing branch of the project containing cwd */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        cwd: string;
                        branch: string;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            path: string;
                            branch: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        /** Remove a git worktree of the project containing cwd (force removes a dirty one; 409 when dirty without force) */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        cwd: string;
                        path: string;
                        force?: boolean;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @constant */
                            success: true;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Forbidden */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            code: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Error */
                default: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorEnvelope"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        ErrorEnvelope: {
            error: string;
            code: string;
        } & {
            [key: string]: unknown;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
