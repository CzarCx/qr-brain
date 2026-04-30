'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Zap, ZoomIn, Camera, Keyboard } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface SewingScannerProps {
  onScan: (barcode: string) => Promise<boolean | undefined>;
  disabled?: boolean;
}

export function SewingScanner({ onScan, disabled }: SewingScannerProps) {
  const [scannerActive, setScannerActive] = useState(false);
  const [mode, setMode] = useState<'camara' | 'fisico'>('camara');
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [cameraCapabilities, setCameraCapabilities] = useState<any>(null);
  const [isMounted, setIsMounted] = useState(false);
  
  const readerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef(0);
  const isMobile = useIsMobile();

  useEffect(() => {
    setIsMounted(true);
    return () => {
      setIsMounted(false);
      if (html5QrCodeRef.current?.isScanning) {
        html5QrCodeRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const handleScan = useCallback(async (text: string) => {
    const now = Date.now();
    if (now - lastScanTimeRef.current < 2000) return; // Debounce de 2 segundos
    lastScanTimeRef.current = now;

    if ('vibrate' in navigator) navigator.vibrate(100);
    await onScan(text.trim());
  }, [onScan]);

  // Lógica para escáner físico (USB/HID)
  useEffect(() => {
    let buffer = '';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode !== 'fisico' || !scannerActive) return;
      
      if (e.key === 'Enter') {
        if (buffer) {
          handleScan(buffer);
          buffer = '';
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, scannerActive, handleScan]);

  // Lógica robusta para inicializar la cámara
  useEffect(() => {
    if (!isMounted || !readerRef.current || mode !== 'camara' || !scannerActive) {
      if (html5QrCodeRef.current?.isScanning) {
        html5QrCodeRef.current.stop().catch(() => {});
      }
      return;
    }

    const scannerId = readerRef.current.id;
    if (!html5QrCodeRef.current) {
      html5QrCodeRef.current = new Html5Qrcode(scannerId, false);
    }

    const qrCode = html5QrCodeRef.current;

    const startCamera = async () => {
      // Evitar llamadas si ya está escaneando o en transición
      if (qrCode.getState() !== Html5QrcodeScannerState.IDLE && 
          qrCode.getState() !== Html5QrcodeScannerState.UNKNOWN) {
        return;
      }

      try {
        await qrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 250 },
          (text) => handleScan(text),
          () => {} // Ignorar errores de frame
        );

        if (isMounted) {
          const videoElement = document.getElementById(scannerId)?.querySelector('video');
          if (videoElement && videoElement.srcObject) {
            const track = (videoElement.srcObject as MediaStream).getVideoTracks()[0];
            if (track) {
              setCameraCapabilities(track.getCapabilities?.() || null);
            }
          }
        }
      } catch (err) {
        // Solo loguear si no es el error esperado de concurrencia
        if (!String(err).includes("is ongoing")) {
           console.error('Error starting camera:', err);
        }
        setScannerActive(false);
      }
    };

    startCamera();

    return () => {
      if (qrCode.isScanning) {
        qrCode.stop().catch(() => {});
      }
    };
  }, [mode, scannerActive, handleScan, isMounted]);

  // Aplicar Zoom y Flash dinámicamente
  useEffect(() => {
    if (mode === 'camara' && scannerActive && html5QrCodeRef.current?.isScanning) {
        const videoElement = readerRef.current?.querySelector('video');
        if (videoElement && videoElement.srcObject) {
            const track = (videoElement.srcObject as MediaStream).getVideoTracks()[0];
            if (track) {
                track.applyConstraints({
                    advanced: [{ zoom, torch: isFlashOn }] as any
                }).catch(() => {});
            }
        }
    }
  }, [zoom, isFlashOn, mode, scannerActive]);

  if (!isMounted) return null;

  return (
    <div className="space-y-4">
      <div className="flex grid grid-cols-2 gap-2">
        <Button 
          variant={mode === 'camara' ? 'default' : 'outline'} 
          onClick={() => setMode('camara')}
          className="flex gap-2"
          disabled={disabled}
        >
          <Camera className="h-4 w-4" /> Cámara
        </Button>
        <Button 
          variant={mode === 'fisico' ? 'default' : 'outline'} 
          onClick={() => setMode('fisico')}
          className="flex gap-2"
          disabled={disabled}
        >
          <Keyboard className="h-4 w-4" /> USB / Láser
        </Button>
      </div>

      <div className="bg-starbucks-cream rounded-xl p-4 border-2 border-dashed border-gray-300 relative min-h-[250px] flex flex-col items-center justify-center overflow-hidden">
        {mode === 'camara' ? (
          <>
            <div id="sewing-reader" ref={readerRef} className="w-full max-w-sm rounded-lg overflow-hidden border-2 border-starbucks-green" />
            {!scannerActive && <p className="text-gray-500 mt-4">Cámara apagada</p>}
          </>
        ) : (
          <div className="text-center space-y-2">
            <div className={`p-4 rounded-full ${scannerActive ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                <Keyboard className="h-12 w-12" />
            </div>
            <p className="font-bold text-starbucks-dark">
                {scannerActive ? 'Modo Teclado Listo' : 'Escáner Inactivo'}
            </p>
            <p className="text-xs text-gray-500">Los códigos escaneados por USB entrarán automáticamente</p>
          </div>
        )}

        {mode === 'camara' && scannerActive && isMounted && isMobile && cameraCapabilities && (
            <div className="absolute bottom-4 left-4 right-4 bg-black/60 p-3 rounded-lg flex items-center gap-4 text-white z-10">
                {cameraCapabilities.torch && (
                    <Button variant="ghost" size="icon" onClick={() => setIsFlashOn(!isFlashOn)} className={isFlashOn ? 'text-yellow-400' : 'text-white'}>
                        <Zap className="h-5 w-5" />
                    </Button>
                )}
                {cameraCapabilities.zoom && (
                    <div className="flex-1 flex items-center gap-2">
                        <ZoomIn className="h-4 w-4" />
                        <input 
                            type="range" 
                            min={cameraCapabilities.zoom.min} 
                            max={cameraCapabilities.zoom.max} 
                            step={0.1} 
                            value={zoom} 
                            onChange={(e) => setZoom(parseFloat(e.target.value))}
                            className="w-full h-1 bg-gray-400 rounded-lg appearance-none cursor-pointer accent-starbucks-green"
                        />
                    </div>
                )}
            </div>
        )}
      </div>

      <div className="flex justify-center gap-4">
        {!scannerActive ? (
          <Button onClick={() => setScannerActive(true)} disabled={disabled} className="bg-starbucks-green hover:bg-starbucks-dark px-10">
            Encender Escáner
          </Button>
        ) : (
          <Button variant="destructive" onClick={() => setScannerActive(false)} className="px-10">
            Apagar Escáner
          </Button>
        )}
      </div>
    </div>
  );
}
