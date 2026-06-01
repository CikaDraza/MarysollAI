/* global self, clients */

self.addEventListener("push", (event) => {
  let title = "Marysoll";
  let body = "Pronašli smo termin koji odgovara vašem zahtevu.";
  let url = "/";
  let watchId = null;

  if (event.data) {
    try {
      const payload = event.data.json();
      if (payload.title) title = payload.title;
      if (payload.body) body = payload.body;
      if (payload.url) url = payload.url;
      if (payload.watchId) watchId = payload.watchId;
    } catch {
      // Malformed payload — use defaults.
    }
  }

  const options = {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url, watchId },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Focus the first already-open window if the origin matches.
        for (const client of windowClients) {
          const clientUrl = new URL(client.url);
          const target = new URL(targetUrl, self.location.origin);
          if (clientUrl.origin === target.origin && "focus" in client) {
            return client.navigate(targetUrl).then((c) => c && c.focus());
          }
        }
        // No existing window — open a new one.
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      }),
  );
});
