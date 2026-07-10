'use client';
import {useEffect, useRef, useState, useCallback, useMemo} from 'react';
import Head from 'next/head';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { supabaseEtiquetas } from '@/lib/supabaseClient';
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { Label } from "@/components/ui/label";
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
  PackageSearch,
  Loader2,
  Hash,
  Barcode,
  Sparkles,
  HelpCircle,
  Building2,
  Tag,
  Layers,
  ShieldAlert
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
import { useAuth } from '@/components/AuthProvider';
import { cn, getCameraCapabilitiesWithRetry } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type ReturnItem = {
  code: string;
  sales_num: string | number | null;
  scannedAt: string;
  isManual?: boolean;
  isNewInDev?: boolean;
  isUnknown?: boolean;
  sku?: string | null;
  subcategoria?: string | null;
  product?: string | null;
  organization?: string | null;
};

const STORAGE_KEY = 'devoluciones_session_data';

export default function DevolucionesPage() {
  const { profile, user } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  const [message, setMessage] = useState({ text: 'Apunte la cámara a un código QR.', type: 'info' as 'info' | 'success' | 'error' | 'warning', show: false });
  const [scannerActive, setScannerActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedScannerMode, setSelectedScannerMode] = useState<'camara' | 'fisico'>('camara');
  const [encargado, setEncargado] = useState('');
  const [cameraCapabilities, setCameraCapabilities] = useState<any>(null);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const isMobile = useIsMobile();
  const [showNotification, setShowNotification] = useState(false);
  const [notification, setNotification] = useState({ title: '', message: '', variant: 'default' as 'default' | 'destructive' | 'success' });

  // Batch states
  const [returnsList, setReturnsList] = useState<ReturnItem[]>([]);
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [isIntegrityWarningOpen, setIsWarningModalOpen] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [driverPlate, setDriverPlate] = useState('');

  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const lastScanTimeRef = useRef(Date.now());
  const physicalScannerInputRef = useRef<HTMLInputElement | null>(null);
  const bufferRef = useRef('');
  const scannedCodesSetRef = useRef(new Set<string>());
  // Refleja `loading` sin ser dependencia reactiva de processCode/onScanSuccess:
  // si estuviera en sus deps, su identidad cambiaría en cada escaneo y
  // reiniciaría el efecto que arranca/detiene la cámara, apagando flash/zoom.
  const loadingRef = useRef(false);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

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
    
    // Recuperar datos de LocalStorage
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (Array.isArray(parsed)) {
          setReturnsList(parsed);
          parsed.forEach((item: ReturnItem) => scannedCodesSetRef.current.add(item.code));
        }
      } catch (e) {
        console.error("Error al recuperar sesión de devoluciones:", e);
      }
    }
  }, []);

  // Guardar en LocalStorage cada vez que cambie la lista
  useEffect(() => {
    if (isMounted) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(returnsList));
    }
  }, [returnsList, isMounted]);

  useEffect(() => {
    if (!user?.email) return;

    const fetchNameFromEmployees = async () => {
        try {
            const { data, error } = await supabaseEtiquetas
                .from('empleados')
                .select('nombres, apellido_paterno, apellido_materno')
                .eq('email', user.email)
                .maybeSingle();

            if (data) {
                const fullName = [data.nombres, data.apellido_paterno, data.apellido_materno].filter(Boolean).join(' ').toUpperCase();
                setEncargado(fullName);
            } else if (profile?.name) {
                setEncargado(profile.name.toUpperCase());
            }
        } catch (err) {
            console.error("Error fetching name for devoluciones encargado:", err);
        }
    };

    fetchNameFromEmployees();
  }, [user, profile]);

  const groupedEncargadoOptions = useMemo(() => {
    let list = [];
    if (encargado) {
        list.push({ name: encargado, organization: 'Usuario Actual' });
    }
    if (list.length === 0) return [];
    
    const grouped = list.reduce((acc, person) => {
        const org = person.organization || 'Sin Empresa';
        if (!acc[org]) acc[org] = [];
        acc[org].push({ value: person.name, label: person.name });
        return acc;
    }, {} as Record<string, { value: string; label: string }[]>);

    return Object.keys(grouped).sort().map(org => ({
        label: org,
        options: grouped[org].sort((a, b) => a.label.localeCompare(b.label))
    }));
  }, [encargado]);

  const playBeep = () => {
    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
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

  const processCode = useCallback(async (inputValue: string, searchType: 'any' | 'sales_num' | 'pack_id' = 'any') => {
    if (loadingRef.current) return;
    
    let finalInput = inputValue.trim();
    if (!finalInput) return;

    // Lógica para QR con JSON (Extraer ID si existe)
    try {
        const parsed = JSON.parse(finalInput);
        if (parsed && (parsed.id || parsed.ID)) {
            finalInput = String(parsed.id || parsed.ID);
        }
    } catch (e) {}

    setLoading(true);
    showAppMessage('Validando...', 'info');

    try {
        // PASO 1: Buscar en etiquetas_i para obtener No. Venta, Pack ID, SKU y Empresa
        let query = supabaseEtiquetas.from('etiquetas_i').select('sales_num, pack_id, code, sku, product, organization');
        
        if (searchType === 'sales_num') {
            query = query.eq('sales_num', finalInput);
        } else if (searchType === 'pack_id') {
            query = query.eq('pack_id', finalInput);
        } else {
            query = query.or(`code.eq."${finalInput}",pack_id.eq."${finalInput}",sales_num.eq."${finalInput}"`);
        }

        let { data: tagData, error: tagError } = await query.limit(1).maybeSingle();

        // VALIDACIÓN EXTRA SILENCIOSA: Fallback Venta -> Pack ID
        if (!tagData && searchType === 'sales_num') {
            const { data: fallbackTagData } = await supabaseEtiquetas
                .from('etiquetas_i')
                .select('sales_num, pack_id, code, sku, product, organization')
                .eq('pack_id', finalInput)
                .limit(1)
                .maybeSingle();
            if (fallbackTagData) tagData = fallbackTagData;
        }

        if (tagError) throw tagError;

        const sales_num = tagData?.sales_num || null;
        const pack_id = tagData?.pack_id || null;
        const realCode = tagData?.code || finalInput;

        if (scannedCodesSetRef.current.has(realCode)) {
            playWarningSound();
            showAppMessage(`Ya en la lista: ${realCode}`, 'warning');
            setLoading(false);
            return;
        }

        // PASO 2: Buscar en devoluciones_ml para ver si ya se entregó
        // Buscamos por num_venta (si lo tenemos), por el input original o por el código real (si lo tenemos)
        const orFilters = [];
        if (sales_num) orFilters.push(`num_venta.eq."${sales_num}"`);
        if (pack_id) orFilters.push(`num_venta.eq."${pack_id}"`);
        orFilters.push(`num_venta.eq."${finalInput}"`);
        orFilters.push(`code.eq."${finalInput}"`);
        orFilters.push(`code.eq."${realCode}"`);

        const { data: devRecords, error: devError } = await supabaseEtiquetas
            .from('devoluciones_ml')
            .select('entregado, num_venta, code')
            .or(orFilters.join(','));

        if (devError) throw devError;

        if (devRecords && devRecords.length > 0) {
            const alreadyDelivered = devRecords.find(r => r.entregado);
            if (alreadyDelivered) {
                playWarningSound();
                showModalNotification(
                    'Ya Entregado', 
                    `Esta devolución (${alreadyDelivered.num_venta || alreadyDelivered.code}) ya fue marcada como entregada anteriormente.`, 
                    'warning'
                );
                setLoading(false);
                return;
            }
        }

        const devData = devRecords && devRecords.length > 0 ? devRecords[0] : null;

        // Búsqueda de Subcategoría (Cruce sku_alterno -> sku_m)
        let subcategoria = '---';
        if (tagData?.sku) {
            try {
                const skusToProcess = String(tagData.sku).split(' | ');
                const foundSubcats: string[] = [];
                for (const singleSku of skusToProcess) {
                    const cleanSku = singleSku.trim();
                    const { data: altData } = await supabaseEtiquetas.from('sku_alterno').select('sku_mdr').eq('sku', cleanSku).maybeSingle();
                    if (altData?.sku_mdr) {
                        const { data: mData } = await supabaseEtiquetas.from('sku_m').select('sub_cat').eq('sku_mdr', altData.sku_mdr).maybeSingle();
                        if (mData?.sub_cat) foundSubcats.push(mData.sub_cat);
                        else foundSubcats.push(cleanSku);
                    } else {
                        foundSubcats.push(cleanSku);
                    }
                }
                subcategoria = Array.from(new Set(foundSubcats)).join(' | ');
            } catch (e) {}
        }

        // Éxito: Añadir a la lista
        playBeep();
        if ('vibrate' in navigator) navigator.vibrate(100);
        
        const newItem: ReturnItem = {
            code: realCode,
            sales_num: devData ? devData.num_venta : (sales_num || pack_id || (tagData ? null : null)),
            scannedAt: new Date().toLocaleTimeString(),
            isManual: searchType !== 'any',
            isNewInDev: !devData,
            isUnknown: !tagData,
            sku: tagData?.sku || '---',
            subcategoria: subcategoria,
            product: tagData?.product || '---',
            organization: tagData?.organization || '---'
        };

        setReturnsList(prev => [newItem, ...prev]);
        scannedCodesSetRef.current.add(realCode);
        
        if (!tagData) showAppMessage(`Añadido (Sin registro previo): ${newItem.code}`, 'warning');
        else showAppMessage(`Añadido: ${newItem.code}`, 'success');

    } catch (err: any) {
        playWarningSound();
        showModalNotification('Error de Sistema', err.message || 'Error al procesar el código.', 'destructive');
    } finally {
        setLoading(false);
    }
  }, []);

  const onScanSuccess = useCallback((decodedText: string) => {
    if (loadingRef.current || Date.now() - lastScanTimeRef.current < MIN_SCAN_INTERVAL) return;
    lastScanTimeRef.current = Date.now();
    processCode(decodedText, 'any');
  }, [processCode]);
  
  const handleManualCodeAdd = () => {
    const input = document.getElementById('manual-code-input-devoluciones') as HTMLInputElement;
    if (input.value.trim()) {
        processCode(input.value.trim(), 'any');
        input.value = '';
    }
  };

  const handleManualSalesNumAdd = () => {
    const input = document.getElementById('manual-sales-input') as HTMLInputElement;
    if (input.value.trim()) {
        processCode(input.value.trim(), 'sales_num');
        input.value = '';
    }
  };

  const handleManualPackIdAdd = () => {
    const input = document.getElementById('manual-pack-input') as HTMLInputElement;
    if (input.value.trim()) {
        processCode(input.value.trim(), 'pack_id');
        input.value = '';
    }
  };

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
      const hasUnknown = returnsList.some(item => item.isUnknown);
      if (hasUnknown) setIsWarningModalOpen(true);
      else setIsFinalizeModalOpen(true);
  };

  const handleFinalizeReturns = async () => {
      if (!driverName.trim() || !driverPlate.trim()) {
          alert("Por favor, ingresa el nombre del conductor y las placas.");
          return;
      }
      setLoading(true);
      const codes = returnsList.map(item => item.code);
      const existingReturns = returnsList.filter(i => !i.isNewInDev);
      const newReturns = returnsList.filter(i => i.isNewInDev);

      try {
          if (existingReturns.length > 0) {
              const updatePromises = existingReturns.map(item => 
                  supabaseEtiquetas
                    .from('devoluciones_ml')
                    .update({ 
                        entregado: true, 
                        name_inc: user?.id, 
                        driver_name: driverName,
                        driver_plate: driverPlate,
                        date_entregado: new Date().toISOString(),
                        code: item.code,
                        registro: !item.isUnknown
                    })
                    .eq('num_venta', String(item.sales_num))
              );
              await Promise.all(updatePromises);
          }

          if (newReturns.length > 0) {
              const insertData = newReturns.map(item => ({
                  num_venta: item.isUnknown ? null : (item.sales_num ? String(item.sales_num) : null),
                  entregado: true,
                  name_inc: user?.id, 
                  driver_name: driverName,
                  driver_plate: driverPlate,
                  date_entregado: new Date().toISOString(),
                  sku: item.sku,
                  tienda: item.organization,
                  code: item.code,
                  registro: !item.isUnknown
              }));
              const { error: errorIns } = await supabaseEtiquetas.from('devoluciones_ml').insert(insertData);
              if (errorIns) throw errorIns;
          }

          await supabaseEtiquetas.from('personal').update({ status: 'DEVUELTO' }).in('code', codes);
          playBeep();
          showModalNotification('¡Éxito!', `Se procesaron ${codes.length} devoluciones correctamente.`, 'success');
          setReturnsList([]);
          scannedCodesSetRef.current.clear();
          localStorage.removeItem(STORAGE_KEY);
          setDriverName(''); setDriverPlate('');
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
        } else if (event.key.length === 1) bufferRef.current += event.key;
    };
    const input = physicalScannerInputRef.current;
    if (selectedScannerMode === 'fisico' && scannerActive && input) {
        input.addEventListener('keydown', handlePhysicalScannerInput);
        input.focus();
    }
    return () => { if (input) input.removeEventListener('keydown', handlePhysicalScannerInput); };
  }, [scannerActive, selectedScannerMode, onScanSuccess]);

  useEffect(() => {
    if (!isMounted || !readerRef.current) return;
    if (!html5QrCodeRef.current) html5QrCodeRef.current = new Html5Qrcode(readerRef.current.id, false);
    const qrCode = html5QrCodeRef.current;
    // El resultado de getCameraCapabilitiesWithRetry puede tardar hasta ~1.5s;
    // si el usuario detiene (o reinicia) la cámara antes de que resuelva, esa
    // promesa vieja no debe pisar el estado con datos de un track ya muerto.
    let cancelled = false;
    const cleanup = () => {
        cancelled = true;
        if (qrCode && qrCode.isScanning) {
            return qrCode.stop().catch(err => { if (!String(err).includes('not started')) console.error(err); }).finally(() => {
              if (isMobile) { setCameraCapabilities(null); setIsFlashOn(false); setZoom(1); }
            });
        }
        return Promise.resolve();
    };
    if (scannerActive && selectedScannerMode === 'camara') {
      if (qrCode.getState() !== Html5QrcodeScannerState.SCANNING) {
        qrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, onScanSuccess, () => {})
        .then(() => {
            if (isMobile) {
              const videoElement = readerRef.current?.querySelector('video');
              const track = (videoElement?.srcObject as MediaStream)?.getVideoTracks()[0];
              if (track) getCameraCapabilitiesWithRetry(track).then(caps => { if (!cancelled) setCameraCapabilities(caps); });
            }
        }).catch(err => { console.error(err); setScannerActive(false); });
      }
    } else cleanup();
    return () => { cleanup(); };
  }, [scannerActive, selectedScannerMode, isMobile, isMounted, onScanSuccess]);

  const messageClasses: any = { success: 'bg-green-500/80 text-white', error: 'bg-red-500/80 text-white', warning: 'bg-yellow-500/80 text-white', info: 'bg-blue-500/80 text-white' };

  return (
    <>
      <Head><title>Módulo de Devoluciones</title></Head>
      <main className="text-starbucks-dark flex items-center justify-center p-2 md:p-4">
        <div className="w-full max-w-7xl mx-auto bg-starbucks-white rounded-xl shadow-2xl p-4 md:p-6 space-y-6">
          <header className="text-center">
            <div className="inline-block p-3 bg-starbucks-cream rounded-full mb-2">
                <Undo2 className="h-8 w-8 text-starbucks-green" />
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-starbucks-green">Módulo de Devoluciones</h1>
            <p className="text-gray-600 text-sm mt-1">Gestión avanzada con persistencia y validación de entrega.</p>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-1 space-y-4">
                  <div className="p-4 bg-gray-50 border rounded-lg">
                      <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2 block">Identidad Operativa</Label>
                       <Combobox
                          groupedOptions={groupedEncargadoOptions}
                          value={isMounted ? encargado : ''}
                          onValueChange={setEncargado}
                          placeholder="Selecciona encargado..."
                          disabled={true}
                      />
                  </div>
                  <div className="space-y-4 p-4 border rounded-lg bg-starbucks-cream/30">
                      <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest block text-center">Ingreso Manual</Label>
                      <div className="space-y-2">
                          <Label className="text-[9px] font-bold text-gray-500 uppercase">Cód. Barra / ID Bulto</Label>
                          <div className="flex gap-1">
                              <Input id="manual-code-input-devoluciones" placeholder="4000..." className="h-9 text-xs font-mono" onKeyDown={(e) => e.key === 'Enter' && handleManualCodeAdd()} />
                              <Button size="icon" className="h-9 w-9 bg-starbucks-green" onClick={handleManualCodeAdd}><Barcode className="h-4 w-4" /></Button>
                          </div>
                      </div>
                      <div className="space-y-2">
                          <Label className="text-[9px] font-bold text-gray-500 uppercase">Número de Venta</Label>
                          <div className="flex gap-1">
                              <Input id="manual-sales-input" placeholder="2000..." className="h-9 text-xs font-mono" onKeyDown={(e) => e.key === 'Enter' && handleManualSalesNumAdd()} />
                              <Button size="icon" className="h-9 w-9 bg-starbucks-accent" onClick={handleManualSalesNumAdd}><Hash className="h-4 w-4" /></Button>
                          </div>
                      </div>
                      <div className="space-y-2">
                          <Label className="text-[9px] font-bold text-gray-500 uppercase">Pack ID</Label>
                          <div className="flex gap-1">
                              <Input id="manual-pack-input" placeholder="1000..." className="h-9 text-xs font-mono" onKeyDown={(e) => e.key === 'Enter' && handleManualPackIdAdd()} />
                              <Button size="icon" className="h-9 w-9 bg-blue-600" onClick={handleManualPackIdAdd}><PlusCircle className="h-4 w-4" /></Button>
                          </div>
                      </div>
                  </div>
              </div>

              <div className="lg:col-span-1 space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                      <Button variant={selectedScannerMode === 'camara' ? 'default' : 'outline'} onClick={() => setSelectedScannerMode('camara')} disabled={scannerActive} className="h-10 text-xs font-bold">CÁMARA</Button>
                      <Button variant={selectedScannerMode === 'fisico' ? 'default' : 'outline'} onClick={() => setSelectedScannerMode('fisico')} disabled={scannerActive} className="h-10 text-xs font-bold">USB / LASER</Button>
                  </div>
                  <div className="bg-starbucks-cream p-4 rounded-lg flex flex-col min-h-[300px]">
                    <div className="scanner-container relative flex-grow bg-black rounded-lg overflow-hidden flex items-center justify-center">
                        <div id="reader" ref={readerRef} className="w-full" style={{ display: selectedScannerMode === 'camara' && scannerActive ? 'block' : 'none' }}></div>
                        {message.show && <div className={`scanner-message z-20 ${messageClasses[message.type]}`}>{message.text}</div>}
                        {scannerActive && selectedScannerMode === 'camara' && <div id="laser-line" className="absolute top-1/2 left-0 w-full h-[2px] bg-red-500 shadow-[0_0_10px_red] z-10" />}
                        {!scannerActive && <p className="text-white/40 font-bold uppercase text-xs">Escáner Inactivo</p>}
                    </div>
                    <div className="mt-4 flex gap-2 justify-center">
                      <Button onClick={() => setScannerActive(true)} disabled={scannerActive || loading || !encargado} className="bg-blue-600 hover:bg-blue-700 h-10 px-8">Iniciar</Button>
                      <Button onClick={() => window.location.reload()} variant="destructive" className="h-10 px-8" disabled={!scannerActive}>Detener</Button>
                    </div>
                  </div>
              </div>

              <div className="lg:col-span-2 space-y-4">
                  <div className="flex justify-between items-center px-1">
                      <h2 className="text-sm font-black uppercase text-gray-500 flex items-center gap-2">
                          <PackageSearch className="h-4 w-4 text-starbucks-green" />
                          Escaneados ({returnsList.length})
                      </h2>
                      <Button onClick={handleOpenFinalizeModal} className="bg-starbucks-accent hover:bg-starbucks-green text-white font-black text-[10px] h-8 px-4" disabled={returnsList.length === 0}>
                        FINALIZAR ({returnsList.length})
                      </Button>
                  </div>
                  <div className="table-container border rounded-lg max-h-[500px] overflow-auto bg-white shadow-inner custom-scrollbar">
                      <Table className="min-w-[800px]">
                          <TableHeader className="sticky top-0 bg-gray-50 z-10">
                              <TableRow>
                                  <TableHead className="text-[9px] uppercase font-black">Referencia</TableHead>
                                  <TableHead className="text-[9px] uppercase font-black">Venta/Pack</TableHead>
                                  <TableHead className="text-[9px] uppercase font-black">SKU</TableHead>
                                  <TableHead className="text-[9px] uppercase font-black">Subcategoría</TableHead>
                                  <TableHead className="text-[9px] uppercase font-black">Empresa/Tienda</TableHead>
                                  <TableHead className="text-right"></TableHead>
                              </TableRow>
                          </TableHeader>
                          <TableBody>
                              {returnsList.length > 0 ? returnsList.map((item) => (
                                  <TableRow key={item.code} className={cn("group transition-colors", item.isUnknown ? "bg-orange-50 hover:bg-orange-100" : "hover:bg-gray-50")}>
                                      <TableCell className="py-2">
                                          <div className="flex flex-col">
                                              <span className="font-mono text-[10px] font-bold truncate max-w-[120px]">{item.code}</span>
                                              <div className="flex gap-1 mt-0.5">
                                                  {item.isManual && <span className="text-[7px] font-black text-amber-600 border border-amber-200 px-1 rounded-sm bg-amber-50">MANUAL</span>}
                                                  {item.isNewInDev && <span className="text-[7px] font-black text-green-600 border border-green-200 px-1 rounded-sm bg-green-50 flex items-center gap-0.5"><Sparkles className="h-2 w-2" /> NUEVO</span>}
                                                  {item.isUnknown && <span className="text-[7px] font-black text-red-600 border border-red-200 px-1 rounded-sm bg-red-50 flex items-center gap-0.5"><HelpCircle className="h-2 w-2" /> SIN REGISTRO</span>}
                                              </div>
                                          </div>
                                      </TableCell>
                                      <TableCell className="py-2"><span className="font-mono text-[10px] font-black text-starbucks-green">{item.sales_num || '---'}</span></TableCell>
                                      <TableCell className="py-2"><div className="flex items-center gap-1"><Tag className="h-2.5 w-2.5 text-gray-400" /><span className="text-[9px] font-bold text-gray-600">{item.sku}</span></div></TableCell>
                                      <TableCell className="py-2"><div className="flex items-center gap-1"><Layers className="h-2.5 w-2.5 text-amber-400" /><span className="text-[9px] font-black text-amber-700 uppercase">{item.subcategoria}</span></div></TableCell>
                                      <TableCell className="py-2"><div className="flex items-center gap-1"><Building2 className="h-2.5 w-2.5 text-gray-400" /><Badge variant="outline" className="text-[8px] font-black border-starbucks-green/30 text-starbucks-green py-0 h-4">{item.organization}</Badge></div></TableCell>
                                      <TableCell className="py-2 text-right"><Button variant="ghost" size="icon" onClick={() => removeFromList(item.code)} className="text-red-400 hover:text-red-600 h-7 w-7"><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
                                  </TableRow>
                              )) : <TableRow><TableCell colSpan={6} className="text-center text-gray-400 py-20 text-[10px] uppercase font-bold">Esperando registros...</TableCell></TableRow>}
                          </TableBody>
                      </Table>
                  </div>
              </div>
          </div>
        </div>
      </main>

      <Dialog open={isIntegrityWarningOpen} onOpenChange={setIsWarningModalOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl border-orange-200">
              <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-orange-600"><ShieldAlert className="h-6 w-6" /> Advertencia de Integridad</DialogTitle>
                  <DialogDescription className="font-bold text-gray-600">Se han detectado bultos que no existen en el sistema maestro.</DialogDescription>
              </DialogHeader>
              <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl space-y-3">
                  <p className="text-xs text-orange-800 leading-relaxed">Tienes <span className="font-black underline">{returnsList.filter(i => i.isUnknown).length} bulto(s)</span> marcados como <span className="font-bold">SIN REGISTRO</span>.</p>
                  <p className="text-[10px] text-orange-600 italic">Al continuar, se crearán registros nuevos basándose únicamente en el código escaneado.</p>
              </div>
              <DialogFooter className="flex flex-col sm:flex-row gap-2">
                  <Button variant="outline" onClick={() => setIsWarningModalOpen(false)} className="w-full sm:w-auto h-12 rounded-xl font-bold">REVISAR LISTA</Button>
                  <Button onClick={() => { setIsWarningModalOpen(false); setIsFinalizeModalOpen(true); }} className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700 text-white font-black h-12 px-8 rounded-xl shadow-lg shadow-orange-100">IGNORAR Y CONTINUAR</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      <Dialog open={isFinalizeModalOpen} onOpenChange={setIsFinalizeModalOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl">
              <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-starbucks-green"><Truck className="h-6 w-6" /> Finalizar Transporte</DialogTitle>
                  <DialogDescription>Se procesarán {returnsList.length} devoluciones.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                      <Label htmlFor="driver-name" className="text-xs font-black uppercase text-gray-400">Nombre del Conductor</Label>
                      <Input id="driver-name" value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Ej. Juan Pérez" className="h-12 rounded-xl font-bold uppercase" />
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="driver-plate" className="text-xs font-black uppercase text-gray-400">Placas del Vehículo</Label>
                      <Input id="driver-plate" value={driverPlate} onChange={(e) => setDriverPlate(e.target.value)} placeholder="Ej. ABC-1234" className="h-12 rounded-xl font-mono font-bold uppercase" />
                  </div>
              </div>
              <DialogFooter className="flex flex-col sm:flex-row gap-2">
                  <Button variant="outline" onClick={() => setIsFinalizeModalOpen(false)} className="w-full sm:w-auto h-12 rounded-xl font-bold">Cancelar</Button>
                  <Button onClick={handleFinalizeReturns} disabled={loading || !driverName.trim() || !driverPlate.trim()} className="w-full sm:w-auto bg-starbucks-green hover:bg-starbucks-dark text-white font-black h-12 px-8 rounded-xl shadow-lg shadow-starbucks-green/20 transition-all">
                      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'CONFIRMAR Y GUARDAR'}
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      {showNotification && (
          <div className="p-4 fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[100]" onClick={() => setShowNotification(false)}>
                <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 w-full max-w-[320px] text-center space-y-6 animate-in zoom-in duration-300" onClick={(e) => e.stopPropagation()}>
                  <div className={cn("p-4 rounded-3xl inline-block mx-auto", notification.variant === 'destructive' ? "bg-red-50 text-red-500" : notification.variant === 'success' ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600")}>
                      {notification.variant === 'destructive' ? <XCircle className="h-10 w-10" /> : notification.variant === 'success' ? <CheckCircle className="h-10 w-10"/> : <AlertTriangle className="h-10 w-10" />}
                  </div>
                  <div className="space-y-2">
                      <h3 className="text-xl font-black text-gray-900 tracking-tight">{notification.title}</h3>
                      <p className="text-xs text-gray-500 font-medium leading-relaxed">{notification.message}</p>
                  </div>
                  <Button onClick={() => setShowNotification(false)} className="w-full h-12 rounded-2xl bg-starbucks-green font-black text-xs tracking-widest shadow-lg shadow-starbucks-green/20">CERRAR</Button>
              </div>
          </div>
      )}
    </>
  );
}