
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
  
  const readerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const physicalInputRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef('');
  const lastScanTimeRef = useRef(0);
  const isMobile = useIsMobile();

  const handleScan = useCallback(async (text: string) => {
    const now = Date.now();
    if (now - lastScanTimeRef.current < 1500) return; // Throttling
    lastScanTimeRef.current = now;

    if ('vibrate' in navigator) navigator.vibrate(100);
    await onScan(text.trim());
  }, [onScan]);

  // Lógica para escáner físico (USB/HID)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode !== 'fisico' || !scannerActive) return;
      
      if (e.key === 'Enter') {
        if (bufferRef.current) {
          handleScan(bufferRef.current);
          bufferRef.current = '';
        }
      } else if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, scannerActive, handleScan]);

  // Lógica para cámara
  useEffect(() => {
    if (!readerRef.current || mode !== 'camara' || !scannerActive) return;

    if (!html5QrCodeRef.current) {
      html5QrCodeRef.current = new Html5Qrcode(readerRef.current.id);
    }

    const startCamera = async () => {
      try {
        await html5QrCodeRef.current?.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 250 },
          (text) => handleScan(text),
          () => {}
        );

        if (isMobile) {
          const videoTrack = (html5QrCodeRef.current as any)._videoElement?.srcObject?.getVideoTracks()[0];
          if (videoTrack) {
            setCameraCapabilities(videoTrack.getCapabilities?.() || null);
          }
        }
      } catch (err) {
        console.error('Error starting camera', err);
        setScannerActive(false);
      }
    };

    startCamera();

    return () => {
      if (html5QrCodeRef.current?.isScanning) {
        html5QrCodeRef.current.stop().catch(console.error);
      }
    };
  }, [mode, scannerActive, handleScan, isMobile]);

  // Aplicar Zoom y Flash
  useEffect(() => {
    if (mode === 'camara' && scannerActive && html5QrCodeRef.current?.isScanning) {
        const videoTrack = (html5QrCodeRef.current as any)._videoElement?.srcObject?.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.applyConstraints({
                advanced: [{ zoom, torch: isFlashOn }]
            }).catch(console.error);
        }
    }
  }, [zoom, isFlashOn, mode, scannerActive]);

  return (
    <div className="space-y-4">
      <div className="flex grid grid-cols-2 gap-2">
        <Button 
          variant={mode === 'camara' ? 'default' : 'outline'} 
          onClick={() => setMode('camara')}
          className="flex gap-2"
        >
          <Camera className="h-4 w-4" /> Cámara
        </Button>
        <Button 
          variant={mode === 'fisico' ? 'default' : 'outline'} 
          onClick={() => setMode('fisico')}
          className="flex gap-2"
        >
          <Keyboard className="h-4 w-4" /> USB / Láser
        </Button>
      </div>

      <div className="bg-starbucks-cream rounded-xl p-4 border-2 border-dashed border-gray-300 relative min-h-[250px] flex flex-col items-center justify-center overflow-hidden">
        {mode === 'camara' ? (
          <>
            <div id="reader" ref={readerRef} className="w-full max-w-sm rounded-lg overflow-hidden border-2 border-starbucks-green" />
            {!scannerActive && <p className="text-gray-500 mt-4">Escáner de cámara inactivo</p>}
          </>
        ) : (
          <div className="text-center space-y-2">
            <div className={`p-4 rounded-full ${scannerActive ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                <Keyboard className="h-12 w-12" />
            </div>
            <p className="font-bold text-starbucks-dark">
                {scannerActive ? 'Escáner Físico Listo' : 'Escáner Inactivo'}
            </p>
            <p className="text-xs text-gray-500">Conecta tu escáner y comienza a leer códigos</p>
          </div>
        )}

        {mode === 'camara' && scannerActive && isMobile && cameraCapabilities && (
            <div className="absolute bottom-4 left-4 right-4 bg-black/50 p-3 rounded-lg flex items-center gap-4 text-white">
                {cameraCapabilities.torch && (
                    <Button variant="ghost" size="icon" onClick={() => setIsFlashOn(!isFlashOn)} className={isFlashOn ? 'text-yellow-400' : ''}>
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
                            className="w-full h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                )}
            </div>
        )}
      </div>

      <div className="flex justify-center gap-4">
        {!scannerActive ? (
          <Button onClick={() => setScannerActive(true)} disabled={disabled} className="bg-blue-600 hover:bg-blue-700 px-8">
            Iniciar Escaneo
          </Button>
        ) : (
          <Button variant="destructive" onClick={() => setScannerActive(false)} className="px-8">
            Detener
          </Button>
        )}
      </div>
    </div>
  );
}
