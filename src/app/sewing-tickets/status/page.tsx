'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { supabase, supabaseEtiquetas } from '@/lib/supabaseClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  ArrowLeft, 
  Zap, 
  ZoomIn, 
  Camera, 
  Keyboard,
  Clock,
  History,
  PackageCheck,
  ClipboardList,
  PlusCircle
} from 'lucide-react';
import Link from 'next/link';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type ScanLog = {
  id: string;
  code: string;
  status: 'PPC' | 'ENTREGADO';
  result: 'success' | 'error';
  message: string;
  time: string;
};

export default function SewingStatusScannerPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [targetStatus, setTargetStatus] = useState<'PPC' | 'ENTREGADO'>('PPC');
  const [scannerActive, setScannerActive] = useState(false);
  const [selectedScannerMode, setSelectedScannerMode] = useState<'camara' | 'fisico'>('camara');
  const [loading, setLoading] = useState(false);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [manualCode, setManualCode] = useState('');
  
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [cameraCapabilities, setCameraCapabilities] = useState<any>(null);
  
  const isMobile = useIsMobile();
  const readerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef(0);
  const bufferRef = useRef('');

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const playBeep = () => {
    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gainNode.gain.setValueAtTime(0.5, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + 0.1);
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.1);
  };

  const playErrorSound = () => {
    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(440, context.currentTime);
    gainNode.gain.setValueAtTime(0.5, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + 0.2);
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
  };

  const handleProcessCode = useCallback(async (code: string) => {
    const finalCode = code.trim();
    if (!finalCode) return;

    // Throttle scans for hardware/camera
    const now = Date.now();
    if (now - lastScanTimeRef.current < 1500) return;
    lastScanTimeRef.current = now;

    setLoading(true);
    const logId = Math.random().toString(36).substring(7);
    const time = new Date().toLocaleTimeString('es-MX', { hour12: false });

    try {
      const numericCode = parseFloat(finalCode);
      if (isNaN(numericCode)) throw new Error('Código no es numérico');

      // 1. Validar y Actualizar tabla PERSONAL (Main DB)
      const personalUpdate: any = { status: targetStatus };
      if (targetStatus === 'PPC') personalUpdate.date_ppc = new Date().toISOString();
      if (targetStatus === 'ENTREGADO') personalUpdate.date_entre = new Date().toISOString();

      const { data: personalData, error: personalError } = await supabase
        .from('personal')
        .update(personalUpdate)
        .eq('code', numericCode)
        .select('id, product');

      if (personalError) throw personalError;
      
      if (!personalData || personalData.length === 0) {
        throw new Error('Código no encontrado en producción');
      }

      // 2. Intentar actualizar SEWING_TICKETS (Labels DB) para registro histórico
      await supabaseEtiquetas
        .from('sewing_tickets')
        .update({ updated_at: new Date().toISOString() })
        .eq('codigo_barra', finalCode);

      playBeep();
      setScanLogs(prev => [{
        id: logId,
        code: finalCode,
        status: targetStatus,
        result: 'success',
        message: personalData[0].product || 'Actualizado correctamente',
        time
      }, ...prev]);

    } catch (error: any) {
      playErrorSound();
      setScanLogs(prev => [{
        id: logId,
        code: finalCode,
        status: targetStatus,
        result: 'error',
        message: error.message || 'Error desconocido',
        time
      }, ...prev]);
    } finally {
      setLoading(false);
    }
  }, [targetStatus]);

  const handleManualSubmit = () => {
    if (!manualCode.trim()) return;
    handleProcessCode(manualCode);
    setManualCode('');
  };

  // Keyboard/Physical Scanner Logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedScannerMode !== 'fisico' || !scannerActive) return;
      
      // If user is typing in manual input, don't capture as scanner input
      if (document.activeElement?.tagName === 'INPUT') return;

      if (e.key === 'Enter') {
        e.preventDefault();
        if (bufferRef.current) {
          handleProcessCode(bufferRef.current);
          bufferRef.current = '';
        }
      } else if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedScannerMode, scannerActive, handleProcessCode]);

  // Camera Scanner Logic
  useEffect(() => {
    if (!isMounted || !readerRef.current || selectedScannerMode !== 'camara' || !scannerActive) return;

    if (!html5QrCodeRef.current) {
      html5QrCodeRef.current = new Html5Qrcode(readerRef.current.id, false);
    }
    const qrCode = html5QrCodeRef.current;

    qrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (text) => handleProcessCode(text),
      () => {}
    ).then(() => {
      const videoElement = readerRef.current?.querySelector('video');
      if (videoElement && videoElement.srcObject) {
        const track = (videoElement.srcObject as MediaStream).getVideoTracks()[0];
        if (track) setCameraCapabilities(track.getCapabilities?.() || null);
      }
    }).catch(err => {
      console.error(err);
      setScannerActive(false);
    });

    return () => {
      if (qrCode.isScanning) {
        qrCode.stop().catch(console.error);
      }
    };
  }, [scannerActive, selectedScannerMode, isMounted, handleProcessCode]);

  // Apply Camera Constraints
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
  }, [zoom, isFlashOn, scannerActive, selectedScannerMode]);

  if (!isMounted) return null;

  return (
    <>
      <Head><title>Actualización de Status | Costura</title></Head>
      <main className="w-full max-w-4xl mx-auto p-4 md:p-8 space-y-6 animate-in fade-in duration-500">
        <header className="flex items-center gap-4">
          <Link href="/sewing-tickets">
            <Button variant="ghost" size="icon" className="text-starbucks-green">
              <ArrowLeft className="h-6 w-6" />
            </Button>
          </Link>
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold text-starbucks-green flex items-center gap-2">
              <History className="h-6 w-6" />
              Actualización de Status
            </h1>
            <p className="text-sm text-gray-500 font-medium">Actualiza masivamente bultos de costura</p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Configuración */}
          <Card className="shadow-md border-starbucks-green/10">
            <CardHeader className="bg-gray-50/50 border-b">
              <CardTitle className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-starbucks-green" />
                Configuración y Manual
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="space-y-3">
                <Label className="text-xs font-bold text-gray-400 uppercase">1. Seleccionar Status Destino</Label>
                <RadioGroup 
                  value={targetStatus} 
                  onValueChange={(v) => setTargetStatus(v as any)}
                  className="grid grid-cols-2 gap-3"
                  disabled={scannerActive}
                >
                  <div className="flex items-center">
                    <RadioGroupItem value="PPC" id="st-ppc" className="peer sr-only" />
                    <Label 
                      htmlFor="st-ppc" 
                      className={cn(
                        "flex flex-col items-center justify-center w-full p-4 rounded-xl border-2 cursor-pointer transition-all",
                        targetStatus === 'PPC' 
                          ? "bg-starbucks-green text-white border-starbucks-green shadow-lg scale-105" 
                          : "bg-white text-gray-500 border-gray-100 hover:border-gray-200"
                      )}
                    >
                      <ClipboardList className="h-6 w-6 mb-2" />
                      <span className="font-black text-sm">PPC</span>
                    </Label>
                  </div>
                  <div className="flex items-center">
                    <RadioGroupItem value="ENTREGADO" id="st-delivered" className="peer sr-only" />
                    <Label 
                      htmlFor="st-delivered" 
                      className={cn(
                        "flex flex-col items-center justify-center w-full p-4 rounded-xl border-2 cursor-pointer transition-all",
                        targetStatus === 'ENTREGADO' 
                          ? "bg-blue-600 text-white border-blue-600 shadow-lg scale-105" 
                          : "bg-white text-gray-500 border-gray-100 hover:border-gray-200"
                      )}
                    >
                      <PackageCheck className="h-6 w-6 mb-2" />
                      <span className="font-black text-sm">ENTREGADO</span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-3 pt-2">
                <Label className="text-xs font-bold text-gray-400 uppercase">2. Método de Escaneo</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant={selectedScannerMode === 'camara' ? 'default' : 'outline'}
                    className={cn("h-12 font-bold", selectedScannerMode === 'camara' && "bg-starbucks-dark")}
                    onClick={() => setSelectedScannerMode('camara')}
                    disabled={scannerActive}
                  >
                    <Camera className="mr-2 h-4 w-4" /> CÁMARA
                  </Button>
                  <Button 
                    variant={selectedScannerMode === 'fisico' ? 'default' : 'outline'}
                    className={cn("h-12 font-bold", selectedScannerMode === 'fisico' && "bg-starbucks-dark")}
                    onClick={() => setSelectedScannerMode('fisico')}
                    disabled={scannerActive}
                  >
                    <Keyboard className="mr-2 h-4 w-4" /> USB / LASER
                  </Button>
                </div>
              </div>

              <div className="pt-4 border-t border-dashed space-y-3">
                <Label className="text-xs font-bold text-gray-400 uppercase">3. Ingreso Manual</Label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Escriba código..." 
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                    className="h-11 font-mono font-bold"
                  />
                  <Button 
                    onClick={handleManualSubmit}
                    disabled={loading || !manualCode.trim()}
                    className="h-11 bg-starbucks-green"
                  >
                    <PlusCircle className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              <div className="pt-2">
                <Button 
                  className={cn(
                    "w-full h-14 text-lg font-black tracking-tighter transition-all",
                    scannerActive ? "bg-red-600 hover:bg-red-700" : "bg-starbucks-green hover:bg-starbucks-dark"
                  )}
                  onClick={() => setScannerActive(!scannerActive)}
                >
                  {scannerActive ? 'DETENER ESCÁNER' : 'INICIAR ESCÁNER'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Scanner */}
          <Card className="shadow-md overflow-hidden flex flex-col">
            <div className={cn(
              "p-3 text-center text-xs font-black uppercase tracking-widest text-white animate-pulse",
              targetStatus === 'PPC' ? "bg-starbucks-accent" : "bg-blue-600"
            )}>
              MODO ACTUAL: {targetStatus}
            </div>
            <CardContent className="p-0 flex-grow relative bg-black flex items-center justify-center min-h-[350px]">
              {selectedScannerMode === 'camara' && (
                <div id="status-reader" ref={readerRef} className="w-full h-full" style={{ display: scannerActive ? 'block' : 'none' }}></div>
              )}
              
              {!scannerActive && (
                <div className="text-white/40 text-center space-y-4 p-8">
                  <div className="p-6 rounded-full bg-white/5 inline-block border border-white/10">
                    {selectedScannerMode === 'camara' ? <Camera className="h-12 w-12" /> : <Keyboard className="h-12 w-12" />}
                  </div>
                  <p className="font-bold text-sm">EL ESCÁNER ESTÁ INACTIVO</p>
                  <p className="text-[10px] opacity-50">Configura el modo y presiona Iniciar</p>
                </div>
              )}

              {selectedScannerMode === 'fisico' && scannerActive && (
                <div className="text-center space-y-4">
                  <Loader2 className="h-12 w-12 text-starbucks-green animate-spin mx-auto" />
                  <p className="text-starbucks-green font-black text-sm">ESPERANDO CÓDIGO USB...</p>
                </div>
              )}

              {scannerActive && selectedScannerMode === 'camara' && isMobile && cameraCapabilities && (
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
                        className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Logs */}
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between border-b py-3 px-4">
            <CardTitle className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
              <History className="h-4 w-4 text-gray-400" />
              Historial de Sesión ({scanLogs.length})
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setScanLogs([])} className="text-xs h-7">LIMPIAR</Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[400px] overflow-auto">
              {scanLogs.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 font-black text-[10px] uppercase text-gray-500 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left">Hora</th>
                      <th className="px-4 py-2 text-left">Código</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Resultado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {scanLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50 animate-in slide-in-from-left-2 duration-300">
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">{log.time}</td>
                        <td className="px-4 py-3 font-bold text-starbucks-dark">{log.code}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={cn(
                            "text-[9px] font-black",
                            log.status === 'PPC' ? "border-starbucks-green text-starbucks-green" : "border-blue-600 text-blue-600"
                          )}>
                            {log.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {log.result === 'success' ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                            <span className={cn(
                              "text-xs font-medium",
                              log.result === 'success' ? "text-green-700" : "text-red-700"
                            )}>{log.message}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-12 text-center text-gray-400 space-y-2">
                  <Zap className="h-10 w-10 mx-auto opacity-10" />
                  <p className="font-bold">No hay escaneos todavía</p>
                  <p className="text-xs">Los resultados aparecerán aquí conforme escanees</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
