const fs = require('fs');
const path = require('path');
const { createLLMProvider } = require('../lib/llm');
const inventarioService = require('./inventario.service');
const prediccionesService = require('./predicciones.service');
const productosService = require('./productos.service');
const reordenService = require('./reorden.service');
const dashboardService = require('./dashboard.service');
const ventasService = require('./ventas.service');

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, '..', 'chat', 'prompts', 'systemPrompt.md'),
  'utf-8'
);

const CLASSIFIER_PROMPT = `Clasifica el mensaje de un asistente de inventario.
Devuelve SOLO JSON válido, sin markdown, con esta forma:
{"intent":"greeting|stock|sales|prediction|purchase_decision|inventory_summary|product_lookup|thanks|unknown","product_query":null,"confidence":0}
Extrae únicamente el nombre o referencia del producto, nunca toda la pregunta.
Usa confidence entre 0 y 1. No inventes productos.`;

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'consultar_stock',
      description: 'Consulta el stock actual de un producto por nombre. Usa cuando el usuario pregunta cuánto stock hay, disponibilidad, stock de un producto. NO necesitas pymeId, se usa el del usuario autenticado.',
      parameters: {
        type: 'object',
        properties: {
          producto: { type: 'string', description: 'Nombre o parte del nombre del producto (ej: "arroz", "leche entera")' },
        },
        required: ['producto'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'alertas_stock',
      description: 'ÚNICA FUENTE DE VERDAD para productos con stock bajo (stockActual <= stockMinimo). Usa cuando el usuario pregunta qué falta, qué está bajo, alertas, productos críticos. NO necesitas pymeId. LLAMA A ESTA HERRAMIENTA INMEDIATAMENTE. NO decidas tú qué está bajo. Si devuelve lista vacía, NO HAY productos bajos.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'predecir_demanda',
      description: 'Predice la demanda futura de un producto (usa motor LightGBM). Usa cuando el usuario pregunta "cuánto voy a vender", "predicción", "demanda futura", "pronóstico". NO necesitas pymeId. Parámetro dias es opcional (default 7). LLAMA A ESTA HERRAMIENTA INMEDIATAMENTE. NO pidas más información. EJEMPLO DE LLAMADA CORRECTA: predecir_demanda({"producto": "arroz", "dias": 7})',
      parameters: {
        type: 'object',
        properties: {
          producto: { type: 'string', description: 'Nombre del producto' },
          dias: { type: 'integer', description: 'Horizonte de predicción en días (default: 7)', default: 7, minimum: 1, maximum: 90 },
        },
        required: ['producto'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sugerir_reorden',
      description: 'Sugiere cantidades de reorden para productos que necesitan reposición. Usa cuando el usuario pregunta "qué comprar", "qué reordenar", "sugerencia de compra", "lista de compras". NO necesitas pymeId. El parámetro diasForecast es opcional (default 30). LLAMA A ESTA HERRAMIENTA INMEDIATAMENTE con parámetros vacíos: {}. NO preguntes por diasForecast. NO pidas confirmación. EJEMPLO DE LLAMADA CORRECTA: sugerir_reorden({})',
      parameters: {
        type: 'object',
        properties: {
          diasForecast: { type: 'integer', description: 'Días de forecast para cálculo (default: 30)', default: 30 },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'info_producto',
      description: 'Información detallada de un producto (precio, costo, stock, categoría, proveedor, etc.). Usa cuando el usuario pide info, detalles, ficha del producto. NO necesitas pymeId, se usa el del usuario autenticado.',
      parameters: {
        type: 'object',
        properties: {
          producto: { type: 'string', description: 'Nombre del producto' },
        },
        required: ['producto'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_ventas_producto',
      description: 'Consulta ventas historicas de un producto por nombre. Usa cuando el usuario pregunta cuanto se vendio, ventas pasadas, historial de ventas, ultimo mes o ultima semana. NO necesitas pymeId.',
      parameters: {
        type: 'object',
        properties: {
          producto: { type: 'string', description: 'Nombre del producto' },
          dias: { type: 'integer', description: 'Periodo historico en dias (default: 30)', default: 30, minimum: 1, maximum: 365 },
        },
        required: ['producto'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resumen_dashboard',
      description: 'Resumen general del negocio: ingresos, margen, productos totales, alertas de stock, top productos, ranking de rentabilidad. Usa para "cómo va todo", "resumen", "dashboard", "panorama general". NO necesitas pymeId. NO TIENE PARÁMETROS. LLAMA A ESTA HERRAMIENTA INMEDIATAMENTE con {}. NO pidas información adicional.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'producto_mas_vendido',
      description: 'Consulta GLOBAL (no de un producto específico) que responde "cuál es el producto más vendido". Rankea todos los productos por unidades vendidas. Usa cuando el usuario pregunta por el producto más vendido, top de ventas, mejor vendido, ranking de ventas. NO necesitas pymeId ni nombre de producto: esta herramienta encuentra el producto, no lo recibe como parámetro. LLAMA A ESTA HERRAMIENTA INMEDIATAMENTE.',
      parameters: {
        type: 'object',
        properties: {
          categoria: { type: 'string', description: 'Filtra el ranking a una categoría de producto (opcional, solo si el usuario la menciona explícitamente)' },
          dias: { type: 'integer', description: 'Limita el ranking a los últimos N días (opcional, por defecto considera todo el histórico)', minimum: 1, maximum: 365 },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'producto_menos_vendido',
      description: 'Consulta GLOBAL (no de un producto específico) que responde "cuál es el producto menos vendido". Rankea todos los productos por unidades vendidas y devuelve el que menos vendió. Usa cuando el usuario pregunta por el producto menos vendido, peor vendido, bottom de ventas. NO necesitas pymeId ni nombre de producto: esta herramienta encuentra el producto, no lo recibe como parámetro. LLAMA A ESTA HERRAMIENTA INMEDIATAMENTE.',
      parameters: {
        type: 'object',
        properties: {
          categoria: { type: 'string', description: 'Filtra el ranking a una categoría de producto (opcional, solo si el usuario la menciona explícitamente)' },
          dias: { type: 'integer', description: 'Limita el ranking a los últimos N días (opcional, por defecto considera todo el histórico)', minimum: 1, maximum: 365 },
        },
        required: [],
      },
    },
  },
];

async function tool_consultarStock({ user, producto }) {
  const inventarios = await inventarioService.list(user, {});
  const matches = buscarInventariosPorProducto(inventarios, producto);

  if (matches.length === 0) {
    return { success: false, mensaje: `No encontré productos que coincidan con "${producto}"` };
  }

  if (matches.length > 1) {
    return {
      success: false,
      ambiguous: true,
      opciones: matches.map((match) => match.producto.nombre),
      mensaje: `Encontré varias coincidencias para "${producto}".`,
    };
  }

  return {
    success: true,
    data: matches.map((m) => ({
      productoId: m.productoId,
      producto: m.producto.nombre,
      stockActual: m.stockActual,
      stockMinimo: m.stockMinimo,
      stockMaximo: m.stockMaximo,
      ubicacion: m.ubicacion,
      alerta: m.alerta,
      pyme: m.producto.pyme?.nombre,
    })),
  };
}

async function tool_alertasStock({ user }) {
  const inventarios = await inventarioService.list(user, { alertas: 'true' });

  if (inventarios.length === 0) {
    return { success: true, data: [], mensaje: 'No hay productos con stock bajo. ¡Todo bien!' };
  }

  return {
    success: true,
    data: inventarios.map((inv) => ({
      producto: inv.producto.nombre,
      stockActual: inv.stockActual,
      stockMinimo: inv.stockMinimo,
      deficit: inv.stockMinimo - inv.stockActual,
      pyme: inv.producto.pyme?.nombre,
    })),
  };
}

async function tool_predecirDemanda({ user, producto, dias = 7 }) {
  const inventarios = await inventarioService.list(user, {});
  const match = buscarInventariosPorProducto(inventarios, producto)[0];

  if (!match) {
    return { success: false, mensaje: `No encontré el producto "${producto}"` };
  }

  const prediccion = await prediccionesService.predecir(match.productoId, match.producto.pymeId, dias);

  return {
    success: true,
    data: {
      producto: match.producto.nombre,
      productoId: match.productoId,
      horizonteDias: dias,
      demandaPredicha: prediccion.demandaPredicha,
      nivelConfianza: prediccion.nivelConfianza,
      metodo: prediccion.metodo,
      stockActual: match.stockActual,
      diasCobertura:
        match.stockActual > 0
          ? Math.floor(match.stockActual / (prediccion.demandaPredicha / dias))
          : 0,
    },
  };
}

async function tool_sugerirReorden({ user, diasForecast = 30 }) {
  const sugerencias = await reordenService.listar(user, { diasForecast });

  if (sugerencias.length === 0) {
    return { success: true, data: [], mensaje: 'No hay sugerencias de reorden en este momento.' };
  }

  return {
    success: true,
    data: sugerencias.map((s) => ({
      producto: s.producto.nombre,
      codigo: s.producto.codigo,
      stockActual: s.stockActual,
      stockMinimo: s.stockMinimo,
      puntoReorden: s.puntoReorden,
      stockObjetivo: s.stockObjetivo,
      cantidadSugerida: s.cantidad,
      demandaDiaria: s.demandaDiaria,
      leadTimeDias: s.leadTimeDias,
      proveedor: s.producto.proveedor?.nombre || 'Sin proveedor',
      metodo: s.metodo,
    })),
  };
}

async function tool_decidirCompra({ user, producto, diasForecast = 30 }) {
  const productos = buscarProductosPorNombre(await productosService.list(user, {}), producto);
  const match = productos[0];
  if (!match) {
    return { success: false, mensaje: `No encontré el producto "${producto}"` };
  }

  const resultado = await reordenService.analizarProducto(match, diasForecast);
  return { success: true, data: resultado };
}

async function tool_infoProducto({ user, producto }) {
  const productos = buscarProductosPorNombre(await productosService.list(user, {}), producto);
  if (productos.length === 0) {
    return { success: false, mensaje: `No encontré el producto "${producto}"` };
  }

  return {
    success: true,
    data: productos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      codigo: p.codigo,
      descripcion: p.descripcion,
      precioVenta: p.precioVenta,
      costo: p.costo,
      margen: p.precioVenta - p.costo,
      categoria: p.categoria?.nombre,
      proveedor: p.proveedor?.nombre,
      stockActual: p.inventario?.stockActual ?? 0,
      stockMinimo: p.inventario?.stockMinimo ?? 0,
      stockMaximo: p.inventario?.stockMaximo ?? null,
      ubicacion: p.inventario?.ubicacion,
      pyme: p.pyme?.nombre,
    })),
  };
}

async function tool_consultarVentasProducto({ user, producto, dias = 30 }) {
  const productos = buscarProductosPorNombre(await productosService.list(user, {}), producto);
  const match = productos[0];

  if (!match) {
    return { success: false, mensaje: `No encontre el producto "${producto}"` };
  }

  const ventas = await ventasService.historialProducto(match.id, dias);
  const totalUnidades = ventas.reduce((sum, venta) => sum + venta.cantidad, 0);
  const totalIngresos = ventas.reduce((sum, venta) => sum + venta.total, 0);

  return {
    success: true,
    data: {
      producto: match.nombre,
      productoId: match.id,
      periodoDias: dias,
      totalUnidades,
      totalIngresos,
      numeroVentas: ventas.length,
      promedioDiario: Number((totalUnidades / dias).toFixed(1)),
    },
  };
}

async function tool_productoMasVendido({ user, categoria, dias }) {
  const ranking = await ventasService.masVendido(user, { categoria, dias });

  if (ranking.length === 0) {
    const alcance = categoria ? ` en la categoria "${categoria}"` : '';
    return { success: false, mensaje: `No hay ventas registradas${alcance} todavia.` };
  }

  return {
    success: true,
    data: {
      top: ranking[0],
      ranking: ranking.slice(0, 5),
      categoria: categoria || null,
      dias: dias || null,
    },
  };
}

async function tool_productoMenosVendido({ user, categoria, dias }) {
  const ranking = await ventasService.menosVendido(user, { categoria, dias });

  if (ranking.length === 0) {
    const alcance = categoria ? ` en la categoria "${categoria}"` : '';
    return { success: false, mensaje: `No hay ventas registradas${alcance} todavia.` };
  }

  return {
    success: true,
    data: {
      bottom: ranking[0],
      ranking: ranking.slice(0, 5),
      categoria: categoria || null,
      dias: dias || null,
    },
  };
}

async function tool_resumenDashboard({ user }) {
  const dashboard = await dashboardService.get(user, {});

  return {
    success: true,
    data: {
      resumen: dashboard.resumen,
      ventasUltimos7Dias: dashboard.ventasPorDia,
      topProductos: dashboard.topProductos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        ingresos: p.ingresos,
        unidades: p.unidades,
      })),
      alertasStock: dashboard.productosBajoStock,
      rankingRentabilidad: dashboard.rankingRentabilidad.slice(0, 10),
    },
  };
}

const TOOL_MAP = {
  consultar_stock: tool_consultarStock,
  alertas_stock: tool_alertasStock,
  predecir_demanda: tool_predecirDemanda,
  sugerir_reorden: tool_sugerirReorden,
  info_producto: tool_infoProducto,
  consultar_ventas_producto: tool_consultarVentasProducto,
  resumen_dashboard: tool_resumenDashboard,
  producto_mas_vendido: tool_productoMasVendido,
  producto_menos_vendido: tool_productoMenosVendido,
};

function normalizarTexto(texto) {
  const reparado = /[ÃÂ]/.test(texto)
    ? Buffer.from(texto, 'latin1').toString('utf8')
    : texto;
  return reparado
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿¡]/g, '')
    .toLowerCase()
    .replace(/[\u00c2\u00bf\u00a1]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function distanciaLevenshtein(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = a[i - 1] === b[j - 1]
        ? diagonal
        : Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + 1);
      diagonal = above;
    }
  }
  return previous[b.length];
}

