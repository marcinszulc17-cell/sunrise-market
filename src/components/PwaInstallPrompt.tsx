import { useEffect } from "react";

/**
 * PWA stays installable, but Sunrise Market must never block the user with an
 * automatic install overlay. We suppress the browser auto prompt and leave
 * installation as an explicit browser/menu action.
 */
export default function PwaInstallPrompt() {
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
    };

    window.addEventListener("beforeinstallprompt", onPrompt as EventListener);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt as EventListener);
    };
  }, []);

  return null;
}
