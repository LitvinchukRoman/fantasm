/* Браузерні сповіщення. Цей файл не кешує сторінки і не перехоплює запити. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Fantasm";
  const body = typeof data.body === "string" && data.body ? data.body : "Нове сповіщення";
  const url = typeof data.url === "string" ? data.url : "/notifications";
  const tag = typeof data.tag === "string" && data.tag ? data.tag : "fantasm";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/favicon.jpg",
      tag,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  const path = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/notifications";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        if ("navigate" in client) {
          try {
            await client.navigate(target);
          } catch {
            /* focus the open tab even if this browser cannot navigate it */
          }
        }
        return client.focus();
      }
      return self.clients.openWindow(target);
    })(),
  );
});
