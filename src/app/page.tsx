
'use client';
import React, {useEffect, useRef, useState, useCallback, useMemo} from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { supabase, supabaseEtiquetas } from '@/lib/supabaseClient';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from '@/components/ui/button';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Zap, ZoomIn, UserPlus, PlusCircle, Clock, AlertTriangle, Wifi, WifiOff, Search, XCircle, CheckCircle, Trash2, Lock, Unlock } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Combobox, ComboboxGroup } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";


type ScannedItem = {
  code: string;
  fecha: string;
  hora: string;
  encargado: string;
  area: string;
  sku: string | null;
  cantidad: number | null;
  producto: string | null;
  empresa: string | null;
  venta: string | null;
  esti_time?: number | null;
  deli_date?: string | null;
};

type PersonalScanItem = {
  code: string | number;
  sku: string | null;
  personal: string;
  encargado: string;
  product: string | null;
  quantity: number | null;
  organization: string | null;
  venta: string | number | null;
  date: string;
  status: string;
  esti_time?: number | null;
  date_esti?: string | null;
  date_ini?: string | null;
};

type CreatedLote = {
  lote_p: string;
  name_inc: string;
  date: string;
  count: number;
  total_esti_time: number;
};

type Encargado = {
  name: string;
  organization: string;
};

type PersonalOperativo = {
  name: string;
  organization: string;
};

type DbStatus = {
    personalDb: 'connecting' | 'success' | 'error';
    etiquetasDb: 'connecting' | 'success' | 'error';
};

type VerificationResult = {
    status: 'verified' | 'not-found' | 'error' | 'pending';
    message: string;
};


// Helper function to check if a string is likely a name
const isLikelyName = (text: string): boolean => {
  const trimmed = text.trim();
  // Not a number, has spaces, and more than 5 chars.
  return isNaN(Number(trimmed)) && trimmed.includes(' ') && trimmed.length > 5;
};


