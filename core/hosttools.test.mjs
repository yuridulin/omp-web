import assert from "node:assert/strict";
import { test } from "bun:test";

const {
  HOST_TOOL_DEFINITIONS,
  HOST_URI_SCHEMES,
  runHostTool,
  parseHostToolCall,
  hostToolResultFrame,
  parseHostUriRequest,
  hostUriResultFrame,
} = await import("./hosttools.ts");

/** Records calls; returns a fixed text so assertions can spot preference. */
function handlers(overrides = {}) {
  const opened = [];
  const files = [];
  const notifications = [];
  const stub = {
    openUrl(url) {
      opened.push(url);
      return `Opened ${url}`;
    },
    openFile(path, name) {
      files.push({ path, name });
    },
    notify(title, message) {
      notifications.push({ title, message });
    },
    ...overrides,
  };
  return { stub, opened, files, notifications };
}

test("definitions advertise the three web-UI host tools", () => {
  assert.deepEqual(HOST_TOOL_DEFINITIONS.map((tool) => tool.name), ["open_url", "notify", "open_file"]);
  for (const tool of HOST_TOOL_DEFINITIONS) {
    assert.equal(typeof tool.description, "string");
    assert.ok(tool.description.length > 0);
    assert.equal(typeof tool.parameters, "object");
    assert.ok(tool.parameters);
    assert.equal(tool.parameters.type, "object");
    assert.equal(typeof tool.parameters.required, "object");
  }
  const byName = Object.fromEntries(HOST_TOOL_DEFINITIONS.map((tool) => [tool.name, tool]));
  assert.deepEqual(byName.open_url.parameters.required, ["url"]);
  assert.deepEqual(byName.notify.parameters.required, ["title"]);
  assert.deepEqual(byName.open_file.parameters.required, ["path"]);
  assert.deepEqual(Object.keys(byName.open_url.parameters.properties), ["url"]);
});

test("HOST_URI_SCHEMES mirrors the pi-web bridge", () => {
  assert.deepEqual(HOST_URI_SCHEMES, [
    {
      scheme: "pi-web",
      description: "Browser-integrated resources: pi-web://clipboard reads/writes the user's clipboard via the web UI.",
      writable: true,
    },
  ]);
});

test("open_url opens safe URLs through the handler", async () => {
  const { stub, opened } = handlers();
  for (const url of ["http://example.com/a", "https://example.com/b?c=d", "mailto:someone@example.com"]) {
    assert.deepEqual(await runHostTool("open_url", { url }, stub), { text: `Opened ${url}`, isError: false });
  }
  assert.deepEqual(opened, ["http://example.com/a", "https://example.com/b?c=d", "mailto:someone@example.com"]);
});

test("open_url refuses unsafe URLs without involving the handler", async () => {
  const { stub, opened } = handlers();
  const hostile = ["javascript:alert(1)", "data:text/html,<b>x", "//evil.example/path", "example.com", "file:///etc/passwd"];
  for (const url of hostile) {
    assert.deepEqual(
      await runHostTool("open_url", { url }, stub),
      { text: "Unsafe or invalid URL not opened", isError: true },
      url,
    );
  }
  assert.deepEqual(opened, []);

  // Nothing was sent: refused without an error flag.
  assert.deepEqual(
    await runHostTool("open_url", {}, stub),
    { text: "Unsafe or invalid URL not opened", isError: false },
  );
  assert.deepEqual(
    await runHostTool("open_url", { url: "" }, stub),
    { text: "Unsafe or invalid URL not opened", isError: false },
  );
  assert.deepEqual(
    await runHostTool("open_url", { url: 42 }, stub),
    { text: "Unsafe or invalid URL not opened", isError: false },
  );
  assert.deepEqual(opened, []);
});

test("notify applies defaults and awaits the handler", async () => {
  const { stub, notifications } = handlers();
  assert.deepEqual(await runHostTool("notify", {}, stub), { text: "Notification shown", isError: false });
  assert.deepEqual(notifications, [{ title: "OMP", message: "" }]);

  let settled = false;
  const asyncHandlers = {
    openUrl: () => "",
    notify: async () => {
      await Promise.resolve();
      settled = true;
    },
  };
  assert.deepEqual(
    await runHostTool("notify", { title: "Build", message: "done" }, asyncHandlers),
    { text: "Notification shown", isError: false },
  );
  assert.equal(settled, true);
});

