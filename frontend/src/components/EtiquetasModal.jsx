import React, { useMemo, useState, useEffect } from 'react';
import { Modal, Button } from './ui';
import { imprimirEtiquetas, esCodigoInterno } from '../lib/barcode';
import { etiquetaDeProducto } from './CodigoBarras';
import { modoVentaTexto } from '../constants/unidades';

// Impresión masiva de etiquetas: elegís productos (por defecto, los que
// tienen código interno — los que no traen código de fábrica), cuántas
// copias de cada uno, y salen todas en un solo diálogo de impresión.
export default function EtiquetasModal({ open, onClose, productos = [] }) {
  const conCodigo = useMemo(
    () => productos.filter((p) => p.codigo && p.nombre),
    [productos]
  );
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [copias, setCopias] = useState(1);
  const [soloInternos, setSoloInternos] = useState(true);

  // Al abrir (o cambiar el catálogo), preseleccionar los códigos internos.
  useEffect(() => {
    if (!open) return;
    setSeleccion(new Set(conCodigo.filter((p) => esCodigoInterno(p.codigo)).map((p) => p.id)));
    setCopias(1);
  }, [open, conCodigo]);

  const visibles = soloInternos ? conCodigo.filter((p) => esCodigoInterno(p.codigo)) : conCodigo;

  const toggle = (id) =>
    setSeleccion((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const todosVisiblesMarcados = visibles.length > 0 && visibles.every((p) => seleccion.has(p.id));
  const toggleTodos = () =>
    setSeleccion((s) => {
      const n = new Set(s);
      if (todosVisiblesMarcados) visibles.forEach((p) => n.delete(p.id));
      else visibles.forEach((p) => n.add(p.id));
      return n;
    });

  const elegidos = conCodigo.filter((p) => seleccion.has(p.id));
  const copiasNum = Math.max(1, Math.min(50, Number(copias) || 1));
  const totalEtiquetas = elegidos.length * copiasNum;

  const imprimir = () => {
    if (elegidos.length === 0) return;
    const items = [];
    for (const p of elegidos) {
      const et = etiquetaDeProducto(p);
      for (let i = 0; i < copiasNum; i++) items.push(et);
    }
    imprimirEtiquetas(items);
    onClose();
  };

  return (
    <Modal open={open} title="Imprimir etiquetas" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        Etiqueta = nombre + precio + cómo se vende ("por libra", "por unidad"…) + código de
        barras. Para productos sin código de fábrica: pan, bombones, granel, tornillos.
      </p>

      {conCodigo.length === 0 ? (
        <div className="alert alert-info">Ningún producto tiene código todavía. Generá uno desde el producto.</div>
      ) : (
        <>
          <div className="form-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <label className="checkbox-row" style={{ margin: 0 }}>
              <input type="checkbox" checked={soloInternos} onChange={(e) => setSoloInternos(e.target.checked)} />
              Solo códigos generados por nosotros
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={toggleTodos}>
              {todosVisiblesMarcados ? 'Ninguno' : 'Todos'}
            </button>
          </div>

          <ul className="list-card" style={{ maxHeight: 280, overflowY: 'auto', marginTop: 8 }}>
            {visibles.map((p) => (
              <li key={p.id} className="rank-item">
                <label className="checkbox-row" style={{ margin: 0, flex: 1 }}>
                  <input type="checkbox" checked={seleccion.has(p.id)} onChange={() => toggle(p.id)} />
                  <span className="rank-info">
                    <strong>{p.nombre}</strong>
                    <small>{p.codigo} · {modoVentaTexto(p)}</small>
                  </span>
                </label>
              </li>
            ))}
            {visibles.length === 0 && (
              <li className="rank-item"><small className="muted">Nada para mostrar con este filtro.</small></li>
            )}
          </ul>

          <div className="form-row" style={{ alignItems: 'flex-end', marginTop: 12 }}>
            <div className="form-group" style={{ maxWidth: 140 }}>
              <label htmlFor="et-copias">Copias por producto</label>
              <input
                id="et-copias"
                type="number"
                min="1"
                max="50"
                value={copias}
                onChange={(e) => setCopias(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <Button
                type="button"
                className="btn-block"
                disabled={elegidos.length === 0}
                onClick={imprimir}
              >
                Imprimir {totalEtiquetas} etiqueta{totalEtiquetas === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
