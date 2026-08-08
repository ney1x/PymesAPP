import React, { useState, useRef } from 'react';
import { prediccionesApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBox, PageHeader, Badge, Button, EmptyState, money } from '../components/ui';
import { IconSearch } from '../components/Icons';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

const HORIZONTES = [
  { value: 7, label: 'Semana' },
  { value: 30, label: 'Mes' },
  { value: 90, label: '3 meses' },
];

export default function Predicciones() {
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [search, setSearch] = useState('');
  const [horizonte, setHorizonte] = useState(7);
  const formRef = useRef(null);

  const historico = useAsync(() => prediccionesApi.list());

  const generar = async () => {
    if (generating) return; // prevent double submit
    setGenerating(true);
    setGenError(null);
    try {
      const res = await prediccionesApi.generarTodo({ horizonteDias: horizonte });
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
        title="Prediccion de demanda"
        subtitle="El modelo analiza tu histórico de ventas y predice la demanda futura."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              value={horizonte}
              onChange={(e) => setHorizonte(Number(e.target.value))}
              disabled={generating}
            >
              {HORIZONTES.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
            <Button loading={generating} onClick={generar} aria-busy={generating} aria-label={generating ? 'Generando predicción...' : 'Generar predicción'}>
              {generating ? 'Analizando...' : 'Generar Predicción'}
            </Button>
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
        <div className="grid-2">
          {/* Gráfica */}
          <div className="card">
            <div className="card-title">Gráfica</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dfe4e7" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="demanda" name="Demanda" fill="#0d5c63" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Resultados por producto */}
          <div className="card">
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
                    tablaDatos.map((p) => {
                      const fecha = p.fecha ? new Date(p.fecha).toLocaleDateString('es-CO') : '—';
                      const horizonteLabel = HORIZONTES.find((h) => h.value === p.horizonteDias)?.label
                        || `${p.horizonteDias} días`;
                      return (
                        <tr key={p.id}>
                          <td><strong>{p.producto.nombre}</strong></td>
                          <td>
                            {p.demandaPredicha} uds
                            <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                              en {horizonteLabel.toLowerCase()}
                            </span>
                          </td>
                          <td>{confianzaBadge(p.nivelConfianza)}</td>
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
