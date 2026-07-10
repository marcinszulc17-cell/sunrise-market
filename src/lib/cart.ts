import { useEffect, useState } from "react";

export type CartItem = { offer_id: string; title: string; price: number; qty: number; variant?: string };
const KEY = "sunrise_cart";

export function getCart(): CartItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function save(c: CartItem[]) {
  localStorage.setItem(KEY, JSON.stringify(c));
  window.dispatchEvent(new Event("cart-changed"));
}
export function addToCart(it: Omit<CartItem, "qty">, qty = 1) {
  const c = getCart();
  const f = c.find((x) => x.offer_id === it.offer_id && (x.variant || "") === (it.variant || ""));
  if (f) f.qty += qty; else c.push({ ...it, qty });
  save(c);
}
export function setQty(id: string, qty: number) {
  save(getCart().map((x) => (x.offer_id === id ? { ...x, qty } : x)).filter((x) => x.qty > 0));
}
export function removeItem(id: string) { save(getCart().filter((x) => x.offer_id !== id)); }
export function clearCart() { save([]); }
export function cartCount() { return getCart().reduce((n, x) => n + x.qty, 0); }
export function cartTotal() { return getCart().reduce((s, x) => s + x.price * x.qty, 0); }

// hook: re-render przy zmianie koszyka
export function useCart() {
  const [c, setC] = useState<CartItem[]>(getCart());
  useEffect(() => {
    const h = () => setC(getCart());
    window.addEventListener("cart-changed", h);
    return () => window.removeEventListener("cart-changed", h);
  }, []);
  return c;
}
