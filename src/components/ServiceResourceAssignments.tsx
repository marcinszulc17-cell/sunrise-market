import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Service = { id: string; name: string };
type Resource = { id: string; name: string; kind: string; active?: boolean };
type Mapping = { service_id: string; resource_id: string };

type Props = {
  offerId: string;
  services: Service[];
  resources: Resource[];
  mappings: Mapping[];
  onSaved?: () => Promise<void> | void;
};

const kindLabel: Record<string, string> = {
  staff: "Pracownik",
  vehicle: "Samochód",
  property: "Nieruchomość",
  room: "Pokój",
  equipment: "Sprzęt",
  other: "Zasób",
};

export default function ServiceResourceAssignments({ offerId, services, resources, mappings, onSaved }: Props) {
  const mapped = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const service of services) out[service.id] = [];
    for (const row of mappings || []) (out[row.service_id] ||= []).push(row.resource_id);
    return out;
  }, [services, mappings]);
  const [draft, setDraft] = useState<Record<string, string[]>>(mapped);
  const [busyService, setBusyService] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => setDraft(mapped), [mapped]);

  function selected(serviceId: string) {
    return draft[serviceId] ?? mapped[serviceId] ?? [];
  }

  function toggle(serviceId: string, resourceId: string) {
    const current = selected(serviceId);
    const next = current.includes(resourceId)
      ? current.filter((id) => id !== resourceId)
      : current.length === 0
        ? [resourceId]
        : [...current, resourceId];
    setDraft((prev) => ({ ...prev, [serviceId]: next }));
  }

  async function save(serviceId: string) {
    setBusyService(serviceId);
    setMessage("");
    const { error } = await supabase.schema("market").rpc("seller_booking_service_resources_replace", {
      p_offer: offerId,
      p_service: serviceId,
      p_resources: selected(serviceId),
    });
    setBusyService(null);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Przypisanie usługi zapisane ✅");
    await onSaved?.();
  }

  if (!services.length) return null;

  return <section className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
    <h2 className="text-xl font-semibold">Kto wykonuje daną usługę</h2>
    <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>
      Jak w Booksy: przypisz usługę do konkretnych pracowników lub zasobów. Brak zaznaczenia oznacza, że usługę może obsłużyć każdy aktywny zasób przypięty do tej oferty.
    </p>

    {message && <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: "rgba(232,137,26,.10)", color: "var(--gold)" }}>{message}</div>}

    <div className="mt-5 space-y-4">
      {services.map((service) => {
        const current = selected(service.id);
        const all = current.length === 0;
        return <div key={service.id} className="rounded-2xl p-4" style={{ border: "1px solid var(--line)" }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-semibold">{service.name}</div>
              <div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{all ? "Każdy aktywny zasób tej oferty" : `${current.length} ${current.length === 1 ? "przypisany zasób" : "przypisane zasoby"}`}</div>
            </div>
            <button type="button" onClick={() => setDraft((prev) => ({ ...prev, [service.id]: [] }))} className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ border: all ? "1px solid var(--gold)" : "1px solid var(--line)", color: all ? "var(--gold)" : "var(--ink)" }}>Każdy dostępny</button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {resources.map((resource) => {
              const checked = current.includes(resource.id);
              return <label key={resource.id} className="flex cursor-pointer items-center gap-3 rounded-xl p-3" style={{ border: checked ? "1px solid var(--gold)" : "1px solid var(--line)", background: checked ? "rgba(232,137,26,.08)" : "transparent", opacity: resource.active === false ? .55 : 1 }}>
                <input type="checkbox" checked={checked} disabled={resource.active === false} onChange={() => toggle(service.id, resource.id)} />
                <span className="min-w-0"><b className="block truncate">{resource.name}</b><span className="text-xs" style={{ color: "var(--mut)" }}>{kindLabel[resource.kind] || resource.kind}{resource.active === false ? " · wyłączony" : ""}</span></span>
              </label>;
            })}
          </div>

          {resources.length === 0 && <p className="mt-3 text-sm" style={{ color: "var(--mut)" }}>Najpierw dodaj pracownika lub zasób do tej oferty.</p>}
          <button type="button" disabled={busyService === service.id || resources.length === 0} onClick={() => save(service.id)} className="mt-3 w-full rounded-xl py-2.5 font-semibold disabled:opacity-50" style={{ border: "1px solid var(--gold)", color: "var(--gold)" }}>{busyService === service.id ? "Zapisuję…" : "Zapisz przypisanie"}</button>
        </div>;
      })}
    </div>
  </section>;
}
