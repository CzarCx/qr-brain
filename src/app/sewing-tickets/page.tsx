'use client';

import { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
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
  ChevronsUpDown
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useReactToPrint } from 'react-to-print';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SewingTicket } from '@/types/sewing';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
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
  const { tickets, loading, fetchTickets, createTicket, updateTicket } = useSewingTickets();
  const [responsable, setResponsable] = useState('');
  const [manualBarcode, setManualBarcode] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const [isResponsableListOpen, setIsResponsableListOpen] = useState(false);
  const { toast } = useToast();

  // Estados para generación de etiquetas
  const [selectedLabels, setSelectedLabels] = useState<SewingTicket[]>([]);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const labelsPrintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
    fetchTickets();
    
    // Recuperar responsable guardado
    const savedResponsable = localStorage.getItem('sewing_responsable');
    if (savedResponsable) {
      setResponsable(savedResponsable);
    }
  }, [fetchTickets]);

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

  const exportToPDF = () => {
    if (tickets.length === 0) return;

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const today = new Date();
    const dateTitle = format(today, "d 'de' MMMM 'de' yyyy", { locale: es });
    const totalUnits = tickets.reduce((acc, t) => acc + (t.cantidad || 0), 0);

    // Encabezado del PDF
    doc.setFontSize(16);
    doc.setTextColor(0, 98, 65); // Starbucks Green
    doc.text(`Bitácora de Costura - ${dateTitle}`, 14, 15);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Registros: ${tickets.length} | Unidades Totales: ${totalUnits}`, 14, 21);

    const headers = [
      'ID', 'Cód. Barra', 'Producto', 'Cant', 'SKU', 
      'Vaciado', 'H. Vaciado', 'Cuenta', 'Venta', 'Pack ID', 
      'Impresa', 'Resp Imp', 'F Imp', 'Asignada', 
      'Corte', 'Confecc', 'Perfor', 'Ojill', 
      'Empaque', 'Recol', 'Recolector', 'F. Entrega'
    ];

    const body = tickets.map(t => [
      t.id,
      t.codigo_barra,
      t.nombre_producto ? (t.nombre_producto.length > 40 ? t.nombre_producto.substring(0, 37) + '...' : t.nombre_producto) : '---',
      t.cantidad || 0,
      t.sku || '---',
      t.responsable_vaciado || '---',
      t.hora_vaciado || '---',
      t.cuenta || '---',
      t.sales_num || '---',
      t.pack_id || '---',
      t.impresa ? 'SÍ' : 'NO',
      t.responsable_impresion || '---',
      t.fecha_impresion ? format(new Date(t.fecha_impresion), "d MMM yyyy", { locale: es }) : '---',
      t.asignada_a || '---',
      t.cortada ? 'SÍ' : 'NO',
      t.confeccion === true ? 'SÍ' : t.confeccion === false ? 'NO' : 'N/A',
      t.perforado === true ? 'SÍ' : t.perforado === false ? 'NO' : 'N/A',
      t.ojillado === true ? 'SÍ' : t.ojillado === false ? 'NO' : 'N/A',
      t.empaquetado ? 'SÍ' : 'NO',
      t.lista_para_recoleccion ? 'SÍ' : 'NO',
      t.recolectada_por || 'PENDIENTE',
      t.fecha_entrega_paquete ? format(new Date(t.fecha_entrega_paquete), "d MMM yyyy", { locale: es }) : '---'
    ]);

    autoTable(doc, {
      startY: 26,
      head: [headers],
      body: body,
      theme: 'striped',
      headStyles: { 
        fillColor: [0, 98, 65], 
        fontSize: 6,
        halign: 'center',
        valign: 'middle',
        lineWidth: 0.1,
        lineColor: [255, 255, 255]
      },
      styles: { 
        fontSize: 5.5,
        cellPadding: 1.5,
        valign: 'middle',
        overflow: 'linebreak',
        lineWidth: 0,
      },
      columnStyles: {
        2: { cellWidth: 35 }, // Producto
        0: { halign: 'center' }, // ID
        3: { fontStyle: 'bold', halign: 'center' }, // Cant
        4: { fontStyle: 'bold' }, // SKU
        20: { fontStyle: 'bold' }, // Recolector
        21: { fontStyle: 'bold' }, // F. Entrega
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      didParseCell: (data) => {
        // Colores para estados
        const cellText = String(data.cell.text[0]);
        if (cellText === 'SÍ') {
          data.cell.styles.textColor = [0, 128, 0]; // Verde
          data.cell.styles.fontStyle = 'bold';
        } else if (cellText === 'NO') {
          data.cell.styles.textColor = [200, 0, 0]; // Rojo
        } else if (['N/A', '---'].includes(cellText)) {
          data.cell.styles.textColor = [128, 128, 128]; // Gris
        } else if (cellText === 'PENDIENTE') {
          data.cell.styles.textColor = [184, 134, 11]; // Amarillo oscuro
          data.cell.styles.fontStyle = 'bold';
        }

        // Separadores visuales por bloques operativos
        const index = data.column.index;
        // PRODUCTO(0-4), PRODUCCIÓN(5-9), CONTROL(10-13), COSTURA(14-17), LOGÍSTICA(18-21)
        if ([4, 9, 13, 17].includes(index)) {
           data.cell.styles.borderRightWidth = 0.1;
           data.cell.styles.borderRightColor = [200, 200, 200];
        }
      }
    });

    doc.save(`bitacora_costura_${format(today, "yyyy-MM-dd")}.pdf`);
    
    toast({
      title: "PDF Generado",
      description: "La bitácora completa se ha descargado en formato horizontal optimizado.",
    });
  };

  // Lógica de etiquetas
  const handleOpenBulkLabels = () => {
    if (tickets.length === 0) return;
    setSelectedLabels(tickets);
    setIsLabelModalOpen(true);
  };

  const handleOpenSingleLabel = (ticket: SewingTicket) => {
    setSelectedLabels([ticket]);
    setIsLabelModalOpen(true);
  };

  const handlePrintLabels = useReactToPrint({
    contentRef: labelsPrintRef,
  });

  if (!isMounted) return null;

  return (
    <>
      <Head>
        <title>Bitácora de Costura | Sistema de Control</title>
      </Head>
      
      <main className="max-w-[1600px] mx-auto p-4 md:p-8 space-y-6 animate-in fade-in duration-500">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold text-starbucks-green flex items-center gap-2">
              <Scissors className="h-8 w-8" />
              Bitácora de Tickets de Costura
            </h1>
            <p className="text-gray-500">Gestión de producción, exportación y etiquetado logístico.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={exportToPDF} variant="outline" className="border-starbucks-green text-starbucks-green hover:bg-green-50" disabled={tickets.length === 0}>
              <FileDown className="h-4 w-4 mr-2" />
              Exportar PDF
            </Button>
            <Button onClick={handleOpenBulkLabels} variant="outline" className="bg-starbucks-green text-white hover:bg-starbucks-dark" disabled={tickets.length === 0}>
              <Tag className="h-4 w-4 mr-2" />
              Generar Etiquetas
            </Button>
            {loading && (
              <div className="flex items-center gap-2 text-sm text-starbucks-accent font-medium bg-starbucks-cream px-3 py-1 rounded-full">
                <Loader2 className="h-4 w-4 animate-spin" />
                Sincronizando...
              </div>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="shadow-sm border-starbucks-green/20">
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label htmlFor="responsable" className="flex items-center gap-2 font-bold text-starbucks-dark">
                  <UserCircle className="h-4 w-4" />
                  Nombre del Responsable de Vaciado
                </Label>
                <div className="relative group">
                  <Input
                    id="responsable"
                    placeholder="Escribe o selecciona responsable..."
                    value={responsable}
                    onChange={handleResponsableChange}
                    className="bg-white border-starbucks-green/30 focus-visible:ring-starbucks-green pr-10 uppercase font-bold"
                  />
                  <Popover open={isResponsableListOpen} onOpenChange={setIsResponsableListOpen}>
                    <PopoverTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-gray-400 hover:text-starbucks-green"
                      >
                        <ChevronsUpDown className="h-4 w-4" />
                        <span className="sr-only">Ver opciones</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="end">
                      <Command>
                        <CommandList>
                          <CommandGroup heading="Responsables Frecuentes">
                            {PREDEFINED_RESPONSABLES.map((name) => (
                              <CommandItem
                                key={name}
                                value={name}
                                onSelect={() => handleSelectResponsable(name)}
                                className="flex items-center justify-between cursor-pointer"
                              >
                                <div className="flex items-center">
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4 text-starbucks-green",
                                      responsable === name ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <span className="font-bold">{name}</span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-starbucks-green/20">
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label htmlFor="manual-barcode" className="flex items-center gap-2 font-bold text-starbucks-dark">
                  <Keyboard className="h-4 w-4" />
                  Ingreso Manual (Pruebas)
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="manual-barcode"
                    placeholder="Escribe el código de barras..."
                    value={manualBarcode}
                    onChange={(e) => setManualBarcode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()}
                    className="bg-white border-starbucks-green/30 focus-visible:ring-starbucks-green"
                  />
                  <Button 
                    onClick={handleManualAdd} 
                    disabled={loading || !manualBarcode.trim()}
                    className="bg-starbucks-green hover:bg-starbucks-dark"
                  >
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Añadir
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-8">
          {/* Sección Escáner */}
          <Card className="shadow-lg border-t-4 border-t-starbucks-green max-w-2xl mx-auto w-full">
            <CardHeader>
              <CardTitle className="text-lg">Escáner de Tickets</CardTitle>
              <CardDescription>
                {!responsable.trim() 
                  ? "Debes ingresar tu nombre antes de comenzar a escanear." 
                  : "Los códigos detectados se guardarán instantáneamente."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SewingScanner onScan={handleScan} disabled={loading || !responsable.trim()} />
            </CardContent>
          </Card>

          {/* Sección Lista Reciente - Ancho Completo */}
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-starbucks-accent" />
                  Registros de Hoy
                </CardTitle>
                <CardDescription>Visualiza y actualiza los estados de producción rápidamente.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <SewingTicketsTable 
                tickets={tickets} 
                onUpdateTicket={updateTicket}
                onGenerateLabel={handleOpenSingleLabel}
              />
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Modal Vista Previa de Etiquetas - Optimizado para 8 por página (2x4) */}
      <Dialog open={isLabelModalOpen} onOpenChange={setIsLabelModalOpen}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto p-0">
          <DialogHeader className="p-6 bg-white border-b sticky top-0 z-20">
            <DialogTitle>Vista Previa de Etiquetas Logísticas (8 por página)</DialogTitle>
            <DialogDescription>
              Se generarán {selectedLabels.length} etiquetas organizadas en cuadrículas de 2x4 para optimizar papel.
            </DialogDescription>
          </DialogHeader>
          
          <div className="bg-gray-200 p-4 md:p-8 flex justify-center">
            {/* Contenedor de impresión con dimensiones de hoja A4/Carta aproximada */}
            <div 
              ref={labelsPrintRef} 
              className="bg-white p-[10mm] w-[210mm] min-h-[297mm] shadow-xl grid grid-cols-2 gap-x-4 gap-y-4 content-start"
              style={{ 
                fontFamily: 'monospace',
                pageBreakAfter: 'always'
              }}
            >
              {selectedLabels.map((ticket, idx) => (
                <div 
                  key={`${ticket.id}-${idx}`}
                  className="w-[92mm] h-[66mm] border-[1.5px] border-black p-3 flex flex-col justify-between bg-white text-black overflow-hidden"
                  style={{ 
                    breakInside: 'avoid',
                    pageBreakInside: 'avoid'
                  }}
                >
                  {/* Encabezado Compacto */}
                  <div className="space-y-0.5">
                    <div className="flex justify-between items-center border-b border-black pb-0.5 mb-1">
                      <span className="text-[9px] font-black tracking-tighter uppercase">INMATMEX LOGÍSTICA</span>
                      <span className="text-[10px] font-bold">#{ticket.id}</span>
                    </div>
                    
                    <div className="leading-tight">
                      <div className="text-[7px] uppercase font-bold text-gray-600">PRODUCTO / SKU</div>
                      <div className="text-[12px] font-black truncate uppercase">{ticket.sku || 'N/A'}</div>
                      <div className="text-[9px] truncate uppercase font-medium">{ticket.nombre_producto || 'NO MAPEADO'}</div>
                    </div>
                  </div>

                  {/* Bloque Central de Datos */}
                  <div className="grid grid-cols-5 gap-1 border-y border-black py-1.5 my-1 items-center">
                    <div className="col-span-2 border-r border-black/20 pr-1">
                      <div className="text-[7px] uppercase font-bold text-gray-500">CANTIDAD</div>
                      <div className="text-xl font-black leading-none">{ticket.cantidad || 0} <span className="text-[9px] font-normal">PZS</span></div>
                    </div>
                    <div className="col-span-3 pl-1">
                      <div className="text-[7px] uppercase font-bold text-gray-500">VENTA / PACK</div>
                      <div className="flex flex-col text-[10px] font-black leading-tight">
                        <span>V: {ticket.sales_num || '---'}</span>
                        <span>P: {ticket.pack_id || '---'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Footer de Responsables y Entrega */}
                  <div className="space-y-1">
                    <div className="grid grid-cols-2 text-[7px] font-bold gap-x-2">
                      <div className="flex flex-col">
                        <span className="text-gray-500">DESPACHÓ:</span>
                        <span className="truncate uppercase text-[8px]">{ticket.responsable_vaciado || '---'}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-500">IMPRIMIÓ:</span>
                        <span className="truncate uppercase text-[8px]">{ticket.responsable_impresion || '---'}</span>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-end pt-0.5 mt-1 border-t border-dotted border-black/30">
                      <div className="flex flex-col">
                        <span className="text-[7px] font-bold text-gray-500 uppercase">FECHA ENTREGA:</span>
                        <span className="text-[11px] font-black">
                          {ticket.fecha_entrega_paquete ? format(new Date(ticket.fecha_entrega_paquete), "dd/MM/yyyy") : 'PENDIENTE'}
                        </span>
                      </div>
                      <div className="text-[9px] font-black border border-black px-1.5 py-0.5 bg-gray-50 uppercase tracking-tighter">
                        {ticket.cuenta || 'COSTURA'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="p-6 bg-white border-t sticky bottom-0">
            <Button variant="outline" onClick={() => setIsLabelModalOpen(false)}>Cerrar</Button>
            <Button onClick={handlePrintLabels} className="bg-starbucks-green hover:bg-starbucks-dark">
              <Printer className="h-4 w-4 mr-2" />
              Imprimir en Hojas A4/Carta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
