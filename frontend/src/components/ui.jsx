import React, { useEffect, useRef } from 'react';
import { IconArchive, IconClose } from './Icons';

export function Button({ variant = 'primary', loading, children, className = '', ...props }) {
  return (
    <button className={`btn btn-${variant} ${className}`.trim()} disabled={loading || props.disabled} {...props}>
      {loading && <span className="spinner spinner-sm" />}
      {children}
    </button>
  );
}

export function Spinner({ label = 'Cargando...' }) {
  return (
    <div className="center-page">
      <span className="spinner" />
      <p className="muted">{label}</p>
    </div>
  );
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="alert alert-error">{error}</div>;
}

export function EmptyState({ title = 'Sin información', message = 'Aún no hay datos para mostrar.' }) {
  return (
    <div className="empty">
      <span className="empty-icon"><IconArchive size={22} /></span>
      <h3>{title}</h3>
      <p className="muted">{message}</p>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = 'default' }) {
  return (
    <div className={`stat-card stat-${tone}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

export function Badge({ tone = 'default', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Modal({ open, title, onClose, children }) {
  const modalRef = useRef(null);
  const previousActiveElement = useRef(null);

  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement;
      document.body.style.overflow = 'hidden';
      // Focus the close button or first focusable element
      setTimeout(() => {
        const focusTarget = modalRef.current?.querySelector('button[aria-label="Cerrar"], [href], input, select, textarea, button, [tabindex]:not([tabindex="-1"])');
        focusTarget?.focus();
      }, 0);

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
        if (e.key === 'Tab') {
          const focusableElements = modalRef.current?.querySelectorAll('button[aria-label="Cerrar"], [href], input, select, textarea, button, [tabindex]:not([tabindex="-1"])');
          if (!focusableElements || focusableElements.length === 0) return;
          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];
          if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
        previousActiveElement.current?.focus?.();
      };
    }
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Cerrar" type="button">
            <IconClose size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function money(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function date(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-CO');
}
