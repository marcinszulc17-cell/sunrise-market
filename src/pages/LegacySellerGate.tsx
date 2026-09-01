import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getMySeller } from "../lib/payments";
import Sprzedawca from "./Sprzedawca";

export default function LegacySellerGate() {
  const [state, setState] = useState<"loading" | "active" | "inactive">("loading");

  useEffect(() => {
    getMySeller()
      .then((seller) => setState(seller ? "active" : "inactive"))
      .catch(() => setState("inactive"));
  }, []);

  if (state === "loading") return <main className="min-h-screen px-4 py-8" style={{ background: "var(--bg)", color: "var(--ink)" }}><div className="mx-auto max-w-3xl rounded-2xl p-6" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>Sprawdzam konto sprzedawcy…</div></main>;
  if (state === "active") return <Navigate to="/sprzedawca" replace />;
  return <Sprzedawca />;
}
