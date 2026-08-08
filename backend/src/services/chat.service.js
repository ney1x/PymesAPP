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
];

async function tool_consultarStock({ user, producto }) {
  const inventarios = await inventarioService.list(user, {});
  const matches = buscarInventariosPorProducto(inventarios, producto);

  if (matches.length === 0) {
    return { success: false, mensaje: `No encontré productos que coincidan con "${producto}"` };
  }

  return {
    success: true,
    data: matches.map((m) => ({
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

async function tool_resumenDashboard({ user }) {
  const dashboard = await dashboardService.get(user, {});

  return {
    success: true,
    data: {
      resumen: dashboard.resumen,
      ventasUltimos7Dias: dashboard.ventasPorDia,
      topProductos: dashboard.topProductos.map((p) => ({
        id: p.id,
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
};

function normalizarTexto(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function detectarDiasPeriodo(mensaje) {
  const normalized = normalizarTexto(mensaje);
  if (/\b(manana|ayer)\b/.test(normalized)) return 1;
  if (/\b(proxima semana|siguiente semana|esta semana|ultima semana|semana)\b/.test(normalized)) return 7;
  if (/\b(proximo mes|siguiente mes|este mes|ultimo mes|mes)\b/.test(normalized)) return 30;
  return null;
}

function pareceNombreProducto(mensaje) {
  const normalized = normalizarTexto(mensaje).trim();
  if (!normalized || normalized.length > 80) return false;
  if (/[?¿]/.test(mensaje)) return false;
  return !/\b(cuanto|cuanta|cuantos|cuantas|stock|tengo|hay|queda|quedan|vender|vendio|ventas|dashboard|resumen|reordenar|comprar)\b/.test(normalized);
}

function extraerProductoStock(mensaje) {
  const normalized = normalizarTexto(mensaje)
    .replace(/[?.!,;:]+$/g, '')
    .trim();

  const match = normalized.match(
    /(?:stock|inventario|existencias?|disponible|disponibles|tengo|hay|queda|quedan)\s+(?:de\s+|del\s+|la\s+|el\s+)?(.+)$/
  );
  if (match?.[1]) return match[1].replace(/^unidades?\s+(?:de\s+)?/, '').trim();

  const deMatch = normalized.match(/\bde\s+(.+)$/);
  if (deMatch?.[1]) return deMatch[1].trim();

  return null;
}

function detectarConsultaStock(mensaje, history = []) {
  const normalized = normalizarTexto(mensaje);
  const isStock =
    /\b(cuanto|cuanta|cuantos|cuantas|stock|inventario|existencias?|disponible|disponibles|tengo|hay|queda|quedan)\b/.test(normalized) &&
    !/\b(vender|vendio|vendieron|vendido|ventas?|pronostico|prediccion|demanda|reordenar|comprar)\b/.test(normalized);

  if (isStock) {
    const producto = extraerProductoStock(mensaje);
    if (producto) return { producto };
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

      return { item, score, name };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length)
    .map((entry) => entry.item);
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

  return null;
}

class ChatService {
  constructor() {
    this.llm = null;
    this.conversationHistory = new Map();
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

  async procesarMensaje(user, mensaje) {
    const history = this._getHistory(user.id);

    const historicalSales = detectarConsultaVentasHistoricas(mensaje);
    if (historicalSales) {
      const result = await tool_consultarVentasProducto({ user, ...historicalSales });
      const respuesta = formatearResultadoTool('consultar_ventas_producto', result, historicalSales);
      this._addToHistory(user.id, 'user', mensaje);
      this._addToHistory(user.id, 'assistant', respuesta);
      return respuesta;
    }

    const directPrediction = detectarConsultaPrediccion(mensaje);
    if (directPrediction) {
      const result = await tool_predecirDemanda({ user, ...directPrediction });
      const respuesta = formatearResultadoTool('predecir_demanda', result, directPrediction);
      this._addToHistory(user.id, 'user', mensaje);
      this._addToHistory(user.id, 'assistant', respuesta);
      return respuesta;
    }

    const stockQuery = detectarConsultaStock(mensaje, history);
    if (stockQuery) {
      const result = await tool_consultarStock({ user, ...stockQuery });
      const respuesta = formatearResultadoTool('consultar_stock', result, stockQuery);
      this._addToHistory(user.id, 'user', mensaje);
      this._addToHistory(user.id, 'assistant', respuesta);
      return respuesta;
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: mensaje },
    ];

    const response = await this._getLLM().chat(messages, TOOL_DEFINITIONS);

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

      const finalResponse = await this._getLLM().chat(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          ...this._getHistory(user.id),
        ],
        TOOL_DEFINITIONS
      );

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
  }
}

module.exports = new ChatService();
