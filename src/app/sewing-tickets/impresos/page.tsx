
'use client';

import { useEffect, useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useSewingTickets } from '@/hooks/use-sewing-tickets';
import { SewingTicketsTable } from '@/components/SewingTicketsTable';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  History, 
  ArrowLeft,
  ClipboardCheck,
  FileDown,
  FileSpreadsheet,
  Clock,
  ArrowUp,
  Tag,
  Calendar,
  Filter,
  Check,
  Loader2,
  CheckCircle2,
  Package,
  BarChart3,
  Activity
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { format, isToday, isYesterday, isTomorrow, isThisWeek, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase, supabaseEtiquetas } from '@/lib/supabaseClient';
import { SewingTicket } from '@/types/sewing';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';

const SewingMachineIcon = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M3 21h18" />
    <path d="M6 18V7a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v3" />
    <circle cx="17" cy="12" r="3" />
    <path d="M17 15v3" />
    <path d="M11 5v13" />
  </svg>
);

type DeliveryFilter = 'all' | 'today' | 'tomorrow' | 'week';
type ProdStatusFilter = 'all' | 'finished' | 'pending';

export default function SewingTicketsHistoryPage() {
  const { tickets, loading, fetchTickets, updateTicket, deleteTicket } = useSewingTickets();
  const { toast } = useToast();
  const [isMounted, setIsMounted] = useState(false);
  const [skuMetadata, setSkuMetadata] = useState<Record<string, { cat: string, time: number }>>({});
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('all');
  const [prodStatusFilter, setProdStatusFilter] = useState<ProdStatusFilter>('all');
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['group-today']);
  const [prodStatusMap, setProdStatusMap] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    fetchTickets(true);

    const handleScroll = () => {
      if (window.scrollY > 300) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [fetchTickets]);

  useEffect(() => {
    const fetchProdStatus = async () => {
      if (tickets.length === 0) return;
      const codes = tickets.map(t => parseFloat(t.codigo_barra)).filter(c => !isNaN(c));
      if (codes.length === 0) return;

      try {
        const { data, error } = await supabase
          .from('personal')
          .select('code, status')
          .in('code', codes);

        if (error) throw error;

        if (data) {
          const map: Record<string, string> = {};
          data.forEach(item => {
            map[String(item.code)] = item.status;
          });
          setProdStatusMap(map);
        }
      } catch (err) {
        console.error('Error fetching production status:', err);
      }
    };
    fetchProdStatus();
  }, [tickets]);

  useEffect(() => {
    const fetchCategories = async () => {
      if (tickets.length === 0) return;

      const skus = Array.from(new Set(tickets.map(t => t.sku).filter(Boolean))) as string[];
      if (skus.length === 0) return;

      try {
        const { data: alternos } = await supabaseEtiquetas
          .from('sku_alterno')
          .select('sku, sku_mdr')
          .in('sku', skus);
          
        if (alternos && alternos.length > 0) {
          const skuToMdr: Record<string, string> = {};
          alternos.forEach(a => skuToMdr[a.sku] = a.sku_mdr);
          const mdrs = Array.from(new Set(alternos.map(a => a.sku_mdr)));
          
          const { data: mData } = await supabaseEtiquetas
            .from('sku_m')
            .select('sku_mdr, cat_mdr, esti_time')
            .in('sku_mdr', mdrs);
            
          if (mData) {
            const mapping: Record<string, { cat: string, time: number }> = {};
            const mdrData: Record<string, { cat: string, time: number }> = {};
            mData.forEach(m => {
              mdrData[m.sku_mdr] = { cat: m.cat_mdr || '', time: m.esti_time || 0 };
            });
            
            skus.forEach(sku => {
              const mdr = skuToMdr[sku];
              if (mdr && mdrData[mdr]) {
                mapping[sku] = mdrData[mdr];
              }
            });
            setSkuMetadata(prev => ({ ...prev, ...mapping }));
          }
        }
      } catch (error) {
        console.error('Error fetching categories in history:', error);
      }
    };

    fetchCategories();
  }, [tickets]);

  const formatTime = (minutes: number) => {
    if (minutes === 0) return '0m';
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m > 0 ? `${m}m` : ''}`;
  };

  const parseLocalDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return startOfDay(new Date(year, month - 1, day));
  };

  const filteredTickets = useMemo(() => {
    let result = tickets;

    if (deliveryFilter !== 'all') {
      result = result.filter(t => {
        if (!t.fecha_entrega_paquete) return false;
        const dDate = parseLocalDate(t.fecha_entrega_paquete);
        const today = startOfDay(new Date());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        switch (deliveryFilter) {
          case 'today': return dDate.getTime() === today.getTime();
          case 'tomorrow': return dDate.getTime() === tomorrow.getTime();
          case 'week': return isThisWeek(dDate, { weekStartsOn: 1 });
          default: return true;
        }
      });
    }

    if (prodStatusFilter !== 'all') {
      result = result.filter(t => {
        const st = prodStatusMap[t.codigo_barra];
        const isFinished = st === 'PPC' || st === 'ENTREGADO';
        return prodStatusFilter === 'finished' ? isFinished : !isFinished;
      });
    }

    return result;
  }, [tickets, deliveryFilter, prodStatusFilter, prodStatusMap]);

  const traceabilityMetrics = useMemo(() => {
    const activeTickets = filteredTickets.filter(t => {
      if (!t.created_at) return false;
      const dateObj = new Date(t.created_at);
      const dateKey = format(dateObj, 'yyyy-MM-dd');
      const groupKey = isToday(dateObj) ? 'group-today' : `group-${dateKey}`;
      return expandedGroups.includes(groupKey);
    });

    const total = activeTickets.length;
    const finished = activeTickets.filter(t => {
        const st = prodStatusMap[t.codigo_barra];
        return st === 'PPC' || st === 'ENTREGADO';
    }).length;
    const pending = total - finished;
    const percent = total > 0 ? Math.round((finished / total) * 100) : 0;

    return { total, finished, pending, percent };
  }, [filteredTickets, expandedGroups, prodStatusMap]);

  const categoryMetrics = useMemo(() => {
    const groups = {
      LIENZOS: { total: 0, totalTime: 0, count: 0, finishedCount: 0 },
      'MALLAS BOLAS': { total: 0, totalTime: 0, count: 0, finishedCount: 0 },
      'MALLAS COSTURA': { total: 0, totalTime: 0, count: 0, finishedCount: 0 },
      OTROS: { total: 0, totalTime: 0, count: 0, finishedCount: 0 }
    };

    filteredTickets.forEach(t => {
      if (!t.created_at) return;
      
      const dateObj = new Date(t.created_at);
      const dateKey = format(dateObj, 'yyyy-MM-dd');
      const isTodayGroup = isToday(dateObj);
      const groupKey = isTodayGroup ? 'group-today' : `group-${dateKey}`;

      if (!expandedGroups.includes(groupKey)) return;

      const meta = skuMetadata[t.sku || ''] || { cat: '', time: 0 };
      const catMdr = meta.cat || '';
      const estTime = meta.time || 0;
      const upper = catMdr.toUpperCase();
      const qty = t.cantidad || 0;
      
      const st = prodStatusMap[t.codigo_barra];
      const isFin = st === 'PPC' || st === 'ENTREGADO';

      let catKey: keyof typeof groups = 'OTROS';

      if (upper.includes('CONFECCIONADA') || upper.includes('MS FABRICACION')) {
        catKey = 'MALLAS COSTURA';
      } else if (upper === 'MALLA SOMBRA BOLSA') {
        catKey = 'MALLAS BOLAS';
      } else if (upper === 'LIENZO' || upper === 'ROLLO' || upper.includes('LIENZO DE MALLA SOMBRA') || upper.includes('ROLLO LIGHT') || upper.includes('ROLLO DE MALLA SOMBRA')) {
        catKey = 'LIENZOS';
      }

      groups[catKey].total += qty;
      groups[catKey].totalTime += (estTime * qty);
      groups[catKey].count++;
      if (isFin) groups[catKey].finishedCount++;
    });

    return groups;
  }, [filteredTickets, skuMetadata, expandedGroups, prodStatusMap]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, { tickets: SewingTicket[], pieces: number, isToday: boolean, isYesterday: boolean }> = {};

    filteredTickets.forEach(t => {
      if (!t.created_at) return;
      const dateObj = new Date(t.created_at);
      const dateKey = format(dateObj, 'yyyy-MM-dd');
      
      if (!groups[dateKey]) {
        groups[dateKey] = {
          tickets: [],
          pieces: 0,
          isToday: isToday(dateObj),
          isYesterday: isYesterday(dateObj)
        };
      }
      groups[dateKey].tickets.push(t);
      groups[dateKey].pieces += (t.cantidad || 0);
    });

    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredTickets]);

  const exportToExcel = async () => {
    if (filteredTickets.length === 0) {
      toast({ title: "Sin registros", description: "No hay bultos visibles para exportar." });
      return;
    }

    setIsExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Historial Costura');

      const headers = [
        'Código de Barra', 'Alias', 'Producto', 'SKU', 'Cantidad',
        'Vaciado Por', 'H. Vaciado', 'Cuenta', 'No. Venta', 'Pack ID',
        'Status Producción', 'Impresa', 'Resp. Impresión', 'Fecha Impresión',
        'Asignada A', 'Cortada', 'Confección', 'Empaquetado', 'Recolector', 'Fecha Entrega'
      ];

      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006241' } };
      headerRow.eachCell(cell => { cell.font = { color: { argb: 'FFFFFFFF' }, bold: true }; });

      filteredTickets.forEach(t => {
        worksheet.addRow([
          t.codigo_barra, t.alias || '', t.nombre_producto || '---', t.sku || '---', t.cantidad || 0,
          t.responsable_vaciado || '---', t.hora_vaciado || '---', t.cuenta || '---', t.sales_num || '---', t.pack_id || '---',
          prodStatusMap[t.codigo_barra] || 'PENDIENTE',
          t.impresa ? 'SÍ' : 'NO', t.responsable_impresion || '---', t.fecha_impresion || '---', t.asignada_a || '---',
          t.cortada ? 'SÍ' : 'NO', t.confeccion ? 'SÍ' : 'NO', t.empaquetado ? 'SÍ' : 'NO',
          t.recolectada_por || 'PENDIENTE', t.fecha_entrega_paquete || '---'
        ]);
      });

      worksheet.columns.forEach(column => { column.width = 18; });
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `historial_costura_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

      toast({ variant: 'success', title: "Descarga Exitosa", description: "El historial se ha exportado a Excel." });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Error al generar Excel.' });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = () => {
    if (tickets.length === 0) return;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const today = new Date();
    const dateTitle = format(today, "d MMM yyyy", { locale: es });
    
    doc.setFontSize(14);
    doc.setTextColor(0, 98, 65);
    doc.text(`Bitácora de Costura (Historial) - ${dateTitle}`, 14, 15);

    const headers = [
      'Cód. Barra', 'Alias', 'Producto', 'SKU', 'Cant',
      'Vaciado Por', 'H. Vaciado', 'Cuenta', 'Venta',
      'Confecc', 'Impresa', 'Asignada', 'Empaque', 'Recol', 'Recolector', 'Entrega'
    ];

    const body = tickets.map(t => [
      t.codigo_barra,
      t.alias || '---',
      t.nombre_producto || '---',
      t.sku || '---',
      t.cantidad || 0,
      t.responsable_vaciado || '---',
      t.hora_vaciado || '---',
      t.cuenta || '---',
      t.sales_num || '---',
      t.confeccion === true ? 'SÍ' : 'NO',
      t.impresa === true ? 'SÍ' : 'NO',
      t.asignada_a || '---',
      t.empaquetado === true ? 'SÍ' : 'NO',
      t.lista_para_recoleccion === true ? 'SÍ' : 'NO',
      t.recolectada_por || 'PENDIENTE',
      t.fecha_entrega_paquete || '---'
    ]);

    autoTable(doc, {
      startY: 25,
      head: [headers],
      body: body,
      theme: 'striped',
      headStyles: { fillColor: [0, 98, 65], fontSize: 6 },
      bodyStyles: { fontSize: 5 },
    });

    doc.save(`historial_costura_${format(today, "yyyy-MM-dd")}.pdf`);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!isMounted) return null;

  return (
    <>
      <Head><title>Historial Impresos | Bitácora de Costura</title></Head>
      <main className="w-full max-w-[1600px] mx-auto p-2 md:p-8 space-y-6 animate-in fade-in duration-500 relative">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Link href="/sewing-tickets"><Button variant="ghost" size="icon" className="text-starbucks-green"><ArrowLeft className="h-6 w-6" /></Button></Link>
              <h1 className="text-xl md:text-3xl font-bold text-starbucks-green flex items-center gap-2">
                <SewingMachineIcon className="h-6 w-6 md:h-8 md:w-8" />
                <History className="h-5 w-5" /> 
                Historial de Impresos
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={exportToExcel} variant="outline" size="sm" className="flex-1 md:flex-none border-green-600 text-green-700 font-bold" disabled={tickets.length === 0 || isExporting}>
              {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
              Exportar Excel
            </Button>
            <Button onClick={exportToPDF} variant="outline" size="sm" className="flex-1 md:flex-none border-starbucks-green text-starbucks-green font-bold" disabled={tickets.length === 0}><FileDown className="h-4 w-4 mr-2" /> Exportar PDF</Button>
          </div>
        </header>

        {/* Traceability Metrics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-2">
            <TraceabilityCard 
              label="Terminados" 
              value={traceabilityMetrics.finished} 
              icon={CheckCircle2} 
              color="text-green-600" 
              bgColor="bg-green-50"
              sub="PPC / ENTREGADO"
            />
            <TraceabilityCard 
              label="Pendientes" 
              value={traceabilityMetrics.pending} 
              icon={Clock} 
              color="text-amber-600" 
              bgColor="bg-amber-50"
              sub="EN COSTURA"
            />
            <TraceabilityCard 
              label="Total Visible" 
              value={traceabilityMetrics.total} 
              icon={Package} 
              color="text-gray-600" 
              bgColor="bg-gray-100"
              sub="EN SECCIONES ABIERTAS"
            />
            <TraceabilityCard 
              label="Avance" 
              value={`${traceabilityMetrics.percent}%`} 
              icon={BarChart3} 
              color="text-blue-600" 
              bgColor="bg-blue-50"
              sub="COMPLETADO"
            />
        </div>

        {/* Category Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-2 pt-2 border-t border-dashed">
            <SummaryCard 
              label="Lienzos" 
              pieces={categoryMetrics.LIENZOS.total} 
              time={categoryMetrics.LIENZOS.totalTime} 
              image="/canva.png" 
              formatTime={formatTime} 
              isFinished={categoryMetrics.LIENZOS.count > 0 && categoryMetrics.LIENZOS.count === categoryMetrics.LIENZOS.finishedCount}
            />
            <SummaryCard 
              label="Mallas Bolas" 
              pieces={categoryMetrics['MALLAS BOLAS'].total} 
              time={categoryMetrics['MALLAS BOLAS'].totalTime} 
              image="/sphere.png" 
              formatTime={formatTime} 
              isFinished={categoryMetrics['MALLAS BOLAS'].count > 0 && categoryMetrics['MALLAS BOLAS'].count === categoryMetrics['MALLAS BOLAS'].finishedCount}
            />
            <SummaryCard 
              label="Mallas Costura" 
              pieces={categoryMetrics['MALLAS COSTURA'].total} 
              time={categoryMetrics['MALLAS COSTURA'].totalTime} 
              image="/sewing-machine.png" 
              formatTime={formatTime} 
              isFinished={categoryMetrics['MALLAS COSTURA'].count > 0 && categoryMetrics['MALLAS COSTURA'].count === categoryMetrics['MALLAS COSTURA'].finishedCount}
            />
            <SummaryCard 
              label="Otros" 
              pieces={categoryMetrics.OTROS.total} 
              time={categoryMetrics.OTROS.totalTime} 
              icon={<Tag className="h-6 w-6 text-gray-400" />} 
              formatTime={formatTime} 
              isFinished={categoryMetrics.OTROS.count > 0 && categoryMetrics.OTROS.count === categoryMetrics.OTROS.finishedCount}
            />
        </div>

        {/* Filters Section */}
        <section className="px-2 pt-2">
          <Card className="border-starbucks-green/10 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="flex flex-col md:flex-row md:items-center">
                 <div className="p-4 border-b md:border-b-0 md:border-r flex flex-col gap-3 flex-1">
                    <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        <Calendar className="h-4 w-4" /> Fecha de Entrega
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <FilterButton active={deliveryFilter === 'all'} onClick={() => setDeliveryFilter('all')} label="Todas" />
                        <FilterButton active={deliveryFilter === 'today'} onClick={() => setDeliveryFilter('today')} label="Hoy" />
                        <FilterButton active={deliveryFilter === 'tomorrow'} onClick={() => setDeliveryFilter('tomorrow')} label="Mañana" />
                        <FilterButton active={deliveryFilter === 'week'} onClick={() => setDeliveryFilter('week')} label="Semana" />
                    </div>
                 </div>
                 
                 <div className="p-4 flex flex-col gap-3 flex-1 bg-gray-50/50">
                    <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        <Activity className="h-4 w-4" /> Producción
                    </div>
                    <Tabs value={prodStatusFilter} onValueChange={(v) => setProdStatusFilter(v as any)} className="w-full">
                        <TabsList className="grid grid-cols-3 h-8 bg-white border border-gray-200">
                            <TabsTrigger value="all" className="text-[10px] font-bold">TODOS</TabsTrigger>
                            <TabsTrigger value="finished" className="text-[10px] font-bold text-green-700 data-[state=active]:bg-green-50">TERMINADOS</TabsTrigger>
                            <TabsTrigger value="pending" className="text-[10px] font-bold text-amber-700 data-[state=active]:bg-amber-50">PENDIENTES</TabsTrigger>
                        </TabsList>
                    </Tabs>
                 </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Grouped Content */}
        <div className="space-y-4 px-2">
          {loading && tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="h-10 w-10 text-starbucks-green animate-spin" />
              <p className="text-gray-400 font-bold">Cargando historial...</p>
            </div>
          ) : (
            <Accordion 
                type="multiple" 
                value={expandedGroups}
                onValueChange={setExpandedGroups}
                className="space-y-6"
            >
              {groupedByDate.map(([dateKey, data]) => {
                const isCurrentGroupToday = data.isToday;
                const dateLabel = isCurrentGroupToday 
                  ? 'IMPRESO HOY' 
                  : data.isYesterday 
                    ? 'IMPRESO AYER' 
                    : `IMPRESO EL ${format(new Date(dateKey + 'T12:00:00'), "d MMMM yyyy", { locale: es }).toUpperCase()}`;
                
                const groupKey = isCurrentGroupToday ? 'group-today' : `group-${dateKey}`;
                
                const subCategorized = {
                  COSTURA: { tickets: [] as SewingTicket[], total: 0, totalTime: 0, label: 'MALLAS COSTURA', img: '/sewing-machine.png', color: 'bg-yellow-500' },
                  BOLAS: { tickets: [] as SewingTicket[], total: 0, totalTime: 0, label: 'MALLAS BOLAS', img: '/sphere.png', color: 'bg-green-600' },
                  LIENZOS: { tickets: [] as SewingTicket[], total: 0, totalTime: 0, label: 'LIENZOS', img: '/canva.png', color: 'bg-blue-600' },
                  OTROS: { tickets: [] as SewingTicket[], total: 0, totalTime: 0, label: 'OTROS / DIVERSOS', icon: <Tag className="h-4 w-4" />, color: 'bg-gray-500' }
                };

                data.tickets.forEach(t => {
                  const meta = skuMetadata[t.sku || ''] || { cat: '', time: 0 };
                  const upper = (meta.cat || '').toUpperCase();
                  const estTime = meta.time || 0;
                  const qty = t.cantidad || 0;

                  if (upper.includes('CONFECCIONADA') || upper.includes('MS FABRICACION')) {
                    subCategorized.COSTURA.tickets.push(t);
                    subCategorized.COSTURA.total += qty;
                    subCategorized.COSTURA.totalTime += (estTime * qty);
                  } else if (upper === 'MALLA SOMBRA BOLSA') {
                    subCategorized.BOLAS.tickets.push(t);
                    subCategorized.BOLAS.total += qty;
                    subCategorized.BOLAS.totalTime += (estTime * qty);
                  } else if (upper === 'LIENZO' || upper === 'ROLLO' || upper.includes('LIENZO DE MALLA SOMBRA') || upper.includes('ROLLO LIGHT') || upper.includes('ROLLO DE MALLA SOMBRA')) {
                    subCategorized.LIENZOS.tickets.push(t);
                    subCategorized.LIENZOS.total += qty;
                    subCategorized.LIENZOS.totalTime += (estTime * qty);
                  } else {
                    subCategorized.OTROS.tickets.push(t);
                    subCategorized.OTROS.total += qty;
                    subCategorized.OTROS.totalTime += (estTime * qty);
                  }
                });
                
                return (
                  <AccordionItem 
                    key={dateKey} 
                    value={groupKey}
                    className="border-none"
                  >
                    <AccordionTrigger className={cn(
                      "flex items-center justify-between p-4 rounded-xl shadow-sm hover:no-underline transition-all group",
                      isCurrentGroupToday 
                        ? "bg-starbucks-green text-white" 
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    )}>
                      <div className="flex items-center gap-4 text-left">
                        <Calendar className={cn("h-5 w-5", isCurrentGroupToday ? "text-white" : "text-gray-400")} />
                        <div>
                          <p className="text-sm font-black tracking-tighter leading-none">{dateLabel}</p>
                          <p className={cn("text-[10px] font-bold uppercase", isCurrentGroupToday ? "text-white/70" : "text-gray-400")}>
                            {data.tickets.length} Registros · {data.pieces} Piezas
                          </p>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4 pb-0 space-y-8">
                      {Object.values(subCategorized).map((cat) => (
                        cat.tickets.length > 0 && (
                          <div key={cat.label} className={cn("transition-all", !isCurrentGroupToday && "opacity-90")}>
                            <div className={cn(
                              "text-white px-4 py-1.5 rounded-t-lg font-black flex justify-between items-center text-xs tracking-wider",
                              cat.color,
                              !isCurrentGroupToday && "grayscale-[0.5] contrast-[0.8]"
                            )}>
                               <div className="flex items-center gap-2">
                                 {cat.img ? <Image src={cat.img} width={18} height={18} alt={cat.label} className="brightness-0 invert" /> : cat.icon}
                                 {cat.label}
                               </div>
                               <div className="flex items-center gap-4 opacity-80">
                                 <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatTime(cat.totalTime)}</span>
                                 <span className="bg-white/20 px-2 py-0.5 rounded-full">({cat.total} piezas)</span>
                               </div>
                            </div>
                            <div>
                              <SewingTicketsTable 
                                tickets={cat.tickets} 
                                onUpdateTicket={updateTicket} 
                                onDeleteTicket={deleteTicket} 
                                skuMetadata={skuMetadata} 
                                isMuted={!isCurrentGroupToday}
                                prodStatusMap={prodStatusMap}
                              />
                            </div>
                          </div>
                        )
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}

              {groupedByDate.length === 0 && !loading && (
                <div className="text-center py-20 bg-gray-50 rounded-xl border-2 border-dashed">
                  <ClipboardCheck className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-xl font-bold text-gray-400 uppercase tracking-tighter">No hay bultos que coincidan con el filtro.</p>
                </div>
              )}
            </Accordion>
          )}
        </div>

        {showScrollTop && (
          <Button
            onClick={scrollToTop}
            className="fixed bottom-24 right-4 md:bottom-8 md:right-8 z-50 rounded-full h-12 w-12 shadow-xl bg-starbucks-green hover:bg-starbucks-dark animate-in fade-in zoom-in duration-300"
            size="icon"
          >
            <ArrowUp className="h-6 w-6" />
          </Button>
        )}
      </main>
    </>
  );
}

function TraceabilityCard({ label, value, icon: Icon, color, bgColor, sub }: any) {
  return (
    <Card className={cn("border-none shadow-sm overflow-hidden", bgColor)}>
      <CardContent className="p-4 flex items-center justify-between">
        <div className="space-y-1">
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
           <p className={cn("text-2xl font-black tabular-nums leading-none tracking-tighter", color)}>{value}</p>
           <p className="text-[8px] font-bold text-gray-400 uppercase">{sub}</p>
        </div>
        <div className={cn("p-2 rounded-lg bg-white/50", color)}>
          <Icon className="h-6 w-6" />
        </div>
      </CardContent>
    </Card>
  );
}

function FilterButton({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <Button 
      variant={active ? 'default' : 'outline'} 
      size="sm" 
      onClick={onClick}
      className={cn(
        "h-8 rounded-full font-bold text-xs px-4 transition-all",
        active ? "bg-starbucks-green shadow-md scale-105" : "border-gray-200 text-gray-500 hover:bg-gray-50"
      )}
    >
      {active && <Check className="h-3 w-3 mr-1.5" />}
      {label}
    </Button>
  );
}

function SummaryCard({ label, pieces, time, image, icon, formatTime, isFinished }: { label: string, pieces: number, time: number, image?: string, icon?: React.ReactNode, formatTime: (n: number) => string, isFinished?: boolean }) {
    return (
        <div className={cn(
            "border-2 rounded-2xl p-4 shadow-sm flex flex-col justify-between transition-all hover:shadow-md",
            isFinished ? "bg-[#E6F7EC] border-[#34A853]" : "bg-white border-gray-100"
        )}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <div className={cn("p-1.5 rounded-lg flex items-center justify-center", isFinished ? "bg-green-100" : "bg-starbucks-cream")}>
                        {image ? <Image src={image} width={24} height={24} alt={label} className={cn("object-contain", isFinished && "brightness-75")} /> : icon}
                    </div>
                    <span className={cn("text-[10px] font-black uppercase tracking-widest", isFinished ? "text-green-800" : "text-gray-400")}>
                        {label}
                        {isFinished && <CheckCircle2 className="h-2.5 w-2.5 ml-1 inline text-green-600" />}
                    </span>
                </div>
            </div>
            <div className="flex justify-between items-end">
                <div className="flex flex-col">
                    <span className={cn("text-2xl font-black tabular-nums leading-none tracking-tighter", isFinished ? "text-green-700" : "text-starbucks-green")}>{pieces}</span>
                    <span className={cn("text-[8px] font-bold uppercase mt-0.5", isFinished ? "text-green-600" : "text-gray-400")}>Pzs</span>
                </div>
                <div className="flex flex-col text-right">
                    <span className={cn("text-xs font-black tabular-nums leading-none flex items-center justify-end gap-1", isFinished ? "text-green-600" : "text-amber-600")}>
                        <Clock className="h-3 w-3" /> {formatTime(time)}
                    </span>
                    <span className={cn("text-[8px] font-bold uppercase mt-0.5", isFinished ? "text-green-600" : "text-gray-400")}>Est.</span>
                </div>
            </div>
        </div>
    );
}
