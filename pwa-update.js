import { registerSW } from "virtual:pwa-register";

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;

    window.addEventListener(
      "load",
      () => {
        registration.update().catch((error) => {
          console.warn("Service worker update check failed:", error);
        });
      },
      { once: true },
    );
  },
});
