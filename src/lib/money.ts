// Formatowanie kwot — jedno miejsce prawdy.
// Wcześniej każda strona miała const zl = (v)=>Math.round(v)... czyli kwoty
// zaokrąglane DO PEŁNYCH ZŁOTYCH. Na ścieżce płatności klient widział
// „Do zapłaty: 150 zł" i „Saldo: 150 zł", a zakup był odrzucany, bo naprawdę
// miał 149,55 przy koszyku 149,60. Pieniędzy nie zaokrąglamy do wyświetlania.

/** Kwota w złotówkach, zawsze z groszami: 149.6 → „149,60 zł" */
export const zl = (v: number | null | undefined): string =>
  new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v ?? 0));

/** Punkty cashbacku (1 pkt = 1 zł, osobne saldo). Bywają ułamkowe (3% z 149,60 = 4,49) — nie zaokrąglamy. */
export const pkt = (v: number | null | undefined): string =>
  new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v ?? 0));
