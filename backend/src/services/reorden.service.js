const prisma = require('../lib/prisma');
const mlClient = require('../lib/mlClient');
const { accesoWhere } = require('./acceso.util');

const DIAS_FORECAST_DEFAULT = 30;

/**
 * Punto de reorden y cantidad sugerida de compra, misma fórmula que
 * IA_INVENTARIO/src/inventario/reorder.py, pero alimentada por
 * mlClient.predict (que ya tiene el fallback LightGBM -> RandomForest
 * -> heurística -> sin_datos) en vez de llamar al motor directo.
 */
const analizarProducto = async (producto, diasForecast = DIAS_FORECAST_DEFAULT) => {
  const stockActual = producto.inventario?.stockActual ?? 0;
  const leadTimeDias = producto.leadTimeDias ?? 7;
  const stockSeguridad = producto.stockSeguridad ?? 0;

  let demandaPredicha = 0;
  let metodo = 'sin_datos';
  try {
    const prediccion = await mlClient.predict({
      itemId: producto.codigo,
      storeId: String(producto.pymeId),
      horizonteDias: diasForecast,
    });
    demandaPredicha = prediccion.demandaPredicha || 0;
    metodo = prediccion.metodo || 'ml';
  } catch (err) {
    console.error('[reorden] No se pudo consultar el servicio de ML:', err.message);
  }

  const demandaDiaria = demandaPredicha / diasForecast;
  const puntoReorden = demandaDiaria * leadTimeDias + stockSeguridad;
  const stockObjetivo = demandaDiaria * diasForecast + stockSeguridad;
  const comprar = stockActual <= puntoReorden;
  const cantidad = Math.max(0, Math.round(stockObjetivo - stockActual));

  return {
    producto: {
      id: producto.id,
      nombre: producto.nombre,
      codigo: producto.codigo,
      pymeId: producto.pymeId,
    },
    stockActual,
    leadTimeDias,
    stockSeguridad,
    demandaPredicha: Math.round(demandaPredicha),
    demandaDiaria: Math.round(demandaDiaria * 100) / 100,
    puntoReorden: Math.round(puntoReorden * 100) / 100,
    stockObjetivo: Math.round(stockObjetivo * 100) / 100,
    comprar,
    cantidad,
    diasForecast,
    metodo,
  };
};

const listar = async (user, { pymeId, diasForecast } = {}) => {
  const productos = await prisma.producto.findMany({
    where: {
      ...(await accesoWhere(user)),
      ...(pymeId ? { pymeId: Number(pymeId) } : {}),
    },
    include: { inventario: true },
  });

  const dias = Number(diasForecast) > 0 ? Number(diasForecast) : DIAS_FORECAST_DEFAULT;

  const resultados = [];
  for (const producto of productos) {
    if (!producto.inventario) continue;
    resultados.push(await analizarProducto(producto, dias));
  }

  return resultados.sort(
    (a, b) => Number(b.comprar) - Number(a.comprar) || b.cantidad - a.cantidad
  );
};

module.exports = { analizarProducto, listar };
