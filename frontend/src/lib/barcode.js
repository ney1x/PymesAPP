import JsBarcode from 'jsbarcode';

// Códigos de barras internos: el comercio los genera e imprime para
// productos que no traen código de fábrica (granel, pan, bombones,
// tornillos…).
//
// Formato EAN-13 con prefijo 2 — el rango 20–29 está reservado por GS1 para
// "uso dentro del comercio", nunca sale al mundo ni choca con un código real
// de fábrica. 12 dígitos de carga + 1 dígito verificador.

const digitoEAN13 = (doce) => {
  const suma = doce
    .split('')
    .reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return String((10 - (suma % 10)) % 10);
};

/**
 * Genera un EAN-13 interno. Estructura del cuerpo (12 díg):
 *   2 + PYME(3) + segundos(6) + aleatorio(2)
 * El componente aleatorio evita choques si se generan dos en el mismo
 * segundo; de todas formas el backend tiene `@@unique([pymeId, codigo])`.
 */
export function generarCodigoInterno(pymeId = 0) {
  const pyme = String(Math.abs(Number(pymeId) || 0) % 1000).padStart(3, '0');
  const seg = String(Math.floor(Date.now() / 1000) % 1_000_000).padStart(6, '0');
  const rnd = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  const cuerpo = `2${pyme}${seg}${rnd}`.slice(0, 12).padEnd(12, '0');
  return cuerpo + digitoEAN13(cuerpo);
}

// Un código "hecho por nosotros" (o autogenerado) vs uno de fábrica.
export const esCodigoInterno = (codigo) =>
  /^2\d{12}$/.test(String(codigo || '')) || /^(PROD|IMP)-/i.test(String(codigo || ''));

const formatoDe = (codigo) => {
  if (/^\d{13}$/.test(codigo)) return 'EAN13';
  if (/^\d{12}$/.test(codigo)) return 'UPC';
  if (/^\d{8}$/.test(codigo)) return 'EAN8';
  return 'CODE128';
};

/** Devuelve el markup <svg> de un código de barras (para imprimir o mostrar). */
export function svgDeCodigo(codigo, opts = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const base = { displayValue: true, fontSize: 13, height: 48, margin: 6, width: 2 };
  try {
    JsBarcode(el, String(codigo), { format: formatoDe(codigo), ...base, ...opts });
  } catch {
    // p. ej. un "EAN-13" con verificador inválido introducido a mano
    JsBarcode(el, String(codigo), { format: 'CODE128', ...base, ...opts });
  }
  return el.outerHTML;
}

const escaparHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Abre el diálogo de impresión con una o varias etiquetas.
 * `items`: [{ nombre, precioTexto, modoTexto, codigo, extra }]
 * Usa un iframe oculto — no lo bloquean los popup blockers y no hay
 * scripts embebidos.
 */
export function imprimirEtiquetas(items) {
  const lista = (Array.isArray(items) ? items : [items]).filter((it) => it && it.codigo);
  if (lista.length === 0) return;

  const etiquetas = lista
    .map(
      (it) => `
      <div class="et">
        <div class="et-nombre">${escaparHtml(it.nombre)}</div>
        ${it.precioTexto || it.modoTexto
          ? `<div class="et-linea">${
              [it.precioTexto, it.modoTexto].filter(Boolean).map(escaparHtml).join(' &middot; ')
            }</div>`
          : ''}
        <div class="et-cod">${svgDeCodigo(it.codigo, { height: 44, fontSize: 12 })}</div>
        ${it.extra ? `<div class="et-extra">${escaparHtml(it.extra)}</div>` : ''}
      </div>`
    )
    .join('');

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);

  const doc = frame.contentDocument || frame.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>
    *{box-sizing:border-box;}
    body{margin:0;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;}
    .et{width:50mm;padding:3mm;text-align:center;display:inline-block;vertical-align:top;page-break-inside:avoid;}
    .et-nombre{font-size:11px;font-weight:600;line-height:1.2;}
    .et-linea{font-size:12px;font-weight:700;margin-top:1mm;}
    .et-cod{margin-top:1mm;}
    .et-cod svg{max-width:100%;height:auto;}
    .et-extra{font-size:9px;color:#555;margin-top:0.5mm;}
    @media print{@page{margin:6mm;}}
  </style></head><body>${etiquetas}</body></html>`);
  doc.close();

  frame.contentWindow.focus();
  setTimeout(() => {
    try {
      frame.contentWindow.print();
    } finally {
      setTimeout(() => frame.remove(), 1500);
    }
  }, 250);
}
