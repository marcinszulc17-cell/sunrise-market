import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type CartItem = { offer_id: string; title: string; price: number; qty: number; variant?: string; billing?: "month" | "year" };

// Produkty testowe (katalog dropshippingowy) — widoczne w sklepie, ale NIE do kupienia.
// Zrodlo prawdy jest w bazie (offers.is_test + blokada w market.checkout); front rozpoznaje
// je po oznaczeniu w nazwie, zeby nie dalo sie ich w ogole wrzucic do koszyka.
export const TEST_PREFIX = "[PRODUKT TESTOWY]";
export function isTestProduct(title?: string | null): boolean {
  return typeof title === "string" && title.trim().startsWith(TEST_PREFIX);
}
export function cleanTitle(title?: string | null): string {
  const t = String(title ?? "");
  return isTestProduct(t) ? t.slice(TEST_PREFIX.length).trim() : t;
}

// Koszyk musi być rozdzielony między kontami na tym samym urządzeniu.
// undefined = sesja jeszcze nierozpoznana; null = gość; string = auth.user.id.
let activeOwner: string | null | undefined = undefined;
const LEGACY_KEY = "sunrise_cart";
const GUEST_KEY = "sunrise_cart:guest";
const USER_PREFIX = "sunrise_cart:user:";

function keyForOwner(): string | null {
  if (activeOwner === undefined) return null;
  return activeOwner ? `${USER_PREFIX}${activeOwner}` : GUEST_KEY;
}

function notifyCartChanged() {
  window.dispatchEvent(new Event("cart-changed"));
}

function setCartOwner(nextOwner: string | null) {
  if (activeOwner === nextOwner) return;
  activeOwner = nextOwner;
  notifyCartChanged();
}

// Stary koszyk był wspólny dla wszystkich użytkowników przeglądarki.
// Nie migrujemy go do aktualnie zalogowanego konta, bo moglibyśmy przypisać
// cudze produkty kolejnej osobie korzystającej z tego samego komputera.
try { localStorage.removeItem(LEGACY_KEY); } catch { /* storage optional */ }

supabase.auth.getSession()
  .then(({ data }) => setCartOwner(data.session?.user?.id ?? null))
  .catch(() => setCartOwner(null));

supabase.auth.onAuthStateChange((_event, session) => {
  setCartOwner(session?.user?.id ?? null);
});

export function getCart(): CartItem[] {
  const key = keyForOwner();
  if (!key) return [];
  try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
}

function save(c: CartItem[]) {
  const key = keyForOwner();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(c));
  notifyCartChanged();
}

export function addToCart(it: Omit<CartItem, "qty">, qty = 1) {
  if (isTestProduct(it.title)) return false;
  const key = keyForOwner();
  if (!key) return false;
  const c = getCart();
  const f = c.find((x) => x.offer_id === it.offer_id && (x.variant || "") === (it.variant || ""));
  if (f) f.qty += qty; else c.push({ ...it, qty });
  save(c);
  return true;
}

export function setQty(id: string, qty: number) {
  save(getCart().map((x) => (x.offer_id === id ? { ...x, qty } : x)).filter((x) => x.qty > 0));
}
export function removeItem(id: string) { save(getCart().filter((x) => x.offer_id !== id)); }
export function clearCart() { save([]); }
export function cartCount() { return getCart().reduce((n, x) => n + x.qty, 0); }
export function cartTotal() { return getCart().reduce((s, x) => s + x.price * x.qty, 0); }

// hook: re-render przy zmianie koszyka lub zmianie zalogowanego użytkownika
export function useCart() {
  const [c, setC] = useState<CartItem[]>(getCart());
  useEffect(() => {
    const h = () => setC(getCart());
    window.addEventListener("cart-changed", h);
    h();
    return () => window.removeEventListener("cart-changed", h);
  }, []);
  return c;
}
