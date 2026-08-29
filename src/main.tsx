import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Sso from "./pages/Sso";
import MarketEnhanced from "./pages/MarketEnhanced";
import MarketSmartFilterDock from "./components/MarketSmartFilterDock";
import CategoryPortal from "./pages/CategoryPortal";
import Portfel from "./pages/Portfel";
import Rozliczenia from "./pages/Rozliczenia";
import Sprzedawca from "./pages/Sprzedawca";
import SprzedawcaStart from "./pages/SprzedawcaStart";
import SprzedawcaWystaw from "./pages/SprzedawcaWystaw";
import SellerLeads from "./pages/SellerLeads";
import Login from "./pages/Login";
import ProductRouter from "./pages/ProductRouter";
import AdvancedSearch from "./pages/AdvancedSearch";
import Koszyk from "./pages/Koszyk";
import Zamowienia from "./pages/Zamowienia";
import Cennik from "./pages/Cennik";
import Operator from "./pages/Operator";
import Konto from "./pages/Konto";
import { initTheme } from "./lib/theme";
import "./index.css";

initTheme();
try { const _r = new URLSearchParams(window.location.search).get("ref"); if (_r && _r.trim()) localStorage.setItem("sunrise_ref", _r.trim().slice(0, 64)); } catch { /* ignore */ }

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<><MarketEnhanced /><MarketSmartFilterDock /></>} />
        <Route path="/motoryzacja" element={<CategoryPortal mode="car" />} />
        <Route path="/nieruchomosci" element={<CategoryPortal mode="property" />} />
        <Route path="/szukaj" element={<AdvancedSearch />} />
        <Route path="/login" element={<Login />} />
        <Route path="/sso" element={<Sso />} />
        <Route path="/produkt/:id" element={<ProductRouter />} />
        <Route path="/koszyk" element={<Koszyk />} />
        <Route path="/zamowienia" element={<Zamowienia />} />
        <Route path="/cennik" element={<Cennik />} />
        <Route path="/operator" element={<Operator />} />
        <Route path="/portfel" element={<Portfel />} />
        <Route path="/konto" element={<Konto />} />
        <Route path="/sprzedawca" element={<SprzedawcaStart />} />
        <Route path="/sprzedawca/wystaw" element={<SprzedawcaWystaw />} />
        <Route path="/sprzedawca/zapytania" element={<SellerLeads />} />
        <Route path="/sprzedawca-klasyczny" element={<Sprzedawca />} />
        <Route path="/sprzedawca/rozliczenia" element={<Rozliczenia />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
