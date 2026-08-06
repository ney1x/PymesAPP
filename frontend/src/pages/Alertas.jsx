import React, { useState } from 'react';
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

  const paraComprar = (reorden.data?.reorden || []).filter((r) => r.comprar);

  if (loading) return <Spinner label="Cargando alertas..." />;

  return (
    <div>
      <PageHeader
        title="Alertas"
        subtitle="Bajo stock y recomendaciones de compra según la demanda estimada."
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

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Recomendaciones de compra</div>
          <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
            Con base en la demanda estimada (30 días), el tiempo de entrega
            del proveedor y el stock de seguridad de cada producto.
          </p>
          {paraComprar.length === 0 ? (
            <EmptyState
              title="Nada urgente por ahora"
              message="Ningún producto necesita reabastecimiento según la demanda estimada."
            />
          ) : (
            <ul className="list-card">
              {paraComprar.map((r) => (
                <li className="rank-item" key={r.producto.id}>
                  <div className="rank-info">
                    <strong>{r.producto.nombre}</strong>
                    <small>
                      Stock actual {r.stockActual} · Punto de reorden {r.puntoReorden} ·
                      Lead time {r.leadTimeDias} días
                    </small>
                  </div>
                  <Badge tone="danger">Comprar {r.cantidad} uds</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card-title">Bajo stock</div>
          <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
            Productos con stock actual por debajo del mínimo configurado.
          </p>
          {!bajoStock.data?.inventarios?.length ? (
            <EmptyState title="Todo en orden" message="Ningún producto está por debajo del stock mínimo." />
          ) : (
            <ul className="list-card">
              {bajoStock.data.inventarios.map((inv) => (
                <li className="rank-item" key={inv.id}>
                  <div className="rank-info">
                    <strong>{inv.producto.nombre}</strong>
                    <small>Mínimo {inv.stockMinimo} · Actual {inv.stockActual}</small>
                  </div>
                  <Badge tone="danger">Bajo stock</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
