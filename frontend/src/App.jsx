import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PymeFilterProvider } from './context/PymeFilterContext';
import { NotificacionesProvider } from './context/NotificacionesContext';
import ProtectedRoute from './routes/ProtectedRoute';
import RequiereCapacidad from './routes/RequiereCapacidad';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import RecuperarPassword from './pages/RecuperarPassword';
import Dashboard from './pages/Dashboard';
import Pymes from './pages/Pymes';
import Inventario from './pages/Inventario';
import Ventas from './pages/Ventas';
import Predicciones from './pages/Predicciones';
import Equipo from './pages/Equipo';
import Notificaciones from './pages/Notificaciones';
import Alertas from './pages/Alertas';
import Perfil from './pages/Perfil';
import About from './pages/About';

export default function App() {
  return (
    <AuthProvider>
      <NotificacionesProvider>
        <PymeFilterProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/recuperar" element={<RecuperarPassword />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route element={<RequiereCapacidad capacidad="verDashboard" />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                  </Route>
                  <Route path="/pymes" element={<Pymes />} />
                  <Route element={<RequiereCapacidad capacidad="verInventario" />}>
                    <Route path="/inventario" element={<Inventario />} />
                  </Route>
                  <Route element={<RequiereCapacidad capacidad="verVentas" />}>
                    <Route path="/ventas" element={<Ventas />} />
                  </Route>
                  <Route element={<RequiereCapacidad capacidad="verPredicciones" />}>
                    <Route path="/predicciones" element={<Predicciones />} />
                  </Route>
                  <Route path="/equipo" element={<Equipo />} />
                  <Route path="/notificaciones" element={<Notificaciones />} />
                  <Route path="/alertas" element={<Alertas />} />
                  <Route path="/perfil" element={<Perfil />} />
                  <Route path="/about" element={<About />} />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </PymeFilterProvider>
      </NotificacionesProvider>
    </AuthProvider>
  );
}
