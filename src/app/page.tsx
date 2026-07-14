
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
import { Zap, ZoomIn, UserPlus, PlusCircle, Clock, AlertTriangle, Wifi, WifiOff, Search, XCircle, CheckCircle, Trash2, Lock, Unlock, FileText, Printer, Download, FileUp, FileSpreadsheet, Loader2, Copy, ChevronDown, ChevronUp, Users, Info, ShoppingCart, UserCheck } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useReactToPrint } from "react-to-print";
import TicketPreview from "@/components/TicketPreview";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/components/AuthProvider';
import { cn, getCameraCapabilitiesWithRetry } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


type ScannedItem = {
  code: string;
  fecha: string;
  hora: string;
  encargado: string;
  area: string;
  sku: string | null;
  subcategoria?: string | null;
  cantidad: number | null;
  producto: string | null;
  empresa: string | null;
  venta: string | null;
  esti_time?: number | null;
  deli_date?: string | null;
};

type CreatedLote = {
  lote_p: string;
  name_inc: string;
  name: string;
  date: string;
  count: number;
  total_esti_time: number;
};

type PersonalOperativo = {
  id: string;
  name: string;
  email?: string | null;
};

type ScheduledItem = ScannedItem & { horaInicioStr: string; horaFinStr: string };

// Simula el encadenado de horarios (cada registro empieza cuando termina el
// anterior según su tiempo estimado). Se extrae de renderPendingRecords para que
// la tabla de escritorio y las tarjetas de móvil calculen exactamente lo mismo
// en vez de mantener dos copias de esta lógica que podrían desincronizarse.
const getScheduledRows = (data: ScannedItem[]): ScheduledItem[] => {
  const renderTime = new Date();
  let lastFinishTime: Date = renderTime;
  const uniqueData = Array.from(new Map(data.map(item => [item.code, item])).values());

  return uniqueData.map((item, index) => {
    const startTime: Date = index === 0 ? renderTime : lastFinishTime;

    let horaFin: Date | null = null;
    if (!isNaN(startTime.getTime()) && item.esti_time) {
      horaFin = new Date(startTime.getTime() + item.esti_time * 60000);
    }
    lastFinishTime = horaFin || startTime;

    const horaInicioStr = !isNaN(startTime.getTime())
      ? startTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
      : 'N/A';
    const horaFinStr = horaFin
      ? horaFin.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
      : 'N/A';

    return { ...item, horaInicioStr, horaFinStr };
  });
};

type DbStatus = {
    etiquetasDb: 'connecting' | 'success' | 'error';
};

type VerificationResult = {
    status: 'verified' | 'not-found' | 'error' | 'pending';
    message: string;
};

const SWIPE_OPEN_X = -84;

