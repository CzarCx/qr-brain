
'use client';
import {useEffect, useRef, useState, useCallback} from 'react';
import Head from 'next/head';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { supabase, supabaseEtiquetas } from '@/lib/supabaseClient';
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
import { Input } from '@/components/ui/input';
import { Label } from "@/components/ui/label";
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
import { AlertTriangle, Trash2, Zap, ZoomIn, PlusCircle, Download } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Switch } from '@/components/ui/switch';


type ScanResult = {
    name: string | null;
    product: string | null;
    code: string;
    found: boolean;
    error?: string;
    status?: string | null;
    details?: string | null;
    sku?: string | null;
    quantity?: number | null;
    organization?: string | null;
    sales_num?: string | number | null;
    isNew?: boolean;
};

type ReportReason = {
    id: number;
    t_report: string;
};

type Encargado = {
  name: string;
  rol: string;
};

type LoteConfirmationState = {
  isOpen: boolean;
  existingCount: number;
  newCount: number;
};

export default function CalificarPage() {
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
  const [loteId, setLoteId] = useState('');
  const [isNextDayDelivery, setIsNextDayDelivery] = useState(false);
  const [loteToLoad, setLoteToLoad] = useState('');
  const [loteConfirmation, setLoteConfirmation] = useState<LoteConfirmationState>({ isOpen: false, existingCount: 0, newCount: 0 });

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
            .select('name, rol')
            .eq('rol', 'barra');

        if (error) {
            setDbError('Error al cargar encargados. Revisa los permisos RLS de la tabla `personal_name`.');
        } else if (data && data.length > 0) {
             const uniqueEncargados = Array.from(new Map(data.map(item => [item.name, item])).values());
             setEncargadosList(uniqueEncargados as Encargado[] || []);
        } else {
             setDbError('No se encontraron encargados con el rol "barra". Revisa los datos o los permisos RLS.');
        }
    };
    fetchEncargados();
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (massScannedCodes.length > 0) {
        event.preventDefault();
        event.returnValue = '¿Estás seguro de refrescar la página? Si refrescas se perderá el progreso de etiquetas escaneadas.';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [massScannedCodes]);

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
    
    if (scanMode === 'masivo' && massScannedCodesRef.current.has(finalCode)) {
        showAppMessage(`Código duplicado: ${finalCode}`, 'warning');
        setLoading(false);
        return;
    }
    
    try {
        const { data: personalData, error: personalError } = await supabase
            .from('personal')
            .select('name, product, status, details')
            .eq('code', finalCode)
            .single();

        if (personalError && personalError.code !== 'PGRST116') { // PGRST116 means no rows found
            throw personalError;
        }

        if (personalData) {
            playBeep();
            const result: ScanResult = {
                name: personalData.name,
                product: personalData.product,
                code: finalCode,
                found: true,
                status: personalData.status,
                details: personalData.details,
            };

            if (personalData.status === 'CALIFICADO') {
                showAppMessage(`Etiqueta ya procesada (Estado: ${personalData.status}).`, 'warning');
                setLastScannedResult(result);
            } else {
                 if (scanMode === 'individual') {
                    setLastScannedResult(result);
                    showAppMessage('Etiqueta confirmada correctamente.', 'success');
                    setIsRatingModalOpen(true);
                } else { // Mass scanning mode
                    if (personalData.status === 'REPORTADO') {
                       showAppMessage(`Añadido (Reportado): ${finalCode}`, 'info');
                    } else {
                       showAppMessage(`Añadido a la lista: ${finalCode}`, 'success');
                    }
                    setMassScannedCodes(prev => [result, ...prev]);
                    massScannedCodesRef.current.add(finalCode);
                }
            }
        } else {
            // Not in 'personal' table, check 'etiquetas_i'
            const { data: etiquetaData, error: etiquetaError } = await supabaseEtiquetas
                .from('etiquetas_i')
                .select('code, sku, product, quantity, organization, sales_num')
                .eq('code', finalCode)
                .single();

            if (etiquetaError && etiquetaError.code !== 'PGRST116') {
                throw etiquetaError;
            }

            if (etiquetaData) {
                playBeep();
                const result: ScanResult = {
                    code: etiquetaData.code,
                    name: 'N/A',
                    product: etiquetaData.product,
                    sku: etiquetaData.sku,
                    quantity: etiquetaData.quantity,
                    organization: etiquetaData.organization,
                    sales_num: etiquetaData.sales_num,
                    found: true,
                    status: 'CALIFICADO',
                    details: "Esta etiqueta fue asignada y calificada al mismo tiempo",
                    isNew: true, // Mark as new record
                };
                
                if (scanMode === 'individual') {
                     const qualificationTimestamp = new Date();
                     if (isNextDayDelivery) {
                        qualificationTimestamp.setDate(qualificationTimestamp.getDate() + 1);
                     }
                     const newPersonalRecord = {
                        code: result.code,
                        name: result.name,
                        name_inc: encargado || 'N/A',
                        sku: result.sku,
                        product: result.product,
                        quantity: result.quantity,
                        organization: result.organization,
                        sales_num: result.sales_num,
                        status: 'CALIFICADO',
                        date: qualificationTimestamp.toISOString(),
                        date_cal: qualificationTimestamp.toISOString(),
                        details: result.details,
                    };
                    const { error: insertError } = await supabase.from('personal').insert(newPersonalRecord);
                    if (insertError) throw insertError;
                    
                    setLastScannedResult(result);
                    showAppMessage('Etiqueta no asignada, calificada automáticamente.', 'success');

                } else { // Mass mode
                    showAppMessage(`Añadido (Auto-Calificado): ${finalCode}`, 'success');
                    setMassScannedCodes(prev => [result, ...prev]);
                    massScannedCodesRef.current.add(finalCode);
                }
            } else {
                playWarningSound();
                const result: ScanResult = { name: null, product: null, code: finalCode, found: false };
                setLastScannedResult(result);
                showAppMessage('Esta etiqueta no existe en el sistema.', 'error');
            }
        }
    } catch (e: any) {
        playWarningSound();
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
  }, [loading, scanMode, encargado, isNextDayDelivery, massScannedCodes]);
  
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
  }, [zoom, isFlashOn, scannerActive, selectedScannerMode, isMobile, applyCameraConstraints, massScannedCodes]);
  
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
        const qualificationTimestamp = new Date();
        if (isNextDayDelivery) {
            qualificationTimestamp.setDate(qualificationTimestamp.getDate() + 1);
        }

        const { error } = await supabase
            .from('personal')
            .update({ status: 'CALIFICADO', details: null, date: qualificationTimestamp.toISOString(), date_cal: qualificationTimestamp.toISOString() })
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
    setLoteConfirmation({ isOpen: false, existingCount: 0, newCount: 0 }); // Close modal first
    setLoading(true);
    try {
        const qualificationTimestamp = new Date();
        if (isNextDayDelivery) {
            qualificationTimestamp.setDate(qualificationTimestamp.getDate() + 1);
        }
        
        const recordsToInsert = massScannedCodes.filter(item => item.isNew);
        const codesToUpdate = massScannedCodes.filter(item => !item.isNew).map(item => item.code);

        let errorCount = 0;
        let successCount = 0;

        if (recordsToInsert.length > 0) {
            const newPersonalRecords = recordsToInsert.map(item => ({
                code: item.code,
                name: item.name,
                name_inc: encargado || 'N/A',
                sku: item.sku,
                product: item.product,
                quantity: item.quantity,
                organization: item.organization,
                sales_num: item.sales_num,
                status: 'CALIFICADO',
                date: qualificationTimestamp.toISOString(),
                date_cal: qualificationTimestamp.toISOString(),
                details: item.details,
                lote: loteId,
            }));

            const { error: insertError } = await supabase.from('personal').insert(newPersonalRecords);
            if (insertError) {
                console.error('Error en la inserción masiva:', insertError);
                errorCount += recordsToInsert.length;
            } else {
                successCount += recordsToInsert.length;
            }
        }

        if (codesToUpdate.length > 0) {
            const { error: updateError } = await supabase
                .from('personal')
                .update({ 
                    status: 'CALIFICADO', 
                    details: null, 
                    date: qualificationTimestamp.toISOString(),
                    date_cal: qualificationTimestamp.toISOString(),
                    lote: loteId,
                 })
                .in('code', codesToUpdate);
            
            if (updateError) {
                console.error('Error en la actualización masiva:', updateError);
                errorCount += codesToUpdate.length;
            } else {
                successCount += codesToUpdate.length;
            }
        }

        if (errorCount > 0) {
            alert(`Se procesaron ${successCount} etiquetas con éxito, pero ${errorCount} fallaron. Revisa la consola.`);
        } else {
            alert(`Se calificaron ${successCount} etiquetas correctamente con el lote ${loteId}.`);
        }

        setMassScannedCodes([]);
        massScannedCodesRef.current.clear();
        setLoteId('');

    } catch (e: any) {
        console.error('Error en la calificación masiva:', e);
        const errorMessage = e.message || JSON.stringify(e);
        alert(`Error al calificar masivamente: ${errorMessage}`);
    } finally {
        setLoading(false);
    }
};

