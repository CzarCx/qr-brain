
'use client';

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useSewingTickets } from '@/hooks/use-sewing-tickets';
import { SewingScanner } from '@/components/SewingScanner';
import { SewingTicketsTable } from '@/components/SewingTicketsTable';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Scissors, ClipboardList, Loader2 } from 'lucide-react';

export default function SewingTicketsPage() {
  const { tickets, loading, fetchTickets, createTicket } = useSewingTickets();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    fetchTickets();
  }, [fetchTickets]);

  if (!isMounted) return null;

  return (
    <>
      <Head>
        <title>Bitácora de Costura | Sistema de Control</title>
      </Head>
      
      <main className="container mx-auto p-4 md:p-8 space-y-6 animate-in fade-in duration-500">
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

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Columna Escáner */}
          <div className="lg:col-span-5">
            <Card className="shadow-lg border-t-4 border-t-starbucks-green">
              <CardHeader>
                <CardTitle className="text-lg">Escáner de Tickets</CardTitle>
                <CardDescription>
                  Los códigos detectados se guardarán instantáneamente en la base de datos.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SewingScanner onScan={createTicket} disabled={loading} />
              </CardContent>
            </Card>
          </div>

          {/* Columna Lista Reciente */}
          <div className="lg:col-span-7">
            <Card className="shadow-lg h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-starbucks-accent" />
                    Registros de Hoy
                  </CardTitle>
                  <CardDescription>Últimos 50 tickets procesados.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <SewingTicketsTable tickets={tickets} />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
