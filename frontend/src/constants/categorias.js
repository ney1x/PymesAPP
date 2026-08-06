const RETAIL_GENERAL = [
  'Granos', 'Lácteos', 'Bebidas', 'Despensa', 'Aseo', 'Panadería',
  'Snacks', 'Dulces', 'Frutas y Verduras', 'Carnes', 'Congelados',
  'Cuidado Personal',
];

export const CATEGORIAS_POR_TIPO = {
  MINIMARKET: RETAIL_GENERAL,
  TIENDA: RETAIL_GENERAL,
  FERRETERIA: [
    'Herramientas', 'Materiales de Construcción', 'Pinturas', 'Plomería',
    'Electricidad', 'Tornillería y Fijaciones', 'Jardinería', 'Seguridad Industrial',
  ],
  FARMACIA: [
    'Medicamentos', 'Cuidado Personal', 'Higiene', 'Suplementos y Vitaminas',
    'Dermocosmética', 'Cuidado del Bebé', 'Primeros Auxilios', 'Equipos Médicos',
  ],
  PAPELERIA: [
    'Útiles Escolares', 'Oficina', 'Arte y Manualidades', 'Tecnología',
    'Libros y Revistas', 'Regalos y Empaques',
  ],
  RESTAURANTE: [
    'Entradas', 'Platos Fuertes', 'Postres', 'Bebidas', 'Bebidas Alcohólicas',
    'Insumos de Cocina', 'Desechables',
  ],
  CAFETERIA: [
    'Café', 'Bebidas Calientes', 'Bebidas Frías', 'Repostería', 'Panadería',
    'Snacks', 'Insumos',
  ],
  PANADERIA: [
    'Pan', 'Pastelería', 'Repostería', 'Bebidas', 'Insumos de Panadería',
  ],
  LICORERA: [
    'Cervezas', 'Vinos', 'Whisky', 'Ron', 'Vodka', 'Aguardiente',
    'Snacks', 'Cigarrillos',
  ],
  VETERINARIA: [
    'Alimento para Mascotas', 'Medicamentos Veterinarios', 'Accesorios',
    'Higiene y Aseo', 'Juguetes', 'Insumos Clínicos',
  ],
  OTRO: ['Varios', 'General'],
};

export function categoriasComunesPorTipo(tipo) {
  return CATEGORIAS_POR_TIPO[tipo] || CATEGORIAS_POR_TIPO.OTRO;
}
