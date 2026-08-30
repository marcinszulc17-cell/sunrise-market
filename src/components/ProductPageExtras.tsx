export default function ProductPageExtras({verifyKind}:{verifyKind:"vehicle"|"property"|null}){
  return <section className="mx-auto max-w-7xl px-4 pb-4">
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-2xl p-5" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>
        <div className="text-2xl">🛡️</div>
        <div className="mt-3 font-semibold">Bezpieczniejsza decyzja</div>
        <p className="mt-2 text-sm leading-6" style={{color:"var(--mut)"}}>{verifyKind==="vehicle"?"Przed zakupem możesz zamówić Sunrise Verify i dodatkowo sprawdzić dane pojazdu oraz informacje dostępne z podłączonych źródeł.":verifyKind==="property"?"Przed zakupem możesz zamówić Sunrise Verify i zlecić dodatkową analizę danych nieruchomości.":"Płatność, historia zamówień i kontakt ze sprzedawcą są obsługiwane w jednym ekosystemie Sunrise Market."}</p>
      </div>
      <div className="rounded-2xl p-5" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>
        <div className="text-2xl">💳</div>
        <div className="mt-3 font-semibold">Płatność i cashback</div>
        <p className="mt-2 text-sm leading-6" style={{color:"var(--mut)"}}>Przy kwalifikujących się zakupach cashback jest naliczany w ekosystemie MySunrise. Szczegóły widzisz przy cenie konkretnej oferty.</p>
      </div>
      <div className="rounded-2xl p-5" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>
        <div className="text-2xl">🤝</div>
        <div className="mt-3 font-semibold">Wsparcie przed i po zakupie</div>
        <p className="mt-2 text-sm leading-6" style={{color:"var(--mut)"}}>Możesz skontaktować się ze sprzedawcą, umówić termin, obserwować ofertę, porównać ją z innymi i wrócić do historii zamówienia z poziomu swojego konta.</p>
      </div>
    </div>
    <div className="mt-6 rounded-3xl p-6 sm:p-7" style={{background:"linear-gradient(135deg,rgba(200,150,90,.12),rgba(56,224,240,.07))",border:"1px solid rgba(200,150,90,.24)"}}>
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <div className="text-xs font-semibold tracking-[.16em]" style={{color:"var(--gold)"}}>SUNRISE MARKET</div>
          <h2 className="mt-2 text-2xl font-semibold">Więcej niż zwykłe ogłoszenie</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6" style={{color:"var(--mut)"}}>Zakup, rezerwacja, kontakt ze sprzedawcą, cashback, porównanie ofert i narzędzia weryfikacyjne są połączone w jednym procesie. Dzięki temu klient nie musi przenosić rozmowy i obsługi zakupu między kilkoma serwisami.</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <a href="/szukaj" className="rounded-xl px-4 py-2 text-sm font-semibold" style={{border:"1px solid var(--line)"}}>Zobacz inne oferty</a>
          <a href="/konto" className="rounded-xl px-4 py-2 text-sm font-semibold text-black" style={{background:"linear-gradient(135deg,#C8965A,#E8C896)"}}>Moje konto</a>
        </div>
      </div>
    </div>
  </section>;
}