function similitudTexto(a, b) {
  if (!a || !b) return 0;
  return 1 - distanciaLevenshtein(a, b) / Math.max(a.length, b.length);
}

function parsearClasificacion(texto) {
  try {
    const json = texto.match(/\{[\s\S]*\}/)?.[0];
    const parsed = JSON.parse(json);
    const allowed = new Set(['greeting', 'stock', 'sales', 'prediction', 'purchase_decision', 'inventory_summary', 'product_lookup', 'thanks', 'unknown']);
    return {
      intent: allowed.has(parsed.intent) ? parsed.intent : 'unknown',
      product_query: typeof parsed.product_query === 'string' ? parsed.product_query.trim() : null,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    };
  } catch {
    return { intent: 'unknown', product_query: null, confidence: 0 };
  }
}

/**
 * Direccion de un ranking (MAX/MIN) via las dos palabras comparativas
 * genericas del espanol ("mas"/"menos" — mismo tipo de señal lexica que ya
 * usa detectarContinuacion() para "y/tambien/de" o esDecisionCompra() para
 * "deberia/debo/conviene"). NO es una regex por frase: una sola vez, dos
 * palabras, reutilizada tanto para clasificar mensajes nuevos como para
 * "voltear" un intent de ranking heredado en una continuacion (ver
 * interpretarMensaje). "mejor/peor/top/bottom" tambien cuentan como senal de
 * direccion cuando aparecen junto al tema de ventas (esConsultaRankingVentas).
 */
function direccionRanking(normalized) {
  if (/\b(menos|peor|bottom)\b/.test(normalized)) return 'MIN';
  if (/\b(mas|mejor|top)\b/.test(normalized)) return 'MAX';
  return null;
}

/**
 * Detecta si el mensaje es una consulta de RANKING GLOBAL de ventas
 * ("producto mas/menos vendido", "que producto vende menos", "el mejor
 * vendido", etc.) en vez de una consulta sobre un producto puntual del
 * catalogo. Generaliza el mismo par de señales (tema de ventas + direccion
 * comparativa) que antes solo cubria "mas vendido"; ahora cubre ambas
 * direcciones sin listar frases especificas.
 */
function esConsultaRankingVentas(normalized) {
  const tieneTemaVentas = /\b(vendido|vendidos|vendida|vendidas|vendi|vendio|vendieron|vende|vender|venden|ventas?)\b/.test(normalized);
  return tieneTemaVentas && direccionRanking(normalized) !== null;
}

function detectarIntencion(mensaje) {
  const normalized = normalizarTexto(mensaje).trim();

  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches)([!, .].*)?$/.test(normalized)) return 'greeting';
  if (/^(gracias|muchas gracias|te agradezco)([!, .].*)?$/.test(normalized)) return 'conversational';
  if (/\b(ayuda|que puedes hacer|como puedes ayudar|capacidades)\b/.test(normalized)) return 'help';
  if (detectarResumenDashboard(mensaje)) return 'dashboard_summary';
  if (esConsultaRankingVentas(normalized)) return direccionRanking(normalized) === 'MIN' ? 'bottom_product' : 'top_product';
  if (/\b(productos?|articulos?)\b.*\b(reposicion|reponer|reordenar|bajo|minimo|criticos?)\b|\b(alertas?|reponer|reordenar|reposicion)\b|\bque\s+(?:deberia|debo|conviene)\s+comprar\b|\bque\s+productos?\s+(?:necesito|debo|deberia|conviene)\s+comprar\b/.test(normalized)) return 'reorder_alerts';
  if (esDecisionCompra(mensaje)) return 'purchase_decision';
  if (detectarConsultaVentasHistoricas(mensaje) || /\b(como estan|resumen de)\b.*\bventas?\b/.test(normalized) || /\b(cuanto|cuanta|cuantos|cuantas)\b.*\b(vendi|vendio|ventas?)\b/.test(normalized)) return 'sales_summary';
  if (detectarConsultaPrediccion(mensaje)) return 'prediction_query';
  if (/\b(cuanto|cuanta|cuantos|cuantas)\b.*\b(stock|tengo|hay|queda|quedan)\b|\b(stock|inventario|existencias?)\b|\b(tengo|hay|queda|quedan)\b/.test(normalized)) return 'stock_query';
  return 'unknown';
}

