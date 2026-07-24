'use client';
import {useEffect, useRef, useState, useCallback, useMemo} from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { supabase, supabaseEtiquetas } from '@/lib/supabaseClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
    AlertTriangle,
    ChevronDown,
    Trash2,
    Zap, 
    ZoomIn, 
    PlusCircle, 
    Download, 
    Clock, 
    FileWarning, 
    Search,
    Loader2,
    Check,
    Hourglass,
    RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import { useIsMobile } from '@/hooks/use-mobile';
import { Switch } from '@/components/ui/switch';
import { Combobox } from '@/components/ui/combobox';
import { useAuth } from '@/components/AuthProvider';
import { Textarea } from '@/components/ui/textarea';
import { cn, getCameraCapabilitiesWithRetry, withTimeout, esErrorDeRed, marketplaceFromOrigen, resolveOrganizationParaMarketplace } from '@/lib/utils';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { useOfflineSync, SyncOutcome } from '@/hooks/use-offline-sync';
import { enqueue, mergeSnapshotEntries, getSnapshotEntries, updateQueueItem, SnapshotEntry, QueueItem } from '@/lib/offlineDb';

// Escáner NUEVO (zxing-wasm), el mismo de /devoluciones, /entrega y /asignar. Solo cliente.
// Convive con el viejo (html5-qrcode); el usuario elige cuál usar.
const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false });

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
    // Escaneado sin conexión y sin estar en un lote precargado: no se pudo validar
    // contra el servidor. Se califica igual (el producto se lee de la etiqueta física)
    // y se revalida al sincronizar; si el código no existe, saldrá como conflicto.
    unverified?: boolean;
    // Operario que despachó/empaquetó la etiqueta (personal.id_empleado_despacha),
    // que es a quien se le atribuye la incidencia. No confundir con
    // id_empleado_entrega: ese lo escribe /entrega al entregar, o sea después de QC,
    // así que al calificar todavía está en null.
    id_empleado_despacha?: string | null;
    // Plataforma de origen: null/'Mercado Libre' = ML; 'Walmart'/'TikTok Shop'/... = externa.
    origen?: string | null;
};

type ReportReason = {
    id: number;
    t_report: string;
};

type Encargado = {
  name: string;
  rol: string;
  organization: string;
};

type LoteConfirmationState = {
  isOpen: boolean;
  existingCount: number;
  newCount: number;
};

type InventoryCategory = {
    subcategoria: string;
};

const STORAGE_KEY = 'calificar_session_list';
// La operación es en México: fecha y hora se fijan a esta zona en vez de depender
// de la del equipo (o de UTC), para que ambas describan el mismo instante local.
const MX_TIMEZONE = 'America/Mexico_City';

// Desplazamiento al deslizar la card para revelar "Eliminar" (mismo criterio que /asignar).
const SWIPE_OPEN_X = -84;

// Card abatible para la lista masiva en móvil. Calcada de MobilePendingRow de /asignar:
// deslizar a la izquierda revela Eliminar; tocar la cabecera despliega el detalle (producto
// completo, empaquetado por, SKU/piezas) y el botón de Reportar Discrepancia. Sustituye la
// tabla que en móvil crecía muchísimo porque el nombre del producto se partía en 10+ líneas.
function MobileMassRow({
  data,
  index,
  isOpen,
  onOpenChange,
  onDelete,
  onReport,
}: {
  data: ScanResult;
  index: number;
  isOpen: boolean;
  onOpenChange: (code: string | null) => void;
  onDelete: (code: string) => void;
  onReport: (item: ScanResult) => void;
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
              <span title="Escaneado sin conexión; se validará al sincronizar" className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide shrink-0">
                <AlertTriangle className="h-2.5 w-2.5" /> Sin verif.
              </span>
            )}
            {data.isNew && <span className="text-[7px] font-black text-green-600 border border-green-200 px-1 rounded-sm bg-green-50 shrink-0">NUEVO</span>}
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
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] mb-2.5">
                  <div><dt className="text-[8px] font-black uppercase tracking-wide text-gray-400">Empaquetado por</dt><dd className="font-semibold text-starbucks-dark break-words">{data.name || 'N/A'}</dd></div>
                  <div><dt className="text-[8px] font-black uppercase tracking-wide text-gray-400">SKU</dt><dd className="font-semibold text-starbucks-dark break-words">{data.sku || 'N/A'}</dd></div>
                  <div><dt className="text-[8px] font-black uppercase tracking-wide text-gray-400">Piezas</dt><dd className="font-semibold text-starbucks-dark">{data.quantity ?? 'N/A'}</dd></div>
                  {data.sales_num ? <div><dt className="text-[8px] font-black uppercase tracking-wide text-gray-400">Venta</dt><dd className="font-semibold text-starbucks-dark break-words">{data.sales_num}</dd></div> : null}
                </dl>
                <Button
                  onClick={(e) => { e.stopPropagation(); onReport(data); }}
                  variant="outline"
                  className="w-full h-8 text-[11px] font-bold text-amber-600 border-amber-300 hover:bg-amber-50 gap-1.5"
                >
                  <FileWarning className="h-3.5 w-3.5" /> Reportar Discrepancia
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Payload de una calificación encolada sin conexión. */
type CalificarPayload = {
  /** Códigos ya existentes en `personal` que pasan a CALIFICADO. */
  codes: string[];
  /** Filas nuevas (etiquetas que no existían) listas para insertar. */
  inserts: any[];
  qualificationTimestamp: string;
  encargado: string;
  userId: string | null;
  lote: string;
  elapsedTime: number;
};

// Al sincronizar no se pisa un paquete que ya avanzó en el flujo: si mientras el
// dispositivo estaba sin red alguien lo entregó o lo canceló, calificarlo ahora
// sería incorrecto. CALIFICADO no bloquea: reaplicarlo es idempotente.
const ESTADOS_BLOQUEANTES_CALIFICAR = new Set(['ENTREGADO', 'CANCELADO', 'DEVUELTO']);

