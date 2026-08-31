function params() {
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return new URLSearchParams();
  }
}

function quickMode() {
  const p = params();
  if (p.get("booking") !== "1") return null;
  return p.get("quick");
}

function rentalRange() {
  const p = params();
  if (p.get("booking") !== "1") return null;
  const from = p.get("from");
  const to = p.get("to");
  if (!from || !to || to <= from) return null;
  return { from, to };
}

function clearParams(...names: string[]) {
  try {
    const url = new URL(window.location.href);
    for (const name of names) url.searchParams.delete(name);
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
  clearParams("quick");
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
  clearParams("quick");
  return true;
}

function plDateLabel(day: string) {
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString("pl-PL");
}

function clickRentalRangeIfReady() {
  const range = rentalRange();
  if (!range) return false;

  const buttons = Array.from(document.querySelectorAll("button[aria-label]")) as HTMLButtonElement[];
  const fromLabel = plDateLabel(range.from);
  const toLabel = plDateLabel(range.to);
  const fromButton = buttons.find((b) => (b.getAttribute("aria-label") || "").startsWith(fromLabel));
  if (!fromButton || fromButton.disabled) return false;

  if (fromButton.dataset.quickRentalClicked !== "1") {
    fromButton.dataset.quickRentalClicked = "1";
    fromButton.click();
    return false;
  }

  const refreshed = Array.from(document.querySelectorAll("button[aria-label]")) as HTMLButtonElement[];
  const toButton = refreshed.find((b) => (b.getAttribute("aria-label") || "").startsWith(toLabel));
  if (!toButton || toButton.disabled) return false;
  if (toButton.dataset.quickRentalClicked !== "1") {
    toButton.dataset.quickRentalClicked = "1";
    toButton.click();
  }
  clearParams("from", "to");
  return true;
}

function clickQuickIfReady() {
  return clickNearestIfReady() || clickExactSlotIfReady() || clickRentalRangeIfReady();
}

export function startQuickBookingDeepLink() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  if (!quickMode() && !rentalRange()) return () => {};

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
