import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Sso from "./pages/Sso";
import MarketEnhanced from "./pages/MarketEnhanced";
import CategoryPortal from "./pages/CategoryPortal";
import Portfel from "./pages/Portfel";
import Rozliczenia from "./pages/Rozliczenia";
import LegacySellerGate from "./pages/LegacySellerGate";
import SellerHome from "./pages/SellerHome";
import SellerJoin from "./pages/SellerJoin";
import SprzedawcaWystaw from "./pages/SprzedawcaWystaw";
import TradePartnerActivate from "./pages/TradePartnerActivate";
import PartnerDashboard from "./pages/PartnerDashboard";
import SellerOffersRouter from "./pages/SellerOffersRouter";
import SellerOfferEdit from "./pages/SellerOfferEdit";
import SellerOrdersRouter from "./pages/SellerOrdersRouter";
import SellerBookingsManage from "./pages/SellerBookingsManage";
import SellerBookingSetup from "./pages/SellerBookingSetup";
import SellerResourceSchedules from "./pages/SellerResourceSchedules";
import SellerResourceOperationsPage from "./pages/SellerResourceOperationsPage";
import SellerLeads from "./pages/SellerLeads";
import SellerReviews from "./pages/SellerReviews";
import SellerPickup from "./pages/SellerPickup";
import Obserwowane from "./pages/Obserwowane";
import Start from "./pages/Start";
import Home from "./pages/Home";
import SellerProfile from "./pages/SellerProfile";
import SaleConfirmation from "./pages/SaleConfirmation";
import VerifyRequest from "./pages/VerifyRequest";
import Login from "./pages/Login";
import ProductRouter from "./pages/ProductRouter";
import AdvancedSearchUniversal from "./pages/AdvancedSearchUniversal";
import Compare from "./pages/Compare";
import Koszyk from "./pages/Koszyk";
import Zamowienia from "./pages/Zamowienia";
import Cennik from "./pages/Cennik";
import Operator from "./pages/Operator";
import OperatorVerify from "./pages/OperatorVerify";
import OperatorBookingRefundExceptions from "./pages/OperatorBookingRefundExceptions";
import Konto from "./pages/Konto";
import Rezerwacje from "./pages/Rezerwacje";
import PwaInstallPrompt from "./components/PwaInstallPrompt";
import MobileAppNav from "./components/MobileAppNav";
import SellerTopBar from "./components/SellerTopBar";
import { supabase } from "./lib/supabase";
import { initTheme } from "./lib/theme";
import { startMarketBookingAvailability } from "./lib/marketBookingAvailability";
import { startMarketAvailabilityFilter } from "./lib/marketAvailabilityFilter";
import { startQuickBookingDeepLink } from "./lib/quickBookingDeepLink";
import { startSellerResourceOperationalStatus } from "./lib/sellerResourceOperationalStatus";
import { startSellerResourceOperationsNav } from "./lib/sellerResourceOperationsNav";
import "./index.css";

initTheme();
startMarketBookingAvailability();
startMarketAvailabilityFilter();
startQuickBookingDeepLink();
startSellerResourceOperationalStatus();
startSellerResourceOperationsNav();
try { const _r = new URLSearchParams(window.location.search).get("ref"); if (_r && _r.trim()) localStorage.setItem("sunrise_ref", _r.trim().slice(0, 64)); } catch { /* ignore */ }

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try { const reg = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }); await reg.update(); } catch { /* optional */ }
  });
}

const NOINDEX_PREFIXES = ["/sprzedawca", "/operator", "/konto", "/portfel", "/koszyk", "/zamowienia", "/rezerwacje", "/login", "/sso", "/verify", "/potwierdz-zakup", "/szukaj", "/porownaj"];

function RouteMeta() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    const noindex = NOINDEX_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]') ?? document.head.appendChild(document.createElement("meta"));
    robots.setAttribute("name", "robots");
    robots.setAttribute("content", noindex ? "noindex, nofollow" : "index, follow");
    const cleanPath = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
    const canonicalUrl = `https://sunrisemarket.pl${cleanPath}`;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]') ?? document.head.appendChild(document.createElement("link"));
    canonical.setAttribute("rel", "canonical");
    canonical.setAttribute("href", canonicalUrl);
    const ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute("content", canonicalUrl);
  }, [pathname]);
  return null;
}

