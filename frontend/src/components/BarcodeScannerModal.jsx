import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, IconButton } from './ui';
import { IconFlipCamera, IconRotate, IconMirror, IconFlash, IconClose } from './Icons';
import useGuidedBarcodeScanner, { ESTADOS, RECUADRO_INICIAL } from '../hooks/useGuidedBarcodeScanner';

// Agrupa los estados finos del motor de guía en 3 tonos visuales para el
// marco: neutral (buscando / bloqueado por luz o movimiento), ajustar (hay
// código a la vista pero necesita acomodarse) y listo (confirmado).
const TONO_POR_ESTADO = {
  [ESTADOS.LEJOS]: 'ajustar',
  [ESTADOS.CERCA]: 'ajustar',
  [ESTADOS.CENTRAR]: 'ajustar',
  [ESTADOS.ENDEREZAR]: 'ajustar',
  [ESTADOS.LISTO]: 'listo',
  [ESTADOS.CONFIRMADO]: 'listo',
};

const TAMANO_MIN_RECUADRO = 0.15; // fracción del contenedor — no dejar redimensionar a algo inservible
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// Recalcula {x,y,width,height} (fracciones [0,1] del contenedor) al
// arrastrar una esquina puntual — la esquina opuesta queda fija.
function redimensionarRecuadro(base, esquina, dxFrac, dyFrac) {
  let { x, y, width, height } = base;

  if (esquina === 'tl' || esquina === 'bl') {
    const nuevoX = clamp(x + dxFrac, 0, x + width - TAMANO_MIN_RECUADRO);
    width += x - nuevoX;
    x = nuevoX;
  }
  if (esquina === 'tr' || esquina === 'br') {
    width = clamp(width + dxFrac, TAMANO_MIN_RECUADRO, 1 - x);
  }
  if (esquina === 'tl' || esquina === 'tr') {
    const nuevoY = clamp(y + dyFrac, 0, y + height - TAMANO_MIN_RECUADRO);
    height += y - nuevoY;
    y = nuevoY;
  }
  if (esquina === 'bl' || esquina === 'br') {
    height = clamp(height + dyFrac, TAMANO_MIN_RECUADRO, 1 - y);
  }

  return { x, y, width, height };
}