function parseMessage(mensaje) {
  const detected = detectarIntencion(mensaje);
  const intentMap = {
    stock_query: 'consultar_stock',
    sales_summary: 'consultar_ventas',
    prediction_query: 'predecir_demanda',
    purchase_decision: 'decidir_compra',
    reorder_alerts: 'consultar_reorden',
    dashboard_summary: 'resumen_inventario',
    conversational: 'thanks',
  };
  const intent = intentMap[detected] || detected;
  let productQuery = null;
  if (intent === 'consultar_stock') productQuery = extraerProductoStock(mensaje) || extraerProductoPorRuido(mensaje);
  if (intent === 'decidir_compra') productQuery = extraerProductoDecision(mensaje);
  return { intent, productQuery, confidence: detected === 'unknown' ? 0 : 0.95, usesContext: false };
}

function validateParsedIntent(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const validIntents = new Set(['greeting', 'thanks', 'help', 'consultar_stock', 'consultar_ventas', 'predecir_demanda', 'decidir_compra', 'consultar_reorden', 'resumen_inventario', 'product_lookup', 'unknown']);
  if (!validIntents.has(parsed.intent)) return null;
  if (parsed.productQuery != null) {
    const product = normalizarTexto(parsed.productQuery);
    const invalid = !product || product.length > 80 || /\b(reordering product|consultar stock|stock query|purchase decision|product lookup|respuesta|response)\b/.test(product);
    if (invalid || /\b(tengo|cuanto|cuanta|cuantos|cuantas|hay|quiero|saber|deberia|debo|comprar|reponer|stock)\b/.test(product) && product.split(/\s+/).length > 2) {
      parsed.productQuery = null;
    }
  }
  return parsed;
}

function extraerProductoDecision(mensaje) {
  const normalized = normalizarTexto(mensaje).replace(/[?.!,;:]+$/g, '').trim();
  const match = normalized.match(/\b(?:de|para)\s+(.+)$/)
    || normalized.match(/\b(?:comprar|reponer)\s+(?:mas\s+)?(.+)$/);
  const producto = match?.[1]?.replace(/^mas\s+/, '').trim();
  return producto && !/^(mas|menos|algo|productos?)$/.test(producto) ? producto : null;
}

function extraerProductoAclaracion(mensaje) {
  const normalized = normalizarTexto(mensaje).replace(/[?.!,;:]+$/g, '').trim();
  const producto = normalized
    .replace(/^(?:de|del|para|el|la|los|las)\s+/, '')
    .trim();
  return producto && !/^(mas|menos|ese|esa|eso|esta|este|ahora|cuanto|stock|venta|producto|comprar)$/.test(producto)
    ? producto
    : null;
}

function detectarDiasPeriodo(mensaje) {
  const normalized = normalizarTexto(mensaje);
  if (/\b(manana|ayer)\b/.test(normalized)) return 1;
  if (/\b(proxima semana|siguiente semana|esta semana|ultima semana|semana)\b/.test(normalized)) return 7;
  if (/\b(proximo mes|siguiente mes|este mes|ultimo mes|mes)\b/.test(normalized)) return 30;
  return null;
}

function detectarResumenDashboard(mensaje) {
  const normalized = normalizarTexto(mensaje);
  return /\b(resumen|dashboard|panorama general)\b/.test(normalized) || /\bcomo va todo\b/.test(normalized);
}

function detectarDecisionCompra(mensaje) {
  const normalized = normalizarTexto(mensaje).replace(/[?.!,;:]+$/g, '').trim();
  if (!esDecisionCompra(mensaje)) return null;

  const productoMatch = normalized.match(/\b(?:de|para)\s+(.+)$/)
    || normalized.match(/\b(?:comprar|reponer)\s+(?:mas\s+)?(.+)$/);
  const producto = productoMatch?.[1]?.replace(/^mas\s+/, '').trim();
  return producto ? { producto, diasForecast: 30 } : null;
}

function esDecisionCompra(mensaje) {
  const normalized = normalizarTexto(mensaje);
  return /\b(deberia|debo|conviene|necesito)\b/.test(normalized)
    && /\b(comprar|reponer|mas|stock)\b/.test(normalized);
}

function formatearDecisionCompra(result, params) {
  if (!result?.success) return result?.mensaje || `No pude analizar ${params.producto}.`;

  const data = result.data;
  const decision = data.comprar ? 'Sí, conviene comprar más' : 'No, no es necesario comprar más ahora';
  const cantidad = data.comprar ? ` Cantidad sugerida: ${data.cantidad} unidades.` : '';
  return `${decision} de ${data.producto.nombre}. Stock actual: ${data.stockActual}. Punto de reorden: ${data.puntoReorden}. Demanda estimada para ${data.diasForecast} días: ${data.demandaPredicha} unidades.${cantidad}`;
}

function formatearResumenDashboard(result) {
  if (!result?.success) return result?.mensaje || 'No pude obtener el resumen en este momento.';

  const { resumen, alertasStock = [], topProductos = [], rankingRentabilidad = [] } = result.data;
  const lines = [
    `Resumen: ingresos $${resumen.ingresos}, margen bruto $${resumen.margenBruto} y ${resumen.unidadesVendidas} unidades vendidas.`,
    `Productos registrados: ${resumen.numeroProductos}. Alertas de stock: ${resumen.alertasStock}.`,
  ];

  if (alertasStock.length > 0) {
    lines.push(`Reponer ahora: ${alertasStock.slice(0, 3).map((item) => `${item.producto} (${item.stockActual}/${item.stockMinimo})`).join(', ')}.`);
  }

  if (topProductos.length > 0) {
    lines.push(`Más vendido: ${topProductos[0].nombre || 'Producto'} con ${topProductos[0].unidades} unidades.`);
  }

  if (rankingRentabilidad.length > 0) {
    lines.push(`Mejor oportunidad: ${rankingRentabilidad[0].nombre}.`);
  }

  return lines.join('\n');
}

function pareceNombreProducto(mensaje) {
  const normalized = normalizarTexto(mensaje).trim();
  if (!normalized || normalized.length > 80) return false;
  if (/[?¿]/.test(mensaje)) return false;
  return !/\b(cuanto|cuanta|cuantos|cuantas|stock|tengo|hay|queda|quedan|vender|vendio|ventas|dashboard|resumen|reordenar|comprar)\b/.test(normalized);
}

function esConsultaProductoSimple(mensaje) {
  const normalized = normalizarTexto(mensaje).replace(/[?.!,;:]+$/g, '').trim();
  if (!normalized || normalized.length > 80) return false;
  if (/\b(hola|gracias|ayuda|que|como|cuando|cuanto|cuanta|cuantos|cuantas|deberia|debo|conviene|comprar|reponer|vender|ventas|stock|inventario|resumen|dashboard)\b/.test(normalized)) return false;
  return /^[a-z0-9][a-z0-9 .-]*$/.test(normalized);
}

const STOPWORDS_PRODUCTO = new Set([
  'tengo', 'hay', 'cuanto', 'cuanta', 'cuantos', 'cuantas', 'stock', 'inventario',
  'existencias', 'disponible', 'disponibles', 'quiero', 'saber', 'dime', 'me',
  'queda', 'quedan', 'queda', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una',
  'mi', 'mis', 'y', 'que', 'cual', 'cuales', 'mas', 'menos', 'ahora', 'por',
  'favor', 'unidades', 'unidad', 'me', 'queda', 'quedan', 'he', 'ha', 'han',
  'vendido', 'vendi', 'vendio', 'vendieron', 'ventas', 'venta', 'deberia',
  'debo', 'conviene', 'necesito', 'comprar', 'reponer', 'reordenar', 'productos',
  'producto', 'necesitan', 'necesito', 'como', 'estan', 'mis', 'nuevo', 'nueva',
  'repetir', 'otra', 'otro', 'vez',
]);

const INVALID_PRODUCT_QUERIES = new Set([
  'reordering product',
  'reorder product',
  'sales product',
  'stock product',
  'greeting',
  'stock',
  'sales',
  'reorder',
  'summary',
  'prediction',
  'product_info',
  'help',
  'unknown',
  'consultar stock',
  'consultar ventas',
  'decidir compra',
  'consultar reorden',
  'resumen inventario',
  'sugerir reorden',
  'consultar_ventas_producto',
  'consultar_stock',
  'sugerir_reorden',
]);

const TOOL_BY_INTENT = {
  STOCK: 'consultar_stock',
  SALES: 'consultar_ventas_producto',
  REORDER: 'sugerir_reorden',
  PREDICTION: 'predecir_demanda',
  SUMMARY: 'resumen_dashboard',
  PRODUCT_INFO: 'info_producto',
  TOP_PRODUCT: 'producto_mas_vendido',
  BOTTOM_PRODUCT: 'producto_menos_vendido',
};

// Intents de ranking GLOBAL (nunca product-scoped, nunca hacen matching de
// producto). "el menos"/"el mas" en una continuacion voltea entre estos dos.
const RANKING_INTENTS = new Set(['TOP_PRODUCT', 'BOTTOM_PRODUCT']);

