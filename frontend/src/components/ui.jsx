import React, { useEffect, useRef } from 'react';
import { IconArchive, IconClose } from './Icons';

export function Button({ variant = 'primary', size, loading, children, className = '', ...props }) {
  const sizeClass = size ? `btn-${size}` : '';
  return (
    <button className={`btn btn-${variant} ${sizeClass} ${className}`.trim()} disabled={loading || props.disabled} {...props}>
      {loading && <span className="spinner spinner-sm" />}
      {children}
    </button>
  );
}

// Botón solo-icono para acciones compactas (filas de tabla, pills). Siempre
// lleva tooltip visual (CSS puro, sin librería) + aria-label — el icono solo
// nunca es la única pista de qué hace el botón.
export function IconButton({ variant = 'outline', size = 'sm', label, tooltip, children, className = '', ...props }) {
  const tip = tooltip || label;
  return (
    <span className="icon-btn-tip" data-tooltip={tip}>
      <button
        type="button"
        className={`btn btn-icon btn-${variant} btn-${size} ${className}`.trim()}
        aria-label={label || tooltip}
        disabled={props.loading || props.disabled}
        {...props}
      >
        {children}
      </button>
    </span>
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
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    previousActiveElement.current = document.activeElement;
    document.body.style.overflow = 'hidden';
    const focusTimer = setTimeout(() => {
      const focusTarget = modalRef.current?.querySelector('[href], input, select, textarea, button, [tabindex]:not([tabindex="-1"])');
      focusTarget?.focus();
    }, 0);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current?.();
      }
      if (e.key === 'Tab') {
        const focusableElements = modalRef.current?.querySelectorAll('[href], input, select, textarea, button, [tabindex]:not([tabindex="-1"])');
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
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      previousActiveElement.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <IconButton variant="ghost" label="Cerrar" onClick={onClose}>
            <IconClose size={16} aria-hidden="true" />
          </IconButton>
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
