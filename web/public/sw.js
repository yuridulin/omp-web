/* omp-web notifications service worker: push display and click routing. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  if (!payload || typeof payload !== "object") payload = {};

  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
  const url =
    sessionId !== ""
      ? `/?session=${encodeURIComponent(sessionId)}`
      : typeof payload.url === "string" && payload.url !== ""
        ? payload.url
        : "/";
  const title = typeof payload.title === "string" && payload.title !== "" ? payload.title : "omp";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "",
    data: {
      url,
      sessionId,
      type: typeof payload.type === "string" ? payload.type : "",
    },
  };
  if (typeof payload.tag === "string" && payload.tag !== "") options.tag = payload.tag;
  if (payload.type === "input" || payload.type === "error") options.requireInteraction = true;

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data && typeof event.notification.data === "object" ? event.notification.data : {};
  const sessionId = typeof data.sessionId === "string" ? data.sessionId : "";
  const targetPath =
    typeof data.url === "string" && data.url !== ""
      ? data.url
      : sessionId !== ""
        ? `/?session=${encodeURIComponent(sessionId)}`
        : "/";
  const target = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        try {
          await client.focus();
          try {
            await client.navigate(target);
          } catch {
            // An uncontrolled client may refuse navigation; focusing it is still useful.
          }
          return;
        } catch {
          // Try the next window.
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
