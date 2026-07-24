'use client';

/**
 * Escáner de cámara SOLO para /devoluciones. Reemplaza a html5-qrcode (que sigue en el
 * resto de las pantallas) por `barcode-detector` con motor zxing-wasm: en iPhone/Safari
 * el BarcodeDetector nativo no existe de forma usable, así que se decodifica por WASM
 * (~3-4x más rápido que el ZXing-JS que html5-qrcode corría antes en iOS). Aislado aquí:
 * ninguna otra pantalla lo importa.
 *
 * Se decodifica sobre el FRAME COMPLETO (solo reducido para rendimiento), NO sobre un
 * recorte central: un recorte cuadrado le cortaba los extremos a los códigos 1D largos en
 * vertical, que por eso no leían. El motor ya trae tryRotate/tryHarder activos, así que lee
 * en cualquier orientación. El texto crudo sale por onDetected (mismo contrato que
 * onScanSuccess → processCode no cambia), y el contorno del código detectado se dibuja en
 * un canvas encima del video.
 *
 * Reanudar tras bloquear el teléfono es distinto por plataforma: iOS PAUSA el <video> pero
 * conserva el track vivo (por eso flash/zoom siguen respondiendo); Android suele APAGAR el
 * track (libera la cámara). Por eso al volver a ser visible se intenta reanudar y, si el
 * video no se recupera de verdad, se REINICIA la cámara desde cero (cubre ambos casos).
 */

import { useEffect, useRef, useState } from 'react';
import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';

// WASM same-origin (no CDN): así el escáner funciona sin red en la PWA del piso. Se
// apunta una sola vez a nivel de módulo, antes de instanciar cualquier detector.
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? '/wasm/zxing_reader.wasm' : prefix + path,
  },
});

// Lista corta y explícita: menos formatos = menos trabajo por frame. Cubre QR (Mercado
// Libre) y los 1D típicos de paqueterías (FedEx/Estafeta/ITF-14 de cajas suelen ser
// Code128 o ITF).
const FORMATS = ['qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_39', 'code_93', 'codabar'];

// ~7 lecturas/seg: suficiente para leer al vuelo y suave para la CPU del iPhone.
const DETECT_INTERVAL_MS = 140;
// Lado máximo del frame que se manda a decodificar. A 1920 (en vez de 1280) ZXing conserva
// ~2.25x más píxeles: clave para códigos 1D INCLINADOS/diagonales, pequeños o lejanos, donde
// las barras se proyectan más finas y al reescalar de más se perdían. El motor solo rota en
// pasos de 90° (tryRotate), así que la resolución es la palanca real para ángulos intermedios.
// Cuesta algo de CPU por frame; el guard `busy` ya salta frames si la decodificación tarda.
const MAX_DIM = 1920;
// Cuánto se mantiene el contorno tras el último avistamiento (evita parpadeo).
const OUTLINE_HOLD_MS = 350;
// Tras intentar reanudar, cuánto esperar antes de comprobar si de verdad se recuperó
// (si no, se reinicia la cámara — caso típico de Android).
const RESUME_CHECK_MS = 600;

type Props = {
  onDetected: (text: string) => void;
  onTrackReady?: (track: MediaStreamTrack) => void;
  onError?: (e: unknown) => void;
};

