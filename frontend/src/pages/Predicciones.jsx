import React, { useState, useRef, useEffect } from 'react';
import { prediccionesApi, pymesApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { usePymeFilter } from '../context/PymeFilterContext';
import { Spinner, ErrorBox, PageHeader, Button, EmptyState, money } from '../components/ui';
import { IconSearch } from '../components/Icons';
import { puede, puedeEnAlguna } from '../constants/permisos';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

const HORIZONTES = [
  { value: 7, label: 'Semana' },
  { value: 30, label: 'Mes' },
  { value: 90, label: '3 meses' },
];

export default function Predicciones() {
  const { pymeSeleccionada: filtroPymeId } = usePymeFilter();
  const [filtroSedeId, setFiltroSedeId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [search, setSearch] = useState('');
  const [horizonte, setHorizonte] = useState(7);
  const formRef = useRef(null);
  // Recharts no respeta prefers-reduced-motion por su cuenta (es SVG/JS, no
  // CSS) — hay que apagarle la animación a mano cuando el SO lo pide.
  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const pymes = useAsync(() => pymesApi.list());
  const pymeActual = pymes.data?.pymes?.find((p) => String(p.id) === String(filtroPymeId));
  const puedeGenerar = filtroPymeId
    ? puede(pymeActual?.miRoles, 'generarPredicciones')
    : puedeEnAlguna(pymes.data?.pymes, 'generarPredicciones');
  const sedes = useAsync(
    () => (filtroPymeId ? pymesApi.sedes.list(filtroPymeId) : Promise.resolve({ sedes: [] })),
    [filtroPymeId]
  );
  const historico = useAsync(
    () => prediccionesApi.list({ ...(filtroPymeId ? { pymeId: filtroPymeId } : {}), ...(filtroSedeId ? { sedeId: filtroSedeId } : {}) }),
    [filtroPymeId, filtroSedeId]
  );

  // La PYME se elige desde el switcher del rail (Layout.jsx), no acá.
  useEffect(() => {
    setFiltroSedeId('');
  }, [filtroPymeId]);

  // Un ranking recien generado queda "pegado" en memoria hasta la proxima
  // generacion (mostrar usa `ranking || historico...`) — si el usuario
  // cambia de PYME despues de generar, hay que soltarlo o seguiria
  // mostrando el resultado de la PYME anterior en vez del historico de la
  // nueva.
  useEffect(() => {
    setRanking(null);
  }, [filtroPymeId, filtroSedeId]);

  const generar = async () => {
    if (generating) return; // prevent double submit
    setGenerating(true);
    setGenError(null);
    try {
      const res = await prediccionesApi.generarTodo({
        horizonteDias: horizonte,
        ...(filtroPymeId ? { pymeId: filtroPymeId } : {}),
        ...(filtroSedeId ? { sedeId: filtroSedeId } : {}),
      });
      setRanking(res.ranking);
    } catch (err) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const confianzaNivel = (c) => (c >= 0.7 ? 'alta' : c >= 0.4 ? 'media' : 'baja');

  // Dirección de la recomendación respecto al promedio del listado — decide
  // el color y el punto del veredicto.
  const veredictoTono = (demanda) => {
    if (!demandaPromedio) return '';
    if (demanda > demandaPromedio) return 'up';
    if (demanda < demandaPromedio) return 'down';
    return '';
  };

  const mostrar = ranking || historico.data?.predicciones?.map((p) => ({
    id: p.id,
    producto: { id: p.producto.id, nombre: p.producto.nombre, margen: p.producto.precioVenta - p.producto.costo },
    demandaPredicha: p.demandaPredicha,
    rentabilidadPredicha: p.rentabilidadPredicha,
    nivelConfianza: p.nivelConfianza,
    horizonteDias: p.horizonteDias ?? 7,
    fecha: p.createdAt,
  })) || [];

  // Mismo criterio que el Dashboard (ver interpretarDemanda ahí): la demanda
  // se lee relativa al promedio del propio listado, no como una cifra
  // aislada — sobre eso se arma el veredicto de cada fila.
  const demandaPromedio = mostrar.length
    ? mostrar.reduce((sum, p) => sum + (Number(p.demandaPredicha) || 0), 0) / mostrar.length
    : 0;

  const interpretarDemanda = (demanda) => {
    if (!demandaPromedio) return 'Revisar tendencia antes de comprar';
    if (demanda > demandaPromedio) return 'Considerar aumentar stock';
    if (demanda < demandaPromedio) return 'Evitar sobreabastecer';
    return 'Mantener stock';
  };

  const chartData = mostrar
    .filter((p) => !search || p.producto.nombre.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 8)
    .map((p) => ({
      name: p.producto.nombre.length > 16 ? p.producto.nombre.slice(0, 16) + '…' : p.producto.nombre,
      nombreCompleto: p.producto.nombre,
      demanda: p.demandaPredicha,
    }));

  const tablaDatos = mostrar
    .filter((p) => !search || p.producto.nombre.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Predicción de demanda"
        subtitle="El modelo analiza tu histórico de ventas y predice la demanda futura."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {filtroPymeId && (sedes.data?.sedes?.length ?? 0) > 1 && (
              <select
                value={filtroSedeId}
                onChange={(e) => setFiltroSedeId(e.target.value)}
                disabled={generating}
              >
                <option value="">Todas las sedes</option>
                {sedes.data.sedes.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            )}
            <select
              value={horizonte}
              onChange={(e) => setHorizonte(Number(e.target.value))}
              disabled={generating}
            >
              {HORIZONTES.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
            {puedeGenerar && (
              <Button loading={generating} onClick={generar} aria-busy={generating} aria-label={generating ? 'Generando predicción...' : 'Generar predicción'}>
                {generating ? 'Analizando...' : 'Generar Predicción'}
              </Button>
            )}
          </div>
        }
      />

      {genError && <ErrorBox error={genError} />}

      <div className="search-box" style={{ marginBottom: 16 }}>
        <IconSearch size={15} />
        <input
          type="text"
          placeholder="Buscar producto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {generating ? (
        <Spinner label="Consultando el modelo de ML..." />
      ) : mostrar.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Aún no hay predicciones"
            message="Registra ventas y luego pulsa 'Generar Predicción' para ver la demanda estimada."
          />
        </div>
      ) : (
        // Las cards remontan cada vez que se sale de "generating" o del
        // vacío — el fade-up marca justo el instante en que llega la
        // respuesta del modelo, no cada tecla de búsqueda (eso solo
        // actualiza el contenido de las mismas cards, sin remount).
        <div className="prediccion-layout">
          {/* Recomendaciones — el veredicto del modelo es el protagonista,
              no una fila más de tabla. */}
          <div className="card prediccion-insights animate-fade-in-up delay-1">
            <div className="card-title">Recomendaciones por producto</div>
            <p className="muted prediccion-insights-nota">
              "Demanda" es el total estimado de unidades que se venderían en
              el horizonte elegido para ese producto (no es una cifra diaria).
              La recomendación compara cada producto contra el promedio del
              listado actual.
            </p>
            {tablaDatos.length === 0 ? (
              <EmptyState title="Sin resultados" />
            ) : (
              <ul className="list-card prediccion-insight-list">
                {tablaDatos.map((p, i) => {
                  const fecha = p.fecha ? new Date(p.fecha).toLocaleDateString('es-CO') : '—';
                  const horizonteLabel = HORIZONTES.find((h) => h.value === p.horizonteDias)?.label
                    || `${p.horizonteDias} días`;
                  const filaDelay = Math.min(i, 7) * 40;
                  const demanda = Number(p.demandaPredicha) || 0;
                  const tono = veredictoTono(demanda);
                  const nivel = confianzaNivel(p.nivelConfianza);
                  const pct = Math.round((p.nivelConfianza || 0) * 100);
                  return (
                    <li
                      key={p.id}
                      className={`prediccion-insight animate-slide-in-right${tono ? ` prediccion-insight--${tono}` : ''}`}
                      style={{ animationDelay: `${filaDelay}ms` }}
                    >
                      <div className="prediccion-insight-head">
                        <span className="prediccion-insight-producto">{p.producto.nombre}</span>
                        <span className="prediccion-insight-stats" style={{ gap: 4 }}>Generado {fecha}</span>
                      </div>
                      <span className="prediccion-insight-veredicto">{interpretarDemanda(demanda)}</span>
                      <div className={`prediccion-confianza prediccion-confianza--${nivel}`}>
                        <span className="prediccion-confianza-track">
                          <span className="prediccion-confianza-fill" style={{ transform: `scaleX(${pct / 100})` }} />
                        </span>
                        <span><span className="prediccion-confianza-val">{pct}%</span> confianza</span>
                      </div>
                      <div className="prediccion-insight-stats">
                        <span><b>{p.demandaPredicha} uds</b> en {horizonteLabel.toLowerCase()}</span>
                        <span>Rentabilidad estimada <b>{money(p.rentabilidadPredicha)}</b></span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Gráfica — apoyo visual, no compite con la recomendación. Barras
              horizontales: el nombre del producto va en el eje Y, donde hay
              lugar para leerlo entero (en vertical se encimaban). */}
          <div className="card prediccion-chart-card animate-fade-in-up delay-2">
            <div className="card-title">Demanda comparada</div>
            <p className="muted prediccion-chart-nota">Unidades estimadas en el horizonte elegido, mayor a menor.</p>
            <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 40 + 16)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke="#D9E2EC" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#556C82' }} axisLine={{ stroke: '#D9E2EC' }} tickLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 12, fill: '#172B4D' }}
                  axisLine={false}
                  tickLine={false}
                  width={116}
                  interval={0}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(16, 42, 67, 0.05)' }}
                  contentStyle={{ borderRadius: 10, border: '1px solid #D9E2EC', boxShadow: '0 4px 12px rgba(16,42,67,0.08)', fontSize: 12 }}
                  labelStyle={{ color: '#172B4D', fontWeight: 600 }}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.nombreCompleto || label}
                  formatter={(v) => [`${v} uds`, 'Demanda']}
                />
                <Bar
                  dataKey="demanda"
                  name="Demanda"
                  fill="#102A43"
                  radius={[0, 5, 5, 0]}
                  maxBarSize={28}
                  isAnimationActive={!prefersReducedMotion}
                  animationDuration={300}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
