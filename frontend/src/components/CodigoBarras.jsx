import React from 'react';
import { Button, money } from './ui';
import { generarCodigoInterno, imprimirEtiquetas } from '../lib/barcode';
import { modoVentaTexto } from '../constants/unidades';

// Precio para la etiqueta: "$4.500 / lb" para granel, "$4.500" si no.
export function precioParaEtiqueta(prod) {
  if (prod?.granel && prod?.unidadVenta) return `${money(prod.precioVenta)} / ${prod.unidadVenta}`;
  return money(prod?.precioVenta);
}

// Un producto -> el item que espera imprimirEtiquetas (nombre + precio +
// "por libra"/"por unidad" + código).
export const etiquetaDeProducto = (prod) => ({
  nombre: prod.nombre,
  precioTexto: precioParaEtiqueta(prod),
  modoTexto: modoVentaTexto(prod),
  codigo: prod.codigo,
});

// Botón "Generar": rellena el campo `codigo` con un código interno nuevo.
export function BotonGenerarCodigo({ pymeId, onGenerar, disabled }) {
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={disabled}
      onClick={() => onGenerar(generarCodigoInterno(pymeId))}
    >
      Generar
    </Button>
  );
}

// Enlace "imprimir etiqueta" de UN producto (nombre + precio + cómo se
// vende + código de barras).
export function ImprimirEtiqueta({ producto, className = '' }) {
  if (!producto?.codigo || !producto?.nombre) return null;
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm ${className}`.trim()}
      onClick={() => imprimirEtiquetas([etiquetaDeProducto(producto)])}
    >
      Ver / imprimir etiqueta
    </button>
  );
}
