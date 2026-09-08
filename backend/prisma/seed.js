const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@pymes.com' },
    update: { emailVerificado: true },
    create: {
      nombre: 'Administrador',
      email: 'admin@pymes.com',
      password,
      rol: 'ADMIN',
      emailVerificado: true,
    },
  });

  const comerciante = await prisma.user.upsert({
    where: { email: 'comerciante@pymes.com' },
    update: { emailVerificado: true },
    create: {
      nombre: 'Comerciante Demo',
      email: 'comerciante@pymes.com',
      password,
      rol: 'COMERCIANTE',
      emailVerificado: true,
      pymes: {
        create: [
          {
            nombre: 'Tienda La Esquina',
            tipo: 'TIENDA',
            sector: 'Alimentos',
            ciudad: 'Bogotá',
            direccion: 'Calle 10 # 5-20',
            telefono: '3101234567',
            productos: {
              create: [
                {
                  nombre: 'Arroz 1kg',
                  codigo: 'ARZ-001',
                  categoria: 'Granos',
                  precioVenta: 4500,
                  costo: 3200,
                  inventario: { create: { stockActual: 120, stockMinimo: 30, stockMaximo: 200 } },
                },
                {
                  nombre: 'Aceite Vegetal 1L',
                  codigo: 'ACE-002',
                  categoria: 'Despensa',
                  precioVenta: 12500,
                  costo: 9800,
                  inventario: { create: { stockActual: 45, stockMinimo: 12, stockMaximo: 80 } },
                },
                {
                  nombre: 'Gaseosa 1.5L',
                  codigo: 'GAS-003',
                  categoria: 'Bebidas',
                  precioVenta: 6800,
                  costo: 5100,
                  inventario: { create: { stockActual: 8, stockMinimo: 15, stockMaximo: 60 } },
                },
                {
                  nombre: 'Panela x5',
                  codigo: 'PAN-004',
                  categoria: 'Dulces',
                  precioVenta: 9800,
                  costo: 7400,
                  inventario: { create: { stockActual: 25, stockMinimo: 10, stockMaximo: 50 } },
                },
                {
                  // A granel por peso: precio POR LIBRA, stock en gramos
                  // (30 kg = 30000). El cajero teclea "1,5 lb" o "$2000".
                  nombre: 'Arroz a granel',
                  codigo: '2000000000015',
                  categoria: 'Granos',
                  precioVenta: 2800,
                  costo: 2100,
                  granel: true,
                  unidadVenta: 'lb',
                  inventario: { create: { stockActual: 30000, stockMinimo: 5000, stockMaximo: 60000 } },
                },
                {
                  // A granel por volumen: precio POR LITRO, stock en mililitros.
                  nombre: 'Aceite a granel',
                  codigo: '2000000000022',
                  categoria: 'Despensa',
                  precioVenta: 12500,
                  costo: 9800,
                  granel: true,
                  unidadVenta: 'L',
                  inventario: { create: { stockActual: 20000, stockMinimo: 4000, stockMaximo: 40000 } },
                },
              ],
            },
          },
        ],
      },
    },
  });

  await seedMovimientos(comerciante.id);

  console.log('Seed completado.');
  console.log('Admin:', admin.email);
  console.log('Comerciante:', comerciante.email);
  console.log('Password de ambos: password123');
}