function limpiarProducto(producto) {
  const normalized = normalizarTexto(producto || '')
    .replace(/[?.!,;:]+$/g, '')
    .replace(/^(?:de|del|para|el|la|los|las|y)\s+/, '')
    .trim();
  if (!normalized || normalized.length > 80) return null;
  if (INVALID_PRODUCT_QUERIES.has(normalized)) return null;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length > 0 && tokens.every((token) => STOPWORDS_PRODUCTO.has(token))) return null;
  if (/^(mas|menos|algo|productos?|articulos?|reorden|reordenamiento|comprar|stock|ventas?)$/.test(normalized)) return null;
  return normalized;
}

function detectarIntencionActual(mensaje) {
  const detected = detectarIntencion(mensaje);
  const normalized = normalizarTexto(mensaje);
  if (detected === 'sales_summary' && /\bcomo estan\b.*\bventas?\b/.test(normalized)) {
    return { intent: 'SUMMARY', confidence: 0.9, detected };
  }
  const map = {
    greeting: 'GREETING',
    conversational: 'HELP',
    help: 'HELP',
    stock_query: 'STOCK',
    sales_summary: 'SALES',
    purchase_decision: 'REORDER',
    reorder_alerts: 'REORDER',
    dashboard_summary: 'SUMMARY',
    prediction_query: 'PREDICTION',
    top_product: 'TOP_PRODUCT',
    bottom_product: 'BOTTOM_PRODUCT',
  };
  return {
    intent: map[detected] || 'UNKNOWN',
    confidence: detected === 'unknown' ? 0 : 0.95,
    detected,
  };
}

function extraerProductoVentas(mensaje) {
  const normalized = normalizarTexto(mensaje)
    .replace(/[?.!,;:]+$/g, '')
    .trim();
  const match = normalized.match(/\b(?:ventas?|vendido|vendida|vendidos|vendidas|vendi|vendio|vendieron)\s+(?:de\s+)?(.+)$/);
  if (!match?.[1]) return null;
  const producto = match[1]
    .replace(/\s+(?:en|durante|del|de)?\s*(?:el|la)?\s*(?:ultimo|ultima|pasado|pasada|mes|semana|ayer).*$/i, '')
    .trim();
  return limpiarProducto(producto);
}

function extraerProductoExplicito(mensaje, intent) {
  if (intent === 'STOCK') return limpiarProducto(extraerProductoStock(mensaje) || extraerProductoPorRuido(mensaje));
  if (intent === 'SALES') return limpiarProducto(
    extraerProductoVentas(mensaje)
      || extraerProductoVentasHistoricas(mensaje)
      || extraerProductoPorRuido(mensaje)
  );
  if (intent === 'REORDER') return limpiarProducto(extraerProductoDecision(mensaje));
  if (intent === 'PREDICTION') return limpiarProducto(detectarConsultaPrediccion(mensaje)?.producto);
  if (intent === 'PRODUCT_INFO') return limpiarProducto(extraerProductoPorRuido(mensaje));

  const directProductMatch = normalizarTexto(mensaje).match(/^(?:y\s+)?(?:el|la|los|las)\s+(.+)$/);
  if (directProductMatch?.[1]) return limpiarProducto(directProductMatch[1]);

  if (intent === 'UNKNOWN' && esConsultaProductoSimple(mensaje)) {
    return limpiarProducto(extraerProductoPorRuido(mensaje) || mensaje);
  }

  return null;
}

function detectarContinuacion(mensaje) {
  const normalized = normalizarTexto(mensaje).trim();
  return /^(?:y|tambien|tambien dime|ademas|de nuevo|otra vez)\b/.test(normalized)
    || /^(?:de|del|para)\s+\S/.test(normalized);
}

function interpretarMensaje(mensaje, context = {}) {
  const startedAt = Date.now();
  const intentStartedAt = Date.now();
  const current = detectarIntencionActual(mensaje);
  const intentMs = Date.now() - intentStartedAt;
  const continuation = detectarContinuacion(mensaje);
  const productStartedAt = Date.now();
  const explicitProduct = extraerProductoExplicito(mensaje, current.intent)
    || (current.intent === 'UNKNOWN' ? limpiarProducto(extraerProductoPorRuido(mensaje)) : null);
  const productExtractionMs = Date.now() - productStartedAt;
  let lastIntent = {
    stock_query: 'STOCK',
    sales_summary: 'SALES',
    purchase_decision: 'REORDER',
    reorder_alerts: 'REORDER',
    prediction_query: 'PREDICTION',
    dashboard_summary: 'SUMMARY',
  }[context.intent] || context.intent || null;
  // "¿Y el menos?" tras TOP_PRODUCT (o "¿Y el mas?" tras BOTTOM_PRODUCT): se
  // hereda el TEMA (ranking de ventas) pero la DIRECCION puede cambiar en
  // este mismo mensaje. Reutiliza direccionRanking() — la misma señal
  // lexica generica de arriba, sin regex nueva por frase.
  if (RANKING_INTENTS.has(lastIntent)) {
    const direccionMensaje = direccionRanking(normalizarTexto(mensaje));
    if (direccionMensaje) lastIntent = direccionMensaje === 'MIN' ? 'BOTTOM_PRODUCT' : 'TOP_PRODUCT';
  }
  const lastProduct = context.nombre || context.productName || null;
  const inheritsIntent = Boolean(current.intent === 'UNKNOWN' && continuation && lastIntent);
  const intent = inheritsIntent ? lastIntent : current.intent;
  const canUseContextProduct = ['STOCK', 'SALES', 'PREDICTION', 'PRODUCT_INFO'].includes(intent)
    || (intent === 'REORDER' && (current.detected === 'purchase_decision' || inheritsIntent));
  const contextualProduct = !explicitProduct && canUseContextProduct
    ? lastProduct
    : null;
  const productName = explicitProduct || contextualProduct || null;
  const productSource = explicitProduct ? 'explicit' : (contextualProduct ? 'context' : null);
  const needsProduct = ['STOCK', 'SALES', 'PREDICTION', 'PRODUCT_INFO'].includes(intent)
    || (intent === 'REORDER' && current.detected === 'purchase_decision');

  return {
    intent,
    productId: null,
    productName,
    productSource,
    intentSource: inheritsIntent ? 'context' : 'explicit',
    continuation,
    productExtraction: explicitProduct || null,
    scope: intent === 'REORDER' ? (productName ? 'PRODUCT' : 'GLOBAL')
      : (RANKING_INTENTS.has(intent) ? 'GLOBAL' : null),
    confidence: inheritsIntent ? 0.8 : current.confidence,
    intentConfidence: inheritsIntent ? 0.8 : current.confidence,
    productConfidence: productName ? (productSource === 'explicit' ? 0.9 : 0.75) : 0,
    needsClarification: needsProduct && !productName,
    contextUsed: productSource === 'context' || inheritsIntent,
    tool: intent === 'REORDER' && (current.detected === 'purchase_decision' || Boolean(productName))
      ? 'decidir_compra'
      : TOOL_BY_INTENT[intent] || null,
    detected: current.detected,
    timings: {
      intentMs,
      productExtractionMs,
      contextResolutionMs: Date.now() - productStartedAt - productExtractionMs,
      totalMs: Date.now() - startedAt,
    },
  };
}

/**
 * Detecta ambiguedad de intencion heredada. NO es un clasificador nuevo:
 * reutiliza campos que interpretarMensaje() ya calcula con el regex
 * existente (intentSource, productSource, intent, productName).
 *
 * Caso que resuelve (bug reportado): "cuanto tengo de gaseosa?" -> "y
 * debería comprar más?" -> "y de arroz?". El tercer mensaje no trae NINGUNA
 * intencion propia (intentSource='context', se heredo REORDER del turno
 * anterior) pero SI nombra un producto nuevo explicito (productSource=
 * 'explicit', "arroz"). Regla 1 del pedido: producto explicito + intencion
 * insuficiente en el mensaje => no asumir automaticamente la intencion
 * anterior. Se marca como ambigua entre STOCK y REORDER (las dos lecturas
 * razonables de nombrar un producto suelto sin verbo) y no se ejecuta tool.
 *
 * Si el mensaje SI trae su propia intencion explicita (current.intent no fue
 * 'unknown', intentSource='explicit'), nunca es ambiguo: ver regla 6.
 * Si no hay producto nuevo (solo continuacion pura, ej. "y cuanto queda?"),
 * tampoco es ambiguo: ver regla 7, eso sigue resolviendolo
 * _resolverContinuacionStock sin pasar por aqui.
 */
const INTENTS_AMBIGUOS_POR_HERENCIA = new Set(['STOCK', 'REORDER']);

function detectarAmbiguedadIntencion(interpretation, previousContext) {
  if (
    interpretation.intentSource === 'context'
    && interpretation.productSource === 'explicit'
    && interpretation.productName
    && INTENTS_AMBIGUOS_POR_HERENCIA.has(interpretation.intent)
    && previousContext?.nombre
  ) {
    return { producto: interpretation.productName, intentHeredado: interpretation.intent };
  }
  return null;
}

function extraerProductoPorRuido(mensaje) {
  const normalized = normalizarTexto(mensaje)
    .replace(/[?!,;:]+/g, ' ')
    .trim();
  const tokens = normalized.split(/\s+/).filter((token) => token && !STOPWORDS_PRODUCTO.has(token));
  return tokens.join(' ').trim() || null;
}

