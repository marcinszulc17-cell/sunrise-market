export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

let deferredPrompt: InstallPromptEvent | null = null;

export function registerPwa() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    window.dispatchEvent(new CustomEvent("sunrise:pwa-installable"));
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent("sunrise:pwa-installed"));
  });
}

export function canInstallPwa() {
  return Boolean(deferredPrompt);
}

export async function promptPwaInstall() {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  if (choice.outcome === "accepted") deferredPrompt = null;
  return choice.outcome === "accepted";
}

export function isStandalonePwa() {
  const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return window.matchMedia?.("(display-mode: standalone)").matches || iosStandalone;
}

export function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua);
  const webkit = /webkit/i.test(ua);
  const excluded = /crios|fxios|edgios/i.test(ua);
  return ios && webkit && !excluded;
}
