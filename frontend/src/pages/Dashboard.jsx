import React, { useState, useEffect, useRef } from 'react';
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

  const { resumen, ventasPorDia, topProductos, productosBajoStock, rankingRentabilidad } = data.data;

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title={`Hola, ${user?.nombre?.split(' ')[0] || 'comerciante'}`}
        subtitle="Este es el resumen de tu negocio hoy."
      />

      <div className="stat-grid">
        <StatCard className="animate-fade-in-up delay-1" label="Ingresos (histórico)" value={money(resumen.ingresos)} hint="Total vendido" />
        <StatCard className="animate-fade-in-up delay-2" label="Margen bruto" value={money(resumen.margenBruto)} hint="Utilidad estimada" tone="success" />
        <StatCard className="animate-fade-in-up delay-3" label="Unidades vendidas" value={resumen.unidadesVendidas} />
        <StatCard
          className="animate-fade-in-up delay-4"
          label="Alertas de stock"
          value={resumen.alertasStock}
          hint={resumen.alertasStock > 0 ? 'Productos por debajo del mínimo' : 'Inventario en orden'}
          tone={resumen.alertasStock > 0 ? 'danger' : 'success'}
        />
      </div>

      <div className="grid-2">
        <div className="card animate-fade-in-up delay-1">
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

        <div className="card animate-fade-in-up delay-2">
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
                <li className="rank-item animate-slide-in-right" style={{ animationDelay: `${i * 60}ms`, backgroundColor: focusedRowIndex === i && focusedList.current === 'list' ? 'var(--primary-soft)' : undefined }} tabIndex={0} onClick={() => { focusedList.current = 'list'; setFocusedRowIndex(i); }} onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                  }
                }} key={item.id}>
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
        <div className="card animate-fade-in-up delay-3">
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
                  topProductos.map((p, i) => (
                    <tr key={p.id} className="animate-fade-in" style={{ animationDelay: `${i * 50}ms`, backgroundColor: focusedRowIndex === i && focusedList.current === 'table' ? 'var(--primary-soft)' : undefined }} tabIndex={0} onClick={() => { focusedList.current = 'table'; setFocusedRowIndex(i); }} onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                      }
                    }}>
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

        <div className="card animate-fade-in-up delay-4">
          <div className="card-title">
            Alertas de inventario
            <Link to="/inventario" className="btn btn-outline">Revisar</Link>
          </div>
          {productosBajoStock.length === 0 ? (
            <EmptyState title="Todo bajo control" message="No hay productos por debajo del stock mínimo." />
          ) : (
            <ul className="list-card">
              {productosBajoStock.map((p, i) => (
                <li className="rank-item animate-slide-in-right" style={{ animationDelay: `${i * 60}ms`, backgroundColor: focusedRowIndex === i && focusedList.current === 'list' ? 'var(--primary-soft)' : undefined }} tabIndex={0} onClick={() => { focusedList.current = 'list'; setFocusedRowIndex(i); }} onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                  }
                }} key={p.id}>
                  <div className="rank-info">
                    <strong>{p.nombre}</strong>
                    <small>Mínimo {p.stockMinimo} · Actual {p.stockActual}</small>
                  </div>
                  <Badge tone="danger" className="animate-pulse-soft">Reordenar</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}