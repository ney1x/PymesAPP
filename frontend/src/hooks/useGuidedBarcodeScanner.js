import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType, NotFoundException } from '@zxing/library';

// Formatos relevantes para un inventario de retail — se acotan explícitamente
// en vez de dejar la búsqueda abierta a todos los que soportan las libs:
// decodifica más rápido y no confunde formatos que acá no importan.
const FORMATOS_ZXING = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.QR_CODE,
];
const FORMATOS_NATIVOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];

const INTERVALO_NATIVO_MS = 70; // BarcodeDetector nativo: acelerado por hardware, aguanta más cadencia
const INTERVALO_ZXING_MS = 110; // decode de zxing no es gratis, ~9/seg es buen balance CPU/batería
const FRAMES_BUENOS_PARA_CONFIRMAR = 3; // ~250-300ms sostenidos antes de confirmar, evita falsos positivos de 1 frame
const UMBRAL_BRILLO_BAJO = 60; // 0-255, sobre un muestreo 32x32
const UMBRAL_MOVIMIENTO = 18; // diff promedio 0-255 entre frames consecutivos del muestreo
const TOLERANCIA_ANGULO_GRADOS = 8;
const FRACCION_ANCHO_LEJOS = 0.5; // detectado < 50% del ancho del recuadro guía -> lejos
const FRACCION_ANCHO_CERCA = 1.3; // detectado > 130% del ancho del recuadro guía -> cerca
const MARGEN_CENTRO_TOLERABLE = 0.08; // margen extra alrededor del recuadro guía, como fracción del ancho del video

// Recuadro guía por defecto, en fracción [0,1] del contenedor MOSTRADO (no
// del video crudo) — x/y/width/height. El usuario puede arrastrarlo/
// redimensionarlo (ver BarcodeScannerModal.jsx); esto es solo el punto de
// partida al abrir la cámara.
export const RECUADRO_INICIAL = { x: 0.12, y: 0.2, width: 0.76, height: 0.6 };

export const ESTADOS = {
  INICIO: 'inicio',
  RESOLUCION_BAJA: 'resolucion_baja',
  POCA_LUZ: 'poca_luz',
  MOVIMIENTO: 'movimiento',
  BUSCANDO: 'buscando',
  LEJOS: 'lejos',
  CERCA: 'cerca',
  CENTRAR: 'centrar',
  ENDEREZAR: 'enderezar',
  LISTO: 'listo',
  CONFIRMADO: 'confirmado',
};

export const MENSAJES = {
  [ESTADOS.INICIO]: 'Apunta al código de barras',
  [ESTADOS.RESOLUCION_BAJA]: 'Cámara de baja resolución — puede fallar la lectura',
  [ESTADOS.POCA_LUZ]: 'Hay poca luz',
  [ESTADOS.MOVIMIENTO]: 'Mantén la cámara quieta',
  [ESTADOS.BUSCANDO]: 'Busca un código de barras',
  [ESTADOS.LEJOS]: 'Acerca el producto',
  [ESTADOS.CERCA]: 'Aleja un poco el producto',
  [ESTADOS.CENTRAR]: 'Mueve el código al centro',
  [ESTADOS.ENDEREZAR]: 'Endereza el código',
  [ESTADOS.LISTO]: '¡Código detectado!',
  [ESTADOS.CONFIRMADO]: '✓ Agregado — buscando el siguiente...',
};

const PAUSA_CONFIRMACION_MS = 1100; // en modo continuo: cuánto se muestra "agregado" antes de retomar el escaneo solo

function mensajeDeError(err) {
  if (err?.name === 'NotAllowedError') {
    return 'Denegaste el permiso de cámara. Habilitalo desde la configuración del navegador para poder escanear.';
  }
  if (err?.name === 'NotFoundError') {
    return 'No se encontró ninguna cámara en este dispositivo.';
  }
  return `No se pudo acceder a la cámara: ${err?.message || err}`;
}

/**
 * Motor de escaneo guiado: abre la cámara, corre un único bucle de análisis
 * por tick (evita condiciones de carrera entre varios timers) que evalúa,
 * en orden de prioridad, luz -> movimiento -> detección -> geometría contra
 * el recuadro fijo. Usa BarcodeDetector nativo del navegador cuando existe
 * (Chrome/Android, acelerado por hardware, da 4 cornerPoints reales) y cae a
 * @zxing/browser en bajo nivel si no (todos los navegadores, 2 puntos por
 * resultado — suficiente para ancho/ángulo/centro, no para dibujar un
 * cuadrilátero exacto).
 */
