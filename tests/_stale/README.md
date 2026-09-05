# Testy nieaktualne (2026-09-06)

Te pliki sprawdzały tekst źródłowy starych implementacji (asercje na poziomie pliku, bez `test()`),
które zostały celowo przebudowane. Nie są uruchamiane przez `npm test` (glob `tests/*.test.mjs`).
Do przepisania na testy zachowania albo usunięcia po przeglądzie właściciela.

W plikach `tests/*.test.mjs` pojedyncze nieaktualne przypadki są oznaczone `{ skip: 'nieaktualny — …' }`
zamiast usunięcia — lista jest widoczna w wyniku `npm test` jako `# skipped`.
