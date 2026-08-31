function hasQuickNearest() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("booking") === "1" && params.get("quick") === "nearest";
  } catch {
    return false;
  }
}

function clickNearestIfReady() {
  if (!hasQuickNearest()) return false;
  const button = Array.from(document.querySelectorAll("button")).find((el) =>
    (el.textContent || "").trim() === "Najbliższy wolny termin",
  ) as HTMLButtonElement | undefined;
  if (!button || button.disabled) return false;
  if (button.dataset.quickBookingClicked === "1") return true;
  button.dataset.quickBookingClicked = "1";
  button.click();

  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("quick");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch { /* ignore */ }
  return true;
}

export function startQuickBookingDeepLink() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  if (!hasQuickNearest()) return () => {};

  let done = clickNearestIfReady();
  if (done) return () => {};

  const observer = new MutationObserver(() => {
    if (done) return;
    done = clickNearestIfReady();
    if (done) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const timer = window.setInterval(() => {
    if (done) return;
    done = clickNearestIfReady();
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