test("notify succeeds even when the handler throws", async () => {
  const stub = {
    openUrl: () => "",
    notify() {
      throw new Error("permission denied");
    },
  };
  assert.deepEqual(
    await runHostTool("notify", { title: "x", message: "y" }, stub),
    { text: "Notification shown", isError: false },
  );
});

test("open_file rejects an empty path", async () => {
  const { stub, files } = handlers();
  assert.deepEqual(await runHostTool("open_file", {}, stub), { text: "No path provided", isError: true });
  assert.deepEqual(await runHostTool("open_file", { path: "" }, stub), { text: "No path provided", isError: true });
  assert.deepEqual(await runHostTool("open_file", { path: 7 }, stub), { text: "No path provided", isError: true });
  assert.deepEqual(files, []);
});

test("open_file derives the basename and prefers the handler text", async () => {
  const calls = [];
  const stub = {
    openUrl: () => "",
    openFile(path, name) {
      calls.push({ path, name });
      return `Viewing ${name}`;
    },
  };
  assert.deepEqual(
    await runHostTool("open_file", { path: "a/b\\c.txt" }, stub),
    { text: "Viewing c.txt", isError: false },
  );
  assert.deepEqual(calls, [{ path: "a/b\\c.txt", name: "c.txt" }]);
});

test("open_file falls back to the opened path and survives a throwing handler", async () => {
  const { stub, files } = handlers();
  assert.deepEqual(
    await runHostTool("open_file", { path: "src/index.ts" }, stub),
    { text: "Opened src/index.ts", isError: false },
  );
  assert.deepEqual(files, [{ path: "src/index.ts", name: "index.ts" }]);

  const throwing = {
    openUrl: () => "",
    openFile() {
      throw new Error("tab exploded");
    },
  };
  assert.deepEqual(
    await runHostTool("open_file", { path: "/tmp/x.md" }, throwing),
    { text: "Opened /tmp/x.md", isError: false },
  );

  const noHandler = { openUrl: () => "" };
  assert.deepEqual(
    await runHostTool("open_file", { path: "C:\\work\\a b.txt" }, noHandler),
    { text: "Opened C:\\work\\a b.txt", isError: false },
  );
});

test("unknown host tools report the unavailable text", async () => {
  const { stub } = handlers();
  assert.deepEqual(
    await runHostTool("shell", { cmd: "ls" }, stub),
    { text: 'Host tool "shell" is not available in omp-web', isError: true },
  );
});

test("parseHostToolCall accepts id + toolName with an object arguments payload", () => {
  assert.deepEqual(
    parseHostToolCall({ type: "host_tool_call", id: "call-1", toolName: "open_url", arguments: { url: "https://x.test" } }),
    { id: "call-1", toolName: "open_url", args: { url: "https://x.test" } },
  );
  // `args` is accepted as the alternative key.
  assert.deepEqual(
    parseHostToolCall({ id: "call-2", toolName: "notify", args: { title: "t" } }),
    { id: "call-2", toolName: "notify", args: { title: "t" } },
  );
  // Missing or non-object arguments degrade to an empty bag.
  assert.deepEqual(parseHostToolCall({ id: "call-3", toolName: "notify" }), {
    id: "call-3",
    toolName: "notify",
    args: {},
  });
  assert.deepEqual(parseHostToolCall({ id: "call-4", toolName: "notify", arguments: "nope" }), {
    id: "call-4",
    toolName: "notify",
    args: {},
  });
  assert.deepEqual(parseHostToolCall({ id: "call-5", toolName: "notify", arguments: [1, 2] }), {
    id: "call-5",
    toolName: "notify",
    args: {},
  });
});

test("parseHostToolCall rejects frames it cannot answer", () => {
  for (const frame of [
    null,
    undefined,
    "host_tool_call",
    42,
    [],
    {},
    { id: "", toolName: "open_url" },
    { id: 7, toolName: "open_url" },
    { id: "call-1" },
    { id: "call-1", toolName: "" },
    { id: "call-1", toolName: 9 },
  ]) {
    assert.equal(parseHostToolCall(frame), null, JSON.stringify(frame));
  }
});

