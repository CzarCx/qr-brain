'use client';

import { useEffect, useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useSewingTickets } from '@/hooks/use-sewing-tickets';
import { SewingTicketsTable } from '@/components/SewingTicketsTable';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  History, 
  ArrowLeft,
  ClipboardCheck,
  FileDown,
  Layers,
  Boxes,
  Package,
  Tag,
  Clock
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabaseEtiquetas } from '@/lib/supabaseClient';
import { SewingTicket } from '@/types/sewing';
import { Badge } from '@/components/ui/badge';

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

export default function SewingTicketsHistoryPage() {
  const { tickets, loading, fetchTickets, updateTicket, deleteTicket } = useSewingTickets();
  const [isMounted, setIsMounted] = useState(false);
  const [skuMetadata, setSkuMetadata] = useState<Record<string, { cat: string, time: number }>>({});

  useEffect(() => {
    setIsMounted(true);
    fetchTickets(true);
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

  const groupedTickets = useMemo(() => {
    const groups = {
      LIENZOS: { tickets: [] as SewingTicket[], total: 0, totalTime: 0 },
      'MALLAS BOLAS': { tickets: [] as SewingTicket[], total: 0, totalTime: 0 },
      'MALLAS COSTURA': { tickets: [] as SewingTicket[], total: 0, totalTime: 0 },
      OTROS: { tickets: [] as SewingTicket[], total: 0, totalTime: 0 }
    };

    tickets.forEach(t => {
      const meta = skuMetadata[t.sku || ''] || { cat: '', time: 0 };
      const catMdr = meta.cat || '';
      const estTime = meta.time || 0;
      const upper = catMdr.toUpperCase();
      const qty = t.cantidad || 0;

      let targetGroup = groups.OTROS;

      if (upper === 'LIENZO' || upper === 'ROLLO' || upper.includes('LIENZO DE MALLA SOMBRA') || upper.includes('ROLLO LIGHT') || upper.includes('ROLLO DE MALLA SOMBRA')) {
        targetGroup = groups.LIENZOS;
      } else if (upper === 'MALLA SOMBRA BOLSA') {
        targetGroup = groups['MALLAS BOLAS'];
      } else if (upper.includes('MALLA SOMBRA CONFECCIONADA') || upper.includes('MS FABRICACION')) {
        targetGroup = groups['MALLAS COSTURA'];
      }

      targetGroup.tickets.push(t);
      targetGroup.total += qty;
      targetGroup.totalTime += estTime;
    });

    return groups;
  }, [tickets, skuMetadata]);

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
      'Cód. Barra', 'Producto', 'SKU', 'Cant',
      'Vaciado Por', 'H. Vaciado', 'Cuenta', 'Venta', 'Pack ID',
      'Confecc', 'Perfor', 'Ojill',
      'Impresa', 'Resp Imp', 'F Imp', 'Asignada',
      'Empaque', 'Recol', 'Recolector', 'Fecha Entrega'
    ];

    const formatDate = (dateStr: string | null) => {
      if (!dateStr) return '---';
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return format(d, "d MMM yyyy", { locale: es });
      } catch (e) { return dateStr; }
    };

    const formatBool = (val: boolean | null) => {
      if (val === true) return 'SÍ';
      if (val === false) return 'NO';
      return 'N/A';
    };

    const body = tickets.map(t => [
      t.codigo_barra,
      t.nombre_producto || '---',
      t.sku || '---',
      t.cantidad || 0,
      t.responsable_vaciado || '---',
      t.hora_vaciado || '---',
      t.cuenta || '---',
      t.sales_num || '---',
      t.pack_id || '---',
      formatBool(t.confeccion),
      formatBool(t.perforado),
      formatBool(t.ojillado),
      formatBool(t.impresa),
      t.responsable_impresion || '---',
      formatDate(t.fecha_impresion),
      t.asignada_a || '---',
      formatBool(t.empaquetado),
      formatBool(t.lista_para_recoleccion),
      t.recolectada_por || 'PENDIENTE',
      formatDate(t.fecha_entrega_paquete)
    ]);

    autoTable(doc, {
      startY: 25,
      head: [headers],
      body: body,
      theme: 'striped',
      headStyles: { fillColor: [0, 98, 65], fontSize: 5, halign: 'center' },
      bodyStyles: { fontSize: 4.8, valign: 'middle' },
      columnStyles: {
        1: { cellWidth: 35 },
        2: { fontStyle: 'bold' },
        3: { fontStyle: 'bold', halign: 'center' },
        18: { fontStyle: 'bold' },
        19: { fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const val = data.cell.text[0];
          if (val === 'SÍ') data.cell.styles.textColor = [0, 150, 0];
          if (val === 'NO') data.cell.styles.textColor = [200, 0, 0];
          if (val === 'PENDIENTE') data.cell.styles.textColor = [150, 100, 0];
        }
      }
    });

    doc.save(`historial_costura_${format(today, "yyyy-MM-dd")}.pdf`);
  };

  if (!isMounted) return null;

  return (
    <>
      <Head><title>Historial Impresos | Bitácora de Costura</title></Head>
      <main className="w-full max-w-[1600px] mx-auto p-2 md:p-8 space-y-4 md:space-y-6 animate-in fade-in duration-500">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 px-2">
            <SummaryCard 
                label="Lienzos" 
                pieces={groupedTickets.LIENZOS.total} 
                time={groupedTickets.LIENZOS.totalTime} 
                icon={<Layers className="h-5 w-5" />}
                formatTime={formatTime}
                targetId="section-lienzos"
            />
            <SummaryCard 
                label="Mallas Bolas" 
                pieces={groupedTickets['MALLAS BOLAS'].total} 
                time={groupedTickets['MALLAS BOLAS'].totalTime} 
                icon={<Boxes className="h-5 w-5" />}
                formatTime={formatTime}
                targetId="section-mallas-bolas"
            />
            <SummaryCard 
                label="Mallas Costura" 
                pieces={groupedTickets['MALLAS COSTURA'].total} 
                time={groupedTickets['MALLAS COSTURA'].totalTime} 
                icon={<Package className="h-5 w-5" />}
                formatTime={formatTime}
                targetId="section-mallas-costura"
            />
        </div>

        <div className="space-y-8 mt-4 px-2">
          {groupedTickets.LIENZOS.tickets.length > 0 && (
            <section id="section-lienzos" className="scroll-mt-24">
              <div className="bg-blue-800 text-white px-4 py-2 rounded-t-lg font-black flex justify-between items-center">
                 <div className="flex items-center gap-2"><Layers className="h-5 w-5" /> LIENZOS</div>
                 <div className="flex items-center gap-4">
                    <span className="text-sm flex items-center gap-1 font-bold text-blue-100"><Clock className="h-4 w-4" /> {formatTime(groupedTickets.LIENZOS.totalTime)}</span>
                    <span className="bg-white/20 px-3 py-0.5 rounded-full text-sm">({groupedTickets.LIENZOS.total} piezas)</span>
                 </div>
              </div>
              <SewingTicketsTable tickets={groupedTickets.LIENZOS.tickets} onUpdateTicket={updateTicket} onDeleteTicket={deleteTicket} skuMetadata={skuMetadata} />
            </section>
          )}

          {groupedTickets['MALLAS BOLAS'].tickets.length > 0 && (
            <section id="section-mallas-bolas" className="scroll-mt-24">
              <div className="bg-blue-600 text-white px-4 py-2 rounded-t-lg font-black flex justify-between items-center">
                 <div className="flex items-center gap-2"><Boxes className="h-5 w-5" /> MALLAS BOLAS</div>
                 <div className="flex items-center gap-4">
                    <span className="text-sm flex items-center gap-1 font-bold text-blue-100"><Clock className="h-4 w-4" /> {formatTime(groupedTickets['MALLAS BOLAS'].totalTime)}</span>
                    <span className="bg-white/20 px-3 py-0.5 rounded-full text-sm">({groupedTickets['MALLAS BOLAS'].total} piezas)</span>
                 </div>
              </div>
              <SewingTicketsTable tickets={groupedTickets['MALLAS BOLAS'].tickets} onUpdateTicket={updateTicket} onDeleteTicket={deleteTicket} skuMetadata={skuMetadata} />
            </section>
          )}

          {groupedTickets['MALLAS COSTURA'].tickets.length > 0 && (
            <section id="section-mallas-costura" className="scroll-mt-24">
              <div className="bg-blue-400 text-white px-4 py-2 rounded-t-lg font-black flex justify-between items-center">
                 <div className="flex items-center gap-2"><Package className="h-5 w-5" /> MALLAS COSTURA</div>
                 <div className="flex items-center gap-4">
                    <span className="text-sm flex items-center gap-1 font-bold text-blue-100"><Clock className="h-4 w-4" /> {formatTime(groupedTickets['MALLAS COSTURA'].totalTime)}</span>
                    <span className="bg-white/20 px-3 py-0.5 rounded-full text-sm">({groupedTickets['MALLAS COSTURA'].total} piezas)</span>
                 </div>
              </div>
              <SewingTicketsTable tickets={groupedTickets['MALLAS COSTURA'].tickets} onUpdateTicket={updateTicket} onDeleteTicket={deleteTicket} skuMetadata={skuMetadata} />
            </section>
          )}

          {groupedTickets.OTROS.tickets.length > 0 && (
            <section id="section-otros" className="scroll-mt-24">
              <div className="bg-gray-400 text-white px-4 py-2 rounded-t-lg font-black flex justify-between items-center">
                 <div className="flex items-center gap-2"><Tag className="h-5 w-5" /> OTROS / DIVERSOS</div>
                 <div className="flex items-center gap-4">
                    <span className="text-sm flex items-center gap-1 font-bold text-gray-100"><Clock className="h-4 w-4" /> {formatTime(groupedTickets.OTROS.totalTime)}</span>
                    <span className="bg-white/20 px-3 py-0.5 rounded-full text-sm">({groupedTickets.OTROS.total} piezas)</span>
                 </div>
              </div>
              <SewingTicketsTable tickets={groupedTickets.OTROS.tickets} onUpdateTicket={updateTicket} onDeleteTicket={deleteTicket} skuMetadata={skuMetadata} />
            </section>
          )}

          {tickets.length === 0 && !loading && (
            <div className="text-center py-20 bg-gray-50 rounded-xl border-2 border-dashed">
               <ClipboardCheck className="h-12 w-12 mx-auto mb-4 text-gray-300" />
               <p className="text-xl font-bold text-gray-400">No hay bultos impresos en el historial.</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function SummaryCard({ label, pieces, time, icon, formatTime, targetId }: { label: string, pieces: number, time: number, icon: React.ReactNode, formatTime: (n: number) => string, targetId?: string }) {
    const handleClick = () => {
        if (targetId) {
            const element = document.getElementById(targetId);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    };

    return (
        <div 
            onClick={handleClick}
            className="bg-white border-2 border-gray-100 rounded-2xl p-6 shadow-md flex flex-col justify-between transition-all hover:shadow-lg hover:border-starbucks-green/20 cursor-pointer active:scale-95"
        >
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-starbucks-cream rounded-lg text-starbucks-green">
                        {icon}
                    </div>
                    <span className="text-xs font-black text-gray-500 uppercase tracking-widest">{label}</span>
                </div>
                <Badge variant="secondary" className="bg-gray-100 text-gray-600 font-bold uppercase text-[9px]">Historial</Badge>
            </div>
            <div className="grid grid-cols-2 gap-4 items-end">
                <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-gray-400 uppercase mb-1">Piezas Totales</span>
                    <span className="text-4xl font-black text-starbucks-green tabular-nums leading-none tracking-tighter">{pieces}</span>
                </div>
                <div className="flex flex-col border-l-2 pl-4 border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase mb-1">Tiempo Est.</span>
                    <span className="text-2xl font-black text-amber-600 tabular-nums leading-none flex items-center gap-1.5">
                        <Clock className="h-5 w-5 stroke-[3px]" />
                        {formatTime(time)}
                    </span>
                </div>
            </div>
        </div>
    );
}
