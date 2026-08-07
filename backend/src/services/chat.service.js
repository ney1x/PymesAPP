const fs = require('fs');
const path = require('path');
const { createLLMProvider } = require('../lib/llm');
const inventarioService = require('./inventario.service');
const prediccionesService = require('./predicciones.service');
const productosService = require('./productos.service');
const reordenService = require('./reorden.service');
const dashboardService = require('./dashboard.service');

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
      description: 'Lista productos con stock bajo (stockActual <= stockMinimo). Usa cuando el usuario pregunta qué falta, qué está bajo, alertas, productos críticos. NO necesitas pymeId, se usa el del usuario autenticado.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'predecir_demanda',
      description: 'Predice la demanda futura de un producto (usa motor LightGBM). Usa cuando el usuario pregunta "cuánto voy a vender", "predicción", "demanda futura", "pronóstico". NO necesitas pymeId, se usa el del usuario autenticado.',
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
      description: 'Sugiere cantidades de reorden para productos que necesitan reposición. Usa cuando el usuario pregunta "qué comprar", "qué reordenar", "sugerencia de compra", "lista de compras". NO necesitas pymeId, se usa el del usuario autenticado. El parámetro diasForecast es opcional (default 30). LLAMA A ESTA HERRAMIENTA SIN PEDIR MÁS DATOS.',
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
      name: 'resumen_dashboard',
      description: 'Resumen general del negocio: ingresos, margen, productos totales, alertas de stock, top productos, ranking de rentabilidad. Usa para "cómo va todo", "resumen", "dashboard", "panorama general". NO necesitas pymeId, se usa el del usuario autenticado. NO TIENE PARÁMETROS. LLAMA A ESTA HERRAMIENTA DIRECTAMENTE.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

async function tool_consultarStock({ user, producto }) {
  const inventarios = await inventarioService.list(user, {});
  const matches = inventarios.filter((inv) =>
    inv.producto.nombre.toLowerCase().includes(producto.toLowerCase())
  );

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
  const match = inventarios.find((inv) =>
    inv.producto.nombre.toLowerCase().includes(producto.toLowerCase())
  );

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
  const productos = await productosService.list(user, { search: producto });
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
  resumen_dashboard: tool_resumenDashboard,
};

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
        this._addToHistory(user.id, 'tool', JSON.stringify(result), null, toolCall.id);
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

  limpiarHistorial(userId) {
    this.conversationHistory.delete(userId);
  }
}

module.exports = new ChatService();