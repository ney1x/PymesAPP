import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi, pymesApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { usePymeFilter } from '../context/PymeFilterContext';
import { Spinner, ErrorBox, StatCard, PageHeader, EmptyState, money } from '../components/ui';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

export default function Dashboard() {
  const { user } = useAuth();
  const { pymeSeleccionada: filtroPymeId, setPymeSeleccionada: setFiltroPymeId } = usePymeFilter();
  const [filtroSedeId, setFiltroSedeId] = useState('');
  const pymes = useAsync(() => pymesApi.list());
  const sedes = useAsync(
    () => (filtroPymeId ? pymesApi.sedes.list(filtroPymeId) : Promise.resolve({ sedes: [] })),
    [filtroPymeId]
  );
  const { data, loading, error } = useAsync(
    () => dashboardApi.get({ ...(filtroPymeId ? { pymeId: filtroPymeId } : {}), ...(filtroSedeId ? { sedeId: filtroSedeId } : {}) }),
    [filtroPymeId, filtroSedeId]
  );

  const handleFiltroPyme = (value) => {
    setFiltroPymeId(value);
    setFiltroSedeId('');
  };
  const [focusedRowIndex, setFocusedRowIndex] = useState(-1);
  const focusedList = useRef('table');

  // Keyboard navigation effect - must run before early returns
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Get current data from closure
      const currentData = data?.data;
      const topProductos = currentData?.topProductos;
      const productosBajoStock = currentData?.productosBajoStock;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (focusedList.current === 'table') {
          setFocusedRowIndex(prev => Math.min(prev + 1, (topProductos?.length || 0) - 1));
        } else {
          setFocusedRowIndex(prev => Math.min(prev + 1, (productosBajoStock?.length || 0) - 1));
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (focusedList.current === 'table') {
          setFocusedRowIndex(prev => Math.max(prev - 1, -1));
        } else {
          setFocusedRowIndex(prev => Math.max(prev - 1, -1));
        }
      } else if (e.key === 'Tab') {
        if (focusedList.current === 'table') {
          e.preventDefault();
          focusedList.current = 'list';
          setFocusedRowIndex(0);
        } else {
          e.preventDefault();
          focusedList.current = 'table';
          setFocusedRowIndex(0);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [data?.data?.topProductos, data?.data?.productosBajoStock]);

  if (loading) return <Spinner label="Cargando dashboard..." />;
  if (error) return <ErrorBox error={error} />;
  if (!data?.data) return null;

  const { resumen, ventasPorDia, topProductos, productosBajoStock, rankingRentabilidad, comparativaSedes = [] } = data.data;
  const productoUrgente = productosBajoStock[0];
  const oportunidad = rankingRentabilidad[0];
  const productosConConfianza = rankingRentabilidad.filter((item) => typeof item.nivelConfianza === 'number');
  const confianzaPromedio = productosConConfianza.length
    ? productosConConfianza.reduce((sum, item) => sum + item.nivelConfianza, 0) / productosConConfianza.length
    : null;
  const demandaPromedio = rankingRentabilidad.length
    ? rankingRentabilidad.reduce((sum, item) => sum + (Number(item.demandaPredicha) || 0), 0) / rankingRentabilidad.length
    : 0;

  const interpretarDemanda = (demanda) => {
    if (!demandaPromedio) return 'Revisar tendencia antes de comprar';
    if (demanda > demandaPromedio) return 'Considerar aumentar stock';
    if (demanda < demandaPromedio) return 'Evitar sobreabastecer';
    return 'Mantener stock';
  };

  const confianzaLabel = confianzaPromedio === null
    ? 'Sin datos de confianza'
    : `${(confianzaPromedio * 100).toFixed(0)}% promedio`;

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title={`Hola, ${user?.nombre?.split(' ')[0] || 'comerciante'}`}
        subtitle="Decisiones clave para tu negocio hoy."
        actions={
          (pymes.data?.pymes?.length ?? 0) > 0 && (
            <>
              <select value={filtroPymeId} onChange={(e) => handleFiltroPyme(e.target.value)}>
                <option value="">Todas mis PYMES</option>
                {pymes.data?.pymes?.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              {filtroPymeId && (sedes.data?.sedes?.length ?? 0) > 1 && (
                <select value={filtroSedeId} onChange={(e) => setFiltroSedeId(e.target.value)}>
                  <option value="">Todas las sedes</option>
                  {sedes.data.sedes.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              )}
            </>
          )
        }
      />

      <section className="dashboard-decision-grid dashboard-decision-grid-compact" aria-label="Decisiones principales">
        <div className={`dashboard-decision-card dashboard-decision-urgent${productoUrgente ? '' : ' dashboard-decision-ok'}`}>
          <span className="dashboard-decision-label">Reponer ahora</span>
          {productoUrgente ? (
            <>
              <strong>{productoUrgente.nombre}</strong>
              <small>Actual: {productoUrgente.stockActual} · Mínimo: {productoUrgente.stockMinimo}</small>
              {productoUrgente.cantidadSugerida && <small>Sugerido: {productoUrgente.cantidadSugerida} uds</small>}
              <Link to="/inventario" className="btn btn-outline">Revisar inventario</Link>
            </>
          ) : (
            <>
              <strong>Sin urgencias</strong>
              <small>No hay productos por debajo del stock mínimo.</small>
              <Link to="/inventario" className="btn btn-outline">Ver inventario</Link>
            </>
          )}
        </div>

        <div className="dashboard-decision-card">
          <span className="dashboard-decision-label">Mejor oportunidad</span>
          {oportunidad ? (
            <>
              <strong>{oportunidad.nombre}</strong>
              <small>Rentabilidad estimada: {money(oportunidad.rentabilidadPredicha)}</small>
              <small>{interpretarDemanda(Number(oportunidad.demandaPredicha) || 0)}</small>
            </>
          ) : (
            <>
              <strong>Sin predicciones aún</strong>
              <small>Genera predicciones para priorizar productos.</small>
              <Link to="/predicciones" className="btn btn-outline">Generar predicción</Link>
            </>
          )}
        </div>

        <div className="dashboard-decision-card">
          <span className="dashboard-decision-label">Confianza de predicciones</span>
          <strong>{confianzaLabel}</strong>
          <small>
            {confianzaPromedio === null
              ? 'No hay confianza disponible en los datos actuales.'
              : 'Usa esta señal como apoyo antes de reponer.'}
          </small>
        </div>
      </section>

      <div className="stat-grid dashboard-kpis">
        <StatCard label="Ingresos (histórico)" value={money(resumen.ingresos)} hint="Total vendido" />
        <StatCard label="Margen bruto" value={money(resumen.margenBruto)} hint="Utilidad estimada" tone="success" />
        <StatCard label="Unidades vendidas" value={resumen.unidadesVendidas} />
      </div>

      <div className="dashboard-columns">
        <div className="dashboard-column">
          <div className="card animate-fade-in-up delay-1">
            <div className="card-title">Ventas de los últimos 7 días</div>
            {ventasPorDia.length === 0 ? (
              <EmptyState
                title="Sin ventas recientes"
                message="Registra ventas para ver la tendencia de ingresos."
              />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={ventasPorDia}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#dde1e6" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => money(v)} labelStyle={{ color: '#151e2c' }} />
                  <Bar dataKey="ingresos" name="Ingresos" fill="#122a47" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {filtroPymeId && comparativaSedes.length > 1 && (
            <div className="card animate-fade-in-up delay-2">
              <div className="card-title">Comparativa entre sedes</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Sede</th><th>Unidades</th><th>Ingresos</th><th>Día más fuerte</th></tr>
                  </thead>
                  <tbody>
                    {comparativaSedes.map((s) => {
                      const diaFuerte = s.porDiaSemana.reduce((a, b) => (b.unidades > a.unidades ? b : a), s.porDiaSemana[0]);
                      return (
                        <tr key={s.sedeId ?? 'sin-sede'}>
                          <td><strong>{s.nombre}</strong></td>
                          <td>{s.unidades}</td>
                          <td>{money(s.ingresos)}</td>
                          <td>{diaFuerte.unidades > 0 ? diaFuerte.dia : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card animate-fade-in-up delay-3">
            <div className="card-title">
              Productos destacados
              <Link to="/productos" className="btn btn-outline">Gestionar</Link>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Mejor producto / Más vendido</th><th>Unidades vendidas</th><th>Ingresos</th></tr>
                </thead>
                <tbody>
                  {topProductos.length === 0 ? (
                    <tr>
                      <td colSpan="3">
                        <EmptyState
                          title="Sin ventas registradas"
                          message="Registra ventas para identificar productos destacados."
                        />
                      </td>
                    </tr>
                  ) : (
                    topProductos.map((p, i) => (
                      <tr key={p.id} className="animate-fade-in" style={{ animationDelay: `${i * 50}ms`, backgroundColor: focusedRowIndex === i && focusedList.current === 'table' ? 'var(--primary-soft)' : undefined }} tabIndex={0} onClick={() => { focusedList.current = 'table'; setFocusedRowIndex(i); }} onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                        }
                      }}>
                        <td>{p.nombre}</td>
                        <td>{p.unidades}</td>
                        <td>{money(p.ingresos)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="dashboard-column">
          <div className="card animate-fade-in-up delay-2">
            <div className="card-title">
              Predicciones para decidir stock
              <Link to="/predicciones" className="btn btn-outline">Ver todo</Link>
            </div>
            {rankingRentabilidad.length === 0 ? (
              <EmptyState
                title="Aún no hay predicciones"
                message="Genera predicciones para saber qué productos convienen más."
              />
            ) : (
              <ul className="list-card list-card-preview">
                {rankingRentabilidad.slice(0, 5).map((item, i) => (
                  <li className="rank-item animate-slide-in-right" style={{ animationDelay: `${i * 60}ms`, backgroundColor: focusedRowIndex === i && focusedList.current === 'list' ? 'var(--primary-soft)' : undefined }} tabIndex={0} onClick={() => { focusedList.current = 'list'; setFocusedRowIndex(i); }} onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                    }
                  }} key={item.id}>
                    <span className="rank-pos">{i + 1}</span>
                    <div className="rank-info">
                      <strong>{item.nombre}</strong>
                      <small>Demanda estimada: {item.demandaPredicha} uds</small>
                      <small>{interpretarDemanda(Number(item.demandaPredicha) || 0)}</small>
                    </div>
                    <div className="dashboard-rank-metric">
                      <strong>{money(item.rentabilidadPredicha)}</strong>
                      {typeof item.nivelConfianza === 'number' && (
                        <small>Confianza {(item.nivelConfianza * 100).toFixed(0)}%</small>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card dashboard-alert-card animate-fade-in-up delay-4">
            <div className="card-title">
              Alertas de inventario
              <Link to="/inventario" className="btn btn-outline">Revisar</Link>
            </div>
            {productosBajoStock.length === 0 ? (
              <EmptyState title="Todo bajo control" message="No hay productos por debajo del stock mínimo." />
            ) : (
              <ul className="list-card">
                {productosBajoStock.map((p, i) => (
                  <li className="rank-item dashboard-alert-item animate-slide-in-right" style={{ animationDelay: `${i * 60}ms`, backgroundColor: focusedRowIndex === i && focusedList.current === 'list' ? 'var(--primary-soft)' : undefined }} tabIndex={0} onClick={() => { focusedList.current = 'list'; setFocusedRowIndex(i); }} onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                    }
                  }} key={p.id}>
                    <div className="rank-info">
                      <strong>{p.nombre}</strong>
                      <small>Reponer ahora</small>
                      <small>Actual: {p.stockActual} · Mínimo: {p.stockMinimo}</small>
                      {p.cantidadSugerida && <small>Sugerido: {p.cantidadSugerida} uds</small>}
                    </div>
                    <Link to="/inventario" className="btn btn-outline">Revisar inventario</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