test("hostToolResultFrame matches the wire shape", () => {
  assert.deepEqual(hostToolResultFrame("call-1", { text: "Opened https://x.test", isError: false }), {
    type: "host_tool_result",
    id: "call-1",
    isError: false,
    result: { content: [{ type: "text", text: "Opened https://x.test" }] },
  });
  assert.deepEqual(hostToolResultFrame("call-2", { text: "No path provided", isError: true }), {
    type: "host_tool_result",
    id: "call-2",
    isError: true,
    result: { content: [{ type: "text", text: "No path provided" }] },
  });
});

test("parseHostUriRequest defaults to read and keeps content only when it is a string", () => {
  const read = parseHostUriRequest({ type: "host_uri_request", id: "u1", url: "pi-web://clipboard" });
  assert.deepEqual(read, { id: "u1", url: "pi-web://clipboard", operation: "read" });
  assert.equal("content" in read, false);

  // An explicit read keeps a string content: the host decides what to ignore.
  assert.deepEqual(
    parseHostUriRequest({ id: "u2", url: "pi-web://clipboard", operation: "read", content: "kept" }),
    { id: "u2", url: "pi-web://clipboard", operation: "read", content: "kept" },
  );

  const write = parseHostUriRequest({ id: "u3", url: "pi-web://clipboard", operation: "write", content: "copied" });
  assert.deepEqual(write, { id: "u3", url: "pi-web://clipboard", operation: "write", content: "copied" });

  // Any other operation reads; a non-string content never reaches the agent.
  assert.deepEqual(
    parseHostUriRequest({ id: "u4", url: "pi-web://clipboard", operation: "append", content: 12 }),
    { id: "u4", url: "pi-web://clipboard", operation: "read" },
  );
});

test("parseHostUriRequest rejects frames it cannot answer", () => {
  for (const frame of [
    null,
    undefined,
    "host_uri_request",
    [],
    {},
    { id: "", url: "pi-web://clipboard" },
    { id: "u1" },
    { id: "u1", url: "" },
    { id: "u1", url: 3 },
    { id: 1, url: "pi-web://clipboard" },
  ]) {
    assert.equal(parseHostUriRequest(frame), null, JSON.stringify(frame));
  }
});

test("hostUriResultFrame omits undefined payload fields", () => {
  assert.deepEqual(hostUriResultFrame("u1", {}), { type: "host_uri_result", id: "u1" });
  assert.deepEqual(
    hostUriResultFrame("u2", { content: "hello", contentType: "text/plain" }),
    { type: "host_uri_result", id: "u2", content: "hello", contentType: "text/plain" },
  );
  assert.deepEqual(
    hostUriResultFrame("u3", { isError: true, error: "Clipboard write failed in this browser" }),
    { type: "host_uri_result", id: "u3", isError: true, error: "Clipboard write failed in this browser" },
  );
  assert.deepEqual(
    hostUriResultFrame("u4", { isError: false }),
    { type: "host_uri_result", id: "u4", isError: false },
  );
});

test("host tool execution never reaches for DOM globals", async () => {
  // Node has no `window` or `Notification`; if the module touched them these
  // calls would throw. Handlers are the only side-effect path.
  assert.equal(typeof globalThis.window, "undefined");
  assert.equal(typeof globalThis.Notification, "undefined");

  const seen = [];
  const ports = {
    openUrl(url) {
      seen.push(url);
      return `Opened ${url}`;
    },
    openFile(path, name) {
      seen.push(`${path}:${name}`);
      return `Opened ${path}`;
    },
    notify(title, message) {
      seen.push(`${title}:${message}`);
    },
  };
  assert.deepEqual(await runHostTool("open_url", { url: "https://example.com" }, ports), {
    text: "Opened https://example.com",
    isError: false,
  });
  assert.deepEqual(await runHostTool("notify", { title: "hi" }, ports), {
    text: "Notification shown",
    isError: false,
  });
  assert.deepEqual(await runHostTool("open_file", { path: "a/b.txt" }, ports), {
    text: "Opened a/b.txt",
    isError: false,
  });
  assert.deepEqual(seen, ["https://example.com", "hi:", "a/b.txt:b.txt"]);
});
