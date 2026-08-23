const prisma = require('../lib/prisma');
const { accesoWhere, resolverSedeId } = require('./acceso.util');
const ventasService = require('./ventas.service');

const sum = (arr) => arr.reduce((acc, v) => acc + v, 0);

const get = async (user, { pymeId, sedeId } = {}) => {
  const sedeIdFinal = await resolverSedeId(pymeId, user, sedeId);
  const wherePyme = { ...(await accesoWhere(user)), ...(pymeId ? { pymeId: Number(pymeId) } : {}) };
  const whereVentaInventario = { ...wherePyme, ...(sedeIdFinal ? { sedeId: sedeIdFinal } : {}) };

  const [productos, ventas, inventarios, predicciones, comparativaSedes] = await Promise.all([
    prisma.producto.findMany({
      where: whereVentaInventario,
      select: { id: true, nombre: true },
    }),
    prisma.venta.findMany({
      where: whereVentaInventario,
      select: { total: true, cantidad: true, precioUnitario: true, costoUnitario: true, fecha: true, productoId: true },
    }),
    prisma.inventario.findMany({
      where: { producto: whereVentaInventario },
      include: { producto: { select: { id: true, nombre: true, codigo: true, precioVenta: true } } },
    }),
    prisma.prediccion.findMany({
      where: { producto: whereVentaInventario },
      include: { producto: { select: { id: true, nombre: true, codigo: true, precioVenta: true, costo: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    pymeId ? ventasService.comparativaSedes(user, { pymeId }) : Promise.resolve([]),
  ]);

  const ingresos = sum(ventas.map((v) => v.total));
  const margenBruto = sum(ventas.map((v) => (v.precioUnitario - v.costoUnitario) * v.cantidad));
  const unidadesVendidas = sum(ventas.map((v) => v.cantidad));

  const hoy = new Date();
  const hace7Dias = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000);

  const ventasUltimos7Dias = ventas.filter((v) => v.fecha >= hace7Dias);
  const ventasPorDia = Array.from({ length: 7 }, (_, i) => {
    const dia = new Date(hoy.getTime() - (6 - i) * 24 * 60 * 60 * 1000);
    const key = dia.toISOString().slice(0, 10);
    const delDia = ventasUltimos7Dias.filter((v) => v.fecha.toISOString().slice(0, 10) === key);
    return {
      fecha: key,
      ventas: delDia.length,
      ingresos: sum(delDia.map((v) => v.total)),
    };
  });

  const ventasPorProducto = {};
  for (const v of ventas) {
    ventasPorProducto[v.productoId] = ventasPorProducto[v.productoId] || { ingresos: 0, unidades: 0 };
    ventasPorProducto[v.productoId].ingresos += v.total;
    ventasPorProducto[v.productoId].unidades += v.cantidad;
  }

  const topProductos = productos
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      ...(ventasPorProducto[p.id] || { ingresos: 0, unidades: 0 }),
    }))
    .sort((a, b) => b.ingresos - a.ingresos)
    .slice(0, 5);

  const productosBajoStock = inventarios
    .filter((inv) => inv.stockActual <= inv.stockMinimo)
    .map((inv) => ({
      id: inv.producto.id,
      nombre: inv.producto.nombre,
      codigo: inv.producto.codigo,
      stockActual: inv.stockActual,
      stockMinimo: inv.stockMinimo,
    }));

  const ultimaPorProducto = new Map();
  for (const p of predicciones) {
    if (!ultimaPorProducto.has(p.productoId)) ultimaPorProducto.set(p.productoId, p);
  }

  const rankingRentabilidad = Array.from(ultimaPorProducto.values())
    .map((p) => ({
      id: p.producto.id,
      nombre: p.producto.nombre,
      codigo: p.producto.codigo,
      demandaPredicha: p.demandaPredicha,
      rentabilidadPredicha: p.rentabilidadPredicha,
      nivelConfianza: p.nivelConfianza,
    }))
    .sort((a, b) => b.rentabilidadPredicha - a.rentabilidadPredicha);

  return {
    resumen: {
      ingresos: Math.round(ingresos),
      margenBruto: Math.round(margenBruto),
      unidadesVendidas,
      numeroProductos: productos.length,
      alertasStock: productosBajoStock.length,
    },
    ventasPorDia,
    topProductos,
    productosBajoStock,
    rankingRentabilidad,
    comparativaSedes,
  };
};

module.exports = { get };
