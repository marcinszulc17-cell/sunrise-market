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
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
      await reg.update();
    } catch { /* PWA remains optional */ }
  });
}

const NOINDEX_PREFIXES = [
  "/sprzedawca",
  "/operator",
  "/konto",
  "/portfel",
  "/koszyk",
  "/zamowienia",
  "/rezerwacje",
  "/login",
  "/sso",
  "/verify",
  "/potwierdz-zakup",
  "/szukaj",
  "/porownaj",
];

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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <RouteMeta />
      <Routes>
        <Route path="/" element={<MarketEnhanced />} />
        <Route path="/motoryzacja" element={<CategoryPortal mode="car" />} />
        <Route path="/nieruchomosci" element={<CategoryPortal mode="property" />} />
        <Route path="/szukaj" element={<AdvancedSearchUniversal />} />
        <Route path="/porownaj" element={<Compare />} />
        <Route path="/login" element={<Login />} />
        <Route path="/sso" element={<Sso />} />
        <Route path="/produkt/:id" element={<ProductRouter />} />
        <Route path="/verify/:id" element={<VerifyRequest />} />
        <Route path="/koszyk" element={<Koszyk />} />
        <Route path="/zamowienia" element={<Zamowienia />} />
        <Route path="/rezerwacje" element={<Rezerwacje />} />
        <Route path="/cennik" element={<Cennik />} />
        <Route path="/operator" element={<Operator />} />
        <Route path="/operator/verify" element={<OperatorVerify />} />
        <Route path="/operator/refundy-rezerwacji" element={<OperatorBookingRefundExceptions />} />
        <Route path="/portfel" element={<Portfel />} />
        <Route path="/konto" element={<Konto />} />
        <Route path="/sprzedawca" element={<SellerHome />} />
        <Route path="/sprzedawca/partner" element={<TradePartnerActivate />} />
        <Route path="/sprzedawca/partner/pulpit" element={<PartnerDashboard />} />
        <Route path="/sprzedawca/oferty" element={<SellerOffersRouter />} />
        <Route path="/sprzedawca/oferty/:offerId/edytuj" element={<SellerOfferEdit />} />
        <Route path="/sprzedawca/zamowienia" element={<SellerOrdersRouter />} />
        <Route path="/sprzedawca/rezerwacje" element={<SellerBookingsManage />} />
        <Route path="/sprzedawca/rezerwacje/operacje" element={<SellerResourceOperationsPage />} />
        <Route path="/sprzedawca/rezerwacje/grafiki" element={<SellerResourceSchedules />} />
        <Route path="/sprzedawca/rezerwacje/ustawienia/:offerId" element={<SellerBookingSetup />} />
        <Route path="/sprzedawca/wystaw" element={<SprzedawcaWystaw />} />
        <Route path="/sprzedawca/zapytania" element={<SellerLeads />} />
        <Route path="/potwierdz-zakup/:token" element={<SaleConfirmation />} />
        <Route path="/sprzedawca-klasyczny" element={<LegacySellerGate />} />
        <Route path="/sprzedawca/rozliczenia" element={<Rozliczenia />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <MobileAppNav />
      <PwaInstallPrompt />
    </BrowserRouter>
  </React.StrictMode>,
);
