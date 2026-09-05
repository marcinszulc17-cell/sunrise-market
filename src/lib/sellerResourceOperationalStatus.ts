import { supabase } from "./supabase";

type OperationalStatus = "available" | "service" | "failure" | "blocked";

const defs: Array<{ value: OperationalStatus; label: string; icon: string }> = [
  { value: "available", label: "Dostępny", icon: "✓" },
  { value: "service", label: "Serwis", icon: "🔧" },
  { value: "failure", label: "Awaria", icon: "⚠️" },
  { value: "blocked", label: "Blokada", icon: "⛔" },
];

function selectedResourceId() {
  try {
    return new URLSearchParams(window.location.search).get("resource") || "";
  } catch {
    return "";
  }
}

function labelFor(status: OperationalStatus) {
  return defs.find((d) => d.value === status)?.label || "Dostępny";
}

async function rpcStatus(resourceId: string, status?: OperationalStatus) {
  const { data, error } = await supabase.schema("market").rpc("seller_booking_resource_operational_status", {
    p_resource: resourceId,
    p_status: status ?? null,
  });
  if (error) throw error;
  return String(data || "available") as OperationalStatus;
}

function inject() {
  if (window.location.pathname !== "/sprzedawca/rezerwacje/grafiki") return;
  if (document.querySelector('[data-operational-status-panel="1"]')) return;
  const resourceId = selectedResourceId();
  if (!resourceId) return;

  const headings = Array.from(document.querySelectorAll("h2"));
  const target = headings.find((h) => (h.textContent || "").includes("Grafik:"))?.closest("div.rounded-2xl") as HTMLElement | null;
  if (!target) return;

  const panel = document.createElement("div");
  panel.dataset.operationalStatusPanel = "1";
  panel.className = "mb-4 rounded-2xl p-4";
  panel.style.background = "rgba(56,224,240,.06)";
  panel.style.border = "1px solid rgba(56,224,240,.18)";

  const top = document.createElement("div");
  top.className = "flex flex-wrap items-center justify-between gap-3";
  const copy = document.createElement("div");
  copy.innerHTML = '<div class="text-sm font-semibold">Status operacyjny</div><div class="mt-0.5 text-xs" style="color:var(--mut)">Serwis, awaria lub blokada natychmiast wyłączają zasób z nowych terminów.</div>';
  const badge = document.createElement("span");
  badge.className = "rounded-full px-3 py-1 text-xs font-semibold";
  badge.textContent = "Sprawdzam…";
  badge.style.border = "1px solid var(--line)";
  top.append(copy, badge);
  panel.appendChild(top);

  const buttons = document.createElement("div");
  buttons.className = "mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4";
  panel.appendChild(buttons);

  let current: OperationalStatus = "available";
  let busy = false;

  const paint = () => {
    badge.textContent = labelFor(current);
    badge.style.color = current === "available" ? "var(--green)" : current === "failure" ? "#fca5a5" : "var(--gold)";
    for (const button of Array.from(buttons.querySelectorAll("button")) as HTMLButtonElement[]) {
      const selected = button.dataset.status === current;
      button.style.background = selected ? "linear-gradient(135deg,#E8891A,#F5A623)" : "var(--glass)";
      button.style.color = selected ? "#211406" : "var(--ink)";
      button.style.border = selected ? "1px solid transparent" : "1px solid var(--line)";
      button.disabled = busy;
    }
  };

  for (const def of defs) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.status = def.value;
    button.className = "rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50";
    button.textContent = `${def.icon} ${def.label}`;
    button.onclick = async () => {
      if (busy || current === def.value) return;
      busy = true; paint();
      try {
        current = await rpcStatus(resourceId, def.value);
        paint();
        window.dispatchEvent(new CustomEvent("sunrise-resource-status-changed", { detail: { resourceId, status: current } }));
      } catch (e: any) {
        badge.textContent = e?.message || "Nie udało się zmienić statusu";
      } finally {
        busy = false; paint();
      }
    };
    buttons.appendChild(button);
  }

  target.parentElement?.insertBefore(panel, target);
  void rpcStatus(resourceId).then((status) => { current = status; paint(); }).catch(() => { badge.textContent = "Status niedostępny"; });
}

export function startSellerResourceOperationalStatus() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const scan = () => inject();
  scan();
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  const timer = window.setInterval(scan, 1000);
  return () => {
    observer.disconnect();
    window.clearInterval(timer);
  };
}
