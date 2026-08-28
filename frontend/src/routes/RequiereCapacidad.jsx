import { Navigate, Outlet, useOutletContext } from 'react-router-dom';
import { puede, puedeEnAlguna } from '../constants/permisos';
import { usePymeFilter } from '../context/PymeFilterContext';
import { Spinner } from '../components/ui';

// Complemento de ProtectedRoute (que solo pide sesión iniciada): bloquea una
// ruta entera si la PYME actual (switcher del rail, ver Layout.jsx) no da la
// capacidad pedida. Con una PYME puntual elegida se chequea el rol EN ESA
// PYME (no un OR contra todas — evita que una capacidad de otra PYME
// "desbloquee" esta pantalla mientras estás parado en una donde no
// corresponde); en "Todas mis PYMES" se admite si la tenés en al menos una,
// igual que el criterio para mostrar el link de nav. `pymes` viene del
// Outlet de Layout (ya lo pide para armar el menú) para no repetir el fetch.
export default function RequiereCapacidad({ capacidad }) {
  const { pymes } = useOutletContext();
  const { pymeSeleccionada } = usePymeFilter();
  if (pymes.loading) return <Spinner label="Cargando..." />;

  const pymeActual = pymes.data?.pymes?.find((p) => String(p.id) === String(pymeSeleccionada));
  const tieneAcceso = pymeSeleccionada
    ? puede(pymeActual?.miRoles, capacidad)
    : puedeEnAlguna(pymes.data?.pymes, capacidad);

  if (!tieneAcceso) return <Navigate to="/pymes" replace />;
  return <Outlet context={{ pymes }} />;
}
