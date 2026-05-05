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
import { Scissors, ClipboardList, Loader2, UserCircle, PlusCircle, Keyboard, FileDown, Tag, Printer, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useReactToPrint } from 'react-to-print';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SewingTicket } from '@/types/sewing';

export default function SewingTicketsPage() {
  const { tickets, loading, fetchTickets, createTicket, updateTicket } = useSewingTickets();
  const [responsable, setResponsable] = useState('');
  const [manualBarcode, setManualBarcode] = useState('');
  const [isMounted, setIsMounted] = useState(false);
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
    const value = e.target.value;
    setResponsable(value);
    localStorage.setItem('sewing_responsable', value);
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

  // 1. Exportar PDF
  const exportToPDF = () => {
    if (tickets.length === 0) return;

    const doc = new jsPDF('landscape');
    const title = `Bitácora de Costura - ${new Date().toLocaleDateString()}`;
    
    doc.setFontSize(18);
    doc.text(title, 14, 15);
    
    autoTable(doc, {
      startY: 20,
      head: [['ID', 'Cód. Barra', 'Producto', 'Cant', 'SKU', 'Vaciado', 'Cuenta', 'Venta', 'Pack ID']],
      body: tickets.map(t => [
        t.id, 
        t.codigo_barra, 
        t.nombre_producto || '---', 
        t.cantidad || 0, 
        t.sku || '---',
        t.responsable_vaciado || '---',
        t.cuenta || '---',
        t.sales_num || '---',
        t.pack_id || '---'
      ]),
      theme: 'grid',
      headStyles: { fillColor: [0, 98, 65] },
      styles: { fontSize: 8 }
    });

    doc.save(`bitacora_costura_${Date.now()}.pdf`);
    
    toast({
      title: "PDF Generado",
      description: "La bitácora se ha descargado correctamente.",
    });
  };

  // 2. Lógica de etiquetas
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
                <Input
                  id="responsable"
                  placeholder="Escribe tu nombre completo..."
                  value={responsable}
                  onChange={handleResponsableChange}
                  className="bg-white border-starbucks-green/30 focus-visible:ring-starbucks-green"
                />
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

      {/* Modal Vista Previa de Etiquetas */}
      <Dialog open={isLabelModalOpen} onOpenChange={setIsLabelModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vista Previa de Etiquetas Logísticas</DialogTitle>
            <DialogDescription>
              Se generarán {selectedLabels.length} etiquetas listas para imprimir.
            </DialogDescription>
          </DialogHeader>
          
          <div className="bg-gray-100 p-8 flex justify-center">
            <div ref={labelsPrintRef} className="flex flex-wrap gap-4 justify-center bg-white p-4">
              {selectedLabels.map((ticket, idx) => (
                <div 
                  key={`${ticket.id}-${idx}`}
                  className="w-[90mm] h-[60mm] border-2 border-black p-4 flex flex-col justify-between font-mono bg-white text-black page-break-after-always"
                  style={{ pageBreakAfter: 'always' }}
                >
                  <div className="space-y-1">
                    <div className="flex justify-between items-start border-b border-black pb-1">
                      <span className="text-[10px] font-bold">ETIQUETA LOGÍSTICA</span>
                      <span className="text-[10px]">#{ticket.id}</span>
                    </div>
                    <div className="pt-2">
                      <div className="text-[8px] uppercase text-gray-500">SKU / PRODUCTO</div>
                      <div className="text-sm font-black truncate">{ticket.sku || 'N/A'}</div>
                      <div className="text-[10px] truncate leading-tight">{ticket.nombre_producto || 'PRODUCTO NO MAPEADO'}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-y border-black py-2 my-1">
                    <div>
                      <div className="text-[8px] uppercase text-gray-500">CANTIDAD</div>
                      <div className="text-xl font-black">{ticket.cantidad || 0} <span className="text-xs font-normal">UNDS</span></div>
                    </div>
                    <div>
                      <div className="text-[8px] uppercase text-gray-500">VENTA / PACK</div>
                      <div className="text-[10px] font-bold">V: {ticket.sales_num || '---'}</div>
                      <div className="text-[10px] font-bold">P: {ticket.pack_id || '---'}</div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="grid grid-cols-2 text-[8px] gap-2">
                      <div className="flex flex-col">
                        <span className="text-gray-500">DESPACHÓ:</span>
                        <span className="font-bold truncate uppercase">{ticket.responsable_vaciado || '---'}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-500">IMPRIMIÓ:</span>
                        <span className="font-bold truncate uppercase">{ticket.responsable_impresion || '---'}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-end pt-1">
                      <div className="flex flex-col">
                        <span className="text-[8px] text-gray-500">FECHA ENTREGA:</span>
                        <span className="text-[10px] font-bold">{ticket.fecha_entrega_paquete ? format(new Date(ticket.fecha_entrega_paquete), "dd/MM/yyyy") : 'PENDIENTE'}</span>
                      </div>
                      <div className="text-[10px] font-black border-2 border-black px-2 py-0.5">
                        {ticket.cuenta || 'COSTURA'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLabelModalOpen(false)}>Cerrar</Button>
            <Button onClick={handlePrintLabels} className="bg-starbucks-green hover:bg-starbucks-dark">
              <Printer className="h-4 w-4 mr-2" />
              Imprimir Etiquetas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
