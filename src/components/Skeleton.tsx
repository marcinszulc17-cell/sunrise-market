// Szkielety ładowania (decyzja właściciela 2026-09-06 — zamiast pustych ekranów i „Ładowanie…”).
export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl ${className}`} style={{ background: "var(--glass)", border: "1px solid var(--line)", ...style }} />;
}

/** Ekran całej strony (Suspense przy podziale bundla). */
export function PageSkeleton() {
  return <main className="min-h-screen px-4 py-5 sm:px-6" style={{ background: "var(--bg)" }} aria-busy="true" aria-label="Wczytywanie">
    <div className="mx-auto max-w-[1440px]">
      <Skeleton className="h-11 w-40" />
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      <Skeleton className="mt-5 h-64" />
    </div>
  </main>;
}

/** Karta oferty w siatce. */
export function OfferCardSkeleton() {
  return <div className="overflow-hidden rounded-2xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} aria-hidden="true">
    <div className="aspect-[4/3] animate-pulse" style={{ background: "var(--header)" }} />
    <div className="space-y-2 p-3"><Skeleton className="h-5 w-24" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>
  </div>;
}

/** Strona oferty. */
export function ProductSkeleton() {
  return <main className="min-h-screen px-4 py-5 sm:px-6" style={{ background: "var(--bg)" }} aria-busy="true" aria-label="Wczytywanie oferty">
    <div className="mx-auto max-w-[1440px]">
      <Skeleton className="h-5 w-64" />
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div><Skeleton className="aspect-[4/3] w-full rounded-2xl" /><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div><Skeleton className="mt-6 h-48" /></div>
        <div className="space-y-3"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-10 w-40" /><Skeleton className="h-24" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      </div>
    </div>
  </main>;
}