const triggerMassQualify = async () => {
    if (massScannedCodes.length === 0) {
        alert("No hay códigos en la lista para calificar.");
        return;
    }
    if (!loteId.trim()) {
        alert("Por favor, ingresa un identificador de lote/tanda.");
        return;
    }
    setLoading(true);
    try {
        const { count, error } = await supabase
            .from('personal')
            .select('code', { count: 'exact', head: true })
            .eq('lote', loteId.trim());

        if (error) {
            throw new Error(`Error al verificar el lote: ${error.message}`);
        }

        if (count && count > 0) {
            // Lote existe, mostrar modal de confirmación
            setLoteConfirmation({
                isOpen: true,
                existingCount: count,
                newCount: massScannedCodes.length,
            });
        } else {
            // Lote no existe, proceder directamente
            await handleMassQualify();
        }
    } catch (e: any) {
        alert(`Error: ${e.message}`);
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

  const handleManualAdd = async () => {
    const manualCodeInput = document.getElementById('manual-code-input-calificar') as HTMLInputElement;
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
  
    const handleLoadLote = async () => {
    if (!loteToLoad.trim()) {
      showAppMessage('Por favor, ingresa un identificador de lote para cargar.', 'info');
      return;
    }
    setLoading(true);
    showAppMessage(`Cargando paquetes del lote ${loteToLoad}...`, 'info');

    try {
      const { data, error } = await supabase
        .from('personal')
        .select('*')
        .eq('lote', loteToLoad.trim());

      if (error) throw error;

      if (!data || data.length === 0) {
        showAppMessage(`No se encontraron paquetes para el lote ${loteToLoad}.`, 'warning');
        return;
      }
      
      const newItems: ScanResult[] = data.map(item => ({
        code: item.code,
        name: item.name,
        product: item.product,
        status: item.status,
        details: item.details,
        sku: item.sku,
        quantity: item.quantity,
        organization: item.organization,
        sales_num: item.sales_num,
        found: true,
        isNew: false,
      }));
      
      let addedCount = 0;
      const currentCodes = new Set(massScannedCodes.map(c => c.code));

      const itemsToAdd = newItems.filter(item => {
        if (!currentCodes.has(item.code)) {
          addedCount++;
          massScannedCodesRef.current.add(item.code);
          return true;
        }
        return false;
      });

      setMassScannedCodes(prev => [...prev, ...itemsToAdd]);
      showAppMessage(`Se agregaron ${addedCount} nuevos paquetes del lote ${loteToLoad}.`, 'success');
      setLoteToLoad('');

    } catch (e: any) {
      showAppMessage(`Error al cargar el lote: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
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
        <title>Calificar Empaquetado</title>
      </Head>
      <main className="text-starbucks-dark flex items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto bg-starbucks-white rounded-xl shadow-2xl p-4 md:p-6 space-y-4">
          <header className="text-center">
            <h1 className="text-xl md:text-2xl font-bold text-starbucks-green">Calificar Empaquetado</h1>
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

             <div className="flex items-center space-x-2 bg-blue-100 border border-blue-300 p-3 rounded-lg">
                <Switch id="next-day-delivery" checked={isNextDayDelivery} onCheckedChange={setIsNextDayDelivery} />
                <Label htmlFor="next-day-delivery" className="text-sm font-medium text-blue-800">Marcar como entrega para día siguiente</Label>
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
          
           <div className="p-4 bg-starbucks-cream rounded-lg">
              <label htmlFor="manual-code-input-calificar" className="block text-sm font-bold text-starbucks-dark mb-1">Ingreso Manual:</label>
              <div className="relative mt-1 flex items-center rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                  <Input
                      type="text"
                      id="manual-code-input-calificar"
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
                     <div className="p-4 bg-starbucks-cream rounded-lg">
                        <Label htmlFor="lote-id-entrega" className="block text-sm font-bold text-starbucks-dark mb-1">Cargar Lote:</Label>
                        <div className="relative mt-1 flex items-center rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                            <Input
                                type="text"
                                id="lote-id-load"
                                value={loteToLoad}
                                onChange={(e) => setLoteToLoad(e.target.value)}
                                className="w-full border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                                placeholder="Escriba el ID del lote..."
                                onKeyDown={(e) => e.key === 'Enter' && handleLoadLote()}
                                disabled={loading}
                            />
                            <Button
                                type="button"
                                onClick={handleLoadLote}
                                size="icon"
                                className="h-8 w-8 bg-blue-600 hover:bg-blue-700 text-white rounded-md mr-1"
                                disabled={loading || !loteToLoad}
                            >
                                <Download className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                    <div className="space-y-2">
                         <Label htmlFor="lote-id" className="font-bold text-starbucks-dark">Lote / Tanda:</Label>
                         <Input
                           id="lote-id"
                           type="text"
                           value={loteId}
                           onChange={(e) => setLoteId(e.target.value)}
                           placeholder="Ingresa un identificador de lote"
                           className="bg-transparent"
                           disabled={loading}
                         />
                    </div>
                    <div className="flex flex-col sm:flex-row justify-end items-center gap-2">
                        <Button onClick={triggerMassQualify} disabled={loading || massScannedCodes.length === 0} className="bg-green-600 hover:bg-green-700 w-full sm:w-auto">
                            {loading ? 'Calificando...' : 'Calificar Todos'}
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

       <Dialog open={loteConfirmation.isOpen} onOpenChange={(isOpen) => setLoteConfirmation(prev => ({...prev, isOpen}))}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>Confirmar Anexión a Lote Existente</DialogTitle>
                  <DialogDescription>
                    <div className="pt-4 space-y-4">
                        <Alert variant="destructive" className="mb-4">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>¡Atención!</AlertTitle>
                            <AlertDescription>
                                El lote <span className="font-bold">{loteId}</span> ya existe.
                            </AlertDescription>
                        </Alert>
                        <div>Este lote contiene actualmente <span className="font-bold">{loteConfirmation.existingCount}</span> etiqueta(s).</div>
                        <div>Estás a punto de anexar <span className="font-bold">{loteConfirmation.newCount}</span> nueva(s) etiqueta(s).</div>
                        <div className="mt-4">¿Deseas continuar y anexar estas etiquetas al lote existente?</div>
                    </div>
                  </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                  <Button variant="outline" onClick={() => setLoteConfirmation(prev => ({...prev, isOpen: false}))}>Cancelar</Button>
                  <Button onClick={handleMassQualify} disabled={loading} className="bg-orange-500 hover:bg-orange-600">
                      {loading ? 'Anexando...' : 'Confirmar y Anexar'}
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </>
  );
}