export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const [message, setMessage] = useState<{text: React.ReactNode, type: 'info' | 'success' | 'duplicate', show: boolean}>({text: 'Esperando para escanear...', type: 'info', show: false});
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [encargado, setEncargado] = useState('');
  const [encargadosList, setEncargadosList] = useState<Encargado[]>([]);
  const [personalList, setPersonalList] = useState<PersonalOperativo[]>([]);
  const [selectedPersonal, setSelectedPersonal] = useState('');
  const [scannedData, setScannedData] = useState<ScannedItem[]>([]);
  const [melCodesCount, setMelCodesCount] = useState(0);
  const [otherCodesCount, setOtherCodesCount] = useState(0);
  const [selectedScannerMode, setSelectedScannerMode] = useState('camara');
  const [scannerActive, setScannerActive] = useState(false);
  const [ingresarDatosEnabled, setIngresarDatosEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState({
    isOpen: false,
    title: '',
    message: '',
    code: '',
    resolve: (value: boolean) => {},
  });
  const [cameraCapabilities, setCameraCapabilities] = useState<any>(null);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const isMobile = useIsMobile();
  const [programadosPersonalList, setProgramadosPersonalList] = useState<{ name: string }[]>([]);
  const [programadosLotesList, setProgramadosLotesList] = useState<{ lote_p: string }[]>([]);
  const [createdLotesList, setCreatedLotesList] = useState<CreatedLote[]>([]);
  const [loadingProgramados, setLoadingProgramados] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedBulkPersonal, setSelectedBulkPersonal] = useState('');
  const [dbError, setDbError] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<DbStatus>({ personalDb: 'connecting', etiquetasDb: 'connecting' });
  const [selectedPersonalParaCargar, setSelectedPersonalParaCargar] = useState('');
  const [selectedLoteParaCargar, setSelectedLoteParaCargar] = useState('');
  const [showNotification, setShowNotification] = useState(false);
  const [notification, setNotification] = useState({ title: '', message: '', variant: 'default' as 'default' | 'destructive' | 'success' });
  const [scanMode, setScanMode] = useState<'assign' | 'unassign' | 'update_date'>('assign');
  const [loadedProgData, setLoadedProgData] = useState<any[]>([]);
  const [personToAssign, setPersonToAssign] = useState('');
  const [showCargarProduccion, setShowCargarProduccion] = useState(false);
  const [loteProgramado, setLoteProgramado] = useState('');
  const [cargaFilterType, setCargaFilterType] = useState<'persona' | 'lote'>('persona');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult>({ status: 'pending', message: 'Ingrese un código de corte para registrar la fecha.' });
  const [selectedArea, setSelectedArea] = useState('');
  const [skipAreaSelection, setSkipAreaSelection] = useState(false);
  const [timerStartTime, setTimerStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);


  // Refs para elementos del DOM y la instancia del escáner
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const physicalScannerInputRef = useRef<HTMLInputElement | null>(null);
  const readerRef = useRef<HTMLDivElement | null>(null);
  const scannerSectionRef = useRef<HTMLDivElement | null>(null);


  // Refs para valores que no necesitan re-renderizar el componente
  const lastScanTimeRef = useRef(Date.now());
  const lastSuccessfullyScannedCodeRef = useRef<string | null>(null);
  const scannedCodesRef = useRef(new Set<string>());
  const bufferRef = useRef('');
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const timerStartedRef = useRef(false);


  const APPS_SCRIPT_URL =
    'https://script.google.com/macros/s/AKfycbwxN5n-iE00pi3JlOkImBgWD3-qptWsJxdyMJjXbRySgGvi7jqIsU9Puo7p2uvu5BioIbQ/exec';
  const MIN_SCAN_INTERVAL = 500;

  const fetchCreatedLotes = useCallback(async () => {
    const { data, error } = await supabase
      .from('personal_prog')
      .select('lote_p, name_inc, date, esti_time')
      .not('lote_p', 'is', null);
  
    if (error) {
      console.error('Error fetching created lotes:', error);
    } else if (data) {
      const lotesAggr: { [key: string]: { name_inc: string; date: string; count: number; total_esti_time: number; } } = {};
  
      for (const item of data) {
        if (item.lote_p) {
          if (lotesAggr[item.lote_p]) {
            lotesAggr[item.lote_p].count++;
            lotesAggr[item.lote_p].total_esti_time += item.esti_time || 0;
          } else {
            lotesAggr[item.lote_p] = {
              name_inc: item.name_inc,
              date: item.date,
              count: 1,
              total_esti_time: item.esti_time || 0,
            };
          }
        }
      }
  
      const lotesList: CreatedLote[] = Object.entries(lotesAggr)
        .map(([lote_p, details]) => ({
          lote_p,
          ...details,
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
      setCreatedLotesList(lotesList);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (timerStartTime) {
      interval = setInterval(() => {
        const now = new Date();
        const seconds = Math.floor((now.getTime() - timerStartTime.getTime()) / 1000);
        setElapsedTime(seconds);
      }, 1000);
    } else {
        setElapsedTime(0);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [timerStartTime]);

  useEffect(() => {
    setIsMounted(true);
    const checkDbConnections = async () => {
      // Check personal DB
      const { error: personalError } = await supabase.from('personal_name').select('name').limit(1);
      setDbStatus(prev => ({ ...prev, personalDb: personalError ? 'error' : 'success' }));

      // Check etiquetas DB
      const { error: etiquetasError } = await supabaseEtiquetas.from('etiquetas_i').select('code').limit(1);
      setDbStatus(prev => ({ ...prev, etiquetasDb: etiquetasError ? 'error' : 'success' }));
    };
    checkDbConnections();
    fetchCreatedLotes();

    const channel = supabase
      .channel('personal_prog_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'personal_prog' },
        (payload) => {
          fetchCreatedLotes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCreatedLotes]);
  
  useEffect(() => {
    if (isMobile && encargado && scannerSectionRef.current) {
      scannerSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [encargado, isMobile]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (scannedData.length > 0) {
        event.preventDefault();
        event.returnValue = '¿Estás seguro de refrescar la página? Si refrescas se perderá el progreso de etiquetas escaneadas.';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [scannedData]);

  useEffect(() => {
    const fetchPersonal = async () => {
        const { data, error } = await supabase
            .from('personal_name')
            .select('name, organization')
            .eq('rol', 'operativo');

        if (error) {
            setDbError('Error al cargar personal. Revisa los permisos RLS de la tabla `personal_name`.');
        } else if (data) {
             const uniquePersonal = Array.from(new Map(data.map(item => [item.name, item])).values());
             setPersonalList((uniquePersonal as PersonalOperativo[]) || []);
        } else {
            setDbError('No se encontró personal con el rol "operativo". Revisa los permisos RLS.');
        }
    };
    const fetchEncargados = async () => {
        const { data, error } = await supabase
            .from('personal_name')
            .select('name, organization')
            .eq('rol', 'barra');

        if (error) {
            setDbError('Error al cargar encargados. Revisa los permisos RLS de la tabla `personal_name`.');
        } else if (data) {
            const uniqueEncargados = Array.from(new Map(data.map(item => [item.name, item])).values());
            setEncargadosList((uniqueEncargados as Encargado[]) || []);
        } else {
             setDbError('No se encontraron encargados con el rol "barra". Revisa los datos o los permisos RLS.');
        }
    };
    fetchEncargados();
    fetchPersonal();
  }, []);

  const showAppMessage = (text: React.ReactNode, type: 'success' | 'duplicate' | 'info') => {
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

  const invalidateCSV = () => {
    setIngresarDatosEnabled(false);
  };
  
  const clearSessionData = () => {
    scannedCodesRef.current.clear();
    setScannedData([]);
    setMelCodesCount(0);
    setOtherCodesCount(0);
    lastSuccessfullyScannedCodeRef.current = null;
    setIngresarDatosEnabled(false);
    setTimerStartTime(null);
    timerStartedRef.current = false;
  };

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

  const playErrorSound = () => {
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

 const addCodeAndUpdateCounters = useCallback(async (codeToAdd: string, details: { sku: string | null; cantidad: number | null; producto: string | null; empresa: string | null; venta: string | null; deli_date: string | null; }) => {
    const finalCode = String(codeToAdd).trim();

    if (scannedCodesRef.current.has(finalCode)) {
      showAppMessage(<>DUPLICADO: {finalCode}</>, 'duplicate');
      playErrorSound();
      return false;
    }
    
    if (!timerStartedRef.current) {
        setTimerStartTime(new Date());
        timerStartedRef.current = true;
    }

    let estimatedTime: number | null = null;
    if (details.sku) {
        try {
            const { data: personalData, error: personalError } = await supabase
                .from('personal')
                .select('esti_time')
                .eq('sku', details.sku)
                .not('esti_time', 'is', null)
                .limit(1)
                .single();

            if (personalError && personalError.code !== 'PGRST116') {
                console.error("Error fetching estimated time:", personalError);
            }
            if (personalData) {
                estimatedTime = personalData.esti_time;
            }
        } catch (e: any) {
             console.error("Exception fetching estimated time:", e.message);
        }
    }


    scannedCodesRef.current.add(finalCode);
    lastSuccessfullyScannedCodeRef.current = finalCode;

    if (finalCode.startsWith('4')) {
        setMelCodesCount(prev => prev + 1);
    } else {
        setOtherCodesCount(prev => prev + 1);
    }
    
    showAppMessage(`Éxito: ${finalCode}`, 'success');

    if ('vibrate' in navigator) navigator.vibrate(200);
    playBeep();

    const laserLine = document.getElementById('laser-line');
    if (laserLine) {
        laserLine.classList.add('laser-flash');
        laserLine.addEventListener('animationend', () => laserLine.classList.remove('laser-flash'), { once: true });
    }

    const now = new Date();
    const fechaEscaneo = now.toLocaleDateString('es-MX', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const horaEscaneo = now.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const newItem: ScannedItem = {
      code: finalCode,
      fecha: fechaEscaneo,
      hora: horaEscaneo,
      encargado: encargado.trim(),
      area: selectedArea,
      sku: details.sku,
      cantidad: details.cantidad,
      producto: details.producto,
      empresa: details.empresa,
      venta: details.venta,
      esti_time: estimatedTime,
      deli_date: details.deli_date,
    };

    setScannedData(prevData => [...prevData, newItem]);

    invalidateCSV();
    return true;
  }, [encargado, selectedArea, skipAreaSelection]);

  const saveToPersonal = async (personName: string) => {
      setLoading(true);
      showAppMessage('Guardando asignación...', 'info');

      try {
          const { data: lastRecord, error: lastRecordError } = await supabase
              .from('personal')
              .select('date_esti')
              .eq('name', personName)
              .not('date_esti', 'is', null)
              .order('date_esti', { ascending: false })
              .limit(1)
              .single();

          if (lastRecordError && lastRecordError.code !== 'PGRST116') {
              throw new Error(`Error al buscar último registro: ${lastRecordError.message}`);
          }
          
          const associationTimestamp = new Date();
          let lastFinishTime = lastRecord?.date_esti ? new Date(lastRecord.date_esti) : associationTimestamp;
          
          if (lastFinishTime < associationTimestamp) {
              lastFinishTime = associationTimestamp;
          }

          const dataToInsert = scannedData.map(item => {
            const startTime = new Date(lastFinishTime.getTime());
            let finishTime = new Date(startTime.getTime());
            if (item.esti_time) {
                finishTime.setMinutes(finishTime.getMinutes() + item.esti_time);
            }
            lastFinishTime = finishTime;

            return {
                code: String(item.code),
                sku: item.sku,
                name: personName,
                name_inc: item.encargado,
                place: skipAreaSelection ? null : selectedArea,
                product: item.producto,
                quantity: item.cantidad,
                organization: item.empresa,
                sales_num: item.venta ? Number(item.venta) : null,
                date: associationTimestamp.toISOString(),
                status: 'ASIGNADO',
                esti_time: item.esti_time,
                deli_date: item.deli_date,
                date_ini: startTime.toISOString(),
                date_esti: finishTime.toISOString(),
            };
          });

          const { error } = await supabase.from('personal').insert(dataToInsert);
          if (error) {
              if (error.message.includes("could not find the 'user_id' column")) {
                 showModalNotification('Error de Permisos', 'No tienes permiso para asignar. Contacta a un administrador.', 'destructive');
                 setLoading(false);
                 return;
              }
              throw error;
          };

          await saveKpiData(encargado, dataToInsert.length, elapsedTime);

          showModalNotification('¡Éxito!', `Se asignaron ${scannedData.length} etiquetas a ${personName}.`, 'success');
          
          clearSessionData();
          setSelectedPersonal('');
          setSelectedArea('');
          setSkipAreaSelection(false);

      } catch (error: any) {
          console.error("Error al guardar en personal:", error);
          showModalNotification('Error', `Error al guardar la asignación: ${error.message}`, 'destructive');
      } finally {
          setLoading(false);
      }
  };

  const handleManualAssociate = () => {
    if (!selectedPersonal) {
        showModalNotification('Falta Selección', 'Por favor, selecciona un miembro del personal.', 'destructive');
        return;
    }
    if (scannedData.length === 0) {
        showModalNotification('Lista Vacía', 'No hay etiquetas pendientes para asociar.', 'info');
        return;
    }
    const missingTimeRows = scannedData
      .map((item, index) => (item.esti_time === null || item.esti_time === undefined ? index + 1 : null))
      .filter((rowNum): rowNum is number => rowNum !== null);

    if (missingTimeRows.length > 0) {
      const message = `Por favor, completa el campo "Tiempo Estimado" en las siguientes filas: ${missingTimeRows.join(', ')}.`;
      showModalNotification('Faltan Datos', message, 'destructive');
      return;
    }
    if (!selectedArea && !skipAreaSelection) {
      showModalNotification('Falta Área', 'Por favor, selecciona un área de trabajo o marca la opción para continuar sin una.', 'destructive');
      return;
    }

    saveToPersonal(selectedPersonal);
  };
  
  const showConfirmationDialog = (title: string, message: string, code: string): Promise<boolean> => {
      return new Promise((resolve) => {
          setConfirmation({ isOpen: true, title, message, code, resolve });
      });
  };

  const onScanSuccess = useCallback((decodedText: string, decodedResult: any) => {
    if (!scannerActive || Date.now() - lastScanTimeRef.current < MIN_SCAN_INTERVAL) return;
    lastScanTimeRef.current = Date.now();
    
    let finalCode = decodedText;
    try {
        const parsed = JSON.parse(decodedText);
        if (parsed && parsed.id) {
            finalCode = String(parsed.id);
        }
    } catch (e) {
        // Not a JSON, proceed with the original decodedText
    }
    
    setLastScannedCode(finalCode);
  }, [scannerActive]);

 const processScan = useCallback(async (decodedText: string) => {
    setLoading(true);
    const finalCode = String(decodedText).trim();

    if (scanMode === 'unassign') {
        try {
            const { data: existing, error: findError } = await supabase
                .from('personal')
                .select('code')
                .eq('code', finalCode)
                .single();

            if (findError && findError.code !== 'PGRST116') throw findError;

            if (!existing) {
                showModalNotification('No Encontrado', `El código ${finalCode} no está asignado a nadie.`, 'destructive');
                playErrorSound();
                return;
            }

            const { error: deleteError } = await supabase
                .from('personal')
                .delete()
                .eq('code', finalCode);

            if (deleteError) throw deleteError;

            showModalNotification('¡Éxito!', `El código ${finalCode} ha sido desasignado.`, 'success');
            playBeep();

        } catch (error: any) {
            showModalNotification('Error', `No se pudo desasignar el código: ${error.message}`, 'destructive');
            playErrorSound();
        } finally {
            setLoading(false);
        }
        return;
    }

    if (scanMode === 'update_date') {
        try {
            const { data, error } = await supabaseEtiquetas
                .from('etiquetas_i')
                .select('code')
                .eq('code', finalCode)
                .single();

            if (error && error.code !== 'PGRST116') throw error;

            if (!data) {
                showModalNotification('No Encontrado', `El código ${finalCode} no existe en la base de datos de etiquetas.`, 'destructive');
                playErrorSound();
                return;
            }

            const { error: updateError } = await supabaseEtiquetas
                .from('etiquetas_i')
                .update({ imp_date: new Date().toISOString() })
                .eq('code', finalCode);

            if (updateError) throw updateError;
            
            showModalNotification('¡Éxito!', `Se actualizó la fecha de impresión para el código ${finalCode}.`, 'success');
            playBeep();

        } catch (error: any) {
            showModalNotification('Error', `No se pudo actualizar la fecha: ${error.message}`, 'destructive');
            playErrorSound();
        } finally {
            setLoading(false);
        }
        return;
    }
    
    // Logic for 'assign' mode
    try {
        if (scannedCodesRef.current.has(finalCode) || finalCode === lastSuccessfullyScannedCodeRef.current) {
            if (scannedCodesRef.current.has(finalCode)) {
                showAppMessage(<>DUPLICADO: {finalCode}</>, 'duplicate');
            }
            setLoading(false);
            return;
        }

        const isKnownPersonal = personalList.some(p => p.name === finalCode);
        if (isKnownPersonal) {
            if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);

            if (scannedData.length === 0) {
                showModalNotification('Lista Vacía', 'No hay etiquetas pendientes para asociar.', 'info');
                setLoading(false); 
                return;
            }
            const missingTimeRows = scannedData.map((item, index) => (item.esti_time === null || item.esti_time === undefined ? index + 1 : null)).filter(Boolean) as number[];
            if (missingTimeRows.length > 0) {
                showModalNotification('Faltan Datos', `Falta el tiempo estimado en las filas: ${missingTimeRows.join(', ')}`, 'destructive');
                setLoading(false); 
                return;
            }
             if (!selectedArea && !skipAreaSelection) {
                showModalNotification('Falta Área', 'Por favor, selecciona un área de trabajo o marca la opción para continuar sin una.', 'destructive');
                setLoading(false);
                return;
            }

            await saveToPersonal(finalCode);

            lastSuccessfullyScannedCodeRef.current = finalCode;
            setLoading(false);
            return;
        }


        // Strict validation flow
        // 1. Find code_i from etiquetas_i
        const { data: etiquetaInfo, error: etiquetaInfoError } = await supabaseEtiquetas
            .from('etiquetas_i')
            .select('code_i')
            .eq('code', finalCode)
            .single();
        
        if (etiquetaInfoError && etiquetaInfoError.code !== 'PGRST116') {
            throw new Error(`Error al buscar en 'etiquetas_i': ${etiquetaInfoError.message}`);
        }

        if (!etiquetaInfo || !etiquetaInfo.code_i) {
            showModalNotification('Error de Etiqueta', `La etiqueta ${finalCode} no tiene un código de corte (code_i) asociado.`, 'destructive');
            playErrorSound();
            setLoading(false);
            return;
        }

        // 2. Find corte_etiquetas from v_code using code_i
        const { data: vCodeInfo, error: vCodeInfoError } = await supabaseEtiquetas
            .from('v_code')
            .select('corte_etiquetas')
            .eq('code_i', etiquetaInfo.code_i)
            .single();

        if (vCodeInfoError && vCodeInfoError.code !== 'PGRST116') {
             throw new Error(`Error al verificar el corte en 'v_code': ${vCodeInfoError.message}`);
        }
        
        // 3. Check if corte_etiquetas is null
        if (!vCodeInfo || vCodeInfo.corte_etiquetas === null) {
            showModalNotification('Corte no Realizado', `La etiqueta ${finalCode} no puede ser asignada porque el corte aún no ha sido realizado.`, 'destructive');
            playErrorSound();
            setLoading(false);
            return;
        }


        // Continue with existing assignment checks if validation passes
        const { data: personalData, error: personalError } = await supabase
            .from('personal')
            .select('code, name, name_inc')
            .eq('code', finalCode)
            .single();

        if (personalError && personalError.code !== 'PGRST116') {
            throw new Error(`Error al verificar en 'personal': ${personalError.message}`);
        }

        if (personalData) {
            playErrorSound();
            showAppMessage(
                <>El código {finalCode} ya fue asignado a <strong className="font-bold">{personalData.name}</strong> por <strong className="font-bold">{personalData.name_inc}</strong>.</>,
                'duplicate'
            );
            setLoading(false);
            return;
        }

        const { data: fullEtiquetaData, error: fullEtiquetaError } = await supabaseEtiquetas
            .from('etiquetas_i')
            .select('code, sku, quantity, product, organization, sales_num, deli_date')
            .eq('code', finalCode)
            .single();
        
        if (fullEtiquetaError && fullEtiquetaError.code !== 'PGRST116') {
            throw new Error(`Error al buscar detalles en 'etiquetas_i': ${fullEtiquetaError.message}`);
        }

        if (fullEtiquetaData) {
            const { sku, quantity, product, organization, sales_num, deli_date } = fullEtiquetaData;
            await addCodeAndUpdateCounters(finalCode, { sku, cantidad: quantity, producto: product, empresa: organization, venta: sales_num ? String(sales_num) : null, deli_date });
        } else {
            playErrorSound();
            showAppMessage(`Código ${finalCode} no encontrado en la base de datos de etiquetas.`, 'duplicate');
        }

    } catch (error: any) {
        playErrorSound();
        showAppMessage(error.message, 'duplicate');
    } finally {
        setLoading(false);
    }
}, [addCodeAndUpdateCounters, scannedData, personalList, scanMode, selectedArea, skipAreaSelection, fetchCreatedLotes]);


  useEffect(() => {
    if(lastScannedCode) {
      processScan(lastScannedCode);
      setLastScannedCode(null); // Reset after processing
    }
  }, [lastScannedCode, processScan]);


  const applyCameraConstraints = useCallback((track: MediaStreamTrack) => {
    if (!isMobile) return;
    track.applyConstraints({
      advanced: [{
        zoom: zoom,
        torch: isFlashOn
      }]
    }).catch(e => console.error("Failed to apply constraints", e));
  }, [zoom, isFlashOn, isMobile]);
  
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
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        };
        qrCode.start({ facingMode: "environment" }, config, onScanSuccess, (errorMessage) => {}).then(() => {
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
            console.error("Error al iniciar la cámara:", err);
            if (String(err).includes('Cannot transition to a new state')) {
                showAppMessage('Error al iniciar la cámara. Por favor, intenta de nuevo.', 'duplicate');
                 setScannerActive(false);
            } else {
                showAppMessage('Error al iniciar la cámara. Revisa los permisos.', 'duplicate');
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
  }, [scannerActive, selectedScannerMode, isMounted, isMobile, onScanSuccess]);

  const handlePhysicalScannerInput = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (bufferRef.current) {
          onScanSuccess(bufferRef.current, null);
          bufferRef.current = '';
        }
      } else if (event.key.length === 1) {
        bufferRef.current += event.key;
      }
    };
  
    useEffect(() => {
      const input = physicalScannerInputRef.current;
      if (selectedScannerMode === 'fisico' && scannerActive && input) {
        const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (bufferRef.current) {
              onScanSuccess(bufferRef.current, null);
              bufferRef.current = '';
            }
          } else if (e.key.length === 1) {
            bufferRef.current += e.key;
          }
        };
        input.addEventListener('keydown', handleKeyDown);
        input.focus();
        
        return () => {
          input.removeEventListener('keydown', handleKeyDown);
        };
      }
    }, [scannerActive, selectedScannerMode, onScanSuccess]);
  
  const startScanner = () => {
    if (!encargado.trim()) {
      showModalNotification('Falta Encargado', 'Por favor, ingresa el nombre del encargado.', 'destructive');
      return;
    }
    setScannerActive(true);
    if(selectedScannerMode === 'camara') {
      showAppMessage('Cámara activada. Apunta al código.', 'info');
      if (isMobile && scannerSectionRef.current) {
        scannerSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      physicalScannerInputRef.current?.focus();
      showAppMessage('Escáner físico activo. Escanea códigos.', 'info');
    }
  };

  const stopScanner = () => {
    window.location.reload();
  };

  const handleConfirmation = (decision: boolean) => {
      confirmation.resolve(decision);
      setConfirmation({ isOpen: false, title: '', message: '', code: '', resolve: () => {} });
      if (selectedScannerMode === 'fisico' && scannerActive) {
          setTimeout(() => physicalScannerInputRef.current?.focus(), 100);
      }
  };

  const handleManualAdd = async () => {
      const manualCodeInput = document.getElementById('manual-code-input') as HTMLInputElement;
      if (!encargado.trim()) {
        showModalNotification('Falta Encargado', 'Por favor, ingresa el nombre del encargado.', 'destructive');
        return;
      }
      
      const manualCode = manualCodeInput.value.trim();
      if (!manualCode) {
        showModalNotification('Sin Código', 'Por favor, ingresa un código para agregar.', 'info');
        return;
      }
      
      await processScan(manualCode);
      manualCodeInput.value = '';
      manualCodeInput.focus();
  };
  
const deleteRow = (codeToDelete: string) => {
    setScannedData(prevData => {
        const newData = prevData.filter(item => item.code !== codeToDelete);
        
        const newMelCount = newData.filter(item => item.code.startsWith('4')).length;
        const newOtherCount = newData.length - newMelCount;

        setMelCodesCount(newMelCount);
        setOtherCodesCount(newOtherCount);
        
        scannedCodesRef.current.delete(codeToDelete);
        showAppMessage(`Registro ${codeToDelete} borrado.`, 'info');
        invalidateCSV();

        return newData;
    });
};

  const handleTimeChange = (code: string, value: string) => {
    const time = Number(value);
    if (value === '' || time <= 0) {
      setScannedData(prevData =>
        prevData.map(item =>
          item.code === code ? { ...item, esti_time: null } : item
        )
      );
    } else {
      setScannedData(prevData =>
        prevData.map(item =>
          item.code === code ? { ...item, esti_time: time } : item
        )
      );
    }
    invalidateCSV();
  };

  const exportCsv = async () => {
      if(scannedData.length === 0) return showAppMessage('No hay datos para exportar.', 'duplicate');
      
      try {
          const response = await fetch('https://worldtimeapi.org/api/timezone/America/Mexico_City');
          if (!response.ok) throw new Error(`Error en API de hora: ${response.status}`);
          const data = await response.json();
          const now = new Date(data.datetime);
          
          const encargadoName = (encargado || "SIN_NOMBRE").trim().toUpperCase().replace(/ /g, '_');
          const etiquetas = `ETIQUETAS(${scannedCodesRef.current.size})`;
          const removeAccents = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const areaName = removeAccents((selectedArea).toUpperCase().replace(/ /g, '_'));

          const day = String(now.getDate()).padStart(2, '0');
          const year = String(now.getFullYear()).slice(-2);
          const monthNames = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
          const month = monthNames[now.getMonth()];
          const fechaFormateada = `${day}-${month}-${year}`;

          let hours = now.getHours();
          const ampm = hours >= 12 ? 'PM' : 'AM';
          hours = hours % 12;
          hours = hours ? hours : 12;
          const timeString = `${String(hours).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}-${ampm}`;

          const fileName = `${encargadoName}-${etiquetas}-${areaName}-${fechaFormateada}-${timeString}.csv`;
          const BOM = "\uFEFF";
          const headers = "CODIGO,TIEMPO ESTIMADO,PRODUCTO,SKU,CANTIDAD,EMPRESA,VENTA,HORA DE ASIGNACION\n";
          let csvRows = scannedData.map(row => [
              `="${row.code}"`,
              `="${row.esti_time || ''}"`,
              `="${(row.producto || '').replace(/"/g, '""')}"`,
              `="${row.sku || ''}"`,
              `="${row.cantidad || 0}"`,
              `="${(row.empresa || '').replace(/"/g, '""')}"`,
              `="${(row.venta || '').replace(/"/g, '""')}"`,
              `="${row.hora}"`
          ].join(',')).join('\n');
          
          const blob = new Blob([BOM + headers + csvRows], { type: 'text/csv;charset=utf-t' });
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          setIngresarDatosEnabled(true);
          showAppMessage('CSV exportado. Ahora puedes ingresar los datos.', 'success');

      } catch (error) {
          console.error("Error al exportar CSV:", error);
          showAppMessage('Error al obtener la hora de la red. Intenta de nuevo.', 'duplicate');
      }
  };

  const ingresarDatos = async () => {
    if (scannedData.length === 0) return showAppMessage('No hay datos para ingresar.', 'duplicate');
    setLoading(true);

    try {
        const { error } = await supabase.from('escaneos').insert(scannedData.map(item => ({
          codigo: item.code,
          fecha_escaneo: item.fecha,
          hora_escaneo: item.hora,
          encargado: item.encargado,
          area: item.area,
          esti_time: item.esti_time,
        })));

        if (error) throw error;
        
        showAppMessage(`¡Éxito! Se enviaron ${scannedData.length} registros a Supabase.`, 'success');
        clearSessionData();

    } catch (error: any) {
        console.error("Error al enviar datos a Supabase:", error);
        showAppMessage(`Error al enviar los datos: ${error.message}`, 'duplicate');
    } finally {
        setLoading(false);
    }
  };

  const saveKpiData = async (name: string, quantity: number, timeInSeconds: number) => {
    if (quantity === 0 || !name) return;

    try {
      const { error } = await supabase.from('kpis').insert({
        name: name,
        quantity: quantity,
        time: formatElapsedTime(timeInSeconds),
      });

      if (error) {
        console.error('Error saving KPI data:', error.message);
        // Silently fail for now, or show a non-blocking toast
      }
    } catch (e: any) {
      console.error('Exception while saving KPI data:', e.message);
    }
  };


 const handleProduccionProgramada = async () => {
    if (scannedData.length === 0) {
      showModalNotification('Lista Vacía', 'No hay registros pendientes para programar.', 'info');
      return;
    }
    if (!selectedPersonal) {
      showModalNotification('Falta Personal', 'Por favor, selecciona un miembro del personal.', 'destructive');
      return;
    }
    const missingTimeRows = scannedData
      .map((item, index) => (item.esti_time === null || item.esti_time === undefined ? index + 1 : null))
      .filter((rowNum): rowNum is number => rowNum !== null);

    if (missingTimeRows.length > 0) {
      const message = `Por favor, completa el campo "Tiempo Estimado" en las siguientes filas: ${missingTimeRows.join(', ')}.`;
      showModalNotification('Faltan Datos', message, 'destructive');
      return;
    }
     if (!selectedArea && !skipAreaSelection) {
      showModalNotification('Falta Área', 'Por favor, selecciona un área de trabajo o marca la opción para continuar sin una.', 'destructive');
      return;
    }

    const loteId = loteProgramado.trim();
    if (!loteId) {
      showModalNotification('Falta Lote', 'Por favor, ingresa un identificador de lote para la producción programada.', 'destructive');
      return;
    }
    
    // Validation 1: Check if loteProgramado is numeric
    if (!/^\d+$/.test(loteId)) {
        showModalNotification('Lote Inválido', 'El identificador de lote debe ser solo numérico.', 'destructive');
        return;
    }
    
    setLoading(true);
    showAppMessage('Guardando producción programada...', 'info');

    try {
        // Validation 2: Check if lote_p already exists
        const { data: existingLote, error: checkError } = await supabase
            .from('personal_prog')
            .select('lote_p')
            .eq('lote_p', loteId)
            .limit(1);

        if (checkError) {
            throw new Error(`Error al verificar el lote: ${checkError.message}`);
        }

        if (existingLote && existingLote.length > 0) {
            showModalNotification('Lote Duplicado', `El lote "${loteId}" ya existe. Por favor, usa un identificador diferente.`, 'destructive');
            setLoading(false);
            return;
        }

        let lastFinishTime = new Date();
        const dataToInsert = scannedData.map(item => {
            const startTime = new Date(lastFinishTime.getTime());
            let finishTime = new Date(startTime.getTime());
            if (item.esti_time) {
                finishTime.setMinutes(finishTime.getMinutes() + item.esti_time);
            }
            lastFinishTime = finishTime;

            return {
                code: String(item.code),
                sku: item.sku,
                name: selectedPersonal,
                name_inc: item.encargado,
                place: skipAreaSelection ? null : selectedArea,
                product: item.producto,
                quantity: item.cantidad,
                organization: item.empresa,
                sales_num: item.venta && !isNaN(Number(item.venta)) ? Number(item.venta) : null,
                date: new Date().toISOString(),
                esti_time: item.esti_time,
                status: 'PROGRAMADO',
                date_ini: startTime.toISOString(),
                date_esti: finishTime.toISOString(),
                lote_p: loteId,
                deli_date: item.deli_date,
            };
        });

        const { error } = await supabase.from('personal_prog').insert(dataToInsert);
        if (error) throw error;

        await saveKpiData(encargado, dataToInsert.length, elapsedTime);

        showModalNotification('¡Éxito!', `Se guardaron ${scannedData.length} registros en producción programada con el lote ${loteId}.`, 'success');
        clearSessionData();
        setSelectedPersonal('');
        setLoteProgramado('');
        setSelectedArea('');
        setSkipAreaSelection(false);
        fetchCreatedLotes();

    } catch (error: any) {
        console.error("Error al guardar producción programada:", error);
        showModalNotification('Error', `Error al guardar: ${error.message}`, 'destructive');
    } finally {
        setLoading(false);
    }
};

  const handleOpenCargarSeccion = async () => {
    setShowCargarProduccion(true);
    setLoadingProgramados(true);
    try {
        // Fetch unique names
        const { data: namesData, error: namesError } = await supabase.from('personal_prog').select('name');
        if (namesError) throw namesError;
        const uniqueNames = [...new Map(namesData.map(item => [item.name, item])).values()];
        setProgramadosPersonalList(uniqueNames);

        // Fetch unique lotes
        const { data: lotesData, error: lotesError } = await supabase.from('personal_prog').select('lote_p');
        if (lotesError) throw lotesError;
        const uniqueLotes = [...new Map(lotesData.filter(item => item.lote_p).map(item => [item.lote_p, item])).values()];
        setProgramadosLotesList(uniqueLotes);


    } catch (error: any) {
      showModalNotification('Error', 'Error al cargar la lista de producción programada.', 'destructive');
    } finally {
        setLoadingProgramados(false);
    }
};

  const handleCargarProgramada = async () => {
    const byPerson = cargaFilterType === 'persona';
    const filterValue = byPerson ? selectedPersonalParaCargar : selectedLoteParaCargar;

    if (!filterValue) {
        showModalNotification('Sin Selección', 'Por favor, selecciona una persona o lote para cargar.', 'info');
        return;
    }
    setLoading(true);
    showAppMessage('Cargando producción programada...', 'info');

    try {
        let query = supabase.from('personal_prog').select('*');
        if (byPerson) {
            query = query.eq('name', filterValue);
        } else {
            query = query.eq('lote_p', filterValue);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data.length === 0) {
            showModalNotification('Sin Resultados', `No hay producción programada para ${filterValue}.`, 'info');
            setLoading(false);
            return;
        }

        setLoadedProgData(data);
        // If loading by lot, we still might want to reassign.
        // Let's set the first person found as the default person to assign, or leave it blank.
        const originalAssignee = byPerson ? filterValue : (data.length > 0 ? data[0].name : '');
        setPersonToAssign(originalAssignee);

    } catch (error: any) {
        console.error("Error al cargar producción programada:", error);
        showModalNotification('Error', `Error al cargar: ${error.message}`, 'destructive');
    } finally {
        setLoading(false);
    }
};


  const handleFinalizeAssociation = async () => {
    if (!personToAssign || loadedProgData.length === 0) {
        showModalNotification('Error', 'No hay datos o persona seleccionada para asociar.', 'destructive');
        return;
    }
    setLoading(true);

    try {
        const { data: lastRecord, error: lastRecordError } = await supabase
            .from('personal')
            .select('date_esti')
            .eq('name', personToAssign)
            .not('date_esti', 'is', null)
            .order('date_esti', { ascending: false })
            .limit(1)
            .single();

        if (lastRecordError && lastRecordError.code !== 'PGRST116') {
            throw new Error(`Error al buscar último registro: ${lastRecordError.message}`);
        }
        
        const associationTimestamp = new Date();
        let lastFinishTime = lastRecord?.date_esti ? new Date(lastRecord.date_esti) : associationTimestamp;

        if (lastFinishTime < associationTimestamp) {
            lastFinishTime = associationTimestamp;
        }

        const sortedData = [...loadedProgData].sort((a, b) => new Date(a.date_ini).getTime() - new Date(b.date_ini).getTime());

        const dataToInsert = sortedData.map((item) => {
            const startTime = new Date(lastFinishTime.getTime());
            let finishTime = new Date(startTime.getTime());
            if (item.esti_time) {
                finishTime.setMinutes(finishTime.getMinutes() + item.esti_time);
            }
            lastFinishTime = finishTime;

            return {
                code: String(item.code),
                sku: item.sku,
                name: personToAssign,
                name_inc: item.name_inc,
                place: item.place,
                product: item.product,
                quantity: item.quantity,
                organization: item.organization,
                sales_num: item.sales_num && !isNaN(Number(item.sales_num)) ? Number(item.sales_num) : null,
                date: associationTimestamp.toISOString(),
                status: 'ASIGNADO',
                esti_time: item.esti_time,
                deli_date: item.deli_date,
                date_ini: startTime.toISOString(),
                date_esti: finishTime.toISOString(),
            };
        });

        const { error: insertError } = await supabase.from('personal').insert(dataToInsert);

        if (insertError) {
            if (insertError.code === '23505') {
                throw new Error(`Uno o más códigos ya existen en la tabla de asignaciones. No se puede duplicar.`);
            }
            throw new Error(`Error al guardar en 'personal': ${insertError.message}`);
        }

        const codesToDelete = loadedProgData.map(item => item.code);
        const { error: deleteError } = await supabase
            .from('personal_prog')
            .delete()
            .in('code', codesToDelete);
        
        if (deleteError) {
            throw new Error(`Error al eliminar de 'personal_prog': ${deleteError.message}. Los registros fueron asignados, pero no se eliminaron de la lista de programados.`);
        }

        showModalNotification('¡Éxito!', `Se asignaron y guardaron ${loadedProgData.length} códigos a ${personToAssign}.`, 'success');

        setShowCargarProduccion(false);
        setLoadedProgData([]);
        setPersonToAssign('');
        setSelectedPersonalParaCargar('');
        setSelectedLoteParaCargar('');
        fetchCreatedLotes();

    } catch (error: any) {
        showModalNotification('Error', `Error al asociar: ${error.message}`, 'destructive');
    } finally {
        setLoading(false);
    }
  };

 const handleVerifyCode = async () => {
    if (!encargado.trim()) {
      showModalNotification('Falta Encargado', 'Por favor, selecciona un encargado para verificar el código.', 'destructive');
      return;
    }
    if (!verificationCode) {
        setVerificationResult({ status: 'error', message: 'Por favor, ingresa un código.' });
        return;
    }
    setIsVerifying(true);
    setVerificationResult({ status: 'pending', message: 'Verificando código...' });
    try {
        // 1. Check if the code exists and get its current state.
        const { data: vCode, error: fetchError } = await supabaseEtiquetas
            .from('v_code')
            .select('corte_etiquetas, personal_bar')
            .eq('code_i', verificationCode)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows found
             throw new Error(`Error al verificar el código: ${fetchError.message}`);
        }

        if (!vCode) {
            setVerificationResult({ status: 'not-found', message: 'Código de corte no encontrado o inválido.' });
            setIsVerifying(false);
            return;
        }

        // 2. If corte_etiquetas is already set, show a message and stop.
        if (vCode.corte_etiquetas) {
            const registeredTime = new Date(vCode.corte_etiquetas).toLocaleString('es-MX', {
                dateStyle: 'short',
                timeStyle: 'medium',
            });
            setVerificationResult({ 
                status: 'error',
                message: `Este código ya fue registrado por ${vCode.personal_bar || 'alguien'} el ${registeredTime}.` 
            });
            setIsVerifying(false);
            return;
        }

        // 3. If corte_etiquetas is null, update it.
        const { error: updateError } = await supabaseEtiquetas
            .from('v_code')
            .update({ 
                corte_etiquetas: new Date().toISOString(),
                personal_bar: encargado,
            })
            .eq('code_i', verificationCode);

        if (updateError) {
            throw new Error(`Error al registrar el corte: ${updateError.message}`);
        }
        
        setVerificationResult({ status: 'verified', message: `¡Éxito! Se registró el corte para ${verificationCode} por ${encargado}.` });

    } catch (e: any) {
        setVerificationResult({ status: 'error', message: e.message || 'Ocurrió un error inesperado.' });
    } finally {
        setIsVerifying(false);
        setVerificationCode('');
    }
};

  const handleDeleteLote = async (lote_p: string) => {
    setLoading(true);
    showAppMessage(`Eliminando lote ${lote_p}...`, 'info');
    try {
      const { error } = await supabase
        .from('personal_prog')
        .delete()
        .eq('lote_p', lote_p);

      if (error) throw error;

      showModalNotification('¡Éxito!', `El lote ${lote_p} ha sido eliminado.`, 'success');
      fetchCreatedLotes();
    } catch (error: any) {
      showModalNotification('Error', `No se pudo eliminar el lote: ${error.message}`, 'destructive');
    } finally {
      setLoading(false);
    }
  };

  const formatElapsedTime = (totalSeconds: number) => {
    if (totalSeconds < 0) return '00:00';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const paddedMinutes = String(minutes).padStart(2, '0');
    const paddedSeconds = String(seconds).padStart(2, '0');

    if (hours > 0) {
        const paddedHours = String(hours).padStart(2, '0');
        return `${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
    }
    
    return `${paddedMinutes}:${paddedSeconds}`;
  };

  const messageClasses: any = {
      success: 'bg-green-500/80 text-white',
      duplicate: 'bg-red-500/80 text-white',
      info: 'bg-blue-500/80 text-white'
  };
  
  const isAssociationDisabled = scannedData.length === 0 || loading || (!selectedArea && !skipAreaSelection);

  const totalEstimatedTime = useMemo(() => {
    return scannedData.reduce((acc, item) => acc + (item.esti_time || 0), 0);
  }, [scannedData]);

  const totalLoadedProgTime = useMemo(() => {
    return loadedProgData.reduce((acc, item) => acc + (item.esti_time || 0), 0);
  }, [loadedProgData]);

  const formatTotalTime = (totalMinutes: number) => {
    if (totalMinutes === 0) return null;
    if (totalMinutes < 60) {
        return `${totalMinutes} minuto(s)`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours} hora(s) ${minutes > 0 ? `y ${minutes} minuto(s)` : ''}`;
  };

  const renderPendingRecords = () => {
    const renderTime = new Date();
    let lastFinishTime: Date = renderTime;
    
    // Failsafe to ensure no duplicates are rendered
    const uniqueData = Array.from(new Map(scannedData.map(item => [item.code, item])).values());


    return uniqueData.map((data: ScannedItem, index: number) => {
        let startTime: Date;
        if (index === 0) {
            startTime = renderTime;
        } else {
            startTime = lastFinishTime!;
        }

        let horaFin: Date | null = null;
        if (!isNaN(startTime.getTime()) && data.esti_time) {
            horaFin = new Date(startTime.getTime() + data.esti_time * 60000);
        }

        lastFinishTime = horaFin || startTime;

        const horaInicioStr = !isNaN(startTime.getTime())
            ? startTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
            : 'N/A';
            
        const horaFinStr = horaFin
            ? horaFin.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
            : 'N/A';

        return (
        <tr key={data.code}>
            <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold">{index + 1}</td>
            <td className="px-4 py-3 whitespace-nowrap font-mono text-sm">{data.code}</td>
             <td className="px-4 py-3 whitespace-nowrap text-sm">
                <Input
                    type="number"
                    value={data.esti_time ?? ''}
                    onChange={(e) => handleTimeChange(data.code, e.target.value)}
                    className="w-24 bg-transparent"
                    placeholder="min"
                    min="1"
                />
            </td>
            <td className="px-4 py-3 whitespace-nowrap text-sm">{data.producto}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm">{data.sku}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm">{data.cantidad}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm">{data.empresa}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm">{data.venta}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{data.hora}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{horaInicioStr}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm">{horaFinStr}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                <Button variant="ghost" size="icon" onClick={() => deleteRow(data.code)} className="text-red-500 hover:text-red-700 h-8 w-8">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </td>
        </tr>
      );
    })
  };

  const groupedPersonalOptions = useMemo(() => {
    if (personalList.length === 0) return [];
    
    const grouped = personalList.reduce((acc, person) => {
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
  }, [personalList]);
  
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

  const CargarProduccionSection = (
    <div className="w-full mt-4 p-4 border-t-2 border-dashed border-gray-300">
        <h3 className="text-lg font-bold text-starbucks-dark mb-2">Cargar Producción Programada</h3>
        {loadedProgData.length === 0 ? (
          <>
            <RadioGroup value={cargaFilterType} onValueChange={(v) => setCargaFilterType(v as any)} className="grid grid-cols-2 gap-2 mb-4">
              <div>
                <RadioGroupItem value="persona" id="persona" className="sr-only" />
                <Label htmlFor="persona" className={`block w-full text-center p-2 rounded-md cursor-pointer text-sm font-medium ${cargaFilterType === 'persona' ? 'bg-starbucks-green text-white shadow' : 'bg-white'}`}>
                    Por Persona
                </Label>
              </div>
               <div>
                <RadioGroupItem value="lote" id="lote" className="sr-only" />
                <Label htmlFor="lote" className={`block w-full text-center p-2 rounded-md cursor-pointer text-sm font-medium ${cargaFilterType === 'lote' ? 'bg-starbucks-green text-white shadow' : 'bg-white'}`}>
                    Por Lote
                </Label>
              </div>
            </RadioGroup>

            <div className="flex items-end gap-2">
                <div className="flex-grow">
                     {loadingProgramados ? <p>Cargando...</p> : (
                       cargaFilterType === 'persona' ? (
                          <>
                           <Label htmlFor="select-personal-cargar">Selecciona Personal</Label>
                           <Select onValueChange={setSelectedPersonalParaCargar} value={selectedPersonalParaCargar}>
                              <SelectTrigger id="select-personal-cargar">
                                  <SelectValue placeholder="Selecciona una persona" />
                              </SelectTrigger>
                              <SelectContent>
                                  {programadosPersonalList.map((p) => (
                                      <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                                  ))}
                              </SelectContent>
                          </Select>
                          </>
                       ) : (
                          <>
                          <Label htmlFor="select-lote-cargar">Selecciona Lote</Label>
                           <Select onValueChange={setSelectedLoteParaCargar} value={selectedLoteParaCargar}>
                              <SelectTrigger id="select-lote-cargar">
                                  <SelectValue placeholder="Selecciona un lote" />
                              </SelectTrigger>
                              <SelectContent>
                                  {programadosLotesList.map((l) => (
                                      <SelectItem key={l.lote_p} value={l.lote_p}>{l.lote_p}</SelectItem>
                                  ))}
                              </SelectContent>
                          </Select>
                          </>
                       )
                     )}
                </div>
                <Button onClick={handleCargarProgramada} disabled={loading || (cargaFilterType === 'persona' && !selectedPersonalParaCargar) || (cargaFilterType === 'lote' && !selectedLoteParaCargar)} className="bg-green-600 hover:bg-green-700">
                    {loading ? 'Cargando...' : 'Cargar'}
                </Button>
            </div>
            </>
        ) : (
          <div className="space-y-4">
              <div className="space-y-2">
                  <Label>Reasignar producción a:</Label>
                   <Combobox
                      groupedOptions={groupedPersonalOptions}
                      value={personToAssign}
                      onValueChange={setPersonToAssign}
                      placeholder="Selecciona para reasignar..."
                      emptyMessage="No se encontró personal."
                  />
                  <p className="text-xs text-gray-500">Originalmente asignado a: <span className="font-semibold">{selectedPersonalParaCargar || `Lote: ${selectedLoteParaCargar}`}</span></p>
              </div>

              <div className="max-h-64 overflow-auto border rounded-lg">
                  <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-100 z-10">
                          <tr>
                              <th className="px-2 py-1 text-left font-semibold">Código</th>
                              <th className="px-2 py-1 text-left font-semibold">Producto</th>
                              <th className="px-2 py-1 text-left font-semibold">Área</th>
                              <th className="px-2 py-1 text-left font-semibold">Hora Prog.</th>
                              <th className="px-2 py-1 text-left font-semibold">T. Est.</th>
                          </tr>
                      </thead>
                      <tbody>
                          {loadedProgData.map((item) => (
                              <tr key={item.code} className="border-b">
                                  <td className="px-2 py-1 font-mono">{item.code}</td>
                                  <td className="px-2 py-1">{item.product}</td>
                                  <td className="px-2 py-1">{item.place || 'N/A'}</td>
                                  <td className="px-2 py-1">{new Date(item.date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td>
                                  <td className="px-2 py-1">{item.esti_time} min</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
              
              {totalLoadedProgTime > 0 && (
                <div className="mt-2 p-2 bg-blue-100 border border-blue-300 rounded-lg text-center">
                    <p className="font-semibold text-blue-800 flex items-center justify-center gap-2">
                        <Clock className="h-5 w-5"/>
                        Tiempo Total Estimado (Cargado): <span className="font-bold">{formatTotalTime(totalLoadedProgTime)}</span>
                    </p>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setLoadedProgData([]); setPersonToAssign(''); setSelectedPersonalParaCargar(''); setSelectedLoteParaCargar(''); }}>Cancelar</Button>
                <Button onClick={handleFinalizeAssociation} disabled={loading || !personToAssign}>
                    {loading ? 'Asociando...' : 'Asociar y Guardar Producción'}
                </Button>
              </div>
          </div>
        )}
         <Button variant="ghost" size="sm" className="mt-2 text-red-600" onClick={() => {
            setShowCargarProduccion(false);
            setLoadedProgData([]);
            setPersonToAssign('');
            setSelectedPersonalParaCargar('');
            setSelectedLoteParaCargar('');
        }}>Cerrar</Button>
    </div>
  );

  const RegistrosPendientesSection = (
    <div className="w-full">
        <div className="flex flex-wrap justify-between items-center mb-2 gap-2">
            <h2 className="text-lg font-bold text-starbucks-dark">Registros Pendientes</h2>
             <div className="flex flex-wrap gap-2">
                <Button onClick={handleOpenCargarSeccion} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow-sm text-sm transition-colors duration-200" disabled={loading}>
                    Cargar
                </Button>
                <button id="clear-data" onClick={() => { if(window.confirm('¿Estás seguro?')) clearSessionData() }} className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-lg shadow-sm text-xs transition-colors duration-200">Limpiar</button>
            </div>
        </div>
        
        {showCargarProduccion && CargarProduccionSection}

        <div className="p-4 bg-starbucks-cream rounded-lg mt-4 space-y-4">
          <div>
              <Label className="block text-sm font-bold text-starbucks-dark mb-2">Área de Trabajo:</Label>
              <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => setSelectedArea('VIVERO')} disabled={skipAreaSelection} className={`area-btn w-full px-4 py-3 text-sm rounded-md shadow-sm focus:outline-none disabled:bg-gray-200 disabled:cursor-not-allowed ${selectedArea === 'VIVERO' ? 'scanner-mode-selected' : ''}`}>VIVERO</button>
                  <button onClick={() => setSelectedArea('QUINTA')} disabled={skipAreaSelection} className={`area-btn w-full px-4 py-3 text-sm rounded-md shadow-sm focus:outline-none disabled:bg-gray-200 disabled:cursor-not-allowed ${selectedArea === 'QUINTA' ? 'scanner-mode-selected' : ''}`}>QUINTA</button>
                  <button onClick={() => setSelectedArea('LAVADO')} disabled={skipAreaSelection} className={`area-btn w-full px-4 py-3 text-sm rounded-md shadow-sm focus:outline-none disabled:bg-gray-200 disabled:cursor-not-allowed ${selectedArea === 'LAVADO' ? 'scanner-mode-selected' : ''}`}>LAVADO</button>
              </div>
              <div className="flex items-center space-x-2 mt-2">
                  <Checkbox id="skip-area" checked={skipAreaSelection} onCheckedChange={(checked) => setSkipAreaSelection(Boolean(checked))} />
                  <Label htmlFor="skip-area" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Continuar sin asignar área
                  </Label>
              </div>
          </div>

          <div className="space-y-2 md:flex md:items-center md:gap-4 md:space-y-0">
            <label className="block text-sm font-bold text-starbucks-dark flex-shrink-0">Asociar Pendientes a:</label>
            <div className="flex-grow">
                <Combobox
                    groupedOptions={groupedPersonalOptions}
                    value={selectedPersonal}
                    onValueChange={setSelectedPersonal}
                    placeholder="Selecciona o busca personal..."
                    emptyMessage="No se encontró personal."
                    buttonClassName="bg-transparent border-input"
                />
            </div>
             <Button onClick={handleManualAssociate} disabled={isAssociationDisabled || loading} className="bg-starbucks-accent hover:bg-starbucks-green text-white w-full sm:w-auto">
                <UserPlus className="mr-2 h-4 w-4" /> Asociar y Guardar
            </Button>
          </div>
          <div className="space-y-2">
             <Label htmlFor="lote-programado" className="text-sm font-bold text-starbucks-dark">Lote de Producción Programada:</Label>
             <Input
                id="lote-programado"
                type="text"
                value={loteProgramado}
                onChange={(e) => setLoteProgramado(e.target.value)}
                placeholder="Ej. 12345"
                className="bg-transparent"
                disabled={loading}
              />
          </div>
          <Button onClick={handleProduccionProgramada} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm text-sm transition-colors duration-200 w-full" disabled={isAssociationDisabled || loading}>
            Guardar como Producción Programada
          </Button>

            <div className="mt-6 border-t pt-4">
                <h3 className="text-lg font-bold text-starbucks-dark mb-2">Lotes Programados Creados</h3>
                <div className="table-container border border-gray-200 rounded-lg max-h-48 overflow-auto">
                    <Table>
                        <TableHeader className="sticky top-0 bg-gray-200 z-20">
                            <TableRow>
                                <TableHead>Lote</TableHead>
                                <TableHead>Creado por</TableHead>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Cantidad</TableHead>
                                <TableHead>Tiempo Programado</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {createdLotesList.length > 0 ? createdLotesList.map((lote) => (
                                <TableRow key={lote.lote_p}>
                                    <TableCell className="font-mono">{lote.lote_p}</TableCell>
                                    <TableCell>{lote.name_inc}</TableCell>
                                    <TableCell>{new Date(lote.date).toLocaleString('es-MX')}</TableCell>
                                    <TableCell className="font-semibold">{lote.count}</TableCell>
                                    <TableCell>{formatTotalTime(lote.total_esti_time)}</TableCell>
                                    <TableCell className="text-right">
                                      <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                              <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 h-8 w-8">
                                                  <Trash2 className="h-4 w-4" />
                                              </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                              <AlertDialogHeader>
                                                  <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
                                                  <AlertDialogDescription>
                                                      Esta acción no se puede deshacer. Esto eliminará permanentemente el lote
                                                      <span className="font-bold"> {lote.lote_p}</span> y todos sus registros asociados.
                                                  </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                  <AlertDialogAction onClick={() => handleDeleteLote(lote.lote_p)} className="bg-destructive hover:bg-destructive/90">
                                                      Eliminar Lote
                                                  </AlertDialogAction>
                                              </AlertDialogFooter>
                                          </AlertDialogContent>
                                      </AlertDialog>
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-gray-500 py-4">
                                        No hay lotes programados.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
        
        {totalEstimatedTime > 0 && (
            <div className="mt-4 p-3 bg-blue-100 border border-blue-300 rounded-lg text-center">
                <p className="font-semibold text-blue-800 flex items-center justify-center gap-2">
                    <Clock className="h-5 w-5"/>
                    Tiempo Total Estimado: <span className="font-bold">{formatTotalTime(totalEstimatedTime)}</span>
                </p>
            </div>
        )}

        <div className="table-container border border-gray-200 rounded-lg mt-4">
            <table className="w-full min-w-full divide-y divide-gray-200">
                <thead className="bg-starbucks-cream sticky top-0 z-10">
                    <tr>
                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">#</th>
                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">CODIGO</th>
                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">TIEMPO ESTIMADO</th>
                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">PRODUCTO</th>
                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">SKU</th>
                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">CANT</th>
                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">EMPRESA</th>
                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">Venta</th>
                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">HORA DE ASIGNACION</th>
                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">HORA INICIO</th>
                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">HORA FIN</th>
                        <th scope="col" className="px-4 py-2 text-center text-xs font-medium text-starbucks-dark uppercase tracking-wider">ACCION</th>
                    </tr>
                </thead>
                <tbody id="scanned-list" className="bg-starbucks-white divide-y divide-gray-200">
                    {renderPendingRecords()}
                </tbody>
            </table>
        </div>
    </div>
  );


  return (
    <>
        <Head>
            <title>Asignar Empaquetado</title>
        </Head>

        <main className="text-starbucks-dark flex items-center justify-center p-4">
            <div className="w-full max-w-7xl mx-auto bg-starbucks-white rounded-xl shadow-2xl p-4 md:p-6 space-y-4">
                <header className="text-center">
                    <h1 className="text-xl md:text-2xl font-bold text-starbucks-green">Asignar Empaquetado</h1>
                    <p className="text-gray-600 text-sm md:text-base mt-1">Asigna un producto a un miembro del personal.</p>
                </header>

                <div className="flex justify-center gap-4">
                    <div className={`flex items-center gap-2 p-2 rounded-lg ${dbStatus.personalDb === 'success' ? 'bg-green-100 text-green-800' : dbStatus.personalDb === 'error' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {dbStatus.personalDb === 'success' ? <Wifi className="h-5 w-5" /> : dbStatus.personalDb === 'error' ? <WifiOff className="h-5 w-5"/> : <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-800"></div>}
                        <span className="text-sm font-medium">BD Personal</span>
                    </div>
                    <div className={`flex items-center gap-2 p-2 rounded-lg ${dbStatus.etiquetasDb === 'success' ? 'bg-green-100 text-green-800' : dbStatus.etiquetasDb === 'error' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {dbStatus.etiquetasDb === 'success' ? <Wifi className="h-5 w-5" /> : dbStatus.etiquetasDb === 'error' ? <WifiOff className="h-5 w-5"/> : <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-800"></div>}
                        <span className="text-sm font-medium">BD Etiquetas</span>
                    </div>
                </div>

                {dbError && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Error de Base de Datos</AlertTitle>
                        <AlertDescription>{dbError}</AlertDescription>
                    </Alert>
                )}
                
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

                <div className="p-4 rounded-lg border-2 border-gray-300 bg-gray-50">
                    <Label className="text-sm font-bold text-starbucks-dark">Verificar Código de Corte</Label>
                     <div className="flex items-center gap-2 mt-1">
                        <Input
                            type="text"
                            value={verificationCode}
                            onChange={(e) => setVerificationCode(e.target.value)}
                            className="flex-grow bg-transparent"
                            placeholder="Ingresa el código de corte..."
                            onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
                            disabled={isVerifying || !encargado.trim()}
                        />
                        <Button onClick={handleVerifyCode} disabled={isVerifying || !encargado.trim()}>
                            {isVerifying ? 'Verificando...' : <Search className="h-4 w-4"/>}
                        </Button>
                    </div>
                    <p className={`text-xs mt-2 ${verificationResult.status === 'error' || verificationResult.status === 'not-found' ? 'text-red-600' : 'text-gray-600'}`}>{verificationResult.message}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Columna Izquierda: Controles */}
                    <div className="space-y-4">
                        <RadioGroup value={scanMode} onValueChange={(value) => setScanMode(value as any)} className="grid grid-cols-3 gap-2 bg-gray-100 p-2 rounded-lg">
                          <div>
                              <RadioGroupItem value="assign" id="assign" className="sr-only" />
                              <Label htmlFor="assign" className={`block w-full text-center p-2 rounded-md cursor-pointer text-sm font-medium ${scanMode === 'assign' ? 'bg-starbucks-green text-white shadow' : 'bg-white'}`}>
                                  Asignar
                              </Label>
                          </div>
                          <div>
                              <RadioGroupItem value="unassign" id="unassign" className="sr-only" />
                              <Label htmlFor="unassign" className={`block w-full text-center p-2 rounded-md cursor-pointer text-sm font-medium ${scanMode === 'unassign' ? 'bg-starbucks-green text-white shadow' : 'bg-white'}`}>
                                  Desasignar
                              </Label>
                          </div>
                          <div>
                              <RadioGroupItem value="update_date" id="update_date" className="sr-only" />
                              <Label htmlFor="update_date" className={`block w-full text-center p-2 rounded-md cursor-pointer text-sm font-medium ${scanMode === 'update_date' ? 'bg-starbucks-green text-white shadow' : 'bg-white'}`}>
                                  Actualizar Fecha
                              </Label>
                          </div>
                        </RadioGroup>

                        <div>
                            <label className="block text-sm font-bold text-starbucks-dark mb-1">Método de Escaneo:</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => setSelectedScannerMode('camara')} className={`area-btn w-full px-4 py-3 text-sm rounded-md shadow-sm focus:outline-none ${selectedScannerMode === 'camara' ? 'scanner-mode-selected' : ''}`} disabled={scannerActive}>CÁMARA</button>
                                <button onClick={() => setSelectedScannerMode('fisico')} className={`area-btn w-full px-4 py-3 text-sm rounded-md shadow-sm focus:outline-none ${selectedScannerMode === 'fisico' ? 'scanner-mode-selected' : ''}`} disabled={scannerActive}>ESCÁNER FÍSICO</button>
                            </div>
                        </div>

                        {/* Contenedor de Registros para Móvil */}
                        {scanMode === 'assign' && (
                            <div className="md:hidden">
                                {RegistrosPendientesSection}
                            </div>
                        )}
                    </div>
                    
                    {/* Columna Derecha: Escáner */}
                     <div ref={scannerSectionRef} className="bg-starbucks-cream p-4 rounded-lg flex flex-col justify-between">
                        <div className="scanner-container relative w-full flex-grow min-h-[250px] md:min-h-0">
                            <div id="reader" ref={readerRef} className="w-full h-full" style={{ display: selectedScannerMode === 'camara' && scannerActive ? 'block' : 'none' }}></div>
                            
                            {message.show && (
                                <div className={`scanner-message ${messageClasses[message.type]}`}>
                                    {message.text}
                                </div>
                            )}

                            {scannerActive && selectedScannerMode === 'camara' && <div id="laser-line"></div>}
                            <input type="text" id="physical-scanner-input" ref={physicalScannerInputRef} className="hidden-input" autoComplete="off" />
                            {selectedScannerMode === 'camara' && !scannerActive && (
                                <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center w-full h-full">
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
                            <button onClick={startScanner} disabled={scannerActive || loading || !encargado} className="px-4 py-2 text-white font-semibold rounded-lg shadow-md transition-colors duration-200 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-sm">
                                Iniciar
                            </button>
                            <button onClick={stopScanner} disabled={!scannerActive} className="px-4 py-2 text-white font-semibold rounded-lg shadow-md transition-colors duration-200 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-sm">
                                Detener
                            </button>
                        </div>

                        <div id="physical-scanner-status" className="mt-4 text-center p-2 rounded-md bg-starbucks-accent text-white" style={{ display: scannerActive && selectedScannerMode === 'fisico' ? 'block' : 'none' }}>
                            Escáner físico listo.
                        </div>
                    </div>
                </div>


                <div className="space-y-4">
                     {scanMode === 'assign' && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                             <div className="p-2 rounded-lg bg-blue-100 text-blue-800">
                                <h3 className="font-bold uppercase text-xs flex items-center justify-center gap-1"><Clock className="h-4 w-4" /> Tiempo</h3>
                                <p className="text-2xl font-mono">{formatElapsedTime(elapsedTime)}</p>
                            </div>
                            <div className="bg-starbucks-cream p-2 rounded-lg">
                                <h3 className="font-bold text-starbucks-dark uppercase text-xs">Total</h3>
                                <p id="total-scans" className="text-2xl font-mono text-starbucks-green">{scannedData.length}</p>
                            </div>
                            <div className="bg-starbucks-cream p-2 rounded-lg">
                                <h3 className="font-bold text-starbucks-dark uppercase text-xs">Otros</h3>
                                <p id="other-scans" className="text-2xl font-mono text-yellow-500">{otherCodesCount}</p>
                            </div>
                            <div className="bg-starbucks-cream p-2 rounded-lg">
                                <h3 className="font-bold text-starbucks-dark uppercase text-xs">MEL</h3>
                                <p id="unique-scans" className="text-2xl font-mono text-starbucks-accent">{melCodesCount}</p>
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="space-y-4">
                     <div className="p-4 bg-starbucks-cream rounded-lg">
                        <label htmlFor="manual-code-input" className="block text-sm font-bold text-starbucks-dark mb-1">Ingreso Manual:</label>
                        <div className="relative mt-1 flex items-center rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                            <Input
                                type="text"
                                id="manual-code-input"
                                className="w-full border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                                placeholder="Escriba el código..."
                                onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()}
                            />
                            <Button
                                type="button"
                                id="manual-add-btn"
                                onClick={handleManualAdd}
                                size="icon"
                                className="h-8 w-8 bg-starbucks-green hover:bg-starbucks-dark text-white rounded-md mr-1"
                            >
                                <PlusCircle className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                    {/* Contenedor de Registros para Escritorio */}
                    {scanMode === 'assign' && (
                        <div className="hidden md:block">
                            {RegistrosPendientesSection}
                        </div>
                    )}

                </div>
            </div>

            {loading && <div id="loading-overlay" style={{display: 'flex'}}>
                <div className="overlay-spinner"></div>
                <p className="text-lg font-semibold">Enviando registros...</p>
            </div>}

            {showNotification && (
                <div id="notification-overlay" className="p-4 fixed inset-0 bg-black/75 flex justify-center items-center z-[100]" onClick={() => setShowNotification(false)}>
                     <div className="bg-starbucks-white rounded-lg shadow-xl p-6 w-full max-w-sm text-center space-y-4" onClick={(e) => e.stopPropagation()}>
                        <Alert variant={notification.variant as any} className={notification.variant === 'success' ? 'border-green-500 text-green-700 [&>svg]:text-green-700' : ''}>
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
            
            {confirmation.isOpen && <div id="qr-confirmation-overlay" className="p-4" style={{display: 'flex'}}>
                 <div className="bg-starbucks-white rounded-lg shadow-xl p-6 w-full max-w-sm text-center space-y-4">
                    <h3 id="confirmation-title" className="text-lg font-bold text-starbucks-dark">{confirmation.title}</h3>
                    <p id="confirmation-message" className="text-sm text-gray-600">{confirmation.message}</p>
                    <div id="qr-code-display" className="bg-starbucks-cream p-3 rounded-md font-mono text-xs break-words max-h-28 overflow-y-auto font-bold text-starbucks-dark">{confirmation.code}</div>
                    <div className="flex justify-center gap-4 mt-4">
                        <button id="qr-confirm-yes" onClick={() => handleConfirmation(true)} className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow-md">Sí</button>
                        <button id="qr-confirm-no" onClick={() => handleConfirmation(false)} className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-md">No</button>
                    </div>
                </div>
            </div>}
        </main>
    </>
  );
}
