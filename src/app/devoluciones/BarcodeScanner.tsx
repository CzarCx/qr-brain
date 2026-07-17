'use client';

/**
 * Escáner de cámara SOLO para /devoluciones. Reemplaza a html5-qrcode (que sigue en el
 * resto de las pantallas) por `barcode-detector` con motor zxing-wasm: en iPhone/Safari
 * el BarcodeDetector nativo no existe de forma usable, así que se decodifica por WASM
 * (~3-4x más rápido que el ZXing-JS que html5-qrcode corría antes en iOS). Aislado aquí:
 * ninguna otra pantalla lo importa.
 *
 * El componente maneja su propia cámara (<video>), corre el loop de detección sobre un
 * recorte central (menos píxeles = más FPS en iPhone) y emite el texto crudo por
 * onDetected — el mismo contrato que onScanSuccess, así processCode no cambia. Además
 * dibuja el CONTORNO del código detectado en un canvas encima del video.
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
// Libre) y los 1D típicos de paqueterías (FedEx/Estafeta suelen ser Code128 o ITF).
const FORMATS = ['qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_39', 'code_93', 'codabar'];

// ~8 lecturas/seg: suficiente para leer al vuelo y suave para la CPU del iPhone.
const DETECT_INTERVAL_MS = 120;
// Recorte cuadrado sobre el que se decodifica (equivalente al qrbox de antes).
const CROP = 512;
// Cuánto se mantiene el contorno tras el último avistamiento (evita parpadeo).
const OUTLINE_HOLD_MS = 350;

type Props = {
  onDetected: (text: string) => void;
  onTrackReady?: (track: MediaStreamTrack) => void;
  onError?: (e: unknown) => void;
};

export default function BarcodeScanner({ onDetected, onTrackReady, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
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
    const detector = new BarcodeDetector({ formats: FORMATS as unknown as never });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const clearOutline = () => {
      const oc = overlayRef.current;
      oc?.getContext('2d')?.clearRect(0, 0, oc.width, oc.height);
    };

    // Dibuja el contorno del código. Los puntos vienen en coordenadas del recorte (CROP);
    // se transforman al espacio intrínseco del video, y como el canvas de overlay tiene
    // ese mismo tamaño y object-cover igual que el video, el trazo cae justo encima.
    const drawOutline = (
      points: ReadonlyArray<{ x: number; y: number }> | undefined,
      box: { x: number; y: number; width: number; height: number } | undefined,
      sx: number, sy: number, side: number,
    ) => {
      const oc = overlayRef.current;
      const octx = oc?.getContext('2d');
      if (!oc || !octx) return;
      octx.clearRect(0, 0, oc.width, oc.height);
      const toVideo = (px: number, py: number): [number, number] => [sx + (px / CROP) * side, sy + (py / CROP) * side];

      octx.lineWidth = Math.max(4, side * 0.01);
      octx.lineJoin = 'round';
      octx.strokeStyle = '#22c55e';
      octx.fillStyle = 'rgba(34,197,94,0.18)';
      octx.shadowColor = 'rgba(34,197,94,0.9)';
      octx.shadowBlur = Math.max(8, side * 0.02);
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
      // Sostener el contorno un poco; si hace rato que no se ve el código, se borra.
      if (t - lastHit > OUTLINE_HOLD_MS) clearOutline();

      if (v && ctx && v.readyState >= 2 && !busy && t - lastRun >= DETECT_INTERVAL_MS) {
        lastRun = t;
        busy = true;
        const vw = v.videoWidth, vh = v.videoHeight;
        if (vw && vh) {
          // El overlay debe tener el tamaño intrínseco del video para alinear el trazo.
          const oc = overlayRef.current;
          if (oc && (oc.width !== vw || oc.height !== vh)) { oc.width = vw; oc.height = vh; }
          const side = Math.min(vw, vh);
          const sx = (vw - side) / 2, sy = (vh - side) / 2;
          canvas.width = CROP; canvas.height = CROP;
          ctx.drawImage(v, sx, sy, side, side, 0, 0, CROP, CROP);
          detector.detect(canvas)
            .then(codes => {
              if (cancelled) return;
              const c = codes[0];
              if (c) {
                lastHit = performance.now();
                drawOutline(c.cornerPoints, c.boundingBox as DOMRectReadOnly | undefined, sx, sy, side);
                if (c.rawValue) cbRef.current.onDetected(c.rawValue);
              }
            })
            .catch(() => { /* frame ilegible o wasm cargando aún: se reintenta el próximo */ })
            .finally(() => { busy = false; });
        } else {
          busy = false;
        }
      }
      rafId = requestAnimationFrame(loop);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(tr => tr.stop()); return; }
        const v = videoRef.current!;
        v.srcObject = stream;
        // iOS exige playsInline+muted+gesto; el gesto ya ocurrió al pulsar "Iniciar".
        await v.play();
        if (cancelled) return;
        setReady(true);
        const track = stream.getVideoTracks()[0];
        if (track) cbRef.current.onTrackReady?.(track);
        rafId = requestAnimationFrame(loop);
      } catch (e) {
        if (!cancelled) cbRef.current.onError?.(e);
      }
    })();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      stream?.getTracks().forEach(tr => tr.stop());
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
    </div>
  );
}