function extraerProductoStock(mensaje) {
  const normalized = normalizarTexto(mensaje)
    .replace(/[?.!,;:]+$/g, '')
    .trim();

  const match = normalized.match(
    /(?:stock|inventario|existencias?|disponible|disponibles|tengo|hay|queda|quedan)\s+(?:de\s+|del\s+|la\s+|el\s+)?(.+)$/
  );
  if (match?.[1]) {
    return match[1]
      .replace(/^(?:tengo|hay|queda|quedan)\s+(?:de\s+)?/, '')
      .replace(/^(?:unidades?\s+)?de\s+/, '')
      .trim();
  }

  const deMatch = normalized.match(/\bde\s+(.+)$/);
  if (deMatch?.[1]) return deMatch[1].trim();

  const tengoMatch = normalized.match(/\b(?:cuanto|cuanta|cuantos|cuantas)\s+(.+?)\s+(?:tengo|me queda|me quedan)\b/);
  if (tengoMatch?.[1]) return tengoMatch[1].replace(/^(?:el|la|los|las)\s+/, '').trim();

  return null;
}

function detectarConsultaStock(mensaje, history = []) {
  const normalized = normalizarTexto(mensaje);
  const isStock =
    /\b(cuanto|cuanta|cuantos|cuantas|stock|inventario|existencias?|disponible|disponibles|tengo|hay|queda|quedan)\b/.test(normalized) &&
    !/\b(vender|vendio|vendieron|vendido|ventas?|pronostico|prediccion|demanda|reordenar|comprar)\b/.test(normalized);

  if (isStock) {
    const producto = extraerProductoStock(mensaje) || extraerProductoPorRuido(mensaje);
    if (producto) return { producto };
  }

  const directProductMatch = normalized.match(/^(?:y\s+)?(?:el|la|los|las)\s+(.+)$/);
  if (directProductMatch?.[1] && !/\b(stock|inventario|venta|comprar|reponer)\b/.test(directProductMatch[1])) {
    return { producto: directProductMatch[1].replace(/[?.!,;:]+$/g, '').trim() };
  }

  const lastAssistant = [...history].reverse().find((message) => message.role === 'assistant')?.content || '';
  const pendingStock = /nombre del producto|stock|inventario|existencias/i.test(lastAssistant);
  if (pendingStock && pareceNombreProducto(mensaje)) {
    return { producto: mensaje.trim() };
  }

  const looksLikeSkuName = pareceNombreProducto(mensaje) && /\b(\d+|kg|g|gr|l|lt|ml|und|unidad|unidades)\b/.test(normalized);
  if (looksLikeSkuName) {
    return { producto: mensaje.trim() };
  }

  return null;
}

function buscarInventariosPorProducto(inventarios, producto) {
  return ordenarCoincidencias(inventarios, producto, (inv) => inv.producto.nombre);
}

function buscarProductosPorNombre(productos, producto) {
  return ordenarCoincidencias(productos, producto, (p) => p.nombre);
}

