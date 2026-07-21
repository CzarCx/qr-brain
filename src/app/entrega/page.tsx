'use client';
import {useEffect, useRef, useState, useCallback, useMemo} from 'react';
import Head from 'next/head';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { supabase, supabaseEtiquetas } from '@/lib/supabaseClient';
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { XCircle, PackageCheck, AlertTriangle, ChevronDown, Trash2, Zap, ZoomIn, PlusCircle, Download, FileUp, Clock, WifiOff, RefreshCw } from 'lucide-react';
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
import { useAuth } from '@/components/AuthProvider';
import { cn, getCameraCapabilitiesWithRetry } from '@/lib/utils';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { useOfflineSync, SyncOutcome } from '@/hooks/use-offline-sync';
import { enqueue, mergeSnapshotEntries, getSnapshotEntries, updateQueueItem, SnapshotEntry, QueueItem } from '@/lib/offlineDb';


type DeliveryItem = {
  code: string;
  product: string | null;
  // Operario que empaquetó/despachó la etiqueta (personal.name). Se muestra en la
  // columna "Despachó".
  name: string | null;
  // Subcategoría derivada del SKU (sku_alterno -> sku_m); personal no la guarda.
  subcategoria?: string | null;
  // Plataforma de origen: null/'Mercado Libre' = ML; 'Walmart'/'TikTok Shop'/... = externa.
  origen?: string | null;
  // true cuando se aceptó offline sin poder validarlo contra un snapshot local
  // (no estaba en ningún lote precargado); se revalida contra el servidor al sincronizar.
  unverified?: boolean;
};

type Encargado = {
  name: string;
  organization: string;
};

type DeliverPayload = {
  codes: string[];
  driverName: string;
  driverPlate: string;
  encargado: string;
  deliveryTimestamp: string;
  // Capturado al encolar (no al sincronizar): la sesión activa al reconectar
  // podría ser de otro usuario si el dispositivo cambió de manos offline.
  userId: string | null;
};

// Escáner nuevo (zxing-wasm), compartido con /devoluciones. ssr:false porque usa
// cámara/WASM del navegador. Reemplaza a html5-qrcode SOLO en esta pantalla.
const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false });

const STORAGE_KEY = 'entrega_session_list';

// Desplazamiento al deslizar la card para revelar "Eliminar" (mismo criterio que /asignar).
const SWIPE_OPEN_X = -84;

// La subcategoría no vive en `personal`: se deriva del SKU cruzando sku_alterno -> sku_m,
// igual que en /asignar y /devoluciones. Para un lote entero se cruza EN LOTE (dos consultas
// con .in()) en vez de 1-2 por fila, que serían N viajes secuenciales.
const buildSubcatMap = async (
  skus: (string | null | undefined)[],
): Promise<Map<string, string>> => {
  const uniqueSkus = Array.from(new Set(
    skus.flatMap(s => (s ? String(s).split(' | ').map(x => x.trim()).filter(Boolean) : [])),
  ));
  const result = new Map<string, string>();
  if (uniqueSkus.length === 0) return result;
  // Trocea los .in() para que un lote grande no arme una URL que PostgREST rechace.
  const chunk = <T,>(arr: T[], n: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };
  try {
    // sku -> sku_mdr
    const skuToMdr = new Map<string, string>();
    const mdrs: string[] = [];
    for (const part of chunk(uniqueSkus, 200)) {
      const { data: altRows } = await supabaseEtiquetas
        .from('sku_alterno')
        .select('sku, sku_mdr')
        .in('sku', part);
      (altRows || []).forEach((r: any) => {
        if (r.sku && r.sku_mdr) { skuToMdr.set(String(r.sku), String(r.sku_mdr)); mdrs.push(String(r.sku_mdr)); }
      });
    }
    // sku_mdr -> sub_cat
    const mdrToSubcat = new Map<string, string>();
    const uniqueMdrs = Array.from(new Set(mdrs));
    for (const part of chunk(uniqueMdrs, 200)) {
      const { data: mRows } = await supabaseEtiquetas
        .from('sku_m')
        .select('sku_mdr, sub_cat')
        .in('sku_mdr', part);
      (mRows || []).forEach((r: any) => { if (r.sku_mdr && r.sub_cat) mdrToSubcat.set(String(r.sku_mdr), r.sub_cat); });
    }
    // Si el SKU no cruza, se usa el propio SKU como fallback (mismo criterio que las otras pantallas).
    uniqueSkus.forEach(sku => {
      const mdr = skuToMdr.get(sku);
      const sub = mdr ? mdrToSubcat.get(mdr) : undefined;
      result.set(sku, sub || sku);
    });
  } catch { /* red caída: se devuelve lo que se haya podido armar (posiblemente vacío) */ }
  return result;
};

