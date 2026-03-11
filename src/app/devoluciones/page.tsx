'use client';
import {useEffect, useRef, useState, useCallback, useMemo} from 'react';
import Head from 'next/head';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { supabase, supabaseEtiquetas } from '@/lib/supabaseClient';
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  AlertTriangle, 
  Zap, 
  ZoomIn, 
  PlusCircle, 
  CheckCircle, 
  XCircle, 
  Trash2, 
  Truck, 
  Undo2,
  PackageSearch
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Encargado = {
  name: string;
  rol: string;
  organization: string;
};

type ReturnItem = {
  code: string;
  scannedAt: string;
};

export default function DevolucionesPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [message, setMessage] = useState({ text: 'Apunte la cámara a un código QR.', type: 'info' as 'info' | 'success' | 'error' | 'warning', show: false });
  const [scannerActive, setScannerActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedScannerMode, setSelectedScannerMode] = useState('camara');
  const [encargado, setEncargado] = useState('');
  const [encargadosList, setEncargadosList] = useState<Encargado[]>([]);
  const [cameraCapabilities, setCameraCapabilities] = useState<any>(null);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const isMobile = useIsMobile();
  const [dbError, setDbError] = useState<string | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [notification, setNotification] = useState({ title: '', message: '', variant: 'default' as 'default' | 'destructive' | 'success' });

  // Batch states
  const [returnsList, setReturnsList] = useState<ReturnItem[]>([]);
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [driverPlate, setDriverPlate] = useState('');

  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const lastScanTimeRef = useRef(Date.now());
  const physicalScannerInputRef = useRef<HTMLInputElement | null>(null);
  const bufferRef = useRef('');
  const scannedCodesSetRef = useRef(new Set<string>());

  const MIN_SCAN_INTERVAL = 1500;

  const showAppMessage = (text: string, type: 'success' | 'error' | 'info' | 'warning') => {
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }
    setMessage({ text, type, show: true });
    messageTimeoutRef.current = setTimeout(() => {
      setMessage(prev => ({ ...prev, show: false }));
    }, 2500);
  };

   const showModalNotification = (title: string, message: string, variant: 'default' | 'destructive' | 'success' = 'default') => {
    setNotification({ title, message, variant });
    setShowNotification(true);
  };

  useEffect(() => {
    setIsMounted(true);
    const fetchEncargados = async () => {
        const { data, error } = await supabase
            .from('personal_name')
            .select('name, rol, organization')
            .eq('rol', 'entrega');

        if (error) {
            setDbError('Error al cargar encargados. Revisa los permisos RLS de la tabla `personal_name`.');
        } else if (data && data.length > 0) {
             const uniqueEncargados = Array.from(new Map(data.map(item => [item.name, item])).values());
             setEncargadosList(uniqueEncargados as Encargado[] || []);
        } else {
             setDbError('No se encontraron encargados con el rol "entrega". Revisa los datos o los permisos RLS.');
        }
    };
    fetchEncargados();
  }, []);

  const groupedEncargadoOptions = useMemo(() => {
    if (encargadosList.length === 0) return [];
    
    const grouped = encargadosList.reduce((acc, person) => {
        const org = person.organization || 'Sin Empresa';
        if (!acc[org]) {
            acc[org] = [];
        }
        acc[org].push({ value: person.name, label: person.name });
        return acc;
    }, {} as Record<string, { value: string; label: string }[]>);

    return Object.keys(grouped).sort().map(org => ({
        label: org,
        options: grouped[org].sort((a, b) => a.label.localeCompare(b.label))
    }));
  }, [encargadosList]);


  const playBeep = () => {
    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gainNode.gain.setValueAtTime(1, context.currentTime);
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
    oscillator.frequency.setValueAtTime(440, context.currentTime);
    gainNode.gain.setValueAtTime(1.5, context.currentTime);
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
    showAppMessage('Validando código...', 'info');
    if ('vibrate' in navigator) navigator.vibrate(100);

    let finalCode = decodedText.trim();
    
    // Check if already in current list
    if (scannedCodesSetRef.current.has(finalCode)) {
        playWarningSound();
        showAppMessage(`Código ya en la lista: ${finalCode}`, 'warning');
        setLoading(false);
        return;
    }

    try {
        const { data: devolucionData, error: findError } = await supabaseEtiquetas
            .from('devoluciones_ml')
            .select('code, entregado')
            .eq('code', finalCode)
            .single();

        if (findError && findError.code !== 'PGRST116') {
            throw new Error(`Error al buscar: ${findError.message}`);
        }
        
        if (!devolucionData) {
            playWarningSound();
            showModalNotification('No Encontrado', `La devolución con código ${finalCode} no existe en el sistema.`, 'destructive');
            setLoading(false);
            return;
        }

        if (devolucionData.entregado) {
            playWarningSound();
            showModalNotification('Ya Procesado', `Esta devolución ya fue marcada como entregada anteriormente.`, 'warning');
            setLoading(false);
            return;
        }
        
        // Add to list
        playBeep();
        const newItem: ReturnItem = {
            code: finalCode,
            scannedAt: new Date().toLocaleTimeString()
        };
        setReturnsList(prev => [newItem, ...prev]);
        scannedCodesSetRef.current.add(finalCode);
        showAppMessage(`Añadido: ${finalCode}`, 'success');

    } catch (e: any) {
        playWarningSound();
        showModalNotification('Error', `Ocurrió un error: ${e.message}`, 'destructive');
    } finally {
        setLoading(false);
    }
  }, [loading]);
  
  const removeFromList = (code: string) => {
      setReturnsList(prev => prev.filter(item => item.code !== code));
      scannedCodesSetRef.current.delete(code);
      showAppMessage(`Eliminado: ${code}`, 'info');
  };

  const handleOpenFinalizeModal = () => {
      if (returnsList.length === 0) {
          showAppMessage('No hay códigos en la lista.', 'warning');
          return;
      }
      setIsFinalizeModalOpen(true);
  };

  const handleFinalizeReturns = async () => {
      if (!driverName.trim() || !driverPlate.trim()) {
          alert("Por favor, ingresa el nombre del conductor y las placas.");
          return;
      }

      setLoading(true);
      const codes = returnsList.map(item => item.code);

      try {
          const { error } = await supabaseEtiquetas
              .from('devoluciones_ml')
              .update({ 
                  entregado: true, 
                  name_inc: encargado,
                  driver_name: driverName,
                  driver_plate: driverPlate,
                  date_entregado: new Date().toISOString()
              })
              .in('code', codes);

          if (error) throw error;

          playBeep();
          showModalNotification('¡Éxito!', `Se procesaron ${codes.length} devoluciones correctamente.`, 'success');
          
          // Reset session
          setReturnsList([]);
          scannedCodesSetRef.current.clear();
          setDriverName('');
          setDriverPlate('');
          setIsFinalizeModalOpen(false);

      } catch (e: any) {
          playWarningSound();
          showModalNotification('Error al Guardar', e.message, 'destructive');
      } finally {
          setLoading(false);
      }
  };

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
          fps: 10,
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
            if (String(err).includes('Cannot transition to a new state')) {
                showAppMessage('Error al iniciar la cámara. Por favor, intenta de nuevo.', 'error');
            } else {
                showAppMessage('Error al iniciar la cámara. Revisa los permisos.', 'error');
            }
            setScannerActive(false);
        });
      }
    } else {
      cleanup();
    }

    return () => {
      cleanup();
    };
  }, [scannerActive, selectedScannerMode, isMobile, isMounted, onScanSuccess]);


  const handleManualAdd = async () => {
    const manualCodeInput = document.getElementById('manual-code-input-devoluciones') as HTMLInputElement;
    if (!encargado.trim()) {
      showAppMessage('Por favor, selecciona un encargado.', 'error');
      return;
    }

    const manualCode = manualCodeInput.value.trim();
    if (!manualCode) {
      showAppMessage('Por favor, ingresa un código para agregar.', 'error');
      return;
    }
    
    await onScanSuccess(manualCode);
    manualCodeInput.value = '';
    manualCodeInput.focus();
  };
  
  const messageClasses: any = {
      success: 'bg-green-500/80 text-white',
      error: 'bg-red-500/80 text-white',
      warning: 'bg-yellow-500/80 text-white',
      info: 'bg-blue-500/80 text-white'
  };


  return (
    <>
      <Head>
        <title>Módulo de Devoluciones</title>
      </Head>
      <main className="text-starbucks-dark flex items-center justify-center p-4">
        <div className="w-full max-w-2xl mx-auto bg-starbucks-white rounded-xl shadow-2xl p-4 md:p-6 space-y-4">
          <header className="text-center">
            <div className="inline-block p-3 bg-starbucks-cream rounded-full mb-2">
                <Undo2 className="h-8 w-8 text-starbucks-green" />
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-starbucks-green">Módulo de Devoluciones</h1>
            <p className="text-gray-600 text-sm mt-1">Escanea los paquetes devueltos por la paquetería.</p>
          </header>

          {dbError && (
              <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Error de Base de Datos</AlertTitle>
                  <AlertDescription>{dbError}</AlertDescription>
              </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                  <div>
                      <label htmlFor="encargado" className="block text-sm font-bold text-starbucks-dark mb-1">Nombre del Encargado:</label>
                       <Combobox
                          groupedOptions={groupedEncargadoOptions}
                          value={encargado}
                          onValueChange={setEncargado}
                          placeholder="Selecciona un encargado..."
                          emptyMessage="No se encontró encargado."
                          buttonClassName="bg-transparent hover:bg-gray-50 border-input"
                          disabled={scannerActive}
                      />
                  </div>

                  <div>
                      <label className="block text-sm font-bold text-starbucks-dark mb-1">Método de Escaneo:</label>
                      <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => setSelectedScannerMode('camara')} className={`area-btn w-full px-4 py-3 text-sm rounded-md shadow-sm focus:outline-none ${selectedScannerMode === 'camara' ? 'scanner-mode-selected' : ''}`} disabled={scannerActive}>CÁMARA</button>
                          <button onClick={() => setSelectedScannerMode('fisico')} className={`area-btn w-full px-4 py-3 text-sm rounded-md shadow-sm focus:outline-none ${selectedScannerMode === 'fisico' ? 'scanner-mode-selected' : ''}`} disabled={scannerActive}>ESCÁNER FÍSICO</button>
                      </div>
                  </div>
                  
                  <div className="p-4 bg-starbucks-cream rounded-lg border border-dashed border-gray-300">
                      <label htmlFor="manual-code-input-devoluciones" className="block text-sm font-bold text-starbucks-dark mb-1">Ingreso Manual:</label>
                      <div className="relative mt-1 flex items-center rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                          <Input
                              type="text"
                              id="manual-code-input-devoluciones"
                              className="w-full border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                              placeholder="Escriba el código..."
                              onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()}
                          />
                          <Button
                              type="button"
                              onClick={handleManualAdd}
                              size="icon"
                              className="h-8 w-8 bg-starbucks-green hover:bg-starbucks-dark text-white rounded-md mr-1"
                          >
                              <PlusCircle className="h-5 w-5" />
                          </Button>
                      </div>
                  </div>
              </div>

              <div className="space-y-4">
                  <div className="bg-starbucks-cream p-4 rounded-lg flex flex-col h-full">
                    <div className="scanner-container relative flex-grow min-h-[200px]">
                        <div id="reader" ref={readerRef} style={{ display: selectedScannerMode === 'camara' && scannerActive ? 'block' : 'none' }}></div>
                        {message.show && (
                            <div className={`scanner-message ${messageClasses[message.type]}`}>
                                {message.text}
                            </div>
                        )}
                        {scannerActive && selectedScannerMode === 'camara' && <div id="laser-line"></div>}
                        <input type="text" id="physical-scanner-input" ref={physicalScannerInputRef} className="hidden-input" autoComplete="off" />
                        {selectedScannerMode === 'camara' && !scannerActive && (
                            <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg h-full flex items-center justify-center">
                                <p className="text-gray-500">Cámara inactiva.</p>
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

                    <div id="scanner-controls" className="mt-4 flex flex-wrap gap-2 justify-center">
                      <Button onClick={() => { setScannerActive(true); showAppMessage('Apunte la cámara a un código QR.', 'info'); }} disabled={scannerActive || loading || !encargado} className="bg-blue-600 hover:bg-blue-700 text-sm">
                        Iniciar
                      </Button>
                      <Button onClick={() => setScannerActive(false)} variant="destructive" className="text-sm" disabled={!scannerActive}>
                        Detener
                      </Button>
                    </div>
                  </div>
              </div>
          </div>

          <div className="space-y-4 border-t pt-4">
              <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold text-starbucks-dark flex items-center gap-2">
                      <PackageSearch className="h-5 w-5 text-starbucks-green" />
                      Lista de Escaneo ({returnsList.length})
                  </h2>
                  <Button 
                    onClick={handleOpenFinalizeModal} 
                    disabled={returnsList.length === 0 || loading}
                    className="bg-starbucks-accent hover:bg-starbucks-green text-white font-bold"
                  >
                      Finalizar y Guardar
                  </Button>
              </div>

              <div className="table-container border border-gray-200 rounded-lg max-h-64 overflow-auto bg-white shadow-inner">
                  <Table>
                      <TableHeader className="sticky top-0 bg-gray-50 z-10">
                          <TableRow>
                              <TableHead className="w-16 text-center">#</TableHead>
                              <TableHead>Código de Devolución</TableHead>
                              <TableHead>Hora Escaneo</TableHead>
                              <TableHead className="text-right">Acción</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {returnsList.length > 0 ? returnsList.map((item, index) => (
                              <TableRow key={item.code}>
                                  <TableCell className="text-center font-bold text-gray-400">{index + 1}</TableCell>
                                  <TableCell className="font-mono text-sm">{item.code}</TableCell>
                                  <TableCell className="text-xs text-gray-500">{item.scannedAt}</TableCell>
                                  <TableCell className="text-right">
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => removeFromList(item.code)} 
                                        className="text-red-500 hover:text-red-700 h-8 w-8"
                                      >
                                          <Trash2 className="h-4 w-4" />
                                      </Button>
                                  </TableCell>
                              </TableRow>
                          )) : (
                              <TableRow>
                                  <TableCell colSpan={4} className="text-center text-gray-500 py-12">
                                      No has escaneado ninguna devolución todavía.
                                  </TableCell>
                              </TableRow>
                          )}
                      </TableBody>
                  </Table>
              </div>
          </div>
        </div>
      </main>

      {/* Modal Finalizar Devoluciones */}
      <Dialog open={isFinalizeModalOpen} onOpenChange={setIsFinalizeModalOpen}>
          <DialogContent className="sm:max-w-md">
              <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-starbucks-green">
                      <Truck className="h-6 w-6" />
                      Confirmar Transporte de Devolución
                  </DialogTitle>
                  <DialogDescription>
                      Ingresa los datos del transporte que trae las {returnsList.length} devoluciones.
                  </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                      <Label htmlFor="driver-name" className="font-bold">Nombre del Conductor:</Label>
                      <Input
                          id="driver-name"
                          value={driverName}
                          onChange={(e) => setDriverName(e.target.value)}
                          placeholder="Ej. Juan Pérez"
                          className="bg-transparent"
                      />
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="driver-plate" className="font-bold">Placas del Auto:</Label>
                      <Input
                          id="driver-plate"
                          value={driverPlate}
                          onChange={(e) => setDriverPlate(e.target.value)}
                          placeholder="Ej. ABC-1234"
                          className="bg-transparent"
                      />
                  </div>
              </div>
              <DialogFooter className="flex flex-col sm:flex-row gap-2">
                  <Button variant="outline" onClick={() => setIsFinalizeModalOpen(false)} className="w-full sm:w-auto">
                      Cancelar
                  </Button>
                  <Button 
                    onClick={handleFinalizeReturns} 
                    disabled={loading || !driverName.trim() || !driverPlate.trim()}
                    className="w-full sm:w-auto bg-starbucks-green hover:bg-starbucks-dark text-white"
                  >
                      {loading ? 'Guardando...' : 'Confirmar y Guardar'}
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      {showNotification && (
          <div id="notification-overlay" className="p-4 fixed inset-0 bg-black/75 flex justify-center items-center z-[100]" onClick={() => setShowNotification(false)}>
                <div className="bg-starbucks-white rounded-lg shadow-xl p-6 w-full max-w-sm text-center space-y-4" onClick={(e) => e.stopPropagation()}>
                  <Alert variant={notification.variant as any} className={notification.variant === 'success' ? 'border-green-500 text-green-700 [&>svg]:text-green-700' : notification.variant === 'warning' ? 'border-yellow-500 text-yellow-700 [&>svg]:text-yellow-700' : ''}>
                      {notification.variant === 'destructive' ? <XCircle className="h-5 w-5" /> : notification.variant === 'success' ? <CheckCircle className="h-5 w-5"/> : <AlertTriangle className="h-5 w-5" />}
                      <AlertTitle className="font-bold">{notification.title}</AlertTitle>
                      <AlertDescription>{notification.message}</AlertDescription>
                  </Alert>
                  <div className="flex justify-center gap-4 mt-4">
                      <Button onClick={() => setShowNotification(false)}>Cerrar</Button>
                  </div>
              </div>
          </div>
      )}
    </>
  );
}
