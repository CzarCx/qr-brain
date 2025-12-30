
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
import { Zap, ZoomIn, UserPlus, PlusCircle, Clock, AlertTriangle } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Combobox } from '@/components/ui/combobox';
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
  esti_time?: number | null;
  date_esti?: string | null;
  date_ini?: string | null;
};

type Encargado = {
  name: string;
};


// Helper function to check if a string is likely a name
const isLikelyName = (text: string): boolean => {
  const trimmed = text.trim();
  // Not a number, has spaces, and more than 5 chars.
  return isNaN(Number(trimmed)) && trimmed.includes(' ') && trimmed.length > 5;
};


export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const [message, setMessage] = useState<{text: React.ReactNode, type: 'info' | 'success' | 'duplicate'}>({text: 'Esperando para escanear...', type: 'info'});
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [encargado, setEncargado] = useState('');
  const [encargadosList, setEncargadosList] = useState<Encargado[]>([]);
  const [personalList, setPersonalList] = useState<Encargado[]>([]);
  const [selectedPersonal, setSelectedPersonal] = useState('');
  const [scannedData, setScannedData] = useState<ScannedItem[]>([]);
  const [personalScans, setPersonalScans] = useState<PersonalScanItem[]>([]);
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
  const [isCargarModalOpen, setIsCargarModalOpen] = useState(false);
  const [programadosPersonalList, setProgramadosPersonalList] = useState<{ name: string }[]>([]);
  const [selectedPersonalParaCargar, setSelectedPersonalParaCargar] = useState('');
  const [loadingProgramadosPersonal, setLoadingProgramadosPersonal] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedBulkPersonal, setSelectedBulkPersonal] = useState('');
  const [dbError, setDbError] = useState<string | null>(null);


  // Refs para elementos del DOM y la instancia del escáner
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const physicalScannerInputRef = useRef<HTMLInputElement | null>(null);
  const readerRef = useRef<HTMLDivElement | null>(null);

  // Refs para valores que no necesitan re-renderizar el componente
  const lastScanTimeRef = useRef(Date.now());
  const lastSuccessfullyScannedCodeRef = useRef<string | null>(null);
  const scannedCodesRef = useRef(new Set<string>());
  const bufferRef = useRef('');
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const APPS_SCRIPT_URL =
    'https://script.google.com/macros/s/AKfycbwxN5n-iE0pi3JlOkImBgWD3-qptWsJxdyMJjXbRySgGvi7jqIsU9Puo7p2uvu5BioIbQ/exec';
  const MIN_SCAN_INTERVAL = 500;

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setIsMounted(true);
    const checkDbConnection = async () => {
      const { error } = await supabase.from('personal_name').select('name').limit(1);
      if (error) {
        setDbError('Error de conexión a la base de datos de personal. Revisa los permisos RLS.');
      }
      const { error: etiquetasError } = await supabaseEtiquetas.from('etiquetas_i').select('code').limit(1);
      if (etiquetasError) {
         setDbError(prev => prev ? `${prev} Y Error en DB de etiquetas.` : 'Error de conexión a la base de datos de etiquetas. Revisa los permisos RLS.');
      }
    };
    checkDbConnection();
  }, []);

  useEffect(() => {
    const fetchPersonal = async () => {
        const { data, error } = await supabase
            .from('personal_name')
            .select('name')
            .eq('rol', 'operativo');

        if (error) {
            setDbError('Error al cargar personal operativo. Revisa los permisos RLS de la tabla `personal_name`.');
        } else if (data && data.length === 0) {
            setDbError('No se encontró personal operativo. Revisa los datos o los permisos RLS.');
        } else {
            setPersonalList(data || []);
        }
    };
    const fetchEncargados = async () => {
        const { data, error } = await supabase
            .from('personal_name')
            .select('name')
            .eq('rol', 'barra');

        if (error) {
            setDbError('Error al cargar encargados. Revisa los permisos RLS de la tabla `personal_name`.');
        } else if (data && data.length === 0) {
            setDbError('No se encontraron encargados con el rol "barra". Revisa los datos o los permisos RLS.');
        } else {
            setEncargadosList(data || []);
        }
    };
    fetchEncargados();
    fetchPersonal();
  }, []);

  const showAppMessage = (text: React.ReactNode, type: 'success' | 'duplicate' | 'info') => {
    setMessage({text, type});
  };

  const invalidateCSV = () => {
    setIngresarDatosEnabled(false);
  };
  
  const clearSessionData = () => {
    scannedCodesRef.current.clear();
    setScannedData([]);
    setPersonalScans([]);
    setMelCodesCount(0);
    setOtherCodesCount(0);
    lastSuccessfullyScannedCodeRef.current = null;
    setIngresarDatosEnabled(false);
  };

  const playBeep = () => {
    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, context.currentTime); // A5 note
    gainNode.gain.setValueAtTime(1, context.currentTime); // Volume
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
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(110, context.currentTime); // A2 note
    gainNode.gain.setValueAtTime(1, context.currentTime); // Volume
    gainNode.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + 0.2);
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
  };

  const addCodeAndUpdateCounters = useCallback(async (codeToAdd: string, details: { sku: string | null; cantidad: number | null; producto: string | null; empresa: string | null; venta: string | null; }) => {
    const finalCode = codeToAdd.trim();

    if (scannedCodesRef.current.has(finalCode)) {
      showAppMessage(<>DUPLICADO: {finalCode}</>, 'duplicate');
      playErrorSound();
      return false;
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

    const newData: ScannedItem = {
      code: finalCode,
      fecha: fechaEscaneo,
      hora: horaEscaneo,
      encargado: encargado.trim(),
      area: 'REVISIÓN CALIDAD',
      sku: details.sku,
      cantidad: details.cantidad,
      producto: details.producto,
      empresa: details.empresa,
      venta: details.venta,
      esti_time: estimatedTime,
    };
    
    setScannedData(prevData => [...prevData].sort((a, b) => new Date(`1970/01/01 ${a.hora}`).valueOf() - new Date(`1970/01/01 ${b.hora}`).valueOf()));
    setScannedData(prevData => [...prevData, newData]);


    invalidateCSV();
    return true;
  }, [encargado]);

  const associateNameToScans = useCallback(async (name: string, pendingScans: ScannedItem[]) => {
    if (pendingScans.length === 0) {
      showAppMessage(`${name} escaneado, pero no había códigos pendientes.`, 'info');
      return;
    }
     if (pendingScans.some(item => item.esti_time === null || item.esti_time === undefined)) {
      showAppMessage('Por favor, completa todos los campos de "Tiempo Estimado" antes de asociar.', 'duplicate');
      return;
    }
  
    setLoading(true);
    showAppMessage('Asociando códigos y consultando base de datos...', 'info');
  
    try {
        const sortedScans = [...pendingScans].sort((a, b) => new Date(`1970/01/01 ${a.hora}`).valueOf() - new Date(`1970/01/01 ${b.hora}`).valueOf());
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data: lastScan, error: lastScanError } = await supabase
            .from('personal')
            .select('date_esti')
            .eq('name', name)
            .gte('date', today.toISOString())
            .order('date_esti', { ascending: false })
            .limit(1)
            .single();

        if (lastScanError && lastScanError.code !== 'PGRST116') {
          throw new Error(`Error fetching last scan: ${lastScanError.message}`);
        }

        let lastFinishTime: Date;
        if (lastScan && lastScan.date_esti) {
            const lastEstiDate = new Date(lastScan.date_esti);
            lastFinishTime = lastEstiDate > new Date() ? lastEstiDate : new Date();
        } else {
            lastFinishTime = new Date();
        }

        const newPersonalScansPromises = sortedScans.map(async (item, index) => {
          let sku: string | null = '';
          let producto: string | null = '';
          let cantidad: number | null = 0;
          let empresa: string | null = '';
          let venta: string | null = '';
          
          let date_ini: string | null = null;
          let date_esti: string | null = null;

          // Calculate start time
          let startTime: Date;
          if (index === 0) {
              startTime = lastFinishTime;
          } else {
              startTime = lastFinishTime!;
          }
          if (!isNaN(startTime.getTime())) {
            date_ini = startTime.toISOString();
          }

          // Calculate end time
          if (!isNaN(startTime.getTime()) && item.esti_time) {
              const endDate = new Date(startTime.getTime() + item.esti_time * 60000);
              date_esti = endDate.toISOString();
              lastFinishTime = endDate;
          } else {
              lastFinishTime = startTime;
          }

          if (!item.sku || !item.producto || !item.cantidad || !item.empresa || !item.venta) {
              try {
                  const { data, error } = await supabaseEtiquetas
                  .from('etiquetas_i')
                  .select('sku, product:productO, quantity, organization, sales_num')
                  .eq('code', Number(item.code))
                  .single();
          
                  if (error && error.code !== 'PGRST116') {
                  throw error;
                  }
          
                  if (data) {
                  sku = data.sku || '';
                  producto = data.product || '';
                  cantidad = data.quantity || 0;
                  empresa = data.organization || '';
                  venta = data.sales_num ? String(data.sales_num) : '';
                  } else {
                  showAppMessage(`Código ${item.code} no encontrado. Se añade sin detalles.`, 'info');
                  }
              } catch (e: any) {
                  console.error(`Error al buscar el código ${item.code}:`, e.message);
                  showAppMessage(`Error al buscar ${item.code}: ${e.message}`, 'duplicate');
              }
          } else {
              sku = item.sku;
              producto = item.producto;
              cantidad = item.cantidad;
              empresa = item.empresa;
              venta = item.venta;
          }
      
          return {
              code: item.code,
              sku: sku,
              personal: name, 
              encargado: item.encargado,
              product: producto,
              quantity: cantidad,
              organization: empresa,
              venta: venta,
              date: new Date().toISOString(),
              esti_time: item.esti_time,
              date_esti: date_esti,
              date_ini: date_ini,
          };
        });
  
        const newPersonalScans = await Promise.all(newPersonalScansPromises);
    
        setPersonalScans(prev => [...prev, ...newPersonalScans].sort((a, b) => new Date(a.date_ini!).valueOf() - new Date(b.date_ini!).valueOf()));
        setScannedData([]);
        scannedCodesRef.current.clear();
        setMelCodesCount(0);
        setOtherCodesCount(0);
        showAppMessage(`Se asociaron ${newPersonalScans.length} códigos a ${name}.`, 'success');
    } catch (e: any) {
      showAppMessage(`Error al procesar los códigos: ${e.message}`, 'duplicate');
    } finally {
      setLoading(false);
    }
  }, [currentTime]);

  const handleManualAssociate = () => {
    if (!selectedPersonal) {
        showAppMessage('Por favor, selecciona un miembro del personal.', 'duplicate');
        return;
    }
    if (scannedData.length === 0) {
        showAppMessage('No hay etiquetas pendientes para asociar.', 'info');
        return;
    }
    if (scannedData.some(item => item.esti_time === null || item.esti_time === undefined)) {
        showAppMessage('Por favor, completa todos los campos de "Tiempo Estimado" antes de asociar.', 'duplicate');
        return;
    }
    associateNameToScans(selectedPersonal, scannedData);
    setSelectedPersonal(''); // Reset dropdown
  };
  
  const showConfirmationDialog = (title: string, message: string, code: string): Promise<boolean> => {
      return new Promise((resolve) => {
          setConfirmation({ isOpen: true, title, message, code, resolve });
      });
  };

  const onScanSuccess = useCallback((decodedText: string, decodedResult: any) => {
    if (!scannerActive || Date.now() - lastScanTimeRef.current < MIN_SCAN_INTERVAL) return;
    lastScanTimeRef.current = Date.now();
    setLastScannedCode(decodedText);
  }, [scannerActive]);

  const processScan = useCallback(async (decodedText: string) => {
    let finalCode = decodedText;
    try {
      const parsedJson = JSON.parse(decodedText);
      if (parsedJson && parsedJson.id) finalCode = parsedJson.id;
    } catch (e) {}

    if (isLikelyName(finalCode)) {
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
      associateNameToScans(finalCode, scannedData); 
      lastSuccessfullyScannedCodeRef.current = finalCode;
      return;
    }

    if (finalCode === lastSuccessfullyScannedCodeRef.current) return;
    
    setLoading(true);
    try {
        const { data: personalData, error: personalError } = await supabase
            .from('personal')
            .select('code, name, name_inc')
            .eq('code', Number(finalCode))
            .single();

        if (personalError && personalError.code !== 'PGRST116') {
            showAppMessage(`Error al verificar el código en personal: ${personalError.message}`, 'duplicate');
            playErrorSound();
            setLoading(false);
            return;
        }

        if (personalData) {
            playErrorSound();
            showAppMessage(
                <>
                  El código {finalCode} ya fue asignado a <strong className="font-bold text-yellow-300">{personalData.name}</strong> por <strong className="font-bold text-yellow-300">{personalData.name_inc}</strong>.
                </>,
                'duplicate'
            );
            setLoading(false);
            return;
        }

        const { data, error } = await supabaseEtiquetas
            .from('etiquetas_i')
            .select('code, sku, quantity, product:productO, organization, sales_num')
            .eq('code', Number(finalCode))
            .single();

        if (error && error.code !== 'PGRST116') {
            showAppMessage(`Error de base de datos de etiquetas: ${error.message}`, 'duplicate');
            playErrorSound();
            setLoading(false);
            return;
        }

        if (!data) {
            showAppMessage(`Código ${finalCode} no encontrado en la base de datos de etiquetas.`, 'duplicate');
            playErrorSound();
            setLoading(false);
            return;
        }

        const { sku, quantity, product, organization, sales_num } = data;

        const isBarcode = finalCode.length > 5;
        let confirmed = true;

        if (isBarcode && finalCode.startsWith('4') && finalCode.length === 11) {
            confirmed = true;
        } else {
            const title = isBarcode ? 'Advertencia' : 'Confirmar Código';
            const message = isBarcode ? 'Este no es un código MEL, ¿desea agregar?' : 'Se ha detectado el siguiente código. ¿Desea agregarlo al registro?';
            confirmed = await showConfirmationDialog(title, message, finalCode);
        }

        if (confirmed) {
          addCodeAndUpdateCounters(finalCode, { sku, cantidad: quantity, producto: product, empresa: organization, venta: sales_num ? String(sales_num) : null });
        } else {
          showAppMessage('Escaneo cancelado.', 'info');
        }
    } finally {
        setLoading(false);
    }
  }, [addCodeAndUpdateCounters, associateNameToScans, scannedData]);

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
        qrCode.start({ facingMode: "environment" }, config, onScanSuccess, (errorMessage) => {})
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
  }, [scannerActive, selectedScannerMode, onScanSuccess, isMounted, isMobile]);

  const handlePhysicalScannerInput = (event: KeyboardEvent) => {
      if(event.key === 'Enter') {
          event.preventDefault();
          if(bufferRef.current.length > 0) {
              processPhysicalScan(bufferRef.current);
              bufferRef.current = '';
          }
          return;
      }

      if(event.key.length === 1) {
          bufferRef.current += event.key;
      }

      if(scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = setTimeout(() => {
          if(bufferRef.current.length > 0) {
              processPhysicalScan(bufferRef.current);
              bufferRef.current = '';
          }
      }, 200);
  };

  useEffect(() => {
    const input = physicalScannerInputRef.current;
    
    if (selectedScannerMode === 'fisico' && scannerActive && input) {
      input.addEventListener('keydown', handlePhysicalScannerInput as any);
      input.focus();
    }
    
    return () => {
      if (input) {
        input.removeEventListener('keydown', handlePhysicalScannerInput as any);
      }
    };
  }, [scannerActive, selectedScannerMode]);
  
  const processPhysicalScan = useCallback(async (code: string) => {
    if(!scannerActive || (Date.now() - lastScanTimeRef.current) < MIN_SCAN_INTERVAL) return;
    lastScanTimeRef.current = Date.now();

    let finalCode = code.trim().replace(/[^0-9A-Za-z-]/g, '');
    const patternMatch = finalCode.match(/^id(\d{11})tlm$/i);
    if (patternMatch) {
        finalCode = patternMatch[1];
    }
    
    if (finalCode === lastSuccessfullyScannedCodeRef.current) return;

    setLoading(true);
    try {
        const { data: personalData, error: personalError } = await supabase
            .from('personal')
            .select('code, name, name_inc')
            .eq('code', Number(finalCode))
            .single();

        if (personalError && personalError.code !== 'PGRST116') {
            showAppMessage(`Error al verificar el código en personal: ${personalError.message}`, 'duplicate');
            playErrorSound();
            setLoading(false);
            return;
        }

        if (personalData) {
            playErrorSound();
            showAppMessage(
              <>
                El código {finalCode} ya fue asignado a <strong className="font-bold text-yellow-300">{personalData.name}</strong> por <strong className="font-bold text-yellow-300">{personalData.name_inc}</strong>.
              </>,
              'duplicate'
            );
            setLoading(false);
            return;
        }
        
        const { data, error } = await supabaseEtiquetas
            .from('etiquetas_i')
            .select('code, sku, quantity, product:productO, organization, sales_num')
            .eq('code', Number(finalCode))
            .single();
        
        if (error && error.code !== 'PGRST116') {
            showAppMessage(`Error de base de datos de etiquetas: ${error.message}`, 'duplicate');
            playErrorSound();
            setLoading(false);
            return;
        }

        if (!data) {
            showAppMessage(`Código ${finalCode} no encontrado en la base de datos de etiquetas.`, 'duplicate');
            playErrorSound();
            setLoading(false);
            return;
        }

        const { sku, quantity, product, organization, sales_num } = data;

        if(finalCode.startsWith('4') && finalCode.length === 11) {
            addCodeAndUpdateCounters(finalCode, { sku, cantidad: quantity, producto: product, empresa: organization, venta: sales_num ? String(sales_num) : null });
            return;
        }
        
        const isQrCodeLike = finalCode.length < 10 || finalCode.length > 14;
        let confirmed = true;

        if (isQrCodeLike || !finalCode.startsWith('4')) {
            const title = isQrCodeLike ? 'Confirmar Código' : 'Advertencia';
            const message = isQrCodeLike ? 'Se ha detectado el siguiente código. ¿Desea agregarlo al registro?': 'Este no es un código MEL, ¿desea agregar?';
            confirmed = await showConfirmationDialog(title, message, finalCode);
        }

        if (confirmed) {
            addCodeAndUpdateCounters(finalCode, { sku, cantidad: quantity, producto: product, empresa: organization, venta: sales_num ? String(sales_num) : null });
        } else {
            showAppMessage('Escaneo cancelado.', 'info');
        }
    } finally {
        setLoading(false);
    }
  }, [scannerActive, addCodeAndUpdateCounters]);
  
  const startScanner = () => {
    if (!encargado.trim()) return showAppMessage('Por favor, ingresa el nombre del encargado.', 'duplicate');
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

  const handleConfirmation = (decision: boolean) => {
      confirmation.resolve(decision);
      setConfirmation({ isOpen: false, title: '', message: '', code: '', resolve: () => {} });
      if (selectedScannerMode === 'fisico' && scannerActive) {
          setTimeout(() => physicalScannerInputRef.current?.focus(), 100);
      }
  };

  const handleManualAdd = async () => {
      const manualCodeInput = document.getElementById('manual-code-input') as HTMLInputElement;
      if (!encargado.trim()) return showAppMessage('Por favor, ingresa el nombre del encargado.', 'duplicate');

      const manualCode = manualCodeInput.value.trim();
      if (!manualCode) return showAppMessage('Por favor, ingresa un código para agregar.', 'duplicate');
      
      const numericCode = Number(manualCode);
      if (isNaN(numericCode)) {
          return showAppMessage('El código debe ser numérico.', 'duplicate');
      }
      
      setLoading(true);
      try {
        const { data: personalData, error: personalError } = await supabase
            .from('personal')
            .select('code, name, name_inc')
            .eq('code', numericCode)
            .single();

        if (personalError && personalError.code !== 'PGRST116') {
            showAppMessage(`Error al verificar el código en personal: ${personalError.message}`, 'duplicate');
            playErrorSound();
            setLoading(false);
            return;
        }

        if (personalData) {
            playErrorSound();
            showAppMessage(
              <>
                El código {manualCode} ya fue asignado a <strong className="font-bold text-yellow-300">{personalData.name}</strong> por <strong className="font-bold text-yellow-300">{personalData.name_inc}</strong>.
              </>,
              'duplicate'
            );
            setLoading(false);
            return;
        }
        
        const { data, error } = await supabaseEtiquetas
            .from('etiquetas_i')
            .select('code, sku, quantity, product:productO, organization, sales_num')
            .eq('code', numericCode)
            .single();

        if (error && error.code !== 'PGRST116') { 
            showAppMessage(`Error de base de datos de etiquetas: ${error.message}`, 'duplicate');
            playErrorSound();
            setLoading(false);
            return;
        }

        if (!data) {
            showAppMessage(`Código ${manualCode} no encontrado en la base de datos de etiquetas.`, 'duplicate');
            playErrorSound();
            setLoading(false);
            return;
        }

        const { sku, quantity, product, organization, sales_num } = data;

        let confirmed = true;
        if(!manualCode.startsWith('4')) {
            confirmed = await showConfirmationDialog('Advertencia', 'Este no es un código MEL, ¿desea agregar?', manualCode);
        }

        if(confirmed) {
            if(await addCodeAndUpdateCounters(manualCode, { sku, cantidad: quantity, producto: product, empresa: organization, venta: sales_num ? String(sales_num) : null })) {
                manualCodeInput.value = '';
                manualCodeInput.focus();
            } else {
                manualCodeInput.select();
            }
        } else {
            showAppMessage('Ingreso cancelado.', 'info');
        }
      } finally {
          setLoading(false);
      }
  };
  
  const deleteRow = (codeToDelete: string) => {
    if (window.confirm(`¿Confirmas que deseas borrar el registro "${codeToDelete}"?`)) {
        setScannedData(prev => prev.filter(item => item.code !== codeToDelete));
        scannedCodesRef.current.delete(codeToDelete);

        if(codeToDelete.startsWith('4')) {
            setMelCodesCount(prev => prev - 1);
        } else {
            setOtherCodesCount(prev => prev - 1);
        }
        showAppMessage(`Registro ${codeToDelete} borrado.`, 'info');
        invalidateCSV();
    }
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
          const areaName = removeAccents(("REVISIÓN CALIDAD").toUpperCase().replace(/ /g, '_'));

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

 const handleSavePersonal = async () => {
    if (personalScans.length === 0) {
      showAppMessage('No hay datos de personal para guardar.', 'info');
      return;
    }
    setLoading(true);
    showAppMessage('Guardando registros de personal...', 'info');

    try {
      const personName = personalScans[0]?.personal;
      if (!personName) {
        throw new Error("No se pudo determinar el nombre del personal.");
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: lastScan, error: lastScanError } = await supabase
        .from('personal')
        .select('date_esti')
        .eq('name', personName)
        .gte('date', today.toISOString())
        .order('date_esti', { ascending: false })
        .limit(1)
        .single();
      
      if (lastScanError && lastScanError.code !== 'PGRST116') {
        throw new Error(`Error al buscar el último registro: ${lastScanError.message}`);
      }
      
      let lastFinishTime: Date;
        if (lastScan && lastScan.date_esti) {
            const lastEstiDate = new Date(lastScan.date_esti);
            lastFinishTime = lastEstiDate > new Date() ? lastEstiDate : new Date();
        } else {
            lastFinishTime = new Date();
        }

      const sortedScans = [...personalScans].sort((a, b) => new Date(a.date_ini!).valueOf() - new Date(b.date_ini!).valueOf());

      const dataToInsert = sortedScans.map((item) => {
        const startTime = lastFinishTime;
        let date_esti_str: string | null = null;
        
        if (!isNaN(startTime.getTime()) && item.esti_time) {
          const endDate = new Date(startTime.getTime() + item.esti_time * 60000);
          date_esti_str = endDate.toISOString();
          lastFinishTime = endDate; // Chain the next start time
        } else {
          lastFinishTime = startTime;
        }
        
        return {
          code: Number(item.code),
          name: item.personal,
          name_inc: item.encargado,
          sku: item.sku,
          product: item.product,
          quantity: item.quantity,
          status: 'ASIGNADO',
          organization: item.organization,
          sales_num: Number(item.venta),
          date: item.date,
          esti_time: item.esti_time,
          date_esti: date_esti_str,
          date_ini: startTime.toISOString(),
        };
      });

      const { error: insertError } = await supabase.from('personal').insert(dataToInsert);
      if (insertError) {
        console.error("Error en insert:", insertError);
        throw new Error(`Error al guardar en 'personal': ${insertError.message}`);
      }

      const salesNumbersToDelete = [...new Set(personalScans.map(item => item.venta).filter(Boolean))];

      if (salesNumbersToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('personal_prog')
          .delete()
          .in('sales_num', salesNumbersToDelete as (string | number)[]);
        
        if (deleteError) {
          console.error("Error en delete:", deleteError);
          showAppMessage(`Registros guardados, pero hubo un error al limpiar 'personal_prog': ${deleteError.message}`, 'info');
        }
      }
      
      showAppMessage('Registros guardados y programación limpiada exitosamente.', 'success');
      setPersonalScans([]);

    } catch (error: any) {
      console.error("Error en handleSavePersonal:", error);
      showAppMessage(`Error al procesar: ${error.message}`, 'duplicate');
    } finally {
      setLoading(false);
    }
  };

  const handleClearPersonalAsignado = () => {
    if (window.confirm('¿Estás seguro de que quieres limpiar la lista de personal asignado?')) {
        setPersonalScans([]);
        showAppMessage('La lista de personal asignado ha sido limpiada.', 'info');
    }
  };

 const handleProduccionProgramada = async () => {
    if (scannedData.length === 0) {
      showAppMessage('No hay registros pendientes para programar.', 'info');
      return;
    }
    if (!selectedPersonal) {
      showAppMessage('Por favor, selecciona un miembro del personal.', 'duplicate');
      return;
    }
    if (scannedData.some(item => item.esti_time === null || item.esti_time === undefined)) {
      showAppMessage('Por favor, completa todos los campos de "Tiempo Estimado" antes de programar.', 'duplicate');
      return;
    }
    setLoading(true);
    showAppMessage('Guardando producción programada...', 'info');

    try {
      const dataToInsert = scannedData.map(item => ({
        code: Number(item.code),
        sku: item.sku,
        name: selectedPersonal,
        name_inc: item.encargado,
        product: item.producto,
        quantity: item.cantidad,
        organization: item.empresa,
        sales_num: Number(item.venta),
        date: new Date().toISOString(),
        esti_time: item.esti_time,
        status: 'PROGRAMADO',
        date_ini: null,
        date_esti: null,
      }));

      const { error } = await supabase.from('personal_prog').insert(dataToInsert);
      if (error) throw error;

      showAppMessage(`¡Éxito! Se guardaron ${scannedData.length} registros en producción programada.`, 'success');
      setScannedData([]);
      scannedCodesRef.current.clear();
      setMelCodesCount(0);
      setOtherCodesCount(0);
      setSelectedPersonal('');

    } catch (error: any) {
      console.error("Error al guardar producción programada:", error);
      showAppMessage(`Error al guardar: ${error.message}`, 'duplicate');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCargarModal = async () => {
    setIsCargarModalOpen(true);
    setLoadingProgramadosPersonal(true);
    try {
        const { data, error } = await supabase
            .from('personal_prog')
            .select('name');

        if (error) throw error;

        // Get unique names
        const uniqueNames = [...new Map(data.map(item => [item.name, item])).values()];
        setProgramadosPersonalList(uniqueNames);

    } catch (error: any) {
        showAppMessage('Error al cargar la lista de personal programado.', 'duplicate');
    } finally {
        setLoadingProgramadosPersonal(false);
    }
};

  const handleCargarProgramada = async () => {
      if (!selectedPersonalParaCargar) {
        showAppMessage('Por favor, selecciona una persona para cargar su producción.', 'info');
        return;
    }
    setLoading(true);
    showAppMessage('Cargando producción programada...', 'info');

    try {
      const { data, error } = await supabase
        .from('personal_prog')
        .select('*')
        .eq('name', selectedPersonalParaCargar);

      if (error) throw error;

      if (data.length === 0) {
        showAppMessage('No hay producción programada para cargar para esta persona.', 'info');
        setLoading(false);
        return;
      }
      
      let lastFinishTime: Date;
      const loadedScans = data.sort((a,b) => new Date(a.date).valueOf() - new Date(b.date).valueOf())
        .map((item, index) => {
          let startTime: Date;
          if (index === 0) {
            startTime = new Date(); // La primera tarea inicia ahora
          } else {
            startTime = lastFinishTime; // Las siguientes inician cuando termina la anterior
          }

          let date_esti: string | null = null;
          if (!isNaN(startTime.getTime()) && item.esti_time) {
            const endDate = new Date(startTime.getTime() + item.esti_time * 60000);
            date_esti = endDate.toISOString();
            lastFinishTime = endDate;
          } else {
            lastFinishTime = startTime;
          }
          
          return {
            ...item,
            date_ini: startTime.toISOString(),
            date_esti: date_esti,
          };
      });

      // Mapeo para que coincida con PersonalScanItem
      const newPersonalScans = loadedScans.map(item => ({
        code: item.code,
        sku: item.sku,
        personal: item.name,
        encargado: item.name_inc,
        product: item.product,
        quantity: item.quantity,
        organization: item.organization,
        venta: item.sales_num,
        date: item.date,
        esti_time: item.esti_time,
        date_esti: item.date_esti,
        date_ini: item.date_ini,
      }));


      setPersonalScans(prev => [...prev, ...newPersonalScans].sort((a, b) => new Date(a.date_ini!).valueOf() - new Date(b.date_ini!).valueOf()));

      showAppMessage(`Se cargaron ${data.length} registros programados para ${selectedPersonalParaCargar}.`, 'success');
      setIsCargarModalOpen(false);
      setSelectedPersonalParaCargar('');

    } catch (error: any) {
      console.error("Error al cargar producción programada:", error);
      showAppMessage(`Error al cargar: ${error.message}`, 'duplicate');
    } finally {
      setLoading(false);
    }
  };

  const handlePersonalChange = (code: string | number, newPersonal: string) => {
    setPersonalScans(prevScans => 
        prevScans.map(scan => 
            scan.code === code ? { ...scan, personal: newPersonal } : scan
        )
    );
    showAppMessage(`Se actualizó el personal para el código ${code}.`, 'info');
  };
  
  const handleBulkPersonalChange = () => {
    if (!selectedBulkPersonal) {
        showAppMessage('Por favor, selecciona una persona para el cambio masivo.', 'info');
        return;
    }
    if (personalScans.length === 0) {
        showAppMessage('No hay registros en la lista para cambiar.', 'info');
        return;
    }

    setPersonalScans(prevScans => 
        prevScans.map(scan => ({ ...scan, personal: selectedBulkPersonal }))
    );
    showAppMessage(`Todos los registros han sido asignados a ${selectedBulkPersonal}.`, 'success');
    setSelectedBulkPersonal('');
  };


  const messageClasses: any = {
      success: 'scan-success',
      duplicate: 'scan-duplicate',
      info: 'scan-info'
  };
  
  const isAssociationDisabled = scannedData.length > 0 && scannedData.some(item => item.esti_time === null || item.esti_time === undefined);

  const totalEstimatedTime = useMemo(() => {
    return scannedData.reduce((acc, item) => acc + (item.esti_time || 0), 0);
  }, [scannedData]);

  const totalPersonalEstimatedTime = useMemo(() => {
    return personalScans.reduce((acc, item) => acc + (item.esti_time || 0), 0);
  }, [personalScans]);

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
    const sortedData = [...scannedData].sort((a, b) => new Date(`1970/01/01 ${a.hora}`).valueOf() - new Date(`1970/01/01 ${b.hora}`).valueOf());
    let lastFinishTime: Date | null = null;
    
    return sortedData.map((data: ScannedItem, index: number) => {
        let startTime: Date;
        if (index === 0) {
            startTime = currentTime;
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
                <button className="delete-btn text-red-500 hover:text-red-700 font-semibold text-xs" onClick={() => deleteRow(data.code)}>Borrar</button>
            </td>
        </tr>
      );
    })
  };

  const renderPersonalScans = () => {
    const sortedScans = [...personalScans].sort((a, b) => new Date(a.date_ini!).valueOf() - new Date(b.date_ini!).valueOf());
    let lastFinishTime: Date | null = null;

    return sortedScans.map((data, index) => {
        let horaInicio: Date;
        if (index === 0 && sortedScans.length > 0) {
            horaInicio = currentTime; // The first task's start time is now (real-time)
        } else if (lastFinishTime) {
            horaInicio = lastFinishTime; // Subsequent tasks start when the previous one ends
        } else {
            horaInicio = new Date(data.date_ini!); // Fallback to stored time
        }

        let horaFin: Date | null = null;
        if (!isNaN(horaInicio.getTime()) && data.esti_time) {
            horaFin = new Date(horaInicio.getTime() + data.esti_time * 60000);
        }
        
        lastFinishTime = horaFin || horaInicio;

        const horaInicioStr = !isNaN(horaInicio.getTime()) 
            ? horaInicio.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
            : 'N/A';
        const horaFinStr = horaFin
            ? horaFin.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
            : 'N/A';

        return (
            <tr key={`${data.code}-${index}`}>
                <td className="px-4 py-3 whitespace-nowrap font-mono text-sm">{data.code}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <Combobox
                        options={personalList.map(p => ({ value: p.name, label: p.name }))}
                        value={data.personal}
                        onValueChange={(newPersonal) => handlePersonalChange(data.code, newPersonal)}
                        placeholder="Selecciona personal..."
                        emptyMessage="No se encontró personal."
                        buttonClassName="bg-transparent border-0 hover:bg-gray-100"
                    />
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm">{data.product}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm">{horaInicioStr}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm">{horaFinStr}</td>
            </tr>
        );
    });
};


  return (
    <>
        <Head>
            <title>Asignar Empaquetado</title>
        </Head>

        <main className="text-starbucks-dark flex items-center justify-center p-4">
            <div className="w-full max-w-4xl mx-auto bg-starbucks-white rounded-xl shadow-2xl p-4 md:p-6 space-y-4">
                <header className="text-center">
                    <Image src="https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExbnQ4MGZzdXYzYWo1cXRiM3I1cjNoNjd4cjdia202ZXcwNjJ6YjdvbiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/QQO6BH98nhigF8FLsb/giphy.gif" alt="Scanner Logo" width={80} height={80} className="mx-auto h-20 w-auto mb-2" unoptimized={true} />
                    <h1 className="text-xl md:text-2xl font-bold text-starbucks-green">Asignar Empaquetado</h1>
                    <p className="text-gray-600 text-sm md:text-base mt-1">Asigna un producto a un miembro del personal.</p>
                </header>

                {dbError && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Error de Base de Datos</AlertTitle>
                        <AlertDescription>{dbError}</AlertDescription>
                    </Alert>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="encargado" className="block text-sm font-bold text-starbucks-dark mb-1">Nombre del Encargado:</label>
                            <Select onValueChange={setEncargado} value={encargado} disabled={scannerActive}>
                                <SelectTrigger className="bg-transparent hover:bg-gray-50 border border-input">
                                    <SelectValue placeholder="Selecciona un encargado" />
                                </SelectTrigger>
                                <SelectContent>
                                    {encargadosList.map((enc) => (
                                        <SelectItem key={enc.name} value={enc.name}>
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
                    </div>

                    <div className="bg-starbucks-cream p-4 rounded-lg">
                        <div className="scanner-container relative">
                            <div id="reader" ref={readerRef} style={{ display: selectedScannerMode === 'camara' && scannerActive ? 'block' : 'none' }}></div>
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
                    <div id="message" className={`p-3 rounded-lg text-center font-semibold text-base transition-all duration-300 ${messageClasses[message.type]}`}>
                        {message.text}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-starbucks-cream p-2 rounded-lg">
                            <h3 className="font-bold text-starbucks-dark uppercase text-xs">Total</h3>
                            <p id="total-scans" className="text-2xl font-mono text-starbucks-green">{melCodesCount + otherCodesCount}</p>
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

                    <div>
                        <div className="flex flex-wrap justify-between items-center mb-2 gap-4">
                           <h2 className="text-lg font-bold text-starbucks-dark">Personal Asignado</h2>
                            <div className="flex gap-2 items-center">
                                <Dialog open={isCargarModalOpen} onOpenChange={setIsCargarModalOpen}>
                                    <DialogTrigger asChild>
                                        <Button onClick={handleOpenCargarModal} className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg shadow-sm text-sm transition-colors duration-200" disabled={loading}>
                                            Cargar
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Cargar Producción Programada</DialogTitle>
                                            <DialogDescription>
                                                Selecciona el personal del cual quieres cargar la producción que fue previamente programada.
                                            </DialogDescription>
                                        </DialogHeader>
                                        {loadingProgramadosPersonal ? <p>Cargando personal...</p> :
                                            <Select onValueChange={setSelectedPersonalParaCargar} value={selectedPersonalParaCargar}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecciona una persona" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {programadosPersonalList.map((p) => (
                                                        <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        }
                                        <DialogFooter>
                                            <Button onClick={handleCargarProgramada} disabled={loading || !selectedPersonalParaCargar}>
                                                {loading ? 'Cargando...' : 'Cargar Producción'}
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                                <Button onClick={handleSavePersonal} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm text-sm transition-colors duration-200" disabled={loading}>
                                    Guardar
                                </Button>
                                <Button onClick={handleClearPersonalAsignado} variant="destructive" className="px-4 py-2 font-semibold rounded-lg shadow-sm text-sm transition-colors duration-200" disabled={loading}>
                                    Limpiar
                                </Button>
                            </div>
                        </div>

                         <div className="p-4 bg-gray-100 rounded-lg mb-4 space-y-2 md:space-y-0 md:flex md:items-center md:justify-between md:gap-4">
                            <label className="block text-sm font-bold text-starbucks-dark">Cambiar todos a:</label>
                            <div className="flex-grow md:max-w-xs">
                                <Combobox
                                    options={personalList.map(p => ({ value: p.name, label: p.name }))}
                                    value={selectedBulkPersonal}
                                    onValueChange={setSelectedBulkPersonal}
                                    placeholder="Selecciona personal..."
                                    emptyMessage="No se encontró personal."
                                    buttonClassName="bg-transparent border-input hover:bg-gray-100"
                                />
                            </div>
                            <Button onClick={handleBulkPersonalChange} disabled={!selectedBulkPersonal || personalScans.length === 0} className="w-full md:w-auto bg-teal-600 hover:bg-teal-700 text-white">
                                Cambiar Todos
                            </Button>
                        </div>
                        
                        {totalPersonalEstimatedTime > 0 && (
                            <div className="mb-4 p-3 bg-blue-100 border border-blue-300 rounded-lg text-center">
                                <p className="font-semibold text-blue-800 flex items-center justify-center gap-2">
                                    <Clock className="h-5 w-5"/>
                                    Tiempo Total Asignado: <span className="font-bold">{formatTotalTime(totalPersonalEstimatedTime)}</span>
                                </p>
                            </div>
                        )}
                        <div className="table-container border border-gray-200 rounded-lg">
                            <table className="w-full min-w-full divide-y divide-gray-200">
                                <thead className="bg-starbucks-cream sticky top-0 z-10">
                                    <tr>
                                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">Codigo</th>
                                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">Personal</th>
                                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">Producto</th>
                                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">Hora Inicio</th>
                                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">Hora Fin</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-starbucks-white divide-y divide-gray-200">
                                    {renderPersonalScans()}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div>
                        <div className="flex flex-wrap justify-between items-center mb-2 gap-2">
                            <h2 className="text-lg font-bold text-starbucks-dark">Registros Pendientes</h2>
                            <div className="flex flex-wrap gap-2">
                                <button id="export-csv" onClick={exportCsv} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow-sm text-xs transition-colors duration-200">1. Exportar</button>
                                <button id="ingresar-datos" onClick={ingresarDatos} disabled={!ingresarDatosEnabled} className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white font-semibold rounded-lg shadow-sm text-xs transition-colors duration-200 disabled:bg-gray-400">2. Ingresar</button>
                                <button id="clear-data" onClick={() => { if(window.confirm('¿Estás seguro?')) clearSessionData() }} className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-lg shadow-sm text-xs transition-colors duration-200">Limpiar</button>
                            </div>
                        </div>

                        <div className="p-4 bg-starbucks-cream rounded-lg mt-4 space-y-2">
                            <label className="block text-sm font-bold text-starbucks-dark">Asociar Pendientes a Personal:</label>
                            <div className="flex gap-2">
                                <Combobox
                                    options={personalList.map(p => ({ value: p.name, label: p.name }))}
                                    value={selectedPersonal}
                                    onValueChange={setSelectedPersonal}
                                    placeholder="Selecciona o busca personal..."
                                    emptyMessage="No se encontró personal."
                                    buttonClassName="bg-transparent border-input"
                                />
                                <Button onClick={handleManualAssociate} disabled={isAssociationDisabled} className="bg-starbucks-accent hover:bg-starbucks-green text-white">
                                    <UserPlus className="mr-2 h-4 w-4" /> Asociar
                                </Button>
                                 <Button onClick={handleProduccionProgramada} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm text-sm transition-colors duration-200" disabled={loading || isAssociationDisabled}>
                                    Producción Programada
                                 </Button>
                            </div>
                             {isAssociationDisabled && (
                                <p className="text-xs text-red-600">Completa todos los campos de "Tiempo Estimado" para poder asociar.</p>
                            )}
                        </div>

                        {totalEstimatedTime > 0 && (
                            <div className="mt-4 p-3 bg-blue-100 border border-blue-300 rounded-lg text-center">
                                <p className="font-semibold text-blue-800 flex items-center justify-center gap-2">
                                    <Clock className="h-5 w-5"/>
                                    Tiempo Total Asignado: <span className="font-bold">{formatTotalTime(totalEstimatedTime)}</span>
                                </p>
                            </div>
                        )}

                        <div className="table-container border border-gray-200 rounded-lg mt-4">
                            <table className="w-full min-w-full divide-y divide-gray-200">
                                <thead className="bg-starbucks-cream sticky top-0 z-10">
                                    <tr>
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
                </div>
            </div>

            {loading && <div id="loading-overlay" style={{display: 'flex'}}>
                <div className="overlay-spinner"></div>
                <p className="text-lg font-semibold">Enviando registros...</p>
            </div>}
            
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