export default function CalificarPage() {
  const { profile, user } = useAuth();
  const isOnline = useOnlineStatus();
  // Snapshot local de `personal` (lo que se precargó por lote con conexión): permite
  // validar y MOSTRAR los datos del paquete al escanear sin red.
  const snapshotRef = useRef<Record<string, SnapshotEntry>>({});
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
  // Motor de cámara: 'viejo' = html5-qrcode (el actual), 'nuevo' = BarcodeScanner
  // zxing-wasm (el de /devoluciones, /entrega y /asignar). Se recuerda por dispositivo.
  const [scannerEngine, setScannerEngine] = useState<'viejo' | 'nuevo'>('viejo');
  const [encargado, setEncargado] = useState('');
  const [encargadosList, setEncargadosList] = useState<Encargado[]>([]);
  const [scanMode, setScanMode] = useState('individual');
  const [massScannedCodes, setMassScannedCodes] = useState<ScanResult[]>([]);
  // Código de la card móvil actualmente deslizada/revelada (para eliminar). Vive aquí
  // arriba de MobileMassRow para que abrir una cierre la otra.
  const [openSwipeMassCode, setOpenSwipeMassCode] = useState<string | null>(null);
  const [cameraCapabilities, setCameraCapabilities] = useState<any>(null);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const isMobile = useIsMobile();
  const [loteId, setLoteId] = useState('');
  const [isNextDayDelivery, setIsNextDayDelivery] = useState(false);
  const [loteToLoad, setLoteToLoad] = useState('');
  const [loteConfirmation, setLoteConfirmation] = useState<LoteConfirmationState>({ isOpen: false, existingCount: 0, newCount: 0 });
  const [timerStartTime, setTimerStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  // Pulso del contador flotante al agregar un escaneo: señal visual infalible de
  // que SÍ contó, independiente del mensaje transitorio (fácil de perder offline).
  const [scanPulse, setScanPulse] = useState(false);
  const prevMassCountRef = useRef(0);

  const [isDiscrepancyModalOpen, setIsDiscrepancyModalOpen] = useState(false);
  const [itemToReport, setItemToReport] = useState<ScanResult | null>(null);
  const [searchQueryDespachado, setSearchQueryDespachado] = useState('');
  // Texto de búsqueda mientras el desplegable está abierto — separado del valor
  // seleccionado (searchQueryDespachado) para que escribir/borrar mientras se
  // busca nunca modifique la selección real; esta solo cambia al elegir un
  // elemento de la lista.
  const [subcategoriaSearchDraft, setSubcategoriaSearchDraft] = useState('');
  // Subcategoría del SKU solicitado, resuelta al abrir el modal. Se guarda aparte
  // de `searchQueryDespachado` porque esa última arranca con este mismo valor como
  // default pero el operador la cambia por lo que encontró físicamente; sin este
  // estado, el producto solicitado se perdería al momento de guardar.
  const [subcatSolicitada, setSubcatSolicitada] = useState<string | null>(null);
  const [isInventoryPopoverOpen, setIsInventoryPopoverOpen] = useState(false);
  const [piezasDespachadas, setPiezasDespachadas] = useState('');
  const [observacionesIncidencia, setObservacionesIncidencia] = useState('');
  const [inventoryList, setInventoryList] = useState<InventoryCategory[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [retrabajosAbiertos, setRetrabajosAbiertos] = useState(0);

  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  // Track del escáner NUEVO (lo expone <BarcodeScanner/> vía onTrackReady): sobre él se
  // aplican flash/zoom, igual que el viejo lo hace sobre el <video> de html5-qrcode.
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const lastScanTimeRef = useRef(Date.now());
  const MIN_SCAN_INTERVAL = 2000;
  // Si el token de sesión queda a medio refrescar (celular en segundo plano un
  // rato, red inestable), una consulta puede quedarse colgada sin resolver ni
  // rechazar. Sin este timeout, el finally de onScanSuccess nunca corre, `loading`
  // queda pegado en true y la pantalla deja de aceptar escaneos hasta cerrar sesión.
  // 4s (antes 15s): con "online fantasma" —iOS reporta red sin tenerla— el fetch se
  // cuelga hasta que el navegador se rinde solo, y el operario se quedaba mirando la
  // pantalla 15s por cada etiqueta antes del error. Con este tope se degrada rápido
  // al camino offline (snapshot / cola).
  const SCAN_QUERY_TIMEOUT_MS = 4000;
  const massScannedCodesRef = useRef(new Set<string>());
  const physicalScannerInputRef = useRef<HTMLInputElement | null>(null);
  const bufferRef = useRef('');
  const timerStartedRef = useRef(false);
  // Refleja `loading` sin ser una dependencia reactiva de onScanSuccess: si
  // `loading` estuviera en las deps de ese useCallback, su identidad cambiaría
  // en cada escaneo (loading pasa a true y luego a false), lo que reinicia el
  // efecto que arranca/detiene la cámara y apaga el flash/zoom en cada escaneo.
  const loadingRef = useRef(false);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Preferencia de motor de escáner, recordada por dispositivo.
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('calificar_scanner_engine') : null;
    if (saved === 'viejo' || saved === 'nuevo') setScannerEngine(saved);
  }, []);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('calificar_scanner_engine', scannerEngine);
  }, [scannerEngine]);

   // Dispara el pulso del contador cada vez que la lista CRECE (un escaneo nuevo
  // que contó). Se ignora cuando decrece (borrados) o al restaurar la sesión.
  useEffect(() => {
    if (massScannedCodes.length > prevMassCountRef.current) {
      setScanPulse(true);
      const t = setTimeout(() => setScanPulse(false), 550);
      prevMassCountRef.current = massScannedCodes.length;
      return () => clearTimeout(t);
    }
    prevMassCountRef.current = massScannedCodes.length;
  }, [massScannedCodes.length]);

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

    // Recuperar datos de LocalStorage
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.list)) {
            setMassScannedCodes(parsed.list);
            parsed.list.forEach((item: ScanResult) => massScannedCodesRef.current.add(item.code));
          }
          if (parsed.loteId) setLoteId(parsed.loteId);
          if (parsed.isNextDayDelivery !== undefined) setIsNextDayDelivery(parsed.isNextDayDelivery);
        }
      } catch (e) {
        console.error("Error al recuperar sesión de calificación:", e);
      }
    }

    // Recuperar el snapshot de lotes precargados, por si la app se recargó
    // mientras estaba sin conexión.
    getSnapshotEntries('calificar').then((entries) => {
      snapshotRef.current = entries;
    }).catch((err) => console.error('Error leyendo snapshot offline:', err));
  }, []);

  // Guardar en LocalStorage cada vez que cambien los datos clave
  useEffect(() => {
    if (isMounted) {
      const dataToSave = {
        list: massScannedCodes,
        loteId,
        isNextDayDelivery
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    }
  }, [massScannedCodes, loteId, isNextDayDelivery, isMounted]);

  // Vincular encargado con el perfil de usuario logueado o buscar en empleados por email
  useEffect(() => {
    if (!user?.email) return;

    // El padrón de `empleados` es la fuente preferida, pero el perfil identifica a la
    // MISMA persona autenticada, así que como mucho cambia la ortografía. Se compara el
    // id aunque AuthProvider ya llavee su caché offline por userId: en un celular
    // compartido entre turnos este es el punto donde el perfil de otro operario se
    // convertiría en una atribución falsa, así que se falla cerrado.
    // La atribución real es id_empleado_calificada = user.id; name_cali es solo display.
    // Este respaldo NUNCA deja `encargado` vacío (vacío mata el botón Iniciar y el ingreso
    // manual, y obligaba a cerrar sesión). Todo se saca de la SESIÓN, sin captura manual:
    // se prefiere el nombre del perfil; si no hay, se deriva algo legible del email; y como
    // último recurso una etiqueta genérica.
    const aplicarRespaldo = () => {
        const fallback =
            (profile?.id === user.id && profile.name)
                ? profile.name
                : (user.email
                    ? user.email.split('@')[0].replace(/[._-]+/g, ' ').toUpperCase()
                    : 'CONTROL DE CALIDAD');
        setEncargado(fallback);
    };

    const fetchNameFromEmployees = async (isRetry = false) => {
        try {
            const { data, error } = await withTimeout(supabaseEtiquetas
                .from('empleados')
                .select('nombres, apellido_paterno, apellido_materno')
                .eq('email', user.email)
                .maybeSingle(), 15000);

            // Antes se ignoraba `error` por completo: un token vencido devuelve
            // data=null aquí, y sin `profile.name` de respaldo el encargado se
            // quedaba en blanco para siempre, sin ningún reintento. Si hay error,
            // se fuerza un refreshSession() y se reintenta una vez — si el token
            // de verdad estaba vencido, esto lo repara sin necesidad de cerrar sesión.
            if (error) {
                if (!isRetry) {
                    console.warn("[calificar] Error trayendo encargado, reintentando tras refrescar sesión:", error);
                    const { error: refreshError } = await supabaseEtiquetas.auth.refreshSession();
                    if (!refreshError) {
                        await fetchNameFromEmployees(true);
                        return;
                    }
                }
                throw error;
            }

            if (data) {
                const fullName = [data.nombres, data.apellido_paterno, data.apellido_materno].filter(Boolean).join(' ').toUpperCase();
                setEncargado(fullName);
            } else {
                aplicarRespaldo();
            }
        } catch (err) {
            console.error("Error fetching name for calificar encargado:", err);
            // Este catch era terminal y dejaba `encargado` vacío, y con él el botón de
            // escanear muerto (`disabled={... || !encargado}`), sin más rastro que un log
            // que nadie ve en un celular de piso. Justamente los dos casos que llegan aquí
            // —sin red y token vencido— son para los que se escribió el respaldo, así que
            // era el único camino en que no se usaba. Ojo al recolocarlo: postgrest NO
            // lanza ante un fallo de red (devuelve {data:null,error}), de modo que el
            // `throw error` de arriba es lo que trae ese caso hasta aquí.
            aplicarRespaldo();
        }
    };

    fetchNameFromEmployees();
  }, [user, profile]);

  const fetchInventoryItems = useCallback(async (query: string = '') => {
    setLoadingInventory(true);
    try {
        // sku_m es la fuente autoritativa de subcategorías (una por SKU), y puede
        // tener muchas más filas que el límite de página de Supabase/PostgREST
        // (por defecto 1000): una subcategoría podría existir solo en filas más
        // allá de la primera página. Se pagina con .range() hasta agotar la tabla
        // (o el filtro) para no perder ninguna, en vez de confiar en un .limit().
        const PAGE_SIZE = 1000;
        const MAX_PAGES = 50; // salvaguarda: hasta 50,000 filas
        const subcategorySet = new Set<string>();
        let from = 0;
        let page = 0;

        while (page < MAX_PAGES) {
            let queryBuilder = supabaseEtiquetas
                .from('sku_m')
                .select('sub_cat')
                .range(from, from + PAGE_SIZE - 1);

            if (query) {
                queryBuilder = queryBuilder.ilike('sub_cat', `%${query}%`);
            }

            const { data, error } = await queryBuilder;
            if (error) throw error;

            (data ?? []).forEach((item: any) => {
                if (item.sub_cat) subcategorySet.add(item.sub_cat);
            });

            if (!data || data.length < PAGE_SIZE) break;
            from += PAGE_SIZE;
            page += 1;
        }

        if (page >= MAX_PAGES) {
            console.warn('fetchInventoryItems: se alcanzó el límite de páginas de seguridad; puede haber subcategorías sin cargar.');
        }

        const uniqueSubcategories = Array.from(subcategorySet)
            .sort()
            .map(sub => ({ subcategoria: sub }));

        setInventoryList(uniqueSubcategories);
    } catch (e) {
        console.error("Error fetching inventory subcategories:", e);
    } finally {
        setLoadingInventory(false);
    }
  }, []);

  useEffect(() => {
    if (isInventoryPopoverOpen && inventoryList.length === 0) {
        fetchInventoryItems('');
    }
  }, [isInventoryPopoverOpen, inventoryList.length, fetchInventoryItems]);

  useEffect(() => {
    const timer = setTimeout(() => {
        if (isInventoryPopoverOpen) {
            fetchInventoryItems(subcategoriaSearchDraft);
        }
    }, 400);
    return () => clearTimeout(timer);
  }, [subcategoriaSearchDraft, fetchInventoryItems, isInventoryPopoverOpen]);

  const groupedEncargadoOptions = useMemo(() => {
    let list = [...encargadosList];
    
    if (encargado && !list.some(e => e.name === encargado)) {
        list.push({ name: encargado, rol: 'Control de calidad', organization: 'Usuario Actual' });
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
  }, [encargadosList, encargado]);

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
    return () => { if (interval) clearInterval(interval); };
  }, [timerStartTime]);

  // Un SOLO AudioContext reutilizado. En Safari iOS un contexto nace 'suspended' y
  // solo se puede desbloquear dentro de un gesto del usuario; crear uno nuevo por
  // beep (como antes) hacía que casi nunca se oyera en el iPhone. Se desbloquea al
  // tocar "Iniciar" (unlockAudio) y de ahí en adelante los beeps suenan.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const getAudioCtx = (): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (!audioCtxRef.current) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      audioCtxRef.current = new Ctor();
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume().catch(() => {});
    return audioCtxRef.current;
  };
  // Llamar desde un gesto (botón Iniciar) para que iOS habilite el audio.
  const unlockAudio = () => { getAudioCtx(); };

  const tone = (freq: number, durationS: number, type: OscillatorType, gain: number) => {
    const context = getAudioCtx();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, context.currentTime);
    gainNode.gain.setValueAtTime(gain, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + durationS);
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + durationS);
  };

  const playBeep = () => tone(880, 0.1, 'square', 1);
  const playWarningSound = () => tone(440, 0.2, 'sawtooth', 1.5);

  // Señal de ESCANEO EXITOSO: beep + vibración. Doble tono ascendente para que se
  // distinga claramente del "ya procesado"/error. La vibración es no-op en Safari
  // iOS (Apple no soporta navigator.vibrate), pero funciona en Android.
  const signalSuccess = () => {
    tone(660, 0.09, 'square', 0.9);
    const ctx = audioCtxRef.current;
    if (ctx) {
      // Segundo tono un pelín después, sobre el mismo contexto.
      window.setTimeout(() => tone(990, 0.11, 'square', 0.9), 90);
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate([45, 35, 70]);
  };

  const onScanSuccess = useCallback(async (decodedText: string) => {
    if (loadingRef.current || Date.now() - lastScanTimeRef.current < MIN_SCAN_INTERVAL) return;
    lastScanTimeRef.current = Date.now();
    setLoading(true);
    showAppMessage('Procesando código...', 'info');
    // La vibración se movió al momento de ÉXITO (signalSuccess): antes vibraba en
    // cada intento de lectura, aunque el código fuera duplicado o ilegible.

    let finalCode = decodedText;
    try {
        const parsed = JSON.parse(decodedText);
        if (parsed && parsed.id) finalCode = String(parsed.id);
    } catch (e) {}
    
    finalCode = String(finalCode).trim();
    if (scanMode === 'masivo' && massScannedCodesRef.current.has(finalCode)) {
        showAppMessage(`Código duplicado: ${finalCode}`, 'warning');
        setLoading(false);
        return;
    }
    
    // Aplica una fila de `personal` al flujo de calificación. Venga de la red o del
    // snapshot offline, el comportamiento debe ser idéntico: por eso se extrajo aquí
    // en vez de duplicar la lógica en el camino sin conexión.
    const aplicarFilaPersonal = (
        fila: {
            name: string | null; product: string | null; status: string;
            details?: string | null; sku?: string | null; quantity?: number | null;
            id_empleado_despacha?: string | null; origen?: string | null;
        },
        offline: boolean,
    ) => {
        if (!timerStartedRef.current) {
            setTimerStartTime(new Date());
            timerStartedRef.current = true;
        }
        const result: ScanResult = {
            name: fila.name,
            product: fila.product,
            code: finalCode,
            found: true,
            status: fila.status,
            details: fila.details ?? null,
            sku: fila.sku ?? null,
            quantity: fila.quantity ?? null,
            id_empleado_despacha: fila.id_empleado_despacha ?? null,
            origen: fila.origen ?? null,
        };
        const sufijo = offline ? ' (sin conexión)' : '';

        // Un paquete que vuelve de retrabajo se avisa distinto: no es un escaneo
        // normal, es una recalificación tras haberse corregido una discrepancia.
        const vieneDeRetrabajo = fila.status === 'RETRABAJANDO';

        if (fila.status === 'CALIFICADO') {
            playWarningSound();
            showAppMessage(`Etiqueta ya procesada (Estado: ${fila.status}).`, 'warning');
            setLastScannedResult(result);
        } else {
             if (scanMode === 'individual') {
                setLastScannedResult(result);
                if (vieneDeRetrabajo) {
                    playWarningSound();
                    showAppMessage('Paquete Retrabajado: volver a calificar.', 'warning');
                } else {
                    signalSuccess();
                    showAppMessage(`Etiqueta confirmada correctamente${sufijo}.`, 'success');
                }
                setIsRatingModalOpen(true);
            } else {
                if (vieneDeRetrabajo) {
                    playWarningSound();
                    showAppMessage(`Paquete Retrabajado: volver a calificar (${finalCode}).`, 'warning');
                }
                else if (fila.status === 'REPORTADO') { signalSuccess(); showAppMessage(`Añadido (Reportado): ${finalCode}`, 'info'); }
                else { signalSuccess(); showAppMessage(`Añadido a la lista${sufijo}: ${finalCode}`, 'success'); }
                setMassScannedCodes(prev => [result, ...prev]);
                massScannedCodesRef.current.add(finalCode);
            }
        }
    };

    // Escaneo SIN conexión. Si el código está en el snapshot del lote precargado,
    // se muestran sus datos reales. Si NO está, se acepta igual como "sin verificar":
    // el producto se lee de la etiqueta física, así que el calificador puede juzgarlo
    // aunque la app no tenga los datos. Se revalida al sincronizar (y si el código no
    // existe en la base, saldrá como conflicto para revisión manual).
    const escanearDesdeSnapshot = () => {
        const fila = snapshotRef.current[finalCode];
        if (fila) {
            aplicarFilaPersonal(fila, true);
            return;
        }

        signalSuccess();
        if (!timerStartedRef.current) {
            setTimerStartTime(new Date());
            timerStartedRef.current = true;
        }
        // isNew:false → al sincronizar se intenta un UPDATE a CALIFICADO; si el código
        // no existe, processCalificarItem lo marca como conflicto (no lo inventa).
        const result: ScanResult = { name: null, product: null, code: finalCode, found: true, status: null, unverified: true, isNew: false };

        if (scanMode === 'individual') {
            setLastScannedResult(result);
            showAppMessage(`Sin verificar (sin conexión): ${finalCode}`, 'warning');
            setIsRatingModalOpen(true);
        } else {
            setMassScannedCodes(prev => [result, ...prev]);
            massScannedCodesRef.current.add(finalCode);
            showAppMessage(`Añadido sin verificar (sin conexión): ${finalCode}`, 'warning');
        }
    };

    try {
        if (!isOnline) {
            escanearDesdeSnapshot();
            return;
        }

        const { data: personalData, error: personalError } = await withTimeout(supabaseEtiquetas
            .from('personal')
            .select('name, product, status, details, sku, quantity, id_empleado_despacha, origen')
            .eq('code', finalCode), SCAN_QUERY_TIMEOUT_MS);

        if (personalError) throw personalError;

        if (personalData && personalData.length > 0) {
            aplicarFilaPersonal(personalData[0], false);
        } else {
            const { data: etiquetaData, error: etiquetaError } = await withTimeout(supabaseEtiquetas
                .from('etiquetas_i')
                .select('code, sku, product, quantity, organization, sales_num')
                .eq('code', finalCode), SCAN_QUERY_TIMEOUT_MS);

            if (etiquetaError) throw etiquetaError;

            if (etiquetaData && etiquetaData.length > 0) {
                const firstE = etiquetaData[0];
                const totalQty = etiquetaData.reduce((acc, curr) => acc + (curr.quantity || 0), 0);

                signalSuccess();
                 if (!timerStartedRef.current) {
                    setTimerStartTime(new Date());
                    timerStartedRef.current = true;
                }
                const result: ScanResult = {
                    code: firstE.code,
                    name: 'N/A',
                    product: firstE.product,
                    sku: firstE.sku,
                    quantity: totalQty,
                    organization: firstE.organization,
                    sales_num: firstE.sales_num,
                    found: true,
                    status: 'CALIFICADO',
                    details: "Esta etiqueta fue asignada y calificada al mismo tiempo",
                    isNew: true,
                };
                
                if (scanMode === 'individual') {
                     const qualificationTimestamp = new Date();
                     if (isNextDayDelivery) qualificationTimestamp.setDate(qualificationTimestamp.getDate() + 1);
                     const marketplace = marketplaceFromOrigen(result.origen);
                     const newPersonalRecord = {
                        code: result.code,
                        name: result.name,
                        name_inc: encargado || 'N/A',
                        sku: result.sku,
                        product: result.product,
                        quantity: result.quantity,
                        organization: resolveOrganizationParaMarketplace(marketplace, result.organization),
                        sales_num: result.sales_num,
                        status: 'CALIFICADO',
                        date: qualificationTimestamp.toISOString(),
                        date_cal: qualificationTimestamp.toISOString(),
                        details: result.details,
                        name_cali: encargado || 'N/A',
                        id_empleado_calificada: user?.id ?? null,
                        origen: result.origen ?? 'Mercado Libre',
                        marketplace,
                    };
                    const { error: insertError } = await withTimeout(supabaseEtiquetas.from('personal').insert(newPersonalRecord), SCAN_QUERY_TIMEOUT_MS);
                    if (insertError) throw insertError;
                    setLastScannedResult(result);
                    showAppMessage('Etiqueta no asignada, calificada automáticamente.', 'success');
                } else {
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
        // navigator.onLine miente en iOS: si el fetch falló por RED, se degrada al
        // snapshot en vez de dar un error crudo de postgrest que al operario de piso
        // no le dice nada (parece que la etiqueta está mal, cuando solo falta señal).
        if (esErrorDeRed(e)) {
            escanearDesdeSnapshot();
        } else {
            playWarningSound();
            setLastScannedResult({ name: null, product: null, code: finalCode, found: false, error: e.message });
            showAppMessage(`Error al consultar la base de datos: ${e.message}`, 'error');
        }
    } finally {
        setLoading(false);
    }
  }, [scanMode, encargado, isNextDayDelivery, isOnline]);
  
    const formatElapsedTime = (totalSeconds: number) => {
        if (totalSeconds < 0) return '00:00';
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const paddedMinutes = String(minutes).padStart(2, '0');
        const paddedSeconds = String(seconds).padStart(2, '0');
        if (hours > 0) return `${String(hours).padStart(2, '0')}:${paddedMinutes}:${paddedSeconds}`;
        return `${paddedMinutes}:${paddedSeconds}`;
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
        return () => { if (input) input.removeEventListener('keydown', handlePhysicalScannerInput); };
    }, [scannerActive, selectedScannerMode, onScanSuccess]);

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
    if (!(isMobile && scannerActive && selectedScannerMode === 'camara')) return;
    // Motor nuevo: flash/zoom van sobre el track que expone <BarcodeScanner/>.
    if (scannerEngine === 'nuevo') {
      if (trackRef.current) applyCameraConstraints(trackRef.current);
      return;
    }
    // Motor viejo: sobre el <video> que crea html5-qrcode dentro de #reader.
    if (html5QrCodeRef.current?.getState() === Html5QrcodeScannerState.SCANNING) {
      const videoElement = readerRef.current?.querySelector('video');
      if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        if (track) applyCameraConstraints(track);
      }
    }
  }, [zoom, isFlashOn, scannerActive, selectedScannerMode, isMobile, applyCameraConstraints, loading, massScannedCodes.length, lastScannedResult, scannerEngine]);
  
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
            return qrCode.stop().catch(err => { if (!String(err).includes('not started')) console.error("Fallo al detener el escáner:", err); }).finally(() => {
              if (isMobile) { setCameraCapabilities(null); setIsFlashOn(false); setZoom(1); }
            });
        }
        return Promise.resolve();
    };
    if (scannerActive && selectedScannerMode === 'camara' && scannerEngine === 'viejo') {
      if (qrCode.getState() !== Html5QrcodeScannerState.SCANNING) {
        qrCode.start({ facingMode: "environment" }, { fps: 5, qrbox: { width: 250, height: 250 } }, onScanSuccess, (e: any) => {})
        .then(() => {
            if (isMobile) {
              const videoElement = readerRef.current?.querySelector('video');
              const stream = videoElement?.srcObject as MediaStream;
              const track = stream?.getVideoTracks()[0];
              if (track) getCameraCapabilitiesWithRetry(track).then(caps => { if (!cancelled) setCameraCapabilities(caps); });
            }
        })
        .catch(err => {
            console.error("Error al iniciar camara:", err);
            if (String(err).includes('Cannot transition to a new state')) showAppMessage('Error al iniciar la cámara. Por favor, intenta de nuevo.', 'error');
            else showAppMessage('Error al iniciar la cámara. Revisa los permisos.', 'error');
            setScannerActive(false);
        });
      }
    } else cleanup();
    return () => { cleanup(); };
  }, [scannerActive, selectedScannerMode, isMobile, isMounted, onScanSuccess, scannerEngine]);

  const handleOpenRatingModal = (isOpen: boolean) => {
    setIsRatingModalOpen(isOpen);
    if (!isOpen) {
        setShowReportSelect(false);
        setSelectedReport('');
        setLastScannedResult(null);
        showAppMessage('Apunte la cámara a un código QR.', 'info');
        setTimerStartTime(null);
        timerStartedRef.current = false;
    }
  }

  /**
   * Cuenta los retrabajos abiertos para el badge del encabezado. Usa `head: true`:
   * solo interesa el número, no traer las filas.
   */
  const refreshRetrabajosAbiertos = useCallback(async () => {
    const { count, error } = await supabaseEtiquetas
      .from('registro_incidencias_en_paquetes_listos_para_entrega')
      .select('id', { count: 'exact', head: true })
      .is('fin_retrabajo', null);
    if (!error) setRetrabajosAbiertos(count ?? 0);
  }, []);

  useEffect(() => { refreshRetrabajosAbiertos(); }, [refreshRetrabajosAbiertos]);

  /**
   * Traduce un SKU a su subcategoría: primero busca en sku_m; si no está ahí, el
   * SKU puede ser un alterno, así que se resuelve a su maestro vía sku_alterno y
   * se reintenta. Devuelve null si no se puede resolver (falla en silencio).
   */
  const resolveSubcategoria = useCallback(async (sku: string): Promise<string | null> => {
      try {
          const { data } = await supabaseEtiquetas.from('sku_m').select('sub_cat').eq('sku', sku).maybeSingle();
          if (data?.sub_cat) return data.sub_cat;

          const { data: alt } = await supabaseEtiquetas
              .from('sku_alterno').select('sku_mdr').eq('sku', sku).maybeSingle();
          if (alt?.sku_mdr) {
              const { data: mdr } = await supabaseEtiquetas
                  .from('sku_m').select('sub_cat').eq('sku_mdr', alt.sku_mdr).maybeSingle();
              if (mdr?.sub_cat) return mdr.sub_cat;
          }
      } catch (e) {
          console.error('Error resolviendo subcategoría en sku_m/sku_alterno:', e);
      }
      return null;
  }, []);

  const handleOpenDiscrepancyModal = async (item: ScanResult) => {
      setItemToReport(item);
      setSearchQueryDespachado('');
      setSubcategoriaSearchDraft('');
      setSubcatSolicitada(null);
      setPiezasDespachadas('');
      setObservacionesIncidencia('');
      setIsDiscrepancyModalOpen(true);

      // La subcategoría del SKU solicitado cumple dos papeles: se guarda tal cual
      // en `producto_solicitado`, y además sirve de default editable del producto
      // despachado (el operador la cambia si encontró algo distinto).
      if (item.sku) {
          const sub = await resolveSubcategoria(item.sku);
          if (sub) {
              setSubcatSolicitada(sub);
              setSearchQueryDespachado(sub);
          }
      }
  };
  
  const saveKpiData = async (name: string, quantity: number, timeInSeconds: number) => {
    if (quantity === 0 || !name) return;
    try {
      await supabaseEtiquetas.from('kpis').insert({ name: name, quantity: quantity, time: formatElapsedTime(timeInSeconds), rol: 'Control de calidad', id_empleado: user?.id ?? null });
    } catch (e: any) { console.error('Exception while saving KPI data:', e.message); }
  };

  const handleSendReport = async () => {
    if (!selectedReport || !lastScannedResult?.code) { alert("Por favor, selecciona un motivo de reporte."); return; }
    setLoading(true);
    try {
        // Sella `date_cal` también en los REPORTADO: sin esto quedaban fuera de la
        // ventana de "revisados en QC" y no contaban en FPY / % con incidencia.
        const { data, error } = await supabaseEtiquetas.from('personal').update({ details: selectedReport, status: 'REPORTADO', id_empleado_calificada: user?.id ?? null, date_cal: new Date().toISOString() }).eq('code', lastScannedResult.code).select('code');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('No se actualizó ningún registro (0 filas afectadas). Verifica permisos o que el código siga existiendo.');
        await saveKpiData(encargado, 1, elapsedTime);
        alert('Reporte enviado correctamente.');
        handleOpenRatingModal(false);
    } catch (e: any) { alert(`Error al enviar el reporte: ${e.message}`); } finally { setLoading(false); }
  };

  const handleSelectProduct = (sub: string) => {
      setSearchQueryDespachado(sub);
      setSubcategoriaSearchDraft('');
      setIsInventoryPopoverOpen(false);
  };

  const handleSendDiscrepancyReport = async () => {
      if (!itemToReport || !piezasDespachadas) {
          alert("Por favor, ingresa la cantidad real encontrada.");
          return;
      }
      if (Number(piezasDespachadas) < 0) {
          alert("La cantidad de piezas despachadas no puede ser negativa.");
          return;
      }

      setLoading(true);
      try {
          const now = new Date();
          const pSolicitadas = Number(itemToReport.quantity);
          const pDespachadas = Number(piezasDespachadas);

          // `id_producto_solicitado` es bigint (sin FK) y el SKU del sistema suele ser
          // texto (ej. MUR_HOG_LAMB_...): mandarlo tal cual reventaba el insert con
          // 22P02 y abortaba el reporte completo. Solo se manda cuando el SKU es
          // numérico; el producto en sí queda descrito en `producto_solicitado`.
          const skuTexto = String(itemToReport.sku ?? '').trim();
          const skuEsNumerico = /^\d+$/.test(skuTexto);

          // Si el SKU no tiene subcategoría en sku_m/sku_alterno, se guarda el SKU
          // crudo como respaldo para no perder la referencia del producto, y se
          // anota en observaciones: sin esa nota, el valor parecería una
          // subcategoría más y nadie sabría que el catálogo tiene un hueco.
          const sinSubcategoria = !subcatSolicitada && !!skuTexto;
          const observacionesFinal = [
              observacionesIncidencia?.trim() || '',
              sinSubcategoria ? `[Sin subcategoría asociada al SKU: ${skuTexto}]` : '',
          ].filter(Boolean).join(' ');

          // Categoriza la discrepancia para el KPI "tipo de error más frecuente":
          // compara producto solicitado vs. despachado y piezas solicitadas vs.
          // encontradas, con los mismos valores que se guardan en el record.
          const prodSolicitado = subcatSolicitada ?? (skuTexto || null);
          const prodDespachado = searchQueryDespachado || null;
          const productoDifiere = !!prodDespachado && prodSolicitado !== prodDespachado;
          const cantidadDifiere =
              (isNaN(pSolicitadas) ? 0 : pSolicitadas) !== (isNaN(pDespachadas) ? 0 : pDespachadas);
          const tipoError = productoDifiere && cantidadDifiere
              ? 'CANTIDAD_Y_PRODUCTO'
              : productoDifiere
              ? 'PRODUCTO'
              : cantidadDifiere
              ? 'CANTIDAD'
              : 'OTRO';

          const record = {
              // Ambos se fijan a hora de México. Antes `fecha` salía en UTC y `hora`
              // en la hora local del equipo: por la noche la fecha ya había avanzado
              // al día siguiente mientras la hora seguía en el día anterior, así que
              // el par no representaba un instante real. `inicio_retrabajo` es la
              // fuente confiable (timestamptz); fecha/hora quedan como referencia
              // legible y ya coherente entre sí.
              fecha: now.toLocaleDateString('en-CA', { timeZone: MX_TIMEZONE }),
              hora: now.toLocaleTimeString('en-GB', { timeZone: MX_TIMEZONE, hour12: false }),
              inicio_retrabajo: now.toISOString(),
              id_producto_solicitado: skuEsNumerico ? Number(skuTexto) : null,
              // Par simétrico de columnas text: la subcategoría del SKU solicitado
              // contra la que el operador encontró físicamente.
              producto_solicitado: prodSolicitado,
              producto_despachado: prodDespachado,
              // Categoría para el KPI "tipo de error más frecuente".
              tipo_error: tipoError,
              piezas_solicitadas: isNaN(pSolicitadas) ? 0 : pSolicitadas,
              piezas_despachadas: isNaN(pDespachadas) ? 0 : pDespachadas,
              observaciones: observacionesFinal,
              id_empleado: itemToReport.id_empleado_despacha ?? null,
              id_capturista: null,
              id_reportador: user?.id ?? null,
              bar_code: itemToReport.code,
              // Columna text, no boolean: sin firma capturada se deja en null.
              firma_empleado: null,
          };

          const { error: insError } = await supabaseEtiquetas
            .from('registro_incidencias_en_paquetes_listos_para_entrega')
            .insert([record]);

          if (insError) throw new Error(`Error de base de datos: ${insError.message}`);

          // El paquete vuelve a producción a corregirse: queda RETRABAJANDO, no
          // REPORTADO. Al reescanearlo en QC, el modal de calificación se abre
          // igual que con cualquier estatus distinto de CALIFICADO, así que
          // "Aceptar" cierra el ciclo pasándolo a CALIFICADO.
          const detallesIncidencia = `DISCREPANCIA EN QC: Encontrado ${piezasDespachadas} pzas. Subcategoría: ${searchQueryDespachado}`;

          const { data: updateData, error: updateError } = await supabaseEtiquetas.from('personal').update({
              details: detallesIncidencia,
              status: 'RETRABAJANDO',
              id_empleado_calificada: user?.id ?? null
          }).eq('code', itemToReport.code).select('code');

          if (updateError) throw new Error(`La incidencia se guardó, pero no se pudo marcar el paquete como retrabajando: ${updateError.message}`);

          // En modo masivo, una etiqueta escaneada que aún no existía en `personal`
          // (isNew) solo se inserta al pulsar "Calificar Todos". Si se reporta la
          // discrepancia antes de eso, el UPDATE de arriba no encuentra ninguna fila
          // y el paquete se quedaría sin marcar. Se crea aquí en su lugar, ya con el
          // estatus RETRABAJANDO, siguiendo el mismo payload que usa el masivo.
          if (!updateData || updateData.length === 0) {
              const nowIso = new Date().toISOString();
              const marketplace = marketplaceFromOrigen(itemToReport.origen);
              const { data: insData, error: insErr } = await supabaseEtiquetas.from('personal').insert({
                  code: itemToReport.code,
                  name: itemToReport.name,
                  name_inc: encargado || 'N/A',
                  sku: itemToReport.sku,
                  product: itemToReport.product,
                  quantity: itemToReport.quantity,
                  organization: resolveOrganizationParaMarketplace(marketplace, itemToReport.organization),
                  sales_num: itemToReport.sales_num,
                  status: 'RETRABAJANDO',
                  date: nowIso,
                  details: detallesIncidencia,
                  name_cali: encargado || 'N/A',
                  id_empleado_calificada: user?.id ?? null,
                  origen: itemToReport.origen ?? 'Mercado Libre',
                  marketplace,
              }).select('code');

              if (insErr) throw new Error(`La incidencia se guardó, pero no se pudo registrar el paquete como retrabajando: ${insErr.message}`);
              if (!insData || insData.length === 0) throw new Error('La incidencia se guardó, pero el paquete no se registró como retrabajando (0 filas afectadas). Verifica permisos.');
          }

          await refreshRetrabajosAbiertos();
          alert('Incidencia guardada exitosamente. El paquete quedó en RETRABAJANDO.');
          setIsDiscrepancyModalOpen(false);

          // El paquete se va a retrabajar: sale de la lista de pendientes por
          // calificar (ya no aplica "Calificar Todos" sobre él) y volverá a entrar
          // cuando se reescanee tras corregirse. Se borra también del Set de
          // duplicados; si no, el reescaneo se rechazaría por "código duplicado"
          // y sería imposible volver a calificarlo.
          setMassScannedCodes(prev => prev.filter(i => i.code !== itemToReport.code));
          massScannedCodesRef.current.delete(itemToReport.code);
          if (lastScannedResult?.code === itemToReport.code) {
              setLastScannedResult(null);
          }

      } catch (e: any) { 
          console.error("Error al enviar reporte:", e);
          alert(e.message || 'Ocurrió un error inesperado.'); 
      } finally { 
          setLoading(false); 
      }
  };

  /**
   * Cierra la(s) incidencia(s) abiertas de los paquetes que se acaban de calificar:
   * ese es el fin del retrabajo. `segundos_retrabajo` es una columna generada, así
   * que la duración la calcula la BD sola a partir de este fin.
   *
   * El filtro `.is('fin_retrabajo', null)` es lo que hace correcto el multi-retrabajo:
   * solo toca el ciclo abierto y nunca reescribe duraciones ya cerradas.
   *
   * Best-effort: si falla, no debe tumbar la calificación, que ya quedó guardada.
   */
  const cerrarRetrabajo = useCallback(async (codes: string[]) => {
    const limpios = codes.filter(Boolean);
    if (limpios.length === 0) return;
    // Instante real, nunca `qualificationTimestamp`: ese puede venir desplazado un
    // día por isNextDayDelivery (es la fecha de entrega, no la de calificación) y
    // le sumaría 24h fantasma a la duración del retrabajo.
    const { error } = await supabaseEtiquetas
        .from('registro_incidencias_en_paquetes_listos_para_entrega')
        .update({ fin_retrabajo: new Date().toISOString() })
        .in('bar_code', limpios)
        .is('fin_retrabajo', null);
    if (error) console.warn('No se pudo cerrar el retrabajo de la incidencia:', error.message);
    else await refreshRetrabajosAbiertos();
  }, [refreshRetrabajosAbiertos]);

  /**
   * Reaplica una calificación encolada sin conexión. Antes de pisar nada, relee el
   * estado actual en el servidor: un paquete que mientras tanto se entregó o canceló
   * en otro dispositivo NO se recalifica, se deja como conflicto para revisión manual.
   */
  const processCalificarItem = async (item: QueueItem): Promise<SyncOutcome> => {
    const {
      codes, inserts, qualificationTimestamp,
      encargado: itemEncargado, userId, lote, elapsedTime: itemElapsed,
    } = item.payload as CalificarPayload;

    let aplicados = 0;
    const bloqueados: string[] = [];

    // 1) Actualizaciones a CALIFICADO.
    if (codes.length > 0) {
      const { data, error } = await supabaseEtiquetas.from('personal').select('code, status').in('code', codes);
      if (error) throw error;
      const statusByCode = new Map((data ?? []).map((r: any) => [String(r.code), r.status as string]));
      const aplicables = codes.filter((c) => {
        const st = statusByCode.get(c);
        // status undefined = el código no existe (no se puede calificar la nada).
        if (st === undefined || ESTADOS_BLOQUEANTES_CALIFICAR.has(st)) { bloqueados.push(c); return false; }
        return true;
      });
      if (aplicables.length > 0) {
        const { error: updErr } = await supabaseEtiquetas.from('personal').update({
          status: 'CALIFICADO',
          details: null,
          date_cal: qualificationTimestamp,
          ...(lote ? { lote } : {}),
          name_cali: itemEncargado || 'N/A',
          id_empleado_calificada: userId,
        }).in('code', aplicables);
        if (updErr) throw updErr;
        aplicados += aplicables.length;
      }
    }

    // 2) Etiquetas nuevas. Si otro dispositivo ya las creó, no se duplican: se
    //    marcan como conflicto en vez de reventar el insert por clave repetida.
    if (inserts.length > 0) {
      const codigosNuevos = inserts.map((r: any) => String(r.code));
      const { data: existentes, error: exErr } = await supabaseEtiquetas.from('personal').select('code').in('code', codigosNuevos);
      if (exErr) throw exErr;
      const yaExisten = new Set((existentes ?? []).map((r: any) => String(r.code)));
      yaExisten.forEach((c) => bloqueados.push(c));
      const insertables = inserts.filter((r: any) => !yaExisten.has(String(r.code)));
      if (insertables.length > 0) {
        const { error: insErr } = await supabaseEtiquetas.from('personal').insert(insertables);
        if (insErr) throw insErr;
        aplicados += insertables.length;
      }
    }

    if (aplicados > 0) {
      await cerrarRetrabajo([...codes, ...inserts.map((r: any) => String(r.code))]);
      await saveKpiData(itemEncargado, aplicados, itemElapsed);
    }

    if (bloqueados.length > 0) {
      // Se reduce el item a los conflictivos, para no reprocesar lo ya sincronizado.
      await updateQueueItem(item.id, { payload: { ...item.payload, codes: bloqueados, inserts: [] } });
      return 'conflict';
    }
    return 'synced';
  };

  const { pendingCount, conflicts, isSyncing, refresh: refreshSync, retryConflict, discardConflict } =
    useOfflineSync('calificar', processCalificarItem);

  const handleAccept = async () => {
    if (!lastScannedResult?.code) return;
    const code = lastScannedResult.code;
    setLoading(true);
    const qualificationTimestamp = new Date();
    if (isNextDayDelivery) qualificationTimestamp.setDate(qualificationTimestamp.getDate() + 1);

    const encolar = async () => {
      await enqueue({
        id: crypto.randomUUID(),
        page: 'calificar',
        type: 'calificar',
        payload: {
          codes: [code],
          inserts: [],
          qualificationTimestamp: qualificationTimestamp.toISOString(),
          encargado: encargado || 'N/A',
          userId: user?.id ?? null,
          lote: loteId,
          elapsedTime,
        } as CalificarPayload,
        createdAt: Date.now(),
      });
      await refreshSync();
      alert('Guardado sin conexión. Se sincronizará automáticamente cuando vuelva la señal.');
      handleOpenRatingModal(false);
    };

    try {
        if (!isOnline) { await encolar(); return; }
        const { data, error } = await withTimeout(supabaseEtiquetas.from('personal').update({
            status: 'CALIFICADO',
            details: null,
            date_cal: qualificationTimestamp.toISOString(),
            name_cali: encargado || 'N/A',
            id_empleado_calificada: user?.id ?? null
        }).eq('code', code).select('code'), SCAN_QUERY_TIMEOUT_MS);
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('No se actualizó ningún registro (0 filas afectadas). Verifica permisos o que el código siga existiendo.');
        await cerrarRetrabajo([code]);
        await saveKpiData(encargado, 1, elapsedTime);
        alert('Calificación guardada correctamente.');
        handleOpenRatingModal(false);
    } catch (e: any) {
        // Online fantasma: falló la RED, no los datos → encolar en vez de perder la calificación.
        if (esErrorDeRed(e)) {
            try { await encolar(); } catch (qe: any) { alert(`No se pudo guardar sin conexión: ${qe.message}`); }
        } else {
            alert(`Error al guardar la calificación: ${e.message}`);
        }
    } finally { setLoading(false); }
  };

