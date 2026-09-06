import React from 'react';

/*
 * Marca "Inventario". El monograma son tres barras ascendentes dentro de un
 * contenedor implícito — lee como niveles de stock y como tendencia/predicción
 * a la vez, que es exactamente lo que hace el producto. Las dos primeras barras
 * heredan currentColor (blanco sobre el rail navy, navy sobre fondo claro); la
 * tercera, la más alta, va en dorado: el acento único del sistema.
 */
export function LogoMark({ size = 26, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      role="img"
      aria-label="Inventario"
      className={className}
    >
      <rect
        x="1"
        y="1"
        width="26"
        height="26"
        rx="7"
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="1.5"
      />
      <rect x="6.5" y="15.5" width="4" height="6" rx="1.4" fill="currentColor" />
      <rect x="12" y="11" width="4" height="10.5" rx="1.4" fill="currentColor" fillOpacity="0.6" />
      <rect x="17.5" y="6.5" width="4" height="15" rx="1.4" fill="var(--accent, #D99000)" />
    </svg>
  );
}

export function Wordmark({ className }) {
  return <strong className={className}>Inventario</strong>;
}

export default LogoMark;