function ordenarCoincidencias(items, query, getName) {
  const normalizedQuery = normalizarTexto(query).trim();
  if (!normalizedQuery) return [];

  return items
    .map((item) => {
      const name = normalizarTexto(getName(item));
      const tokens = name.split(/[^a-z0-9]+/).filter(Boolean);
      let score = 0;

      if (name === normalizedQuery) score = 4;
      else if (tokens.includes(normalizedQuery)) score = 3;
      else if (normalizedQuery.length >= 4 && name.includes(normalizedQuery)) score = 2;
      else if (normalizedQuery.length >= 4) {
        const tokenSimilarity = Math.max(...tokens.map((token) => similitudTexto(normalizedQuery, token)), 0);
        if (tokenSimilarity >= 0.78) score = 1;
      }

      return { item, score, name };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length)
    .map((entry) => entry.item);
}

function confianzaProducto(query, nombre) {
  const normalizedQuery = normalizarTexto(query);
  const normalizedName = normalizarTexto(nombre);
  if (normalizedQuery === normalizedName) return 1;
  if (normalizedName.includes(normalizedQuery)) return 0.92;
  const tokens = normalizedName.split(/[^a-z0-9]+/).filter(Boolean);
  return Math.max(...tokens.map((token) => similitudTexto(normalizedQuery, token)), 0);
}

function extraerProductoVentasHistoricas(mensaje) {
  const withoutPrefix = normalizarTexto(mensaje)
    .replace(/^.*?(?:se\s+)?(?:vendio|vendieron|vendido|vendida|vendidos|vendidas|ventas?)\s+(?:de\s+)?/, '')
    .replace(/[?.!,;:]+$/g, '')
    .trim();

  const producto = withoutPrefix
    .replace(/\s+(?:en\s+|durante\s+|del\s+|de\s+)?(?:el\s+|la\s+)?(?:ultimo|ultima|pasado|pasada|mes|semana|ayer).*$/i, '')
    .trim();

  return producto || null;
}

function detectarConsultaVentasHistoricas(mensaje) {
  const normalized = normalizarTexto(mensaje);
  const isFuture = /\b(voy|vamos|va|proxima|proximo|siguiente|pronostico|prediccion|demanda)\b/.test(normalized);
  const isHistorical =
    /\b(cuanto|cuanta|cuantos|cuantas|total|historial|historico|ventas?|vendio|vendieron|vendido|vendida|vendidos|vendidas)\b/.test(normalized) &&
    /\b(vendio|vendieron|vendido|vendida|vendidos|vendidas|ventas?)\b/.test(normalized);

  if (!isHistorical || isFuture) return null;

  const producto = extraerProductoVentasHistoricas(mensaje);
  if (!producto) return null;

  return { producto, dias: detectarDiasPeriodo(mensaje) || 30 };
}

function detectarConsultaPrediccion(mensaje) {
  const normalized = normalizarTexto(mensaje);
  const isPrediction =
    /\b(cuanto|cuanta|cuantos|cuantas|predecir|prediccion|pronostico|demanda)\b/.test(normalized) &&
    /\b(vender|venta|ventas|demanda|pronostico)\b/.test(normalized);

  if (!isPrediction) return null;

  const dias = detectarDiasPeriodo(mensaje) || 7;

  const productoMatch = mensaje.match(
    /(?:vender|ventas?|demanda|pron[oó]stico|predicci[oó]n)\s+(?:de\s+)?(.+?)(?:\s+(?:la|el|en|durante|para|por)\s+(?:pr[oó]xim[oa]|siguiente|esta|este|semana|mes|ma[nñ]ana)|\?|$)/i
  );

  const producto = productoMatch?.[1]?.trim().replace(/[?.!,;:]+$/g, '');
  if (!producto) return null;

  return { producto, dias };
}

function formatearResultadoTool(toolName, result, params = {}) {
  if (!result?.success) {
    if (result?.ambiguous) {
      return `${result.mensaje} Opciones: ${result.opciones.join(', ')}. Indica cuál necesitas.`;
    }
    const producto = params.producto || 'ese producto';
    if (toolName === 'consultar_stock') {
      return `No encuentro "${producto}" en tus productos registrados. Revisa si esta guardado con otro nombre o agregalo al catalogo.`;
    }

    if (toolName === 'consultar_ventas_producto') {
      return `No encuentro "${producto}" en tus productos registrados, asi que no puedo consultar sus ventas. Revisa si esta guardado con otro nombre o agregalo al catalogo.`;
    }

    if (toolName === 'predecir_demanda') {
      return `No encuentro "${producto}" en tus productos registrados, asi que todavia no puedo predecir sus ventas. Primero agregalo al catalogo/inventario y registra ventas; si ya existe con otro nombre, dime el nombre exacto.`;
    }

    return result?.mensaje || result?.error || 'No pude obtener esa informacion en este momento.';
  }

  if (toolName === 'predecir_demanda') {
    const data = result.data;
    return `Para ${data.producto}, la prediccion para los proximos ${data.horizonteDias} dias es de ${data.demandaPredicha} unidades. Stock actual: ${data.stockActual}. Cobertura estimada: ${data.diasCobertura} dias. Confianza: ${data.nivelConfianza}.`;
  }

  if (toolName === 'consultar_stock') {
    const items = result.data || [];
    if (items.length === 1) {
      const item = items[0];
      const estado = item.alerta ? ' Esta por debajo del minimo.' : '';
      return `Tienes ${item.stockActual} unidades de ${item.producto}. Stock minimo: ${item.stockMinimo}.${estado}`;
    }

    return items
      .map((item) => {
        const estado = item.alerta ? ' bajo minimo' : ' ok';
        return `${item.producto}: ${item.stockActual} unidades (minimo ${item.stockMinimo}, ${estado})`;
      })
      .join('\n');
  }

  if (toolName === 'consultar_ventas_producto') {
    const data = result.data;
    if (data.totalUnidades === 0) {
      return `No hay ventas registradas de ${data.producto} en los ultimos ${data.periodoDias} dias.`;
    }

    return `En los ultimos ${data.periodoDias} dias se vendieron ${data.totalUnidades} unidades de ${data.producto}, por un total de $${data.totalIngresos}. Promedio diario: ${data.promedioDiario} unidades.`;
  }

  if (toolName === 'producto_mas_vendido') {
    const { top, ranking, categoria, dias } = result.data;
    const alcance = categoria ? ` en la categoria "${categoria}"` : '';
    const periodo = dias ? ` en los ultimos ${dias} dias` : '';
    const resto = ranking.slice(1, 3)
      .map((item) => `${item.nombre} (${item.unidades})`)
      .join(', ');
    const siguientes = resto ? ` Le siguen: ${resto}.` : '';
    return `El producto mas vendido${alcance}${periodo} es ${top.nombre}, con ${top.unidades} unidades vendidas ($${top.ingresos} en ingresos).${siguientes}`;
  }

  if (toolName === 'producto_menos_vendido') {
    const { bottom, ranking, categoria, dias } = result.data;
    const alcance = categoria ? ` en la categoria "${categoria}"` : '';
    const periodo = dias ? ` en los ultimos ${dias} dias` : '';
    const resto = ranking.slice(1, 3)
      .map((item) => `${item.nombre} (${item.unidades})`)
      .join(', ');
    const siguientes = resto ? ` Le siguen: ${resto}.` : '';
    return `El producto menos vendido${alcance}${periodo} es ${bottom.nombre}, con ${bottom.unidades} unidades vendidas ($${bottom.ingresos} en ingresos).${siguientes}`;
  }

  if (toolName === 'sugerir_reorden') {
    const items = result.data || [];
    if (items.length === 0) return result.mensaje || 'No hay productos que necesiten reposición en este momento.';
    return items
      .slice(0, 10)
      .map((item) => `${item.producto}: stock ${item.stockActual}, ${item.stockMinimo != null ? `mínimo ${item.stockMinimo}, ` : ''}cantidad sugerida ${item.cantidadSugerida}.`)
      .join('\n');
  }

  return null;
}

class ChatService {
  constructor() {
    this.llm = null;
    this.conversationHistory = new Map();
    this.productContext = new Map();
    this.pendingIntents = new Map();
  }

  _getLLM() {
    if (!this.llm) {
      this.llm = createLLMProvider();
    }
    return this.llm;
  }

  _getHistory(userId) {
    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, []);
    }
    return this.conversationHistory.get(userId);
  }

  _addToHistory(userId, role, content, toolCalls = null, toolCallId = null) {
    const history = this._getHistory(userId);
    const message = { role, content };
    if (toolCalls) message.tool_calls = toolCalls;
    if (toolCallId) message.tool_call_id = toolCallId;
    history.push(message);
    if (history.length > 20) history.shift();
  }

  _rememberProduct(userId, producto, intent, tool) {
    if (!producto) return;
    const context = typeof producto === 'string'
      ? { id: null, nombre: producto }
      : {
          id: producto.id || producto.productoId || null,
          nombre: producto.nombre || (typeof producto.producto === 'string' ? producto.producto : producto.producto?.nombre),
        };
    if (context.nombre) {
      this.productContext.set(userId, { ...context, intent, tool });
      this.pendingIntents.delete(userId);
    }
  }

  _lastProduct(userId) {
    return this.productContext.get(userId)?.nombre || null;
  }

  _setPendingIntent(userId, intent) {
    this.pendingIntents.set(userId, { intent });
  }

  async _clasificarSemantico(mensaje, history) {
    const startedAt = Date.now();
    const response = await this._getLLM().chat([
      { role: 'system', content: CLASSIFIER_PROMPT },
      ...history.slice(-6),
      { role: 'user', content: mensaje },
    ], []);
    const classification = parsearClasificacion(response.content || '');
    console.log(`[CHAT] semantic_classifier: ${Date.now() - startedAt}ms intent=${classification.intent} product=${classification.product_query || 'none'} confidence=${classification.confidence.toFixed(2)}`);
    return classification;
  }

  _saveDirectExchange(userId, mensaje, respuesta) {
    this._addToHistory(userId, 'user', mensaje);
    this._addToHistory(userId, 'assistant', respuesta);
  }

  /**
   * PILOTO Fase 2 — STOCK unicamente.
   * Ollama + function calling es el interprete principal: decide intent, scope
   * y productName. El regex/interpretarMensaje NO participa en esta ruta.
   * Contexto reducido (validado por A/B test: subio tool-call rate de 33% a 83%
   * frente a pasar el historial completo, que ademas produjo respuestas
   * inventadas sin llamar ninguna tool): en vez del historial de conversacion,
   * se pasa solo el mensaje actual + una linea de sistema con el ultimo
   * producto mencionado (misma memoria que ya usa el flujo regex).
   * Si Ollama no llama a consultar_stock (otro intent, error de red, etc.),
   * devuelve null y el llamador cede al pipeline determinista existente.
   */
  /**
   * Resolver determinista de continuaciones contextuales, SOLO STOCK.
   * No es un clasificador nuevo: reutiliza `interpretation.productSource`,
   * ya calculado por interpretarMensaje() (regex existente, sin cambios).
   * `productSource === 'context'` significa que NINGUNA extraccion explicita
   * (regex de producto) encontro nada en el mensaje — el unico motivo por el
   * que sabemos el producto es lastProduct/lastIntent ya guardados. Eso es
   * justamente lo inequivoco: si el mensaje mencionara un producto o intent
   * distinto de forma explicita, productSource seria 'explicit' y este
   * resolver no se activa, cede a Ollama (ver _intentarStockConOllama).
   * Costo: cero llamadas a Ollama (ollama_ms=0).
   */
  async _resolverContinuacionStock(user, mensaje, interpretation) {
    if (interpretation.intent !== 'STOCK' || interpretation.productSource !== 'context' || !interpretation.productName) {
      return null;
    }

    const matchStartedAt = Date.now();
    const result = await tool_consultarStock({ user, producto: interpretation.productName });
    const matchMs = Date.now() - matchStartedAt;
    const matchedName = result.data?.[0]?.producto || null;
    console.log(`[CHAT][STOCK_CONTEXT_RESOLVER] ollama_ms=0 productName="${interpretation.productName}" matching=${matchMs}ms matched=${matchedName ? `"${matchedName}"` : 'ninguno'}`);

    const respuesta = formatearResultadoTool('consultar_stock', result, { producto: interpretation.productName });
    if (result.success) this._rememberProduct(user.id, result.data[0], 'STOCK', 'consultar_stock');
    return respuesta;
  }

  /**
   * Resuelve un estado 'AMBIGUOUS_INTENT' pendiente (guardado en el mismo
   * Map pendingIntents que ya existia para la aclaracion de purchase_decision,
   * solo con un valor distinto de `intent` como discriminador).
   *
   * Usa interpretation.detected — la etiqueta CRUDA que detectarIntencion()
   * ya calculo para ESTE mensaje de respuesta, sin regex nueva — para saber
   * cual de las dos lecturas ofrecidas eligio el usuario. El producto viene
   * de pendingIntent.producto (el turno ambiguo), no del contexto general,
   * que sigue apuntando al producto anterior a la ambiguedad.
   * Si el mensaje no aclara nada reconocible, devuelve null: el llamador
   * descarta el pendiente y sigue el flujo normal para este mensaje.
   */
  async _resolverAmbiguedadPendiente(user, pendingIntent, interpretation) {
    const producto = pendingIntent.producto;

    if (interpretation.detected === 'stock_query') {
      const result = await tool_consultarStock({ user, producto });
      const respuesta = formatearResultadoTool('consultar_stock', result, { producto });
      if (result.success) this._rememberProduct(user.id, result.data[0], 'STOCK', 'consultar_stock');
      this.pendingIntents.delete(user.id);
      console.log(`[CHAT][AMBIGUOUS_INTENT] resuelto=STOCK producto="${producto}" ollama_ms=0`);
      return respuesta;
    }

    if (interpretation.detected === 'purchase_decision') {
      const purchaseDecision = { producto, diasForecast: 30 };
      const result = await tool_decidirCompra({ user, ...purchaseDecision });
      const respuesta = formatearDecisionCompra(result, purchaseDecision);
      this._rememberProduct(user.id, result.data?.producto || producto, 'REORDER', 'decidir_compra');
      this.pendingIntents.delete(user.id);
      console.log(`[CHAT][AMBIGUOUS_INTENT] resuelto=REORDER producto="${producto}" ollama_ms=0`);
      return respuesta;
    }

    return null;
  }

  async _intentarStockConOllama(user, mensaje) {
    const ollamaStartedAt = Date.now();
    const lastProduct = this._lastProduct(user.id);
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
    if (lastProduct) {
      messages.push({ role: 'system', content: `Contexto: el ultimo producto que el usuario consulto fue "${lastProduct}".` });
    }
    messages.push({ role: 'user', content: mensaje });

    let response;
    try {
      response = await this._getLLM().chat(messages, TOOL_DEFINITIONS);
    } catch (err) {
      console.error(`[CHAT][STOCK_PILOT] ollama_error=${Date.now() - ollamaStartedAt}ms msg=${err.message}`);
      return null;
    }
    const ollamaMs = Date.now() - ollamaStartedAt;

    const toolCall = response.toolCalls?.[0];
    if (!toolCall || toolCall.function.name !== 'consultar_stock') {
      console.log(`[CHAT][STOCK_PILOT] ollama=${ollamaMs}ms tool=${toolCall?.function.name || 'ninguna'} -> no es STOCK, cede al flujo determinista`);
      return null;
    }

    const args = this._parseToolArguments(toolCall);
    const productName = (args.producto || '').trim() || null;
    console.log(`[CHAT][STOCK_PILOT] ollama=${ollamaMs}ms intent=STOCK scope=PRODUCT productName=${productName ? `"${productName}"` : 'null'}`);

    if (!productName) {
      return '¿De qué producto quieres consultar el stock?';
    }

    const matchStartedAt = Date.now();
    const result = await tool_consultarStock({ user, producto: productName });
    const matchMs = Date.now() - matchStartedAt;
    const matchedName = result.data?.[0]?.producto || null;
    console.log(`[CHAT][STOCK_PILOT] matching=${matchMs}ms candidatos=${result.data?.length || 0} matched=${matchedName ? `"${matchedName}"` : 'ninguno'}`);
    console.log(`[CHAT][STOCK_PILOT] total=${ollamaMs + matchMs}ms (ollama=${ollamaMs}ms + matching=${matchMs}ms)`);

    const respuesta = formatearResultadoTool('consultar_stock', result, { producto: productName });
    if (result.success) this._rememberProduct(user.id, result.data[0], 'STOCK', 'consultar_stock');
    return respuesta;
  }

  async procesarMensaje(user, mensaje) {
    const requestStartedAt = Date.now();
    const history = this._getHistory(user.id);
    const intentStartedAt = Date.now();
    const previousContext = this.productContext.get(user.id) || {};
    const interpretation = interpretarMensaje(mensaje, previousContext);
    const interpretationMs = Date.now() - intentStartedAt;
    let intent = interpretation.detected;
    console.log(`[CHAT] intent=${interpretation.intent} intentSource=${interpretation.intentSource} continuation=${interpretation.continuation} confidence=${interpretation.confidence.toFixed(2)} ms=${interpretation.timings.intentMs || interpretationMs}`);
    console.log(`[CHAT] productExtraction=${interpretation.productExtraction || 'none'} productMatching=${interpretation.productName || 'none'} productSource=${interpretation.productSource || 'none'} productConfidence=${interpretation.productConfidence.toFixed(2)} ms=${interpretation.timings.productExtractionMs}`);
    console.log(`[CHAT] contextUsed=${interpretation.contextUsed} previousIntent=${previousContext.intent || 'none'} previousProduct=${previousContext.nombre || 'none'} tool=${interpretation.tool || 'none'} ollama=0ms total=${Date.now() - requestStartedAt}ms`);
    let clarificationProduct = null;
    const pendingIntent = this.pendingIntents.get(user.id);

    if (pendingIntent?.intent === 'AMBIGUOUS_INTENT') {
      const resueltoAmbiguo = await this._resolverAmbiguedadPendiente(user, pendingIntent, interpretation);
      if (resueltoAmbiguo) {
        this._saveDirectExchange(user.id, mensaje, resueltoAmbiguo);
        console.log(`[CHAT] total=${Date.now() - requestStartedAt}ms (via AMBIGUOUS_INTENT_RESOLVER, ollama_ms=0)`);
        return resueltoAmbiguo;
      }
      this.pendingIntents.delete(user.id);
    }

    if (pendingIntent && pendingIntent.intent !== 'AMBIGUOUS_INTENT' && interpretation.intent === 'UNKNOWN') {
      clarificationProduct = extraerProductoAclaracion(mensaje);
      if (clarificationProduct) {
        intent = pendingIntent.intent;
        this.pendingIntents.delete(user.id);
      }
    }

    if (interpretation.intent === 'GREETING') {
      const respuesta = '¡Hola! ¿En qué puedo ayudarte con tu inventario?';
      this._saveDirectExchange(user.id, mensaje, respuesta);
      return respuesta;
    }

    if (intent === 'conversational') {
      const respuesta = '¡De nada! Estoy aquí para ayudarte.';
      this._saveDirectExchange(user.id, mensaje, respuesta);
      return respuesta;
    }

    if (interpretation.intent === 'HELP') {
      const respuesta = 'Puedo consultar stock, ventas, predicciones, alertas, reordenes y resúmenes de tu inventario.';
      this._saveDirectExchange(user.id, mensaje, respuesta);
      return respuesta;
    }

    const ambiguedad = detectarAmbiguedadIntencion(interpretation, previousContext);
    if (ambiguedad) {
      const respuesta = `¿Quieres saber cuánto stock tienes de ${ambiguedad.producto} o si deberías comprar más?`;
      this.pendingIntents.set(user.id, { intent: 'AMBIGUOUS_INTENT', producto: ambiguedad.producto });
      this._saveDirectExchange(user.id, mensaje, respuesta);
      console.log(`[CHAT][AMBIGUOUS_INTENT] producto="${ambiguedad.producto}" heredaria=${ambiguedad.intentHeredado} -> pidiendo aclaracion, ollama_ms=0, total=${Date.now() - requestStartedAt}ms`);
      return respuesta;
    }

    const contextoStock = await this._resolverContinuacionStock(user, mensaje, interpretation);
    if (contextoStock) {
      this._saveDirectExchange(user.id, mensaje, contextoStock);
      console.log(`[CHAT] total=${Date.now() - requestStartedAt}ms (via STOCK_CONTEXT_RESOLVER, ollama_ms=0)`);
      return contextoStock;
    }

    // TOP_PRODUCT / BOTTOM_PRODUCT: siempre scope GLOBAL, jamas necesitan
    // nombre de producto ni matching contra catalogo (regla 2). Resuelto
    // ANTES del piloto de Ollama porque el regex + el flip de direccion en
    // interpretarMensaje ya son inequivocos para ambos casos, fresh y
    // continuacion ("¿y el menos?") — igual principio que STOCK_CONTEXT_RESOLVER.
    if (RANKING_INTENTS.has(interpretation.intent)) {
      const esBottom = interpretation.intent === 'BOTTOM_PRODUCT';
      const toolName = esBottom ? 'producto_menos_vendido' : 'producto_mas_vendido';
      const toolStartedAt = Date.now();
      const result = esBottom ? await tool_productoMenosVendido({ user }) : await tool_productoMasVendido({ user });
      console.log(`[CHAT][RANKING] ollama_ms=0 tool=${Date.now() - toolStartedAt}ms (${toolName})`);
      const respuesta = formatearResultadoTool(toolName, result, {});
      if (result.success) {
        this._rememberProduct(user.id, esBottom ? result.data.bottom : result.data.top, interpretation.intent, toolName);
      }
      this._saveDirectExchange(user.id, mensaje, respuesta);
      console.log(`[CHAT] total=${Date.now() - requestStartedAt}ms (via RANKING, ollama_ms=0)`);
      return respuesta;
    }

    console.log(`[CHAT] regex_guess=${interpretation.intent} (comparacion diagnostica, no se usa para STOCK)`);
    const stockPiloto = await this._intentarStockConOllama(user, mensaje);
    if (stockPiloto) {
      this._saveDirectExchange(user.id, mensaje, stockPiloto);
      console.log(`[CHAT] total=${Date.now() - requestStartedAt}ms (via STOCK_PILOT)`);
      return stockPiloto;
    }

    if (interpretation.intent === 'SUMMARY') {
      const toolStartedAt = Date.now();
      const result = await tool_resumenDashboard({ user });
      console.log(`[CHAT] tool: ${Date.now() - toolStartedAt}ms (resumen_dashboard)`);
      const respuesta = formatearResumenDashboard(result);
      this._saveDirectExchange(user.id, mensaje, respuesta);
      console.log(`[CHAT] ollama: 0ms | total: ${Date.now() - requestStartedAt}ms`);
      return respuesta;
    }

    if (interpretation.intent === 'REORDER' && !interpretation.productName && intent !== 'purchase_decision') {
      const toolStartedAt = Date.now();
      const result = await tool_sugerirReorden({ user, diasForecast: 30 });
      const respuesta = formatearResultadoTool('sugerir_reorden', result);
      this._saveDirectExchange(user.id, mensaje, respuesta);
      console.log(`[CHAT] tool: ${Date.now() - toolStartedAt}ms (sugerir_reorden) | ollama: 0ms | total: ${Date.now() - requestStartedAt}ms`);
      return respuesta;
    }

    if (interpretation.intent === 'REORDER' || intent === 'purchase_decision') {
      const producto = limpiarProducto(clarificationProduct) || interpretation.productName;
      if (!producto) {
        const respuesta = '¿De qué producto quieres saber si conviene comprar más?';
        this._setPendingIntent(user.id, 'purchase_decision');
        this._saveDirectExchange(user.id, mensaje, respuesta);
        return respuesta;
      }

      const purchaseDecision = { producto, diasForecast: 30 };
      const toolStartedAt = Date.now();
      const result = await tool_decidirCompra({ user, ...purchaseDecision });
      console.log(`[CHAT] tool: ${Date.now() - toolStartedAt}ms (decidir_compra)`);
      const respuesta = formatearDecisionCompra(result, purchaseDecision);
      this._rememberProduct(user.id, result.data?.producto || producto, 'REORDER', 'decidir_compra');
      this._saveDirectExchange(user.id, mensaje, respuesta);
      console.log(`[CHAT] ollama: 0ms | total: ${Date.now() - requestStartedAt}ms`);
      return respuesta;
    }

    if (interpretation.intent === 'SALES') {
      const salesQuery = interpretation.productName ? {
        producto: interpretation.productName,
        dias: detectarDiasPeriodo(mensaje) || 30,
      } : null;
      if (!salesQuery) {
        const respuesta = '¿De qué producto quieres consultar las ventas?';
        this._saveDirectExchange(user.id, mensaje, respuesta);
        return respuesta;
      }
      const toolStartedAt = Date.now();
      const result = await tool_consultarVentasProducto({ user, ...salesQuery });
      console.log(`[CHAT] tool: ${Date.now() - toolStartedAt}ms (consultar_ventas_producto)`);
      const respuesta = formatearResultadoTool('consultar_ventas_producto', result, salesQuery);
      this._rememberProduct(user.id, result.data || salesQuery.producto, 'SALES', 'consultar_ventas_producto');
      this._saveDirectExchange(user.id, mensaje, respuesta);
      console.log(`[CHAT] ollama: 0ms | total: ${Date.now() - requestStartedAt}ms`);
      return respuesta;
    }

    if (interpretation.intent === 'PREDICTION') {
      if (!interpretation.productName) {
        const respuesta = 'Â¿De quÃ© producto quieres predecir la demanda?';
        this._saveDirectExchange(user.id, mensaje, respuesta);
        return respuesta;
      }
      const predictionQuery = { producto: interpretation.productName, dias: detectarDiasPeriodo(mensaje) || 7 };
      const toolStartedAt = Date.now();
      const result = await tool_predecirDemanda({ user, ...predictionQuery });
      console.log(`[CHAT] tool: ${Date.now() - toolStartedAt}ms (predecir_demanda)`);
      const respuesta = formatearResultadoTool('predecir_demanda', result, predictionQuery);
      this._rememberProduct(user.id, result.data || predictionQuery.producto, 'PREDICTION', 'predecir_demanda');
      this._saveDirectExchange(user.id, mensaje, respuesta);
      console.log(`[CHAT] ollama: 0ms | total: ${Date.now() - requestStartedAt}ms`);
      return respuesta;
    }

    if (interpretation.intent === 'STOCK') {
      const resolvedStockQuery = interpretation.productName ? { producto: interpretation.productName } : null;
      if (!resolvedStockQuery) {
        const respuesta = '¿De qué producto quieres consultar el stock?';
        this._saveDirectExchange(user.id, mensaje, respuesta);
        return respuesta;
      }
      const toolStartedAt = Date.now();
      const result = await tool_consultarStock({ user, ...resolvedStockQuery });
      const respuesta = formatearResultadoTool('consultar_stock', result, resolvedStockQuery);
      console.log(`[CHAT] tool: ${Date.now() - toolStartedAt}ms (consultar_stock)`);
      this._rememberProduct(user.id, result.data?.[0] || resolvedStockQuery.producto, 'STOCK', 'consultar_stock');
      this._saveDirectExchange(user.id, mensaje, respuesta);
      console.log(`[CHAT] ollama: 0ms | total: ${Date.now() - requestStartedAt}ms`);
      return respuesta;
    }

    if (intent === 'unknown' && esConsultaProductoSimple(mensaje)) {
      const productoStartedAt = Date.now();
      const producto = extraerProductoPorRuido(mensaje) || mensaje;
      const result = await tool_consultarStock({ user, producto });
      const matchedName = result.data?.[0]?.producto;
      const confidence = matchedName ? confianzaProducto(producto, matchedName) : 0;
      console.log(`[CHAT] product_matching: ${Date.now() - productoStartedAt}ms product=${matchedName || 'none'} confidence=${confidence.toFixed(2)} context=${this._lastProduct(user.id) || 'none'}`);
      const respuesta = formatearResultadoTool('consultar_stock', result, { producto });
      if (result.success) this._rememberProduct(user.id, result.data[0], 'stock_query', 'consultar_stock');
      this._saveDirectExchange(user.id, mensaje, respuesta);
      console.log(`[CHAT] tool: ${Date.now() - productoStartedAt}ms (consultar_stock) | ollama: 0ms | total: ${Date.now() - requestStartedAt}ms`);
      return respuesta;
    }

    let semantic = null;
    if (intent === 'unknown') {
      semantic = await this._clasificarSemantico(mensaje, history);
      console.log(`[CHAT] context: ${this._lastProduct(user.id) || 'none'}`);
      if (semantic.intent === 'stock' && semantic.confidence >= 0.70) {
        const producto = semantic.product_query || this._lastProduct(user.id);
        if (producto) {
          const toolStartedAt = Date.now();
          const result = await tool_consultarStock({ user, producto });
          const matchedName = result.data?.[0]?.producto;
          console.log(`[CHAT] product_matching: ${Date.now() - toolStartedAt}ms product=${matchedName || 'none'} confidence=${matchedName ? confianzaProducto(producto, matchedName).toFixed(2) : '0.00'}`);
          const respuesta = formatearResultadoTool('consultar_stock', result, { producto });
          if (result.success) this._rememberProduct(user.id, result.data[0], 'stock_query', 'consultar_stock');
          this._saveDirectExchange(user.id, mensaje, respuesta);
          console.log(`[CHAT] tool: ${Date.now() - toolStartedAt}ms (consultar_stock) | total: ${Date.now() - requestStartedAt}ms`);
          return respuesta;
        }
      }
      if (semantic.intent === 'purchase_decision' && semantic.confidence >= 0.70) {
        const producto = semantic.product_query || this._lastProduct(user.id);
        if (producto) {
          const toolStartedAt = Date.now();
          const result = await tool_decidirCompra({ user, producto, diasForecast: 30 });
          const respuesta = formatearDecisionCompra(result, { producto, diasForecast: 30 });
          if (result.success) this._rememberProduct(user.id, result.data.producto, 'purchase_decision', 'decidir_compra');
          this._saveDirectExchange(user.id, mensaje, respuesta);
          console.log(`[CHAT] tool: ${Date.now() - toolStartedAt}ms (decidir_compra) | total: ${Date.now() - requestStartedAt}ms`);
          return respuesta;
        }
      }
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: mensaje },
    ];

    const ollamaStartedAt = Date.now();
    const response = await this._getLLM().chat(messages, TOOL_DEFINITIONS);
    console.log(`[CHAT] ollama: ${Date.now() - ollamaStartedAt}ms`);

    this._addToHistory(user.id, 'user', mensaje);

    if (response.toolCalls && response.toolCalls.length > 0) {
      this._addToHistory(user.id, 'assistant', response.content, response.toolCalls);

      for (const toolCall of response.toolCalls) {
        const result = await this._ejecutarTool(toolCall, user);
        const params = this._parseToolArguments(toolCall);
        const directResponse = formatearResultadoTool(toolCall.function.name, result, params);
        this._addToHistory(user.id, 'tool', JSON.stringify(result), null, toolCall.id);

        if (directResponse) {
          this._addToHistory(user.id, 'assistant', directResponse);
          return directResponse;
        }
      }

      const finalOllamaStartedAt = Date.now();
      const finalResponse = await this._getLLM().chat(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          ...this._getHistory(user.id),
        ],
        TOOL_DEFINITIONS
      );
      console.log(`[CHAT] ollama_final: ${Date.now() - finalOllamaStartedAt}ms | total: ${Date.now() - requestStartedAt}ms`);

      this._addToHistory(user.id, 'assistant', finalResponse.content);
      return finalResponse.content;
    }

    this._addToHistory(user.id, 'assistant', response.content);
    return response.content;
  }

  async _ejecutarTool(toolCall, user) {
    const { name, arguments: args } = toolCall.function;
    const handler = TOOL_MAP[name];

    if (!handler) {
      return { success: false, error: `Herramienta desconocida: ${name}` };
    }

    try {
      const params = JSON.parse(args);
      return await handler({ user, ...params });
    } catch (err) {
      console.error(`[chat] Error en tool ${name}:`, err);
      return { success: false, error: err.message };
    }
  }

  _parseToolArguments(toolCall) {
    try {
      return JSON.parse(toolCall.function.arguments || '{}');
    } catch {
      return {};
    }
  }

  limpiarHistorial(userId) {
    this.conversationHistory.delete(userId);
    this.productContext.delete(userId);
    this.pendingIntents.delete(userId);
  }
}

module.exports = new ChatService();
module.exports.__testables = {
  detectarIntencion,
  extraerProductoDecision,
  extraerProductoAclaracion,
  normalizarTexto,
  esConsultaProductoSimple,
  confianzaProducto,
  parsearClasificacion,
  extraerProductoPorRuido,
  extraerProductoVentas,
  limpiarProducto,
  interpretarMensaje,
  parseMessage,
  validateParsedIntent,
  TOOL_DEFINITIONS,
  tool_consultarStock,
  SYSTEM_PROMPT,
  detectarAmbiguedadIntencion,
  direccionRanking,
  esConsultaRankingVentas,
  tool_productoMasVendido,
  tool_productoMenosVendido,
};
