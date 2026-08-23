import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PymeFilterProvider } from './context/PymeFilterContext';
import ProtectedRoute from './routes/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Pymes from './pages/Pymes';
import Inventario from './pages/Inventario';
import Ventas from './pages/Ventas';
import Predicciones from './pages/Predicciones';
import Equipo from './pages/Equipo';
import Alertas from './pages/Alertas';
import Perfil from './pages/Perfil';
import About from './pages/About';

export default function App() {
  return (
    <AuthProvider>
      <PymeFilterProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/pymes" element={<Pymes />} />
                <Route path="/inventario" element={<Inventario />} />
                <Route path="/ventas" element={<Ventas />} />
                <Route path="/predicciones" element={<Predicciones />} />
                <Route path="/equipo" element={<Equipo />} />
                <Route path="/alertas" element={<Alertas />} />
                <Route path="/perfil" element={<Perfil />} />
                <Route path="/about" element={<About />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </PymeFilterProvider>
    </AuthProvider>
  );
}
