# PolZoo przez Base.com

Przepływ katalogu:

1. PolZoo akceptuje połączenie w Base Connect.
2. Produkty są importowane do osobnego magazynu Base, najlepiej `PolZoo – Sunrise Market`.
3. Funkcja `base-polzoo-sync` odczytuje produkty przez API Base i zapisuje je idempotentnie w `market.offers`.
4. Nowe produkty trafiają domyślnie jako `draft`. Publikacja wymaga jawnego `activate: true` oraz dodatniej `markup_percent`.

## Sekrety Supabase

- `BASE_API_TOKEN` — token Base z prawem odczytu katalogu.
- `BRIDGE_INTERNAL_TOKEN` — istniejący sekret do wywołań technicznych.
- `BASE_POLZOO_INVENTORY_ID` — opcjonalny identyfikator magazynu; wymagany, gdy w Base jest więcej magazynów i żaden nie zawiera `PolZoo` w nazwie.
- `BASE_POLZOO_PRICE_GROUP_ID` — opcjonalna grupa cen.
- `BASE_POLZOO_WAREHOUSE_ID` — opcjonalny magazyn stanów.
- `POLZOO_MARKUP_PERCENT` — domyślnie `0`; ustawienie dodatniej wartości pozwala jawnie aktywować oferty.

## Uruchomienie

Najpierw test połączenia:

```json
{"action":"probe"}
```

Bezpieczny import do szkiców (pierwsza strona):

```json
{"action":"sync","max_pages":1}
```

Import większej partii do szkiców:

```json
{"action":"sync","max_pages":20}
```

Aktywacja jest osobną decyzją biznesową i wymaga dodatniej marży:

```json
{"action":"sync","max_pages":20,"markup_percent":25,"activate":true}
```

Każde wywołanie musi być autoryzowane JWT operatora albo nagłówkiem `x-bridge-token`.
