import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Market from "./pages/Market";
import Portfel from "./pages/Portfel";
import Rozliczenia from "./pages/Rozliczenia";
import Login from "./pages/Login";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Market />} />
        <Route path="/login" element={<Login />} />
        <Route path="/portfel" element={<Portfel />} />
        <Route path="/sprzedawca/rozliczenia" element={<Rozliczenia />} />
        {/* Daniel dodaje kolejne trasy: /produkt/:id, /sprzedawca, /operator */}
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
