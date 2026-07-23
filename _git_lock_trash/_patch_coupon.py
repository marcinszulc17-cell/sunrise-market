#!/usr/bin/env python3
import io, sys, os
ROOT = sys.argv[1]
def patch(path, edits):
    p = os.path.join(ROOT, path); s = io.open(p, encoding="utf-8").read()
    for old, new in edits:
        assert s.count(old) == 1, f"{path}: {old[:44]!r} -> {s.count(old)}"
        s = s.replace(old, new)
    io.open(p, "w", encoding="utf-8").write(s); print("patched", path)

patch("src/lib/api.ts", [(
'''export async function checkout(items: { offer_id: string; qty: number }[], shippingCodes?: string[], shipping?: ShipAddress) {
  const { data, error } = await supabase.functions.invoke("checkout", { body: { items, shipping_codes: shippingCodes ?? [], shipping: shipping ?? null } });
  if (error) throw error;
  return data;
}''',
'''export async function checkout(items: { offer_id: string; qty: number }[], shippingCodes?: string[], shipping?: ShipAddress, coupon?: string) {
  const { data, error } = await supabase.functions.invoke("checkout", { body: { items, shipping_codes: shippingCodes ?? [], shipping: shipping ?? null, coupon: coupon ?? null } });
  if (error) throw error;
  return data;
}
export type CouponCheck = { valid: boolean; discount: number; code?: string; message: string };
export async function validateCoupon(code: string, subtotal: number): Promise<CouponCheck> {
  const { data, error } = await supabase.rpc("validate_coupon", { p_code: code, p_subtotal: subtotal });
  if (error || !data) return { valid: false, discount: 0, message: "Błąd walidacji kodu" };
  return data as CouponCheck;
}''')])

patch("src/lib/checkoutIntent.ts", [(
'  topup: number; // kwota doładowania zainicjowana',
'  topup: number; // kwota doładowania zainicjowana\n  coupon?: string; // opcjonalny kod rabatowy')])

patch("src/pages/Koszyk.tsx", [
('import { checkout, walletBalance, listShippingLanes, cartLanes, recommendedOffers, similarOffers, smartStatus, smartSubscribe, type ShipMethod, type CartLane, type ShipAddress } from "../lib/api";',
 'import { checkout, validateCoupon, walletBalance, listShippingLanes, cartLanes, recommendedOffers, similarOffers, smartStatus, smartSubscribe, type ShipMethod, type CartLane, type ShipAddress, type CouponCheck } from "../lib/api";'),
('  const [topupAmount, setTopupAmount] = useState<string>(""); // kwota w polu inline doładowania',
 '  const [topupAmount, setTopupAmount] = useState<string>(""); // kwota w polu inline doładowania\n  const [coupon, setCoupon] = useState("");\n  const [couponRes, setCouponRes] = useState<CouponCheck | null>(null);'),
('''  const shipCost = freeShip ? 0 : rawShip;
  const grand = total + shipCost;''',
'''  const shipCost = freeShip ? 0 : rawShip;
  const discount = couponRes?.valid ? Math.min(Number(couponRes.discount || 0), total) : 0;
  const grand = Math.max(0, total + shipCost - discount);'''),
('''  async function runCheckout(useAddr: ShipAddress, useCodes: string[]) {
    setBusy(true); setMsg(null);
    try {
      const res = await checkout(cart.map((i) => ({ offer_id: i.offer_id, qty: i.qty })), useCodes, useAddr);''',
'''  async function applyCoupon() {
    const code = coupon.trim();
    if (!code) { setCouponRes(null); return; }
    setCouponRes(await validateCoupon(code, total));
  }

  async function runCheckout(useAddr: ShipAddress, useCodes: string[], useCoupon?: string) {
    setBusy(true); setMsg(null);
    try {
      const cCode = useCoupon ?? (couponRes?.valid ? couponRes.code : undefined);
      const res = await checkout(cart.map((i) => ({ offer_id: i.offer_id, qty: i.qty })), useCodes, useAddr, cCode);'''),
('    saveIntent({ addr, shippingCodes: selectedCodes, grand, topup: amount });',
 '    saveIntent({ addr, shippingCodes: selectedCodes, grand, topup: amount, coupon: couponRes?.valid ? couponRes.code : undefined });'),
('          await runCheckout(intent.addr, intent.shippingCodes);',
 '          await runCheckout(intent.addr, intent.shippingCodes, intent.coupon);'),
('              <div className="flex justify-between mb-2 mt-1"><span style={{ color: "var(--mut)" }}>Razem</span><span className="font-display text-2xl font-semibold">{zl(grand)}</span></div>',
'''              {discount > 0 && (
                <div className="flex justify-between text-sm mb-1" style={{ color: "var(--green)" }}>
                  <span>Rabat ({couponRes?.code})</span><span>−{zl(discount)}</span>
                </div>
              )}
              <div className="flex gap-2 my-2">
                <input value={coupon} onChange={(e) => setCoupon(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyCoupon()} placeholder="Kod rabatowy"
                       className="flex-1 rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }} />
                <button onClick={applyCoupon} className="px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }}>Zastosuj</button>
              </div>
              {couponRes && !couponRes.valid && <div className="text-xs mb-2" style={{ color: "#F25CB0" }}>{couponRes.message}</div>}
              <div className="flex justify-between mb-2 mt-1"><span style={{ color: "var(--mut)" }}>Razem</span><span className="font-display text-2xl font-semibold">{zl(grand)}</span></div>'''),
])
print("ALL OK")
