export function startSellerResourceOperationsNav() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  const inject = () => {
    if (window.location.pathname !== "/sprzedawca/rezerwacje") return;
    if (document.querySelector('[data-resource-operations-nav="1"]')) return;

    const heading = Array.from(document.querySelectorAll("h1")).find((el) =>
      (el.textContent || "").trim() === "Rezerwacje i kalendarz",
    ) as HTMLElement | undefined;
    const header = heading?.closest(".mb-6.flex") as HTMLElement | null;
    const actions = header?.querySelector(".flex.flex-wrap.gap-2") as HTMLElement | null;
    if (!actions) return;

    const link = document.createElement("a");
    link.dataset.resourceOperationsNav = "1";
    link.href = "/sprzedawca/rezerwacje/operacje";
    link.className = "rounded-xl px-4 py-2 text-sm font-semibold";
    link.style.border = "1px solid rgba(56,224,240,.35)";
    link.style.color = "var(--ink)";
    link.style.textDecoration = "none";
    link.textContent = "📊 Centrum operacyjne";
    actions.prepend(link);
  };

  inject();
  const observer = new MutationObserver(inject);
  observer.observe(document.body, { childList: true, subtree: true });
  const timer = window.setInterval(inject, 1200);
  return () => {
    observer.disconnect();
    window.clearInterval(timer);
  };
}
