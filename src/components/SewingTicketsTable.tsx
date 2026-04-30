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
import { Check, X, Clock, User, Package, Hash, Tag, Building2, Calendar } from 'lucide-react';

interface SewingTicketsTableProps {
  tickets: SewingTicket[];
}

export function SewingTicketsTable({ tickets }: SewingTicketsTableProps) {
  const renderBoolean = (val: boolean | null) => {
    if (val === true) return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200"><Check className="h-3 w-3 mr-1" /> SÍ</Badge>;
    if (val === false) return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><X className="h-3 w-3 mr-1" /> NO</Badge>;
    return <span className="text-gray-300 text-xs">---</span>;
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
      <div className="max-h-[600px] overflow-auto">
        <Table className="min-w-[2000px]">
          <TableHeader className="bg-gray-50 sticky top-0 z-10">
            <TableRow>
              <TableHead className="w-[80px] text-center bg-gray-50">ID</TableHead>
              <TableHead className="w-[180px] bg-gray-50">Código de Barra</TableHead>
              <TableHead className="w-[150px]">Producto</TableHead>
              <TableHead className="w-[100px] text-center">Cant.</TableHead>
              <TableHead className="w-[150px]">SKU</TableHead>
              <TableHead className="w-[150px]">Responsable Vaciado</TableHead>
              <TableHead className="w-[120px]">Hora Vaciado</TableHead>
              <TableHead className="w-[150px]">Cuenta / Org.</TableHead>
              <TableHead className="w-[120px]">No. Venta</TableHead>
              <TableHead className="w-[120px]">Pack ID</TableHead>
              <TableHead className="w-[120px] text-center">Impresa</TableHead>
              <TableHead className="w-[150px]">Resp. Impresión</TableHead>
              <TableHead className="w-[120px]">Fecha Impresión</TableHead>
              <TableHead className="w-[150px]">Asignada A</TableHead>
              <TableHead className="w-[100px] text-center">Cortada</TableHead>
              <TableHead className="w-[100px] text-center">Confección</TableHead>
              <TableHead className="w-[100px] text-center">Perforado</TableHead>
              <TableHead className="w-[100px] text-center">Ojillado</TableHead>
              <TableHead className="w-[100px] text-center">Empaquetado</TableHead>
              <TableHead className="w-[100px] text-center">Lista Recolecc.</TableHead>
              <TableHead className="w-[150px]">Recolectada Por</TableHead>
              <TableHead className="w-[150px]">Fecha Entrega</TableHead>
              <TableHead className="w-[150px]">Registro Sistema</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.length > 0 ? (
              tickets.map((ticket) => (
                <TableRow key={ticket.id} className="hover:bg-gray-50 transition-colors">
                  <TableCell className="text-center font-bold text-gray-400 text-xs">#{ticket.id}</TableCell>
                  <TableCell className="font-mono font-bold text-starbucks-green border-r">
                    {ticket.codigo_barra}
                  </TableCell>
                  <TableCell className="text-xs font-semibold truncate max-w-[150px]" title={ticket.nombre_producto || ''}>
                    {ticket.nombre_producto || '---'}
                  </TableCell>
                  <TableCell className="text-center font-bold text-blue-600">
                    {ticket.cantidad !== null ? ticket.cantidad : '---'}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-gray-600">
                    {ticket.sku || '---'}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3 text-gray-400" />
                      {ticket.responsable_vaciado || '---'}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-gray-600">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-gray-400" />
                      {ticket.hora_vaciado || '---'}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs uppercase text-gray-500">
                    <div className="flex items-center gap-1">
                      <Building2 className="h-3 w-3 text-gray-400" />
                      {ticket.cuenta || '---'}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {ticket.sales_num || '---'}
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {ticket.pack_id || '---'}
                  </TableCell>
                  <TableCell className="text-center">
                    {renderBoolean(ticket.impresa)}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500">
                    {ticket.responsable_impresion || '---'}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500">
                    {ticket.fecha_impresion ? format(new Date(ticket.fecha_impresion), "dd/MM/yyyy", { locale: es }) : '---'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {ticket.asignada_a || '---'}
                  </TableCell>
                  <TableCell className="text-center">
                    {renderBoolean(ticket.cortada)}
                  </TableCell>
                  <TableCell className="text-center">
                    {renderBoolean(ticket.confeccion)}
                  </TableCell>
                  <TableCell className="text-center">
                    {renderBoolean(ticket.perforado)}
                  </TableCell>
                  <TableCell className="text-center">
                    {renderBoolean(ticket.ojillado)}
                  </TableCell>
                  <TableCell className="text-center">
                    {renderBoolean(ticket.empaquetado)}
                  </TableCell>
                  <TableCell className="text-center">
                    {renderBoolean(ticket.lista_para_recoleccion)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {ticket.recolectada_por || '---'}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500">
                    {ticket.fecha_entrega_paquete ? format(new Date(ticket.fecha_entrega_paquete), "dd/MM/yyyy", { locale: es }) : '---'}
                  </TableCell>
                  <TableCell className="text-[10px] text-gray-400">
                    {ticket.created_at ? format(new Date(ticket.created_at), "dd/MM HH:mm:ss", { locale: es }) : '---'}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={23} className="text-center py-20 text-gray-400 bg-gray-50">
                  <div className="flex flex-col items-center gap-2">
                    <Package className="h-12 w-12 opacity-10" />
                    <p className="text-lg">No hay tickets registrados hoy.</p>
                    <p className="text-sm">Comienza a escanear o ingresa códigos manualmente.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
