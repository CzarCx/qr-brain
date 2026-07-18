'use client';
import {useEffect, useRef, useState, useCallback, useMemo} from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { supabaseEtiquetas } from '@/lib/supabaseClient';
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  tiendaAlreadySet?: boolean;
  // Plataforma que EMITIÓ la etiqueta (Mercado Libre, TikTok, Walmart…), distinta del
  // transportista que la trae de vuelta. Solo se captura en bultos sin registro previo.
  origen?: string | null;
};

const STORAGE_KEY = 'devoluciones_session_data';
const DRIVER_STORAGE_KEY = 'devoluciones_driver_data';

// Escáner nuevo (zxing-wasm) SOLO para esta pantalla. ssr:false porque usa cámara/WASM
// del navegador; nadie más lo importa, así que las otras pantallas siguen con html5-qrcode.
const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false });

// Respaldo del catálogo de paqueterías. La tabla `paqueterias` puede venir vacía —sin
// política de RLS que deje leerla, o sin filas todavía— y entonces el combo quedaba en
// blanco y bloqueaba TODO el flujo (no se puede iniciar el escáner sin paquetería). Con
// esto el operario nunca se queda sin opciones; cuando la tabla sí responde, esas mandan.
const PAQUETERIA_FALLBACK = ['FEDEX', 'ESTAFETA', 'DHL', 'PAQUETEXPRESS', 'MERCADO ENVÍOS', 'UPS', '99 MINUTOS', 'CORREOS DE MÉXICO'];

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
  const [notification, setNotification] = useState({ title: '', message: '', variant: 'default' as 'default' | 'destructive' | 'success' | 'warning' });
  // Tras finalizar hay que reabrir el modal de transporte, pero NO a la vez que el de
  // éxito: son dos modales encimados y el de Radix bloquea los clics del de éxito (no
  // dejaba cerrarlo). Se difiere: el de transporte abre al cerrar el de éxito.
  const [reopenDriverOnClose, setReopenDriverOnClose] = useState(false);

  // Batch states
  const [returnsList, setReturnsList] = useState<ReturnItem[]>([]);
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [isIntegrityWarningOpen, setIsWarningModalOpen] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [driverPlate, setDriverPlate] = useState('');
  const [paqueteria, setPaqueteria] = useState('');
  const [paqueteriaOptions, setPaqueteriaOptions] = useState<{ value: string; label: string }[]>([]);
  // Se pide antes de escanear (no al finalizar) y se persiste hasta que termine
  // todo el proceso de devoluciones, para sobrevivir un refresh a media sesión.
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);

  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track de video del escáner nuevo, para aplicar flash/zoom si algún día se cablean
  // (hoy no hay botones en esta pantalla; se conserva la plomería de capabilities).
  const trackRef = useRef<MediaStreamTrack | null>(null);
  // Dedup POR CÓDIGO (no por tiempo): guarda el último código y cuándo se procesó.
  const lastScanRef = useRef({ code: '', time: 0 });
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

   const showModalNotification = (title: string, message: string, variant: 'default' | 'destructive' | 'success' | 'warning' = 'default') => {
    setNotification({ title, message, variant });
    setShowNotification(true);
  };

  // Cierra el modal de notificación y, si venimos de finalizar, recién ahí abre el de
  // transporte para la siguiente vuelta (nunca los dos a la vez).
  const closeNotification = () => {
    setShowNotification(false);
    if (reopenDriverOnClose) { setReopenDriverOnClose(false); setIsDriverModalOpen(true); }
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

    // Recuperar datos del transporte (conductor/placas) para precargar el modal.
    // El modal SIEMPRE se abre al entrar a /devoluciones: si había datos guardados
    // solo sirven para precargar los campos y que baste con confirmar o editar.
    const savedDriver = localStorage.getItem(DRIVER_STORAGE_KEY);
    if (savedDriver) {
      try {
        const parsedDriver = JSON.parse(savedDriver);
        if (parsedDriver?.driverName && parsedDriver?.driverPlate && parsedDriver?.paqueteria) {
          setDriverName(parsedDriver.driverName);
          setDriverPlate(parsedDriver.driverPlate);
          setPaqueteria(parsedDriver.paqueteria);
        }
      } catch (e) {
        console.error("Error al recuperar datos del transporte:", e);
      }
    }
    setIsDriverModalOpen(true);
  }, []);

  // Guardar en LocalStorage cada vez que cambie la lista
  useEffect(() => {
    if (isMounted) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(returnsList));
    }
  }, [returnsList, isMounted]);

  // Guardar los datos del transporte hasta que termine el proceso completo de
  // devoluciones (se limpian recién cuando handleFinalizeReturns tiene éxito).
  useEffect(() => {
    if (isMounted && driverName.trim() && driverPlate.trim() && paqueteria.trim()) {
      localStorage.setItem(DRIVER_STORAGE_KEY, JSON.stringify({ driverName, driverPlate, paqueteria }));
    }
  }, [driverName, driverPlate, paqueteria, isMounted]);

  useEffect(() => {
    const fetchPaqueterias = async () => {
      const usarRespaldo = (motivo: string) => {
        console.warn(`[paqueterias] ${motivo}. Usando catálogo de respaldo del código.`);
        setPaqueteriaOptions(PAQUETERIA_FALLBACK.map(n => ({ value: n, label: n })));
      };

      const { data, error, count } = await supabaseEtiquetas.from('paqueterias').select('nombre', { count: 'exact' }).order('nombre');
      if (error) {
        // Antes esto solo mostraba un modal y dejaba el combo vacío, bloqueando el flujo.
        // Ahora se cae al respaldo para que el operario pueda seguir trabajando.
        console.error('Error al cargar paqueterías:', error);
        usarRespaldo(`error de consulta: ${error.message} (código: ${error.code})`);
        return;
      }
      if (!data || data.length === 0) {
        // 0 filas sin error = casi siempre RLS sin política de lectura para el rol de la
        // app (la tabla probablemente sí tiene datos). Ver docs/paqueterias_rls.sql.
        usarRespaldo(`la consulta regresó 0 filas (count: ${count})`);
        return;
      }
      setPaqueteriaOptions(data.map(p => ({ value: p.nombre, label: p.nombre })));
    };
    fetchPaqueterias();
  }, []);

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
        
        // pack_id y sales_num son columnas numeric: un código alfanumérico de una
        // paquetería externa (FedEx, Estafeta…) las hace fallar con 22P02 y tumbaría
        // el escaneo entero antes de agregar nada a la lista. Cuando el input trae
        // letras se busca solo por `code` (text); al no existir en etiquetas_i cae al
        // camino de "sin registro previo", que es justo como debe tratarse una externa.
        const inputEsNumerico = /^\d+$/.test(finalInput);
        if (searchType === 'sales_num') {
            query = query.eq('sales_num', finalInput);
        } else if (searchType === 'pack_id') {
            query = query.eq('pack_id', finalInput);
        } else if (inputEsNumerico) {
            query = query.or(`code.eq."${finalInput}",pack_id.eq."${finalInput}",sales_num.eq."${finalInput}"`);
        } else {
            query = query.eq('code', finalInput);
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
            .select('entregado, num_venta, code, tienda')
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

        // PASO 2b: también en devoluciones_externas (TikTok/Walmart/etc., de otras vueltas).
        // El código es text, así que un alfanumérico no rompe la consulta.
        const { data: extRecords, error: extError } = await supabaseEtiquetas
            .from('devoluciones_externas')
            .select('entregado, code, origen')
            .or(`code.eq."${finalInput}",code.eq."${realCode}"`);

        if (extError) throw extError;

        if (extRecords && extRecords.length > 0) {
            const yaRegistrada = extRecords.find(r => r.entregado) || extRecords[0];
            playWarningSound();
            showModalNotification(
                'Ya Registrada',
                `Esta devolución externa (${yaRegistrada.code}${yaRegistrada.origen ? ' · ' + yaRegistrada.origen : ''}) ya fue registrada en una vuelta anterior.`,
                'warning'
            );
            setLoading(false);
            return;
        }

        const devData = devRecords && devRecords.length > 0 ? devRecords[0] : null;
        // devoluciones_ml.tienda es la fuente de verdad si ya tiene valor: se
        // extrae y se muestra tal cual, sin pisarla. Si viene NULL (o no hay
        // registro previo), se usa la empresa de etiquetas_i como valor a
        // guardar cuando se finalice.
        const existingTienda = devData?.tienda || null;

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
            organization: existingTienda || tagData?.organization || '---',
            tiendaAlreadySet: !!existingTienda,
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
    if (loadingRef.current) return;
    const code = decodedText.trim();
    if (!code) return;
    const now = Date.now();
    // Si el código YA está en la lista, se avisa DIRECTO (sin ir a la BD) y no se reprocesa.
    // El aviso "ya en la lista" fallaba porque el bloqueo por tiempo se lo comía; ahora sale
    // con un cooldown corto (para no spamear mientras se sostiene el mismo código enfrente).
    if (scannedCodesSetRef.current.has(code)) {
      if (code === lastScanRef.current.code && now - lastScanRef.current.time < 900) return;
      lastScanRef.current = { code, time: now };
      playWarningSound();
      showAppMessage(`Ya en la lista: ${code}`, 'warning');
      return;
    }
    // Código NUEVO: el escáner WASM detecta ~7 veces/seg, así que el bloqueo es POR CÓDIGO
    // (no por tiempo global) para no tragarse escaneos nuevos legítimos, y así el aviso de
    // "escaneado correctamente" sale siempre en la primera lectura.
    if (code === lastScanRef.current.code && now - lastScanRef.current.time < MIN_SCAN_INTERVAL) return;
    lastScanRef.current = { code, time: now };
    processCode(code, 'any');
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

  const EMPRESA_OPTIONS = ['MTM', 'PALO DE ROSA', 'TOLEXAL', 'TAL', 'DOMESKA', 'SUPER OFERTAS'];

  // Origen de la etiqueta, no del transporte. Solo aplica a bultos SIN REGISTRO: los de
  // Mercado Libre se reconocen solos porque existen en etiquetas_i. Se incluye 'Mercado
  // Libre' por si es una etiqueta de ML aún no digitalizada (va a devoluciones_ml igual);
  // cualquier otra plataforma se guarda en la tabla aparte devoluciones_externas.
  const PLATAFORMA_OPTIONS = ['Mercado Libre', 'TikTok', 'Walmart', 'Amazon', 'FedEx', 'Estafeta', 'Otro'];

  // Una devolución es "externa" (tabla propia) cuando no está en nuestra base Y su
  // plataforma no es Mercado Libre. Es el discriminador que enruta el guardado.
  const esDevolucionExterna = (item: ReturnItem) =>
      !!(item.isUnknown && item.origen && item.origen !== 'Mercado Libre');

  const handleOrganizationChange = (code: string, organization: string) => {
      setReturnsList(prev => prev.map(item => item.code === code ? { ...item, organization } : item));
  };

  const handleOrigenChange = (code: string, origen: string) => {
      setReturnsList(prev => prev.map(item => item.code === code ? { ...item, origen } : item));
  };

  const removeFromList = (code: string) => {
      setReturnsList(prev => prev.filter(item => item.code !== code));
      scannedCodesSetRef.current.delete(code);
      showAppMessage(`Eliminado: ${code}`, 'info');
  };

  const handleStartScanner = () => {
      if (!driverName.trim() || !driverPlate.trim() || !paqueteria.trim()) {
          setIsDriverModalOpen(true);
          return;
      }
      setScannerActive(true);
  };

  const handleConfirmDriverInfo = () => {
      if (!driverName.trim() || !driverPlate.trim() || !paqueteria.trim()) {
          alert('Por favor, ingresa el nombre del conductor, las placas y la paquetería.');
          return;
      }
      setIsDriverModalOpen(false);
  };

  const handleOpenFinalizeModal = () => {
      if (returnsList.length === 0) {
          showAppMessage('No hay códigos en la lista.', 'warning');
          return;
      }
      // Todo registro sin empresa ya asignada en devoluciones_ml.tienda debe
      // llenarse manualmente (Select en la tabla) antes de poder finalizar.
      // Todo bulto SIN REGISTRO necesita su plataforma de origen: es lo que decide a qué
      // tabla se guarda (Mercado Libre -> devoluciones_ml, el resto -> devoluciones_externas).
      const missingOrigen = returnsList.some(item => item.isUnknown && !item.origen);
      if (missingOrigen) {
          showModalNotification('Falta Plataforma', 'Indica la plataforma (Mercado Libre, TikTok, Walmart…) de cada bulto marcado como SIN REGISTRO antes de finalizar.', 'destructive');
          return;
      }
      // La empresa/marca interna se exige para Mercado Libre; en las externas puede no
      // conocerse al momento (solo se tiene el código), así que ahí es opcional.
      const missingOrganization = returnsList.some(item => !esDevolucionExterna(item) && !item.tiendaAlreadySet && (!item.organization || item.organization === '---'));
      if (missingOrganization) {
          showModalNotification('Falta Empresa', 'Selecciona la empresa de cada registro de Mercado Libre marcado en amarillo antes de finalizar.', 'destructive');
          return;
      }
      const hasUnknown = returnsList.some(item => item.isUnknown);
      if (hasUnknown) setIsWarningModalOpen(true);
      else setIsFinalizeModalOpen(true);
  };

  const handleFinalizeReturns = async () => {
      if (!driverName.trim() || !driverPlate.trim() || !paqueteria.trim()) {
          alert("Por favor, ingresa el nombre del conductor, las placas y la paquetería.");
          return;
      }
      setLoading(true);
      const codes = returnsList.map(item => item.code);
      const existingReturns = returnsList.filter(i => !i.isNewInDev);
      const newReturns = returnsList.filter(i => i.isNewInDev);

      // Solo se manda un valor real de empresa; el placeholder '---' (sin dato
      // en etiquetas_i) no debe grabarse literal en devoluciones_ml.tienda.
      const resolveTienda = (org?: string | null) => (org && org !== '---' ? org : null);

      try {
          if (existingReturns.length > 0) {
              const updatePromises = existingReturns.map(item => {
                  const updatePayload: Record<string, any> = {
                      entregado: true,
                      name_inc: user?.id,
                      driver_name: driverName,
                      driver_plate: driverPlate,
                      transportista: paqueteria,
                      date_entregado: new Date().toISOString(),
                      code: item.code,
                      registro: !item.isUnknown,
                  };
                  // Si devoluciones_ml.tienda ya tenía valor, no se toca; solo
                  // se llena cuando estaba en NULL.
                  if (!item.tiendaAlreadySet) {
                      const tienda = resolveTienda(item.organization);
                      if (tienda) updatePayload.tienda = tienda;
                  }
                  return supabaseEtiquetas
                    .from('devoluciones_ml')
                    .update(updatePayload)
                    .eq('num_venta', String(item.sales_num));
              });
              await Promise.all(updatePromises);
          }

          // Las devoluciones externas (plataforma distinta de ML) viven en su propia
          // tabla, nunca en el volcado del reporte de Mercado Libre. El resto de las
          // nuevas (ML sin digitalizar o ya conocidas) sigue yendo a devoluciones_ml.
          const nuevasML = newReturns.filter(item => !esDevolucionExterna(item));
          const nuevasExternas = newReturns.filter(esDevolucionExterna);

          if (nuevasML.length > 0) {
              const insertData = nuevasML.map(item => ({
                  num_venta: item.isUnknown ? null : (item.sales_num ? String(item.sales_num) : null),
                  entregado: true,
                  name_inc: user?.id,
                  driver_name: driverName,
                  driver_plate: driverPlate,
                  transportista: paqueteria,
                  date_entregado: new Date().toISOString(),
                  sku: item.sku,
                  tienda: resolveTienda(item.organization),
                  code: item.code,
                  registro: !item.isUnknown
              }));
              const { error: errorIns } = await supabaseEtiquetas.from('devoluciones_ml').insert(insertData);
              if (errorIns) throw errorIns;
          }

          if (nuevasExternas.length > 0) {
              const externasData = nuevasExternas.map(item => ({
                  code: item.code,
                  origen: item.origen,
                  tienda: resolveTienda(item.organization),
                  sku: item.sku && item.sku !== '---' ? item.sku : null,
                  transportista: paqueteria,
                  driver_name: driverName,
                  driver_plate: driverPlate,
                  entregado: true,
                  date_entregado: new Date().toISOString(),
                  name_inc: user?.id,
              }));
              const { error: errorExt } = await supabaseEtiquetas.from('devoluciones_externas').insert(externasData);
              if (errorExt) throw errorExt;
          }

          // personal.code es TEXT, así que un código alfanumérico ya no rompe el UPDATE
          // con 22P02. Además, con el "modo externo" las etiquetas de otras paqueterías
          // también pueden vivir en personal (fueron asignadas), así que se marcan TODAS
          // como DEVUELTO. Las que nunca estuvieron en personal simplemente no las toca
          // el .in(), sin error.
          if (codes.length > 0) {
              await supabaseEtiquetas.from('personal').update({ status: 'DEVUELTO' }).in('code', codes);
          }
          playBeep();
          showModalNotification('¡Éxito!', `Se procesaron ${codes.length} devoluciones correctamente.`, 'success');
          setReturnsList([]);
          scannedCodesSetRef.current.clear();
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(DRIVER_STORAGE_KEY);
          setDriverName(''); setDriverPlate(''); setPaqueteria('');
          setIsFinalizeModalOpen(false);
          setScannerActive(false);
          // Termina el proceso de devoluciones: se piden los datos del transporte
          // de nuevo para la siguiente vuelta, en vez de arrastrar al conductor
          // anterior a un lote completamente distinto. Se DIFIERE hasta que el usuario
          // cierre el modal de éxito (ver closeNotification): no pueden convivir los dos.
          setReopenDriverOnClose(true);
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

  // La cámara ya no se maneja aquí: la lleva <BarcodeScanner /> (zxing-wasm), que se
  // monta/desmonta según scannerActive y limpia sus propios tracks. Al detener (o cambiar
  // de usuario) se resetea la plomería de flash/zoom que aún vive en el padre.
  useEffect(() => {
    if (!(scannerActive && selectedScannerMode === 'camara')) {
      setCameraCapabilities(null); setIsFlashOn(false); setZoom(1); trackRef.current = null;
    }
  }, [scannerActive, selectedScannerMode]);

  // Flash y zoom se aplican al MediaStreamTrack del escáner (el que expone <BarcodeScanner />
  // vía onTrackReady). torch/zoom no son estándar en TS, de ahí el cast.
  const applyCameraConstraints = useCallback((track: MediaStreamTrack | null) => {
    if (!track || track.readyState !== 'live') return;
    track.applyConstraints({ advanced: [{ zoom, torch: isFlashOn }] } as any)
      .catch((e: unknown) => { if (!String(e).includes('ConstraintNotSatisfiedError')) console.error('No se pudieron aplicar flash/zoom:', e); });
  }, [zoom, isFlashOn]);

  useEffect(() => {
    if (scannerActive && selectedScannerMode === 'camara') applyCameraConstraints(trackRef.current);
  }, [zoom, isFlashOn, scannerActive, selectedScannerMode, applyCameraConstraints]);

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
                  <div className="bg-starbucks-cream p-4 rounded-lg flex flex-col">
                    <div className="scanner-container relative w-full aspect-square max-h-[50vh] mx-auto bg-black rounded-lg overflow-hidden flex items-center justify-center">
                        <div className="w-full h-full" style={{ display: selectedScannerMode === 'camara' && scannerActive ? 'block' : 'none' }}>
                          {selectedScannerMode === 'camara' && scannerActive && (
                            <BarcodeScanner
                              onDetected={onScanSuccess}
                              onTrackReady={(track) => {
                                trackRef.current = track;
                                // Se piden SIEMPRE (no solo en móvil): los controles se muestran
                                // según lo que la cámara reporte, no según el ancho de pantalla.
                                // Tras capabilities, se re-aplican flash/zoom al track: importa
                                // cuando Android reinicia la cámara al volver de segundo plano.
                                getCameraCapabilitiesWithRetry(track).then((caps) => {
                                  setCameraCapabilities(caps);
                                  applyCameraConstraints(track);
                                });
                              }}
                              onError={(e) => { console.error('Error de cámara (devoluciones):', e); showModalNotification('Error de cámara', 'No se pudo iniciar la cámara. Revisa los permisos e intenta de nuevo.', 'destructive'); setScannerActive(false); }}
                            />
                          )}
                        </div>
                        {message.show && <div className={`scanner-message z-20 ${messageClasses[message.type]}`}>{message.text}</div>}
                        {!scannerActive && <p className="text-white/40 font-bold uppercase text-xs">Escáner Inactivo</p>}
                    </div>
                    {/* Flash y zoom: solo en móvil, con la cámara activa, y solo si el track
                        expone esas capacidades (muchos iPhone no dan torch/zoom por WebRTC). */}
                    {isMounted && scannerActive && selectedScannerMode === 'camara' && cameraCapabilities && (cameraCapabilities.torch || cameraCapabilities.zoom) && (
                        <div className="mt-3 bg-black/70 backdrop-blur-md p-3 rounded-xl flex items-center gap-4 text-white border border-white/10">
                            {cameraCapabilities.torch && (
                                <Button variant="ghost" size="icon" onClick={() => setIsFlashOn(!isFlashOn)} className={cn("h-10 w-10 shrink-0", isFlashOn ? 'text-yellow-400 bg-white/10' : 'text-white')} title="Flash">
                                    <Zap className="h-6 w-6" />
                                </Button>
                            )}
                            {cameraCapabilities.zoom && (
                                <div className="flex-1 flex items-center gap-3">
                                    <ZoomIn className="h-5 w-5 text-gray-400 shrink-0" />
                                    <input
                                        type="range"
                                        min={cameraCapabilities.zoom.min}
                                        max={cameraCapabilities.zoom.max}
                                        step={cameraCapabilities.zoom.step || 0.1}
                                        value={zoom}
                                        onChange={(e) => setZoom(parseFloat(e.target.value))}
                                        className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-starbucks-green"
                                    />
                                </div>
                            )}
                        </div>
                    )}
                    <div className="mt-4 flex gap-2 justify-center">
                      <Button onClick={handleStartScanner} disabled={scannerActive || loading || !encargado || !driverName.trim() || !driverPlate.trim() || !paqueteria.trim()} className="bg-blue-600 hover:bg-blue-700 h-10 px-8">Iniciar</Button>
                      <Button onClick={() => setIsDriverModalOpen(true)} variant="outline" className="h-10 px-4 gap-2" disabled={scannerActive} title="Editar datos del transporte"><Truck className="h-4 w-4" /> Transporte</Button>
                      <Button onClick={() => { setScannerActive(false); showAppMessage('Escáner detenido.', 'info'); }} variant="destructive" className="h-10 px-8" disabled={!scannerActive}>Detener</Button>
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
                  {/* Móvil: cards en vez de tabla (la de 800px se salía de la pantalla). */}
                  <div className="md:hidden space-y-2 max-h-[500px] overflow-auto pr-0.5">
                    {returnsList.length > 0 ? returnsList.map((item) => (
                      <div key={item.code} className={cn("rounded-xl border p-2.5 space-y-1.5", item.isUnknown ? "bg-orange-50 border-orange-200" : "bg-white border-gray-200")}>
                        {/* Fila 1: código + badge, y borrar a la derecha. */}
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-[11px] font-bold break-all leading-tight">{item.code}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {item.isManual && <span className="text-[7px] font-black text-amber-600 border border-amber-200 px-1 rounded-sm bg-amber-50">MANUAL</span>}
                              {item.isNewInDev && <span className="text-[7px] font-black text-green-600 border border-green-200 px-1 rounded-sm bg-green-50 flex items-center gap-0.5"><Sparkles className="h-2 w-2" /> NUEVO</span>}
                              {item.isUnknown && <span className="text-[7px] font-black text-red-600 border border-red-200 px-1 rounded-sm bg-red-50 flex items-center gap-0.5"><HelpCircle className="h-2 w-2" /> SIN REGISTRO</span>}
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => removeFromList(item.code)} className="text-red-400 hover:text-red-600 h-6 w-6 shrink-0"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                        {/* Fila 2: Plataforma al lado de Empresa, alineadas horizontalmente. */}
                        <div className={cn("grid gap-2", item.isUnknown ? "grid-cols-2" : "grid-cols-1")}>
                          {item.isUnknown && (
                            <Select value={item.origen || undefined} onValueChange={(val) => handleOrigenChange(item.code, val)}>
                              <SelectTrigger className="h-8 w-full text-[10px] font-bold px-2 border-red-300 bg-red-50"><SelectValue placeholder="Plataforma..." /></SelectTrigger>
                              <SelectContent>{PLATAFORMA_OPTIONS.map(p => (<SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>))}</SelectContent>
                            </Select>
                          )}
                          {item.tiendaAlreadySet ? (
                            <div className="h-8 flex items-center px-2 rounded-md border border-starbucks-green/30 bg-green-50/50"><span className="text-[10px] font-black text-starbucks-green truncate">{item.organization}</span></div>
                          ) : (
                            <Select value={item.organization && item.organization !== '---' ? item.organization : undefined} onValueChange={(val) => handleOrganizationChange(item.code, val)}>
                              <SelectTrigger className="h-8 w-full text-[10px] font-bold px-2 border-amber-300 bg-amber-50"><SelectValue placeholder="Empresa..." /></SelectTrigger>
                              <SelectContent>{EMPRESA_OPTIONS.map(org => (<SelectItem key={org} value={org} className="text-xs">{org}</SelectItem>))}</SelectContent>
                            </Select>
                          )}
                        </div>
                        {/* Fila 3: SKU y Subcategoría juntos. */}
                        <div className="grid grid-cols-2 gap-2 border-t border-dashed border-gray-200 pt-1.5">
                          <div className="min-w-0">
                            <p className="text-[8px] font-black uppercase tracking-wide text-gray-400">SKU</p>
                            <p className="text-[10px] font-bold text-gray-600 truncate">{item.sku}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[8px] font-black uppercase tracking-wide text-gray-400">Subcat.</p>
                            <p className="text-[10px] font-black text-amber-700 uppercase truncate">{item.subcategoria}</p>
                          </div>
                        </div>
                      </div>
                    )) : <div className="text-center text-gray-400 py-16 text-[11px] uppercase font-bold">Esperando registros...</div>}
                  </div>

                  {/* Desktop: tabla */}
                  <div className="hidden md:block table-container border rounded-lg max-h-[500px] overflow-auto bg-white shadow-inner custom-scrollbar">
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
                                              {/* Sin registro en nuestra base: hay que indicar de qué plataforma es la
                                                  etiqueta. Esto enruta el guardado (ML -> devoluciones_ml, resto -> externas). */}
                                              {item.isUnknown && (
                                                  <Select
                                                      value={item.origen || undefined}
                                                      onValueChange={(val) => handleOrigenChange(item.code, val)}
                                                  >
                                                      <SelectTrigger className="h-6 w-[130px] text-[8px] font-bold px-2 mt-1 border-red-300 bg-red-50">
                                                          <SelectValue placeholder="Plataforma..." />
                                                      </SelectTrigger>
                                                      <SelectContent>
                                                          {PLATAFORMA_OPTIONS.map(p => (
                                                              <SelectItem key={p} value={p} className="text-[10px]">{p}</SelectItem>
                                                          ))}
                                                      </SelectContent>
                                                  </Select>
                                              )}
                                          </div>
                                      </TableCell>
                                      <TableCell className="py-2"><span className="font-mono text-[10px] font-black text-starbucks-green">{item.sales_num || '---'}</span></TableCell>
                                      <TableCell className="py-2"><div className="flex items-center gap-1"><Tag className="h-2.5 w-2.5 text-gray-400" /><span className="text-[9px] font-bold text-gray-600">{item.sku}</span></div></TableCell>
                                      <TableCell className="py-2"><div className="flex items-center gap-1"><Layers className="h-2.5 w-2.5 text-amber-400" /><span className="text-[9px] font-black text-amber-700 uppercase">{item.subcategoria}</span></div></TableCell>
                                      <TableCell className="py-2">
                                          <div className="flex items-center gap-1">
                                              <Building2 className="h-2.5 w-2.5 text-gray-400 shrink-0" />
                                              {item.tiendaAlreadySet ? (
                                                  <Badge variant="outline" className="text-[8px] font-black border-starbucks-green/30 text-starbucks-green py-0 h-4">{item.organization}</Badge>
                                              ) : (
                                                  <Select
                                                      value={item.organization && item.organization !== '---' ? item.organization : undefined}
                                                      onValueChange={(val) => handleOrganizationChange(item.code, val)}
                                                  >
                                                      <SelectTrigger className="h-6 w-[120px] text-[8px] font-bold px-2 border-amber-300 bg-amber-50">
                                                          <SelectValue placeholder="Elegir empresa..." />
                                                      </SelectTrigger>
                                                      <SelectContent>
                                                          {EMPRESA_OPTIONS.map(org => (
                                                              <SelectItem key={org} value={org} className="text-[10px]">{org}</SelectItem>
                                                          ))}
                                                      </SelectContent>
                                                  </Select>
                                              )}
                                          </div>
                                      </TableCell>
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

      {/* Datos del transporte: se piden antes de escanear (botón "Iniciar"), no
          aquí al final — este modal ya no vuelve a pedirlos, solo confirma con
          lo que ya se capturó (y que sobrevive un refresh vía localStorage). */}
      <Dialog open={isDriverModalOpen} onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-md rounded-2xl" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
              <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-starbucks-green"><Truck className="h-6 w-6" /> Datos del Transporte</DialogTitle>
                  <DialogDescription>Antes de escanear, registra quién transporta esta vuelta de devoluciones.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                      <Label htmlFor="driver-name" className="text-xs font-black uppercase text-gray-400">Nombre del Conductor</Label>
                      <Input id="driver-name" value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Ej. Juan Pérez" className="h-12 rounded-xl font-bold uppercase" onKeyDown={(e) => e.key === 'Enter' && handleConfirmDriverInfo()} />
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="driver-plate" className="text-xs font-black uppercase text-gray-400">Placas del Vehículo</Label>
                      <Input id="driver-plate" value={driverPlate} onChange={(e) => setDriverPlate(e.target.value)} placeholder="Ej. ABC-1234" className="h-12 rounded-xl font-mono font-bold uppercase" onKeyDown={(e) => e.key === 'Enter' && handleConfirmDriverInfo()} />
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="paqueteria" className="text-xs font-black uppercase text-gray-400">Paquetería</Label>
                      {/* Antes era un Combobox (cmdk): en Safari/iOS a veces abría el
                          popover pero no renderizaba las opciones ("No hay paqueterías").
                          Se cambia al Select de Radix —el mismo que ya usan empresa y
                          plataforma en esta pantalla— que es más robusto en móvil. */}
                      <Select value={paqueteria} onValueChange={setPaqueteria}>
                          <SelectTrigger className="h-12 rounded-xl font-bold uppercase">
                              <SelectValue placeholder="Selecciona paquetería..." />
                          </SelectTrigger>
                          <SelectContent>
                              {paqueteriaOptions.length > 0 ? (
                                  paqueteriaOptions.map(opt => (
                                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                  ))
                              ) : (
                                  <div className="px-3 py-2 text-xs text-gray-400 text-center">No hay paqueterías registradas.</div>
                              )}
                          </SelectContent>
                      </Select>
                  </div>
              </div>
              <DialogFooter>
                  <Button onClick={handleConfirmDriverInfo} disabled={!driverName.trim() || !driverPlate.trim() || !paqueteria.trim()} className="w-full h-12 rounded-xl bg-starbucks-green hover:bg-starbucks-dark text-white font-black">
                      Continuar
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      <Dialog open={isFinalizeModalOpen} onOpenChange={setIsFinalizeModalOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl">
              <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-starbucks-green"><Truck className="h-6 w-6" /> Finalizar Transporte</DialogTitle>
                  <DialogDescription>
                      Se procesarán {returnsList.length} devoluciones a nombre de <span className="font-bold text-black">{driverName}</span>, placas <span className="font-bold text-black font-mono">{driverPlate}</span>, paquetería <span className="font-bold text-black">{paqueteria}</span>.
                  </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex flex-col sm:flex-row gap-2">
                  <Button variant="outline" onClick={() => setIsFinalizeModalOpen(false)} className="w-full sm:w-auto h-12 rounded-xl font-bold">Cancelar</Button>
                  <Button onClick={handleFinalizeReturns} disabled={loading} className="w-full sm:w-auto bg-starbucks-green hover:bg-starbucks-dark text-white font-black h-12 px-8 rounded-xl shadow-lg shadow-starbucks-green/20 transition-all">
                      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'CONFIRMAR Y GUARDAR'}
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      {showNotification && (
          <div className="p-4 fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[100]" onClick={closeNotification}>
                <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 w-full max-w-[320px] text-center space-y-6 animate-in zoom-in duration-300" onClick={(e) => e.stopPropagation()}>
                  <div className={cn("p-4 rounded-3xl inline-block mx-auto", notification.variant === 'destructive' ? "bg-red-50 text-red-500" : notification.variant === 'success' ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600")}>
                      {notification.variant === 'destructive' ? <XCircle className="h-10 w-10" /> : notification.variant === 'success' ? <CheckCircle className="h-10 w-10"/> : <AlertTriangle className="h-10 w-10" />}
                  </div>
                  <div className="space-y-2">
                      <h3 className="text-xl font-black text-gray-900 tracking-tight">{notification.title}</h3>
                      <p className="text-xs text-gray-500 font-medium leading-relaxed">{notification.message}</p>
                  </div>
                  <Button onClick={closeNotification} className="w-full h-12 rounded-2xl bg-starbucks-green font-black text-xs tracking-widest shadow-lg shadow-starbucks-green/20">CERRAR</Button>
              </div>
          </div>
      )}
    </>
  );
}