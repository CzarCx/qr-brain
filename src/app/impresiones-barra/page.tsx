
'use client';
import {useEffect, useRef, useState, useCallback} from 'react';
import Head from 'next/head';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { supabase } from '@/lib/supabaseClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Trash2, Zap, ZoomIn } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';


type ScanResult = {
    name: string | null;
    product: string | null;
    code: string;
    found: boolean;
    error?: string;
    status?: string | null;
    details?: string | null;
};

type ReportReason = {
    id: number;
    t_report: string;
};

type Encargado = {
  name: string;
  rol: string;
};

export default function ImpresionesBarraPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [message, setMessage] = useState({ text: 'Apunte la cámara a un código QR.', type: 'info', show: false });
  const [lastScannedResult, setLastScannedResult] = useState<ScanResult | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [reportReasons, setReportReasons] = useState<ReportReason[]>([]);
  const [selectedReport, setSelectedReport] = useState('');
  const [showReportSelect, setShowReportSelect] = useState(false);
  const [selectedScannerMode, setSelectedScannerMode] = useState('camara');
  const [encargado, setEncargado] = useState('');
  const [encargadosList, setEncargadosList] = useState<Encargado[]>([]);
  const [scanMode, setScanMode] = useState('individual');
  const [massScannedCodes, setMassScannedCodes] = useState<ScanResult[]>([]);
  const [cameraCapabilities, setCameraCapabilities] = useState<any>(null);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const isMobile = useIsMobile();
  const [dbError, setDbError] = useState<string | null>(null);

  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const lastScanTimeRef = useRef(Date.now());
  const MIN_SCAN_INTERVAL = 2000; // 2 seconds between scans
  const massScannedCodesRef = useRef(new Set<string>());
  const physicalScannerInputRef = useRef<HTMLInputElement | null>(null);
  const bufferRef = useRef('');

   const showAppMessage = (text: string, type: 'success' | 'error' | 'info' | 'warning') => {
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }
    setMessage({ text, type, show: true });
    messageTimeoutRef.current = setTimeout(() => {
      setMessage(prev => ({ ...prev, show: false }));
    }, 2500);
  };

   useEffect(() => {
    setIsMounted(true);
    const fetchEncargados = async () => {
        const { data, error } = await supabase
            .from('personal_name')
            .select('name, rol');

        if (error) {
            setDbError('Error al cargar encargados. Revisa los permisos RLS de la tabla `personal_name`.');
        } else if (data) {
             const uniqueEncargados = Array.from(new Map(data.map(item => [item.name, item])).values());
             const barras = uniqueEncargados.filter(enc => enc.rol === 'barra') as Encargado[];
             if (barras.length === 0) {
                setDbError('No se encontraron encargados con el rol "barra". Revisa los datos o los permisos RLS.');
            } else {
                setEncargadosList(barras || []);
            }
        } else {
             setDbError('No se encontraron encargados. Revisa los datos o los permisos RLS.');
        }
    };
    fetchEncargados();
  }, []);

  const playBeep = () => {
    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(880, context.currentTime); // A5 note
    gainNode.gain.setValueAtTime(1, context.currentTime); // Further increased Volume
    gainNode.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + 0.1);
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.1);
  };

  const playWarningSound = () => {
    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(440, context.currentTime); // A4
    gainNode.gain.setValueAtTime(1.5, context.currentTime); // Increased Volume
    gainNode.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + 0.2);
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
  };

  const onScanSuccess = useCallback(async (decodedText: string) => {
    if (loading || Date.now() - lastScanTimeRef.current < MIN_SCAN_INTERVAL) return;
    
    lastScanTimeRef.current = Date.now();
    setLoading(true);
    showAppMessage('Procesando código...', 'info');
    if ('vibrate' in navigator) navigator.vibrate(100);

    let finalCode = decodedText;
    try {
        const parsed = JSON.parse(decodedText);
        if (parsed && parsed.id) {
            finalCode = String(parsed.id);
        }
    } catch (e) {
        // Not a JSON, proceed with the original decodedText
    }
    
    finalCode = String(finalCode).trim();
    
    // Prevent duplicates in mass scanning mode
    if (scanMode === 'masivo' && massScannedCodesRef.current.has(finalCode)) {
        showAppMessage(`Código duplicado: ${finalCode}`, 'warning');
        setLoading(false);
        return;
    }
    

    try {
        const { data, error } = await supabase
            .from('personal')
            .select('name, product, status, details')
            .eq('code', finalCode)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
            throw error;
        }

        if (data) {
            playBeep();
            const result: ScanResult = {
                name: data.name,
                product: data.product,
                code: finalCode,
                found: true,
                status: data.status,
                details: data.details,
            };

            if (data.status === 'CALIFICADO') {
                showAppMessage(`Etiqueta ya procesada (Estado: ${data.status}).`, 'warning');
                setLastScannedResult(result);
            } else {
                 if (scanMode === 'individual') {
                    setLastScannedResult(result);
                    showAppMessage('Etiqueta confirmada correctamente.', 'success');
                    setIsRatingModalOpen(true);
                } else { // Mass scanning mode
                    if (data.status === 'REPORTADO') {
                       showAppMessage(`Añadido (Reportado): ${finalCode}`, 'info');
                    } else {
                       showAppMessage(`Añadido a la lista: ${finalCode}`, 'success');
                    }
                    setMassScannedCodes(prev => [result, ...prev]);
                    massScannedCodesRef.current.add(finalCode);
                }
            }
        } else {
            playWarningSound();
            const result: ScanResult = {
                name: null,
                product: null,
                code: finalCode,
                found: false,
            };
            setLastScannedResult(result);
            showAppMessage('Esta etiqueta todavía no ha sido asignada.', 'error');
        }
    } catch (e: any) {
        const result: ScanResult = {
            name: null,
            product: null,
            code: finalCode,
            found: false,
            error: e.message,
        };
        setLastScannedResult(result);
        showAppMessage(`Error al consultar la base de datos: ${e.message}`, 'error');
    } finally {
        setLoading(false);
    }
  }, [loading, scanMode]);
  
    useEffect(() => {
        const handlePhysicalScannerInput = (event: KeyboardEvent) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                if (bufferRef.current) {
                onScanSuccess(bufferRef.current);
                bufferRef.current = '';
                }
            } else if (event.key.length === 1) {
                bufferRef.current += event.key;
            }
        };

        const input = physicalScannerInputRef.current;
        if (selectedScannerMode === 'fisico' && scannerActive && input) {
            input.addEventListener('keydown', handlePhysicalScannerInput);
            input.focus();
        }
        return () => {
            if (input) {
                input.removeEventListener('keydown', handlePhysicalScannerInput);
            }
        };
    }, [scannerActive, selectedScannerMode, onScanSuccess]);

  const applyCameraConstraints = useCallback((track: MediaStreamTrack) => {
    track.applyConstraints({
      advanced: [{
        zoom: zoom,
        torch: isFlashOn
      }]
    }).catch(e => console.error("Failed to apply constraints", e));
  }, [zoom, isFlashOn]);
  
  useEffect(() => {
    if (isMobile && scannerActive && selectedScannerMode === 'camara' && html5QrCodeRef.current?.getState() === Html5QrcodeScannerState.SCANNING) {
      const videoElement = document.getElementById('reader')?.querySelector('video');
      if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        if (track) {
          applyCameraConstraints(track);
        }
      }
    }
  }, [zoom, isFlashOn, scannerActive, selectedScannerMode, isMobile, applyCameraConstraints]);
  
  useEffect(() => {
    if (!isMounted || !readerRef.current) return;

    if (!html5QrCodeRef.current) {
      html5QrCodeRef.current = new Html5Qrcode(readerRef.current.id, false);
    }
    const qrCode = html5QrCodeRef.current;

    const cleanup = () => {
        if (qrCode && qrCode.isScanning) {
            return qrCode.stop().catch(err => {
                if (!String(err).includes('not started')) {
                    console.error("Fallo al detener el escáner:", err);
                }
            }).finally(() => {
              if (isMobile) {
                setCameraCapabilities(null);
                setIsFlashOn(false);
                setZoom(1);
              }
            });
        }
        return Promise.resolve();
    };

    if (scannerActive && selectedScannerMode === 'camara') {
      if (qrCode.getState() !== Html5QrcodeScannerState.SCANNING) {
        const config = {
          fps: 5,
          qrbox: { width: 250, height: 250 },
        };
        qrCode.start({ facingMode: "environment" }, config, onScanSuccess, (e: any) => {})
        .then(() => {
            if (isMobile) {
              const videoElement = document.getElementById('reader')?.querySelector('video');
              const stream = videoElement?.srcObject as MediaStream;
              const track = stream?.getVideoTracks()[0];
              if (track) {
                const capabilities = track.getCapabilities();
                setCameraCapabilities(capabilities);
              }
            }
        })
        .catch(err => {
            console.error("Error al iniciar camara:", err);
             // Si el error es el de transición, manejalo de forma controlada.
            if (String(err).includes('Cannot transition to a new state')) {
                showAppMessage('Error al iniciar la cámara. Por favor, intenta de nuevo.', 'error');
            } else {
                showAppMessage('Error al iniciar la cámara. Revisa los permisos.', 'error');
            }
            setScannerActive(false); // Forzar el estado a "detenido"
        });
      }
    } else {
      cleanup();
    }

    return () => {
      cleanup();
    };
  }, [scannerActive, selectedScannerMode, isMobile, isMounted]);


  useEffect(() => {
      // Clear list when switching modes
      setMassScannedCodes([]);
      massScannedCodesRef.current.clear();
      setLastScannedResult(null);
  }, [scanMode]);

  const handleOpenRatingModal = (isOpen: boolean) => {
    setIsRatingModalOpen(isOpen);
    if (!isOpen) {
        // Reset state when modal closes
        setShowReportSelect(false);
        setSelectedReport('');
        setLastScannedResult(null);
        showAppMessage('Apunte la cámara a un código QR.', 'info');
    }
  }

  const handleSendReport = async () => {
    if (!selectedReport || !lastScannedResult?.code) {
        alert("Por favor, selecciona un motivo de reporte.");
        return;
    }
    setLoading(true);
    try {
        const { error } = await supabase
            .from('personal')
            .update({ details: selectedReport, status: 'REPORTADO' })
            .eq('code', lastScannedResult.code);

        if (error) {
            throw error;
        }

        alert('Reporte enviado correctamente.');
        handleOpenRatingModal(false); // Close and reset

    } catch (e: any) {
        console.error('Error enviando el reporte:', e);
        alert(`Error al enviar el reporte: ${e.message}`);
    } finally {
        setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!lastScannedResult?.code) return;
    setLoading(true);
    try {
        const qualificationTimestamp = new Date().toISOString();
        const { error } = await supabase
            .from('personal')
            .update({ status: 'CALIFICADO', details: null, date_cal: qualificationTimestamp })
            .eq('code', lastScannedResult.code);

        if (error) {
            throw error;
        }

        alert('Calificación guardada correctamente.');
        handleOpenRatingModal(false);
    } catch (e: any) {
        console.error('Error guardando la calificación:', e);
        const errorMessage = e.message || JSON.stringify(e);
        alert(`Error al guardar la calificación: ${errorMessage}`);
    } finally {
        setLoading(false);
    }
  };

