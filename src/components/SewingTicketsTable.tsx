
'use client';

import { SewingTicket } from '@/types/sewing';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface SewingTicketsTableProps {
  tickets: SewingTicket[];
}

export function SewingTicketsTable({ tickets }: SewingTicketsTableProps) {
  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
      <div className="max-h-[400px] overflow-auto">
        <Table>
          <TableHeader className="bg-gray-50 sticky top-0 z-10">
            <TableRow>
              <TableHead className="w-[200px]">Código de Barra</TableHead>
              <TableHead>Fecha de Registro</TableHead>
              <TableHead className="text-right">Estado Inicial</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.length > 0 ? (
              tickets.map((ticket, idx) => (
                <TableRow key={ticket.id || idx}>
                  <TableCell className="font-mono font-bold text-starbucks-green">
                    {ticket.codigo_barra}
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {ticket.created_at ? format(new Date(ticket.created_at), "d 'de' MMMM, HH:mm", { locale: es }) : 'Recién escaneado'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                      Pendiente de Vaciado
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-12 text-gray-400">
                  No hay tickets registrados hoy. Comienza a escanear.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
