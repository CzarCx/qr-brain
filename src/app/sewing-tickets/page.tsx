'use client';

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useSewingTickets } from '@/hooks/use-sewing-tickets';
import { SewingScanner } from '@/components/SewingScanner';
import { SewingTicketsTable } from '@/components/SewingTicketsTable';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Scissors, ClipboardList, Loader2, UserCircle, PlusCircle, Keyboard } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function SewingTicketsPage() {
  const { tickets, loading, fetchTickets, createTicket, updateTicket } = useSewingTickets();
  const [responsable, setResponsable] = useState('');
  const [manualBarcode, setManualBarcode] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();

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
            <p className="text-gray-500">Escanea códigos de barras para el registro automático de producción.</p>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-sm text-starbucks-accent font-medium bg-starbucks-cream px-3 py-1 rounded-full">
              <Loader2 className="h-4 w-4 animate-spin" />
              Sincronizando...
            </div>
          )}
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
              />
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
