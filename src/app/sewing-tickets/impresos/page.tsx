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
  Tag
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabaseEtiquetas } from '@/lib/supabaseClient';
import { SewingTicket } from '@/types/sewing';

// Custom Sewing Machine Icon SVG
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
  const [skuMapping, setSkuMapping] = useState<Record<string, string>>({});

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
            .select('sku_mdr, cat_mdr')
            .in('sku_mdr', mdrs);
            
          if (mData) {
            const mdrToCat: Record<string, string> = {};
            mData.forEach(m => mdrToCat[m.sku_mdr] = m.cat_mdr);
            
            const mapping: Record<string, string> = {};
            skus.forEach(sku => {
              const mdr = skuToMdr[sku];
              if (mdr && mdrToCat[mdr]) {
                mapping[sku] = mdrToCat[mdr];
              }
            });
            setSkuMapping(prev => ({ ...prev, ...mapping }));
          }
        }
      } catch (error) {
        console.error('Error fetching categories in history:', error);
      }
    };

    fetchCategories();
  }, [tickets]);

  const groupedTickets = useMemo(() => {
    const groups = {
      LIENZOS: { tickets: [] as SewingTicket[], total: 0 },
      'MALLAS BOLAS': { tickets: [] as SewingTicket[], total: 0 },
      'MALLAS COSTURA': { tickets: [] as SewingTicket[], total: 0 },
      OTROS: { tickets: [] as SewingTicket[], total: 0 }
    };

    tickets.forEach(t => {
      const catMdr = skuMapping[t.sku || ''] || '';
      const upper = catMdr.toUpperCase();
      const qty = t.cantidad || 0;

      if (upper === 'LIENZO' || upper === 'ROLLO' || upper.includes('LIENZO DE MALLA SOMBRA') || upper.includes('ROLLO DE MALLA SOMBRA') || upper.includes('ROLLO LIGHT')) {
        groups.LIENZOS.tickets.push(t);
        groups.LIENZOS.total += qty;
      } else if (upper === 'MALLA SOMBRA BOLSA') {
        groups['MALLAS BOLAS'].tickets.push(t);
        groups['MALLAS BOLAS'].total += qty;
      } else if (upper.includes('MALLA SOMBRA CONFECCIONADA') || upper.includes('MS FABRICACION')) {
        groups['MALLAS COSTURA'].tickets.push(t);
        groups['MALLAS COSTURA'].total += qty;
      } else {
        groups.OTROS.tickets.push(t);
        groups.OTROS.total += qty;
      }
    });

    return groups;
  }, [tickets, skuMapping]);

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

        <div className="flex flex-wrap gap-3 px-2">
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm flex flex-col min-w-[140px]">
            <div className="flex items-center gap-2 mb-1"><Layers className="h-3 w-3 text-blue-600" /><span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Lienzos (Pzs)</span></div>
            <span className="text-3xl font-black text-blue-800">{groupedTickets.LIENZOS.total}</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm flex flex-col min-w-[140px]">
            <div className="flex items-center gap-2 mb-1"><Boxes className="h-3 w-3 text-blue-600" /><span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mallas Bolas (Pzs)</span></div>
            <span className="text-3xl font-black text-blue-800">{groupedTickets['MALLAS BOLAS'].total}</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm flex flex-col min-w-[140px]">
            <div className="flex items-center gap-2 mb-1"><Package className="h-3 w-3 text-blue-600" /><span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mallas Costura (Pzs)</span></div>
            <span className="text-3xl font-black text-blue-800">{groupedTickets['MALLAS COSTURA'].total}</span>
          </div>
        </div>

        <div className="space-y-8 mt-4 px-2">
          {groupedTickets.LIENZOS.tickets.length > 0 && (
            <section>
              <div className="bg-blue-800 text-white px-4 py-2 rounded-t-lg font-black flex justify-between items-center">
                 <div className="flex items-center gap-2"><Layers className="h-5 w-5" /> LIENZOS</div>
                 <span className="bg-white/20 px-3 py-0.5 rounded-full text-sm">({groupedTickets.LIENZOS.total} piezas)</span>
              </div>
              <SewingTicketsTable tickets={groupedTickets.LIENZOS.tickets} onUpdateTicket={updateTicket} onDeleteTicket={deleteTicket} />
            </section>
          )}

          {groupedTickets['MALLAS BOLAS'].tickets.length > 0 && (
            <section>
              <div className="bg-blue-600 text-white px-4 py-2 rounded-t-lg font-black flex justify-between items-center">
                 <div className="flex items-center gap-2"><Boxes className="h-5 w-5" /> MALLAS BOLAS</div>
                 <span className="bg-white/20 px-3 py-0.5 rounded-full text-sm">({groupedTickets['MALLAS BOLAS'].total} piezas)</span>
              </div>
              <SewingTicketsTable tickets={groupedTickets['MALLAS BOLAS'].tickets} onUpdateTicket={updateTicket} onDeleteTicket={deleteTicket} />
            </section>
          )}

          {groupedTickets['MALLAS COSTURA'].tickets.length > 0 && (
            <section>
              <div className="bg-blue-400 text-white px-4 py-2 rounded-t-lg font-black flex justify-between items-center">
                 <div className="flex items-center gap-2"><Package className="h-5 w-5" /> MALLAS COSTURA</div>
                 <span className="bg-white/20 px-3 py-0.5 rounded-full text-sm">({groupedTickets['MALLAS COSTURA'].total} piezas)</span>
              </div>
              <SewingTicketsTable tickets={groupedTickets['MALLAS COSTURA'].tickets} onUpdateTicket={updateTicket} onDeleteTicket={deleteTicket} />
            </section>
          )}

          {groupedTickets.OTROS.tickets.length > 0 && (
            <section>
              <div className="bg-gray-400 text-white px-4 py-2 rounded-t-lg font-black flex justify-between items-center">
                 <div className="flex items-center gap-2"><Tag className="h-5 w-5" /> OTROS / DIVERSOS</div>
                 <span className="bg-white/20 px-3 py-0.5 rounded-full text-sm">({groupedTickets.OTROS.total} piezas)</span>
              </div>
              <SewingTicketsTable tickets={groupedTickets.OTROS.tickets} onUpdateTicket={updateTicket} onDeleteTicket={deleteTicket} />
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