export default function useGuidedBarcodeScanner({
  open,
  videoRef,
  frameRef,
  dispositivoIndex,
  recuadro,
  onDetect,
  continuo = false,
}) {
  const [estado, setEstado] = useState(ESTADOS.INICIO);
  const [error, setError] = useState(null);
  const [dispositivos, setDispositivos] = useState([]);
  const [torchDisponible, setTorchDisponible] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cuadroDetectado, setCuadroDetectado] = useState(null); // { puntos:[{x,y}], anchoVideo, altoVideo } en píxeles reales del video

  const onDetectRef = useRef(onDetect);
  useEffect(() => { onDetectRef.current = onDetect; }, [onDetect]);

  // El usuario puede arrastrar/redimensionar el recuadro MIENTRAS la cámara
  // sigue corriendo — se lee vía ref en cada tick para que un drag no
  // reinicie el stream (que sí pasa si `recuadro` estuviera en las deps del
  // efecto de abajo).
  const recuadroRef = useRef(recuadro);
  useEffect(() => { recuadroRef.current = recuadro; }, [recuadro]);

  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const estadoRef = useRef(ESTADOS.INICIO);
  const frameBuenosRef = useRef(0);
  const framePrevioRef = useRef(null);
  const canvasAnalisisRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    if (!canvasAnalisisRef.current) canvasAnalisisRef.current = document.createElement('canvas');

    let cancelado = false;
    let yaDetectado = false;
    let ocupado = false;
    let idBucle = null;
    let idPausa = null;

    setError(null);
    estadoRef.current = ESTADOS.INICIO;
    setEstado(ESTADOS.INICIO);
    setCuadroDetectado(null);
    frameBuenosRef.current = 0;
    framePrevioRef.current = null;
    setTorchOn(false);

    const actualizarEstado = (nuevo) => {
      estadoRef.current = nuevo;
      setEstado(nuevo);
    };

    const zxingReader = new BrowserMultiFormatReader();
    zxingReader.possibleFormats = FORMATOS_ZXING;
    // TRY_HARDER: intenta más rotaciones/pasadas por frame — más costo de
    // CPU por intento, pero sin esto zxing es bastante sensible a que el
    // código no esté perfectamente horizontal, y a ~9 intentos/seg hay
    // margen de sobra para pagar ese costo.
    zxingReader.hints.set(DecodeHintType.TRY_HARDER, true);

    // BarcodeDetector nativo: se usa solo si el propio navegador confirma
    // soporte real de al menos un formato 1D de retail. Algunos navegadores
    // (Chrome/Edge de escritorio en Windows es el caso conocido) exponen la
    // API y "aceptan" ean_13/upc_a/code_128 en el constructor sin tirar
    // error, pero el backend real solo decodifica QR — detect() devuelve
    // vacío siempre para códigos de barras 1D aunque el código sea
    // perfectamente legible. getSupportedFormats() consulta el backend de
    // verdad, es la única señal confiable acá.
    let detectorNativo = null;

    const iniciar = async () => {
      try {
        if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
          try {
            const soportados = await window.BarcodeDetector.getSupportedFormats();
            const tieneRetail1D = ['ean_13', 'upc_a', 'code_128'].some((f) => soportados.includes(f));
            if (tieneRetail1D) detectorNativo = new window.BarcodeDetector({ formats: FORMATOS_NATIVOS });
          } catch {
            detectorNativo = null;
          }
        }
        if (cancelado) return;

        const lista = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelado) return;
        setDispositivos(lista);

        const deviceId = lista[dispositivoIndex]?.deviceId;
        const constraints = {
          video: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }),
            // Resolución generosa: sin esto algunos navegadores arrancan en
            // ~640x480, insuficiente para leer un EAN chico a distancia
            // normal de mano.
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        setTorchDisponible(!!track.getCapabilities?.().torch);

        const video = videoRef.current;
        video.srcObject = stream;
        await video.play().catch(() => {});

        const canvasChico = canvasAnalisisRef.current;
        canvasChico.width = 32;
        canvasChico.height = 32;
        const ctxChico = canvasChico.getContext('2d', { willReadFrequently: true });

        const evaluarAmbiente = () => {
          ctxChico.drawImage(video, 0, 0, 32, 32);
          const datos = ctxChico.getImageData(0, 0, 32, 32).data;

          let sumaBrillo = 0;
          for (let i = 0; i < datos.length; i += 4) {
            sumaBrillo += (datos[i] + datos[i + 1] + datos[i + 2]) / 3;
          }
          const brillo = sumaBrillo / (datos.length / 4);

          let movimiento = false;
          if (framePrevioRef.current) {
            let diff = 0;
            for (let i = 0; i < datos.length; i += 4) {
              diff += Math.abs(datos[i] - framePrevioRef.current[i]);
            }
            movimiento = diff / (datos.length / 4) > UMBRAL_MOVIMIENTO;
          }
          framePrevioRef.current = new Uint8ClampedArray(datos);

          return { pocaLuz: brillo < UMBRAL_BRILLO_BAJO, movimiento };
        };

        // El recuadro que el usuario ve y puede arrastrar/redimensionar está
        // definido en fracción del contenedor MOSTRADO (ver
        // BarcodeScannerModal.jsx). El video real puede tener otra relación
        // de aspecto y se muestra con object-fit:cover (recorta simétrico),
        // así que hay que mapear esas fracciones al espacio de píxeles REAL
        // del video antes de comparar contra los puntos detectados — sin
        // este mapeo, un video con aspect ratio distinto al contenedor
        // (típico: cámara 16:9 en un contenedor 4:3) desalinea el recuadro
        // visual del recuadro que realmente se usa para evaluar geometría.
        const recuadroAVideoPixels = () => {
          const r = recuadroRef.current;
          const rect = frameRef.current?.getBoundingClientRect();
          if (!rect || !rect.width || !rect.height) {
            return {
              minX: video.videoWidth * r.x,
              maxX: video.videoWidth * (r.x + r.width),
              minY: video.videoHeight * r.y,
              maxY: video.videoHeight * (r.y + r.height),
            };
          }
          const escala = Math.max(rect.width / video.videoWidth, rect.height / video.videoHeight);
          const offsetX = (video.videoWidth * escala - rect.width) / 2;
          const offsetY = (video.videoHeight * escala - rect.height) / 2;

          return {
            minX: (r.x * rect.width + offsetX) / escala,
            maxX: ((r.x + r.width) * rect.width + offsetX) / escala,
            minY: (r.y * rect.height + offsetY) / escala,
            maxY: ((r.y + r.height) * rect.height + offsetY) / escala,
          };
        };

        const evaluarGeometria = (puntos) => {
          const xs = puntos.map((p) => p.x);
          const ys = puntos.map((p) => p.y);
          const minX = Math.min(...xs), maxX = Math.max(...xs);
          const minY = Math.min(...ys), maxY = Math.max(...ys);
          const anchoDetectado = maxX - minX;

          const anchoVideo = video.videoWidth;
          const { minX: guiaMinX, maxX: guiaMaxX, minY: guiaMinY, maxY: guiaMaxY } = recuadroAVideoPixels();
          const anchoGuia = guiaMaxX - guiaMinX;

          let angulo = 0;
          if (puntos.length >= 2) {
            const dx = puntos[1].x - puntos[0].x;
            const dy = puntos[1].y - puntos[0].y;
            angulo = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
            if (angulo > 90) angulo = 180 - angulo;
          }

          if (anchoDetectado < anchoGuia * FRACCION_ANCHO_LEJOS) return ESTADOS.LEJOS;
          if (anchoDetectado > anchoGuia * FRACCION_ANCHO_CERCA) return ESTADOS.CERCA;

          // "Contenido dentro del recuadro" (con margen) en vez de "centro
          // exacto" — un código ya perfectamente legible pero corrido unos
          // px no debería frustrar con "mové al centro".
          const margen = anchoVideo * MARGEN_CENTRO_TOLERABLE;
          const dentroDelRecuadro =
            minX >= guiaMinX - margen && maxX <= guiaMaxX + margen &&
            minY >= guiaMinY - margen && maxY <= guiaMaxY + margen;
          if (!dentroDelRecuadro) return ESTADOS.CENTRAR;

          if (angulo > TOLERANCIA_ANGULO_GRADOS) return ESTADOS.ENDEREZAR;
          return ESTADOS.LISTO;
        };

        const manejarResultado = (puntos, texto) => {
          setCuadroDetectado({ puntos, anchoVideo: video.videoWidth, altoVideo: video.videoHeight });
          const evaluado = evaluarGeometria(puntos);

          if (evaluado === ESTADOS.LISTO) {
            frameBuenosRef.current += 1;
            actualizarEstado(ESTADOS.LISTO);
            if (frameBuenosRef.current >= FRAMES_BUENOS_PARA_CONFIRMAR && !yaDetectado) {
              yaDetectado = true;
              onDetectRef.current(texto);

              if (continuo) {
                // No cierra ni reinicia el stream: pausa la detección un
                // momento (mostrando la confirmación) y retoma sola — así
                // se puede escanear varios productos seguidos sin volver a
                // abrir la cámara entre uno y otro.
                actualizarEstado(ESTADOS.CONFIRMADO);
                idPausa = window.setTimeout(() => {
                  if (cancelado) return;
                  yaDetectado = false;
                  frameBuenosRef.current = 0;
                  setCuadroDetectado(null);
                  actualizarEstado(ESTADOS.BUSCANDO);
                }, PAUSA_CONFIRMACION_MS);
              }
            }
          } else {
            frameBuenosRef.current = 0;
            actualizarEstado(evaluado);
          }
        };

        const sinResultado = () => {
          frameBuenosRef.current = 0;
          setCuadroDetectado(null);
          actualizarEstado(ESTADOS.BUSCANDO);
        };

        // Red de seguridad además del chequeo de arriba: si el nativo lleva
        // muchos intentos seguidos sin encontrar nada (y no es por poca luz
        // ni movimiento), probablemente el backend no soporta bien este
        // formato en la práctica — se apaga y el resto de la sesión sigue
        // por zxing, sin que el usuario tenga que hacer nada.
        let intentosSinResultadoNativo = 0;
        const LIMITE_INTENTOS_NATIVO = 30; // ~2s a INTERVALO_NATIVO_MS

        idBucle = window.setInterval(async () => {
          if (cancelado || yaDetectado || ocupado || !video.videoWidth) return;
          ocupado = true;
          try {
            // Cámaras virtuales (DroidCam y similares, relay de otro
            // dispositivo por red/USB) suelen entregar un feed comprimido o
            // reescalado — el ancho puede alcanzar para verse bien a simple
            // vista pero no para resolver las barras finas de un EAN. Antes
            // de gastar CPU intentando decodificar, se avisa directo.
            if (video.videoWidth < 640) {
              frameBuenosRef.current = 0;
              setCuadroDetectado(null);
              actualizarEstado(ESTADOS.RESOLUCION_BAJA);
              return;
            }

            const { pocaLuz, movimiento } = evaluarAmbiente();
            if (pocaLuz) {
              frameBuenosRef.current = 0;
              setCuadroDetectado(null);
              actualizarEstado(ESTADOS.POCA_LUZ);
              return;
            }
            if (movimiento) {
              frameBuenosRef.current = 0;
              setCuadroDetectado(null);
              actualizarEstado(ESTADOS.MOVIMIENTO);
              return;
            }

            if (detectorNativo) {
              try {
                const codigos = await detectorNativo.detect(video);
                if (cancelado) return;
                if (codigos.length > 0) {
                  intentosSinResultadoNativo = 0;
                  manejarResultado(codigos[0].cornerPoints, codigos[0].rawValue);
                } else {
                  intentosSinResultadoNativo += 1;
                  if (intentosSinResultadoNativo >= LIMITE_INTENTOS_NATIVO) detectorNativo = null;
                  sinResultado();
                }
              } catch {
                // detect() en sí falla en este navegador con este video —
                // señal más fuerte que "no encontró nada": se apaga ya,
                // no hace falta esperar a agotar el contador de intentos.
                detectorNativo = null;
                sinResultado();
              }
            } else {
              try {
                const resultado = zxingReader.decode(video);
                const puntos = resultado.getResultPoints().map((p) => ({ x: p.getX(), y: p.getY() }));
                manejarResultado(puntos, resultado.getText());
              } catch (err) {
                if (!(err instanceof NotFoundException)) {
                  // Error de decode que no es "simplemente no encontré nada"
                  // (p. ej. checksum roto a mitad de lectura) — se trata
                  // igual, no es fatal para el bucle.
                }
                sinResultado();
              }
            }
          } finally {
            ocupado = false;
          }
        }, detectorNativo ? INTERVALO_NATIVO_MS : INTERVALO_ZXING_MS);
      } catch (err) {
        if (!cancelado) setError(mensajeDeError(err));
      }
    };

    iniciar();

    return () => {
      cancelado = true;
      if (idBucle) window.clearInterval(idBucle);
      if (idPausa) window.clearTimeout(idPausa);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      trackRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [open, dispositivoIndex, continuo]);

  const alternarTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((v) => !v);
    } catch (err) {
      setError(`No se pudo controlar el flash: ${err.message}`);
    }
  };

  return {
    estado,
    mensaje: MENSAJES[estado],
    error,
    dispositivos,
    cuadroDetectado,
    torchDisponible,
    torchOn,
    alternarTorch,
  };
}