const handleMassQualify = async () => {
    setLoteConfirmation({ isOpen: false, existingCount: 0, newCount: 0 });
    setLoading(true);

    const qualificationTimestamp = new Date();
    if (isNextDayDelivery) qualificationTimestamp.setDate(qualificationTimestamp.getDate() + 1);
    const recordsToInsert = massScannedCodes.filter(item => item.isNew);
    const codesToUpdate = massScannedCodes.filter(item => !item.isNew).map(item => item.code);
    // Las filas nuevas se arman aquí (no dentro del try) para que el camino offline
    // pueda encolarlas tal cual, sin repetir la construcción del payload.
    const payload = recordsToInsert.map(item => {
        const marketplace = marketplaceFromOrigen(item.origen);
        return {
            code: item.code,
            name: item.name,
            name_inc: encargado || 'N/A',
            sku: item.sku,
            product: item.product,
            quantity: item.quantity,
            organization: resolveOrganizationParaMarketplace(marketplace, item.organization),
            sales_num: item.sales_num,
            status: 'CALIFICADO',
            date: qualificationTimestamp.toISOString(),
            date_cal: qualificationTimestamp.toISOString(),
            details: item.details,
            // Lote opcional: solo se guarda si se especificó uno.
            ...(loteId.trim() ? { lote: loteId.trim() } : {}),
            name_cali: encargado || 'N/A',
            id_empleado_calificada: user?.id ?? null,
            origen: item.origen ?? 'Mercado Libre',
            marketplace,
        };
    });

    const limpiarSesion = () => {
        setMassScannedCodes([]);
        massScannedCodesRef.current.clear();
        localStorage.removeItem(STORAGE_KEY);
        setLoteId('');
        setTimerStartTime(null);
        timerStartedRef.current = false;
    };

    const encolar = async () => {
        await enqueue({
            id: crypto.randomUUID(),
            page: 'calificar',
            type: 'calificar',
            payload: {
                codes: codesToUpdate,
                inserts: payload,
                qualificationTimestamp: qualificationTimestamp.toISOString(),
                encargado: encargado || 'N/A',
                userId: user?.id ?? null,
                lote: loteId,
                elapsedTime,
            } as CalificarPayload,
            createdAt: Date.now(),
        });
        await refreshSync();
        alert(`Guardado sin conexión: ${codesToUpdate.length + payload.length} etiquetas. Se sincronizarán automáticamente cuando vuelva la señal.`);
        limpiarSesion();
    };

    try {
        if (!isOnline) { await encolar(); return; }
        let successCount = 0;
        if (recordsToInsert.length > 0) {
            const { data: insData, error: insErr } = await supabaseEtiquetas.from('personal').insert(payload).select('code');
            if (insErr) throw insErr;
            if (!insData || insData.length < recordsToInsert.length) {
                throw new Error(`Solo se insertaron ${insData?.length || 0} de ${recordsToInsert.length} etiquetas nuevas (verifica permisos). No se limpió la lista para que puedas reintentar.`);
            }
            successCount += insData.length;
        }
        if (codesToUpdate.length > 0) {
            const { data: updData, error: updErr } = await supabaseEtiquetas.from('personal').update({
                status: 'CALIFICADO',
                details: null,
                date_cal: qualificationTimestamp.toISOString(),
                // Lote opcional: sin lote NO se toca el campo, para no borrar el que
                // el paquete ya tuviera.
                ...(loteId.trim() ? { lote: loteId.trim() } : {}),
                name_cali: encargado || 'N/A',
                id_empleado_calificada: user?.id ?? null
            }).in('code', codesToUpdate).select('code');
            if (updErr) throw updErr;
            if (!updData || updData.length < codesToUpdate.length) {
                throw new Error(`Solo se actualizaron ${updData?.length || 0} de ${codesToUpdate.length} etiquetas (verifica permisos). No se limpió la lista para que puedas reintentar.`);
            }
            successCount += updData.length;
        }
        // Un paquete que venía de retrabajo también puede cerrarse desde el masivo.
        await cerrarRetrabajo(massScannedCodes.map(item => item.code));
        alert(`Se procesaron ${successCount} etiquetas correctamente.`);
        if (successCount > 0) await saveKpiData(encargado, successCount, elapsedTime);
        limpiarSesion(); // Limpiar sesión al finalizar con éxito
    } catch (e: any) {
        // Online fantasma: falló la RED, no los datos → encolar el lote completo en
        // vez de perder todo lo escaneado.
        if (esErrorDeRed(e)) {
            try { await encolar(); } catch (qe: any) { alert(`No se pudo guardar sin conexión: ${qe.message}`); }
        } else {
            alert(`Error al calificar masivamente: ${e.message}`);
        }
    } finally { setLoading(false); }
};

