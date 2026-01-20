
'use client';
import {useEffect, useRef, useState, useCallback, useMemo} from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { supabase } from '@/lib/supabaseClient';
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { XCircle, PackageCheck, AlertTriangle, Trash2, Zap, ZoomIn, PlusCircle, Download, FileUp, Clock } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useIsMobile } from '@/hooks/use-mobile';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import Papa from 'papaparse';
import { Combobox } from '@/components/ui/combobox';


type DeliveryItem = {
  code: string;
  product: string | null;
  name: string | null;
};

type Encargado = {
  name: string;
  organization: string;
};

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const [message, setMessage] = useState({text: 'Esperando para escanear...', type: 'info' as 'info' | 'success' | 'error' | 'warning', show: false});
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [encargado, setEncargado] = useState('');
  const [encargadosList, setEncargadosList] = useState<Encargado[]>([]);
  const [deliveryList, setDeliveryList] = useState<DeliveryItem[]>([]);
  const [selectedScannerMode, setSelectedScannerMode] = useState('camara');
  const [scannerActive, setScannerActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notification, setNotification] = useState({ title: '', message: '', variant: 'default' as 'default' | 'destructive' });
  const [cameraCapabilities, setCameraCapabilities] = useState<any>(null);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const isMobile = useIsMobile();
  const [dbError, setDbError] = useState<string | null>(null);
  const [isValidationOverridden, setIsValidationOverridden] = useState(false);
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [driverPlate, setDriverPlate] = useState('');
  const [loteId, setLoteId] = useState('');
  const [lotesCargadosCount, setLotesCargadosCount] = useState(0);
  const [notFoundCodes, setNotFoundCodes] = useState<string[]>([]);
  const [isNotFoundModalOpen, setIsNotFoundModalOpen] = useState(false);
  const [csvProcessingStats, setCsvProcessingStats] = useState<{ found: number; notFound: number; total: number; elapsedTime?: string; } | null>(null);
  const [cancelCode, setCancelCode] = useState('');


  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Refs
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const lastScanTimeRef = useRef(Date.now());
  const scannedCodesRef = useRef(new Set<string>());
  const physicalScannerInputRef = useRef<HTMLInputElement | null>(null);
  const bufferRef = useRef('');
  
  const MIN_SCAN_INTERVAL = 1500; // 1.5 seconds

   useEffect(() => {
    setIsMounted(true);
    const fetchEncargados = async () => {
        const { data, error } = await supabase
            .from('personal_name')
            .select('name, organization')
            .eq('rol', 'entrega');

        if (error) {
            setDbError('Error al cargar encargados. Revisa los permisos RLS de la tabla `personal_name`.');
        } else if (data && data.length > 0) {
            const uniqueEncargados = Array.from(new Map(data.map(item => [item.name, item])).values());
            setEncargadosList(uniqueEncargados as Encargado[] || []);
        } else {
            setDbError('No se encontraron encargados de entrega. Revisa los datos o los permisos RLS.');
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


  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (deliveryList.length > 0) {
        event.preventDefault();
        event.returnValue = '¿Estás seguro de refrescar la página? Si refrescas se perderá el progreso de etiquetas escaneadas.';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [deliveryList]);

  const showAppMessage = (text: string, type: 'success' | 'error' | 'info' | 'warning') => {
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }
    setMessage({text, type, show: true});
    messageTimeoutRef.current = setTimeout(() => {
      setMessage(prev => ({...prev, show: false}));
    }, 2500);
  };
  
  const showModalNotification = (title: string, message: string, variant: 'default' | 'destructive' = 'default') => {
    setNotification({ title, message, variant });
    setShowNotification(true);
  };

  const playBeep = () => {
    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(880, context.currentTime); // A5 note
    gainNode.gain.setValueAtTime(1, context.currentTime); // Increased Volume
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
  
    const formatElapsedTime = (totalSeconds: number) => {
        if (totalSeconds < 0) return '00:00:00';
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const paddedHours = String(hours).padStart(2, '0');
        const paddedMinutes = String(minutes).padStart(2, '0');
        const paddedSeconds = String(seconds).padStart(2, '0');
        
        return `${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
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
    
    if (scannedCodesRef.current.has(finalCode)) {
        setLoading(false);
        showAppMessage(`Código ya en la lista: ${finalCode}`, 'warning');
        return;
    }

    try {
        const { data, error } = await supabase
            .from('personal')
            .select('name, product, status')
            .eq('code', finalCode)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
            throw error;
        }

        if (!data) {
            playWarningSound();
            showModalNotification('Código No Asignado', 'Esta etiqueta aún no ha sido registrada en el sistema.', 'destructive');
        } else if (data.status === 'REPORTADO') {
            playWarningSound();
            showModalNotification('Paquete Reportado', 'Este paquete no está listo para ser enviado, tiene un reporte activo.', 'destructive');
        } else if (isValidationOverridden || data.status === 'CALIFICADO') {
            playBeep();
            const newItem: DeliveryItem = {
                code: finalCode,
                product: data.product,
                name: data.name,
            };
            setDeliveryList(prev => [newItem, ...prev]);
            scannedCodesRef.current.add(finalCode);
            showAppMessage(`Paquete listo: ${finalCode}`, 'success');
        } else {
             playWarningSound();
             showModalNotification('Paquete no Calificado', `Este paquete aún no ha sido calificado (Estado: ${data.status}).`);
        }

    } catch (e: any) {
        showModalNotification('Error de Base de Datos', `Hubo un problema al consultar el código: ${e.message}`, 'destructive');
    } finally {
        setLoading(false);
    }
  }, [loading, isValidationOverridden]);

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
  }, [scannerActive, selectedScannerMode, isMounted, isMobile]);

  const startScanner = () => {
    if (!encargado.trim()) return showAppMessage('Por favor, selecciona un encargado.', 'error');
    setScannerActive(true);
    if(selectedScannerMode === 'camara') {
      showAppMessage('Cámara activada. Apunta al código.', 'info');
    } else {
      physicalScannerInputRef.current?.focus();
      showAppMessage('Escáner físico activo. Escanea códigos.', 'info');
    }
  };

  const stopScanner = () => {
    window.location.reload();
  };

  const removeFromList = (codeToRemove: string) => {
    setDeliveryList(prev => prev.filter(item => item.code !== codeToRemove));
    scannedCodesRef.current.delete(codeToRemove);
    showAppMessage(`Código ${codeToRemove} eliminado de la lista.`, 'info');
  };

  const handleOpenDeliveryModal = () => {
    if (deliveryList.length === 0) {
      showModalNotification('Lista Vacía', 'No hay paquetes en la lista para marcar como entregados.');
      return;
    }
    setIsDeliveryModalOpen(true);
  };
  
  const saveKpiData = async (name: string, quantity: number, timeInSeconds: number, csvFileName?: string) => {
    if (quantity === 0 || !name) return;

    try {
      const kpiData: { name: string; quantity: number; time: string; csv_file?: string } = {
        name: name,
        quantity: quantity,
        time: formatElapsedTime(timeInSeconds),
      };
      if (csvFileName) {
        kpiData.csv_file = csvFileName;
      }
      const { error } = await supabase.from('kpis').insert([kpiData]);
      if (error) {
        console.error('Error saving KPI data:', error.message);
      }
    } catch (e: any) {
      console.error('Exception while saving KPI data:', e.message);
    }
  };

  const handleUpdateStatusToDelivered = async () => {
    if (!driverName.trim() || !driverPlate.trim()) {
        alert("Por favor, completa el nombre del conductor y las placas.");
        return;
    }

    setLoading(true);
    showAppMessage('Actualizando estados...', 'info');

    const codesToUpdate = deliveryList.map(item => item.code);
    const deliveryTimestamp = new Date().toISOString();

    try {
      const { error } = await supabase
        .from('personal')
        .update({ 
            status: 'ENTREGADO', 
            date_entre: deliveryTimestamp,
            driver_name: driverName,
            driver_plate: driverPlate 
        })
        .in('code', codesToUpdate);
      
      if (error) throw error;
      
      await saveKpiData(encargado, deliveryList.length, 0);

      setIsDeliveryModalOpen(false);
      showModalNotification('Éxito', `Se marcaron ${deliveryList.length} paquetes como "ENTREGADO".`);
      setDeliveryList([]);
      scannedCodesRef.current.clear();
      setDriverName('');
      setDriverPlate('');
      setLotesCargadosCount(0); // Reset lotes count
      showAppMessage('Esperando para escanear...', 'info');

    } catch (e: any) {
      showModalNotification('Error al Actualizar', `No se pudieron actualizar los registros: ${e.message}`, 'destructive');
    } finally {
      setLoading(false);
    }
  };
  
    const handleManualAdd = async () => {
      const manualCodeInput = document.getElementById('manual-code-input-entrega') as HTMLInputElement;
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
    if (!loteId.trim()) {
      showAppMessage('Por favor, ingresa un identificador de lote.', 'warning');
      return;
    }
    setLoading(true);
    showAppMessage(`Buscando paquetes del lote ${loteId}...`, 'info');

    try {
      const { data, error } = await supabase
        .from('personal')
        .select('code, product, name, status')
        .eq('lote', loteId.trim());

      if (error) throw error;

      if (!data || data.length === 0) {
        showAppMessage(`No se encontraron paquetes para el lote ${loteId}.`, 'warning');
        return;
      }

      let addedCount = 0;
      let skippedCount = 0;

      const newItems = data.reduce((acc: DeliveryItem[], item) => {
        if (!scannedCodesRef.current.has(item.code)) {
           // Aquí podrías añadir lógica para filtrar por status si es necesario
          scannedCodesRef.current.add(item.code);
          addedCount++;
          acc.push({
            code: item.code,
            product: item.product,
            name: item.name,
          });
        } else {
          skippedCount++;
        }
        return acc;
      }, []);

      if (newItems.length > 0) {
        setDeliveryList(prev => [...newItems, ...prev]);
        setLotesCargadosCount(prev => prev + 1);
      }
      
      showAppMessage(`Lote cargado: ${addedCount} paquetes añadidos, ${skippedCount} ya estaban en la lista.`, 'success');
      setLoteId('');

    } catch (e: any) {
      showAppMessage(`Error al cargar el lote: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
     if (!encargado) {
        showModalNotification('Falta Encargado', 'Por favor, selecciona un encargado antes de subir un archivo CSV.', 'destructive');
        event.target.value = ''; // Reset file input
        return;
    }

    setLoading(true);
    showAppMessage('Procesando archivo CSV...', 'info');

    Papa.parse(file, {
      skipEmptyLines: true,
      complete: async (results) => {
        const dataRows = results.data.slice(1) as string[][];

        const validEntries = dataRows.map(row => {
            let codeValue = row[4]; // Column E for text/code
            const dateStr = row[7]; // Column H for date_utc
            const timeStr = row[8]; // Column I for time_utc

            if (!codeValue || !dateStr || !timeStr) return null;
            
            const dateObj = new Date(`${dateStr} ${timeStr} UTC`);
            if (isNaN(dateObj.getTime())) return null;

            try {
                const parsed = JSON.parse(codeValue);
                if (parsed && parsed.id) {
                    codeValue = String(parsed.id);
                }
            } catch (e) {
                // Not a JSON string, use as is
            }

            if (!/^\d+$/.test(codeValue)) {
                return null;
            }

            return { code: codeValue, date: dateObj };
        }).filter(Boolean) as { code: string, date: Date }[];


        if (validEntries.length === 0) {
            setCsvProcessingStats({ found: 0, notFound: 0, total: 0, elapsedTime: 'N/A' });
            setIsNotFoundModalOpen(true);
            setLoading(false);
            return;
        }

        // Calculate time
        const firstDate = validEntries[0].date;
        const lastDate = validEntries[validEntries.length - 1].date;
        const diff = lastDate.getTime() - firstDate.getTime();
        const timeInSeconds = Math.round(diff / 1000);
        const elapsedTime = formatElapsedTime(timeInSeconds);

        const codesFromCsv = validEntries.map(entry => entry.code);
        const csvDataMap = new Map(validEntries.map(entry => [entry.code, entry.date.toISOString()]));

        try {
          const { data: existingCodes, error: fetchError } = await supabase
            .from('personal')
            .select('code')
            .in('code', codesFromCsv);
            
          if (fetchError) throw fetchError;

          const existingCodeSet = new Set(existingCodes.map(item => String(item.code)));
          const codesToUpdate = codesFromCsv.filter(code => existingCodeSet.has(code));
          const codesNotFound = codesFromCsv.filter(code => !existingCodeSet.has(code));
          

          setNotFoundCodes(codesNotFound);
          setCsvProcessingStats({
            found: codesToUpdate.length,
            notFound: codesNotFound.length,
            total: codesFromCsv.length,
            elapsedTime: elapsedTime
          });

          if (codesToUpdate.length > 0) {
            await saveKpiData(encargado, codesToUpdate.length, timeInSeconds, file.name);

            const updatePromises = codesToUpdate.map(code => 
                supabase
                    .from('personal')
                    .update({ status: 'ENTREGADO', date_entre: csvDataMap.get(code) })
                    .eq('code', code)
            );

            const results = await Promise.all(updatePromises);
            const updateErrors = results.filter(res => res.error);

            if (updateErrors.length > 0) {
              throw updateErrors[0].error;
            }
          }
          
          setIsNotFoundModalOpen(true);

        } catch (e: any) {
          showModalNotification('Error de Base de Datos', `Ocurrió un error: ${e.message}`, 'destructive');
        } finally {
          setLoading(false);
        }
      },
      error: (error: any) => {
        showModalNotification('Error al Leer CSV', `No se pudo procesar el archivo: ${error.message}`, 'destructive');
        setLoading(false);
      },
    });
    event.target.value = '';
  };
  
  const downloadNotFoundCsv = () => {
    if (notFoundCodes.length === 0) return;
    const csvContent = "data:text/csv;charset=utf-8," 
      + "CodigosNoEncontrados\n"
      + notFoundCodes.join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "codigos_no_encontrados.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCancelPackage = async () => {
    if (!cancelCode.trim()) {
      showModalNotification('Código Vacío', 'Por favor, ingresa un código para cancelar.', 'destructive');
      return;
    }
    setLoading(true);
    showAppMessage(`Cancelando el paquete ${cancelCode}...`, 'info');

    try {
      const { data, error } = await supabase
        .from('personal')
        .update({ status: 'CANCELADO' })
        .eq('code', cancelCode.trim())
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        showModalNotification('Éxito', `El paquete con código ${cancelCode} ha sido marcado como "CANCELADO".`);
        setCancelCode('');
      } else {
        showModalNotification('No Encontrado', `No se encontró ningún paquete con el código ${cancelCode}.`, 'destructive');
      }

    } catch (e: any) {
      showModalNotification('Error', `Ocurrió un error al cancelar el paquete: ${e.message}`, 'destructive');
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
            <title>Entrega de Paquetes</title>
        </Head>

        <main className="text-starbucks-dark flex items-center justify-center p-4">
            <div className="w-full max-w-md mx-auto bg-starbucks-white rounded-xl shadow-2xl p-4 md:p-6 space-y-4">
                <header className="text-center">
                    <h1 className="text-xl md:text-2xl font-bold text-starbucks-green">Módulo de Entrega</h1>
                    <p className="text-gray-600 text-sm mt-1">Escanea los paquetes para confirmar su entrega.</p>
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
                    
                    <div className="flex items-center space-x-2 bg-yellow-100 border border-yellow-300 p-3 rounded-lg">
                        <Switch id="validation-override" checked={isValidationOverridden} onCheckedChange={setIsValidationOverridden} />
                        <Label htmlFor="validation-override" className="text-sm font-medium text-yellow-800">Omitir validación de 'Calificado'</Label>
                    </div>
                </div>
                
                <h2 className="text-lg font-bold text-starbucks-dark">Para Entrega ({deliveryList.length})</h2>

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

                    <div id="scanner-controls" className="mt-4 flex flex-wrap gap-2 justify-center">
                        <Button onClick={startScanner} disabled={scannerActive || loading || !encargado} className="bg-blue-600 hover:bg-blue-700 text-sm disabled:bg-gray-400">Iniciar</Button>
                        <Button onClick={stopScanner} variant="destructive" className="text-sm" disabled={!scannerActive}>Detener</Button>
                    </div>

                    <div id="physical-scanner-status" className="mt-4 text-center p-2 rounded-md bg-starbucks-accent text-white text-sm" style={{ display: scannerActive && selectedScannerMode === 'fisico' ? 'block' : 'none' }}>
                        Escáner físico listo.
                    </div>
                </div>
                
                <div className="p-4 bg-starbucks-cream rounded-lg">
                    <Label htmlFor="lote-id-entrega" className="block text-sm font-bold text-starbucks-dark mb-1">Cargar Lote:</Label>
                    <span className="text-xs text-gray-500">Lotes cargados: {lotesCargadosCount}</span>
                    <div className="relative mt-1 flex items-center rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                        <Input
                            type="text"
                            id="lote-id-entrega"
                            value={loteId}
                            onChange={(e) => setLoteId(e.target.value)}
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
                            disabled={loading || !loteId}
                        >
                            <Download className="h-5 w-5" />
                        </Button>
                    </div>
                </div>

                 <div className="p-4 bg-starbucks-cream rounded-lg">
                    <label htmlFor="manual-code-input-entrega" className="block text-sm font-bold text-starbucks-dark mb-1">Ingreso Manual:</label>
                    <div className="relative mt-1 flex items-center rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                        <Input
                            type="text"
                            id="manual-code-input-entrega"
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
                
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <Label htmlFor="cancel-code-input" className="block text-sm font-bold text-red-700 mb-1">Cancelar Paquete:</Label>
                    <div className="relative mt-1 flex items-center rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-destructive">
                        <Input
                            type="text"
                            id="cancel-code-input"
                            value={cancelCode}
                            onChange={(e) => setCancelCode(e.target.value)}
                            className="w-full border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                            placeholder="Escriba el código a cancelar..."
                            onKeyDown={(e) => e.key === 'Enter' && handleCancelPackage()}
                            disabled={loading}
                        />
                        <Button
                            type="button"
                            onClick={handleCancelPackage}
                            size="icon"
                            variant="destructive"
                            className="h-8 w-8 rounded-md mr-1"
                            disabled={loading || !cancelCode}
                        >
                            <XCircle className="h-5 w-5" />
                        </Button>
                    </div>
                </div>


                 <div>
                     <div className="flex flex-col sm:flex-row justify-end items-center mb-2 gap-2">
                        <Button onClick={handleOpenDeliveryModal} disabled={loading || deliveryList.length === 0} className="bg-green-600 hover:bg-green-700 w-full sm:w-auto">
                           <PackageCheck className="mr-2 h-4 w-4" /> Entregar
                        </Button>
                    </div>

                    <div className="table-container border border-gray-200 rounded-lg max-h-60 overflow-auto">
                        <Table>
                            <TableHeader className="sticky top-0 bg-starbucks-cream">
                                <TableRow>
                                    <TableHead>Código</TableHead>
                                    <TableHead>Producto</TableHead>
                                    <TableHead className="text-right">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {deliveryList.length > 0 ? deliveryList.map((item) => (
                                    <TableRow key={item.code}>
                                        <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                        <TableCell className="text-xs">{item.product || 'N/A'}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => removeFromList(item.code)} className="text-red-500 hover:text-red-700 h-8 w-8">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center text-gray-500 py-8">
                                            No hay paquetes en la lista.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <div id="result-container" className="space-y-4">
                     {/* Fallback message display for when scanner is off */}
                    {!message.show && (
                        <div className="p-3 rounded-lg text-center font-semibold text-base bg-gray-100 text-gray-800">
                           {lastScanned ? `Último escaneo: ${lastScanned}` : 'Esperando para escanear...'}
                        </div>
                    )}
                     <div className="mt-4 flex justify-center">
                          <Label htmlFor="csv-upload" className="cursor-pointer">
                              <Button asChild variant="outline">
                                  <div>
                                      <FileUp className="mr-2 h-4 w-4" />
                                      Cargar Excel de entrega
                                  </div>
                              </Button>
                          </Label>
                          <Input id="csv-upload" type="file" accept=".csv,text/csv,application/vnd.ms-excel" className="hidden" onChange={handleCsvUpload} />
                      </div>
                </div>
            </div>

            {loading && <div id="loading-overlay" style={{display: 'flex'}}>
                <div className="overlay-spinner"></div>
                <p className="text-lg font-semibold">Procesando...</p>
            </div>}
            
            {showNotification && (
                <div id="qr-confirmation-overlay" className="p-4" style={{display: 'flex'}}>
                     <div className="bg-starbucks-white rounded-lg shadow-xl p-6 w-full max-w-sm text-center space-y-4">
                        <Alert variant={notification.variant as any}>
                            {notification.variant === 'destructive' ? <XCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                            <AlertTitle>{notification.title}</AlertTitle>
                            <AlertDescription>{notification.message}</AlertDescription>
                        </Alert>
                        <div className="flex justify-center gap-4 mt-4">
                           <Button onClick={() => setShowNotification(false)}>Cerrar</Button>
                        </div>
                    </div>
                </div>
            )}

            <Dialog open={isDeliveryModalOpen} onOpenChange={setIsDeliveryModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirmar Entrega</DialogTitle>
                        <DialogDescription>
                            Ingresa los datos del conductor para registrar la entrega.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="driver-name" className="text-right">
                                Conductor
                            </Label>
                            <Input
                                id="driver-name"
                                value={driverName}
                                onChange={(e) => setDriverName(e.target.value)}
                                className="col-span-3"
                                placeholder="Nombre del conductor"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="driver-plate" className="text-right">
                                Placas
                            </Label>
                            <Input
                                id="driver-plate"
                                value={driverPlate}
                                onChange={(e) => setDriverPlate(e.target.value)}
                                className="col-span-3"
                                placeholder="Placas del vehículo"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeliveryModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleUpdateStatusToDelivered} disabled={loading}>
                            {loading ? 'Confirmando...' : 'Confirmar Entrega'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

             <Dialog open={isNotFoundModalOpen} onOpenChange={setIsNotFoundModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Resultados del Procesamiento CSV</DialogTitle>
                         {csvProcessingStats && (
                             <DialogDescription asChild>
                                <div className="space-y-1 pt-2 text-sm text-muted-foreground">
                                  <div>Total de registros en CSV: {csvProcessingStats.total}</div>
                                  <div>Registros actualizados en BD: {csvProcessingStats.found}</div>
                                  <div>Códigos no encontrados en BD: {csvProcessingStats.notFound}</div>
                                  {csvProcessingStats.elapsedTime && (
                                    <div className="font-semibold pt-2">Tiempo de escaneo: {csvProcessingStats.elapsedTime}</div>
                                  )}
                                </div>
                            </DialogDescription>
                         )}
                    </DialogHeader>
                    {notFoundCodes.length > 0 && (
                        <div className="max-h-60 overflow-auto border rounded-md p-2">
                             <h4 className="font-semibold mb-2">Códigos no encontrados:</h4>
                             <ul className="list-disc pl-5 text-sm">
                                {notFoundCodes.map(code => <li key={code} className="font-mono">{code}</li>)}
                            </ul>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsNotFoundModalOpen(false)}>Cerrar</Button>
                        {notFoundCodes.length > 0 && (
                            <Button onClick={downloadNotFoundCsv}>
                                <Download className="mr-2 h-4 w-4" />
                                Descargar no encontrados
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </main>
    </>
  );
}

    

    

    