const handleMassQualify = async () => {
    if (massScannedCodes.length === 0) {
        alert("No hay códigos en la lista para marcar.");
        return;
    }
    setLoading(true);
    try {
        const codesToUpdate = massScannedCodes.map(item => item.code);
        
        const { error } = await supabase
            .from('personal')
            .update({ status: 'POR CALIFICAR' })
            .in('code', codesToUpdate);

        if (error) {
            throw error;
        }

        alert(`Se marcaron ${massScannedCodes.length} etiquetas como 'POR CALIFICAR' correctamente.`);
        setMassScannedCodes([]); // Clear the list
        massScannedCodesRef.current.clear();

    } catch (e: any) {
        console.error('Error en la calificación masiva:', e);
        const errorMessage = e.message || JSON.stringify(e);
        alert(`Error al marcar masivamente: ${errorMessage}`);
    } finally {
        setLoading(false);
    }
};

  const removeFromMassList = (codeToRemove: string) => {
    setMassScannedCodes(prev => prev.filter(item => item.code !== codeToRemove));
    massScannedCodesRef.current.delete(codeToRemove);
    showAppMessage(`Código ${codeToRemove} eliminado de la lista.`, 'info');
  };


  useEffect(() => {
    if (isRatingModalOpen && showReportSelect && reportReasons.length === 0) {
        const fetchReportReasons = async () => {
            const { data, error } = await supabase
                .from('reports')
                .select('id, t_report');
            
            if (error) {
                console.error('Error fetching report reasons:', error);
                 setDbError('Error al cargar motivos de reporte. Revisa los permisos RLS de la tabla `reports`.');
            } else {
                setReportReasons(data || []);
            }
        };

        fetchReportReasons();
    }
  }, [isRatingModalOpen, showReportSelect, reportReasons.length]);

  const messageClasses: any = {
      success: 'bg-green-500/80 text-white',
      error: 'bg-red-500/80 text-white',
      warning: 'bg-yellow-500/80 text-white',
      info: 'bg-blue-500/80 text-white'
  };


  return (
    <>
      <Head>
        <title>Impresiones Barra</title>
      </Head>
      <main className="text-starbucks-dark flex items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto bg-starbucks-white rounded-xl shadow-2xl p-4 md:p-6 space-y-4">
          <header className="text-center">
            <h1 className="text-xl md:text-2xl font-bold text-starbucks-green">Impresiones Barra</h1>
            <p className="text-gray-600 text-sm mt-1">Escanea el QR para calificar la calidad.</p>
          </header>

          {dbError && (
              <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Error de Base de Datos</AlertTitle>
                  <AlertDescription>{dbError}</AlertDescription>
              </Alert>
          )}

          <div className="space-y-4">
              <div>
                  <label htmlFor="encargado" className="block text-sm font-bold text-starbucks-dark mb-1">Nombre del Encargado:</label>
                   <Select onValueChange={setEncargado} value={encargado} disabled={scannerActive}>
                      <SelectTrigger className="bg-transparent hover:bg-gray-50 border border-input">
                          <SelectValue placeholder="Selecciona un encargado" />
                      </SelectTrigger>
                      <SelectContent>
                          {encargadosList.map((enc) => (
                              <SelectItem key={`${enc.name}-${enc.rol}`} value={enc.name}>
                                  {enc.name}
                              </SelectItem>
                          ))}
                      </SelectContent>
                  </Select>
              </div>

              <div>
                  <label className="block text-sm font-bold text-starbucks-dark mb-1">Método de Escaneo:</label>
                  <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setSelectedScannerMode('camara')} className={`area-btn w-full px-4 py-3 text-sm rounded-md shadow-sm focus:outline-none ${selectedScannerMode === 'camara' ? 'scanner-mode-selected' : ''}`} disabled={scannerActive}>CÁMARA</button>
                      <button onClick={() => setSelectedScannerMode('fisico')} className={`area-btn w-full px-4 py-3 text-sm rounded-md shadow-sm focus:outline-none ${selectedScannerMode === 'fisico' ? 'scanner-mode-selected' : ''}`} disabled={scannerActive}>ESCÁNER FÍSICO</button>
                  </div>
              </div>
              
              <div>
                  <label className="block text-sm font-bold text-starbucks-dark mb-1">Tipo de Escaneo:</label>
                  <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setScanMode('individual')} className={`area-btn w-full px-4 py-3 text-sm rounded-md shadow-sm focus:outline-none ${scanMode === 'individual' ? 'scanner-mode-selected' : ''}`} disabled={scannerActive}>Individual</button>
                      <button onClick={() => setScanMode('masivo')} className={`area-btn w-full px-4 py-3 text-sm rounded-md shadow-sm focus:outline-none ${scanMode === 'masivo' ? 'scanner-mode-selected' : ''}`} disabled={scannerActive}>Masivo</button>
                  </div>
              </div>
          </div>
          
          {scanMode === 'masivo' && (
            <h2 className="text-lg font-bold text-center text-starbucks-dark">Escaneados ({massScannedCodes.length})</h2>
          )}

          <div className="bg-starbucks-cream p-4 rounded-lg">
            <div className="scanner-container relative">
                <div id="reader" ref={readerRef} style={{ display: selectedScannerMode === 'camara' && scannerActive ? 'block' : 'none' }}></div>
                {message.show && (
                    <div className={`scanner-message ${messageClasses[message.type]}`}>
                        {message.text}
                    </div>
                )}
                {scannerActive && selectedScannerMode === 'camara' && <div id="laser-line"></div>}
                <input type="text" id="physical-scanner-input" ref={physicalScannerInputRef} className="hidden-input" autoComplete="off" />
                {selectedScannerMode === 'camara' && !scannerActive && (
                    <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg">
                        <p className="text-gray-500">La cámara está desactivada.</p>
                    </div>
                )}
            </div>

            {isMobile && scannerActive && selectedScannerMode === 'camara' && cameraCapabilities && (
                <div id="camera-controls" className="flex items-center gap-4 mt-4 p-2 rounded-lg bg-gray-200">
                    {cameraCapabilities.torch && (
                        <Button variant="ghost" size="icon" onClick={() => setIsFlashOn(prev => !prev)} className={isFlashOn ? 'bg-yellow-400' : ''}>
                            <Zap className="h-5 w-5" />
                        </Button>
                    )}
                    {cameraCapabilities.zoom && (
                         <div className="flex-1 flex items-center gap-2">
                            <ZoomIn className="h-5 w-5" />
                            <input
                                id="zoom-slider"
                                type="range"
                                min={cameraCapabilities.zoom.min}
                                max={cameraCapabilities.zoom.max}
                                step={cameraCapabilities.zoom.step}
                                value={zoom}
                                onChange={(e) => setZoom(parseFloat(e.target.value))}
                                className="w-full"
                            />
                        </div>
                    )}
                </div>
            )}

             {loading && (
                <div className="flex justify-center items-center mt-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-starbucks-green"></div>
                    <p className="ml-3">Buscando...</p>
                </div>
             )}
            <div id="scanner-controls" className="mt-4 flex flex-wrap gap-2 justify-center">
              <button onClick={() => { setScannerActive(true); setLastScannedResult(null); showAppMessage('Apunte la cámara a un código QR.', 'info'); }} disabled={scannerActive || loading || !encargado} className="px-4 py-2 text-white font-semibold rounded-lg shadow-md transition-colors duration-200 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-sm">
                Iniciar
              </button>
              <button onClick={() => window.location.reload()} disabled={!scannerActive} className="px-4 py-2 text-white font-semibold rounded-lg shadow-md transition-colors duration-200 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-sm">
                Detener
              </button>
            </div>
             <div id="physical-scanner-status" className="mt-4 text-center p-2 rounded-md bg-starbucks-accent text-white" style={{ display: scannerActive && selectedScannerMode === 'fisico' ? 'block' : 'none' }}>
                Escáner físico listo.
            </div>
          </div>

          <div id="result-container" className="space-y-4">
            {/* Fallback message display for when scanner is off */}
            {!message.show && (
                <div className="p-3 rounded-lg text-center font-semibold text-base bg-gray-100 text-gray-800">
                    {lastScannedResult?.found ? `Último escaneo: ${lastScannedResult.code}` : 'Apunte la cámara a un código QR.'}
                </div>
            )}

            {/* Individual Scan Result */}
            {lastScannedResult && scanMode === 'individual' && (
              <div className="bg-starbucks-cream p-4 rounded-lg text-left space-y-2">
                <div>
                    <h3 className="font-bold text-starbucks-dark uppercase text-sm">Código</h3>
                    <p className="text-base font-mono text-starbucks-green break-words">{lastScannedResult.code}</p>
                </div>
                {lastScannedResult.found ? (
                    <>
                        <div>
                            <h3 className="font-bold text-starbucks-dark uppercase text-sm">Empaquetado por</h3>
                            <p className="text-base text-gray-800">{lastScannedResult.name || 'No especificado'}</p>
                        </div>
                        <div>
                            <h3 className="font-bold text-starbucks-dark uppercase text-sm">Producto</h3>
                            <p className="text-base text-gray-800">{lastScannedResult.product || 'No especificado'}</p>
                        </div>
                        {(lastScannedResult.status !== 'CALIFICADO' || lastScannedResult.status === 'REPORTADO') && (
                             <Dialog open={isRatingModalOpen} onOpenChange={handleOpenRatingModal}>
                             <DialogTrigger asChild>
                                 <Button className="w-full mt-4 bg-starbucks-accent hover:bg-starbucks-green text-white">
                                 Calificar
                                 </Button>
                             </DialogTrigger>
                             <DialogContent className="sm:max-w-[425px]">
                                 <DialogHeader>
                                  <DialogTitle>Calificar Empaquetado</DialogTitle>
                                   <DialogDescription className="text-center pt-2">
                                     ¿Cómo calificarías la calidad del empaquetado de
                                     <span className="font-bold text-2xl text-starbucks-green block mt-2">{lastScannedResult.name}?</span>
                                   </DialogDescription>
                                 </DialogHeader>
                                 <div className="grid gap-4 py-4">
                                 {lastScannedResult.status === 'REPORTADO' && (
                                     <Alert variant="destructive">
                                         <AlertTriangle className="h-4 w-4" />
                                         <AlertTitle>Atención: Reporte Previo</AlertTitle>
                                         <AlertDescription>
                                             Reportado por: <span className="font-semibold">{lastScannedResult.details || 'N/E'}</span>.
                                         </AlertDescription>
                                     </Alert>
                                 )}
                                 {showReportSelect && (
                                     <Select onValueChange={setSelectedReport} value={selectedReport}>
                                     <SelectTrigger className="w-full">
                                         <SelectValue placeholder="Selecciona un motivo de reporte" />
                                     </SelectTrigger>
                                     <SelectContent>
                                         <SelectGroup>
                                         <SelectLabel>Motivos de Reporte</SelectLabel>
                                         {reportReasons.map((reason) => (
                                             <SelectItem key={reason.id} value={reason.t_report}>
                                             {reason.t_report}
                                             </SelectItem>
                                         ))}
                                         </SelectGroup>
                                     </SelectContent>
                                     </Select>
                                 )}
                                 </div>
                                 <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-center">
                                     {showReportSelect ? (
                                         <Button size="lg" variant="destructive" onClick={handleSendReport} disabled={loading || !selectedReport} className="w-full">
                                             {loading ? 'Enviando...' : 'Enviar Reporte'}
                                         </Button>
                                     ) : (
                                     <>
                                         <Button size="lg" variant="destructive" onClick={() => setShowReportSelect(true)}>
                                             Reportar
                                         </Button>
                                         <Button size="lg" onClick={handleAccept} className="bg-green-600 hover:bg-green-700">
                                         {loading ? 'Guardando...' : 'Aceptar'}
                                         </Button>
                                     </>
                                     )}
                                 </DialogFooter>
                             </DialogContent>
                             </Dialog>
                        )}
                    </>
                ) : (
                  lastScannedResult.error ? (
                    <p className="text-red-600">Error: {lastScannedResult.error}</p>
                  ) : null
                )}
              </div>
            )}
             {/* Mass Scan Results */}
             {scanMode === 'masivo' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-end items-center gap-2">
                        <Button onClick={handleMassQualify} disabled={loading || massScannedCodes.length === 0} className="bg-green-600 hover:bg-green-700 w-full sm:w-auto">
                            {loading ? 'Procesando...' : 'Calificar Todos'}
                        </Button>
                    </div>
                    <div className="table-container border border-gray-200 rounded-lg max-h-60 overflow-auto">
                        <Table>
                            <TableHeader className="sticky top-0 bg-starbucks-cream">
                                <TableRow>
                                    <TableHead>Código</TableHead>
                                    <TableHead>Producto</TableHead>
                                    <TableHead>Empaquetado por</TableHead>
                                    <TableHead className="text-right">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {massScannedCodes.length > 0 ? massScannedCodes.map((item) => (
                                    <TableRow key={item.code}>
                                        <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                        <TableCell className="text-xs">{item.product || 'N/A'}</TableCell>
                                        <TableCell className="text-xs">{item.name || 'N/A'}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => removeFromMassList(item.code)} className="text-red-500 hover:text-red-700 h-8 w-8">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                     <TableRow>
                                        <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                                            No hay códigos en la lista.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
