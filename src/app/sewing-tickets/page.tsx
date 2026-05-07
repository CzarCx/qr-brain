'use client';

import { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useSewingTickets } from '@/hooks/use-sewing-tickets';
import { SewingScanner } from '@/components/SewingScanner';
import { SewingTicketsTable } from '@/components/SewingTicketsTable';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { 
  Scissors, 
  ClipboardList, 
  Loader2, 
  UserCircle, 
  PlusCircle, 
  Keyboard, 
  FileDown, 
  Tag, 
  Printer, 
  Download,
  Check,
  ChevronsUpDown,
  History,
  FileSpreadsheet,
  Layers,
  Boxes,
  Package,
  Clock
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useReactToPrint } from 'react-to-print';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SewingTicket } from '@/types/sewing';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { supabaseEtiquetas } from '@/lib/supabaseClient';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const PREDEFINED_RESPONSABLES = [
  "GENARO VÁZQUEZ",
  "MARIANA VÁZQUEZ",
  "LESLY ROA"
];

export default function SewingTicketsPage() {
  const { 
    tickets, 
    loading, 
    fetchTickets, 
    createTicket, 
    updateTicket, 
    deleteTicket, 
    markMultipleAsPrinted 
  } = useSewingTickets();
  
  const [responsable, setResponsable] = useState('');
  const [manualBarcode, setManualBarcode] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const [isResponsableListOpen, setIsResponsableListOpen] = useState(false);
  const { toast } = useToast();

  const [counters, setCounters] = useState({ ROLLOS: 0, BOLAS: 0, COSTURA: 0 });
  const [selectedLabels, setSelectedLabels] = useState<SewingTicket[]>([]);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const labelsPrintRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    fetchTickets(false);
    
    const savedResponsable = localStorage.getItem('sewing_responsable');
    if (savedResponsable) {
      setResponsable(savedResponsable);
    }
  }, [fetchTickets]);

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
          console.error('Error calculating counters:', error);
        }
      }

      const newCounters = { ROLLOS: 0, BOLAS: 0, COSTURA: 0 };
      tickets.forEach(t => {
        const catMdr = skuToCatMdr[t.sku || ''] || null;
        const qty = t.cantidad || 0;
        if (catMdr) {
          const upper = catMdr.toUpperCase();
          // Regla: ROLLOS (Lienzo o Rollo o Lienzo de Malla Sombra)
          if (upper === 'LIENZO' || upper === 'ROLLO' || upper.includes('LIENZO DE MALLA SOMBRA')) {
            newCounters.ROLLOS += qty;
          }
          // Regla: MALLAS BOLAS (MS Fabricacion o Malla Sombra Bolsa)
          else if (upper.includes('MS FABRICACION') || upper === 'MALLA SOMBRA BOLSA') {
            newCounters.BOLAS += qty;
          }
          // Regla: MALLAS COSTURA (Malla Sombra Confeccionada)
          else if (upper.includes('MALLA SOMBRA CONFECCIONADA')) {
            newCounters.COSTURA += qty;
          }
        }
      });
      setCounters(newCounters);
    };

    calculateCounters();
  }, [tickets]);

  const handleResponsableChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setResponsable(value);
    localStorage.setItem('sewing_responsable', value);
  };

  const handleSelectResponsable = (name: string) => {
    setResponsable(name);
    localStorage.setItem('sewing_responsable', name);
    setIsResponsableListOpen(false);
  };

  const handleScan = async (barcode: string) => {
    if (!responsable.trim()) {
      toast({
        variant: 'destructive',
        title: 'Responsable Requerido',
        description: 'Debes ingresar tu nombre antes de escanear.',
      });
      return false;
    }
    return await createTicket(barcode, responsable.trim());
  };

  const handleManualAdd = async () => {
    if (!responsable.trim()) {
      toast({
        variant: 'destructive',
        title: 'Responsable Requerido',
        description: 'Debes ingresar tu nombre antes de añadir códigos.',
      });
      return;
    }

    const code = manualBarcode.trim();
    if (!code) return;

    const success = await createTicket(code, responsable.trim());
    if (success) {
      setManualBarcode('');
    }
  };

  const exportToExcel = async () => {
    if (tickets.length === 0) {
      toast({
        title: "Sin registros",
        description: "No hay registros pendientes para exportar.",
      });
      return;
    }

    setIsExporting(true);
    try {
      const skus = Array.from(new Set(tickets.map(t => t.sku).filter(Boolean))) as string[];
      let skuToCatMdr: Record<string, string> = {};

      if (skus.length > 0) {
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
      }

      const countersExport = { ROLLOS: 0, BOLAS: 0, COSTURA: 0 };
      tickets.forEach(t => {
          const catMdr = skuToCatMdr[t.sku || ''] || null;
          const qty = t.cantidad || 0;
          if (catMdr) {
              const upper = catMdr.toUpperCase();
              if (upper === 'LIENZO' || upper === 'ROLLO' || upper.includes('LIENZO DE MALLA SOMBRA')) {
                  countersExport.ROLLOS += qty;
              }
              else if (upper.includes('MS FABRICACION') || upper === 'MALLA SOMBRA BOLSA') {
                  countersExport.BOLAS += qty;
              }
              else if (upper.includes('MALLA SOMBRA CONFECCIONADA')) {
                  countersExport.COSTURA += qty;
              }
          }
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Bitácora de Costura');

      const headers = [
        'ID', 'Código de Barra', 'Producto', 'Cantidad', 'SKU', 
        'Responsable Vaciado', 'Hora Vaciado', 'Cuenta', 'No. Venta', 'Pack ID', 
        'Impresa', 'Resp. Impresión', 'Fecha Impresión', 'Asignada A', 
        'Cortada', 'Confección', 'Perforado', 'Ojillado', 
        'Empaquetado', 'Lista Recolección', 'Recolectada Por', 'Fecha Entrega'
      ];

      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006241' } };
      headerRow.eachCell(cell => { cell.font = { color: { argb: 'FFFFFFFF' }, bold: true }; });

      tickets.forEach(t => {
        worksheet.addRow([
          t.id, t.codigo_barra, t.nombre_producto || '---', t.cantidad || 0, t.sku || '---',
          t.responsable_vaciado || '---', t.hora_vaciado || '---', t.cuenta || '---', t.sales_num || '---', t.pack_id || '---',
          t.impresa ? 'SÍ' : 'NO', t.responsable_impresion || '---', t.fecha_impresion || '---', t.asignada_a || '---',
          t.cortada ? 'SÍ' : 'NO', t.confeccion === true ? 'SÍ' : t.confeccion === false ? 'NO' : 'N/A',
          t.perforado === true ? 'SÍ' : t.perforado === false ? 'NO' : 'N/A',
          t.ojillado === true ? 'SÍ' : t.ojillado === false ? 'NO' : 'N/A',
          t.empaquetado ? 'SÍ' : 'NO', t.lista_para_recoleccion ? 'SÍ' : 'NO',
          t.recolectada_por || 'PENDIENTE', t.fecha_entrega_paquete || '---'
        ]);
      });

      worksheet.columns.forEach(column => { column.width = 15; });
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `bitacora_costura_pendientes_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`);

      const idsToMark = tickets.map(t => Number(t.id)).filter(id => !isNaN(id));
      await markMultipleAsPrinted(idsToMark);
      await fetchTickets(false);

      toast({
        title: "Exportación Exitosa",
        description: `ROLLOS: ${countersExport.ROLLOS} | BOLAS: ${countersExport.BOLAS} | COSTURA: ${countersExport.COSTURA}`,
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error en Exportación', description: error.message || 'No se pudo completar la exportación.' });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = () => {
    if (tickets.length === 0) return;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const today = new Date();
    const dateTitle = format(today, "d 'de' MMMM 'de' yyyy", { locale: es });
    const totalUnits = tickets.reduce((acc, t) => acc + (t.cantidad || 0), 0);

    doc.setFontSize(16);
    doc.setTextColor(0, 98, 65);
    doc.text(`Bitácora de Costura (Pendientes) - ${dateTitle}`, 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Registros: ${tickets.length} | Unidades Totales: ${totalUnits}`, 14, 21);

    const headers = ['ID', 'Cód. Barra', 'Producto', 'Cant', 'SKU', 'Vaciado', 'H. Vaciado', 'Cuenta', 'Venta', 'Pack ID', 'Impresa', 'Resp Imp', 'F Imp', 'Asignada', 'Corte', 'Confecc', 'Perfor', 'Ojill', 'Empaque', 'Recol', 'Recolector', 'F. Entrega'];
    const body = tickets.map(t => [
      t.id, t.codigo_barra, t.nombre_producto ? (t.nombre_producto.length > 40 ? t.nombre_producto.substring(0, 37) + '...' : t.nombre_producto) : '---',
      t.cantidad || 0, t.sku || '---', t.responsable_vaciado || '---', t.hora_vaciado || '---', t.cuenta || '---', t.sales_num || '---', t.pack_id || '---',
      t.impresa ? 'SÍ' : 'NO', t.responsable_impresion || '---', t.fecha_impresion ? format(new Date(t.fecha_impresion), "d MMM yyyy", { locale: es }) : '---',
      t.asignada_a || '---', t.cortada ? 'SÍ' : 'NO', t.confeccion === true ? 'SÍ' : t.confeccion === false ? 'NO' : 'N/A',
      t.perforado === true ? 'SÍ' : t.perforado === false ? 'NO' : 'N/A', t.ojillado === true ? 'SÍ' : t.ojillado === false ? 'NO' : 'N/A',
      t.empaquetado ? 'SÍ' : 'NO', t.lista_para_recoleccion ? 'SÍ' : 'NO', t.recolectada_por || 'PENDIENTE', t.fecha_entrega_paquete ? format(new Date(t.fecha_entrega_paquete), "dd MMM yyyy", { locale: es }) : '---'
    ]);

    autoTable(doc, {
      startY: 26, head: [headers], body: body, theme: 'striped',
      headStyles: { fillColor: [0, 98, 65], fontSize: 5.5, halign: 'center', valign: 'middle' },
      styles: { fontSize: 5.5, cellPadding: 1.5, valign: 'middle', overflow: 'linebreak' },
      columnStyles: { 2: { cellWidth: 35 }, 3: { fontStyle: 'bold', halign: 'center' }, 4: { fontStyle: 'bold' } }
    });
    doc.save(`bitacora_pendientes_${format(today, "yyyy-MM-dd")}.pdf`);
  };

  const handleOpenBulkLabels = () => {
    if (tickets.length === 0) return;
    setSelectedLabels(tickets);
    setIsLabelModalOpen(true);
  };

  const handleOpenSingleLabel = (ticket: SewingTicket) => {
    setSelectedLabels([ticket]);
    setIsLabelModalOpen(true);
  };

  const handlePrintLabels = useReactToPrint({ contentRef: labelsPrintRef });

  if (!isMounted) return null;

  return (
    <>
      <Head><title>Bitácora de Costura | Pendientes</title></Head>
      <main className="w-full max-w-[1600px] mx-auto p-2 md:p-8 space-y-4 md:space-y-6 animate-in fade-in duration-500 overflow-x-hidden">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl md:text-3xl font-bold text-starbucks-green flex items-center gap-2">
                <Scissors className="h-6 w-6 md:h-8 md:w-8" />
                Registros de Hoy
              </h1>
              <Link href="/sewing-tickets/impresos">
                <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 gap-2">
                  <History className="h-4 w-4" />
                  <span className="hidden sm:inline">Historial Impresos</span>
                </Button>
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={exportToExcel} variant="outline" size="sm" className="flex-1 md:flex-none border-green-600 text-green-700" disabled={tickets.length === 0 || loading || isExporting}>
              {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
              Excel e Imprimir
            </Button>
            <Button onClick={exportToPDF} variant="outline" size="sm" className="flex-1 md:flex-none border-starbucks-green text-starbucks-green" disabled={tickets.length === 0}>
              <FileDown className="h-4 w-4 mr-2" /> PDF
            </Button>
            <Button onClick={handleOpenBulkLabels} variant="outline" size="sm" className="flex-1 md:flex-none bg-starbucks-green text-white" disabled={tickets.length === 0}>
              <Tag className="h-4 w-4 mr-2" /> Etiquetas
            </Button>
          </div>
        </header>

        <div className="flex flex-wrap gap-3 px-2">
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm flex flex-col min-w-[140px]">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="h-3 w-3 text-starbucks-green" />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Rollos (Pzs)</span>
            </div>
            <span className="text-3xl font-black text-starbucks-green">{counters.ROLLOS}</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm flex flex-col min-w-[140px]">
            <div className="flex items-center gap-2 mb-1">
              <Boxes className="h-3 w-3 text-starbucks-green" />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mallas Bolas (Pzs)</span>
            </div>
            <span className="text-3xl font-black text-starbucks-green">{counters.BOLAS}</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm flex flex-col min-w-[140px]">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-3 w-3 text-starbucks-green" />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mallas Costura (Pzs)</span>
            </div>
            <span className="text-3xl font-black text-starbucks-green">{counters.COSTURA}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-2">
          <Card className="shadow-sm border-starbucks-green/20">
            <CardContent className="pt-4 md:pt-6">
              <div className="space-y-2">
                <Label htmlFor="responsable" className="flex items-center gap-2 font-bold text-xs text-starbucks-dark">
                  <UserCircle className="h-4 w-4" /> Responsable de Vaciado
                </Label>
                <div className="relative group">
                  <Input id="responsable" placeholder="Nombre..." value={responsable} onChange={handleResponsableChange} className="uppercase font-bold text-xs" />
                  <Popover open={isResponsableListOpen} onOpenChange={setIsResponsableListOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 text-gray-400"><ChevronsUpDown className="h-4 w-4" /></Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="end">
                      <Command><CommandList><CommandGroup heading="Frecuentes">
                        {PREDEFINED_RESPONSABLES.map((name) => (
                          <CommandItem key={name} value={name} onSelect={() => handleSelectResponsable(name)} className="cursor-pointer">
                            <div className="flex items-center"><Check className={cn("mr-2 h-4 w-4 text-starbucks-green", responsable === name ? "opacity-100" : "opacity-0")} /><span className="font-bold text-xs">{name}</span></div>
                          </CommandItem>
                        ))}
                      </CommandGroup></CommandList></Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-starbucks-green/20">
            <CardContent className="pt-4 md:pt-6">
              <div className="space-y-2">
                <Label htmlFor="manual-barcode" className="flex items-center gap-2 font-bold text-xs text-starbucks-dark"><Keyboard className="h-4 w-4" /> Ingreso Manual</Label>
                <div className="flex gap-2">
                  <Input id="manual-barcode" placeholder="Código..." value={manualBarcode} onChange={(e) => setManualBarcode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()} className="text-xs" />
                  <Button onClick={handleManualAdd} disabled={loading || !manualBarcode.trim()} className="bg-starbucks-green"><PlusCircle className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 px-2">
          <div className="w-full max-w-2xl mx-auto"><SewingScanner onScan={handleScan} disabled={loading || !responsable.trim()} /></div>
          <Card className="shadow-lg overflow-hidden">
            <CardHeader className="p-4 bg-gray-50/50"><CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-5 w-5 text-starbucks-accent" /> Bultos Pendientes ({tickets.length})</CardTitle></CardHeader>
            <CardContent className="p-0 md:p-6"><div className="w-full overflow-x-auto"><SewingTicketsTable tickets={tickets} onUpdateTicket={updateTicket} onDeleteTicket={deleteTicket} onGenerateLabel={handleOpenSingleLabel} /></div></CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={isLabelModalOpen} onOpenChange={setIsLabelModalOpen}>
        <DialogContent className="max-w-[95vw] md:max-w-5xl p-0">
          <DialogHeader className="p-4 bg-white border-b"><DialogTitle>Vista Previa de Etiquetas</DialogTitle></DialogHeader>
          <div className="bg-gray-200 p-2 md:p-8 flex justify-center overflow-x-auto">
            <div ref={labelsPrintRef} className="bg-white p-2 md:p-[10mm] w-full max-w-[210mm] min-h-[297mm] grid grid-cols-2 gap-2 md:gap-4 content-start" style={{ fontFamily: 'monospace' }}>
              {selectedLabels.map((ticket, idx) => (
                <div key={`${ticket.id}-${idx}`} className="w-full aspect-[1.4/1] border-black border-[1px] p-2 flex flex-col justify-between text-black">
                  <div className="flex justify-between border-b border-black pb-0.5"><span className="text-[7px] font-black">INMATMEX LOGÍSTICA</span><span className="text-[8px] font-bold">#{ticket.id}</span></div>
                  <div><div className="text-[6px] font-bold text-gray-600">PRODUCTO / SKU</div><div className="text-[10px] font-black truncate">{ticket.sku || 'N/A'}</div><div className="text-[8px] truncate">{ticket.nombre_producto || 'NO MAPEADO'}</div></div>
                  <div className="grid grid-cols-5 border-y border-black py-1"><div className="col-span-2 border-r border-black pr-1"><div className="text-[6px] font-bold">CANTIDAD</div><div className="text-lg font-black">{ticket.cantidad || 0} PZS</div></div><div className="col-span-3 pl-1"><div className="text-[6px] font-bold">VENTA / PACK</div><div className="flex flex-col text-[8px] font-black"><span>V: {ticket.sales_num || '---'}</span><span>P: {ticket.pack_id || '---'}</span></div></div></div>
                  <div className="flex justify-between text-[6px] font-bold"><div><span className="text-gray-500">DESPACHÓ:</span> {ticket.responsable_vaciado || '---'}</div><div><span className="text-gray-500">IMPRIMIÓ:</span> {ticket.responsable_impresion || '---'}</div></div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="p-4 bg-white border-t"><Button variant="outline" onClick={() => setIsLabelModalOpen(false)}>Cerrar</Button><Button onClick={handlePrintLabels} className="bg-starbucks-green"><Printer className="h-4 w-4 mr-2" /> Imprimir</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
