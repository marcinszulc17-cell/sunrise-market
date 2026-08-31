import { Link } from "react-router-dom";
import SellerResourceOperationsDashboard from "../components/SellerResourceOperationsDashboard";

export default function SellerResourceOperationsPage() {
  return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/sprzedawca/rezerwacje" className="text-sm underline" style={{ color: "var(--mut)" }}>← Rezerwacje i kalendarz</Link>
          <h1 className="mt-2 font-display text-3xl font-semibold">Centrum operacyjne zasobów</h1>
        </div>
        <Link to="/sprzedawca/rezerwacje/grafiki" className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: "1px solid var(--gold)", color: "var(--gold)" }}>Grafiki i statusy</Link>
      </div>
      <SellerResourceOperationsDashboard />
    </div>
  </main>;
}
