import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Market from "./pages/Market";
import Portfel from "./pages/Portfel";
import Rozliczenia from "./pages/Rozliczenia";
import Sprzedawca from "./pages/Sprzedawca";
import Login from "./pages/Login";
import Product from "./pages/Product";
import Koszyk from "./pages/Koszyk";
import Zamowienia from "./pages/Zamowienia";
import Cennik from "./pages/Cennik";
import Operator from "./pages/Operator";
import Konto from "./pages/Konto";
import { initTheme } from "./lib/theme";
import "./index.css";

initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Market />} />
        <Route path="/login" element={<Login />} />
        <Route path="/produkt/:id" element={<Product />} />
        <Route path="/koszyk" element={<Koszyk />} />
        <Route path="/zamowienia" element={<Zamowienia />} />
        <Route path="/cennik" element={<Cennik />} />
        <Route path="/operator" element={<Operator />} />
        <Route path="/portfel" element={<Portfel />} />
        <Route path="/konto" element={<Konto />} />
        <Route path="/sprzedawca" element={<Sprzedawca />} />
        <Route path="/sprzedawca/rozliczenia" element={<Rozliczenia />} />
        {/* Daniel dodaje kolejne trasy: /produkt/:id, /sprzedawca, /operator */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
