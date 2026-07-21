import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Inicio from "./components/Login/Inicio";
import AppLayout from "./components/Layout/AppLayout";
import Socios from "./components/Socios/Socios";
import Familias from "./components/Socios/Familias/Familias";
import Cuotas from "./components/Cuotas/Cuotas";
import Categorias from "./components/Categorias/Categorias";
import Configuracion from "./components/Configuracion/Configuracion";
import Contable from "./components/Contable/Contable";
import { isAuthenticated } from "./components/Global/auth/session";

function ProtectedLayout() {
  return isAuthenticated() ? <AppLayout /> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={isAuthenticated() ? <Navigate to="/socios" replace /> : <Inicio />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/panel" element={<Navigate to="/socios" replace />} />
          <Route path="/socios" element={<Socios />} />
          <Route path="/socios/familias" element={<Familias />} />
          <Route path="/cuotas" element={<Cuotas />} />
          <Route path="/categorias" element={<Categorias />} />
          <Route path="/contable" element={<Contable />} />
          <Route path="/contable/ingresos" element={<Contable />} />
          <Route path="/contable/egresos" element={<Contable />} />
          <Route path="/configuracion" element={<Configuracion />} />
        </Route>
        <Route path="*" element={<Navigate to="/socios" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
