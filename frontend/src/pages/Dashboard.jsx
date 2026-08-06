import React from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { Spinner, ErrorBox, StatCard, PageHeader, EmptyState, Badge, money } from '../components/ui';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error } = useAsync(() => dashboardApi.get(), []);

  if (loading) return <Spinner label="Cargando dashboard..." />;
  if (error) return <ErrorBox error={error} />;
  if (!data?.data) return null;

  const { resumen, ventasPorDia, topProductos, productosBajoStock, rankingRentabilidad } = data.data;

  return (
    <div>
      <PageHeader
        title={`Hola, ${user?.nombre?.split(' ')[0] || 'comerciante'}`}
        subtitle="Este es el resumen de tu negocio hoy."
      />

      <div className="stat-grid">
        <StatCard label="Ingresos (histórico)" value={money(resumen.ingresos)} hint="Total vendido" />
        <StatCard label="Margen bruto" value={money(resumen.margenBruto)} hint="Utilidad estimada" tone="success" />
        <StatCard label="Unidades vendidas" value={resumen.unidadesVendidas} />
        <StatCard
          label="Alertas de stock"
          value={resumen.alertasStock}
          hint={resumen.alertasStock > 0 ? 'Productos por debajo del mínimo' : 'Inventario en orden'}
          tone={resumen.alertasStock > 0 ? 'danger' : 'success'}
        />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Ventas de los últimos 7 días</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={ventasPorDia}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe4e7" />
              <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => money(v)} labelStyle={{ color: '#16232c' }} />
              <Bar dataKey="ingresos" name="Ingresos" fill="#0d5c63" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-title">
            Ranking de rentabilidad
            <Link to="/predicciones" className="btn btn-outline">Ver todo</Link>
          </div>
          {rankingRentabilidad.length === 0 ? (
            <EmptyState
              title="Aún no hay predicciones"
              message="Genera predicciones para saber qué productos convienen más."
            />
          ) : (
            <ul className="list-card">
              {rankingRentabilidad.slice(0, 5).map((item, i) => (
                <li className="rank-item" key={item.id}>
                  <span className="rank-pos">{i + 1}</span>
                  <div className="rank-info">
                    <strong>{item.nombre}</strong>
                    <small>Demanda estimada: {item.demandaPredicha} uds</small>
                  </div>
                  <strong>{money(item.rentabilidadPredicha)}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">
            Top productos por ingresos
            <Link to="/productos" className="btn btn-outline">Gestionar</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Producto</th><th>Unidades</th><th>Ingresos</th></tr>
              </thead>
              <tbody>
                {topProductos.length === 0 ? (
                  <tr><td colSpan="3">Sin ventas registradas</td></tr>
                ) : (
                  topProductos.map((p) => (
                    <tr key={p.id}>
                      <td>#{p.id}</td>
                      <td>{p.unidades}</td>
                      <td>{money(p.ingresos)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            Alertas de inventario
            <Link to="/inventario" className="btn btn-outline">Revisar</Link>
          </div>
          {productosBajoStock.length === 0 ? (
            <EmptyState title="Todo bajo control" message="No hay productos por debajo del stock mínimo." />
          ) : (
            <ul className="list-card">
              {productosBajoStock.map((p) => (
                <li className="rank-item" key={p.id}>
                  <div className="rank-info">
                    <strong>{p.nombre}</strong>
                    <small>Mínimo {p.stockMinimo} · Actual {p.stockActual}</small>
                  </div>
                  <Badge tone="danger">Reordenar</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
