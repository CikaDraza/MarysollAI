self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration.showNotification("Marysoll", {
      body: "Pojavio se slobodan termin. Otvori Marysoll da potvrdiš rezervaciju.",
      icon: "/Logo_Marysoll_assistent_website.png",
      badge: "/marysoll_assistent.ico",
      data: { url: "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(clients.openWindow(url));
});
