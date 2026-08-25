import React, { useState, useRef, useEffect } from 'react';
import { prediccionesApi, pymesApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { usePymeFilter } from '../context/PymeFilterContext';
import { Spinner, ErrorBox, PageHeader, Badge, Button, EmptyState, money } from '../components/ui';
import { IconSearch } from '../components/Icons';
import { puedeEnAlguna } from '../constants/permisos';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

const HORIZONTES = [
  { value: 7, label: 'Semana' },
  { value: 30, label: 'Mes' },
  { value: 90, label: '3 meses' },
];

export default function Predicciones() {
  const { pymeSeleccionada: filtroPymeId, setPymeSeleccionada: setFiltroPymeId } = usePymeFilter();
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
  const puedeGenerar = puedeEnAlguna(pymes.data?.pymes, 'generarPredicciones');
  const sedes = useAsync(
    () => (filtroPymeId ? pymesApi.sedes.list(filtroPymeId) : Promise.resolve({ sedes: [] })),
    [filtroPymeId]
  );
  const historico = useAsync(
    () => prediccionesApi.list({ ...(filtroPymeId ? { pymeId: filtroPymeId } : {}), ...(filtroSedeId ? { sedeId: filtroSedeId } : {}) }),
    [filtroPymeId, filtroSedeId]
  );

  const handleFiltroPyme = (value) => {
    setFiltroPymeId(value);
    setFiltroSedeId('');
  };

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

  const confianzaBadge = (c) => {
    if (c >= 0.7) return <Badge tone="success">{(c * 100).toFixed(0)}%</Badge>;
    if (c >= 0.4) return <Badge tone="warning">{(c * 100).toFixed(0)}%</Badge>;
    return <Badge>{(c * 100).toFixed(0)}%</Badge>;
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

  const chartData = mostrar
    .filter((p) => !search || p.producto.nombre.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 8)
    .map((p) => ({
      name: p.producto.nombre.length > 12 ? p.producto.nombre.slice(0, 12) + '...' : p.producto.nombre,
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
            {(pymes.data?.pymes?.length ?? 0) > 0 && (
              <select
                value={filtroPymeId}
                onChange={(e) => handleFiltroPyme(e.target.value)}
                disabled={generating}
              >
                <option value="">Todas mis PYMES</option>
                {pymes.data?.pymes?.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            )}
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
        <div className="grid-2">
          {/* Gráfica */}
          <div className="card animate-fade-in-up delay-1">
            <div className="card-title">Gráfica</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dde1e6" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar
                  dataKey="demanda"
                  name="Demanda"
                  fill="#122a47"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={!prefersReducedMotion}
                  animationDuration={300}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Resultados por producto */}
          <div className="card animate-fade-in-up delay-2">
            <div className="card-title">Resultados por producto</div>
            <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
              "Demanda" es el total estimado de unidades que se venderían en
              el horizonte elegido para ese producto (no es una cifra diaria).
            </p>
            <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Demanda estimada</th>
                    <th>Confianza</th>
                    <th>Generado</th>
                  </tr>
                </thead>
                <tbody>
                  {tablaDatos.length === 0 ? (
                    <tr><td colSpan="4"><EmptyState title="Sin resultados" /></td></tr>
                  ) : (
                    tablaDatos.map((p, i) => {
                      const fecha = p.fecha ? new Date(p.fecha).toLocaleDateString('es-CO') : '—';
                      const horizonteLabel = HORIZONTES.find((h) => h.value === p.horizonteDias)?.label
                        || `${p.horizonteDias} días`;
                      const filaDelay = Math.min(i, 7) * 40;
                      return (
                        <tr key={p.id} className="animate-slide-in-right" style={{ animationDelay: `${filaDelay}ms` }}>
                          <td><strong>{p.producto.nombre}</strong></td>
                          <td>
                            {p.demandaPredicha} uds
                            <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                              en {horizonteLabel.toLowerCase()}
                            </span>
                          </td>
                          <td>
                            <span className="prediccion-confianza-pop" style={{ animationDelay: `${filaDelay + 120}ms` }}>
                              {confianzaBadge(p.nivelConfianza)}
                            </span>
                          </td>
                          <td>{fecha}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
