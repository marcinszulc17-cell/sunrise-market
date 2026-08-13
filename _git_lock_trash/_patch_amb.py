#!/usr/bin/env python3
import io, sys, os
ROOT = sys.argv[1]
def patch(path, edits):
    p = os.path.join(ROOT, path)
    s = io.open(p, encoding="utf-8").read()
    for old, new in edits:
        assert s.count(old) == 1, f"{path}: expected 1 of <<{old[:52]}>> got {s.count(old)}"
        s = s.replace(old, new)
    io.open(p, "w", encoding="utf-8").write(s)
    print("patched", path)

# ---- api.ts: memberStatus() ----
patch("src/lib/api.ts", [(
'''export async function walletBalance(): Promise<WalletLive> {
  const { data, error } = await supabase.functions.invoke("wallet-balance", { body: {} });
  if (error || !data) return { linked: false, balance: 0, points: 0, gold: null, currency: "PLN" };
  return data as WalletLive;
}''',
'''export async function walletBalance(): Promise<WalletLive> {
  const { data, error } = await supabase.functions.invoke("wallet-balance", { body: {} });
  if (error || !data) return { linked: false, balance: 0, points: 0, gold: null, currency: "PLN" };
  return data as WalletLive;
}
// Program lojalnościowy użytkownika: Family Club (klient) vs Ambassador Club (MLM).
// Wykluczają się — ambassador (aktywny w MySunrise) ma Ambassador Club zamiast Family Club.
export type MemberStatus = { club: "family" | "ambassador"; ambassador: boolean; tier?: string; status?: string | null; referral_code?: string; pearls?: number; referrals?: number; commissions_pln?: number; turnover_pln?: number };
export async function memberStatus(): Promise<MemberStatus> {
  const { data, error } = await supabase.functions.invoke("member-status", { body: {} });
  if (error || !data) return { club: "family", ambassador: false };
  return data as MemberStatus;
}''')])

# ---- Konto.tsx ----
patch("src/pages/Konto.tsx", [
 ('energyReferral, type WalletLive, type EnergyReferral } from "../lib/api";',
  'energyReferral, memberStatus, type WalletLive, type EnergyReferral, type MemberStatus } from "../lib/api";'),
 ('  const [w, setW] = useState<WalletLive | null>(null);',
  '  const [w, setW] = useState<WalletLive | null>(null);\n  const [ms, setMs] = useState<MemberStatus | null>(null);'),
 ('      try { setIsOp(await amiOperator()); } catch { /* ignore */ }',
  '      try { setIsOp(await amiOperator()); } catch { /* ignore */ }\n      try { setMs(await memberStatus()); } catch { /* ignore */ }'),
 ('{authed && tab === "przeglad" && <Przeglad w={w} seller={seller} isOp={isOp} onLogout={logout} goTab={setTab} />}',
  '{authed && tab === "przeglad" && <Przeglad w={w} ms={ms} seller={seller} isOp={isOp} onLogout={logout} goTab={setTab} />}'),
 ('function Przeglad({ w, seller, isOp, onLogout, goTab }: { w: WalletLive | null; seller: any; isOp: boolean; onLogout: () => void; goTab: (t: Tab) => void }) {',
  'function Przeglad({ w, ms, seller, isOp, onLogout, goTab }: { w: WalletLive | null; ms: MemberStatus | null; seller: any; isOp: boolean; onLogout: () => void; goTab: (t: Tab) => void }) {'),
 ('      <FamilyClub w={w} goTab={goTab} />',
  '      {ms?.ambassador ? <AmbassadorClub w={w} ms={ms} goTab={goTab} /> : <FamilyClub w={w} goTab={goTab} />}'),
 ('function PolecajPV() {',
  '''function AmbassadorClub({ w, ms, goTab }: { w: WalletLive | null; ms: MemberStatus; goTab: (t: Tab) => void }) {
  const tierLabel: Record<string, string> = { ambassador: "Ambassador", silver: "Silver", gold: "Gold", platinum: "Platinum", diamond: "Diamond" };
  const box = { background: "rgba(232,200,150,.08)", borderRadius: 14, padding: "12px 15px", border: "1px solid rgba(232,200,150,.14)" } as const;
  const chip = { fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 999 } as const;
  return (
    <div style={{ background: "linear-gradient(140deg,#1a1206,#2a1c08 42%,#0E1729)", border: "1px solid rgba(232,200,150,.42)", borderRadius: 20, padding: 22, color: "#EDE7D6", boxShadow: "0 22px 48px -24px rgba(0,0,0,.85)" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div style={{ width: 44, height: 44, borderRadius: 13, background: "linear-gradient(135deg,#E8C896,#C8965A)", display: "grid", placeItems: "center", fontSize: 22, color: "#241606" }}>★</div>
          <div>
            <div style={{ fontWeight: 800, letterSpacing: ".12em", fontSize: 15 }}>SUNRISE <span style={{ color: "#E8C896" }}>AMBASSADOR CLUB</span></div>
            <div style={{ fontSize: 12.5, color: "rgba(237,231,214,.62)" }}>Twój program partnerski · poziom {tierLabel[ms.tier ?? "ambassador"] ?? ms.tier}</div>
          </div>
        </div>
        <a href="https://mysunrise.com.pl" target="_blank" rel="noopener" style={{ fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 10, background: "rgba(232,200,150,.14)", border: "1px solid rgba(232,200,150,.35)", color: "#E8C896" }}>Panel ambasadora →</a>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-4">
        <div style={box}><div style={{ fontSize: 12, color: "rgba(237,231,214,.6)" }}>Portfel Sunrise Pay</div><div style={{ fontSize: 24, fontWeight: 800, color: "#E8C896" }}>{zl(w?.balance ?? 0)}</div></div>
        <div style={box}><div style={{ fontSize: 12, color: "rgba(237,231,214,.6)" }}>Prowizje MLM</div><div style={{ fontSize: 24, fontWeight: 800, color: "#9BC7AE" }}>{zl(ms.commissions_pln ?? 0)}</div></div>
        <div style={box}><div style={{ fontSize: 12, color: "rgba(237,231,214,.6)" }}>Polecenia</div><div style={{ fontSize: 24, fontWeight: 800 }}>{ms.referrals ?? 0}</div></div>
        <div style={box}><div style={{ fontSize: 12, color: "rgba(237,231,214,.6)" }}>Perły</div><div style={{ fontSize: 24, fontWeight: 800 }}>{ms.pearls ?? 0}</div></div>
      </div>
      <div className="flex gap-2 mt-3 flex-wrap items-center">
        {ms.referral_code && <span style={{ ...chip, background: "rgba(232,200,150,.16)", color: "#E8C896", border: "1px solid rgba(232,200,150,.3)" }}>Kod polecający: <b>{ms.referral_code}</b></span>}
        <span style={{ ...chip, background: "rgba(122,184,154,.16)", color: "#9BC7AE", border: "1px solid rgba(122,184,154,.3)" }}>Prowizje partnerskie zamiast cashbacku</span>
        <button onClick={() => goTab("portfel")} style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, padding: "8px 16px", borderRadius: 11, background: "linear-gradient(135deg,#E8C896,#C8965A)", color: "#241606", border: 0, cursor: "pointer" }}>Portfel / historia</button>
      </div>
    </div>
  );
}

function PolecajPV() {'''),
])
print("ALL OK")
