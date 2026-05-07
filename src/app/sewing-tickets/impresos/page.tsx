
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
  FileDown
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function SewingTicketsHistoryPage() {
  const { tickets, loading, fetchTickets, updateTicket, deleteTicket } = useSewingTickets();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    fetchTickets(true); // Cargar solo impresos
  }, [fetchTickets]);

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