export default function BarcodeScanner({ onDetected, onTrackReady, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  // Primer error REAL de decodificación (p. ej. el WASM no cargó offline). detect()
  // sólo rechaza ante fallos reales —"no hay código" resuelve con []—, así que
  // cualquier rechazo es diagnosticable. Se muestra en pantalla para poder verlo
  // sin consola (imposible de abrir cómodo en el celular del piso).
  const [decodeErr, setDecodeErr] = useState<string | null>(null);
  // Callbacks por ref: que el padre los recree en cada render no debe reiniciar la cámara.
  const cbRef = useRef({ onDetected, onTrackReady, onError });
  useEffect(() => { cbRef.current = { onDetected, onTrackReady, onError }; });

  useEffect(() => {
    // `cancelled` protege del doble-montaje de StrictMode (React 19 en dev) y de detener
    // antes de que getUserMedia resuelva: evita dejar la cámara encendida por duplicado.
    let cancelled = false;
    let rafId: number | null = null;
    let stream: MediaStream | null = null;
    let busy = false;
    let lastRun = 0;
    let lastHit = 0; // último instante con código detectado (para sostener el contorno)
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;
    const detector = new BarcodeDetector({ formats: FORMATS as unknown as never });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const clearOutline = () => {
      const oc = overlayRef.current;
      oc?.getContext('2d')?.clearRect(0, 0, oc.width, oc.height);
    };

    const drawOutline = (
      points: ReadonlyArray<{ x: number; y: number }> | undefined,
      box: { x: number; y: number; width: number; height: number } | undefined,
      scale: number,
    ) => {
      const oc = overlayRef.current;
      const octx = oc?.getContext('2d');
      if (!oc || !octx) return;
      octx.clearRect(0, 0, oc.width, oc.height);
      const toVideo = (px: number, py: number): [number, number] => [px / scale, py / scale];

      octx.lineWidth = Math.max(4, oc.width * 0.006);
      octx.lineJoin = 'round';
      octx.strokeStyle = '#22c55e';
      octx.fillStyle = 'rgba(34,197,94,0.18)';
      octx.shadowColor = 'rgba(34,197,94,0.9)';
      octx.shadowBlur = Math.max(8, oc.width * 0.012);
      octx.beginPath();
      if (points && points.length >= 3) {
        points.forEach((p, i) => {
          const [x, y] = toVideo(p.x, p.y);
          if (i === 0) octx.moveTo(x, y); else octx.lineTo(x, y);
        });
        octx.closePath();
      } else if (box) {
        const [x0, y0] = toVideo(box.x, box.y);
        const [x1, y1] = toVideo(box.x + box.width, box.y + box.height);
        octx.rect(x0, y0, x1 - x0, y1 - y0);
      } else {
        return;
      }
      octx.fill();
      octx.stroke();
    };

    const loop = (t: number) => {
      if (cancelled) return;
      const v = videoRef.current;
      if (t - lastHit > OUTLINE_HOLD_MS) clearOutline();

      if (v && ctx && v.readyState >= 2 && !busy && t - lastRun >= DETECT_INTERVAL_MS) {
        lastRun = t;
        busy = true;
        const vw = v.videoWidth, vh = v.videoHeight;
        if (vw && vh) {
          const scale = Math.min(1, MAX_DIM / Math.max(vw, vh));
          const cw = Math.round(vw * scale), ch = Math.round(vh * scale);
          if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
          ctx.drawImage(v, 0, 0, cw, ch);
          const oc = overlayRef.current;
          if (oc && (oc.width !== vw || oc.height !== vh)) { oc.width = vw; oc.height = vh; }
          detector.detect(canvas)
            .then(codes => {
              if (cancelled) return;
              const c = codes[0];
              if (c) {
                lastHit = performance.now();
                drawOutline(c.cornerPoints, c.boundingBox as DOMRectReadOnly | undefined, scale);
                if (c.rawValue) cbRef.current.onDetected(c.rawValue);
              }
            })
            .catch((err) => {
              // Un rechazo aquí NO es "frame sin código" (eso resuelve con []): es un
              // error real (WASM no cargó, decodificador reventó). Se registra el
              // primero para diagnosticar; el loop sigue (no apaga la cámara).
              console.error('[BarcodeScanner] detect() falló:', err);
              if (!cancelled) setDecodeErr((prev) => prev ?? String((err as any)?.message || err));
            })
            .finally(() => { busy = false; });
        } else {
          busy = false;
        }
      }
      rafId = requestAnimationFrame(loop);
    };

    // ¿El video está produciendo imagen de verdad? (no basta con que el track diga 'live':
    // Android puede dejarlo congelado tras volver de segundo plano).
    const isPlaying = () => {
      const v = videoRef.current;
      return !!v && !v.paused && v.readyState >= 2 && v.videoWidth > 0;
    };

    const stopStream = () => {
      stream?.getTracks().forEach(tr => tr.stop());
      stream = null;
    };

    const attachAndPlay = async () => {
      const v = videoRef.current;
      if (!v || !stream) return;
      if (v.srcObject !== stream) v.srcObject = stream;
      try { await v.play(); } catch { /* iOS puede rechazar sin gesto; se reintenta al volver */ }
    };

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { stopStream(); return; }
        await attachAndPlay();
        if (cancelled) return;
        setReady(true);
        const track = stream.getVideoTracks()[0];
        if (track) {
          cbRef.current.onTrackReady?.(track);
          // Android libera la cámara en segundo plano → el track termina; reaccionar.
          track.addEventListener('ended', () => { if (!cancelled) resume(); });
        }
        if (rafId == null) rafId = requestAnimationFrame(loop);
      } catch (e) {
        if (!cancelled) cbRef.current.onError?.(e);
      }
    };

    // Al volver a ser visible: si el track murió (Android) se reinicia; si sigue vivo (iOS)
    // se reanuda el video y, como red de seguridad, se comprueba poco después que de verdad
    // se recuperó — si no, se reinicia igual.
    const resume = () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      const track = stream?.getVideoTracks?.()[0];
      if (!stream || !track || track.readyState === 'ended') {
        stopStream();
        startCamera();
        return;
      }
      attachAndPlay();
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        if (cancelled || document.visibilityState !== 'visible') return;
        if (!isPlaying()) { stopStream(); startCamera(); }
      }, RESUME_CHECK_MS);
    };

    const onVisibility = () => { if (document.visibilityState === 'visible') resume(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);

    startCamera();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pageshow', resume);
      if (resumeTimer) clearTimeout(resumeTimer);
      if (rafId) cancelAnimationFrame(rafId);
      stopStream();
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" />
      {/* Contorno del código detectado: mismo tamaño intrínseco y object-cover que el
          video, así el trazo se alinea con lo que se ve. */}
      <canvas ref={overlayRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10" />
      {/* Indicador de motor: confirma de un vistazo que /devoluciones ya corre la librería
          nueva (ZXing-WASM), distinta del html5-qrcode del resto de las pantallas. */}
      <span className="absolute top-1 left-1 z-20 text-[8px] font-black uppercase tracking-wider bg-black/60 text-green-400 px-1.5 py-0.5 rounded">
        ⚡ ZXing-WASM {ready ? '●' : '…'}
      </span>
      {/* Diagnóstico visible del primer error de decodificación (WASM offline, etc.). */}
      {decodeErr && (
        <span className="absolute top-1 right-1 z-20 max-w-[75%] truncate text-[8px] font-black uppercase tracking-wider bg-red-600/85 text-white px-1.5 py-0.5 rounded" title={decodeErr}>
          ⚠ {decodeErr}
        </span>
      )}
    </div>
  );
}
