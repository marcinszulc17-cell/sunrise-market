import { useEffect } from "react";

const MYSUNRISE_URL = "https://mysunrise.pl";

function safeNext() {
  const value = new URLSearchParams(window.location.search).get("next") || "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default function Login() {
  useEffect(() => {
    const next = safeNext();
    const params = new URLSearchParams({
      return: next,
      origin: window.location.origin,
    });
    const target = `${MYSUNRISE_URL}/market?${params.toString()}`;
    window.location.replace(target);
  }, []);

  return (
    <div className="min-h-screen grid place-items-center px-4" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="text-center">
        <div className="text-2xl mb-2">☀️</div>
        <div className="font-display text-xl font-semibold">Logowanie przez MySunrise</div>
        <p className="mt-2 text-sm" style={{ color: "var(--mut)" }}>Jedno konto i jedno logowanie działa we wszystkich usługach Sunrise.</p>
      </div>
    </div>
  );
}