function RootEntry() {
  const isAppDomain = window.location.hostname.toLowerCase() === "app.sunrisemarket.pl";
  const [state, setState] = React.useState<"loading" | "authed" | "guest">(isAppDomain ? "loading" : "authed");
  React.useEffect(() => {
    if (!isAppDomain) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) setState(data.session ? "authed" : "guest"); }).catch(() => { if (alive) setState("guest"); });
    return () => { alive = false; };
  }, [isAppDomain]);
  // Ekran startowy „hub” na telefonie (≤ 640 px) i w aplikacji; duży ekran sunrisemarket.pl zostaje przy pełnej stronie głównej.
  const [narrow, setNarrow] = React.useState(() => window.matchMedia("(max-width: 640px)").matches);
  React.useEffect(() => { const mq = window.matchMedia("(max-width: 640px)"); const on = () => setNarrow(mq.matches); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, []);
  // Duży ekran sunrisemarket.pl: premium strona główna (Home); wyszukiwanie ?q= z zewnątrz trafia do pełnego katalogu.
  const sp = new URLSearchParams(window.location.search); const hasQuery = !!(sp.get("q") || sp.get("dzial"));
  if (!isAppDomain) return narrow ? <Start /> : hasQuery ? <MarketEnhanced /> : <Home />;
  if (state === "guest") return <Login />;
  if (state === "loading") return <main className="min-h-[100dvh] grid place-items-center" style={{ background: "#080c12", color: "#EDE7D6" }}><div className="text-center"><img src="/logo-sunrise-market-light.png" alt="Sunrise Market" className="mx-auto h-14 w-auto" /><div className="mt-4 text-sm" style={{ color: "var(--mut)" }}>Uruchamiam Sunrise Market…</div></div></main>;
  return narrow ? <Start /> : hasQuery ? <MarketEnhanced /> : <Home />;
}

function SellerChrome() {
  const { pathname } = useLocation();
  const sellerArea = pathname === "/sprzedawca" || pathname.startsWith("/sprzedawca/");
  if (!sellerArea) return null;
  return <SellerTopBar />;
}

function AppChrome() {
  const { pathname } = useLocation();
  const isAppDomain = window.location.hostname.toLowerCase() === "app.sunrisemarket.pl";
  // Na app.* korzeń pokazuje ekran logowania TYLKO gościowi. Zalogowany widzi tam sklep,
  // więc pasek menu musi być widoczny — wcześniej znikał dla wszystkich na "/".
  const [authed, setAuthed] = React.useState<boolean | null>(isAppDomain ? null : true);
  React.useEffect(() => {
    if (!isAppDomain) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) setAuthed(!!data.session); }).catch(() => { if (alive) setAuthed(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { if (alive) setAuthed(!!session); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [isAppDomain]);
  const authScreen = pathname === "/login" || pathname === "/sso" || (pathname === "/" && isAppDomain && authed !== true);
  if (authScreen) return null;
  return <><MobileAppNav /><PwaInstallPrompt /></>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><BrowserRouter><RouteMeta /><SellerChrome /><Routes>
    <Route path="/" element={<RootEntry />} /><Route path="/sklep" element={<MarketEnhanced />} /><Route path="/motoryzacja" element={<CategoryPortal mode="car" />} /><Route path="/nieruchomosci" element={<CategoryPortal mode="property" />} /><Route path="/szukaj" element={<AdvancedSearchUniversal />} /><Route path="/porownaj" element={<Compare />} /><Route path="/obserwowane" element={<Obserwowane />} /><Route path="/login" element={<Login />} /><Route path="/sso" element={<Sso />} /><Route path="/produkt/:id" element={<ProductRouter />} /><Route path="/verify/:id" element={<VerifyRequest />} /><Route path="/koszyk" element={<Koszyk />} /><Route path="/zamowienia" element={<Zamowienia />} /><Route path="/rezerwacje" element={<Rezerwacje />} /><Route path="/cennik" element={<Cennik />} /><Route path="/operator" element={<Operator />} /><Route path="/operator/verify" element={<OperatorVerify />} /><Route path="/operator/refundy-rezerwacji" element={<OperatorBookingRefundExceptions />} /><Route path="/portfel" element={<Portfel />} /><Route path="/konto" element={<Konto />} /><Route path="/sprzedawca" element={<SellerHome />} /><Route path="/sprzedawca/dolacz" element={<SellerJoin />} /><Route path="/sprzedawca/partner" element={<TradePartnerActivate />} /><Route path="/sprzedawca/partner/pulpit" element={<PartnerDashboard />} /><Route path="/sprzedawca/oferty" element={<SellerOffersRouter />} /><Route path="/sprzedawca/oferty/:offerId/edytuj" element={<SellerOfferEdit />} /><Route path="/sprzedawca/zamowienia" element={<SellerOrdersRouter />} /><Route path="/sprzedawca/rezerwacje" element={<SellerBookingsManage />} /><Route path="/sprzedawca/rezerwacje/operacje" element={<SellerResourceOperationsPage />} /><Route path="/sprzedawca/rezerwacje/grafiki" element={<SellerResourceSchedules />} /><Route path="/sprzedawca/rezerwacje/ustawienia/:offerId" element={<SellerBookingSetup />} /><Route path="/sprzedawca/wystaw" element={<SprzedawcaWystaw />} /><Route path="/sprzedawca/zapytania" element={<SellerLeads />} /><Route path="/sprzedawca/opinie" element={<SellerReviews />} /><Route path="/sprzedawca/odbior" element={<SellerPickup />} /><Route path="/sprzedawcy/:id" element={<SellerProfile />} /><Route path="/potwierdz-zakup/:token" element={<SaleConfirmation />} /><Route path="/sprzedawca-klasyczny" element={<LegacySellerGate />} /><Route path="/sprzedawca/rozliczenia" element={<Rozliczenia />} /><Route path="*" element={<Navigate to="/" replace />} />
  </Routes><AppChrome /></BrowserRouter></React.StrictMode>,
);