const triggerMassQualify = async () => {
    if (massScannedCodes.length === 0) { alert("No hay códigos en la lista."); return; }
    const lote = loteId.trim();
    // El lote es OPCIONAL: sin lote no hay que preguntar por lotes existentes ni
    // agrupar; se califica directo (esto también evita el chequeo de red, que
    // fallaría sin conexión).
    if (!lote) { await handleMassQualify(); return; }
    setLoading(true);
    try {
        const { count, error } = await supabaseEtiquetas.from('personal').select('code', { count: 'exact', head: true }).eq('lote', lote);
        if (error) throw error;
        if (count && count > 0) setLoteConfirmation({ isOpen: true, existingCount: count, newCount: massScannedCodes.length });
        else await handleMassQualify();
    } catch (e: any) { alert(`Error: ${e.message}`); } finally { setLoading(false); }
};

  const removeFromMassList = (codeToRemove: string) => {
    setMassScannedCodes(prev => prev.filter(item => item.code !== codeToRemove));
    massScannedCodesRef.current.delete(codeToRemove);
    showAppMessage(`Código ${codeToRemove} eliminado de la lista.`, 'info');
  };

  useEffect(() => {
    if (isRatingModalOpen && showReportSelect && reportReasons.length === 0) {
        const fetchReportReasons = async () => {
            const { data } = await supabaseEtiquetas.from('reports').select('id, t_report');
            if (data) setReportReasons(data);
        };
        fetchReportReasons();
    }
  }, [isRatingModalOpen, showReportSelect]);

  const handleManualAdd = async () => {
    const manualCodeInput = document.getElementById('manual-code-input-calificar') as HTMLInputElement;
    if (!encargado.trim()) { showAppMessage('Selecciona un encargado.', 'error'); return; }
    const manualCode = manualCodeInput.value.trim();
    if (!manualCode) { showAppMessage('Ingresa un código.', 'error'); return; }
    await onScanSuccess(manualCode);
    manualCodeInput.value = '';
    manualCodeInput.focus();
  };
  
    const handleLoadLote = async () => {
    if (!loteToLoad.trim()) return;
    // Cargar un lote NUEVO necesita red; los ya precargados siguen sirviendo sin ella.
    if (!isOnline) {
      showAppMessage('Necesitas conexión para cargar un lote nuevo. Los lotes ya precargados siguen disponibles sin conexión.', 'warning');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabaseEtiquetas.from('personal').select('*').eq('lote', loteToLoad.trim());
      if (error) throw error;
      if (!data || data.length === 0) { showAppMessage(`No se encontraron paquetes.`, 'warning'); return; }

      // Precarga offline: se cachea lo que /calificar necesita para poder validar y
      // MOSTRAR el paquete al escanearlo sin red (producto, sku, piezas, quién empacó).
      const snapshotEntries: Record<string, SnapshotEntry> = {};
      data.forEach((item: any) => {
        snapshotEntries[String(item.code)] = {
          name: item.name,
          product: item.product,
          status: item.status,
          sku: item.sku,
          quantity: item.quantity,
          details: item.details,
          origen: item.origen,
          id_empleado_despacha: item.id_empleado_despacha,
        };
      });
      snapshotRef.current = { ...snapshotRef.current, ...snapshotEntries };
      mergeSnapshotEntries('calificar', snapshotEntries).catch((err) => console.error('Error guardando snapshot offline:', err));

      const newItems: ScanResult[] = data.map(item => ({ code: item.code, name: item.name, product: item.product, status: item.status, details: item.details, sku: item.sku, quantity: item.quantity, organization: item.organization, sales_num: item.sales_num, found: true, isNew: false, id_empleado_despacha: item.id_empleado_despacha }));
      const currentCodes = new Set(massScannedCodes.map(c => c.code));
      const itemsToAdd = newItems.filter(item => { if (!currentCodes.has(item.code)) { massScannedCodesRef.current.add(item.code); return true; } return false; });
      setMassScannedCodes(prev => [...prev, ...itemsToAdd]);
      showAppMessage(`Se agregaron ${itemsToAdd.length} paquetes.`, 'success');
      setLoteToLoad('');
    } catch (e: any) { showAppMessage(`Error: ${e.message}`, 'error'); } finally { setLoading(false); }
  };

  const filteredInventoryList = useMemo(() => {
    if (!subcategoriaSearchDraft.trim()) return inventoryList;
    return inventoryList.filter(item =>
        item.subcategoria.toLowerCase().includes(subcategoriaSearchDraft.toLowerCase())
    );
  }, [inventoryList, subcategoriaSearchDraft]);

  const messageClasses: any = { success: 'bg-green-500/80 text-white', error: 'bg-red-500/80 text-white', warning: 'bg-yellow-500/80 text-white', info: 'bg-blue-500/80 text-white' };

  return (
    <>
      <Head><title>Calificar Calidad</title></Head>
      <main className="text-starbucks-dark flex items-center justify-center p-4">
        <div className="w-full max-w-2xl mx-auto bg-starbucks-white rounded-xl shadow-2xl p-4 md:p-6 space-y-4">
          <header className="text-center space-y-2">
            <h1 className="text-xl md:text-2xl font-bold text-starbucks-green">Calificar Calidad</h1>
            <p className="text-gray-600 text-sm mt-1">Escanea el QR para validar el empaquetado.</p>
            {/* Sin este acceso, la vista de retrabajos existiría pero nadie sabría
                que hay paquetes esperando. El contador da aviso sin robar espacio. */}
            <Link
              href="/calificar/retrabajos"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest transition-colors',
                retrabajosAbiertos > 0
                  ? 'bg-amber-100 border-amber-200 text-amber-800 hover:bg-amber-200'
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100',
              )}
            >
              <Hourglass className="h-3 w-3" />
              {retrabajosAbiertos > 0 ? `${retrabajosAbiertos} en retrabajo` : 'Retrabajos'}
            </Link>
          </header>

          {pendingCount > 0 && (
            <div className="flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold p-2 rounded-lg">
              {isSyncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
              {pendingCount} calificación(es) pendiente(s) de sincronizar
            </div>
          )}

          {conflicts.length > 0 && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-black text-red-700 uppercase tracking-wide flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Conflictos de sincronización ({conflicts.length})
              </h3>
              <p className="text-xs text-red-600">
                Estos códigos ya fueron entregados, cancelados o no existen. No se recalificaron; revísalos y decide manualmente.
              </p>
              <ul className="space-y-2">
                {conflicts.map((c) => (
                  <li key={c.id} className="bg-white border border-red-200 rounded-md p-2 text-xs space-y-2">
                    <div className="font-mono break-all">{((c.payload as CalificarPayload).codes || []).join(', ')}</div>
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
                  {/* El motor solo aplica a la cámara. El escáner físico (teclado) es igual en ambos. */}
                  {selectedScannerMode === 'camara' && (
                    <div className="mt-2">
                        <label className="block text-xs font-bold text-starbucks-dark mb-1">Motor de cámara:</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setScannerEngine('nuevo')} className={`area-btn w-full px-3 py-2 text-xs rounded-md shadow-sm focus:outline-none ${scannerEngine === 'nuevo' ? 'scanner-mode-selected' : ''}`} disabled={scannerActive}>NUEVO (RÁPIDO)</button>
                            <button onClick={() => setScannerEngine('viejo')} className={`area-btn w-full px-3 py-2 text-xs rounded-md shadow-sm focus:outline-none ${scannerEngine === 'viejo' ? 'scanner-mode-selected' : ''}`} disabled={scannerActive}>CLÁSICO</button>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold">
                            {scannerEngine === 'nuevo' ? 'ZXING-WASM · el mismo de Devoluciones y Entregas' : 'HTML5-QRCODE · el de siempre'}
                        </p>
                    </div>
                  )}
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
          
          <div className="grid grid-cols-2 gap-4">
              <div className={`p-2 rounded-lg bg-blue-100 text-blue-800 text-center ${scanMode === 'individual' ? 'col-span-2' : ''}`}>
                  <h3 className="font-bold uppercase text-xs flex items-center justify-center gap-1"><Clock className="h-4 w-4" /> Tiempo</h3>
                  <p className="text-2xl font-mono">{formatElapsedTime(elapsedTime)}</p>
              </div>
              {scanMode === 'masivo' && (
                  <div className="bg-starbucks-cream p-2 rounded-lg border text-center">
                      <h3 className="font-bold text-starbucks-dark uppercase text-xs">Escaneados</h3>
                      <p className="text-2xl font-mono text-starbucks-green">{massScannedCodes.length}</p>
                  </div>
              )}
          </div>

          {/* Contador flotante: la tarjeta "Escaneados" de arriba se pierde al hacer
              scroll por la lista. Abajo a la izquierda para no tapar el FAB de ajustes
              de la esquina inferior derecha. isMounted evita el desajuste de hidratación
              (la lista se restaura de localStorage después del render del servidor). */}
          {isMounted && scanMode === 'masivo' && massScannedCodes.length > 0 && (
              <div className={cn(
                  "fixed bottom-6 left-4 z-[9990] flex items-center gap-2 rounded-full text-white px-4 py-2 shadow-lg shadow-black/20 select-none pointer-events-none transition-all duration-200 ease-out",
                  scanPulse
                    ? "bg-green-500 scale-125 ring-4 ring-green-300"
                    : "bg-starbucks-green scale-100 ring-0",
              )}>
                  <Check className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-black tabular-nums">Escaneados: {massScannedCodes.length}</span>
              </div>
          )}

          <div className="bg-starbucks-cream p-4 rounded-lg">
            <div className="scanner-container relative">
                {/* Motor VIEJO: html5-qrcode dibuja el video dentro de #reader. */}
                <div id="reader" ref={readerRef} style={{ display: selectedScannerMode === 'camara' && scannerActive && scannerEngine === 'viejo' ? 'block' : 'none' }}></div>

                {/* Motor NUEVO: BarcodeScanner zxing-wasm (mismo contrato onDetected -> onScanSuccess). */}
                {selectedScannerMode === 'camara' && scannerActive && scannerEngine === 'nuevo' && (
                    <div className="w-full aspect-square max-h-[60vh] mx-auto overflow-hidden rounded-lg">
                        <BarcodeScanner
                            onDetected={onScanSuccess}
                            onTrackReady={(track) => {
                                trackRef.current = track;
                                getCameraCapabilitiesWithRetry(track).then((caps) => {
                                    setCameraCapabilities(caps);
                                    applyCameraConstraints(track);
                                });
                            }}
                            onError={(e) => { console.error('Error de cámara (calificar, nuevo):', e); showAppMessage('Error al iniciar la cámara. Revisa los permisos.', 'error'); setScannerActive(false); }}
                        />
                    </div>
                )}
                {message.show && (
                    <div className={`scanner-message ${messageClasses[message.type]}`}>
                        {message.text}
                    </div>
                )}
                {scannerActive && selectedScannerMode === 'camara' && scannerEngine === 'viejo' && <div id="laser-line"></div>}
                <input type="text" id="physical-scanner-input" ref={physicalScannerInputRef} className="hidden-input" autoComplete="off" />
                {selectedScannerMode === 'camara' && !scannerActive && (
                    <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg">
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

             {loading && (
                <div className="flex justify-center items-center mt-4">
                    <Loader2 className="animate-spin h-8 w-8 text-starbucks-green" />
                    <p className="ml-3">Buscando...</p>
                </div>
             )}
            <div id="scanner-controls" className="mt-4 flex flex-wrap gap-2 justify-center">
              <button type="button" onClick={() => { unlockAudio(); setScannerActive(true); setLastScannedResult(null); showAppMessage('Apunte la cámara a un código QR.', 'info'); }} disabled={scannerActive || loading || !encargado} className="px-4 py-2 text-white font-semibold rounded-lg shadow-md transition-colors duration-200 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-sm">
                Iniciar
              </button>
              {/* Antes hacía window.location.reload(): recargaba TODA la página (y offline
                  caía al dino de "sin internet"). Detener solo debe apagar el escáner;
                  el efecto de arriba limpia la cámara al pasar scannerActive a false. */}
              <button type="button" onClick={() => { setScannerActive(false); showAppMessage('Escáner detenido.', 'info'); }} disabled={!scannerActive} className="px-4 py-2 text-white font-semibold rounded-lg shadow-md transition-colors duration-200 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-sm">
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
            {!message.show && (
                <div className="p-3 rounded-lg text-center font-semibold text-base bg-gray-100 text-gray-800">
                    {lastScannedResult?.found ? `Último escaneo: ${lastScannedResult.code}` : 'Apunte la cámara a un código QR.'}
                </div>
            )}

            {lastScannedResult && scanMode === 'individual' && (
              <div className="bg-starbucks-cream p-4 rounded-lg text-left space-y-2">
                <div>
                    <h3 className="font-bold text-starbucks-dark uppercase text-sm">Código</h3>
                    <p className="text-base font-mono text-starbucks-green break-words">
                        {lastScannedResult.code}
                        {lastScannedResult.origen && lastScannedResult.origen !== 'Mercado Libre' && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider align-middle">{lastScannedResult.origen}</span>
                        )}
                    </p>
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
                             <DialogContent className="sm:max-w-[425px]">
                                 <DialogHeader>
                                  <DialogTitle>Calificar Empaquetado</DialogTitle>
                                   <DialogDescription className="text-center pt-2">
                                     ¿Cómo calificarías la calidad del empaquetado de
                                     <span className="font-bold text-2xl text-starbucks-green block mt-2">{lastScannedResult.name}?</span>
                                   </DialogDescription>
                                 </DialogHeader>
                                 <div className="grid gap-4 py-4">
                                 {lastScannedResult.status === 'RETRABAJANDO' && (
                                     <Alert className="bg-amber-50 border-amber-200 text-amber-900">
                                         <AlertTriangle className="h-4 w-4" />
                                         <AlertTitle className="font-black">Paquete Retrabajado</AlertTitle>
                                         <AlertDescription>
                                             Este paquete regresó de una discrepancia y debe volver a calificarse.
                                             <span className="block mt-1 text-xs font-semibold">{lastScannedResult.details || 'Sin detalle de la incidencia.'}</span>
                                         </AlertDescription>
                                     </Alert>
                                 )}
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
             {scanMode === 'masivo' && (
                <div className="space-y-4">
                     <div className="p-4 bg-starbucks-cream rounded-lg">
                        <Label htmlFor="lote-id-load" className="block text-sm font-bold text-starbucks-dark mb-1">Cargar Lote:</Label>
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
                                id="lote-load-btn"
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
                         <Label htmlFor="lote-id" className="font-bold text-starbucks-dark">Lote / Tanda: <span className="font-normal text-gray-400">(opcional)</span></Label>
                         <Input
                           id="lote-id"
                           type="text"
                           value={loteId}
                           onChange={(e) => setLoteId(e.target.value)}
                           placeholder="Opcional: identificador de lote"
                           className="bg-transparent"
                           disabled={loading}
                         />
                    </div>
                    <div className="flex flex-col sm:flex-row justify-end items-center gap-2">
                        <Button onClick={triggerMassQualify} disabled={loading || massScannedCodes.length === 0} className="bg-green-600 hover:bg-green-700 w-full sm:w-auto">
                            {loading ? 'Calificando...' : 'Calificar Todos'}
                        </Button>
                    </div>
                    {/* Móvil: cards abatibles (la tabla de 4 columnas se salía y el nombre del
                        producto estiraba cada fila; ahora se despliega solo al tocar). */}
                    <div className="md:hidden max-h-[60vh] overflow-auto pr-0.5">
                        {massScannedCodes.length > 0 ? massScannedCodes.map((item, index) => (
                            <MobileMassRow
                                key={item.code}
                                data={item}
                                index={index}
                                isOpen={openSwipeMassCode === item.code}
                                onOpenChange={setOpenSwipeMassCode}
                                onDelete={removeFromMassList}
                                onReport={handleOpenDiscrepancyModal}
                            />
                        )) : (
                            <div className="text-center text-gray-500 py-10 text-[11px] uppercase font-bold">No hay códigos en la lista.</div>
                        )}
                    </div>

                    {/* Escritorio: tabla completa. */}
                    <div className="hidden md:block table-container border border-gray-200 rounded-lg max-h-80 overflow-auto">
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
                                        <TableCell className="font-mono text-xs">
                                            <div className="flex items-center gap-1.5">
                                                {item.code}
                                                {item.unverified && (
                                                    <span title="Escaneado sin conexión; se validará al sincronizar" className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                                                        <AlertTriangle className="h-2.5 w-2.5" /> Sin verif.
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs">{item.product || 'N/A'}</TableCell>
                                        <TableCell className="text-xs">{item.name || 'N/A'}</TableCell>
                                        <TableCell className="text-right whitespace-nowrap">
                                            <div className="flex justify-end gap-1">
                                                <Button variant="ghost" size="icon" onClick={() => handleOpenDiscrepancyModal(item)} className="text-amber-500 hover:text-amber-700 h-8 w-8" title="Reportar Discrepancia">
                                                    <FileWarning className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => removeFromMassList(item.code)} className="text-red-500 hover:text-red-700 h-8 w-8">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                     <TableRow><TableCell colSpan={4} className="text-center text-gray-500 py-8">No hay códigos en la lista.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}
          </div>
        </div>
      </main>

       {/* Modal Reportar Discrepancia */}
       <Dialog open={isDiscrepancyModalOpen} onOpenChange={setIsDiscrepancyModalOpen}>
           <DialogContent className="sm:max-w-lg">
               <DialogHeader>
                   <DialogTitle className="flex items-center gap-2 text-amber-600 text-lg">
                       <AlertTriangle className="h-6 w-6" />
                       Reportar Discrepancia
                   </DialogTitle>
                   <DialogDescription className="text-gray-500 font-medium pt-2">
                       Detectar diferencias entre lo solicitado por sistema y lo despachado físicamente.
                   </DialogDescription>
               </DialogHeader>
               
               <div className="grid gap-6 py-6 border-y border-gray-100 mt-2">
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       <div className="space-y-2">
                           <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">PRODUCTO SOLICITADO</Label>
                           <div className="p-3 border rounded-xl bg-gray-50 font-mono text-[11px] font-black break-all line-clamp-2">
                               {itemToReport?.sku || 'S/N'}
                           </div>
                       </div>
                       <div className="space-y-2">
                           <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">PIEZAS SOLICITADAS</Label>
                           <div className="p-3 border rounded-xl bg-gray-50 font-black text-lg">
                               {itemToReport?.quantity || 0}
                           </div>
                       </div>
                   </div>

                   <div className="space-y-2 relative">
                       <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">PRODUCTO DESPACHADO (REAL):</Label>
                       <div className="relative">
                           <Input
                               placeholder="Busca o selecciona subcategoría..."
                               value={isInventoryPopoverOpen ? subcategoriaSearchDraft : searchQueryDespachado}
                               onChange={(e) => setSubcategoriaSearchDraft(e.target.value)}
                               onFocus={() => {
                                   setSubcategoriaSearchDraft('');
                                   setIsInventoryPopoverOpen(true);
                               }}
                               onBlur={() => setIsInventoryPopoverOpen(false)}
                               className="h-12 rounded-xl text-xs font-bold pr-10"
                           />
                           <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                       </div>
                       {/* Dropdown sin Popover/Portal: dentro de un Dialog, el
                           Popover de Radix porta su contenido fuera del árbol de
                           foco que el Dialog controla, lo que rompía el clic y el
                           scroll (y al reabrirlo, su detector de "clic afuera" lo
                           cerraba solo). Un div posicionado en el flujo normal del
                           DOM evita ese problema por completo. */}
                       {isInventoryPopoverOpen && (
                           <div className="absolute z-[110] mt-1 w-full max-h-[300px] overflow-y-auto bg-white shadow-xl rounded-md border">
                               {loadingInventory && <div className="p-4 text-center text-xs text-muted-foreground"><Loader2 className="animate-spin h-4 w-4 mx-auto" /></div>}
                               {!loadingInventory && filteredInventoryList.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">No se encontraron resultados.</div>}
                               {filteredInventoryList.map((item, idx) => (
                                   <div
                                       key={`${item.subcategoria}-${idx}`}
                                       onMouseDown={(e) => {
                                           e.preventDefault(); // Previene la pérdida de foco inmediata
                                           handleSelectProduct(item.subcategoria);
                                       }}
                                       className={cn(
                                           "flex items-center gap-2 px-4 py-3 cursor-pointer rounded-md transition-colors",
                                           searchQueryDespachado === item.subcategoria ? "bg-starbucks-green/10" : "hover:bg-gray-100"
                                       )}
                                   >
                                       <span className={cn("flex-1 text-xs font-bold", searchQueryDespachado === item.subcategoria ? "text-starbucks-green" : "text-gray-700")}>
                                           {item.subcategoria}
                                       </span>
                                       {searchQueryDespachado === item.subcategoria && <Check className="h-4 w-4 text-starbucks-green" />}
                                   </div>
                               ))}
                           </div>
                       )}
                   </div>

                   <div className="space-y-2">
                       <Label htmlFor="disp-qty" className="text-[10px] font-black text-gray-400 uppercase tracking-widest">PIEZAS DESPACHADAS (REAL):</Label>
                       <Input
                            id="disp-qty"
                            type="number"
                            min="0"
                            step="1"
                            value={piezasDespachadas}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val !== '' && Number(val) < 0) return;
                                setPiezasDespachadas(val);
                            }}
                            placeholder="0"
                            className="bg-transparent h-12 rounded-xl font-black text-lg"
                        />
                   </div>

                   <div className="space-y-2">
                       <Label htmlFor="obs" className="text-[10px] font-black text-gray-400 uppercase tracking-widest">OBSERVACIONES:</Label>
                       <Textarea 
                            id="obs" 
                            value={observacionesIncidencia} 
                            onChange={(e) => setObservacionesIncidencia(e.target.value)} 
                            placeholder="Ej. El paquete venía con menos piezas..." 
                            className="min-h-[100px] rounded-xl text-sm" 
                        />
                   </div>
               </div>

               <DialogFooter className="flex flex-row gap-3 sm:justify-end">
                   <Button variant="outline" onClick={() => setIsDiscrepancyModalOpen(false)} className="h-12 px-6 rounded-xl font-bold flex-1 sm:flex-none">
                       Cancelar
                   </Button>
                   <Button 
                        onClick={handleSendDiscrepancyReport} 
                        disabled={loading || !piezasDespachadas} 
                        className="bg-amber-600 hover:bg-amber-700 text-white h-12 px-8 rounded-xl font-black flex-1 sm:flex-none transition-all shadow-lg shadow-amber-200"
                    >
                       {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Enviar Reporte'}
                   </Button>
               </DialogFooter>
           </DialogContent>
       </Dialog>

       <Dialog open={loteConfirmation.isOpen} onOpenChange={(isOpen) => setLoteConfirmation(prev => ({...prev, isOpen}))}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>Confirmar Anexión a Lote Existente</DialogTitle>
                  <DialogDescription>
                    <div className="pt-4 space-y-4">
                        <Alert variant="destructive" className="mb-4">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>¡Atención!</AlertTitle>
                            <AlertDescription>El lote <span className="font-bold">{loteId}</span> ya existe.</AlertDescription>
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
