// Espejo de backend/src/services/permisos.js — el backend es quien manda
// (borra campos y devuelve 403), esto solo decide qué mostrar en la UI.
// `pymesApi.list()` ya devuelve `miRoles` (array) resuelto por PYME (['OWNER']
// si es dueño o el usuario es ADMIN global, o todos los roles de la
// membresía — un miembro puede tener más de uno a la vez).
export const CAPACIDADES = {
  OWNER: {
    gestionarPyme: true,
    gestionarMiembros: true,
    gestionarSedes: true,
    gestionarProductos: true,
    modificarInventario: true,
    crearVentas: true,
    verCostoProducto: true,
    verReportesFinancieros: true,
    verPredicciones: true,
    generarPredicciones: true,
    verDashboard: true,
    verInventario: true,
    verVentas: true,
  },
  VENDEDOR: {
    gestionarPyme: false,
    gestionarMiembros: false,
    gestionarSedes: false,
    gestionarProductos: false,
    modificarInventario: false,
    crearVentas: true,
    verCostoProducto: false,
    verReportesFinancieros: false,
    verPredicciones: false,
    generarPredicciones: false,
    verDashboard: false,
    verInventario: false,
    verVentas: true,
  },
  INVENTARIO: {
    gestionarPyme: false,
    gestionarMiembros: false,
    gestionarSedes: false,
    gestionarProductos: true,
    modificarInventario: true,
    crearVentas: false,
    verCostoProducto: true,
    verReportesFinancieros: false,
    verPredicciones: false,
    generarPredicciones: false,
    verDashboard: false,
    verInventario: true,
    verVentas: false,
  },
  ANALISTA: {
    gestionarPyme: false,
    gestionarMiembros: false,
    gestionarSedes: false,
    gestionarProductos: false,
    modificarInventario: false,
    crearVentas: false,
    verCostoProducto: true,
    verReportesFinancieros: true,
    verPredicciones: true,
    generarPredicciones: false,
    verDashboard: true,
    verInventario: true,
    verVentas: true,
  },
};

export const puede = (roles, capacidad) => {
  const lista = Array.isArray(roles) ? roles : [roles];
  return lista.some((rol) => CAPACIDADES[rol]?.[capacidad]);
};

export const puedeEnAlguna = (pymes, capacidad) =>
  (pymes || []).some((p) => puede(p.miRoles, capacidad));
