/**
 * Espejo de ventas hacia el esquema del motor de IA (ai_inventory:
 * productos/bodegas/precios/ventas, ver IA_INVENTARIO/src/db).
 *
 * Misma base física que Prisma, tablas distintas y desacopladas
 * (@@ignore en schema.prisma) — acá se escriben con SQL crudo porque
 * Prisma Client no las expone.
 *
 * Nunca debe bloquear ni revertir el flujo de ventas de la app: quien
 * llama a syncVenta debe envolverlo en try/catch y solo loguear errores.
 */

const prisma = require('./prisma');

const toDateOnly = (fecha) => {
  const d = new Date(fecha);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const syncVenta = async ({ producto, pyme, cantidad, precioUnitario, fecha }) => {
  const itemId = producto.codigo;
  const storeId = String(pyme.id);
  const fechaSql = toDateOnly(fecha || new Date());

  await prisma.$executeRaw`
    INSERT INTO bodegas (store_id, state_id, nombre)
    VALUES (${storeId}, ${pyme.ciudad || null}, ${pyme.nombre})
    ON DUPLICATE KEY UPDATE state_id = VALUES(state_id), nombre = VALUES(nombre)
  `;

  await prisma.$executeRaw`
    INSERT INTO productos (item_id, dept_id, cat_id, nombre, unidad)
    VALUES (${itemId}, ${producto.categoria || null}, ${producto.categoria || null}, ${producto.nombre}, NULL)
    ON DUPLICATE KEY UPDATE dept_id = VALUES(dept_id), cat_id = VALUES(cat_id), nombre = VALUES(nombre)
  `;

  const ultimoPrecio = await prisma.$queryRaw`
    SELECT sell_price FROM precios
    WHERE item_id = ${itemId} AND store_id = ${storeId}
    ORDER BY fecha_inicio DESC
    LIMIT 1
  `;
  const precioActual = ultimoPrecio[0] ? Number(ultimoPrecio[0].sell_price) : undefined;
  if (precioActual === undefined || precioActual !== Number(precioUnitario)) {
    await prisma.$executeRaw`
      INSERT INTO precios (item_id, store_id, fecha_inicio, sell_price)
      VALUES (${itemId}, ${storeId}, ${fechaSql}, ${precioUnitario})
    `;
  }

  await prisma.$executeRaw`
    INSERT INTO ventas (item_id, store_id, fecha, unidades)
    VALUES (${itemId}, ${storeId}, ${fechaSql}, ${cantidad})
    ON DUPLICATE KEY UPDATE unidades = unidades + VALUES(unidades)
  `;
};

module.exports = { syncVenta };
