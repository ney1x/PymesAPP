/*
 * IMPECCABLE DIRECTION CONTRACT
 * THESIS: Alertas deja de repetir el mismo producto en dos tarjetas separadas
 *   ("bajo stock" y "recomendaciones de compra") y se vuelve un solo tablero
 *   ordenado por urgencia — un vistazo, de lo más grave a lo más leve.
 * OWN-WORLD: se hereda el sistema "Ledger digital" sin cambios — navy
 *   #122a47, cards blancas, badges por tono, list-card/rank-item ya usados
 *   en Dashboard. Ningún componente, paleta ni tipografía nueva.
 * STORY: el dueño abre Alertas antes de llamar al proveedor y en un solo
 *   vistazo, sin cruzar dos tarjetas, sabe qué está mal y cuánto comprar de
 *   cada producto, del más urgente al menos urgente.
 * FIRST VIEWPORT: una sola card a lo ancho, "Alertas de reposición", con una
 *   lista ordenada por déficit real (stock vs. mínimo configurado, o vs.
 *   punto de reorden calculado por demanda); cada fila trae el producto, por
 *   qué se marcó, y cuánto comprar si aplica.
 * FORM: dirección elegida por el usuario entre las 3 propias + 1 reto
 *   externo de la tirada de concept-seed (el reto "tablero de salidas
 *   ranked-by-time" le ganó en claridad a mis 7 candidatos propios — solo se
 *   tomó su disciplina estructural, lista única, nunca su vestuario visual
 *   de tablero físico), seed key alertasredesign1.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with
 *   the finish review, the verdict, DESIGN.md, and every shipping raster
 *   carrying its provenance.
 */
import React, { useState, useMemo } from 'react';
import { inventarioApi, reordenApi, pymesApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBox, PageHeader, Badge, EmptyState } from '../components/ui';