// Definido fuera de Home: si viviera dentro, Home lo recrearía en cada render y
// React lo trataría como un tipo de componente nuevo cada vez, perdiendo el
// estado de arrastre/expansión de cada tarjeta constantemente.
function MobilePendingRow({
  data,
  index,
  isOpen,
  onOpenChange,
  onDelete,
  onTimeChange,
}: {
  data: ScheduledItem;
  index: number;
  isOpen: boolean;
  onOpenChange: (code: string | null) => void;
  onDelete: (code: string) => void;
  onTimeChange: (code: string, value: string) => void;
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

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden mb-1.5 bg-starbucks-white">
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
          className="relative z-10 bg-starbucks-white"
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
            {/* Código arriba, subcategoría del SKU (o el SKU si no se encontró
                una) debajo — ya calculado al escanear vía sku_alterno → sku_m
                en addCodeAndUpdateCounters, mismo dato que ve la tabla de escritorio. */}
            <div className="min-w-0 flex-1 flex flex-col gap-0.5">
              <span className="font-mono text-xs font-bold text-starbucks-dark whitespace-nowrap">{data.code}</span>
              <span className="text-[9px] font-medium text-starbucks-accent truncate">{data.subcategoria || data.sku || '—'}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Input
                type="number"
                value={data.esti_time ?? ''}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onTimeChange(data.code, e.target.value)}
                className="w-12 h-7 px-1 text-xs text-center bg-starbucks-cream/60"
                placeholder="min"
                min="1"
              />
              <span className="text-[8px] text-gray-400 font-bold">min</span>
            </div>
            <span className="text-sm font-black text-starbucks-accent bg-starbucks-cream rounded px-2 py-1 tabular-nums shrink-0">×{data.cantidad}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 text-gray-400 transition-transform flex-shrink-0", expanded && "rotate-180")} />
          </div>
          <div className="grid transition-[grid-template-rows] duration-200" style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}>
            <div className="overflow-hidden">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-2.5 pb-2.5 pt-1 pl-8 border-t border-dashed border-gray-200 mt-0.5 text-[11px]">
                <div><dt className="text-[8px] font-black uppercase tracking-wide text-gray-400">SKU</dt><dd className="font-semibold text-starbucks-dark truncate">{data.sku}</dd></div>
                <div><dt className="text-[8px] font-black uppercase tracking-wide text-gray-400">Producto</dt><dd className="font-semibold text-starbucks-dark">{data.producto}</dd></div>
                <div><dt className="text-[8px] font-black uppercase tracking-wide text-gray-400">Empresa</dt><dd className="font-semibold text-starbucks-dark">{data.empresa}</dd></div>
                <div><dt className="text-[8px] font-black uppercase tracking-wide text-gray-400">Venta</dt><dd className="font-semibold text-starbucks-dark">{data.venta}</dd></div>
                <div><dt className="text-[8px] font-black uppercase tracking-wide text-gray-400">Hora asignación</dt><dd className="font-semibold text-starbucks-dark">{data.hora}</dd></div>
                <div><dt className="text-[8px] font-black uppercase tracking-wide text-gray-400">Inicio → Fin</dt><dd className="font-semibold text-starbucks-dark">{data.horaInicioStr} → {data.horaFinStr}</dd></div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { profile, user, isGuest } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  const [message, setMessage] = useState<{text: React.ReactNode, type: 'info' | 'success' | 'duplicate', show: boolean}>({text: 'Esperando para escanear...', type: 'info', show: false});
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [encargado, setEncargado] = useState('');
  const [personalList, setPersonalList] = useState<PersonalOperativo[]>([]);
  const [selectedPersonal, setSelectedPersonal] = useState('');
  const [scannedData, setScannedData] = useState<ScannedItem[]>([]);
  const [melCodesCount, setMelCodesCount] = useState(0);
  const [longCodesCount, setLongCodesCount] = useState(0);
  const [otherCodesCount, setOtherCodesCount] = useState(0);
  const [selectedScannerMode, setSelectedScannerMode] = useState('camara');
  const [scannerActive, setScannerActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cameraCapabilities, setCameraCapabilities] = useState<any>(null);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const isMobile = useIsMobile();
  const [programadosPersonalList, setProgramadosPersonalList] = useState<{ name: string }[]>([]);
  const [programadosLotesList, setProgramadosLotesList] = useState<{ lote_p: string }[]>([]);
  const [createdLotesList, setCreatedLotesList] = useState<CreatedLote[]>([]);
  const [loadingProgramados, setLoadingProgramados] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [dbError, setDbError] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<DbStatus>({ etiquetasDb: 'connecting' });
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
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult>({ status: 'pending', message: 'Ingrese un código de corte para registrar la fecha.' });
  const [selectedArea, setSelectedArea] = useState('');
  const [skipAreaSelection, setSkipAreaSelection] = useState(false);
  const [timerStartTime, setTimerStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  
  const [isAttendanceValid, setIsAttendanceValid] = useState(false);
  const [attendanceChecked, setAttendanceChecked] = useState(false);
  const [isTargetPersonAttending, setIsTargetPersonAttending] = useState(false);
  const [checkingTargetAttendance, setCheckingTargetAttendance] = useState(false);

  const [isDeleteLoteModalOpen, setIsDeleteLoteModalOpen] = useState(false);
  const [loteIdToDelete, setLoteIdToDelete] = useState('');
  const [deleteLoteName, setDeleteLoteName] = useState('');
  const [deleteLoteReason, setDeleteLoteReason] = useState('');
  const [deleteLoteConfirmInput, setDeleteLoteConfirmInput] = useState('');

  const [workForceCapacity, setWorkForceCapacity] = useState<{ minutes: number; hours: number; employeeCount: number } | null>(null);
  const [requiredWorkload, setRequiredWorkload] = useState<{ minutes: number; orderCount: number } | null>(null);


  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const physicalScannerInputRef = useRef<HTMLInputElement | null>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const scannerSectionRef = useRef<HTMLDivElement | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  // Instancia móvil (`md:hidden`) y de escritorio (`hidden md:block`) del listado
  // de pendientes están montadas al mismo tiempo (solo una oculta por CSS), por
  // eso cada una necesita su propio ref — antes compartían uno solo y el scroll
  // automático terminaba aplicándose siempre a la copia oculta.
  const pendingTableContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingTableContainerDesktopRef = useRef<HTMLDivElement | null>(null);
  // Código de la tarjeta móvil actualmente deslizada/revelada (para eliminar).
  // Vive un nivel arriba de MobilePendingRow para que abrir una cierre la otra.
  const [openSwipeCode, setOpenSwipeCode] = useState<string | null>(null);


  const lastScanTimeRef = useRef(Date.now());
  const lastSuccessfullyScannedCodeRef = useRef<string | null>(null);
  const scannedCodesRef = useRef(new Set<string>());
  const bufferRef = useRef('');
  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const timerStartedRef = useRef(false);
  // Refleja `loading` sin ser dependencia reactiva de onScanSuccess: si estuviera
  // en sus deps, su identidad cambiaría en cada escaneo y reiniciaría el efecto
  // que arranca/detiene la cámara. Se usa para ignorar cualquier escaneo nuevo
  // mientras el anterior sigue en curso (capa extra contra duplicados por
  // escaneos muy seguidos, además de la reserva síncrona en `scannedCodesRef`).
  const loadingRef = useRef(false);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Cada código nuevo se agrega al final de scannedData, así que el último
  // registro escaneado siempre es el último renglón de la tabla; se hace
  // scroll al fondo del contenedor para que quede visible sin scrollear a mano.
  useEffect(() => {
    [pendingTableContainerRef.current, pendingTableContainerDesktopRef.current].forEach(container => {
      if (container) container.scrollTop = container.scrollHeight;
    });
  }, [scannedData.length]);


  const MIN_SCAN_INTERVAL = 500;

  const reactToPrintFn = useReactToPrint({ contentRef: printRef });

  const fetchWorkForceCapacity = useCallback(async () => {
    try {
        const today = new Date().toLocaleDateString('en-CA');
        const daysMapping = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
        const currentDayName = daysMapping[new Date().getDay()];

        const { data: allAttendance, error: attError } = await supabaseEtiquetas
            .from('registro_checador')
            .select('id_empleado, tipo_registro, id')
            .eq('fecha', today)
            .order('id', { ascending: true });

        if (attError || !allAttendance) return;

        const lastStatus = new Map<string, string>();
        allAttendance.forEach(rec => {
            lastStatus.set(rec.id_empleado, rec.tipo_registro);
        });

        const activeEmployeeIds = Array.from(lastStatus.entries())
            .filter(([_, status]) => status === 'entrada')
            .map(([id, _]) => id);

        if (activeEmployeeIds.length === 0) {
            setWorkForceCapacity({ minutes: 0, hours: 0, employeeCount: 0 });
            return;
        }

        const { data: shifts, error: shiftError } = await supabaseEtiquetas
            .from('empleados_turno_horarios')
            .select(`id_empleado, ${currentDayName}`)
            .in('id_empleado', activeEmployeeIds);

        if (shiftError || !shifts) return;

        const scheduleIds = Array.from(new Set(shifts.map(s => s[currentDayName]).filter(Boolean)));
        
        if (scheduleIds.length === 0) {
            setWorkForceCapacity({ minutes: 0, hours: 0, employeeCount: activeEmployeeIds.length });
            return;
        }

        const { data: schedules, error: schedError } = await supabaseEtiquetas
            .from('horarios')
            .select('id, hora_entrada, hora_salida')
            .in('id', scheduleIds);

        if (schedError || !schedules) return;

        const scheduleMap = new Map(schedules.map(s => [s.id, s]));

        let totalMinutes = 0;
        shifts.forEach(s => {
            const schedId = s[currentDayName];
            const time = scheduleMap.get(schedId);
            if (time && time.hora_entrada && time.hora_salida) {
                const [h1, m1] = time.hora_entrada.split(':').map(Number);
                const [h2, m2] = time.hora_salida.split(':').map(Number);
                
                const duration = (h2 * 60 + m2) - (h1 * 60 + m1);
                if (duration > 0) totalMinutes += duration;
            }
        });

        setWorkForceCapacity({
            minutes: totalMinutes,
            hours: Math.floor(totalMinutes / 60),
            employeeCount: activeEmployeeIds.length
        });

    } catch (err) {
        console.error("Error calculating workforce capacity:", err);
    }
  }, []);

  const fetchRequiredWorkload = useCallback(async () => {
    try {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0,0,0,0)).toISOString();
      const endOfDay = new Date(today.setHours(23,59,59,999)).toISOString();

      const { data: sales, error: salesError } = await supabaseEtiquetas
        .from('ml_sales')
        .select('sku, pack_quantity')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay);

      if (salesError || !sales) return;
      
      if (sales.length === 0) {
        setRequiredWorkload({ minutes: 0, orderCount: 0 });
        return;
      }

      const skusInSales = Array.from(new Set(sales.map(s => s.sku).filter(Boolean))) as string[];
      
      const { data: skuMTimes, error: mError } = await supabaseEtiquetas
        .from('sku_m')
        .select('sku, esti_time')
        .in('sku', skusInSales);

      if (mError) throw mError;

      const skuToTimeMap = new Map();
      if (skuMTimes) {
        skuMTimes.forEach(m => {
            if (m.sku) {
                skuToTimeMap.set(m.sku, m.esti_time || 0);
            }
        });
      }

      let totalMinutes = 0;
      sales.forEach(sale => {
        const time = skuToTimeMap.get(sale.sku) || 0;
        const qty = sale.pack_quantity || 1;
        totalMinutes += (time * qty);
      });

      setRequiredWorkload({
        minutes: Math.round(totalMinutes),
        orderCount: sales.length
      });

    } catch (err) {
      console.error("Error calculating required workload:", err);
    }
  }, []);

  const fetchCreatedLotes = useCallback(async () => {
    const { data, error } = await supabaseEtiquetas
      .from('personal_prog')
      .select('lote_p, name_inc, name, date, esti_time')
      .not('lote_p', 'is', null);

    if (error) {
      console.error('Error fetching created lotes:', error);
    } else if (data) {
      const lotesAggr: { [key: string]: { name_inc: string; name: string; date: string; count: number; total_esti_time: number; } } = {};

      for (const item of data) {
        if (item.lote_p) {
          if (lotesAggr[item.lote_p]) {
            lotesAggr[item.lote_p].count++;
            lotesAggr[item.lote_p].total_esti_time += item.esti_time || 0;
          } else {
            lotesAggr[item.lote_p] = {
              name_inc: item.name_inc,
              name: item.name,
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
        .sort((a, b) => b.lote_p.localeCompare(a.lote_p));
  
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
    
    const savedData = localStorage.getItem('scannedData');
    if (savedData) {
        try {
            const parsed = JSON.parse(savedData);
            setScannedData(parsed);
            parsed.forEach((item: ScannedItem) => scannedCodesRef.current.add(item.code));
            
            const mel = parsed.filter((item: ScannedItem) => String(item.code).startsWith('4')).length;
            const long = parsed.filter((item: ScannedItem) => String(item.code).length > 30).length;
            setMelCodesCount(mel);
            setLongCodesCount(long);
            setOtherCodesCount(parsed.length - mel);
        } catch (e) {
            console.error("Error al recuperar sesión guardada:", e);
        }
    }

    const checkDbConnections = async () => {
      const { error: etiquetasError } = await supabaseEtiquetas.from('etiquetas_i').select('code').limit(1);
      setDbStatus({ etiquetasDb: etiquetasError ? 'error' : 'success' });
    };
    checkDbConnections();
    fetchCreatedLotes();
    fetchWorkForceCapacity();
    fetchRequiredWorkload();

    const channel = supabaseEtiquetas
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
      supabaseEtiquetas.removeChannel(channel);
    };
  }, [fetchCreatedLotes, fetchWorkForceCapacity, fetchRequiredWorkload]);

  useEffect(() => {
    if (!user?.email) return;

    const checkAttendanceAndFetchName = async () => {
        try {
            const { data: empData, error: empError } = await supabaseEtiquetas
                .from('empleados')
                .select('nombres, apellido_paterno, apellido_materno')
                .eq('email', user.email)
                .maybeSingle();

            if (empData) {
                const fullName = [empData.nombres, empData.apellido_paterno, empData.apellido_materno].filter(Boolean).join(' ').trim().toUpperCase();
                setEncargado(fullName);
            } else if (profile?.name) {
                setEncargado(profile.name.toUpperCase());
            }

            const todayStr = new Date().toLocaleDateString('en-CA'); 

            // Validación de asistencia del encargado
            const { data: attendanceData, error: attendanceError } = await supabaseEtiquetas
                .from('registro_checador')
                .select('id')
                .eq('id_empleado', user.id)
                .eq('fecha', todayStr)
                .eq('tipo_registro', 'entrada')
                .limit(1);

            if (attendanceError) throw attendanceError;

            setIsAttendanceValid(attendanceData && attendanceData.length > 0);
            
        } catch (err) {
            console.error("Error checking user attendance/name:", err);
            setIsAttendanceValid(false);
        } finally {
            setAttendanceChecked(true);
        }
    };

    checkAttendanceAndFetchName();
  }, [user, profile]);

  useEffect(() => {
    if (isMounted) {
        localStorage.setItem('scannedData', JSON.stringify(scannedData));
        localStorage.setItem('selectedArea', selectedArea);
        localStorage.setItem('selectedPersonal', selectedPersonal);
        localStorage.setItem('loteProgramado', loteProgramado);
    }
  }, [scannedData, selectedArea, selectedPersonal, loteProgramado, isMounted]);
  
  useEffect(() => {
    if (isMobile && encargado && scannerSectionRef.current) {
      scannerSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [encargado, isMobile]);

  useEffect(() => {
    if (!selectedPersonal) {
      setIsTargetPersonAttending(false);
      return;
    }

    const checkTargetAttendance = async () => {
        setCheckingTargetAttendance(true);
        try {
            const todayStr = new Date().toLocaleDateString('en-CA');

            // Validación de asistencia para el operario seleccionado
            const { data, error } = await supabaseEtiquetas
                .from('registro_checador')
                .select('id')
                .eq('id_empleado', selectedPersonal)
                .eq('fecha', todayStr)
                .eq('tipo_registro', 'entrada')
                .limit(1);

            if (error) throw error;

            setIsTargetPersonAttending(data && data.length > 0);

        } catch (err) {
            console.error("Error checking target attendance:", err);
            setIsTargetPersonAttending(false);
        } finally {
            setCheckingTargetAttendance(false);
        }
    };

    checkTargetAttendance();
  }, [selectedPersonal]);

  useEffect(() => {
    const fetchPersonal = async () => {
        const { data, error } = await supabaseEtiquetas
            .from('empleados')
            .select('id, nombres, apellido_paterno, apellido_materno, email')
            .order('nombres', { ascending: true });

        if (error) {
            console.error('Error al cargar empleados:', error);
        } else if (data) {
             const fullList = data.map(e => ({
                id: e.id,
                name: [e.nombres, e.apellido_paterno, e.apellido_materno].filter(Boolean).join(' ').trim().toUpperCase(),
                email: e.email
             }));

             const uniqueMap = new Map();
             fullList.forEach(item => {
                 if (!uniqueMap.has(item.name)) {
                     uniqueMap.set(item.name, item);
                 }
             });

             setPersonalList(Array.from(uniqueMap.values()));
        }
    };
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

  const clearSessionData = () => {
    scannedCodesRef.current.clear();
    setScannedData([]);
    setMelCodesCount(0);
    setLongCodesCount(0);
    setOtherCodesCount(0);
    lastSuccessfullyScannedCodeRef.current = null;
    setTimerStartTime(null);
    timerStartedRef.current = false;
    
    localStorage.removeItem('scannedData');
    localStorage.removeItem('selectedPersonal');
    localStorage.removeItem('loteProgramado');
  };

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

  const playErrorSound = () => {
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

 const addCodeAndUpdateCounters = useCallback(async (codeToAdd: string, details: { sku: string | null; cantidad: number | null; producto: string | null; empresa: string | null; venta: string | null; deli_date: string | null; }) => {
    // El código ya se reserva en `scannedCodesRef` desde `processScan` (antes de
    // las consultas a etiquetas_i/v_code/personal), así que aquí no hace falta
    // repetir el check ni el `add`: para cuando se llega aquí, ya está reservado.
    const finalCode = String(codeToAdd).trim();

    if (!timerStartedRef.current) {
        setTimerStartTime(new Date());
        timerStartedRef.current = true;
    }

    let totalEstimatedTime = 0;
    let subcategories: string[] = [];

    if (details.sku) {
        const skusToProcess = details.sku.split(' | ');
        for (const singleSku of skusToProcess) {
            try {
                const { data: skuAlternoData } = await supabaseEtiquetas
                    .from('sku_alterno')
                    .select('sku_mdr')
                    .eq('sku', singleSku)
                    .limit(1)
                    .single();

                if (skuAlternoData?.sku_mdr) {
                    const { data: skuMData } = await supabaseEtiquetas
                        .from('sku_m')
                        .select('esti_time, sub_cat')
                        .eq('sku_mdr', skuAlternoData.sku_mdr)
                        .limit(1)
                        .single();
                    
                    if (skuMData) {
                        totalEstimatedTime += skuMData.esti_time || 0;
                        subcategories.push(skuMData.sub_cat || singleSku);
                    } else {
                        subcategories.push(singleSku);
                    }
                } else {
                    subcategories.push(singleSku);
                }
            } catch (e: any) {
                subcategories.push(singleSku);
            }
        }
    }


    lastSuccessfullyScannedCodeRef.current = finalCode;

    if (finalCode.startsWith('4')) {
        setMelCodesCount(prev => prev + 1);
    } else {
        setOtherCodesCount(prev => prev + 1);
    }

    if (finalCode.length > 30) {
        setLongCodesCount(prev => prev + 1);
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
      subcategoria: subcategories.length > 0 ? Array.from(new Set(subcategories)).join(' | ') : details.sku,
      cantidad: details.cantidad,
      producto: details.producto,
      empresa: details.empresa,
      venta: details.venta,
      esti_time: totalEstimatedTime > 0 ? totalEstimatedTime : null,
      deli_date: details.deli_date,
    };

    setScannedData(prevData => [...prevData, newItem]);
    return true;
  }, [encargado, selectedArea]);

  const saveToPersonal = async (personIdOrName: string) => {
      // VALIDACIÓN CRÍTICA DE ASISTENCIA
      if (!isGuest && !isTargetPersonAttending) {
          playErrorSound();
          showModalNotification(
            'Operario sin Asistencia', 
            'No es posible asociar etiquetas porque la persona seleccionada NO tiene un registro de entrada el día de hoy. Por favor, verifica que haya checado correctamente.', 
            'destructive'
          );
          return;
      }

      setLoading(true);
      showAppMessage('Guardando asignación...', 'info');

      try {
          const employee = personalList.find(p => p.id === personIdOrName || p.name === personIdOrName);
          const personId = employee?.id || null;
          const personName = employee?.name || personIdOrName;

          const { data: lastRecords, error: lastRecordError } = await supabaseEtiquetas
              .from('personal')
              .select('date_esti')
              .eq('name', personName)
              .not('date_esti', 'is', null)
              .order('date_esti', { ascending: false })
              .limit(1);

          if (lastRecordError) {
              throw new Error(`Error al buscar último registro: ${lastRecordError.message}`);
          }
          
          const associationTimestamp = new Date();
          let lastFinishTime = lastRecords && lastRecords.length > 0 ? new Date(lastRecords[0].date_esti) : associationTimestamp;
          
          if (lastFinishTime < associationTimestamp) {
              lastFinishTime = associationTimestamp;
          }

          const batchStartTime = new Date(lastFinishTime.getTime());

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
                id_empleado_despacha: personId,
                name_inc: item.encargado,
                id_empleado_asigna: user?.id ?? null,
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

          const batchEndTime = new Date(lastFinishTime.getTime());
          const diffSeconds = Math.floor((batchEndTime.getTime() - batchStartTime.getTime()) / 1000);

          const { error } = await supabaseEtiquetas.from('personal').insert(dataToInsert);
          if (error) {
              throw error;
          };

          // Guardar registro de tiempos del empleado
          if (personId) {
            await supabaseEtiquetas.from('empleados_tiempos').insert({
                empleado_id: personId,
                inicio: batchStartTime.toISOString(),
                fin: batchEndTime.toISOString(),
                segundos_transcurridos: diffSeconds
            });
          }

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

  const handleManualAssociate = async () => {
    if (!selectedPersonal) {
      showModalNotification('Falta Personal', 'Por favor, selecciona al personal para asociar.', 'destructive');
      return;
    }
    await saveToPersonal(selectedPersonal);
  };
  
  const onScanSuccess = useCallback((decodedText: string, decodedResult: any) => {
    if (!scannerActive || loadingRef.current || Date.now() - lastScanTimeRef.current < MIN_SCAN_INTERVAL || (!isGuest && !isAttendanceValid)) return;
    lastScanTimeRef.current = Date.now();
    
    let finalCode = decodedText;
    try {
        const parsed = JSON.parse(decodedText);
        if (parsed && parsed.id) {
            finalCode = String(parsed.id);
        }
    } catch (e) {}
    
    setLastScannedCode(finalCode);
  }, [scannerActive, isAttendanceValid, isGuest]);

 const processScan = useCallback(async (decodedText: string) => {
    if (!isGuest && !isAttendanceValid) {
        showModalNotification('Asistencia Requerida', 'Tú (encargado) debes tener un registro de entrada hoy para operar.', 'destructive');
        return;
    }

    setLoading(true);
    const finalCode = String(decodedText).trim();

    if (scanMode === 'unassign') {
        try {
            const { data: existingRows, error: findError } = await supabaseEtiquetas
                .from('personal')
                .select('code')
                .eq('code', finalCode);

            if (findError) throw findError;

            if (!existingRows || existingRows.length === 0) {
                showModalNotification('No Encontrado', `El código ${finalCode} no está asignado a nadie.`, 'destructive');
                playErrorSound();
                return;
            }

            const { error: deleteError } = await supabaseEtiquetas
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
            const { data: etiquetaRows, error } = await supabaseEtiquetas
                .from('etiquetas_i')
                .select('code')
                .eq('code', finalCode);

            if (error) throw error;

            if (!etiquetaRows || etiquetaRows.length === 0) {
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
    
    try {
        if (scannedCodesRef.current.has(finalCode) || finalCode === lastSuccessfullyScannedCodeRef.current) {
            if (scannedCodesRef.current.has(finalCode)) {
                showAppMessage(<>DUPLICADO: {finalCode}</>, 'duplicate');
            }
            setLoading(false);
            return;
        }

        const employee = personalList.find(p => p.id === finalCode || p.name === finalCode);
        if (employee) {
            if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);

            if (scannedData.length === 0) {
                showModalNotification('Lista Vacía', 'No hay etiquetas pendientes para asociar.', 'info');
                setLoading(false); 
                return;
            }
            
            // VALIDACIÓN DE ASISTENCIA AL ESCANEAR ID DE EMPLEADO
            if (!isGuest) {
                const todayStr = new Date().toLocaleDateString('en-CA');
                const { data: attData } = await supabaseEtiquetas
                    .from('registro_checador')
                    .select('id')
                    .eq('id_empleado', employee.id)
                    .eq('fecha', todayStr)
                    .eq('tipo_registro', 'entrada')
                    .limit(1);

                if (!attData || attData.length === 0) {
                    playErrorSound();
                    showModalNotification('Operario sin Asistencia', `${employee.name} no ha registrado entrada hoy. No es posible asignarle trabajo.`, 'destructive');
                    setLoading(false);
                    return;
                }
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

            await saveToPersonal(employee.id);

            lastSuccessfullyScannedCodeRef.current = finalCode;
            setLoading(false);
            return;
        }

        // Se reserva el código ya mismo, antes de cualquier consulta async
        // (etiquetas_i, v_code, personal, sku_alterno/sku_m): así, si el mismo
        // código se vuelve a escanear mientras estas consultas siguen en vuelo,
        // el check del inicio de esta función ya lo detecta como duplicado en
        // vez de dejarlo pasar por la ventana de carrera. Si el código termina
        // rechazado más abajo, se libera con `scannedCodesRef.current.delete`.
        scannedCodesRef.current.add(finalCode);

        const { data: etiquetaRows, error: etiquetaInfoError } = await supabaseEtiquetas
            .from('etiquetas_i')
            .select('code_i, sku, quantity, product, organization, sales_num, deli_date')
            .eq('code', finalCode);
        
        if (etiquetaInfoError) {
            throw new Error(`Error al buscar en 'etiquetas_i': ${etiquetaInfoError.message}`);
        }

        if (!etiquetaRows || etiquetaRows.length === 0) {
            scannedCodesRef.current.delete(finalCode);
            // Solo muestra modal si el código tiene más de 30 caracteres
            if (finalCode.length > 30) {
                showModalNotification('Error de Etiqueta ML', `Este código largo (>30 carac.) no existe en la base de datos de etiquetas. Verifica su origen.`, 'destructive');
            } else {
                showAppMessage(`Etiqueta ${finalCode} no encontrada.`, 'duplicate');
            }
            playErrorSound();
            setLoading(false);
            return;
        }

        const uniqueCodeIs = Array.from(new Set(etiquetaRows.map(r => r.code_i).filter(Boolean)));
        if (uniqueCodeIs.length === 0) {
             scannedCodesRef.current.delete(finalCode);
             showModalNotification('Error de Etiqueta', `La etiqueta ${finalCode} no tiene un código de corte asociado.`, 'destructive');
             playErrorSound();
             setLoading(false);
             return;
        }

        for (const codeI of uniqueCodeIs) {
            const { data: vCodeRows, error: vCodeInfoError } = await supabaseEtiquetas
                .from('v_code')
                .select('corte_etiquetas')
                .eq('code_i', codeI);

            if (vCodeInfoError) {
                 throw new Error(`Error al verificar el corte en 'v_code': ${vCodeInfoError.message}`);
            }
            
            if (!vCodeRows || vCodeRows.length === 0 || vCodeRows[0].corte_etiquetas === null) {
                scannedCodesRef.current.delete(finalCode);
                showModalNotification('Corte no Realizado', `La etiqueta ${finalCode} no puede ser asignada porque el corte (${codeI}) aún no ha sido realizado.`, 'destructive');
                playErrorSound();
                setLoading(false);
                return;
            }
        }


        const { data: personalRows, error: personalError } = await supabaseEtiquetas
            .from('personal')
            .select('code, name, name_inc')
            .eq('code', finalCode);

        if (personalError) {
            throw new Error(`Error al verificar en 'personal': ${personalError.message}`);
        }

        if (personalRows && personalRows.length > 0) {
            scannedCodesRef.current.delete(finalCode);
            const personalData = personalRows[0];
            playErrorSound();
            showAppMessage(
                <>El código {finalCode} ya fue asignado a <strong className="font-bold">{personalData.name}</strong> por <strong className="font-bold">{personalData.name_inc}</strong>.</>,
                'duplicate'
            );
            setLoading(false);
            return;
        }

        const allSkus = etiquetaRows.map(r => r.sku).filter(Boolean).join(' | ');
        const totalQuantity = etiquetaRows.reduce((acc, curr) => acc + (curr.quantity || 0), 0);
        const firstRow = etiquetaRows[0];

        await addCodeAndUpdateCounters(finalCode, { 
            sku: allSkus, 
            cantidad: totalQuantity, 
            producto: firstRow.product, 
            empresa: firstRow.organization, 
            venta: firstRow.sales_num ? String(firstRow.sales_num) : null, 
            deli_date: firstRow.deli_date 
        });

    } catch (error: any) {
        // Libera la reserva del código: si el escaneo no se completó por un
        // error inesperado, no debe quedar bloqueado para un reintento. `delete`
        // sobre una clave que no llegó a reservarse (error antes de esa línea)
        // es un no-op seguro.
        scannedCodesRef.current.delete(finalCode);
        playErrorSound();
        showAppMessage(error.message, 'duplicate');
    } finally {
        setLoading(false);
    }
}, [addCodeAndUpdateCounters, scannedData, personalList, scanMode, selectedArea, skipAreaSelection, isAttendanceValid, isGuest]);


  useEffect(() => {
    if(lastScannedCode) {
      processScan(lastScannedCode);
      setLastScannedCode(null); 
    }
  }, [lastScannedCode, processScan]);


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
    if (isMobile && scannerActive && selectedScannerMode === 'camara' && html5QrCodeRef.current?.getState() === Html5QrcodeScannerState.SCANNING) {
      const videoElement = readerRef.current?.querySelector('video');
      if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        if (track) {
          applyCameraConstraints(track);
        }
      }
    }
  }, [zoom, isFlashOn, scannerActive, selectedScannerMode, isMobile, applyCameraConstraints, loading, scannedData.length]);

  useEffect(() => {
    if (!isMounted || !readerRef.current) return;

    if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode(readerRef.current.id, false);
    }
    const qrCode = html5QrCodeRef.current;
    // El resultado de getCameraCapabilitiesWithRetry puede tardar hasta ~1.5s;
    // si el usuario detiene (o reinicia) la cámara antes de que resuelva, esa
    // promesa vieja no debe pisar el estado con datos de un track ya muerto.
    let cancelled = false;

    const cleanup = async () => {
        cancelled = true;
        if (qrCode && qrCode.isScanning) {
            try {
                await qrCode.stop();
            } catch (err) {
                if (!String(err).includes('not started') && !String(err).includes('transition')) {
                    console.error("Fallo al detener el escáner:", err);
                }
            } finally {
              if (isMobile) {
                setCameraCapabilities(null);
                setIsFlashOn(false);
                setZoom(1);
              }
            }
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
              const videoElement = readerRef.current?.querySelector('video');
              const stream = videoElement?.srcObject as MediaStream;
              const track = stream?.getVideoTracks()[0];
              if (track) {
                getCameraCapabilitiesWithRetry(track).then(caps => { if (!cancelled) setCameraCapabilities(caps); });
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
            bufferRef.current += event.key;
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
    if (!isGuest && !isAttendanceValid) {
        showModalNotification('Asistencia Requerida', 'Tú (encargado) debes tener un registro de entrada hoy para operar.', 'destructive');
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
        const newLongCount = newData.filter(item => item.code.length > 30).length;
        const newOtherCount = newData.length - newMelCount;

        setMelCodesCount(newMelCount);
        setLongCodesCount(newLongCount);
        setOtherCodesCount(newOtherCount);
        
        scannedCodesRef.current.delete(codeToDelete);
        showAppMessage(`Registro ${codeToDelete} borrado.`, 'info');

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
  };

  const handleShowTicketPreview = () => {
    if (scannedData.length === 0) {
      showModalNotification('Lista Vacía', 'No hay datos para generar el ticket.', 'info');
      return;
    }
    if (!selectedPersonal) {
      showModalNotification('Falta Empacador', 'Por favor, selecciona al personal que empacará los productos.', 'destructive');
      return;
    }
    if (!selectedArea && !skipAreaSelection) {
      showModalNotification('Falta Área', 'Por favor, selecciona un área de trabajo o marca la opción para continuar sin una.', 'destructive');
      return;
    }
    setIsPrintDialogOpen(true);
  };

  const ticketData = useMemo(() => {
    const resumenMap: Record<string, { pieces: number, orders: number }> = {};
    const desgloseMap: Record<string, number> = {};

    scannedData.forEach(item => {
      const cat = item.subcategoria || item.sku || 'SIN CATEGORÍA';
      const qty = item.cantidad || 0;
      
      if (!resumenMap[cat]) resumenMap[cat] = { pieces: 0, orders: 0 };
      resumenMap[cat].pieces += qty;
      resumenMap[cat].orders += 1;

      const key = `${qty}|${cat}`;
      desgloseMap[key] = (desgloseMap[key] || 0) + 1;
    });

    const now = new Date();
    let cumulativeTime = now;
    scannedData.forEach(item => {
      if (item.esti_time) {
        cumulativeTime = new Date(cumulativeTime.getTime() + item.esti_time * 60000);
      }
    });

    const selectedEmployee = personalList.find(p => p.id === selectedPersonal);

    return {
      ticketId: `TKT-${Date.now()}`,
      secondaryBarcodeId: `REF-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000)}`,
      date: now.toLocaleDateString('es-MX', { day: 'numeric', month: 'numeric', year: '2-digit' }),
      time: now.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
      deadline: cumulativeTime.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }),
      encargado: encargado || 'No especificado',
      area: selectedArea || (skipAreaSelection ? 'QUINTA' : 'No especificada'),
      packer: selectedEmployee?.name || 'No seleccionado',
      resumen: Object.entries(resumenMap).map(([sub_cat, data]) => ({ sub_cat, ...data })),
      desglose: Object.entries(desgloseMap).map(([key, packages]) => {
        const [units, sub_cat] = key.split('|');
        return { units: Number(units), sub_cat, packages };
      }),
      totalPaquetes: scannedData.length,
    };
  }, [scannedData, encargado, selectedArea, skipAreaSelection, selectedPersonal, personalList]);

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(18);
    doc.setTextColor(0, 98, 65);
    doc.text("TICKET DE REQUERIMIENTOS", pageWidth / 2, 20, { align: "center" });
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`${currentTime.toLocaleDateString('es-MX')} ${currentTime.toLocaleTimeString('es-MX')}`, pageWidth / 2, 28, { align: "center" });

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(`TICKET ID: ${ticketData.ticketId}`, 14, 40);
    doc.text(`ENCARGADO: ${ticketData.encargado}`, 14, 47);
    doc.text(`ÁREA: ${ticketData.area}`, 14, 54);
    doc.text(`EMPACADOR: ${ticketData.packer}`, 14, 61);

    autoTable(doc, {
      startY: 75,
      head: [['PIEZAS', 'SUBCATEGORÍA', 'PEDIDOS']],
      body: ticketData.resumen.map(item => [item.pieces, item.sub_cat, item.orders]),
      theme: 'striped',
      headStyles: { fillColor: [0, 98, 65] },
      styles: { cellPadding: 3, fontSize: 10 },
    });

    const finalY = (doc as any).lastAutoTable.finalY || 80;
    doc.setFontSize(14);
    doc.setTextColor(0, 98, 65);
    doc.text(`TOTAL PAQUETES: ${ticketData.totalPaquetes}`, 14, finalY + 15);

    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text("SISTEMA DE CONTROL DE CALIDAD - PRODUCCIÓN EFICIENTE", pageWidth / 2, finalY + 30, { align: "center" });
    doc.text("*** FIN DE TICKET ***", pageWidth / 2, finalY + 35, { align: "center" });

    doc.save(`ticket_${ticketData.packer.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`);
  };

  const saveKpiData = async (name: string, quantity: number, timeInSeconds: number) => {
    if (quantity === 0 || !name) return;

    try {
      const { error } = await supabaseEtiquetas.from('kpis').insert({
        name: name,
        quantity: quantity,
        time: formatElapsedTime(timeInSeconds),
        rol: 'Barra',
        id_empleado: user?.id ?? null,
      });

      if (error) {
        console.error('Error saving KPI data:', error.message);
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
    
    if (!/^\d+$/.test(loteId)) {
        showModalNotification('Lote Inválido', 'El identificador de lote debe ser solo numérico.', 'destructive');
        return;
    }
    
    setLoading(true);
    showAppMessage('Guardando producción programada...', 'info');

    try {
        const { data: existingLote, error: checkError } = await supabaseEtiquetas
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

        const employee = personalList.find(p => p.id === selectedPersonal);
        const personName = employee?.name || selectedPersonal;

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
                name: personName,
                id_empleado: employee?.id || null,
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

        const { error } = await supabaseEtiquetas.from('personal_prog').insert(dataToInsert);
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
        const { data: namesData, error: namesError } = await supabaseEtiquetas.from('personal_prog').select('name');
        if (namesError) throw namesError;
        const uniqueNames = [...new Map(namesData.map(item => [item.name, item])).values()];
        setProgramadosPersonalList(uniqueNames);

        const { data: lotesData, error: lotesError } = await supabaseEtiquetas.from('personal_prog').select('lote_p');
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
        let query = supabaseEtiquetas.from('personal_prog').select('*');
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
        const originalAssignee = byPerson ? filterValue : (data.length > 0 ? data[0].name : '');
        
        const matchedEmp = personalList.find(p => p.name === originalAssignee);
        setPersonToAssign(matchedEmp?.id || originalAssignee);

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
    
    if (!isGuest) {
        const todayStr = new Date().toLocaleDateString('en-CA');
        const { data: attData } = await supabaseEtiquetas
            .from('registro_checador')
            .select('id')
            .eq('id_empleado', personToAssign)
            .eq('fecha', todayStr)
            .eq('tipo_registro', 'entrada')
            .limit(1);

        if (!attData || attData.length === 0) {
            playErrorSound();
            showModalNotification('Operario sin Asistencia', 'El operario seleccionado no tiene un registro de entrada hoy. No es posible asociarle el lote.', 'destructive');
            return;
        }
    }

    setLoading(true);

    try {
        const employee = personalList.find(p => p.id === personToAssign || p.name === personToAssign);
        const personId = employee?.id || null;
        const personName = employee?.name || personToAssign;

        const { data: lastRecords, error: lastRecordError } = await supabaseEtiquetas
            .from('personal')
            .select('date_esti')
            .eq('name', personName)
            .not('date_esti', 'is', null)
            .order('date_esti', { ascending: false })
            .limit(1);

        if (lastRecordError) {
            throw new Error(`Error al buscar último registro: ${lastRecordError.message}`);
        }
        
        const associationTimestamp = new Date();
        let lastFinishTime = lastRecords && lastRecords.length > 0 ? new Date(lastRecords[0].date_esti) : associationTimestamp;

        if (lastFinishTime < associationTimestamp) {
            lastFinishTime = associationTimestamp;
        }

        const batchStartTime = new Date(lastFinishTime.getTime());

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
                name: personName,
                id_empleado_despacha: personId,
                name_inc: item.name_inc,
                id_empleado_asigna: user?.id ?? null,
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

        const batchEndTime = new Date(lastFinishTime.getTime());
        const diffSeconds = Math.floor((batchEndTime.getTime() - batchStartTime.getTime()) / 1000);

        const { error: insertError } = await supabaseEtiquetas.from('personal').insert(dataToInsert);

        if (insertError) {
            if (insertError.code === '23505') {
                throw new Error(`Uno o más códigos ya existen en la tabla de asignaciones. No se puede duplicar.`);
            }
            throw new Error(`Error al guardar en 'personal': ${insertError.message}`);
        }

        // Guardar registro de tiempos del empleado
        if (personId) {
            await supabaseEtiquetas.from('empleados_tiempos').insert({
                empleado_id: personId,
                inicio: batchStartTime.toISOString(),
                fin: batchEndTime.toISOString(),
                segundos_transcurridos: diffSeconds
            });
        }

        const codesToDelete = loadedProgData.map(item => item.code);
        
        let deleteQuery = supabaseEtiquetas.from('personal_prog').delete().in('code', codesToDelete);
        if (cargaFilterType === 'lote' && selectedLoteParaCargar) {
            deleteQuery = deleteQuery.eq('lote_p', selectedLoteParaCargar);
        } else if (cargaFilterType === 'persona' && selectedPersonalParaCargar) {
            deleteQuery = deleteQuery.eq('name', selectedPersonalParaCargar);
        }

        const { error: deleteError } = await deleteQuery;
        
        if (deleteError) {
            throw new Error(`Error al eliminar de 'personal_prog': ${deleteError.message}. Los registros fueron asignados, pero no se eliminaron de la lista de programados.`);
        }

        showModalNotification('¡Éxito!', `Se asignaron y guardaron ${loadedProgData.length} códigos a ${personName}.`, 'success');

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
        const { data: vCodeRows, error: fetchError } = await supabaseEtiquetas
            .from('v_code')
            .select('corte_etiquetas, personal_bar')
            .eq('code_i', verificationCode);

        if (verificationCode && vCodeRows && vCodeRows.length === 0) {
            setVerificationResult({ status: 'not-found', message: 'Código de corte no encontrado o inválido.' });
            setIsVerifying(false);
            return;
        }

        const vCode = vCodeRows ? vCodeRows[0] : null;
        if (vCode?.corte_etiquetas) {
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

        const { error: updateError } = await supabaseEtiquetas
            .from('v_code')
            .update({ 
                corte_etiquetas: new Date().toISOString(),
                personal_bar: encargado,
            })
            .eq('code_i', verificationCode);

        if (verificationCode && updateError) {
            throw new Error(`Error al registrar el corte: ${updateError.message}`);
        }
        
        setVerificationResult({ status: 'verified', message: `¡Éxito! Se registró el corte para ${verificationCode} por ${encargado}.` });

    } catch (e: any) {
        setVerificationResult({ status: 'error', message: e.message || 'Ocurrió un error inesperado.' });
    } finally {
        setVerificationCode('');
        setIsVerifying(false);
    }
};

  const openDeleteLoteModal = (lote_p: string) => {
    setLoteIdToDelete(lote_p);
    setDeleteLoteConfirmInput('');
    setIsDeleteLoteModalOpen(true);
  };

  // Frase exacta que hay que teclear para habilitar el borrado: previene que un
  // lote completo (todos sus registros en personal_prog) se elimine por un clic
  // apresurado — a diferencia de borrar un solo registro escaneado, esto no tiene
  // vuelta atrás salvo por el registro de auditoría en `drop_lote`.
  const deleteLoteConfirmPhrase = `ELIMINAR ${loteIdToDelete}`;
  const isDeleteLoteConfirmValid = deleteLoteConfirmInput.trim().toUpperCase() === deleteLoteConfirmPhrase.toUpperCase();

  const handleFinalDeleteLote = async () => {
    if (!deleteLoteName.trim() || !deleteLoteReason.trim()) {
        alert("Por favor, completa tu nombre y el motivo.");
        return;
    }
    if (!isDeleteLoteConfirmValid) {
        alert(`Escribe exactamente "${deleteLoteConfirmPhrase}" para confirmar.`);
        return;
    }

    setLoading(true);
    try {
      const { error: auditError } = await supabaseEtiquetas
        .from('drop_lote')
        .insert([{
            name: deleteLoteName.trim(),
            d_reason: deleteLoteReason.trim(),
            lote_p: loteIdToDelete,
            deleted_at: new Date().toISOString()
        }]);

      if (auditError) throw new Error(`Error al registrar auditoría: ${auditError.message}`);

      const { error: deleteError } = await supabaseEtiquetas
        .from('personal_prog')
        .delete()
        .eq('lote_p', loteIdToDelete);

      if (deleteError) throw deleteError;

      showModalNotification('¡Éxito!', `El lote ${loteIdToDelete} ha sido eliminado y auditado.`, 'success');
      
      setIsDeleteLoteModalOpen(false);
      setLoteIdToDelete('');
      setDeleteLoteName('');
      setDeleteLoteReason('');
      setDeleteLoteConfirmInput('');
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
  
  const isAssociationDisabled = scannedData.length === 0 || loading || (!selectedArea && !skipAreaSelection) || !selectedPersonal || (!isGuest && !isAttendanceValid);

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
    return getScheduledRows(scannedData).map((data, index) => (
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
            <td className="px-4 py-3 whitespace-nowrap text-sm">{data.cantidad}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm">{data.producto}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm">{data.sku}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm">{data.subcategoria || 'N/A'}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm">{data.empresa}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm">{data.venta}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{data.hora}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{data.horaInicioStr}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm">{data.horaFinStr}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                <Button variant="ghost" size="icon" onClick={() => deleteRow(data.code)} className="text-red-500 hover:text-red-700 h-8 w-8">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </td>
        </tr>
    ));
  };

  const groupedPersonalOptions = useMemo(() => {
    if (personalList.length === 0) return [];
    
    return [{
        label: "Personal de Operación",
        options: personalList.map(p => ({ 
            value: p.id, 
            label: p.name,
            keywords: p.email || '' 
        }))
    }];
  }, [personalList]);
  

  const renderRegistrosPendientesSection = (tableRef: React.RefObject<HTMLDivElement>, variant: 'mobile' | 'desktop') => (
    <div className="w-full">
        <div className="flex flex-wrap justify-between items-center mb-2 gap-2">
            <h2 className="text-lg font-bold text-starbucks-dark">Registros Pendientes</h2>
             <div className="flex flex-wrap gap-2">
                <Button onClick={handleShowTicketPreview} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm text-sm transition-colors duration-200" disabled={scannedData.length === 0}>
                    <FileText className="mr-2 h-4 w-4" /> Ticket
                </Button>
                <Button onClick={handleOpenCargarSeccion} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow-sm text-sm transition-colors duration-200" disabled={loading}>
                    <FileUp className="mr-2 h-4 w-4" /> Cargar
                </Button>
                <button id="clear-data" onClick={() => { if(window.confirm('¿Estás seguro?')) clearSessionData() }} className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-lg shadow-sm text-xs transition-colors duration-200">Limpiar</button>
            </div>
        </div>
        
        {showCargarProduccion && (
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
                             value={isMounted ? personToAssign : ''}
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
                                     <th className="px-2 py-1 text-left font-semibold">T. Est.</th>
                                 </tr>
                             </thead>
                             <tbody>
                                 {loadedProgData.map((item) => (
                                     <tr key={item.code} className="border-b">
                                         <td className="px-2 py-1 font-mono">{item.code}</td>
                                         <td className="px-2 py-1">{item.product}</td>
                                         <td className="px-2 py-1">{item.place || 'N/A'}</td>
                                         <td className="px-2 py-1">{item.esti_time} min</td>
                                     </tr>
                                 ))}
                             </tbody>
                         </table>
                     </div>
                     <div className="flex gap-2 justify-end">
                       <Button variant="outline" onClick={() => { setLoadedProgData([]); setPersonToAssign(''); }}>Cancelar</Button>
                       <Button onClick={handleFinalizeAssociation} disabled={loading || !personToAssign}>
                           {loading ? 'Asociando...' : 'Asociar y Guardar Producción'}
                       </Button>
                     </div>
                 </div>
               )}
                <Button variant="ghost" size="sm" className="mt-2 text-red-600" onClick={() => setShowCargarProduccion(false)}>Cerrar</Button>
           </div>
        )}

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

          <div className="space-y-2 relative">
            <label className="block text-sm font-bold text-starbucks-dark mb-1">Asociar Pendientes a:</label>
            <div className="flex flex-col md:flex-row md:items-start md:gap-4 gap-2">
                <div className="flex-grow space-y-2">
                    <Combobox
                        groupedOptions={groupedPersonalOptions}
                        value={isMounted ? selectedPersonal : ''}
                        onValueChange={setSelectedPersonal}
                        placeholder="Selecciona o busca personal..."
                        emptyMessage="No se encontró personal."
                        buttonClassName="bg-transparent border-input"
                    />
                    
                    {!isGuest && selectedPersonal && !checkingTargetAttendance && !isTargetPersonAttending && (
                        <Alert variant="destructive" className="py-2 px-3 border-none bg-red-50 animate-in slide-in-from-top-1">
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            <AlertDescription className="text-[10px] font-black uppercase text-red-600 leading-none">
                                El operario no ha registrado entrada hoy
                            </AlertDescription>
                        </Alert>
                    )}
                    {!isGuest && selectedPersonal && checkingTargetAttendance && (
                        <div className="flex items-center gap-2 px-3 py-1">
                            <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Validando asistencia...</span>
                        </div>
                    )}
                    {!isGuest && selectedPersonal && !checkingTargetAttendance && isTargetPersonAttending && (
                         <div className="flex items-center gap-1.5 px-3 py-1 text-green-600">
                            <UserCheck className="h-3.5 w-3.5" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Asistencia Confirmada</span>
                         </div>
                    )}
                </div>
                 <Button 
                    onClick={handleManualAssociate} 
                    disabled={scannedData.length === 0 || loading || (!selectedArea && !skipAreaSelection) || !selectedPersonal || (!isGuest && !isAttendanceValid)} 
                    className={cn(
                        "bg-starbucks-accent hover:bg-starbucks-green text-white w-full sm:w-auto h-10 px-6 font-black text-xs tracking-widest shadow-lg shadow-starbucks-green/20"
                    )}
                >
                    <UserPlus className="mr-2 h-4 w-4" /> ASOCIAR Y GUARDAR
                </Button>
            </div>
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
          <Button onClick={handleProduccionProgramada} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm text-sm transition-colors duration-200 w-full" disabled={scannedData.length === 0 || loading || !selectedPersonal || (!selectedArea && !skipAreaSelection)}>
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
                                <TableHead>Asignado a</TableHead>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Cantidad</TableHead>
                                <TableHead>Tiempo Asignado</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {createdLotesList.length > 0 ? createdLotesList.map((lote) => (
                                <TableRow key={lote.lote_p}>
                                    <TableCell className="font-mono">{lote.lote_p}</TableCell>
                                    <TableCell>{lote.name_inc}</TableCell>
                                    <TableCell>{lote.name}</TableCell>
                                    <TableCell>{new Date(lote.date).toLocaleString('es-MX')}</TableCell>
                                    <TableCell className="font-semibold">{lote.count}</TableCell>
                                    <TableCell>{formatTotalTime(lote.total_esti_time) || '---'}</TableCell>
                                    <TableCell className="text-right">
                                      <Button variant="ghost" size="icon" onClick={() => openDeleteLoteModal(lote.lote_p)} className="text-red-500 hover:text-red-600 h-8 w-8">
                                          <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center text-gray-500 py-4">
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

        {variant === 'desktop' ? (
            <div ref={tableRef} className="table-container border border-gray-200 rounded-lg mt-4">
                <table className="w-full min-w-full divide-y divide-gray-200">
                    <thead className="bg-starbucks-cream sticky top-0 z-10">
                        <tr>
                            <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">#</th>
                            <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">CODIGO</th>
                            <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">TIEMPO ESTIMADO</th>
                            <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">CANT</th>
                            <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">PRODUCTO</th>
                            <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">SKU</th>
                            <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-starbucks-dark uppercase tracking-wider">SUBCATEGORÍA</th>
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
        ) : (
            <div ref={tableRef} className="table-container border border-gray-200 rounded-lg mt-4 bg-starbucks-cream/40 p-1.5">
                {scannedData.length === 0 ? (
                    <p className="text-center text-gray-400 py-10 text-xs uppercase font-bold">Esperando registros...</p>
                ) : (
                    getScheduledRows(scannedData).map((item, index) => (
                        <MobilePendingRow
                            key={item.code}
                            data={item}
                            index={index}
                            isOpen={openSwipeCode === item.code}
                            onOpenChange={setOpenSwipeCode}
                            onDelete={deleteRow}
                            onTimeChange={handleTimeChange}
                        />
                    ))
                )}
            </div>
        )}
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
                    <div className={`flex items-center gap-2 p-2 rounded-lg ${dbStatus.etiquetasDb === 'success' ? 'bg-green-100 text-green-800' : dbStatus.etiquetasDb === 'error' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {dbStatus.etiquetasDb === 'success' ? <Wifi className="h-5 w-5" /> : dbStatus.etiquetasDb === 'error' ? <WifiOff className="h-5 w-5"/> : <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-800"></div>}
                        <span className="text-sm font-medium">BD Etiquetas</span>
                    </div>
                </div>

                <div className="p-4 rounded-lg border-2 border-gray-300 bg-gray-50">
                    <Label className="text-sm font-bold text-starbucks-dark">Verificar Código de Corte</Label>
                     <div className="flex items-center gap-2 mt-1">
                        <input
                            type="text"
                            value={verificationCode}
                            onChange={(e) => setVerificationCode(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 flex-grow bg-transparent"
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
                        
                        <div className="p-4 bg-gray-50 border rounded-lg">
                            <Label className="text-sm font-bold text-starbucks-dark mb-2 block">Nombre del Encargado:</Label>
                            <Input value={isMounted ? encargado : ''} disabled={true} className="bg-white border-input uppercase font-bold text-starbucks-green" />
                            <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold">Identidad vinculada a la sesión activa</p>
                        </div>

                        {scanMode === 'assign' && (
                            <div className="md:hidden">
                                {renderRegistrosPendientesSection(pendingTableContainerRef, 'mobile')}
                            </div>
                        )}
                    </div>
                    
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
                        
                        {isMounted && isMobile && scannerActive && selectedScannerMode === 'camara' && cameraCapabilities && (
                            <div className="mt-3 bg-black/70 backdrop-blur-md p-4 rounded-xl flex items-center gap-6 text-white border border-white/10">
                                {cameraCapabilities.torch && (
                                    <Button variant="ghost" size="icon" onClick={() => setIsFlashOn(!isFlashOn)} className={cn("h-10 w-10", isFlashOn ? 'text-yellow-400 bg-white/10' : 'text-white')}>
                                        <Zap className="h-6 w-6" />
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
                            <button onClick={startScanner} disabled={scannerActive || loading || !encargado} className="px-4 py-2 text-white font-semibold rounded-lg shadow-sm transition-colors duration-200 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-sm">
                                Iniciar
                            </button>
                            <button onClick={stopScanner} disabled={!scannerActive} className="px-4 py-2 text-white font-semibold rounded-lg shadow-sm transition-colors duration-200 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-sm">
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
                        <div className="grid grid-cols-2 md:grid-cols-7 gap-2 text-center">
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
                            <div className="bg-starbucks-cream p-2 rounded-lg border-2 border-starbucks-accent">
                                <h3 className="font-bold text-starbucks-dark uppercase text-[10px]">ML-LARGO</h3>
                                <p className="text-2xl font-mono text-starbucks-green">{longCodesCount}</p>
                            </div>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="bg-starbucks-white border-2 border-starbucks-green/20 p-2 rounded-lg shadow-sm hover:shadow-md transition-all cursor-help flex flex-col justify-center">
                                            <h3 className="font-bold text-starbucks-green uppercase text-[10px] flex items-center justify-center gap-1">
                                                <Users className="h-3 w-3" /> Capacidad Hoy
                                            </h3>
                                            <div className="mt-1">
                                                <p className="text-xl font-black text-starbucks-dark tracking-tighter leading-none">
                                                    {workForceCapacity?.minutes || 0} <span className="text-[10px] font-bold text-gray-400">MIN</span>
                                                </p>
                                                <div className="flex justify-between items-center mt-1 px-1">
                                                    <span className="text-[8px] font-bold text-gray-500 uppercase">
                                                        {workForceCapacity?.hours || 0}H {workForceCapacity ? workForceCapacity.minutes % 60 : 0}M
                                                    </span>
                                                    <span className="text-[8px] font-black text-gray-400 uppercase">{workForceCapacity?.employeeCount || 0} Oper.</span>
                                                </div>
                                            </div>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="max-w-xs text-center p-3">
                                        <p className="text-xs">
                                            Tiempo total disponible calculado utilizando los horarios asignados a los empleados que registraron entrada activa durante el día actual. Se obtiene sumando la duración de cada jornada (hora_salida - hora_entrada) para estimar la capacidad operativa disponible.
                                        </p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="bg-starbucks-white border-2 border-amber-200 p-2 rounded-lg shadow-sm hover:shadow-md transition-all cursor-help flex flex-col justify-center">
                                            <h3 className="font-bold text-amber-600 uppercase text-[10px] flex items-center justify-center gap-1">
                                                <ShoppingCart className="h-3 w-3" /> Trabajo ML Hoy
                                            </h3>
                                            <div className="mt-1">
                                                <p className="text-xl font-black text-starbucks-dark tracking-tighter leading-none">
                                                    {requiredWorkload?.minutes || 0} <span className="text-[10px] font-bold text-gray-400">MIN</span>
                                                </p>
                                                <div className="flex justify-between items-center mt-1 px-1">
                                                    <span className="text-[8px] font-bold text-gray-500 uppercase">
                                                        {Math.floor((requiredWorkload?.minutes || 0) / 60)}H {(requiredWorkload?.minutes || 0) % 60}M
                                                    </span>
                                                    <span className="text-[8px] font-black text-gray-400 uppercase">{requiredWorkload?.orderCount || 0} Ventas</span>
                                                </div>
                                            </div>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="max-w-xs text-center p-3">
                                        <p className="text-xs">
                                            Tiempo total de trabajo estimado basado en las ventas registradas hoy en Mercado Libre (ml_sales). Se calcula multiplicando la cantidad de cada producto por el tiempo estimado (esti_time) definido en el catálogo maestro.
                                        </p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                    )}
                </div>
                
                <div className="space-y-4">
                     <div className="p-4 bg-starbucks-cream rounded-lg">
                        <label htmlFor="manual-code-input" className="block text-sm font-bold text-starbucks-dark mb-1">Ingreso Manual:</label>
                        <div className="relative mt-1 flex items-center rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                            <input
                                type="text"
                                id="manual-code-input"
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 w-full border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
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
                    {scanMode === 'assign' && (
                        <div className="hidden md:block">
                            {renderRegistrosPendientesSection(pendingTableContainerDesktopRef, 'desktop')}
                        </div>
                    )}

                </div>
            </div>

            {loading && <div id="loading-overlay" style={{display: 'flex'}}>
                <div className="overlay-spinner"></div>
                <p className="text-lg font-semibold">Procesando...</p>
            </div>}

            {showNotification && (
                <div id="notification-overlay" className="p-4 fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[100]" onClick={() => setShowNotification(false)}>
                     <div 
                        className="bg-white rounded-[2.5rem] shadow-2xl p-8 w-full max-w-[320px] animate-in fade-in zoom-in duration-300" 
                        onClick={(e) => e.stopPropagation()}
                     >
                        <div className="flex flex-col items-center text-center space-y-6">
                            <div className={cn(
                                "p-4 rounded-3xl",
                                notification.variant === 'destructive' ? "bg-red-50 text-red-500" : 
                                notification.variant === 'success' ? "bg-green-50 text-green-600" : 
                                "bg-amber-50 text-amber-600"
                            )}>
                                {notification.variant === 'destructive' ? <XCircle className="h-10 w-10" /> : 
                                 notification.variant === 'success' ? <CheckCircle className="h-10 w-10"/> : 
                                 <AlertTriangle className="h-10 w-10" />}
                            </div>
                            
                            <div className="space-y-2">
                                <h3 className="text-xl font-black text-gray-900 tracking-tight leading-tight">
                                    {notification.title}
                                </h3>
                                <p className="text-sm text-gray-500 font-medium leading-relaxed">
                                    {notification.message}
                                </p>
                            </div>

                            <Button 
                                onClick={() => setShowNotification(false)}
                                className={cn(
                                    "w-full h-12 rounded-2xl font-black text-xs tracking-widest transition-all",
                                    notification.variant === 'destructive' ? "bg-red-500 hover:bg-red-600 shadow-lg shadow-red-100" :
                                    notification.variant === 'success' ? "bg-green-600 hover:bg-green-700 shadow-lg shadow-green-100" :
                                    "bg-starbucks-green hover:bg-starbucks-dark shadow-lg shadow-starbucks-green/20"
                                )}
                            >
                                Cerrar
                            </Button>
                        </div>
                    </div>
                </div>
            )}
            
            <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
                <DialogContent className="max-w-[500px] bg-gray-100 p-0 overflow-hidden sm:rounded-xl border-none">
                    <DialogHeader className="p-4 bg-white border-b flex flex-row items-center justify-between space-y-0">
                        <DialogTitle className="text-starbucks-green">Vista Previa de Ticket</DialogTitle>
                    </DialogHeader>
                    <div className="max-h-[80vh] overflow-y-auto p-4 bg-gray-200">
                        <div className="flex justify-center w-full min-h-full">
                            <TicketPreview ref={printRef} data={ticketData} />
                        </div>
                    </div>
                    <DialogFooter className="p-4 bg-white border-t sm:justify-center flex flex-row gap-3">
                        <Button variant="outline" onClick={() => setIsPrintDialogOpen(false)} className="flex-1 border-gray-300">
                            Cerrar
                        </Button>
                        <Button onClick={generatePDF} variant="outline" className="flex-1 border-starbucks-green text-starbucks-green hover:bg-starbucks-cream">
                            <Download className="mr-2 h-4 w-4" /> PDF
                        </Button>
                        <Button onClick={() => reactToPrintFn()} className="bg-starbucks-green hover:bg-starbucks-dark flex-1">
                            <Printer className="mr-2 h-4 w-4" /> Imprimir
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isDeleteLoteModalOpen} onOpenChange={setIsDeleteLoteModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                            <Trash2 className="h-6 w-6" />
                            Eliminar Lote Programado
                        </DialogTitle>
                        <DialogDescription>
                            Para eliminar el lote <span className="font-bold text-black">{loteIdToDelete}</span>, es necesario registrar el responsable y el motivo.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="delete-name" className="font-bold">Tu Nombre:</Label>
                            <Input
                                id="delete-name"
                                value={deleteLoteName}
                                onChange={(e) => setDeleteLoteName(e.target.value)}
                                placeholder="Escribe tu nombre completo"
                                className="bg-transparent"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="delete-reason" className="font-bold">Motivo del Borrado:</Label>
                            <Textarea
                                id="delete-reason"
                                value={deleteLoteReason}
                                onChange={(e) => setDeleteLoteReason(e.target.value)}
                                placeholder="Explica por qué se elimina este lote (ej. Error de asignación, cambio de turno...)"
                                className="bg-transparent min-h-[100px]"
                            />
                        </div>
                        <div className="space-y-2 pt-2 border-t">
                            <Label htmlFor="delete-confirm" className="font-bold text-red-600">
                                Escribe <span className="font-mono bg-red-50 px-1 rounded">{deleteLoteConfirmPhrase}</span> para confirmar:
                            </Label>
                            <Input
                                id="delete-confirm"
                                value={deleteLoteConfirmInput}
                                onChange={(e) => setDeleteLoteConfirmInput(e.target.value)}
                                placeholder={deleteLoteConfirmPhrase}
                                className="bg-transparent font-mono uppercase"
                                autoComplete="off"
                            />
                            <p className="text-xs text-gray-500">Esto borra todos los registros del lote en producción programada. No se puede deshacer.</p>
                        </div>
                    </div>
                    <DialogFooter className="flex flex-col sm:flex-row gap-2">
                        <Button variant="outline" onClick={() => { setIsDeleteLoteModalOpen(false); setDeleteLoteName(''); setDeleteLoteReason(''); setDeleteLoteConfirmInput(''); }} className="w-full sm:w-auto">
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleFinalDeleteLote}
                            disabled={loading || !deleteLoteName.trim() || !deleteLoteReason.trim() || !isDeleteLoteConfirmValid}
                            className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white font-bold"
                        >
                            {loading ? 'Procesando...' : 'Confirmar Eliminación'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </main>
    </>
  );
}
