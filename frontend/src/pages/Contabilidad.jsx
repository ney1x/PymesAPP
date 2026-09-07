import React, { useState, useEffect, useMemo } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { contabilidadApi, gastosApi, pymesApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { usePymeFilter } from '../context/PymeFilterContext';
import { puede } from '../constants/permisos';
import {
  Spinner, ErrorBox, PageHeader, EmptyState, Modal, Button, IconButton, money, moneyCompact, date,
} from '../components/ui';
import { IconPlus, IconEdit, IconTrash } from '../components/Icons';
import {
  ComposedChart, Bar, Line, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';

const RANGOS = [
  { id: 'este-mes', label: 'Este mes' },
  { id: 'mes-pasado', label: 'Mes pasado' },
  { id: 'trimestre', label: 'Trimestre' },
  { id: 'anio', label: 'Año' },
  { id: 'personalizado', label: 'Personalizado' },
];

// Etiqueta legible para las categorías de gasto (la BD guarda MAYÚSCULAS).
const CAT_LABEL = {
  ARRIENDO: 'Arriendo',
  NOMINA: 'Nómina',
  SERVICIOS: 'Servicios',
  MERCADERIA: 'Mercadería / reposición',
  IMPUESTOS: 'Impuestos',
  TRANSPORTE: 'Transporte',
  COMISIONES: 'Comisiones y bancarios',
  MANTENIMIENTO: 'Mantenimiento',
  MARKETING: 'Marketing',
  OTRO: 'Otro',
};
const catLabel = (c) => CAT_LABEL[c] || c;

const CHART_TOOLTIP = {
  borderRadius: 10, border: '1px solid #D9E2EC',
  boxShadow: '0 4px 12px rgba(16,42,67,0.08)', fontSize: 12,
};

// Firma numérica: monto con signo y color semántico (ingreso verde / egreso
// rojo apagado). El signo, no solo el color, comunica la dirección.
function Cifra({ tipo, children, className = '' }) {
  const signo = tipo === 'ingreso' ? '+' : tipo === 'egreso' ? '−' : '';
  return <span className={`conta-cifra conta-cifra-${tipo} ${className}`.trim()}>{signo}{children}</span>;
}

const emptyGasto = { categoria: 'ARRIENDO', descripcion: '', monto: '', fecha: '', sedeId: '' };
const OTRA = '__otra__';

export default function Contabilidad() {
  const { pymes } = useOutletContext();
  const { pymeSeleccionada: filtroPymeId } = usePymeFilter();

  const [rango, setRango] = useState('este-mes');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [filtroSedeId, setFiltroSedeId] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyGasto);
  const [otraCat, setOtraCat] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [toast, setToast] = useState(null);
  const [duplicando, setDuplicando] = useState(false);

  const pymeActual = pymes.data?.pymes?.find((p) => String(p.id) === String(filtroPymeId));
  const puedeGestionar = !!filtroPymeId && puede(pymeActual?.miRoles, 'gestionarGastos');

  const sedes = useAsync(
    () => (filtroPymeId ? pymesApi.sedes.list(filtroPymeId) : Promise.resolve({ sedes: [] })),
    [filtroPymeId]
  );

  useEffect(() => { setFiltroSedeId(''); }, [filtroPymeId]);

  // Parámetros comunes de período para ambas consultas (panel + lista de gastos).
  const rangoParams = useMemo(() => {
    if (rango === 'personalizado') {
      return desde && hasta ? { desde: new Date(desde).toISOString(), hasta: new Date(hasta + 'T23:59:59').toISOString() } : {};
    }
    return { rango };
  }, [rango, desde, hasta]);

  const params = {
    ...(filtroPymeId ? { pymeId: filtroPymeId } : {}),
    ...(filtroSedeId ? { sedeId: filtroSedeId } : {}),
    ...rangoParams,
  };
  const paramsKey = JSON.stringify(params);

  const { data, loading, error, run } = useAsync(() => contabilidadApi.get(params), [paramsKey]);
  const gastos = useAsync(
    () => (rango === 'personalizado' && !(desde && hasta) ? Promise.resolve({ gastos: [], categorias: [] }) : gastosApi.list(params)),
    [paramsKey]
  );

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const recargar = () => { run(); gastos.run(); };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyGasto, fecha: new Date().toISOString().slice(0, 10) });
    setOtraCat(false);
    setActionError(null);
    setModalOpen(true);
  };

  const openEdit = (g) => {
    setEditing(g);
    setForm({
      categoria: g.categoria,
      descripcion: g.descripcion || '',
      monto: g.monto,
      fecha: new Date(g.fecha).toISOString().slice(0, 10),
      sedeId: g.sede?.id ? String(g.sede.id) : '',
    });
    setOtraCat(false);
    setActionError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setActionError(null);
    const payload = {
      pymeId: Number(filtroPymeId),
      categoria: form.categoria,
      descripcion: form.descripcion.trim() || null,
      monto: Number(form.monto),
      fecha: form.fecha ? new Date(form.fecha).toISOString() : undefined,
      ...(form.sedeId ? { sedeId: Number(form.sedeId) } : { sedeId: null }),
    };
    try {
      if (editing) await gastosApi.update(editing.id, payload);
      else await gastosApi.create(payload);
      setModalOpen(false);
      recargar();
      showToast(editing ? 'Gasto actualizado' : 'Gasto registrado');
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (g) => {
    if (!window.confirm(`¿Eliminar el gasto "${g.descripcion || catLabel(g.categoria)}" de ${money(g.monto)}?`)) return;
    try {
      await gastosApi.remove(g.id);
      recargar();
      showToast('Gasto eliminado');
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleDuplicarMes = async () => {
    if (duplicando) return;
    if (!window.confirm('Se copiarán los gastos del mes pasado a este mes (arriendo, nómina, servicios, etc.). ¿Continuar?')) return;
    setDuplicando(true);
    try {
      const res = await gastosApi.duplicarMes({ pymeId: Number(filtroPymeId), ...(filtroSedeId ? { sedeId: Number(filtroSedeId) } : {}) });
      recargar();
      showToast(`${res.creados} gasto(s) copiado(s) del mes pasado`);
    } catch (err) {
      showToast(err.message);
    } finally {
      setDuplicando(false);
    }
  };

  if (loading) return <Spinner label="Cargando contabilidad..." />;
  if (error) return <ErrorBox error={error} />;
  if (!data?.data) return null;

  const c = data.data;
  const { resumen, comparativa = {}, serie, gastosPorCategoria = [], rentabilidadProductos = [], rentabilidadCategorias = [], inventario, proyeccion, sedes: sedesResumen = [] } = c;
  const catList = gastos.data?.categorias || Object.keys(CAT_LABEL);
  const listaGastos = gastos.data?.gastos || [];

  const sinDatos = resumen.ingresos === 0 && resumen.gastos === 0 && resumen.costoVentas === 0;
  const netaPositiva = resumen.utilidadNeta >= 0;

  // `bueno`: hacia dónde es "mejor". Para ingresos/utilidad, subir es bueno
  // (verde); para gastos, subir es lo malo (se invierte el color).
  const varChip = (v, bueno = 'sube') => {
    if (v === null || v === undefined) return null;
    const positivo = bueno === 'sube' ? v > 0 : v < 0;
    const cls = v === 0 ? 'conta-var-flat' : positivo ? 'conta-var-up' : 'conta-var-down';
    return <span className={`conta-var ${cls}`}>{v > 0 ? '▲' : v < 0 ? '▼' : '='} {Math.abs(v)}%</span>;
  };

  const serieChart = (serie?.buckets || []).map((b) => ({
    label: b.label,
    Ingresos: b.ingresos,
    Egresos: b.egresos,
    Utilidad: b.utilidadNeta,
  }));

  const catChart = gastosPorCategoria.map((g) => ({
    name: catLabel(g.categoria),
    total: g.total,
    pct: g.pct,
  }));

  // El Modal se renderiza fuera de .animate-fade-in-up: el transform de esa
  // animación crea un contexto que rompe el position:fixed del overlay.
  return (
    <div>
      <div className="animate-fade-in-up">
      <PageHeader
        title="Contabilidad"
        subtitle="El resultado del negocio en el período: qué entró, qué salió y cuánto quedó."
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

      <div className="conta-periodo">
        <div className="chart-range" role="group" aria-label="Período de la contabilidad">
          {RANGOS.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`chart-range-btn${rango === r.id ? ' active' : ''}`}
              aria-pressed={rango === r.id}
              onClick={() => setRango(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
        {rango === 'personalizado' && (
          <div className="conta-fechas">
            <input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" />
            <span className="muted">a</span>
            <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" />
          </div>
        )}
      </div>

      {!filtroPymeId && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          Estás viendo la contabilidad consolidada de todas tus PYMES. Elegí una PYME puntual en el selector de la izquierda para registrar gastos.
        </div>
      )}

      {sinDatos ? (
        <div className="card">
          <EmptyState
            title="Sin movimientos en este período"
            message="Registra ventas y gastos, o elige un rango más amplio, para ver el resultado del negocio."
          />
        </div>
      ) : (
        <>
          {/* Banda héroe: ¿ganó o perdió plata? */}
          <div className={`conta-hero${netaPositiva ? '' : ' conta-hero-perdida'}`}>
            <div className="conta-hero-main">
              <span className="conta-hero-label">Utilidad neta · {c.periodo?.etiqueta || 'período'}</span>
              <span className="conta-hero-value">{money(resumen.utilidadNeta)}</span>
              <span className="conta-hero-sub">
                Margen neto {resumen.margenNetoPct}% {varChip(comparativa.utilidadNeta?.variacionPct)}
              </span>
            </div>
            <div className="conta-hero-formula">
              <span><Cifra tipo="ingreso">{money(resumen.ingresos)}</Cifra><small>Ingresos</small></span>
              <span className="conta-hero-op">−</span>
              <span><Cifra tipo="egreso">{money(resumen.costoVentas)}</Cifra><small>Costo de ventas</small></span>
              <span className="conta-hero-op">−</span>
              <span><Cifra tipo="egreso">{money(resumen.gastos)}</Cifra><small>Gastos</small></span>
              <span className="conta-hero-op">=</span>
              <span><strong className={netaPositiva ? 'conta-neta-ok' : 'conta-neta-mal'}>{money(resumen.utilidadNeta)}</strong><small>Utilidad neta</small></span>
            </div>
          </div>

          {/* KPIs */}
          <section className="conta-kpis" aria-label="Indicadores financieros">
            <div className="conta-kpi">
              <span className="conta-kpi-label">Ingresos</span>
              <span className="conta-kpi-value conta-ingreso">{money(resumen.ingresos)}</span>
              <span className="conta-kpi-hint">{resumen.numFacturas} ventas · ticket {money(resumen.ticketPromedio)} {varChip(comparativa.ingresos?.variacionPct)}</span>
            </div>
            <div className="conta-kpi">
              <span className="conta-kpi-label">Costo de mercadería vendida</span>
              <span className="conta-kpi-value conta-egreso">{money(resumen.costoVentas)}</span>
              <span className="conta-kpi-hint">{resumen.unidadesVendidas} unidades vendidas</span>
            </div>
            <div className="conta-kpi">
              <span className="conta-kpi-label">Utilidad bruta</span>
              <span className="conta-kpi-value">{money(resumen.utilidadBruta)}</span>
              <span className="conta-kpi-hint">Margen bruto {resumen.margenBrutoPct}%</span>
            </div>
            <div className="conta-kpi">
              <span className="conta-kpi-label">Gastos operativos</span>
              <span className="conta-kpi-value conta-egreso">{money(resumen.gastos)}</span>
              <span className="conta-kpi-hint">{gastosPorCategoria.length} categorías {varChip(comparativa.gastos?.variacionPct, 'baja')}</span>
            </div>
          </section>

          {/* Tendencia ingreso vs. egreso */}
          <div className="card conta-chart-card">
            <div className="card-title">
              <span>Ingresos vs. egresos <span className="dash-chart-sub">por {serie?.granularidad || 'día'}</span></span>
            </div>
            {serieChart.every((d) => !d.Ingresos && !d.Egresos) ? (
              <EmptyState title="Sin datos para graficar" message="No hay ingresos ni egresos en el rango elegido." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={serieChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#D9E2EC" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#556C82' }} axisLine={{ stroke: '#D9E2EC' }} tickLine={false} tickMargin={8} minTickGap={8} />
                  <YAxis tick={{ fontSize: 11, fill: '#556C82' }} axisLine={false} tickLine={false} width={64} tickFormatter={(v) => moneyCompact(v)} />
                  <Tooltip formatter={(v, n) => [money(v), n]} cursor={{ fill: 'rgba(16, 42, 67, 0.05)' }} contentStyle={CHART_TOOLTIP} labelStyle={{ color: '#172B4D', fontWeight: 600 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Ingresos" fill="#102A43" radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
                  <Bar dataKey="Egresos" fill="#C9A98C" radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
                  <Line type="monotone" dataKey="Utilidad" stroke="#B87A00" strokeWidth={2} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="dashboard-columns">
            {/* Gastos */}
            <div className="dashboard-column">
              <div className="card">
                <div className="card-title">
                  <span>Gastos por categoría</span>
                  {puedeGestionar && (
                    <div className="row-actions">
                      <Button variant="outline" onClick={handleDuplicarMes} loading={duplicando}>Duplicar mes anterior</Button>
                      <Button onClick={openCreate}><IconPlus size={14} /> Registrar gasto</Button>
                    </div>
                  )}
                </div>

                {gastosPorCategoria.length === 0 ? (
                  <EmptyState
                    title="Sin gastos registrados"
                    message={puedeGestionar ? 'Registra arriendo, nómina, servicios e impuestos para ver la utilidad neta real.' : 'Aún no hay gastos cargados en este período.'}
                  />
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={Math.max(120, catChart.length * 38 + 12)}>
                      <BarChart data={catChart} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap="30%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#D9E2EC" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11, fill: '#556C82' }} axisLine={{ stroke: '#D9E2EC' }} tickLine={false} tickFormatter={(v) => moneyCompact(v)} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#172B4D' }} axisLine={false} tickLine={false} width={128} interval={0} />
                        <Tooltip formatter={(v) => money(v)} cursor={{ fill: 'rgba(16, 42, 67, 0.05)' }} contentStyle={CHART_TOOLTIP} />
                        <Bar dataKey="total" name="Gasto" fill="#C9A98C" radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="table-wrap" style={{ marginTop: 12 }}>
                      <table>
                        <thead><tr><th>Categoría</th><th>Monto</th><th>% del total</th></tr></thead>
                        <tbody>
                          {gastosPorCategoria.map((g) => (
                            <tr key={g.categoria}>
                              <td>{catLabel(g.categoria)}</td>
                              <td><Cifra tipo="egreso">{money(g.total)}</Cifra></td>
                              <td>{g.pct}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              <div className="card">
                <div className="card-title">Gastos del período</div>
                {listaGastos.length === 0 ? (
                  <EmptyState title="Sin gastos" message="No hay gastos en este período." />
                ) : (
                  <ul className="list-card list-card-preview">
                    {listaGastos.map((g) => (
                      <li className="rank-item" key={g.id}>
                        <div className="rank-info">
                          <strong>{g.descripcion || catLabel(g.categoria)}</strong>
                          <small>{catLabel(g.categoria)} · {date(g.fecha)}{g.sede ? ` · ${g.sede.nombre}` : ''}</small>
                        </div>
                        <div className="dashboard-rank-metric">
                          <Cifra tipo="egreso">{money(g.monto)}</Cifra>
                        </div>
                        {puedeGestionar && (
                          <div className="row-actions" style={{ marginLeft: 10 }}>
                            <IconButton variant="outline" label="Editar gasto" tooltip="Editar" onClick={() => openEdit(g)}>
                              <IconEdit size={13} aria-hidden="true" />
                            </IconButton>
                            <IconButton variant="danger-subtle" label="Eliminar gasto" tooltip="Eliminar" onClick={() => handleDelete(g)}>
                              <IconTrash size={13} aria-hidden="true" />
                            </IconButton>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Rentabilidad + contexto */}
            <div className="dashboard-column">
              <div className="card">
                <div className="card-title">
                  Rentabilidad por producto
                  <Link to="/predicciones" className="btn btn-outline">Ver predicción</Link>
                </div>
                {rentabilidadProductos.length === 0 ? (
                  <EmptyState title="Sin ventas en el período" message="Registra ventas para ver qué productos dejan más margen." />
                ) : (
                  <ul className="list-card list-card-preview">
                    {rentabilidadProductos.slice(0, 8).map((p, i) => (
                      <li className="rank-item" key={p.id}>
                        <span className="rank-pos">{i + 1}</span>
                        <div className="rank-info">
                          <strong>{p.nombre}</strong>
                          <small>{money(p.ingresos)} en ventas · {p.unidades} uds</small>
                        </div>
                        <div className="dashboard-rank-metric">
                          <Cifra tipo="ingreso">{money(p.margen)}</Cifra>
                          <small>{p.margenPct}% margen</small>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {rentabilidadCategorias.length > 0 && (
                <div className="card">
                  <div className="card-title">Rentabilidad por categoría</div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Categoría</th><th>Ventas</th><th>Margen</th><th>%</th></tr></thead>
                      <tbody>
                        {rentabilidadCategorias.slice(0, 8).map((cat) => (
                          <tr key={cat.categoria}>
                            <td>{cat.categoria}</td>
                            <td>{money(cat.ingresos)}</td>
                            <td><Cifra tipo="ingreso">{money(cat.margen)}</Cifra></td>
                            <td>{cat.margenPct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="card">
                <div className="card-title">Contexto</div>
                <ul className="conta-contexto">
                  <li>
                    <span>Capital inmovilizado en inventario</span>
                    <strong>{money(inventario?.capitalInmovilizado || 0)}</strong>
                    <small>{inventario?.unidades || 0} unidades a costo, sin vender</small>
                  </li>
                  {proyeccion && (
                    <li>
                      <span>Utilidad estimada próximos {proyeccion.horizonteDias} días</span>
                      <strong>{money(proyeccion.utilidadEstimada)}</strong>
                      <small>Estimado por el modelo sobre {proyeccion.productos} productos</small>
                    </li>
                  )}
                  {sedesResumen.length > 1 && sedesResumen.map((s) => (
                    <li key={s.sedeId ?? 'sin'}>
                      <span>{s.nombre}</span>
                      <strong>{money(s.utilidadBruta)}</strong>
                      <small>{money(s.ingresos)} en ventas · utilidad bruta</small>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
      </div>

      <Modal open={modalOpen} title={editing ? 'Editar gasto' : 'Registrar gasto'} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit}>
          <ErrorBox error={actionError} />
          <div className="form-grid">
            <div className="form-group">
              <label>Categoría</label>
              <select
                value={otraCat ? OTRA : form.categoria}
                onChange={(e) => {
                  if (e.target.value === OTRA) { setOtraCat(true); setForm({ ...form, categoria: 'OTRO' }); }
                  else { setOtraCat(false); setForm({ ...form, categoria: e.target.value }); }
                }}
              >
                {catList.map((cat) => (
                  <option key={cat} value={cat}>{catLabel(cat)}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="conta-label-egreso">Monto (COP) <span className="conta-tag conta-tag-egreso">egreso</span></label>
              <input
                className="campo-egreso"
                name="monto"
                type="number"
                min="0"
                step="0.01"
                required
                value={form.monto}
                onChange={(e) => setForm({ ...form, monto: e.target.value })}
                placeholder="800000"
              />
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Fecha</label>
              <input type="date" required value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </div>
            {(sedes.data?.sedes?.length ?? 0) > 1 && (
              <div className="form-group">
                <label>Sede (opcional)</label>
                <select value={form.sedeId} onChange={(e) => setForm({ ...form, sedeId: e.target.value })}>
                  <option value="">Toda la PYME</option>
                  {sedes.data.sedes.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="form-group">
            <label>Descripción</label>
            <input
              name="descripcion"
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder={form.categoria === 'OTRO' ? 'Detallá el gasto' : 'p. ej. Arriendo de septiembre'}
            />
          </div>
          <div className="form-row">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={saving}>{editing ? 'Guardar cambios' : 'Registrar gasto'}</Button>
          </div>
        </form>
      </Modal>

      {toast && (
        <div className="toast toast-success">
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