export default function Alertas() {
  const [filtroPymeId, setFiltroPymeId] = useState('');

  const pymes = useAsync(() => pymesApi.list());

  const bajoStock = useAsync(
    () => inventarioApi.list({ alertas: 'true', ...(filtroPymeId ? { pymeId: filtroPymeId } : {}) }),
    [filtroPymeId]
  );

  const reorden = useAsync(
    () => reordenApi.list(filtroPymeId ? { pymeId: filtroPymeId } : {}),
    [filtroPymeId]
  );

  const loading = bajoStock.loading || reorden.loading;
  const error = bajoStock.error || reorden.error;

  // Un mismo producto suele aparecer en las dos fuentes (bajo el mínimo
  // configurado a mano, y/o bajo el punto de reorden que calcula la demanda
  // estimada) — se combinan en una sola fila por producto, y se ordena por
  // el déficit más profundo de las dos señales, la peor primero.
  const alertas = useMemo(() => {
    const porProducto = new Map();

    for (const inv of bajoStock.data?.inventarios || []) {
      porProducto.set(inv.producto.id, {
        id: inv.producto.id,
        nombre: inv.producto.nombre,
        stockActual: inv.stockActual,
        bajoMinimo: true,
        stockMinimo: inv.stockMinimo,
        deficit: inv.stockMinimo > 0 ? (inv.stockMinimo - inv.stockActual) / inv.stockMinimo : 1,
      });
    }

    for (const r of reorden.data?.reorden || []) {
      if (!r.comprar) continue;
      const existente = porProducto.get(r.producto.id) || {
        id: r.producto.id,
        nombre: r.producto.nombre,
        stockActual: r.stockActual,
        bajoMinimo: false,
        deficit: 0,
      };
      existente.comprar = true;
      existente.cantidad = r.cantidad;
      existente.puntoReorden = r.puntoReorden;
      existente.leadTimeDias = r.leadTimeDias;
      const deficitReorden = r.puntoReorden > 0 ? (r.puntoReorden - r.stockActual) / r.puntoReorden : 1;
      existente.deficit = Math.max(existente.deficit, deficitReorden);
      porProducto.set(r.producto.id, existente);
    }

    return Array.from(porProducto.values()).sort((a, b) => b.deficit - a.deficit);
  }, [bajoStock.data, reorden.data]);

  // Compartido entre el spotlight (solo la #1) y cada fila de la lista
  // completa — la misma regla de "cuándo mostrar cifra vs. pedir que la
  // defina a mano" no puede bifurcarse entre los dos lugares donde se pinta.
  const evaluarAlerta = (a) => {
    const critico = a.stockActual === 0;
    const mostrarCifra = a.comprar && a.cantidad > 0;
    const sinCifraCalculable = !mostrarCifra && (a.bajoMinimo || a.comprar);
    return { critico, mostrarCifra, sinCifraCalculable };
  };

  const peor = alertas[0];
  const peorEval = peor ? evaluarAlerta(peor) : null;

  return (
    <div data-impeccable-seed="alertasredesign1">
      <PageHeader
        title="Alertas"
        subtitle="Qué reponer, ordenado del más urgente al menos urgente."
        actions={
          (pymes.data?.pymes?.length ?? 0) > 0 && (
            <select value={filtroPymeId} onChange={(e) => setFiltroPymeId(e.target.value)}>
              <option value="">Todas mis PYMES</option>
              {pymes.data?.pymes?.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          )
        }
      />

      {error && <ErrorBox error={error} />}

      {!loading && peor && (
        <div className="alerta-spotlight">
          <span className="alerta-spotlight-label">
            Prioridad #1{peorEval.critico && <span className="alerta-spotlight-agotado">Agotado</span>}
          </span>
          <div className="alerta-spotlight-body">
            <strong className="alerta-spotlight-nombre">{peor.nombre}</strong>
            <span className="alerta-spotlight-detalle">
              Actual {peor.stockActual}
              {peor.bajoMinimo && ` · Mínimo ${peor.stockMinimo}`}
              {peor.comprar && ` · Punto de reorden ${Math.round(peor.puntoReorden)} · Lead time ${peor.leadTimeDias} días`}
            </span>
          </div>
          {peorEval.mostrarCifra ? (
            <div className="alerta-spotlight-cifra">
              <strong>{Math.round(peor.cantidad)}</strong>
              <span>uds a pedir ya</span>
            </div>
          ) : peorEval.sinCifraCalculable ? (
            <span className="alerta-spotlight-fallback">Sin historial · definí la cantidad</span>
          ) : null}
        </div>
      )}

      <div className="card card--static">
        <div className="card-title">Alertas de reposición</div>
        <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
          Combina el stock mínimo configurado con la demanda estimada (30
          días) y el tiempo de entrega del proveedor.
        </p>
        {loading ? (
          <Spinner label="Cargando alertas..." />
        ) : alertas.length === 0 ? (
          <EmptyState
            title="Todo en orden"
            message="Ningún producto necesita atención por ahora."
          />
        ) : (
          <ul className="list-card list-card--static">
            {alertas.map((a, i) => {
              // Agotado (0 unidades) es la única línea que no admite matiz —
              // se lo gana el mismo tratamiento que ya usa el sistema para
              // "esto necesita tu atención ya" (notif-entry.unread), no un
              // color nuevo.
              const { critico, mostrarCifra, sinCifraCalculable } = evaluarAlerta(a);
              return (
                <li
                  className={`rank-item animate-slide-in-right${critico ? ' alerta-critica' : ''}`}
                  key={a.id}
                  style={{ animationDelay: `${Math.min(i, 7) * 40}ms` }}
                >
                  <div className="rank-info">
                    <strong>{a.nombre}</strong>
                    <small>
                      Actual {a.stockActual}
                      {a.bajoMinimo && ` · Mínimo ${a.stockMinimo}`}
                      {a.comprar && ` · Punto de reorden ${Math.round(a.puntoReorden)} · Lead time ${a.leadTimeDias} días`}
                    </small>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {a.bajoMinimo && <Badge tone="danger">Bajo stock</Badge>}
                    {mostrarCifra && (
                      <div className="alerta-comprar-cifra">
                        <strong>{Math.round(a.cantidad)}</strong>
                        <span>uds a pedir</span>
                      </div>
                    )}
                    {sinCifraCalculable && (
                      <span className="alerta-comprar-fallback">Sin historial · definí la cantidad</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
