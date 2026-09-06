import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi, pymesApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { usePymeFilter } from '../context/PymeFilterContext';
import { Spinner, ErrorBox, PageHeader, EmptyState, money, moneyCompact } from '../components/ui';
import { IconAlert } from '../components/Icons';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

// Rangos de la gráfica de ventas. `bucket` es solo para el subtítulo; el
// backend ya manda cada serie agrupada y con sus etiquetas de eje listas.
// `interval` adelgaza las etiquetas del eje X cuando hay muchas barras
// (0 = mostrar todas).
const RANGOS_VENTAS = [
  { id: 'semana', label: 'Semana', bucket: 'por día · últimos 7 días', interval: 0 },
  { id: 'mes', label: 'Mes', bucket: 'por día · últimos 30 días', interval: 4 },
  { id: 'trimestre', label: 'Trimestre', bucket: 'por semana · últimas 13 semanas', interval: 1 },
  { id: 'anio', label: 'Año', bucket: 'por mes · últimos 12 meses', interval: 0 },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { pymeSeleccionada: filtroPymeId } = usePymeFilter();
  const [filtroSedeId, setFiltroSedeId] = useState('');
  const [rangoVentas, setRangoVentas] = useState('semana');
  const sedes = useAsync(
    () => (filtroPymeId ? pymesApi.sedes.list(filtroPymeId) : Promise.resolve({ sedes: [] })),
    [filtroPymeId]
  );
  const { data, loading, error } = useAsync(
    () => dashboardApi.get({ ...(filtroPymeId ? { pymeId: filtroPymeId } : {}), ...(filtroSedeId ? { sedeId: filtroSedeId } : {}) }),
    [filtroPymeId, filtroSedeId]
  );

  // La PYME se elige desde el switcher del rail (Layout.jsx), no acá — al
  // cambiar, la sede filtrada de la PYME anterior ya no aplica.
  useEffect(() => {
    setFiltroSedeId('');
  }, [filtroPymeId]);
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

  const { resumen, ventasPorDia, ventasSeries, topProductos, productosBajoStock, rankingRentabilidad, comparativaSedes = [] } = data.data;
  const rangoActual = RANGOS_VENTAS.find((r) => r.id === rangoVentas) || RANGOS_VENTAS[0];
  // Fallback por si la respuesta viene de un backend previo sin `ventasSeries`.
  const serieVentas = ventasSeries?.[rangoVentas]
    ?? ventasPorDia.map((d) => ({ ...d, key: d.fecha, label: d.fecha }));
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
        subtitle="El estado de tu negocio y las decisiones que conviene tomar hoy."
        actions={
          filtroPymeId && (sedes.data?.sedes?.length ?? 0) > 1 && (
            <select value={filtroSedeId} onChange={(e) => setFiltroSedeId(e.target.value)}>
              <option value="">Todas las sedes</option>
              {sedes.data.sedes.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          )
        }
      />

      <section className="dash-kpis" aria-label="Indicadores del negocio">
        {resumen.ingresos !== undefined && (
          <div className="dash-kpi">
            <span className="dash-kpi-label">Ingresos (histórico)</span>
            <span className="dash-kpi-value">{money(resumen.ingresos)}</span>
            <span className="dash-kpi-hint">Total vendido</span>
          </div>
        )}
        {resumen.margenBruto !== undefined && (
          <div className="dash-kpi dash-kpi-accent">
            <span className="dash-kpi-label">Margen bruto</span>
            <span className="dash-kpi-value">{money(resumen.margenBruto)}</span>
            <span className="dash-kpi-hint">Utilidad estimada</span>
          </div>
        )}
        <div className="dash-kpi">
          <span className="dash-kpi-label">Unidades vendidas</span>
          <span className="dash-kpi-value">{resumen.unidadesVendidas}</span>
          <span className="dash-kpi-hint">{resumen.numeroProductos} productos activos</span>
        </div>
        <div className={`dash-kpi dash-kpi-alert${resumen.alertasStock === 0 ? ' dash-kpi-clear' : ''}`}>
          <span className="dash-kpi-label">Alertas de stock</span>
          <span className="dash-kpi-value">{resumen.alertasStock}</span>
          <span className="dash-kpi-hint">
            {resumen.alertasStock === 0 ? 'Todo por encima del mínimo' : 'Productos bajo el mínimo'}
          </span>
        </div>
      </section>

      {resumen.ingresos !== undefined && (
        <div className="card dash-chart-card">
          <div className="card-title">
            <span>Ventas <span className="dash-chart-sub">{rangoActual.bucket}</span></span>
            <div className="chart-range" role="group" aria-label="Rango de la gráfica de ventas">
              {RANGOS_VENTAS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`chart-range-btn${rangoVentas === r.id ? ' active' : ''}`}
                  aria-pressed={rangoVentas === r.id}
                  onClick={() => setRangoVentas(r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {serieVentas.every((d) => !d.ingresos) ? (
            <EmptyState
              title="Sin ventas en este período"
              message="Registra ventas o elige un rango más amplio para ver la tendencia de ingresos."
            />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={serieVentas} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D9E2EC" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#556C82' }}
                  axisLine={{ stroke: '#D9E2EC' }}
                  tickLine={false}
                  interval={rangoActual.interval}
                  tickMargin={8}
                  minTickGap={6}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#556C82' }}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                  tickFormatter={(v) => moneyCompact(v)}
                />
                <Tooltip
                  formatter={(v) => money(v)}
                  labelFormatter={(l) => (rangoVentas === 'trimestre' ? `Semana del ${l}` : l)}
                  cursor={{ fill: 'rgba(16, 42, 67, 0.05)' }}
                  contentStyle={{ borderRadius: 10, border: '1px solid #D9E2EC', boxShadow: '0 4px 12px rgba(16,42,67,0.08)', fontSize: 12 }}
                  labelStyle={{ color: '#172B4D', fontWeight: 600 }}
                />
                <Bar dataKey="ingresos" name="Ingresos" fill="#102A43" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      <section className="dashboard-decision-grid dashboard-decision-grid-compact animate-fade-in-up delay-2" aria-label="Decisiones principales">
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

      <div className="dashboard-columns">
        <div className="dashboard-column">
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

          <div className={`card dashboard-alert-card animate-fade-in-up delay-4${productosBajoStock.length === 0 ? ' dashboard-alert-card-ok' : ''}`}>
            <div className="card-title">
              <span>
                Alertas de inventario
                {productosBajoStock.length > 0 && <span className="dashboard-alert-count">{productosBajoStock.length}</span>}
              </span>
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
                    <IconAlert size={15} className="dashboard-alert-icon" aria-hidden="true" />
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
