'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
  PlusCircle,
  AlertTriangle,
  Truck,
  Search,
  User,
  Check,
  ChevronsUpDown
} from 'lucide-react';
import Link from 'next/link';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn, getCameraCapabilitiesWithRetry } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type ScanLog = {
  id: string;
  code: string;
  status: 'PPC' | 'ENTREGADO';
  result: 'success' | 'error' | 'warning';
  message: string;
  time: string;
};

type PPCOrder = {
  code: string | number;
  product: string | null;
  sku: string | null;
  sales_num: string | number | null;
  date: string | null;
  driver_name: string | null;
  status: string;
};

const DRIVER_OPTIONS = [
  "JIMBO",
  "ESTEBAN",
  "ALFONSO",
  "RAFA",
  "MARVIN",
  "CORY",
  "SEBAS PERÚ",
  "GENA",
  "NORMAN",
  "COLECTA EN LAVADO",
  "COLECTA VIRGINIA FÁBREGAS"
];

const STORAGE_KEY = 'sewing_status_session_logs';

export default function SewingStatusScannerPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [targetStatus, setTargetStatus] = useState<'PPC' | 'ENTREGADO'>('PPC');
  const [scannerActive, setScannerActive] = useState(false);
  const [selectedScannerMode, setSelectedScannerMode] = useState<'camara' | 'fisico'>('camara');
  const [loading, setLoading] = useState(false);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [manualCode, setManualCode] = useState('');
  
  // PPC Logistics Section States
  const [ppcOrders, setPpcOrders] = useState<PPCOrder[]>([]);
  const [loadingPpc, setLoadingPpc] = useState(false);
  const [searchPpc, setSearchPpc] = useState('');
  
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [cameraCapabilities, setCameraCapabilities] = useState<any>(null);
  
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const readerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef(0);
  const bufferRef = useRef('');

  useEffect(() => {
    setIsMounted(true);
    fetchPpcOrders();

    // Recuperar logs de sesión guardados
    const savedLogs = localStorage.getItem(STORAGE_KEY);
    if (savedLogs) {
      try {
        const parsed = JSON.parse(savedLogs);
        if (Array.isArray(parsed)) {
          setScanLogs(parsed);
        }
      } catch (e) {
        console.error("Error al recuperar logs de sesión:", e);
      }
    }
  }, []);

  // Persistir logs cada vez que cambien
  useEffect(() => {
    if (isMounted) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(scanLogs));
    }
  }, [scanLogs, isMounted]);

  const fetchPpcOrders = async () => {
    setLoadingPpc(true);
    try {
      // 1. Fetch from 'personal' table in Etiquetas DB with status PPC
      const { data: personalPpc, error: pError } = await supabaseEtiquetas
        .from('personal')
        .select('code, product, sku, sales_num, date, driver_name, status')
        .eq('status', 'PPC');

      if (pError) throw pError;

      if (personalPpc && personalPpc.length > 0) {
        const codes = personalPpc.map(p => String(p.code));
        
        // 2. Cross reference with 'sewing_tickets'
        const { data: validTickets, error: tError } = await supabaseEtiquetas
          .from('sewing_tickets')
          .select('codigo_barra')
          .in('codigo_barra', codes);

        if (tError) throw tError;

        const validCodesSet = new Set(validTickets?.map(t => t.codigo_barra) || []);
        
        // 3. Only keep orders that exist in both tables
        const finalOrders = personalPpc
          .filter(p => validCodesSet.has(String(p.code)))
          .map(p => ({
            ...p,
            code: String(p.code)
          }));

        setPpcOrders(finalOrders);
      } else {
        setPpcOrders([]);
      }
    } catch (err: any) {
      console.error('Error fetching PPC orders:', err.message);
    } finally {
      setLoading(false);
      setLoadingPpc(false);
    }
  };

  const updateOrderDriver = async (code: string, driverName: string) => {
    try {
      const numericCode = parseFloat(code);
      const { error } = await supabaseEtiquetas
        .from('personal')
        .update({ driver_name: driverName === "PENDIENTE" ? null : driverName })
        .eq('code', numericCode);

      if (error) throw error;

      setPpcOrders(prev => 
        prev.map(order => order.code === code ? { ...order, driver_name: driverName === "PENDIENTE" ? null : driverName } : order)
      );

      toast({
        variant: 'success',
        title: driverName === "PENDIENTE" ? 'Driver Removido' : 'Driver Asignado',
        description: driverName === "PENDIENTE" ? `Se quitó el driver del bulto ${code}.` : `Se asignó a ${driverName} para el bulto ${code}.`,
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error al asignar',
        description: err.message,
      });
    }
  };

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

    const now = Date.now();
    if (now - lastScanTimeRef.current < 1500) return;
    lastScanTimeRef.current = now;

    setLoading(true);
    const logId = Math.random().toString(36).substring(7);
    const time = new Date().toLocaleTimeString('es-MX', { hour12: false });

    try {
      const { data: ticketRecord, error: ticketError } = await supabaseEtiquetas
        .from('sewing_tickets')
        .select('impreso, nombre_producto')
        .eq('codigo_barra', finalCode)
        .maybeSingle();

      if (ticketError) throw ticketError;

      if (!ticketRecord) {
        toast({
          variant: 'destructive',
          title: 'Código No Encontrado',
          description: `El bulto ${finalCode} no está registrado en la bitácora de costura.`,
        });
        throw new Error('Código no encontrado en la bitácora');
      }

      if (ticketRecord.impreso !== true) {
        toast({
          variant: 'destructive',
          title: 'Error de Flujo Operativo',
          description: 'Este bulto aún no ha sido marcado como impreso. Debes imprimirlo antes de actualizar su status.',
        });
        throw new Error('Bulto pendiente de impresión');
      }

      const numericCode = parseFloat(finalCode);
      if (isNaN(numericCode)) throw new Error('Código no es numérico');

      const personalUpdate: any = { status: targetStatus };
      if (targetStatus === 'PPC') personalUpdate.date_ppc = new Date().toISOString();
      if (targetStatus === 'ENTREGADO') personalUpdate.date_entre = new Date().toISOString();

      const { data: personalData, error: personalError } = await supabaseEtiquetas
        .from('personal')
        .update(personalUpdate)
        .eq('code', numericCode)
        .select('id, product, sku, sales_num, date');

      if (personalError) throw personalError;
      
      if (!personalData || personalData.length === 0) {
        throw new Error('No encontrado en producción (Personal)');
      }

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
        message: personalData[0].product || 'Status actualizado correctamente',
        time
      }, ...prev]);

      // If it became PPC, refresh the logistics table
      if (targetStatus === 'PPC') {
        fetchPpcOrders();
      } else {
        // If it was moved to ENTREGADO, remove from local PPC list if it was there
        setPpcOrders(prev => prev.filter(order => String(order.code) !== finalCode));
      }

    } catch (error: any) {
      playErrorSound();
      setScanLogs(prev => [{
        id: logId,
        code: finalCode,
        status: targetStatus,
        result: error.message && error.message.includes('impresión') ? 'warning' : 'error',
        message: error.message || 'Error desconocido',
        time
      }, ...prev]);
    } finally {
      setLoading(false);
    }
  }, [targetStatus, toast]);

  const handleManualSubmit = () => {
    if (!manualCode.trim()) return;
    handleProcessCode(manualCode);
    setManualCode('');
  };

  const handleClearLogs = () => {
    setScanLogs([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedScannerMode !== 'fisico' || !scannerActive) return;
      if (document.activeElement?.tagName === 'INPUT') return;

      if (e.key === 'Enter') {
        e.preventDefault();
        if (bufferRef.current) {
          handleProcessCode(bufferRef.current);
          bufferRef.current = '';
        }
      } else if (e.key.length === 1) {
        bufferRef.current += e.key || '';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedScannerMode, scannerActive, handleProcessCode]);

  const applyCameraConstraints = useCallback((track: MediaStreamTrack) => {
    if (!isMobile || !track || track.readyState !== 'live') return;
    track.applyConstraints({
      advanced: [{ zoom: zoom, torch: isFlashOn }]
    }).catch(e => {
      if (!String(e).includes('ConstraintNotSatisfiedError')) {
        console.error("Failed to apply constraints", e);
      }
    });
  }, [zoom, isFlashOn, isMobile]);

  useEffect(() => {
    if (selectedScannerMode === 'camara' && scannerActive && html5QrCodeRef.current?.getState() === Html5QrcodeScannerState.SCANNING) {
      const videoElement = readerRef.current?.querySelector('video');
      if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        if (track) applyCameraConstraints(track);
      }
    }
  }, [zoom, isFlashOn, scannerActive, selectedScannerMode, applyCameraConstraints, loading, scanLogs.length]);

  useEffect(() => {
    if (!isMounted || !readerRef.current || selectedScannerMode !== 'camara' || !scannerActive) return;

    if (!html5QrCodeRef.current) {
      html5QrCodeRef.current = new Html5Qrcode(readerRef.current.id, false);
    }
    const qrCode = html5QrCodeRef.current;
    // El resultado de getCameraCapabilitiesWithRetry puede tardar hasta ~1.5s;
    // si el usuario detiene (o reinicia) la cámara antes de que resuelva, esa
    // promesa vieja no debe pisar el estado con datos de un track ya muerto.
    let cancelled = false;

    const cleanup = async () => {
      cancelled = true;
      if (qrCode.isScanning) {
        try {
          await qrCode.stop();
        } catch (e) {
          // Ignore
        } finally {
          setCameraCapabilities(null);
          setIsFlashOn(false);
          setZoom(1);
        }
      }
    };

    const state = qrCode.getState();
    if (state === Html5QrcodeScannerState.IDLE || state === Html5QrcodeScannerState.NOT_STARTED) {
      qrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => handleProcessCode(text),
        () => {}
      ).then(() => {
        const videoElement = readerRef.current?.querySelector('video');
        if (videoElement && videoElement.srcObject) {
          const track = (videoElement.srcObject as MediaStream).getVideoTracks()[0];
          if (track) getCameraCapabilitiesWithRetry(track).then(caps => { if (!cancelled) setCameraCapabilities(caps); });
        }
      }).catch(err => {
        if (!String(err).includes('transition')) {
          console.error(err);
          setScannerActive(false);
        }
      });
    }

    return () => {
      cleanup();
    };
  }, [scannerActive, selectedScannerMode, isMounted, handleProcessCode]);

  const filteredPpcOrders = useMemo(() => {
    if (!searchPpc.trim()) return ppcOrders;
    const query = searchPpc.toLowerCase().trim();
    return ppcOrders.filter(order => 
      String(order.code).toLowerCase().includes(query) || 
      (order.product || '').toLowerCase().includes(query) ||
      (order.sku || '').toLowerCase().includes(query)
    );
  }, [ppcOrders, searchPpc]);

  if (!isMounted) return null;

  return (
    <>
      <Head><title>Actualización de Status | Costura</title></Head>
      <main className="w-full max-w-[1400px] mx-auto p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
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
              <p className="text-sm text-gray-500 font-medium">Flujo Operativo: Impresión → PPC → Entregado</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Section 1: Scanner and Manual Entry */}
          <div className="space-y-6">
            <Card className="shadow-md border-starbucks-green/10">
              <CardHeader className="bg-gray-50/50 border-b py-3 px-4">
                <CardTitle className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-starbucks-green" />
                  Configuración de Escaneo
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="space-y-3">
                  <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">1. Status de Destino</Label>
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
                        <span className="text-[8px] font-bold opacity-70">PRODUCCIÓN TERM.</span>
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
                        <span className="text-[8px] font-bold opacity-70">SALIDA FINAL</span>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-3 pt-2">
                  <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">2. Método de Entrada</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant={selectedScannerMode === 'camara' ? 'default' : 'outline'}
                      className={cn("h-11 font-bold text-xs", selectedScannerMode === 'camara' && "bg-starbucks-dark")}
                      onClick={() => setSelectedScannerMode('camara')}
                      disabled={scannerActive}
                    >
                      <Camera className="mr-2 h-4 w-4" /> CÁMARA
                    </Button>
                    <Button 
                      variant={selectedScannerMode === 'fisico' ? 'default' : 'outline'}
                      className={cn("h-11 font-bold text-xs", selectedScannerMode === 'fisico' && "bg-starbucks-dark")}
                      onClick={() => setSelectedScannerMode('fisico')}
                      disabled={scannerActive}
                    >
                      <Keyboard className="mr-2 h-4 w-4" /> USB / LASER
                    </Button>
                  </div>
                </div>

                <div className="pt-4 border-t border-dashed space-y-3">
                  <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">3. Entrada Manual de Código</Label>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Escriba código..." 
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                      className="h-11 font-mono font-bold text-sm"
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
                      "w-full h-14 text-lg font-black tracking-tighter transition-all shadow-md",
                      scannerActive ? "bg-red-600 hover:bg-red-700" : "bg-starbucks-green hover:bg-starbucks-dark"
                    )}
                    onClick={() => setScannerActive(!scannerActive)}
                  >
                    {scannerActive ? 'DETENER ESCÁNER' : 'INICIAR ESCÁNER'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-md">
              <CardHeader className="flex flex-row items-center justify-between border-b py-3 px-4">
                <CardTitle className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                  <History className="h-4 w-4 text-gray-400" />
                  Historial de Sesión ({scanLogs.length})
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={handleClearLogs} className="text-[10px] h-7 font-bold">LIMPIAR</Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[300px] overflow-auto custom-scrollbar">
                  {scanLogs.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50 font-black text-[9px] uppercase text-gray-500 border-b">
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
                            <td className="px-4 py-2 font-mono text-[10px] text-gray-400">{log.time}</td>
                            <td className="px-4 py-2 font-bold text-starbucks-dark text-xs">{log.code}</td>
                            <td className="px-4 py-2">
                              <Badge variant="outline" className={cn(
                                "text-[8px] font-black h-5",
                                log.status === 'PPC' ? "border-starbucks-green text-starbucks-green" : "border-blue-600 text-blue-600"
                              )}>
                                {log.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-1.5">
                                {log.result === 'success' ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                ) : log.result === 'warning' ? (
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                ) : (
                                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                                )}
                                <span className={cn(
                                  "text-[10px] font-bold truncate max-w-[120px]",
                                  log.result === 'success' ? "text-green-700" : 
                                  log.result === 'warning' ? "text-amber-700" : "text-red-700"
                                )}>{log.message}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-10 text-center text-gray-400 space-y-2">
                      <Zap className="h-8 w-8 mx-auto opacity-10" />
                      <p className="font-bold text-xs">No hay escaneos en esta sesión</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Section 2: Camera Preview */}
          <div className="space-y-6">
            <Card className="shadow-md overflow-hidden flex flex-col h-full">
              <div className={cn(
                "p-3 text-center text-[10px] font-black uppercase tracking-[0.2em] text-white animate-pulse",
                targetStatus === 'PPC' ? "bg-starbucks-accent" : "bg-blue-600"
              )}>
                MODO ACTUAL: ACTUALIZAR A {targetStatus}
              </div>
              <CardContent className="p-0 flex-grow relative bg-black flex items-center justify-center min-h-[400px]">
                {selectedScannerMode === 'camara' && (
                  <div id="status-reader" ref={readerRef} className="w-full h-full" style={{ display: scannerActive ? 'block' : 'none' }}></div>
                )}
                
                {!scannerActive && (
                  <div className="text-white/40 text-center space-y-4 p-8">
                    <div className="p-8 rounded-full bg-white/5 inline-block border border-white/10">
                      {selectedScannerMode === 'camara' ? <Camera className="h-16 w-16" /> : <Keyboard className="h-16 w-16" />}
                    </div>
                    <p className="font-bold text-base uppercase tracking-tight">Escáner Inactivo</p>
                    <p className="text-[10px] font-medium opacity-50 uppercase tracking-widest">Presiona el botón verde para comenzar</p>
                  </div>
                )}

                {selectedScannerMode === 'fisico' && scannerActive && (
                  <div className="text-center space-y-4">
                    <div className="relative inline-block">
                        <Loader2 className="h-16 w-16 text-starbucks-green animate-spin mx-auto" />
                        <Keyboard className="h-6 w-6 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    </div>
                    <p className="text-starbucks-green font-black text-sm uppercase tracking-widest">Esperando código de barras...</p>
                    <p className="text-white/40 text-[9px] font-bold">CONECTA TU ESCÁNER USB O LÁSER</p>
                  </div>
                )}

                {scannerActive && selectedScannerMode === 'camara' && isMobile && cameraCapabilities && (
                  <div className="absolute bottom-6 left-6 right-6 bg-black/70 backdrop-blur-md p-4 rounded-xl flex items-center gap-6 text-white z-10 border border-white/10">
                    {cameraCapabilities.torch && (
                      <Button variant="ghost" size="icon" onClick={() => setIsFlashOn(!isFlashOn)} className={cn("h-10 w-10", isFlashOn ? 'text-yellow-400 bg-white/10' : 'text-white')}>
                        <Zap className="h-6 w-6" />
                      </Button>
                    )}
                    {cameraCapabilities.zoom && (
                      <div className="flex-1 flex items-center gap-4">
                        <ZoomIn className="h-5 w-5 text-gray-400" />
                        <input 
                          type="range" 
                          min={cameraCapabilities.zoom.min} 
                          max={cameraCapabilities.zoom.max} 
                          step={0.1} 
                          value={zoom} 
                          onChange={(e) => setZoom(parseFloat(e.target.value))}
                          className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-starbucks-green"
                        />
                      </div>
                    )}
                  </div>
                )}
                {scannerActive && selectedScannerMode === 'camara' && <div id="laser-line-status" className="absolute top-1/2 left-0 w-full h-[2px] bg-red-500 shadow-[0_0_15px_1px_red] opacity-60 z-10 pointer-events-none -translate-y-1/2" />}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* New PPC Logistics Section */}
        <section id="ppc-logistics" className="space-y-4">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-xl font-black text-starbucks-dark flex items-center gap-2">
              <Truck className="h-6 w-6 text-amber-500" />
              PEDIDOS PPC PENDIENTES DE DRIVER
            </h2>
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
               <div className="relative flex-grow min-w-[250px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input 
                    placeholder="Buscar por código, producto o SKU..." 
                    className="pl-9 h-10 text-xs font-bold"
                    value={searchPpc}
                    onChange={(e) => setSearchPpc(e.target.value)}
                  />
               </div>
               <Button 
                variant="outline" 
                size="sm" 
                className="h-10 font-bold text-[10px]"
                onClick={fetchPpcOrders}
                disabled={loadingPpc}
               >
                 {loadingPpc ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <History className="h-3 w-3 mr-2" />}
                 ACTUALIZAR LISTA
               </Button>
            </div>
          </header>

          <Card className="shadow-lg border-none overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto custom-scrollbar">
                <Table className="min-w-[1000px]">
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="w-[150px] text-[10px] font-black uppercase tracking-wider">Cód. Barra</TableHead>
                      <TableHead className="w-[250px] text-[10px] font-black uppercase tracking-wider">Producto / SKU</TableHead>
                      <TableHead className="w-[120px] text-[10px] font-black uppercase tracking-wider text-center">Venta</TableHead>
                      <TableHead className="w-[120px] text-[10px] font-black uppercase tracking-wider text-center">Fecha PPC</TableHead>
                      <TableHead className="w-[200px] text-[10px] font-black uppercase tracking-wider text-center">Status Producción</TableHead>
                      <TableHead className="w-[200px] text-[10px] font-black uppercase tracking-wider">Driver Asignado</TableHead>
                      <TableHead className="w-[150px] text-[10px] font-black uppercase tracking-wider text-center">Trazabilidad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingPpc && ppcOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center">
                          <Loader2 className="h-8 w-8 animate-spin text-starbucks-green mx-auto mb-2" />
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cruzando datos con bitácora...</p>
                        </TableCell>
                      </TableRow>
                    ) : filteredPpcOrders.length > 0 ? (
                      filteredPpcOrders.map((order) => (
                        <TableRow key={order.code} className="hover:bg-gray-50 transition-colors group">
                          <TableCell className="font-mono font-black text-xs text-starbucks-green">
                            {order.code}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              <p className="text-[10px] font-black uppercase text-starbucks-dark truncate max-w-[230px]">{order.product || '---'}</p>
                              <Badge variant="secondary" className="text-[8px] font-bold h-4 bg-gray-100">{order.sku || 'N/A'}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-[10px] font-mono font-bold text-gray-500">{order.sales_num || '---'}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-[10px] font-bold text-gray-400">
                              {order.date ? new Date(order.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '---'}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                             <div className="flex flex-col items-center gap-1">
                                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200 text-[9px] font-black h-5">
                                  <ClipboardList className="h-2.5 w-2.5 mr-1" /> {order.status}
                                </Badge>
                                <span className="text-[7px] font-bold text-gray-400 uppercase">VALIDADO EN BITÁCORA</span>
                             </div>
                          </TableCell>
                          <TableCell>
                            <DriverSelector 
                              value={order.driver_name} 
                              onSelect={(val) => updateOrderDriver(String(order.code), val)} 
                            />
                          </TableCell>
                          <TableCell className="text-center">
                             {order.driver_name ? (
                               <Badge className="bg-green-600 text-white text-[8px] font-black h-5 animate-in zoom-in duration-300">
                                 <Check className="h-2.5 w-2.5 mr-1" /> DRIVER ASIGNADO
                               </Badge>
                             ) : (
                               <Badge variant="outline" className="text-amber-600 border-amber-300 text-[8px] font-black h-5 bg-amber-50 animate-pulse">
                                 <AlertTriangle className="h-2.5 w-2.5 mr-1" /> PENDIENTE DRIVER
                               </Badge>
                             )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center">
                          <PackageCheck className="h-8 w-8 mx-auto text-gray-200 mb-2" />
                          <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">No hay pedidos en PPC pendientes de driver</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </>
  );
}

function DriverSelector({ value, onSelect }: { value: string | null, onSelect: (val: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-9 w-full justify-between text-[10px] font-black uppercase border-2",
            value ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-800"
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{value || "--- PENDIENTE ---"}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0 z-50">
        <Command>
          <CommandInput placeholder="Buscar recolector..." className="h-9 text-xs" />
          <CommandList className="max-h-[300px]">
            <CommandEmpty className="py-2 text-[10px] text-center">No se encontró.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="PENDIENTE"
                onSelect={() => {
                  onSelect("PENDIENTE");
                  setOpen(false);
                }}
                className="text-[10px] font-bold uppercase text-red-600"
              >
                <XCircle className="mr-2 h-3 w-3" />
                --- REMOVER / PENDIENTE ---
              </CommandItem>
              {DRIVER_OPTIONS.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={(currentValue) => {
                    onSelect(currentValue.toUpperCase());
                    setOpen(false);
                  }}
                  className="text-[10px] font-bold uppercase"
                >
                  <Check
                    className={cn(
                      "mr-2 h-3 w-3 text-starbucks-green",
                      value === opt ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
