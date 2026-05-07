'use client';

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useSewingTickets } from '@/hooks/use-sewing-tickets';
import { SewingTicketsTable } from '@/components/SewingTicketsTable';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Scissors, 
  History, 
  ArrowLeft,
  Loader2,
  ClipboardCheck,
  FileDown,
  Layers,
  Boxes,
  Package
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabaseEtiquetas } from '@/lib/supabaseClient';

export default function SewingTicketsHistoryPage() {
  const { tickets, loading, fetchTickets, updateTicket, deleteTicket } = useSewingTickets();
  const [isMounted, setIsMounted] = useState(false);
  
  // Estados para contadores dinámicos
  const [counters, setCounters] = useState({ ROLLOS: 0, BOLAS: 0, COSTURA: 0 });

  useEffect(() => {
    setIsMounted(true);
    fetchTickets(true); // Cargar solo impresos
  }, [fetchTickets]);

  // Lógica de cálculo de contadores (idéntica a la de Excel)
  useEffect(() => {
    const calculateCounters = async () => {
      if (tickets.length === 0) {
        setCounters({ ROLLOS: 0, BOLAS: 0, COSTURA: 0 });
        return;
      }

      const skus = Array.from(new Set(tickets.map(t => t.sku).filter(Boolean))) as string[];
      let skuToCatMdr: Record<string, string> = {};

      if (skus.length > 0) {
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
              skus.forEach(sku => {
                const mdr = skuToMdr[sku];
                if (mdr && mdrToCat[mdr]) {
                  skuToCatMdr[sku] = mdrToCat[mdr];
                }
              });
            }
          }
        } catch (error) {
          console.error('Error calculating counters in history:', error);
        }
      }

      const newCounters = { ROLLOS: 0, BOLAS: 0, COSTURA: 0 };
      tickets.forEach(t => {
        const catMdr = skuToCatMdr[t.sku || ''] || null;
        if (catMdr) {
          const upper = catMdr.toUpperCase();
          if (upper === 'LIENZO' || upper === 'ROLLO') {
            newCounters.ROLLOS++;
          }
          else if (upper.includes('MS FABRICACION')) {
            newCounters.BOLAS++;
          }
          else if (upper.includes('MALLA SOMBRA CONFECCIONADA')) {
            newCounters.COSTURA++;
          }
        }
      });
      setCounters(newCounters);
    };

    calculateCounters();
  }, [tickets]);

  const exportToPDF = () => {
    if (tickets.length === 0) return;

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const today = new Date();
    const dateTitle = format(today, "d 'de' MMMM 'de' yyyy", { locale: es });

    doc.setFontSize(16);
    doc.setTextColor(0, 98, 65);
    doc.text(`Historial de Bultos Impresos - ${dateTitle}`, 14, 15);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Registros Históricos: ${tickets.length}`, 14, 21);

    const headers = [
      'ID', 'Cód. Barra', 'Producto', 'Cant', 'SKU', 
      'Vaciado', 'Cuenta', 'Venta', 'Resp Imp', 'F Imp', 'Asignada', 
      'Corte', 'Confecc', 'Perfor', 'Ojill', 'Empaque', 'Recolector', 'F. Entrega'
    ];

    const body = tickets.map(t => [
      t.id,
      t.codigo_barra,
      t.nombre_producto || '---',
      t.cantidad || 0,
      t.sku || '---',
      t.responsable_vaciado || '---',
      t.cuenta || '---',
      t.sales_num || '---',
      t.responsable_impresion || '---',
      t.fecha_impresion || '---',
      t.asignada_a || '---',
      t.cortada ? 'SÍ' : 'NO',
      t.confeccion === true ? 'SÍ' : t.confeccion === false ? 'NO' : 'N/A',
      t.perforado === true ? 'SÍ' : t.perforado === false ? 'NO' : 'N/A',
      t.ojillado === true ? 'SÍ' : t.ojillado === false ? 'NO' : 'N/A',
      t.empaquetado ? 'SÍ' : 'NO',
      t.recolectada_por || '---',
      t.fecha_entrega_paquete || '---'
    ]);

    autoTable(doc, {
      startY: 26,
      head: [headers],
      body: body,
      theme: 'striped',
      headStyles: { fillColor: [0, 98, 65], fontSize: 5.5 },
      styles: { fontSize: 5.5, cellPadding: 1.5 }
    });

    doc.save(`historial_costura_impresos_${format(today, "yyyy-MM-dd")}.pdf`);
  };

  if (!isMounted) return null;

  return (
    <>
      <Head>
        <title>Historial Impresos | Bitácora de Costura</title>
      </Head>
      
      <main className="w-full max-w-[1600px] mx-auto p-2 md:p-8 space-y-4 md:space-y-6 animate-in fade-in duration-500">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Link href="/sewing-tickets">
                <Button variant="ghost" size="icon" className="text-gray-500 hover:text-starbucks-green">
                  <ArrowLeft className="h-6 w-6" />
                </Button>
              </Link>
              <h1 className="text-xl md:text-3xl font-bold text-starbucks-green flex items-center gap-2">
                <History className="h-6 w-6 md:h-8 md:w-8" />
                Historial de Impresos
              </h1>
            </div>
            <p className="text-xs md:text-sm text-gray-500 ml-12">Consulta y gestión de bultos ya exportados.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={exportToPDF} variant="outline" size="sm" className="border-starbucks-green text-starbucks-green" disabled={tickets.length === 0}>
              <FileDown className="h-4 w-4 mr-2" />
              Exportar PDF
            </Button>
            {loading && <Loader2 className="h-5 w-5 animate-spin text-starbucks-accent" />}
          </div>
        </header>

        {/* CONTADORES DINÁMICOS (HISTORIAL) */}
        <div className="flex flex-wrap gap-3 px-2">
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm flex flex-col min-w-[140px] transition-all hover:shadow-md">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1 bg-blue-50 rounded-md">
                <Layers className="h-3 w-3 text-blue-600" />
              </div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Rollos</span>
            </div>
            <span className="text-3xl font-black text-blue-800 leading-none">{counters.ROLLOS}</span>
          </div>
          
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm flex flex-col min-w-[140px] transition-all hover:shadow-md">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1 bg-blue-50 rounded-md">
                <Boxes className="h-3 w-3 text-blue-600" />
              </div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mallas Bolas</span>
            </div>
            <span className="text-3xl font-black text-blue-800 leading-none">{counters.BOLAS}</span>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm flex flex-col min-w-[140px] transition-all hover:shadow-md">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1 bg-blue-50 rounded-md">
                <Package className="h-3 w-3 text-blue-600" />
              </div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mallas Costura</span>
            </div>
            <span className="text-3xl font-black text-blue-800 leading-none">{counters.COSTURA}</span>
          </div>
        </div>

        <Card className="shadow-lg overflow-hidden border-none md:border-solid">
          <CardHeader className="p-4 md:p-6 bg-blue-50/30">
            <CardTitle className="text-base md:text-lg flex items-center gap-2 text-blue-800">
              <ClipboardCheck className="h-5 w-5" />
              Registros Históricos ({tickets.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 md:p-6">
            <div className="w-full overflow-x-auto">
              <SewingTicketsTable 
                tickets={tickets} 
                onUpdateTicket={updateTicket}
                onDeleteTicket={deleteTicket}
              />
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
