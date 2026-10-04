// Jedyne zadanie: podmienić obsługę samego `/` na api/start.ts.
//
// DLACZEGO NIE WYSTARCZY `rewrites` W vercel.json
// Przepisania z vercel.json sprawdzane są DOPIERO wtedy, gdy w plikach statycznych
// nie ma dopasowania. `/` dopasowuje się do zbudowanego `index.html`, więc reguła
// `{"source": "/", "destination": "/api/start"}` nie miała szans zadziałać —
// wdrożenie przechodziło, a strona główna wyglądała identycznie. Pozostałe trasy
// (/oferta, /miasto, /feed.xml) działają właśnie dlatego, że nie istnieją jako pliki.
//
// Middleware chodzi przed systemem plików, więc to jedyne miejsce, z którego da się
// przechwycić stronę główną. Matcher trzyma go wyłącznie na `/`, więc żadne inne
// żądanie — zasoby, podstrony, API — go nie dotyka.
//
// To jest PRZEPISANIE, nie przekierowanie: adres w pasku zostaje `https://sunrisemarket.pl/`.
// Nagłówek `x-middleware-rewrite` to sposób, w jaki robi się to poza Next.js.
// Gdyby cokolwiek poszło nie tak, oddajemy pustą odpowiedź bez tego nagłówka —
// Vercel idzie wtedy dalej swoją zwykłą drogą i serwuje index.html. Strona główna
// nie ma prawa zgasnąć przez ten plik.
export const config = { matcher: "/" };

export default function middleware(req: Request) {
  try {
    const url = new URL(req.url);
    url.pathname = "/api/start";
    url.search = "";
    return new Response(null, { headers: { "x-middleware-rewrite": url.toString() } });
  } catch {
    return new Response(null);
  }
}
