export default function FamilyClubBanner({ slim = false }: { slim?: boolean }) {
  return (
    <a href="/konto" className="block rounded-2xl overflow-hidden"
       style={{ background: "linear-gradient(135deg, rgba(242,115,29,.16), rgba(224,162,27,.07)), var(--glass)", border: "1px solid rgba(224,162,27,.38)" }}>
      <div className={`flex items-center gap-4 ${slim ? "px-4 py-3" : "px-5 py-4"}`}>
        <div className="shrink-0 grid place-items-center rounded-xl"
             style={{ width: slim ? 40 : 54, height: slim ? 40 : 54, background: "rgba(255,210,63,.15)", fontSize: slim ? 22 : 30 }}>☀</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold tracking-wide" style={{ color: "#ffd23f", fontSize: slim ? 14 : 16 }}>SUNRISE FAMILY CLUB</div>
          <div style={{ color: "rgba(255,255,255,.85)", fontSize: slim ? 12 : 13.5, lineHeight: 1.4 }}>
            <b style={{ color: "#fff" }}>Cashback 3%</b> od każdego zakupu · <b style={{ color: "#fff" }}>5% za polecenia</b> marek własnych{slim ? "." : " · punkty wymieniasz na złotówki w portfelu Sunrise Pay."}
          </div>
        </div>
        <span className={`shrink-0 font-semibold rounded-xl text-black ${slim ? "text-xs px-3 py-1.5" : "text-sm px-4 py-2"} hidden sm:block`}
              style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>Dołącz →</span>
      </div>
    </a>
  );
}
