# Venta a granel (peso / volumen / importe) + códigos de barras internos

Cierra el caso de los productos que **no se venden por unidad entera**: arroz,
azúcar, aceite, pollo, detergente a granel… donde el cliente pide "libra y
media", "$2000 de aceite", "media libra de fríjol".

## Principio

**Un producto, un stock, en la unidad más chica.** Igual que la feature de
caja: no se crea "Arroz 500 g" / "Arroz 1 kg" / etc.

- `producto.granel` (bool) + `producto.unidadVenta` (`kg` · `lb` · `oz` · `g` · `L` · `ml`).
- El **stock** (`inventario.stockActual`) y **`venta.cantidad`** de un producto
  granel se guardan en **unidad base**: **gramos** para peso, **mililitros**
  para volumen. Enteros — sin decimales que arrastren error de redondeo.
- `precioVenta` / `costo` se interpretan como **precio por `unidadVenta`**
  (por libra, por litro…). El precio por unidad base se deriva:
  `precioVenta / factorBase(unidadVenta)`.
- Conversiones fijas (`backend/src/lib/unidades.util.js`, espejo en
  `frontend/src/constants/unidades.js`):
  `kg = 1000 g` · **`lb = 500 g`** (la de la tienda, no 453,592 g) ·
  **`oz = 31,25 g`** (500/16, así "libra y 4 onzas" = 625 g) · `L = 1000 ml`.
- Granel y caja son **excluyentes**.

## Cómo se vende (POS, `Ventas.jsx`)

Al escanear / elegir un producto granel, su línea de carrito no trae el
`−/+` sino un control con **dos modos**:

| Modo | El cajero teclea | Se cobra | Se descuenta del stock |
|---|---|---|---|
| **Por medida** | `1,5` + unidad (`lb`) | `peso × precio/unidad`, **redondeado a $50** | ese peso en g/ml |
| **Por importe** | `2000` (pesos) | exactamente `$2000` | `$2000 ÷ precio/unidad` en g/ml |

- El cajero puede teclear en otra unidad de la misma dimensión (producto por
  kg, teclea gramos).
- El total de la factura y `venta.total` salen del cálculo resuelto, **no**
  de `precioUnitario × cantidad` (en "por importe" no coinciden).
- La venta no se puede confirmar con líneas a granel sin cantidad o que
  superen el stock.

En la BD la línea queda: `presentacion = 'GRANEL'`, `cantidad` = g/ml,
`factorPresentacion = 1`, `precioUnitario` / `costoUnitario` por unidad base.

## Códigos de barras internos

Para productos **sin código de fábrica**, sea por unidad (pan, bombones,
tornillos) o a granel. En el formulario de producto (**modal de
`Inventario.jsx`**):

- Selector **"¿Cómo se vende?"** → *Por unidad* / *Por peso o volumen*. Es la
  elección explícita de tipo de producto (mapea a `producto.granel`).
- **"Generar"** → EAN-13 con **prefijo 2** (rango GS1 reservado para uso
  interno del comercio, nunca choca con un código real) + dígito verificador.
  Cuerpo: `2 + PYME(3) + segundos(6) + aleatorio(2)`. Se guarda en el mismo
  campo `codigo` que ya lee el escáner del POS.
- **"Ver / imprimir etiqueta"** → diálogo de impresión con **nombre + precio +
  cómo se vende** ("por libra" / "por unidad" / "por litro"…) + código de
  barras (`jsbarcode`), en cualquier impresora (térmica o A4).
- **"Imprimir etiquetas"** (toolbar de Inventario) → impresión masiva:
  elegís productos (por defecto los de código interno), copias por producto,
  y salen todas en un solo diálogo. `frontend/src/components/EtiquetasModal.jsx`.

Al escanear en el POS, el producto se resuelve solo: si es granel abre la
línea de peso/importe (con un aviso "se cobra por libra"), si no, la línea de
unidad de siempre. Nada de esto viaja en el código — es el `codigo` → lookup →
`producto.granel`.

`frontend/src/lib/barcode.js` · `frontend/src/components/CodigoBarras.jsx` ·
`frontend/src/components/EtiquetasModal.jsx`.

## Motor de IA

`iaSync` espeja la venta en unidad base (g/ml) y ahora escribe
`productos.unidad` (`g` / `ml`; `null` para productos por unidad). La columna
`ventas.unidades` del esquema IA ya era `Decimal`, no hizo falta tocarla.

## Alcance de este cambio

**Backend:** `schema.prisma` (2 columnas en `producto`, sin tablas nuevas,
sin migrar tipos — `npx prisma db push`), `unidades.util.js` (nuevo),
`facturas.service.js` (`resolverLineaGranel`), `productos.service.js`
(`normalizarGranel`, excluye caja), `iaSync.js`, `dashboard.service.js` (el
KPI "unidades vendidas" ignora granel — no se suman g con unidades), rutas +
validación, `seed.js` (2 productos demo), `facturas.service.test.js` (nuevo,
11 casos).

**Frontend:** `constants/unidades.js` + `lib/barcode.js` +
`components/CodigoBarras.jsx` (nuevos), `Ventas.jsx` (línea de carrito
granel), `Inventario.jsx` (form: tipo de venta, unidad, generar/imprimir
código; tabla/cards muestran el stock en su unidad), `styles.css`,
`package.json` (`jsbarcode`).

## Pendiente de pulir

- `predicciones` / `reorden` muestran cantidades granel en g/ml crudos
  ("comprar 8500" en vez de "8,5 kg") — la matemática es correcta, falta el
  formato.
- Herramientas del asistente de IA (`consultar_stock`, `info_producto`…):
  textos en unidades.
- Import/export Excel: la importación ya acepta columnas `granel` /
  `unidadVenta`; falta reflejarlas en la plantilla y el export.
- Venta a granel desde el asistente de IA (`POST /ventas`, ruta de una línea)
  — hoy da un 400 limpio, no está soportada.
- `frontend/src/pages/Productos.jsx` es código muerto (no ruteado); si algún
  día se conecta, hay que portarle estos campos desde `Inventario.jsx`.
