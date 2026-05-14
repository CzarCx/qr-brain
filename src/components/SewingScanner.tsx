'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Zap, ZoomIn, Camera, Keyboard } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface SewingScannerProps {
  onScan: (barcode: string) => Promise<boolean | undefined>;
  disabled?: boolean;
}

export function SewingScanner({ onScan, disabled }: SewingScannerProps) {
  const [scannerActive, setScannerActive] = useState(false);
  const [selectedScannerMode, setSelectedScannerMode] = useState<'camara' | 'fisico'>('camara');
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [cameraCapabilities, setCameraCapabilities] = useState<any>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [message, setMessage] = useState({ text: '', show: false });
  
  const readerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef(0);
  const bufferRef = useRef('');
  const isMobile = useIsMobile();
  
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const disabledRef = useRef(disabled);
  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    setIsMounted(true);
    return () => {
      setIsMounted(false);
    };
  }, []);

  const showAppMessage = (text: string) => {
    setMessage({ text, show: true });
    setTimeout(() => setMessage({ text: '', show: false }), 2000);
  };

  const handleScan = useCallback(async (text: string) => {
    if (disabledRef.current) return;
    
    const now = Date.now();
    if (now - lastScanTimeRef.current < 2000) return;
    lastScanTimeRef.current = now;

    if ('vibrate' in navigator) navigator.vibrate(100);
    
    const laserLine = document.getElementById('laser-line-sewing');
    if (laserLine) {
        laserLine.classList.add('laser-flash');
        laserLine.addEventListener('animationend', () => laserLine.classList.remove('laser-flash'), { once: true });
    }

    const success = await onScanRef.current(text.trim());
    if (success) {
        showAppMessage(`Éxito: ${text}`);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedScannerMode !== 'fisico' || !scannerActive) return;
      
      if (e.key === 'Enter') {
        e.preventDefault();
        if (bufferRef.current) {
          handleScan(bufferRef.current);
          bufferRef.current = '';
        }
      } else if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    if (selectedScannerMode === 'fisico' && scannerActive) {
        window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedScannerMode, scannerActive, handleScan]);

  useEffect(() => {
    if (!isMounted || !readerRef.current) return;

    if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode(readerRef.current.id, false);
    }
    const qrCode = html5QrCodeRef.current;

    const cleanup = async () => {
        if (qrCode && qrCode.isScanning) {
            try {
                await qrCode.stop();
            } catch (err) {
                if (!String(err).includes('not started') && !String(err).includes('transition')) {
                    console.error("Fallo al detener el escáner:", err);
                }
            } finally {
                setCameraCapabilities(null);
                setIsFlashOn(false);
                setZoom(1);
            }
        }
    };

    if (scannerActive && selectedScannerMode === 'camara') {
      const state = qrCode.getState();
      if (state === Html5QrcodeScannerState.IDLE || state === Html5QrcodeScannerState.NOT_STARTED) {
        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        };
        qrCode.start({ facingMode: "environment" }, config, (text) => handleScan(text), () => {})
        .then(() => {
            const videoElement = readerRef.current?.querySelector('video');
            if (videoElement && videoElement.srcObject) {
              const stream = videoElement.srcObject as MediaStream;
              const track = stream.getVideoTracks()[0];
              if (track) {
                setCameraCapabilities(track.getCapabilities?.() || null);
              }
            }
        })
        .catch(err => {
            if (!String(err).includes("is ongoing") && !String(err).includes("transition")) {
               console.error("Error al iniciar camara:", err);
            }
            if (!String(err).includes("transition")) {
                setScannerActive(false);
            }
        });
      }
    } else {
      cleanup();
    }

    return () => {
      cleanup();
    };
  }, [scannerActive, selectedScannerMode, isMounted, handleScan]);

  useEffect(() => {
    if (selectedScannerMode === 'camara' && scannerActive && html5QrCodeRef.current?.isScanning) {
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
  }, [zoom, isFlashOn, selectedScannerMode, scannerActive]);

  if (!isMounted) return null;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-bold text-starbucks-dark mb-2">Método de Escaneo:</label>
        <div className="grid grid-cols-2 gap-2">
            <button 
                onClick={() => setSelectedScannerMode('camara')} 
                className={cn(
                    "area-btn w-full px-4 py-3 text-sm rounded-md shadow-sm focus:outline-none",
                    selectedScannerMode === 'camara' && "scanner-mode-selected"
                )} 
                disabled={scannerActive}
            >
                CÁMARA
            </button>
            <button 
                onClick={() => setSelectedScannerMode('fisico')} 
                className={cn(
                    "area-btn w-full px-4 py-3 text-sm rounded-md shadow-sm focus:outline-none",
                    selectedScannerMode === 'fisico' && "scanner-mode-selected"
                )} 
                disabled={scannerActive}
            >
                ESCÁNER FÍSICO
            </button>
        </div>
      </div>

      <div className="bg-starbucks-cream rounded-xl p-4 border-2 border-dashed border-gray-300 relative min-h-[250px] flex flex-col items-center justify-center overflow-hidden">
        <div className="scanner-container relative w-full h-full flex items-center justify-center">
            <div 
                id="sewing-reader" 
                ref={readerRef} 
                className="w-full max-w-sm rounded-lg overflow-hidden border-2 border-starbucks-green" 
                style={{ display: selectedScannerMode === 'camara' && scannerActive ? 'block' : 'none' }}
            />
            
            {message.show && (
                <div className="scanner-message bg-starbucks-green/80 text-white z-20">
                    {message.text}
                </div>
            )}

            {scannerActive && selectedScannerMode === 'camara' && <div id="laser-line-sewing" className="absolute top-1/2 left-0 w-full h-[3px] bg-red-600 shadow-[0_0_10px_1px_red] opacity-75 z-10 -translate-y-1/2" />}
            
            {selectedScannerMode === 'camara' && !scannerActive && (
                <div className="text-center p-8 text-gray-500">
                    <Camera className="h-12 w-12 mx-auto mb-2 opacity-20" />
                    <p>La cámara está desactivada.</p>
                </div>
            )}

            {selectedScannerMode === 'fisico' && (
                <div className="text-center space-y-2">
                    <div className={cn(
                        "p-4 rounded-full inline-block",
                        scannerActive ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                    )}>
                        <Keyboard className="h-12 w-12" />
                    </div>
                    <p className="font-bold text-starbucks-dark">
                        {scannerActive ? 'Modo Teclado Listo' : 'Escáner Inactivo'}
                    </p>
                    <p className="text-xs text-gray-500">Los códigos escaneados por USB entrarán automáticamente</p>
                </div>
            )}
        </div>

        {selectedScannerMode === 'camara' && scannerActive && isMounted && isMobile && cameraCapabilities && (
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
                            id="zoom-slider"
                            type="range" 
                            min={cameraCapabilities.zoom.min} 
                            max={cameraCapabilities.zoom.max} 
                            step={0.1} 
                            value={zoom} 
                            onChange={(e) => setZoom(parseFloat(e.target.value))}
                            className="w-full"
                        />
                    </div>
                )}
            </div>
        )}
      </div>

      <div className="flex justify-center gap-4">
        {!scannerActive ? (
          <Button onClick={() => setScannerActive(true)} disabled={disabled} className="bg-blue-600 hover:bg-blue-700 px-10 text-white font-bold">
            Iniciar Escaneo
          </Button>
        ) : (
          <Button variant="destructive" onClick={() => setScannerActive(false)} className="px-10 font-bold">
            Detener Escaneo
          </Button>
        )}
      </div>

      <div id="physical-scanner-status" className="mt-4 text-center p-2 rounded-md bg-starbucks-accent text-white text-sm" style={{ display: scannerActive && selectedScannerMode === 'fisico' ? 'block' : 'none' }}>
          Escáner físico listo para recibir datos.
      </div>
    </div>
  );
}
