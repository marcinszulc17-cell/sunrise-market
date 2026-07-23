export default function FamilyClubBanner({ slim = false }: { slim?: boolean }) {
  return (
    <a href="/konto" className="block rounded-2xl overflow-hidden"
       style={{ background: "linear-gradient(120deg, rgba(200,150,90,.22), rgba(200,150,90,.04) 60%), linear-gradient(135deg,#16223C,#0E1729)", border: "1px solid rgba(200,150,90,.45)", boxShadow: "0 14px 38px -20px rgba(0,0,0,.6)" }}>
      <div className={`flex items-center gap-4 ${slim ? "px-4 py-3" : "px-5 py-4"}`}>
        <div className="shrink-0 grid place-items-center rounded-xl"
             style={{ width: slim ? 40 : 54, height: slim ? 40 : 54, background: "linear-gradient(135deg,#E8C896,#C8965A)", color: "#241606", fontSize: slim ? 22 : 30 }}>☀</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold tracking-wide" style={{ color: "#E8C896", fontSize: slim ? 14 : 16 }}>SUNRISE FAMILY CLUB</div>
          <div style={{ color: "rgba(237,231,214,.82)", fontSize: slim ? 12 : 13.5, lineHeight: 1.4 }}>
            <b style={{ color: "#EDE7D6" }}>Cashback 3%</b> od każdego zakupu · <b style={{ color: "#EDE7D6" }}>5–22% za polecenia</b> marek własnych{slim ? "." : " · punkty wymieniasz na złotówki w portfelu Sunrise Pay."}
          </div>
        </div>
        <span className={`shrink-0 font-semibold rounded-xl ${slim ? "text-xs px-3 py-1.5" : "text-sm px-4 py-2"} hidden sm:block`}
              style={{ background: "linear-gradient(135deg,#E8C896,#C8965A)", color: "#241606" }}>Dołącz →</span>
      </div>
    </a>
  );
}
