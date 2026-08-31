function quickMode() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("booking") !== "1") return null;
    return params.get("quick");
  } catch {
    return null;
  }
}

function clearQuickParam() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("quick");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch { /* ignore */ }
}

function clickNearestIfReady() {
  if (quickMode() !== "nearest") return false;
  const button = Array.from(document.querySelectorAll("button")).find((el) =>
    (el.textContent || "").trim() === "Najbliższy wolny termin",
  ) as HTMLButtonElement | undefined;
  if (!button || button.disabled) return false;
  if (button.dataset.quickBookingClicked === "1") return true;
  button.dataset.quickBookingClicked = "1";
  button.click();
  clearQuickParam();
  return true;
}

function clickExactSlotIfReady() {
  const mode = quickMode();
  if (!mode || !mode.startsWith("slot:")) return false;
  const iso = decodeURIComponent(mode.slice(5));
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const hour = date.toLocaleTimeString("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" });
  const button = Array.from(document.querySelectorAll("button")).find((el) =>
    (el.textContent || "").trim() === hour,
  ) as HTMLButtonElement | undefined;
  if (!button || button.disabled) return false;
  if (button.dataset.quickBookingClicked === "1") return true;
  button.dataset.quickBookingClicked = "1";
  button.click();
  clearQuickParam();
  return true;
}

function clickQuickIfReady() {
  return clickNearestIfReady() || clickExactSlotIfReady();
}

export function startQuickBookingDeepLink() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  if (!quickMode()) return () => {};

  let done = clickQuickIfReady();
  if (done) return () => {};

  const observer = new MutationObserver(() => {
    if (done) return;
    done = clickQuickIfReady();
    if (done) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const timer = window.setInterval(() => {
    if (done) return;
    done = clickQuickIfReady();
    if (done) {
      observer.disconnect();
      window.clearInterval(timer);
    }
  }, 250);

  return () => {
    observer.disconnect();
    window.clearInterval(timer);
  };
}