// Rotar/espejo son ajustes puramente visuales de la vista previa (CSS) — la
// detección corre siempre sobre el frame crudo del video, sin importar cómo
// se transforme en pantalla. El contorno del código detectado (cuando el
// navegador da 4 cornerPoints reales) se dibuja mapeando esas coordenadas
// crudas al tamaño mostrado; si además hay rotación/espejo activos, ese
// mapeo dejaría de alinear visualmente, así que el contorno se omite en ese
// caso puntual — la guía por texto y el color del marco siguen funcionando
// igual, no dependen de ese overlay.
//
// El recuadro guía se puede arrastrar (mover) y redimensionar desde las
// esquinas, al estilo PhotoMath — vive en fracción [0,1] del contenedor
// MOSTRADO; el motor de guía (useGuidedBarcodeScanner) lo mapea al espacio
// de píxeles real del video en cada tick, así que arrastrar no reinicia la
// cámara ni pierde cuadros.
//
// `inline`: cuando se abre desde DENTRO de otro Modal (p. ej. el formulario
// de producto) no se puede envolver en otro <Modal> — dos modales anidados
// comparten el listener de Escape del componente Modal y un solo Escape
// cerraría los dos a la vez, perdiendo lo ya tipeado en el formulario de
// atrás. En ese caso se renderiza como panel expandido en el lugar.
export default function BarcodeScannerModal({ open, onClose, onDetect, inline = false, continuo = false }) {
  const videoRef = useRef(null);
  const frameRef = useRef(null);
  const [dispositivoIndex, setDispositivoIndex] = useState(0);
  const [espejo, setEspejo] = useState(false);
  const [rotacion, setRotacion] = useState(0);
  const [recuadro, setRecuadro] = useState(RECUADRO_INICIAL);
  const arrastreRef = useRef(null); // { modo: 'mover'|'esquina', esquina, inicioX, inicioY, base }

  useEffect(() => {
    if (open) {
      setEspejo(false);
      setRotacion(0);
      setDispositivoIndex(0);
      setRecuadro(RECUADRO_INICIAL);
    }
  }, [open]);

  const {
    estado,
    mensaje,
    error,
    dispositivos,
    cuadroDetectado,
    torchDisponible,
    torchOn,
    alternarTorch,
  } = useGuidedBarcodeScanner({ open, videoRef, frameRef, dispositivoIndex, recuadro, onDetect, continuo });

  const tono = TONO_POR_ESTADO[estado] || 'neutral';

  const cambiarCamara = () => {
    if (dispositivos.length < 2) return;
    setDispositivoIndex((i) => (i + 1) % dispositivos.length);
  };
  const alternarEspejo = () => setEspejo((v) => !v);
  const rotar = () => setRotacion((r) => (r + 90) % 360);

  const iniciarArrastre = (e, modo, esquina) => {
    if (e.button !== undefined && e.button !== 0) return; // solo click primario / touch
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastreRef.current = { modo, esquina, inicioX: e.clientX, inicioY: e.clientY, base: recuadro };
  };

  const moverArrastre = (e) => {
    const a = arrastreRef.current;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!a || !rect || !rect.width || !rect.height) return;

    const dxFrac = (e.clientX - a.inicioX) / rect.width;
    const dyFrac = (e.clientY - a.inicioY) / rect.height;

    if (a.modo === 'mover') {
      setRecuadro({
        ...a.base,
        x: clamp(a.base.x + dxFrac, 0, 1 - a.base.width),
        y: clamp(a.base.y + dyFrac, 0, 1 - a.base.height),
      });
    } else {
      setRecuadro(redimensionarRecuadro(a.base, a.esquina, dxFrac, dyFrac));
    }
  };

  const terminarArrastre = () => {
    arrastreRef.current = null;
  };

  const poligonoDetectado = useMemo(() => {
    if (!cuadroDetectado || cuadroDetectado.puntos.length !== 4) return null;
    if (espejo || rotacion !== 0) return null; // ver comentario arriba
    const contenedor = frameRef.current;
    if (!contenedor) return null;

    const rect = contenedor.getBoundingClientRect();
    const { anchoVideo, altoVideo, puntos } = cuadroDetectado;
    if (!anchoVideo || !altoVideo) return null;

    // Mapeo para object-fit: cover.
    const escala = Math.max(rect.width / anchoVideo, rect.height / altoVideo);
    const offsetX = (anchoVideo * escala - rect.width) / 2;
    const offsetY = (altoVideo * escala - rect.height) / 2;

    return puntos.map((p) => `${p.x * escala - offsetX},${p.y * escala - offsetY}`).join(' ');
  }, [cuadroDetectado, espejo, rotacion]);

  const contenido = error ? (
    <div className="alert alert-error">{error}</div>
  ) : (
    <>
      <div ref={frameRef} className={`venta-scanner-frame venta-scanner-frame--${tono}`}>
        <video
          ref={videoRef}
          className="venta-scanner-video"
          style={{ transform: `rotate(${rotacion}deg) scaleX(${espejo ? -1 : 1})` }}
          muted
          playsInline
        />

        <div
          className="venta-scanner-guide"
          style={{
            left: `${recuadro.x * 100}%`,
            top: `${recuadro.y * 100}%`,
            width: `${recuadro.width * 100}%`,
            height: `${recuadro.height * 100}%`,
          }}
          onPointerDown={(e) => iniciarArrastre(e, 'mover')}
          onPointerMove={moverArrastre}
          onPointerUp={terminarArrastre}
          onPointerCancel={terminarArrastre}
          role="slider"
          aria-label="Área de escaneo — arrastrá para mover, o las esquinas para redimensionar"
          aria-valuetext={`${Math.round(recuadro.width * 100)}% de ancho`}
          tabIndex={0}
        >
          {['tl', 'tr', 'bl', 'br'].map((esquina) => (
            <span
              key={esquina}
              className={`venta-scanner-corner venta-scanner-corner--${esquina}`}
              onPointerDown={(e) => iniciarArrastre(e, 'esquina', esquina)}
              onPointerMove={moverArrastre}
              onPointerUp={terminarArrastre}
              onPointerCancel={terminarArrastre}
              role="presentation"
            />
          ))}
          {tono !== 'listo' && <span className="venta-scanner-scanline" aria-hidden="true" />}
        </div>

        {poligonoDetectado && (
          <svg className="venta-scanner-overlay" aria-hidden="true">
            <polygon points={poligonoDetectado} />
          </svg>
        )}

        <p key={mensaje} className={`venta-scanner-mensaje venta-scanner-mensaje--${tono}`}>
          {mensaje}
        </p>
      </div>

      <div className="venta-scanner-controls" role="group" aria-label="Ajustes de la cámara">
        {dispositivos.length > 1 && (
          <IconButton variant="outline" label="Cambiar cámara" tooltip="Cambiar cámara" onClick={cambiarCamara}>
            <IconFlipCamera size={18} aria-hidden="true" />
          </IconButton>
        )}
        <IconButton
          variant={espejo ? 'primary' : 'outline'}
          label={espejo ? 'Desactivar modo espejo' : 'Activar modo espejo'}
          tooltip="Modo espejo"
          aria-pressed={espejo}
          onClick={alternarEspejo}
        >
          <IconMirror size={18} aria-hidden="true" />
        </IconButton>
        <IconButton variant="outline" label="Rotar vista de la cámara" tooltip="Rotar vista" onClick={rotar}>
          <IconRotate size={18} aria-hidden="true" />
        </IconButton>
        {torchDisponible && (
          <IconButton
            variant={torchOn ? 'primary' : 'outline'}
            label={torchOn ? 'Apagar flash' : 'Encender flash'}
            tooltip="Flash"
            aria-pressed={torchOn}
            onClick={alternarTorch}
          >
            <IconFlash size={18} aria-hidden="true" />
          </IconButton>
        )}
      </div>
    </>
  );

  if (inline) {
    if (!open) return null;
    return (
      <div className="venta-scanner-inline">
        <div className="venta-scanner-inline-header">
          <span>Escanear con cámara</span>
          <IconButton variant="ghost" label="Cerrar cámara" onClick={onClose}>
            <IconClose size={14} aria-hidden="true" />
          </IconButton>
        </div>
        {contenido}
      </div>
    );
  }

  return (
    <Modal open={open} title="Escanear con cámara" onClose={onClose}>
      {contenido}
    </Modal>
  );
}
