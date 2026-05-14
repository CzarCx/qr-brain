
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
  Clock,
  ArrowUp,
  Tag,
  Calendar,
  Filter,
  Check,
  Loader2
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, isToday, isYesterday, isTomorrow, isThisWeek, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabaseEtiquetas } from '@/lib/supabaseClient';
import { SewingTicket } from '@/types/sewing';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';

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

export default function SewingTicketsHistoryPage() {
  const { tickets, loading, fetchTickets, updateTicket, deleteTicket } = useSewingTickets();
  const [isMounted, setIsMounted] = useState(false);
  const [skuMetadata, setSkuMetadata] = useState<Record<string, { cat: string, time: number }>>({});
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('all');

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

  // Filter tickets by delivery date
  const filteredTickets = useMemo(() => {
    if (deliveryFilter === 'all') return tickets;
    
    const now = startOfDay(new Date());
    
    return tickets.filter(t => {
      if (!t.fecha_entrega_paquete) return false;
      const dDate = startOfDay(new Date(t.fecha_entrega_paquete));
      
      switch (deliveryFilter) {
        case 'today': return isToday(dDate);
        case 'tomorrow': return isTomorrow(dDate);
        case 'week': return isThisWeek(dDate, { weekStartsOn: 1 });
        default: return true;
      }
    });
  }, [tickets, deliveryFilter]);

  // Group tickets by creation date
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

    // Sort dates descending
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredTickets]);

  // Metrics for categories (updates dynamic based on applied filter)
  const categoryMetrics = useMemo(() => {
    const groups = {
      LIENZOS: { total: 0, totalTime: 0 },
      'MALLAS BOLAS': { total: 0, totalTime: 0 },
      'MALLAS COSTURA': { total: 0, totalTime: 0 },
      OTROS: { total: 0, totalTime: 0 }
    };

    filteredTickets.forEach(t => {
      const meta = skuMetadata[t.sku || ''] || { cat: '', time: 0 };
      const catMdr = meta.cat || '';
      const estTime = meta.time || 0;
      const upper = catMdr.toUpperCase();
      const qty = t.cantidad || 0;

      if (upper === 'LIENZO' || upper === 'ROLLO' || upper.includes('LIENZO DE MALLA SOMBRA') || upper.includes('ROLLO LIGHT') || upper.includes('ROLLO DE MALLA SOMBRA')) {
        groups.LIENZOS.total += qty;
        groups.LIENZOS.totalTime += estTime;
      } else if (upper === 'MALLA SOMBRA BOLSA') {
        groups['MALLAS BOLAS'].total += qty;
        groups['MALLAS BOLAS'].totalTime += estTime;
      } else if (upper.includes('MALLA SOMBRA CONFECCIONADA') || upper.includes('MS FABRICACION')) {
        groups['MALLAS COSTURA'].total += qty;
        groups['MALLAS COSTURA'].totalTime += estTime;
      } else {
        groups.OTROS.total += qty;
        groups.OTROS.totalTime += estTime;
      }
    });

    return groups;
  }, [filteredTickets, skuMetadata]);

  const exportToPDF = () => {
    if (tickets.length === 0) return;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const today = new Date();
    const dateTitle = format(today, "d MMM yyyy", { locale: es });
    const totalUnits = tickets.reduce((acc, t) => acc + (t.cantidad || 0), 0);

    doc.setFontSize(14);
    doc.setTextColor(0, 98, 65);
    doc.text(`Bitácora de Costura (Historial) - ${dateTitle}`, 14, 15);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Registros: ${tickets.length} | Unidades: ${totalUnits}`, 14, 20);

    const headers = [
      'Cód. Barra', 'Alias', 'Producto', 'SKU', 'Cant',
      'Vaciado Por', 'H. Vaciado', 'Cuenta', 'Venta', 'Pack ID',
      'Confecc', 'Perfor', 'Ojill',
      'Impresa', 'Resp Imp', 'F Imp', 'Asignada',
      'Empaque', 'Recol', 'Recolector', 'Fecha Entrega'
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
      t.pack_id || '---',
      t.confeccion === true ? 'SÍ' : t.confeccion === false ? 'NO' : 'N/A',
      t.perforado === true ? 'SÍ' : t.perforado === false ? 'NO' : 'N/A',
      t.ojillado === true ? 'SÍ' : t.ojillado === false ? 'NO' : 'N/A',
      t.impresa === true ? 'SÍ' : 'NO',
      t.responsable_impresion || '---',
      t.fecha_impresion || '---',
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
      headStyles: { fillColor: [0, 98, 65], fontSize: 5, halign: 'center' },
      bodyStyles: { fontSize: 4.8, valign: 'middle' },
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
      <main className="w-full max-w-[1600px] mx-auto p-2 md:p-8 space-y-4 md:space-y-6 animate-in fade-in duration-500 relative">
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
          <div className="flex items-center gap-2">
            <Button onClick={exportToPDF} variant="outline" size="sm" className="border-starbucks-green text-starbucks-green font-bold" disabled={tickets.length === 0}><FileDown className="h-4 w-4 mr-2" /> Exportar PDF</Button>
          </div>
        </header>

        {/* Global Summary Cards (Reactive to filters) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-2">
            <SummaryCard label="Lienzos" pieces={categoryMetrics.LIENZOS.total} time={categoryMetrics.LIENZOS.totalTime} image="/canva.png" formatTime={formatTime} />
            <SummaryCard label="Mallas Bolas" pieces={categoryMetrics['MALLAS BOLAS'].total} time={categoryMetrics['MALLAS BOLAS'].totalTime} image="/sphere.png" formatTime={formatTime} />
            <SummaryCard label="Mallas Costura" pieces={categoryMetrics['MALLAS COSTURA'].total} time={categoryMetrics['MALLAS COSTURA'].totalTime} image="/sewing-machine.png" formatTime={formatTime} />
            <SummaryCard label="Otros" pieces={categoryMetrics.OTROS.total} time={categoryMetrics.OTROS.totalTime} icon={<Tag className="h-6 w-6 text-gray-400" />} formatTime={formatTime} />
        </div>

        {/* Delivery Date Filters */}
        <section className="px-2 pt-2">
          <Card className="border-starbucks-green/10 shadow-sm">
            <CardContent className="p-3 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-widest mr-2">
                <Filter className="h-4 w-4" /> Filtro Entrega
              </div>
              <div className="flex flex-wrap gap-2">
                <FilterButton active={deliveryFilter === 'all'} onClick={() => setDeliveryFilter('all')} label="Todas" />
                <FilterButton active={deliveryFilter === 'today'} onClick={() => setDeliveryFilter('today')} label="Hoy" />
                <FilterButton active={deliveryFilter === 'tomorrow'} onClick={() => setDeliveryFilter('tomorrow')} label="Mañana" />
                <FilterButton active={deliveryFilter === 'week'} onClick={() => setDeliveryFilter('week')} label="Esta Semana" />
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
            <Accordion type="multiple" defaultValue={['group-today']} className="space-y-6">
              {groupedByDate.map(([dateKey, data]) => {
                const isCurrentGroupToday = data.isToday;
                const dateLabel = isCurrentGroupToday 
                  ? 'IMPRESO HOY' 
                  : data.isYesterday 
                    ? 'IMPRESO AYER' 
                    : `IMPRESO EL ${format(new Date(dateKey + 'T12:00:00'), "d MMMM yyyy", { locale: es }).toUpperCase()}`;
                
                // Categorize tickets within this date group
                const subCategorized = {
                  LIENZOS: { tickets: [] as SewingTicket[], total: 0, totalTime: 0, label: 'LIENZOS', img: '/canva.png', color: 'bg-blue-600' },
                  BOLAS: { tickets: [] as SewingTicket[], total: 0, totalTime: 0, label: 'MALLAS BOLAS', img: '/sphere.png', color: 'bg-green-600' },
                  COSTURA: { tickets: [] as SewingTicket[], total: 0, totalTime: 0, label: 'MALLAS COSTURA', img: '/sewing-machine.png', color: 'bg-yellow-500' },
                  OTROS: { tickets: [] as SewingTicket[], total: 0, totalTime: 0, label: 'OTROS / DIVERSOS', icon: <Tag className="h-4 w-4" />, color: 'bg-gray-500' }
                };

                data.tickets.forEach(t => {
                  const meta = skuMetadata[t.sku || ''] || { cat: '', time: 0 };
                  const upper = (meta.cat || '').toUpperCase();
                  const estTime = meta.time || 0;
                  const qty = t.cantidad || 0;

                  if (upper === 'LIENZO' || upper === 'ROLLO' || upper.includes('LIENZO DE MALLA SOMBRA') || upper.includes('ROLLO LIGHT') || upper.includes('ROLLO DE MALLA SOMBRA')) {
                    subCategorized.LIENZOS.tickets.push(t);
                    subCategorized.LIENZOS.total += qty;
                    subCategorized.LIENZOS.totalTime += estTime;
                  } else if (upper === 'MALLA SOMBRA BOLSA') {
                    subCategorized.BOLAS.tickets.push(t);
                    subCategorized.BOLAS.total += qty;
                    subCategorized.BOLAS.totalTime += estTime;
                  } else if (upper.includes('MALLA SOMBRA CONFECCIONADA') || upper.includes('MS FABRICACION')) {
                    subCategorized.COSTURA.tickets.push(t);
                    subCategorized.COSTURA.total += qty;
                    subCategorized.COSTURA.totalTime += estTime;
                  } else {
                    subCategorized.OTROS.tickets.push(t);
                    subCategorized.OTROS.total += qty;
                    subCategorized.OTROS.totalTime += estTime;
                  }
                });
                
                return (
                  <AccordionItem 
                    key={dateKey} 
                    value={isCurrentGroupToday ? 'group-today' : `group-${dateKey}`}
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
                          <div key={cat.label} className={cn("transition-all", !isCurrentGroupToday && "opacity-80")}>
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
                            <div className={cn(!isCurrentGroupToday && "bg-gray-50/50 rounded-b-xl p-2 border-x border-b")}>
                              <SewingTicketsTable 
                                tickets={cat.tickets} 
                                onUpdateTicket={updateTicket} 
                                onDeleteTicket={deleteTicket} 
                                skuMetadata={skuMetadata} 
                                isMuted={!isCurrentGroupToday}
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

        {/* Floating Back to Top Button */}
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

function SummaryCard({ label, pieces, time, image, icon, formatTime }: { label: string, pieces: number, time: number, image?: string, icon?: React.ReactNode, formatTime: (n: number) => string }) {
    return (
        <div className="bg-white border-2 border-gray-100 rounded-2xl p-4 shadow-sm flex flex-col justify-between transition-all hover:shadow-md">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-starbucks-cream rounded-lg flex items-center justify-center">
                        {image ? <Image src={image} width={24} height={24} alt={label} className="object-contain" /> : icon}
                    </div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</span>
                </div>
            </div>
            <div className="flex justify-between items-end">
                <div className="flex flex-col">
                    <span className="text-2xl font-black text-starbucks-green tabular-nums leading-none tracking-tighter">{pieces}</span>
                    <span className="text-[8px] font-bold text-gray-400 uppercase mt-0.5">Pzs</span>
                </div>
                <div className="flex flex-col text-right">
                    <span className="text-xs font-black text-amber-600 tabular-nums leading-none flex items-center justify-end gap-1">
                        <Clock className="h-3 w-3" /> {formatTime(time)}
                    </span>
                    <span className="text-[8px] font-bold text-gray-400 uppercase mt-0.5">Est.</span>
                </div>
            </div>
        </div>
    );
}
