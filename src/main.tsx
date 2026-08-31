import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Sso from "./pages/Sso";
import MarketEnhanced from "./pages/MarketEnhanced";
import CategoryPortal from "./pages/CategoryPortal";
import Portfel from "./pages/Portfel";
import Rozliczenia from "./pages/Rozliczenia";
import Sprzedawca from "./pages/Sprzedawca";
import SprzedawcaStart from "./pages/SprzedawcaStart";
import SprzedawcaWystaw from "./pages/SprzedawcaWystaw";
import SellerOffersManage from "./pages/SellerOffersManage";
import SellerOfferEdit from "./pages/SellerOfferEdit";
import SellerBookingsManage from "./pages/SellerBookingsManage";
import SellerBookingSetup from "./pages/SellerBookingSetup";
import SellerResourceSchedules from "./pages/SellerResourceSchedules";
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
import Konto from "./pages/Konto";
import Rezerwacje from "./pages/Rezerwacje";
import PwaInstallPrompt from "./components/PwaInstallPrompt";
import MobileAppNav from "./components/MobileAppNav";
import { initTheme } from "./lib/theme";
import "./index.css";

initTheme();
try { const _r = new URLSearchParams(window.location.search).get("ref"); if (_r && _r.trim()) localStorage.setItem("sunrise_ref", _r.trim().slice(0, 64)); } catch { /* ignore */ }

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
      await reg.update();
    } catch { /* PWA remains optional */ }
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
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
        <Route path="/portfel" element={<Portfel />} />
        <Route path="/konto" element={<Konto />} />
        <Route path="/sprzedawca" element={<SprzedawcaStart />} />
        <Route path="/sprzedawca/oferty" element={<SellerOffersManage />} />
        <Route path="/sprzedawca/oferty/:offerId/edytuj" element={<SellerOfferEdit />} />
        <Route path="/sprzedawca/rezerwacje" element={<SellerBookingsManage />} />
        <Route path="/sprzedawca/rezerwacje/grafiki" element={<SellerResourceSchedules />} />
        <Route path="/sprzedawca/rezerwacje/ustawienia/:offerId" element={<SellerBookingSetup />} />
        <Route path="/sprzedawca/wystaw" element={<SprzedawcaWystaw />} />
        <Route path="/sprzedawca/zapytania" element={<SellerLeads />} />
        <Route path="/potwierdz-zakup/:token" element={<SaleConfirmation />} />
        <Route path="/sprzedawca-klasyczny" element={<Sprzedawca />} />
        <Route path="/sprzedawca/rozliczenia" element={<Rozliczenia />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <MobileAppNav />
      <PwaInstallPrompt />
    </BrowserRouter>
  </React.StrictMode>,
);