// Combina la subcategoría de un SKU (que puede traer varios unidos por ' | ') desde el mapa.
const subcatFromMap = (sku: string | null | undefined, map: Map<string, string>): string | null => {
  if (!sku) return null;
  const parts = String(sku).split(' | ').map(x => x.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const subs = parts.map(p => map.get(p) || p);
  return Array.from(new Set(subs)).join(' | ');
};

// Card abatible para la lista de entrega en móvil. Calcada de MobilePendingRow de /asignar
// (y MobileMassRow de /calificar): deslizar a la izquierda revela "Eliminar"; tocar la
// cabecera despliega el detalle (producto completo, subcategoría, quién despachó). Sustituye
// la tabla que en móvil crecía muchísimo porque el nombre del producto se partía en 10+ líneas.
function MobileDeliveryRow({
  data,
  index,
  isOpen,
  onOpenChange,
  onDelete,
}: {
  data: DeliveryItem;
  index: number;
  isOpen: boolean;
  onOpenChange: (code: string | null) => void;
  onDelete: (code: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dragX, setDragX] = useState(isOpen ? SWIPE_OPEN_X : 0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef(0);
  const baseXRef = useRef(0);
  const movedRef = useRef(false);

  useEffect(() => {
    if (!isDragging) setDragX(isOpen ? SWIPE_OPEN_X : 0);
  }, [isOpen, isDragging]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    movedRef.current = false;
    dragStartXRef.current = e.clientX;
    baseXRef.current = isOpen ? SWIPE_OPEN_X : 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartXRef.current;
    if (Math.abs(dx) > 6) movedRef.current = true;
    setDragX(Math.max(SWIPE_OPEN_X, Math.min(0, baseXRef.current + dx)));
  };

  const endDrag = () => {
    if (!isDragging) return;
    setIsDragging(false);
    setDragX(current => {
      const shouldOpen = current < SWIPE_OPEN_X / 2;
      onOpenChange(shouldOpen ? data.code : null);
      return shouldOpen ? SWIPE_OPEN_X : 0;
    });
  };

  const handleHeadClick = () => {
    if (movedRef.current) { movedRef.current = false; return; }
    if (isOpen) { onOpenChange(null); return; }
    setExpanded(v => !v);
  };

  const esExterna = !!(data.origen && data.origen !== 'Mercado Libre');

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden mb-1.5 bg-white">
      <div className="relative">
        <div className="absolute inset-0 flex justify-end items-stretch bg-red-100">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(data.code); }}
            className="w-[84px] bg-red-600 hover:bg-red-700 text-white flex flex-col items-center justify-center gap-0.5 text-[9px] font-black uppercase tracking-wide"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </button>
        </div>
        <div
          className="relative z-10 bg-white"
          style={{ transform: `translateX(${dragX}px)`, transition: isDragging ? 'none' : 'transform 0.2s ease', touchAction: 'pan-y' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div
            className="flex items-center gap-2 px-2.5 py-2 cursor-pointer"
            role="button"
            tabIndex={0}
            aria-expanded={expanded}
            onClick={handleHeadClick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleHeadClick(); } }}
          >
            <span className="text-[10px] font-bold text-gray-400 tabular-nums shrink-0">{index + 1}</span>
            {/* Código arriba; producto (truncado) debajo. El detalle completo va al desplegar. */}
            <div className="min-w-0 flex-1 flex flex-col gap-0.5">
              <span className="font-mono text-xs font-bold text-starbucks-dark truncate">
                {data.code}
                {esExterna && (
                  <span className="ml-1.5 px-1 py-0.5 rounded bg-amber-100 text-amber-800 text-[8px] font-black uppercase tracking-wider align-middle">{data.origen}</span>
                )}
              </span>
              <span className="text-[10px] font-medium text-gray-500 truncate">{data.product || 'N/A'}</span>
            </div>
            {data.unverified && (
              <span title="No estaba en un lote precargado; se validará al sincronizar" className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide shrink-0">
                <AlertTriangle className="h-2.5 w-2.5" /> Sin verif.
              </span>
            )}
            <ChevronDown className={cn("h-3.5 w-3.5 text-gray-400 transition-transform flex-shrink-0", expanded && "rotate-180")} />
          </div>
          <div className="grid transition-[grid-template-rows] duration-200" style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}>
            <div className="overflow-hidden">
              <div className="px-2.5 pb-2.5 pt-2 pl-8 border-t border-dashed border-gray-200 mt-0.5">
                <dl className="mb-2 space-y-1.5 text-[11px]">
                  <div>
                    <dt className="text-[8px] font-black uppercase tracking-wide text-gray-400">Producto</dt>
                    <dd className="font-semibold text-starbucks-dark break-words">{data.product || 'N/A'}</dd>
                  </div>
                </dl>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                  <div><dt className="text-[8px] font-black uppercase tracking-wide text-gray-400">Subcategoría</dt><dd className="font-black text-amber-700 uppercase break-words">{data.subcategoria || 'N/A'}</dd></div>
                  <div><dt className="text-[8px] font-black uppercase tracking-wide text-gray-400">Despachó</dt><dd className="font-semibold text-starbucks-dark break-words">{data.name || 'N/A'}</dd></div>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { profile, user } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  const [message, setMessage] = useState({text: 'Esperando para escanear...', type: 'info' as 'info' | 'success' | 'error' | 'warning', show: false});
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [encargado, setEncargado] = useState('');
  const [encargadosList, setEncargadosList] = useState<Encargado[]>([]);
  const [deliveryList, setDeliveryList] = useState<DeliveryItem[]>([]);
  // Código de la card móvil actualmente deslizada/revelada (para eliminar); abrir una cierra la otra.
  const [openSwipeCode, setOpenSwipeCode] = useState<string | null>(null);
  const [selectedScannerMode, setSelectedScannerMode] = useState('camara');
  const [scannerActive, setScannerActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notification, setNotification] = useState({ title: '', message: '', variant: 'default' as 'default' | 'destructive' | 'success' });
  const [cameraCapabilities, setCameraCapabilities] = useState<any>(null);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const isMobile = useIsMobile();
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
  const isOnline = useOnlineStatus();

  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Refs
  const trackRef = useRef<MediaStreamTrack | null>(null);
  // Dedup POR CÓDIGO (no por tiempo): guarda el último código y cuándo se procesó.
  const lastScanRef = useRef({ code: '', time: 0 });
  const scannedCodesRef = useRef(new Set<string>());
  const physicalScannerInputRef = useRef<HTMLInputElement | null>(null);
  // Snapshot local de `personal` (nombre/producto/status) construido al cargar
  // lotes, usado para validar escaneos cuando no hay conexión.
  const snapshotRef = useRef<Record<string, SnapshotEntry>>({});
  // Refleja `loading` sin ser dependencia reactiva de onScanSuccess: si estuviera
  // en las deps de ese useCallback, su identidad cambiaría en cada escaneo y
  // reiniciaría el efecto que arranca/detiene la cámara, apagando flash/zoom.
  const loadingRef = useRef(false);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  const bufferRef = useRef('');
  
  const MIN_SCAN_INTERVAL = 1500; // 1.5 seconds

   useEffect(() => {
    setIsMounted(true);

    // Recuperar datos de LocalStorage
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (Array.isArray(parsed)) {
          setDeliveryList(parsed);
          parsed.forEach(item => scannedCodesRef.current.add(item.code));
        }
      } catch (e) {
        console.error("Error al recuperar sesión de entrega:", e);
      }
    }

    // Recuperar snapshot offline (lotes cargados previamente), por si la app
    // se recargó mientras estaba sin conexión.
    getSnapshotEntries('entrega').then((entries) => {
      snapshotRef.current = entries;
    });
  }, []);

  // Guardar en LocalStorage cada vez que cambie la lista
  useEffect(() => {
    if (isMounted) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(deliveryList));
    }
  }, [deliveryList, isMounted]);

  // Vincular encargado con el perfil de usuario logueado o buscar en empleados por email
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
                setEncargado(profile.name);
            }
        } catch (err) {
            console.error("Error fetching name for delivery encargado:", err);
        }
    };

    fetchNameFromEmployees();
  }, [user, profile]);

  const groupedEncargadoOptions = useMemo(() => {
    let list = [...encargadosList];
    
    // Asegurar que el usuario logueado esté en las opciones
    if (encargado && !list.some(e => e.name === encargado)) {
        list.push({ name: encargado, organization: 'Usuario Actual' });
    }

    if (list.length === 0) return [];
    
    const grouped = list.reduce((acc, person) => {
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
  }, [encargadosList, encargado]);


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
  
  const showModalNotification = (title: string, message: string, variant: 'default' | 'destructive' | 'success' = 'default') => {
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
    if (loadingRef.current) return;

    let finalCode = decodedText;
    try {
        const parsed = JSON.parse(decodedText);
        if (parsed && parsed.id) {
            finalCode = String(parsed.id);
        }
    } catch (e) {
        // No es JSON: se usa el texto tal cual.
    }
    finalCode = String(finalCode).trim();
    if (!finalCode) return;

    const now = Date.now();
    // Ya en la lista: avisar DIRECTO (sin ir a la BD) con cooldown corto anti-spam. El
    // escáner WASM detecta ~7 veces/seg; con el bloqueo por tiempo de antes el aviso se
    // perdía y se tragaban escaneos nuevos legítimos.
    if (scannedCodesRef.current.has(finalCode)) {
        if (finalCode === lastScanRef.current.code && now - lastScanRef.current.time < 900) return;
        lastScanRef.current = { code: finalCode, time: now };
        showAppMessage(`Código ya en la lista: ${finalCode}`, 'warning');
        return;
    }
    // Código NUEVO: bloqueo POR CÓDIGO (no por tiempo global), así el aviso de éxito sale
    // siempre en la primera lectura y no se descartan escaneos distintos hechos rápido.
    if (finalCode === lastScanRef.current.code && now - lastScanRef.current.time < MIN_SCAN_INTERVAL) return;
    lastScanRef.current = { code: finalCode, time: now };

    setLoading(true);
    showAppMessage('Procesando código...', 'info');
    if ('vibrate' in navigator) navigator.vibrate(100);

    // Subcategoría de un paquete recién escaneado: online se cruza el SKU (sku_alterno->sku_m);
    // offline se toma la que quedó cacheada en el snapshot al precargar el lote.
    const resolveItemSubcat = async (d: { sku?: string | null; subcategoria?: string | null }): Promise<string | null> => {
        if (d.sku) {
            const map = await buildSubcatMap([d.sku]);
            return subcatFromMap(d.sku, map);
        }
        return d.subcategoria ?? null;
    };

    const applyScanResult = async (data: { name: string | null; product: string | null; status: string; origen?: string | null; sku?: string | null; subcategoria?: string | null } | null, offline: boolean) => {
        if (!data) {
            if (offline) {
                // Sin snapshot para este código: en vez de bloquear, se acepta sin
                // verificar. El motor de sincronización lo revalida contra el
                // servidor (y lo marca como conflicto si no corresponde) al reconectar.
                playBeep();
                const newItem: DeliveryItem = { code: finalCode, product: null, name: null, unverified: true };
                setDeliveryList(prev => [newItem, ...prev]);
                scannedCodesRef.current.add(finalCode);
                showAppMessage(`Añadido sin verificar (sin conexión): ${finalCode}`, 'warning');
                return;
            }
            playWarningSound();
            showModalNotification('Código No Asignado', 'Esta etiqueta aún no ha sido registrada en el sistema.', 'destructive');
        } else if (data.status === 'REPORTADO') {
            playWarningSound();
            showModalNotification('Paquete Reportado', 'Este paquete no está listo para ser enviado, tiene un reporte activo.', 'destructive');
        } else if (data.status === 'EN PRODUCCION' && !offline) {
            // Un paquete que llega a entrega sin haber pasado por QC se califica
            // automáticamente aquí. Se replican las mismas columnas que escribe
            // /calificar (date_cal, name_cali, id_empleado_calificada) para no
            // perder la trazabilidad de quién lo calificó y cuándo.
            const { data: updated, error: calError } = await supabaseEtiquetas
                .from('personal')
                .update({
                    status: 'CALIFICADO',
                    details: null,
                    date_cal: new Date().toISOString(),
                    name_cali: encargado || 'N/A',
                    id_empleado_calificada: user?.id ?? null,
                })
                .eq('code', finalCode)
                .select('code');

            if (calError || !updated || updated.length === 0) {
                playWarningSound();
                showModalNotification(
                    'No se pudo calificar',
                    calError
                        ? `Error al actualizar el estatus: ${calError.message}`
                        : 'No se actualizó ningún registro (0 filas afectadas). Verifica permisos.',
                    'destructive',
                );
                return;
            }

            playBeep();
            const subcatProd = await resolveItemSubcat(data);
            setDeliveryList(prev => [{ code: finalCode, product: data.product, name: data.name, origen: data.origen, subcategoria: subcatProd }, ...prev]);
            scannedCodesRef.current.add(finalCode);
            showAppMessage(`Calificado automáticamente y añadido: ${finalCode}`, 'success');
        } else if (isValidationOverridden || data.status === 'CALIFICADO') {
            playBeep();
            const subcatCal = await resolveItemSubcat(data);
            const newItem: DeliveryItem = {
                code: finalCode,
                product: data.product,
                name: data.name,
                origen: data.origen,
                subcategoria: subcatCal,
            };
            setDeliveryList(prev => [newItem, ...prev]);
            scannedCodesRef.current.add(finalCode);
            showAppMessage(`Paquete listo${offline ? ' (sin conexión)' : ''}: ${finalCode}`, 'success');
        } else {
             playWarningSound();
             showModalNotification('Paquete no Calificado', `Este paquete aún no ha sido calificado (Estado: ${data.status}).`);
        }
    };

    try {
        if (!isOnline) {
            await applyScanResult(snapshotRef.current[finalCode] ?? null, true);
        } else {
            const { data, error } = await supabaseEtiquetas
                .from('personal')
                .select('name, product, status, origen, sku')
                .eq('code', finalCode)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
                throw error;
            }
            // La subcategoría se deriva dentro de applyScanResult SOLO cuando el paquete se
            // agrega (estatus CALIFICADO / EN PRODUCCION), no aquí: así un REPORTADO o un
            // código no calificado no paga el cruce sku_alterno->sku_m ni retrasa el beep.
            await applyScanResult(data ?? null, false);
        }
    } catch (e: any) {
        showModalNotification('Error de Base de Datos', `Hubo un problema al consultar el código: ${e.message}`, 'destructive');
    } finally {
        setLoading(false);
    }
  }, [isValidationOverridden, isOnline, user, encargado]);

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


  // Flash/zoom se aplican al MediaStreamTrack del escáner (el que expone <BarcodeScanner />
  // vía onTrackReady). torch/zoom no son estándar en TS, de ahí el cast.
  const applyCameraConstraints = useCallback((track: MediaStreamTrack | null) => {
    if (!isMobile || !track || track.readyState !== 'live') return;
    track.applyConstraints({ advanced: [{ zoom, torch: isFlashOn }] } as any).catch((e: unknown) => {
      if (!String(e).includes('ConstraintNotSatisfiedError')) {
        console.error("Failed to apply constraints", e);
      }
    });
  }, [zoom, isFlashOn, isMobile]);

  useEffect(() => {
    if (scannerActive && selectedScannerMode === 'camara') applyCameraConstraints(trackRef.current);
  }, [zoom, isFlashOn, scannerActive, selectedScannerMode, applyCameraConstraints]);

  // La cámara ya no se maneja aquí: la lleva <BarcodeScanner /> (zxing-wasm). Al detener el
  // escáner se resetea la plomería de flash/zoom que aún vive en el padre.
  useEffect(() => {
    if (!(scannerActive && selectedScannerMode === 'camara')) {
      setCameraCapabilities(null); setIsFlashOn(false); setZoom(1); trackRef.current = null;
    }
  }, [scannerActive, selectedScannerMode]);

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
    // Antes recargaba la página (workaround de html5-qrcode). Con <BarcodeScanner /> basta
    // con desmontarlo: su cleanup apaga los tracks. Se conserva la lista y la sesión.
    setScannerActive(false);
    showAppMessage('Escáner detenido.', 'info');
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
  
  const saveKpiData = async (name: string, quantity: number, timeInSeconds: number, csvFileName?: string, userId?: string | null) => {
    if (quantity === 0 || !name) return;

    try {
      const kpiData: { name: string; quantity: number; time: string; rol: string; csv_file?: string; id_empleado: string | null } = {
        name: name,
        quantity: quantity,
        time: formatElapsedTime(timeInSeconds),
        rol: 'Entrega',
        id_empleado: userId ?? null,
      };
      if (csvFileName) {
        kpiData.csv_file = csvFileName;
      }
      const { error } = await supabaseEtiquetas.from('kpis').insert([kpiData]);
      if (error) {
        console.error('Error saving KPI data:', error.message);
      }
    } catch (e: any) {
      console.error('Exception while saving KPI data:', e.message);
    }
  };

  // Procesa un lote de entrega encolado offline: antes de aplicar el cambio,
  // relee el estado actual en el servidor. Los códigos que ya cambiaron de
  // estado en otro dispositivo (reportados/cancelados/entregados mientras
  // este dispositivo estaba sin conexión), o que resultan no existir en absoluto
  // (posible con códigos aceptados offline "sin verificar"), se dejan como
  // conflicto para revisión manual en vez de sobreescribirlos o ignorarlos.
  const processDeliverItem = async (item: QueueItem): Promise<SyncOutcome> => {
    const { codes, driverName: itemDriverName, driverPlate: itemDriverPlate, encargado: itemEncargado, deliveryTimestamp, userId: itemUserId } = item.payload as DeliverPayload;

    const { data, error } = await supabaseEtiquetas.from('personal').select('code, status').in('code', codes);
    if (error) throw error;

    const statusByCode = new Map((data ?? []).map((r: any) => [String(r.code), r.status as string]));
    const blockedStatuses = new Set(['REPORTADO', 'CANCELADO', 'ENTREGADO']);
    const isBlocked = (c: string) => {
      const status = statusByCode.get(c);
      return status === undefined || blockedStatuses.has(status);
    };
    const blocked = codes.filter(isBlocked);
    const applicable = codes.filter((c) => !isBlocked(c));

    if (applicable.length > 0) {
      const { error: updateError } = await supabaseEtiquetas
        .from('personal')
        .update({
          status: 'ENTREGADO',
          date_entre: deliveryTimestamp,
          driver_name: itemDriverName,
          driver_plate: itemDriverPlate,
          name_entrega: itemEncargado || 'N/A',
          id_empleado_entrega: itemUserId,
        })
        .in('code', applicable);
      if (updateError) throw updateError;

      await saveKpiData(itemEncargado, applicable.length, 0, undefined, itemUserId);
    }

    if (blocked.length > 0) {
      // Reduce el item a solo los códigos en conflicto, para no reprocesar
      // los que ya se sincronizaron si el supervisor reintenta.
      await updateQueueItem(item.id, { payload: { ...item.payload, codes: blocked } });
      return 'conflict';
    }
    return 'synced';
  };

  const { pendingCount, conflicts, isSyncing, refresh: refreshSync, retryConflict, discardConflict } = useOfflineSync('entrega', processDeliverItem);

  const handleUpdateStatusToDelivered = async () => {
    if (!driverName.trim() || !driverPlate.trim()) {
        alert("Por favor, completa el nombre del conductor y las placas.");
        return;
    }

    setLoading(true);
    showAppMessage(isOnline ? 'Actualizando estados...' : 'Guardando para sincronizar...', 'info');

    const codesToUpdate = deliveryList.map(item => item.code);
    const deliveryTimestamp = new Date().toISOString();

    if (!isOnline) {
      try {
        await enqueue({
          id: crypto.randomUUID(),
          page: 'entrega',
          type: 'deliver',
          payload: { codes: codesToUpdate, driverName, driverPlate, encargado, deliveryTimestamp, userId: user?.id ?? null } as DeliverPayload,
          createdAt: Date.now(),
        });
        await refreshSync();

        setIsDeliveryModalOpen(false);
        showModalNotification('Guardado sin conexión', `Se encolaron ${codesToUpdate.length} paquetes. Se sincronizarán automáticamente cuando vuelva la conexión.`);
        setDeliveryList([]);
        scannedCodesRef.current.clear();
        localStorage.removeItem(STORAGE_KEY);
        setDriverName('');
        setDriverPlate('');
        setLotesCargadosCount(0);
        showAppMessage('Esperando para escanear...', 'info');
      } catch (e: any) {
        showModalNotification('Error al Guardar', `No se pudo encolar la entrega: ${e.message}`, 'destructive');
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const { error } = await supabaseEtiquetas
        .from('personal')
        .update({
            status: 'ENTREGADO',
            date_entre: deliveryTimestamp,
            driver_name: driverName,
            driver_plate: driverPlate,
            name_entrega: encargado || 'N/A',
            id_empleado_entrega: user?.id ?? null
        })
        .in('code', codesToUpdate);

      if (error) throw error;

      if (codesToUpdate.length > 0) {
          await saveKpiData(encargado, codesToUpdate.length, 0, undefined, user?.id ?? null);
      }

      setIsDeliveryModalOpen(false);
      showModalNotification('Éxito', `Se marcaron ${deliveryList.length} paquetes como "ENTREGADO".`);
      setDeliveryList([]);
      scannedCodesRef.current.clear();
      localStorage.removeItem(STORAGE_KEY); // Limpiar almacenamiento al finalizar con éxito
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
    if (!isOnline) {
      showAppMessage('Necesitas conexión para cargar un lote nuevo. Los lotes ya cargados en esta sesión siguen disponibles sin conexión.', 'warning');
      return;
    }
    setLoading(true);
    showAppMessage(`Buscando paquetes del lote ${loteId}...`, 'info');

    try {
      const { data, error } = await supabaseEtiquetas
        .from('personal')
        .select('code, product, name, status, origen, sku')
        .eq('lote', loteId.trim());

      if (error) throw error;

      if (!data || data.length === 0) {
        showAppMessage(`No se encontraron paquetes para el lote ${loteId}.`, 'warning');
        return;
      }

      // Subcategoría del lote completo cruzada EN LOTE (dos consultas con .in()), no una por
      // fila: así cargar un lote grande no dispara N viajes secuenciales.
      const subcatMap = await buildSubcatMap(data.map((item: any) => item.sku));

      // Guardar snapshot local (nombre/producto/status/subcategoría) para poder validar y
      // mostrar la subcategoría de estos códigos sin conexión más adelante en la sesión.
      const snapshotEntries: Record<string, SnapshotEntry> = {};
      data.forEach((item: any) => {
        snapshotEntries[String(item.code)] = { name: item.name, product: item.product, status: item.status, subcategoria: subcatFromMap(item.sku, subcatMap) };
      });
      snapshotRef.current = { ...snapshotRef.current, ...snapshotEntries };
      mergeSnapshotEntries('entrega', snapshotEntries).catch((err) => console.error('Error guardando snapshot offline:', err));

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
            origen: item.origen,
            subcategoria: subcatFromMap(item.sku, subcatMap),
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
    
    const reader = new FileReader();

    reader.onload = async (e) => {
        let text = e.target?.result as string;
        if (text) {
            // Remove BOM if present, which is common in files from Excel/mobile.
            if (text.startsWith('\uFEFF')) {
                text = text.substring(1);
            }

            Papa.parse(text, {
              header: true,
              skipEmptyLines: true,
              complete: async (results) => {
                
                if (!results.meta.fields || results.meta.fields.length === 0) {
                    showModalNotification('Error de Formato', 'El archivo CSV no parece tener encabezados o está vacío.', 'destructive');
                    setLoading(false);
                    return;
                }

                // Helper to find header names flexibly
                const findHeader = (fields: readonly string[], keywords: string[]): string | undefined => {
                    for (const keyword of keywords) {
                        const header = fields.find(f => f.toLowerCase().trim().includes(keyword));
                        if (header) return header;
                    }
                    return undefined;
                };

                // Find header names dynamically
                const codeHeader = findHeader(results.meta.fields, ['code', 'código', 'text']);
                const dateHeader = findHeader(results.meta.fields, ['date', 'fecha']);
                const timeHeader = findHeader(results.meta.fields, ['time', 'hora']);

                if (!codeHeader || !dateHeader || !timeHeader) {
                    const missing = [];
                    if (!codeHeader) missing.push("código/code/text");
                    if (!dateHeader) missing.push("fecha/date");
                    if (!timeHeader) missing.push("hora/time");
                    showModalNotification('Error de Formato', `El archivo CSV no contiene los encabezados esperados. Faltan columnas para: ${missing.join(', ')}.`, 'destructive');
                    setLoading(false);
                    return;
                }

                const dataRows = results.data as Record<string, string>[];

                const validEntries = dataRows.map(row => {
                    // Use header names to access data
                    let codeValue = row[codeHeader] ? String(row[codeHeader]).trim() : null;
                    const dateStr = row[dateHeader] ? String(row[dateHeader]).trim() : null;
                    const timeStr = row[timeHeader] ? String(row[timeHeader]).trim() : null;

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

                    // A simple validation for the code format can be useful
                    if (!/^\d+$/.test(codeValue)) {
                        return null;
                    }

                    return { code: codeValue, date: dateObj };
                }).filter(Boolean) as { code: string, date: Date }[];


                if (validEntries.length === 0) {
                    setCsvProcessingStats({ found: 0, notFound: 0, total: dataRows.length, elapsedTime: 'N/A' });
                    setIsNotFoundModalOpen(true);
                    setLoading(false);
                    return;
                }

                // Calculate time
                validEntries.sort((a, b) => a.date.getTime() - b.date.getTime()); // Sort entries by date to be sure
                const firstDate = validEntries[0].date;
                const lastDate = validEntries[validEntries.length - 1].date;
                const diff = lastDate.getTime() - firstDate.getTime();
                const timeInSeconds = Math.round(diff / 1000);
                const elapsedTime = formatElapsedTime(timeInSeconds);

                const codesFromCsv = validEntries.map(entry => entry.code);
                const csvDataMap = new Map(validEntries.map(entry => [entry.code, entry.date.toISOString()]));

                try {
                  const { data: existingCodes, error: fetchError } = await supabaseEtiquetas
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
                      await saveKpiData(encargado, codesToUpdate.length, timeInSeconds, file.name, user?.id ?? null);

                      const updatePromises = codesToUpdate.map(code => 
                          supabaseEtiquetas
                              .from('personal')
                              .update({
                                  status: 'ENTREGADO',
                                  date_entre: csvDataMap.get(code),
                                  name_entrega: encargado || 'N/A',
                                  id_empleado_entrega: user?.id ?? null
                              })
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
        }
    };
    
    reader.onerror = () => {
        showModalNotification('Error de Archivo', 'No se pudo leer el archivo seleccionado.', 'destructive');
        setLoading(false);
    };

    reader.readAsText(file);
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
      const { data, error } = await supabaseEtiquetas
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
            <div className="w-full max-md mx-auto bg-starbucks-white rounded-xl shadow-2xl p-4 md:p-6 space-y-4">
                <header className="text-center">
                    <h1 className="text-xl md:text-2xl font-bold text-starbucks-green">Módulo de Entrega</h1>
                    <p className="text-gray-600 text-sm mt-1">Escanea los paquetes para confirmar su entrega.</p>
                </header>

                {!isOnline && (
                    <div className="flex items-center justify-center gap-2 bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold uppercase tracking-wide p-2 rounded-lg">
                        <WifiOff className="h-4 w-4" />
                        Sin conexión — usando datos guardados
                    </div>
                )}

                {pendingCount > 0 && (
                    <div className="flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold p-2 rounded-lg">
                        {isSyncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                        {pendingCount} entrega(s) pendiente(s) de sincronizar
                    </div>
                )}

                {conflicts.length > 0 && (
                    <div className="bg-red-50 border border-red-300 rounded-lg p-3 space-y-2">
                        <h3 className="text-sm font-black text-red-700 uppercase tracking-wide flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" /> Conflictos de sincronización ({conflicts.length})
                        </h3>
                        <p className="text-xs text-red-600">
                            Estos códigos cambiaron de estado en otro dispositivo mientras este estaba sin conexión. Revísalos y decide manualmente.
                        </p>
                        <ul className="space-y-2">
                            {conflicts.map((c) => (
                                <li key={c.id} className="bg-white border border-red-200 rounded-md p-2 text-xs space-y-2">
                                    <div className="font-mono break-all">{((c.payload as DeliverPayload).codes || []).join(', ')}</div>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => retryConflict(c.id)}>Reintentar</Button>
                                        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => discardConflict(c.id)}>Descartar</Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label htmlFor="encargado" className="block text-sm font-bold text-starbucks-dark mb-1">Nombre del Encargado:</label>
                         <Combobox
                            groupedOptions={groupedEncargadoOptions}
                            value={isMounted ? encargado : ''}
                            onValueChange={setEncargado}
                            placeholder="Selecciona un encargado..."
                            emptyMessage="No se encontró encargado."
                            buttonClassName="bg-transparent hover:bg-gray-50 border-input"
                            disabled={true}
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
                    <div className="scanner-container relative aspect-square max-h-[50vh] mx-auto bg-black rounded-lg overflow-hidden">
                        <div className="w-full h-full" style={{ display: selectedScannerMode === 'camara' && scannerActive ? 'block' : 'none' }}>
                          {selectedScannerMode === 'camara' && scannerActive && (
                            <BarcodeScanner
                              onDetected={onScanSuccess}
                              onTrackReady={(track) => {
                                trackRef.current = track;
                                if (isMobile) getCameraCapabilitiesWithRetry(track).then((caps) => {
                                  setCameraCapabilities(caps);
                                  applyCameraConstraints(track);
                                });
                              }}
                              onError={(e) => { console.error('Error de cámara (entrega):', e); showAppMessage('No se pudo iniciar la cámara. Revisa los permisos.', 'error'); setScannerActive(false); }}
                            />
                          )}
                        </div>
                         {message.show && (
                            <div className={`scanner-message ${messageClasses[message.type]}`}>
                                {message.text}
                            </div>
                        )}
                         <input type="text" id="physical-scanner-input" ref={physicalScannerInputRef} className="hidden-input" autoComplete="off" />
                         {selectedScannerMode === 'camara' && !scannerActive && (
                             <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center w-full h-full">
                                <p className="text-gray-500">La cámara está desactivada.</p>
                            </div>
                         )}
                    </div>
                    
                     {isMounted && isMobile && scannerActive && selectedScannerMode === 'camara' && cameraCapabilities && (
                        <div id="camera-controls" className="flex items-center gap-4 mt-4 p-2 rounded-lg bg-gray-200">
                            {cameraCapabilities.torch && (
                                <Button variant="ghost" size="icon" onClick={() => setIsFlashOn(prev => !prev)} className={cn("h-10 w-10", isFlashOn ? 'text-yellow-400 bg-white/10' : 'text-white')}>
                                    <Zap className="h-5 w-5" />
                                </Button>
                            )}
                            {cameraCapabilities.zoom && (
                                <div className="flex-1 flex items-center gap-4">
                                    <ZoomIn className="h-5 w-5 text-gray-400" />
                                    <input
                                        id="zoom-slider"
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
                            id="lote-entrega-btn"
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

                    {/* Móvil: cards abatibles (la tabla se salía y el nombre del producto
                        estiraba cada fila; ahora se despliega solo al tocar). */}
                    <div className="md:hidden max-h-[60vh] overflow-auto pr-0.5">
                        {deliveryList.length > 0 ? deliveryList.map((item, index) => (
                            <MobileDeliveryRow
                                key={item.code}
                                data={item}
                                index={index}
                                isOpen={openSwipeCode === item.code}
                                onOpenChange={setOpenSwipeCode}
                                onDelete={removeFromList}
                            />
                        )) : (
                            <div className="text-center text-gray-500 py-10 text-[11px] uppercase font-bold">No hay paquetes en la lista.</div>
                        )}
                    </div>

                    {/* Escritorio: tabla completa con las nuevas columnas Subcategoría y Despachó. */}
                    <div className="hidden md:block table-container border border-gray-200 rounded-lg max-h-60 overflow-auto">
                        <Table>
                            <TableHeader className="sticky top-0 bg-starbucks-cream">
                                <TableRow>
                                    <TableHead>Código</TableHead>
                                    <TableHead>Producto</TableHead>
                                    <TableHead>Subcategoría</TableHead>
                                    <TableHead>Despachó</TableHead>
                                    <TableHead className="text-right">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {deliveryList.length > 0 ? deliveryList.map((item) => (
                                    <TableRow key={item.code}>
                                        <TableCell className="font-mono text-xs">
                                            <div className="flex items-center gap-1.5">
                                                {item.code}
                                                {item.origen && item.origen !== 'Mercado Libre' && (
                                                    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide">{item.origen}</span>
                                                )}
                                                {item.unverified && (
                                                    <span title="No estaba en un lote precargado; se validará al sincronizar" className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                                                        <AlertTriangle className="h-2.5 w-2.5" /> Sin verificar
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs">{item.product || 'N/A'}</TableCell>
                                        <TableCell className="text-xs font-black text-amber-700 uppercase">{item.subcategoria || 'N/A'}</TableCell>
                                        <TableCell className="text-xs">{item.name || 'N/A'}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => removeFromList(item.code)} className="text-red-500 hover:text-red-700 h-8 w-8">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center text-gray-500 py-8">
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
                     <div className="bg-starbucks-white rounded-lg shadow-xl p-6 w-full max-sm text-center space-y-4">
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
