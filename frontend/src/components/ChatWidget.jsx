import { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';
import { usePymeFilter } from '../context/PymeFilterContext';
import { productosApi } from '../api';
import { IconSend as Send, IconX as X, IconMessageSquare as MessageSquare, IconLoader2 as Loader2, IconTrash2 as Trash2 } from './Icons';

// Fallback generico: solo se usa si todavia no hay productos cargados o la
// PYME no tiene productos registrados aun (cuenta nueva).
const SUGERENCIAS_GENERICAS = [
  '¿Qué productos están bajos?',
  '¿Qué debo reordenar?',
  'Dame un resumen del inventario',
  '¿Cuál es mi producto más rentable?',
];

// Arma las preguntas sugeridas con nombres reales de productos de la(s)
// PYME(s) del usuario, en vez de ejemplos genericos ("arroz", "leche", "pan")
// que podian no existir en su inventario real.
function construirSugerencias(productos) {
  if (!productos || productos.length === 0) return SUGERENCIAS_GENERICAS;

  const ordenadosPorStock = [...productos].sort(
    (a, b) => (a.inventario?.stockActual ?? 0) - (b.inventario?.stockActual ?? 0)
  );
  const productoBajo = ordenadosPorStock[0];
  const productoAlto = ordenadosPorStock[ordenadosPorStock.length - 1];
  const productoMedio = ordenadosPorStock[Math.floor(ordenadosPorStock.length / 2)];

  return [
    `¿Cuánto stock tengo de ${productoBajo.nombre}?`,
    '¿Qué productos están bajos?',
    `¿Cuánto voy a vender de ${productoAlto.nombre} la próxima semana?`,
    '¿Qué debo reordenar?',
    'Dame un resumen del inventario',
    `¿Cuánto se vendió de ${productoMedio.nombre} en el último mes?`,
  ];
}

export function ChatWidget() {
  const [abierto, setAbierto] = useState(false);
  const [input, setInput] = useState('');
  const [productos, setProductos] = useState(null);
  const { pymeSeleccionada } = usePymeFilter();
  const { mensajes, cargando, error, enviar, limpiar, cancelar } = useChat();
  const mensajesEndRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const previousActiveElement = useRef(null);

  useEffect(() => {
    mensajesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  // Se recargan al abrir el chat y cada vez que cambia la PYME seleccionada
  // (ej. filtro del Dashboard), asi las sugerencias siempre reflejan la PYME
  // que el usuario esta viendo en ese momento.
  useEffect(() => {
    if (!abierto) return;
    productosApi.list(pymeSeleccionada ? { pymeId: pymeSeleccionada } : {})
      .then((res) => setProductos(res.productos || []))
      .catch(() => setProductos([]));
  }, [abierto, pymeSeleccionada]);

  const sugerencias = construirSugerencias(productos);

  useEffect(() => {
    if (abierto) {
      previousActiveElement.current = document.activeElement;
      document.body.style.overflow = 'hidden';
      setTimeout(() => inputRef.current?.focus(), 100);

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          setAbierto(false);
        }
        if (e.key === 'Tab') {
          const focusableElements = panelRef.current?.querySelectorAll(
            'button, input, select, textarea, a, [tabindex]:not([tabindex="-1"])'
          );
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
  }, [abierto]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !cargando) {
      enviar(input);
      setInput('');
    }
  };

  const handleSugerencia = (texto) => {
    setInput(texto);
    inputRef.current?.focus();
  };

  const toggleChat = () => {
    setAbierto(!abierto);
    if (!abierto) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  if (!abierto) {
    return (
      <button
        className="chat-fab"
        onClick={toggleChat}
        aria-label="Abrir asistente de inventario"
        aria-expanded={abierto}
      >
        <MessageSquare className="w-6 h-6" aria-hidden="true" />
        <span className="chat-badge">Asistente</span>
      </button>
    );
  }

  return (
    <div className="chat-container" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="chat-title">
      <header className="chat-header">
        <div className="chat-title" id="chat-title">
          <MessageSquare className="w-5 h-5" aria-hidden="true" />
          <span>Asistente de Inventario</span>
        </div>
        <div className="chat-actions">
          <button
            onClick={limpiar}
            className="icon-btn"
            title="Limpiar conversación"
            disabled={cargando}
            aria-label="Limpiar conversación"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            onClick={toggleChat}
            className="icon-btn"
            title="Cerrar"
            aria-label="Cerrar asistente"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="chat-messages" role="log" aria-live="polite" aria-label="Conversación">
        {mensajes.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon" aria-hidden="true">
              <MessageSquare className="w-10 h-10" />
            </div>
            <p className="chat-empty-text">
              Pregúntame sobre tu inventario, stock, predicciones o reórdenes.
            </p>
            <div className="chat-sugerencias">
              {sugerencias.map((s, i) => (
                <button
                  key={i}
                  className="sugerencia-btn"
                  onClick={() => handleSugerencia(s)}
                  type="button"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensajes.map((msg) => (
          <div key={msg.id} className={`chat-message ${msg.rol}`}>
            <div className="message-bubble">
              <div className="message-content">{msg.contenido}</div>
            </div>
          </div>
        ))}

        {cargando && (
          <div className="chat-message assistant loading" aria-label="El asistente está escribiendo">
            <div className="message-bubble loading-bubble">
              <div className="typing-indicator" aria-hidden="true">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={mensajesEndRef} />
      </div>

      {error && (
        <div className="chat-error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="error-dismiss" aria-label="Descartar error">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="chat-input-area">
        <label htmlFor="chat-input" className="sr-only">Mensaje para el asistente</label>
        <input
          ref={inputRef}
          id="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu pregunta..."
          className="chat-input"
          disabled={cargando}
          aria-disabled={cargando}
        />
        <button
          type="submit"
          className="chat-send-btn"
          disabled={!input.trim() || cargando}
          aria-label={cargando ? 'Enviando...' : 'Enviar mensaje'}
        >
          {cargando ? (
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="w-5 h-5" aria-hidden="true" />
          )}
        </button>
        {cargando && (
          <button
            type="button"
            onClick={cancelar}
            className="chat-cancel-btn"
            aria-label="Cancelar envío"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </form>
    </div>
  );
}