// Historial de ventas + gastos operativos para que el Dashboard y el panel de
// Contabilidad no salgan vacíos en una instalación limpia. El seed corre en
// cada arranque del contenedor, así que ventas y gastos se siembran de forma
// independiente y sólo si todavía no existen.
async function seedMovimientos(comercianteId) {
  const pyme = await prisma.pyme.findFirst({
    where: { userId: comercianteId },
    include: { productos: { include: { inventario: true } } },
  });
  if (!pyme || pyme.productos.length === 0) return;

  const hoy = new Date();
  const rnd = (min, max) => min + Math.random() * (max - min);
  const randint = (min, max) => Math.floor(rnd(min, max + 1));

  const [yaHayVentas, yaHayGastos] = await Promise.all([
    prisma.venta.count({ where: { pymeId: pyme.id } }),
    prisma.gasto.count({ where: { pymeId: pyme.id } }),
  ]);

  let facturasCreadas = 0;
  let ventasCreadas = 0;

  if (yaHayVentas > 0) {
    console.log('Movimientos: la PYME ya tiene ventas, no se re-siembran.');
  } else {
  const DIAS = 110;

  for (let d = DIAS; d >= 0; d--) {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - d, 12, 0, 0);
    const finde = fecha.getDay() === 0 || fecha.getDay() === 6;
    // Tienda de barrio chica: unas pocas facturas por día (~$1,5-2 M/mes de
    // ventas). Los costos fijos sembrados abajo están calibrados a esa escala.
    const numFacturas = finde ? randint(3, 6) : randint(2, 5);

    for (let f = 0; f < numFacturas; f++) {
      // 1 a 3 productos por factura. Los productos a granel (precio por
      // libra/litro, stock en g/ml) no encajan en este generador simple de
      // "cantidad entera de unidades" — se dejan fuera del historial sembrado.
      const nLineas = randint(1, 3);
      const vendibles = pyme.productos.filter((p) => !p.granel);
      const elegidos = [...vendibles].sort(() => Math.random() - 0.5).slice(0, nLineas);
      const lineas = elegidos.map((p) => {
        const cantidad = randint(1, 5);
        return {
          productoId: p.id,
          cantidad,
          precioUnitario: p.precioVenta,
          costoUnitario: p.costo,
          total: p.precioVenta * cantidad,
        };
      });
      const total = lineas.reduce((s, l) => s + l.total, 0);

      const factura = await prisma.factura.create({
        data: {
          pymeId: pyme.id,
          total,
          montoRecibido: Math.ceil(total / 1000) * 1000 + (Math.random() < 0.5 ? 0 : 1000),
          fecha,
          ventas: {
            create: lineas.map((l) => ({
              pymeId: pyme.id,
              productoId: l.productoId,
              cantidad: l.cantidad,
              precioUnitario: l.precioUnitario,
              costoUnitario: l.costoUnitario,
              total: l.total,
              fecha,
            })),
          },
        },
      });
      facturasCreadas++;
      ventasCreadas += lineas.length;
    }
  }
  // El stock del seed es la foto "actual"; no se reconstruye desde este
  // historial de ventas ficticio (una app real tampoco lo hace).
  }

  if (yaHayGastos > 0) {
    console.log('Movimientos: la PYME ya tiene gastos, no se re-siembran.');
    console.log(`Movimientos: ${facturasCreadas} facturas y ${ventasCreadas} ventas sembradas.`);
    return;
  }

  // Gastos operativos calibrados a una tienda de barrio de ~$1,5-2 M/mes en
  // ventas (~25% de margen ≈ $450-540 k de utilidad bruta): costos fijos
  // ~$395 k/mes + un gasto puntual chico por mes, así el negocio queda cerca
  // del equilibrio (positivo en el acumulado) y el panel de Contabilidad
  // muestra una utilidad neta creíble, no una pérdida gigante.
  const PUNTUALES = [
    { categoria: 'MANTENIMIENTO', descripcion: 'Arreglo de la nevera', monto: 90000, dia: 9 },
    { categoria: 'TRANSPORTE', descripcion: 'Domicilios y acarreos', monto: 45000, dia: 17 },
    { categoria: 'IMPUESTOS', descripcion: 'Impuesto de industria y comercio', monto: 120000, dia: 20 },
    { categoria: 'MERCADERIA', descripcion: 'Reposición mayorista', monto: 130000, dia: 6 },
    null, // el mes en curso arranca sin gasto puntual
  ];
  const gastos = [];
  for (let m = 4; m >= 0; m--) {
    const base = new Date(hoy.getFullYear(), hoy.getMonth() - m, 1);
    const finMes = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const dia = (n) => new Date(base.getFullYear(), base.getMonth(), Math.min(n, finMes));
    gastos.push(
      { categoria: 'ARRIENDO', descripcion: 'Arriendo del local', monto: 170000, fecha: dia(3) },
      { categoria: 'NOMINA', descripcion: 'Ayudante fines de semana', monto: 130000, fecha: dia(28) },
      { categoria: 'SERVICIOS', descripcion: 'Luz, agua e internet', monto: 85000 + randint(-15000, 25000), fecha: dia(12) },
    );
    const puntual = PUNTUALES[4 - m];
    if (puntual) gastos.push({ categoria: puntual.categoria, descripcion: puntual.descripcion, monto: puntual.monto, fecha: dia(puntual.dia) });
  }

  await prisma.gasto.createMany({
    data: gastos.map((g) => ({ ...g, pymeId: pyme.id, registradoPorId: comercianteId })),
  });

  console.log(`Movimientos: ${facturasCreadas} facturas, ${ventasCreadas} ventas y ${gastos.length} gastos sembrados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
