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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Check, X, Clock, User, Package, Building2, Minus, Tag, ChevronsUpDown, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SewingTicketsTableProps {
  tickets: SewingTicket[];
  onUpdateTicket?: (id: number, updates: Partial<SewingTicket>) => Promise<void>;
  onDeleteTicket?: (id: number) => Promise<void>;
  onGenerateLabel?: (ticket: SewingTicket) => void;
  skuMetadata?: Record<string, { cat: string, time: number }>;
}

const RECOLECTORES_OPTIONS = [
  "JIMBO",
  "ESTEBAN",
  "ALFONSO",
  "RAFA",
  "MARVIN",
  "CORY",
  "SEBAS PERÚ",
  "GENA",
  "NORMAN",
  "COLECTA EN LAVADO",
  "COLECTA VIRGINIA FÁBREGAS",
  "PENDIENTE",
  "DUPLICADOS NO SE DESPACHAN",
  "N/A"
];

export function SewingTicketsTable({ tickets, onUpdateTicket, onDeleteTicket, onGenerateLabel, skuMetadata }: SewingTicketsTableProps) {
  
  const skuCounts = useMemo(() => {
    return tickets.reduce((acc, ticket) => {
      if (ticket.sku) {
        acc[ticket.sku] = (acc[ticket.sku] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
  }, [tickets]);

  const renderBoolean = (val: boolean | null) => {
    if (val === true) return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200"><Check className="h-3 w-3 mr-1" /> SÍ</Badge>;
    if (val === false) return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><X className="h-3 w-3 mr-1" /> NO</Badge>;
    return <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-200"><Minus className="h-3 w-3 mr-1" /> N/A</Badge>;
  };

  const BooleanSelect = ({ 
    value, 
    onValueChange 
  }: { 
    value: boolean | null, 
    onValueChange: (val: boolean) => void 
  }) => {
    return (
      <Select 
        value={value === true ? "si" : "no"} 
        onValueChange={(val) => onValueChange(val === "si")}
      >
        <SelectTrigger className="h-8 w-20 text-xs font-bold border-gray-200 bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="si" className="text-xs font-bold text-green-700">SÍ</SelectItem>
          <SelectItem value="no" className="text-xs font-bold text-red-700">NO</SelectItem>
        </SelectContent>
      </Select>
    );
  };

  const TriStateSelect = ({ 
    value, 
    onValueChange 
  }: { 
    value: boolean | null, 
    onValueChange: (val: boolean | null) => void 
  }) => {
    const stringValue = value === true ? "si" : value === false ? "no" : "na";
    
    return (
      <Select 
        value={stringValue} 
        onValueChange={(val) => {
          if (val === "si") onValueChange(true);
          else if (val === "no") onValueChange(false);
          else onValueChange(null);
        }}
      >
        <SelectTrigger className="h-8 w-20 text-xs font-bold border-gray-200 bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="si" className="text-xs font-bold text-green-700">SÍ</SelectItem>
          <SelectItem value="no" className="text-xs font-bold text-red-700">NO</SelectItem>
          <SelectItem value="na" className="text-xs font-bold text-gray-500">N/A</SelectItem>
        </SelectContent>
      </Select>
    );
  };

  const RecolectorSelector = ({ 
    value, 
    onChange 
  }: { 
    value: string | null, 
    onChange: (val: string) => void 
  }) => {
    const [open, setOpen] = useState(false);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-8 w-full justify-between text-[10px] font-bold border-gray-200 bg-white uppercase px-2 overflow-hidden"
          >
            <span className="truncate">{value || "PENDIENTE"}</span>
            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-0 z-50">
          <Command>
            <CommandInput placeholder="Buscar recolector..." className="h-8 text-xs" />
            <CommandList className="max-h-[300px]">
              <CommandEmpty className="py-2 text-[10px] text-center">No se encontró.</CommandEmpty>
              <CommandGroup>
                {RECOLECTORES_OPTIONS.map((opt) => (
                  <CommandItem
                    key={opt}
                    value={opt}
                    onSelect={(currentValue) => {
                      onChange(currentValue.toUpperCase());
                      setOpen(false);
                    }}
                    className="text-[10px] font-bold uppercase"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-3 w-3",
                        value === opt ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {opt}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <div className="border rounded-b-lg overflow-hidden bg-white shadow-sm">
      <div className="max-h-[600px] overflow-auto">
        <Table className="min-w-[2200px]">
          <TableHeader className="bg-gray-50 sticky top-0 z-30">
            <TableRow>
              <TableHead className="w-[60px] text-center bg-gray-50">Label</TableHead>
              <TableHead className="w-[80px] text-center">ID</TableHead>
              <TableHead className="w-[180px] bg-gray-50">Código de Barra</TableHead>
              <TableHead className="w-[150px]">Producto</TableHead>
              <TableHead className="w-[100px] text-center">Cant.</TableHead>
              <TableHead className="w-[100px] text-center">T. Est.</TableHead>
              <TableHead className="w-[180px]">SKU (Repetidos)</TableHead>
              <TableHead className="w-[150px]">Responsable Vaciado</TableHead>
              <TableHead className="w-[120px]">Hora Vaciado</TableHead>
              <TableHead className="w-[150px]">Cuenta / Org.</TableHead>
              <TableHead className="w-[120px]">No. Venta</TableHead>
              <TableHead className="w-[120px]">Pack ID</TableHead>
              <TableHead className="w-[120px] text-center">Impresa</TableHead>
              <TableHead className="w-[150px]">Resp. Impresión</TableHead>
              <TableHead className="w-[120px]">Fecha Impresión</TableHead>
              <TableHead className="w-[150px]">Asignada A</TableHead>
              <TableHead className="w-[120px] text-center">Cortada</TableHead>
              <TableHead className="w-[120px] text-center">Confección</TableHead>
              <TableHead className="w-[120px] text-center">Perforado</TableHead>
              <TableHead className="w-[120px] text-center">Ojillado</TableHead>
              <TableHead className="w-[120px] text-center">Empaquetado</TableHead>
              <TableHead className="w-[120px] text-center">Lista Recolecc.</TableHead>
              <TableHead className="w-[220px]">Recolectada Por</TableHead>
              <TableHead className="w-[150px]">Fecha Entrega</TableHead>
              <TableHead className="w-[150px]">Registro Sistema</TableHead>
              <TableHead className="w-[100px] text-center bg-gray-50 sticky right-0 z-40 shadow-[-2px_0_5px_rgba(0,0,0,0.05)] border-l">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.length > 0 ? (
              tickets.map((ticket) => (
                <TableRow key={ticket.id} className="hover:bg-gray-50 transition-colors h-12">
                  <TableCell className="text-center">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-starbucks-green hover:bg-green-50"
                      onClick={() => onGenerateLabel?.(ticket)}
                    >
                      <Tag className="h-4 w-4" />
                    </Button>
                  </TableCell>
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
                  <TableCell className="text-center font-bold text-amber-600 text-xs">
                    {skuMetadata && ticket.sku && skuMetadata[ticket.sku] ? `${skuMetadata[ticket.sku].time}m` : (ticket.esti_time ? `${ticket.esti_time}m` : '---')}
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    <span className="text-gray-600">{ticket.sku || '---'}</span>
                    {ticket.sku && skuCounts[ticket.sku] > 1 && (
                      <span className="ml-2 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px]">
                        (x{skuCounts[ticket.sku]})
                      </span>
                    )}
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
                    <BooleanSelect 
                      value={ticket.cortada} 
                      onValueChange={(val) => ticket.id && onUpdateTicket?.(ticket.id, { cortada: val })} 
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <TriStateSelect 
                      value={ticket.confeccion} 
                      onValueChange={(val) => ticket.id && onUpdateTicket?.(ticket.id, { confeccion: val })} 
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <TriStateSelect 
                      value={ticket.perforado} 
                      onValueChange={(val) => ticket.id && onUpdateTicket?.(ticket.id, { perforado: val })} 
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <TriStateSelect 
                      value={ticket.ojillado} 
                      onValueChange={(val) => ticket.id && onUpdateTicket?.(ticket.id, { ojillado: val })} 
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <BooleanSelect 
                      value={ticket.empaquetado} 
                      onValueChange={(val) => ticket.id && onUpdateTicket?.(ticket.id, { empaquetado: val })} 
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <BooleanSelect 
                      value={ticket.lista_para_recoleccion} 
                      onValueChange={(val) => ticket.id && onUpdateTicket?.(ticket.id, { lista_para_recoleccion: val })} 
                    />
                  </TableCell>
                  <TableCell className="text-xs">
                    <RecolectorSelector 
                      value={ticket.recolectada_por} 
                      onChange={(val) => ticket.id && onUpdateTicket?.(ticket.id, { recolectada_por: val })}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-gray-500">
                    {ticket.fecha_entrega_paquete ? format(new Date(ticket.fecha_entrega_paquete), "dd/MM/yyyy", { locale: es }) : '---'}
                  </TableCell>
                  <TableCell className="text-[10px] text-gray-400">
                    {ticket.created_at ? format(new Date(ticket.created_at), "dd/MM HH:mm:ss", { locale: es }) : '---'}
                  </TableCell>
                  <TableCell className="text-center bg-white sticky right-0 z-40 shadow-[-2px_0_5px_rgba(0,0,0,0.05)] border-l">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción eliminará permanentemente el ticket #{ticket.id} de la bitácora de costura. Esta operación no se puede deshacer.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => ticket.id && onDeleteTicket?.(ticket.id)}
                            className="bg-red-600 hover:bg-red-700 text-white"
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={26} className="text-center py-20 text-gray-400 bg-gray-50">
                  <div className="flex flex-col items-center gap-2">
                    <Package className="h-12 w-12 opacity-10" />
                    <p className="text-lg">No hay tickets en este bloque.</p>
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
