import { useMemo } from "react";

const ACCOUNT_HUB_URL = "https://app.mysunrise.pl";

function safeNext() {
  const value = new URLSearchParams(window.location.search).get("next") || "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default function Login() {
  const target = useMemo(() => {
    const params = new URLSearchParams({
      return: safeNext(),
      origin: "https://app.sunrisemarket.pl",
    });
    return `${ACCOUNT_HUB_URL}/market?${params.toString()}`;
  }, []);

  return (
    <main
      className="min-h-screen flex items-center justify-center px-5 py-10"
      style={{
        background: "radial-gradient(circle at 50% 0%, rgba(200,150,90,.16), transparent 34%), var(--bg)",
        color: "var(--ink)",
      }}
    >
      <section
        className="w-full max-w-md rounded-3xl p-7 sm:p-9 shadow-2xl"
        style={{
          background: "rgba(12,18,26,.94)",
          border: "1px solid rgba(200,150,90,.28)",
          boxShadow: "0 30px 80px rgba(0,0,0,.38)",
        }}
      >
        <div className="flex justify-center">
          <img src="/icon-192x192.png" alt="Sunrise Market" className="h-16 w-16 rounded-2xl shadow-lg" />
        </div>

        <div className="mt-6 text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--gold)" }}>
            Sunrise Market
          </div>
          <h1 className="mt-2 font-display text-3xl font-semibold">Zaloguj się</h1>
          <p className="mt-3 text-sm leading-6" style={{ color: "var(--mut)" }}>
            Jedno konto Sunrise daje dostęp do zakupów, sprzedaży, rezerwacji i Twojego portfela.
          </p>
        </div>

        <a
          href={target}
          className="mt-7 flex w-full items-center justify-center rounded-2xl px-4 py-3.5 text-sm font-bold text-black transition-transform hover:scale-[1.01] active:scale-[.99]"
          style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}
        >
          Zaloguj się do Sunrise Market
        </a>

        <div className="mt-5 text-center text-xs leading-5" style={{ color: "var(--mut)" }}>
          Po zalogowaniu wrócisz automatycznie do Sunrise Market.
        </div>
      </section>
    </main>
  );
}
