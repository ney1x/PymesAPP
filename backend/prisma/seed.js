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
              ],
            },
          },
        ],
      },
    },
  });

  console.log('Seed completado.');
  console.log('Admin:', admin.email);
  console.log('Comerciante:', comerciante.email);
  console.log('Password de ambos: password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
