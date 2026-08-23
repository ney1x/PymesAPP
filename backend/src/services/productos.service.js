const prisma = require('../lib/prisma');
const ApiError = require('../utils/ApiError');
const iaSync = require('../lib/iaSync');
const { accesoCondiciones, tieneAcceso, resolverSedeId } = require('./acceso.util');

const findOwned = async (id, user) => {
  const producto = await prisma.producto.findUnique({
    where: { id: Number(id) },
    include: { pyme: true },
  });
  if (!producto) throw new ApiError(404, 'Producto no encontrado');
  if (!(await tieneAcceso(producto, user))) {
    throw new ApiError(403, 'No tiene acceso a este producto');
  }
  return producto;
};

const list = async (user, { pymeId, sedeId, search } = {}) => {
  const sedeIdFinal = await resolverSedeId(pymeId, user, sedeId);

  const where = {
    OR: await accesoCondiciones(user),
    ...(pymeId ? { pymeId: Number(pymeId) } : {}),
    ...(sedeIdFinal ? { sedeId: sedeIdFinal } : {}),
    ...(search ? { nombre: { contains: search } } : {}),
  };

  return prisma.producto.findMany({
    where,
    include: {
      inventario: true,
      _count: { select: { ventas: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
};

const getById = async (id, user) => {
  const producto = await findOwned(id, user);
  return prisma.producto.findUnique({
    where: { id: producto.id },
    include: { inventario: true, pyme: true },
  });
};

const create = async (user, data) => {
  const { inventario, ...productoData } = data;

  const pyme = await prisma.pyme.findUnique({
    where: { id: Number(productoData.pymeId) },
  });
  if (!pyme) throw new ApiError(404, 'PYME no encontrada');

  let sedeId = productoData.sedeId ? Number(productoData.sedeId) : null;
  if (user.rol !== 'ADMIN' && pyme.userId !== user.id) {
    const membresia = await prisma.pyme_membresia.findFirst({
      where: { pymeId: pyme.id, userId: user.id, activo: true },
    });
    if (!membresia) throw new ApiError(403, 'No tiene acceso a esta PYME');
    // Restringido a una sede: esa manda, no puede crear en otra.
    if (membresia.sedeId) {
      if (sedeId && sedeId !== membresia.sedeId) {
        throw new ApiError(403, 'No tiene acceso a esa sede');
      }
      sedeId = membresia.sedeId;
    }
  }

  const margen = productoData.precioVenta - productoData.costo;

  return prisma.$transaction(async (tx) => {
    const producto = await tx.producto.create({
      data: { ...productoData, pymeId: pyme.id, sedeId },
    });

    await tx.inventario.create({
      data: {
        productoId: producto.id,
        sedeId,
        stockActual: inventario?.stockActual ?? 0,
        stockMinimo: inventario?.stockMinimo ?? 5,
        stockMaximo: inventario?.stockMaximo ?? null,
        ubicacion: inventario?.ubicacion ?? null,
      },
    });

    return { ...producto, margen };
  });
};

const bulkCreate = async (user, { pymeId, productos: filas }) => {
  const pyme = await prisma.pyme.findUnique({ where: { id: Number(pymeId) } });
  if (!pyme) throw new ApiError(404, 'PYME no encontrada');

  let sedeId = null;
  if (user.rol !== 'ADMIN' && pyme.userId !== user.id) {
    const membresia = await prisma.pyme_membresia.findFirst({
      where: { pymeId: pyme.id, userId: user.id, activo: true },
    });
    if (!membresia) throw new ApiError(403, 'No tiene acceso a esta PYME');
    sedeId = membresia.sedeId;
  }

  const resultado = { creados: 0, errores: [] };

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i] || {};
    const numeroFila = i + 2; // +1 encabezado, +1 base 1

    try {
      const nombre = String(fila.nombre || '').trim();
      if (!nombre) throw new Error('nombre es obligatorio');

      const precioVenta = Number(fila.precioVenta);
      if (!Number.isFinite(precioVenta) || precioVenta < 0) throw new Error('precioVenta inválido');

      const costo = Number(fila.costo);
      if (!Number.isFinite(costo) || costo < 0) throw new Error('costo inválido');

      const stockActual = Number.isFinite(Number(fila.stockActual)) ? Number(fila.stockActual) : 0;
      const stockMinimo = Number.isFinite(Number(fila.stockMinimo)) ? Number(fila.stockMinimo) : 5;
      const ventas = Number.isFinite(Number(fila.ventas)) ? Number(fila.ventas) : 0;
      const codigo = String(fila.codigo || '').trim() || `IMP-${Date.now()}-${i}`;
      const categoria = fila.categoria ? String(fila.categoria).trim() : null;

      const producto = await prisma.$transaction(async (tx) => {
        const creado = await tx.producto.create({
          data: { pymeId: pyme.id, sedeId, nombre, codigo, categoria, precioVenta, costo },
        });

        await tx.inventario.create({
          data: { productoId: creado.id, sedeId, stockActual, stockMinimo },
        });

        if (ventas > 0) {
          await tx.venta.create({
            data: {
              pymeId: pyme.id,
              productoId: creado.id,
              cantidad: Math.round(ventas),
              precioUnitario: precioVenta,
              costoUnitario: costo,
              total: precioVenta * ventas,
            },
          });
        }

        return creado;
      });

      if (ventas > 0) {
        try {
          await iaSync.syncVenta({
            producto,
            pyme,
            cantidad: Math.round(ventas),
            precioUnitario: precioVenta,
            fecha: new Date(),
          });
        } catch (err) {
          console.error('[iaSync]', err.message);
        }
      }

      resultado.creados += 1;
    } catch (err) {
      resultado.errores.push({ fila: numeroFila, motivo: err.message });
    }
  }

  return resultado;
};

const update = async (id, user, data) => {
  const producto = await findOwned(id, user);
  const { inventario, ...productoData } = data;

  const updated = await prisma.producto.update({
    where: { id: producto.id },
    data: productoData,
  });

  if (inventario) {
    await prisma.inventario.upsert({
      where: { productoId: producto.id },
      update: inventario,
      create: {
        productoId: producto.id,
        stockActual: inventario.stockActual ?? 0,
        stockMinimo: inventario.stockMinimo ?? 5,
        stockMaximo: inventario.stockMaximo ?? null,
        ubicacion: inventario.ubicacion ?? null,
      },
    });
  }

  return { ...updated, margen: updated.precioVenta - updated.costo };
};

const remove = async (id, user) => {
  const producto = await findOwned(id, user);
  await prisma.$transaction([
    prisma.venta.deleteMany({ where: { productoId: producto.id } }),
    prisma.prediccion.deleteMany({ where: { productoId: producto.id } }),
    prisma.inventario.deleteMany({ where: { productoId: producto.id } }),
    prisma.producto.delete({ where: { id: producto.id } }),
  ]);
  return producto;
};

module.exports = { list, getById, create, bulkCreate, update, remove };
