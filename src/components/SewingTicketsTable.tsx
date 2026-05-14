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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Check, X, Clock, User, Package, Building2, Minus, Tag, ChevronsUpDown, Trash2, Copy, ChevronDown, ChevronUp, LayoutGrid, List as ListIcon, Scissors, Boxes, Settings2, Truck, PencilLine } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (isMobile) {
      setViewMode('cards');
    } else {
      setViewMode('table');
    }
  }, [isMobile]);
  
  const skuCounts = useMemo(() => {
    return tickets.reduce((acc, ticket) => {
      if (ticket.sku) {
        acc[ticket.sku] = (acc[ticket.sku] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
  }, [tickets]);

  const handleCopySKU = (sku: string) => {
    if (!sku) return;
    navigator.clipboard.writeText(sku);
    toast({
      title: "SKU Copiado",
      description: `${sku} se ha guardado en el portapapeles.`,
      duration: 2000,
    });
  };

  const toggleExpand = (id: number) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const renderBoolean = (val: boolean | null) => {
    if (val === true) return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200"><Check className="h-3 w-3 mr-1" /> SÍ</Badge>;
    if (val === false) return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><X className="h-3 w-3 mr-1" /> NO</Badge>;
    return <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-200"><Minus className="h-3 w-3 mr-1" /> N/A</Badge>;
  };

  const AliasEditor = ({ ticket }: { ticket: SewingTicket }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [tempAlias, setTempAlias] = useState(ticket.alias || '');

    const handleSave = async () => {
      if (tempAlias.trim() !== (ticket.alias || '')) {
        await onUpdateTicket?.(ticket.id!, { alias: tempAlias.trim() || null });
      }
      setIsEditing(false);
    };

    if (isEditing) {
      return (
        <Input 
          autoFocus
          value={tempAlias}
          onChange={(e) => setTempAlias(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          className="h-8 text-[10px] font-black uppercase"
          maxLength={50}
        />
      );
    }

    return (
      <div 
        onClick={() => setIsEditing(true)}
        className={cn(
          "flex items-center gap-2 group cursor-pointer h-8 px-2 rounded hover:bg-gray-100 transition-colors",
          !ticket.alias && "text-gray-300 italic"
        )}
      >
        <span className="text-[10px] font-black uppercase truncate max-w-[120px]">
          {ticket.alias || "Sin alias"}
        </span>
        <PencilLine className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    );
  };

  const BooleanSelect = ({ 
    value, 
    onValueChange,
    className
  }: { 
    value: boolean | null, 
    onValueChange: (val: boolean) => void,
    className?: string
  }) => {
    return (
      <Select 
        value={value === true ? "si" : "no"} 
        onValueChange={(val) => onValueChange(val === "si")}
      >
        <SelectTrigger className={cn("h-8 w-20 text-xs font-bold border-gray-200 bg-white", className)}>
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
    onValueChange,
    className
  }: { 
    value: boolean | null, 
    onValueChange: (val: boolean | null) => void,
    className?: string
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
        <SelectTrigger className={cn("h-8 w-20 text-xs font-bold border-gray-200 bg-white", className)}>
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
    onChange,
    className
  }: { 
    value: string | null, 
    onChange: (val: string) => void,
    className?: string
  }) => {
    const [open, setOpen] = useState(false);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("h-8 w-full justify-between text-[10px] font-bold border-gray-200 bg-white uppercase px-2 overflow-hidden", className)}
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

  if (viewMode === 'cards' && isMobile) {
    return (
      <div className="space-y-4 px-2 pb-10">
        <div className="flex justify-end mb-2">
            <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                <Button 
                    variant={viewMode === 'cards' ? 'default' : 'ghost'} 
                    size="sm" 
                    className="h-8 text-[10px] font-bold gap-1"
                    onClick={() => setViewMode('cards')}
                >
                    <LayoutGrid className="h-3 w-3" /> CARDS
                </Button>
                <Button 
                    variant={viewMode === 'table' ? 'default' : 'ghost'} 
                    size="sm" 
                    className="h-8 text-[10px] font-bold gap-1"
                    onClick={() => setViewMode('table')}
                >
                    <ListIcon className="h-3 w-3" /> TABLA
                </Button>
            </div>
        </div>

        {tickets.length > 0 ? (
          tickets.map((ticket) => (
            <CardItem 
              key={ticket.id} 
              ticket={ticket} 
              expanded={!!expandedCards[ticket.id!]}
              onToggle={() => toggleExpand(ticket.id!)}
              onUpdate={onUpdateTicket}
              onDelete={onDeleteTicket}
              onLabel={onGenerateLabel}
              skuMetadata={skuMetadata}
              skuCounts={skuCounts}
              handleCopySKU={handleCopySKU}
              BooleanSelect={BooleanSelect}
              TriStateSelect={TriStateSelect}
              RecolectorSelector={RecolectorSelector}
              renderBoolean={renderBoolean}
            />
          ))
        ) : (
          <div className="text-center py-10 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
            <Package className="h-10 w-10 mx-auto mb-2 text-gray-300" />
            <p className="text-gray-400 font-bold">No hay registros.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border rounded-b-lg overflow-hidden bg-white shadow-sm">
      {isMobile && (
        <div className="flex justify-end p-2 bg-gray-50 border-b">
            <div className="flex bg-gray-200 p-1 rounded-lg">
                <Button 
                    variant={viewMode === 'cards' ? 'default' : 'ghost'} 
                    size="sm" 
                    className="h-7 text-[9px] font-bold gap-1"
                    onClick={() => setViewMode('cards')}
                >
                    <LayoutGrid className="h-3 w-3" /> CARDS
                </Button>
                <Button 
                    variant={viewMode === 'table' ? 'default' : 'ghost'} 
                    size="sm" 
                    className="h-7 text-[9px] font-bold gap-1"
                    onClick={() => setViewMode('table')}
                >
                    <ListIcon className="h-3 w-3" /> TABLA
                </Button>
            </div>
        </div>
      )}
      <div className="max-h-[600px] overflow-auto">
        <Table className="min-w-[2400px]">
          <TableHeader className="bg-gray-50 sticky top-0 z-30">
            <TableRow>
              <TableHead className="w-[60px] text-center bg-gray-50">Label</TableHead>
              <TableHead className="w-[80px] text-center">ID</TableHead>
              <TableHead className="w-[180px] bg-gray-50">Alias Operativo</TableHead>
              <TableHead className="w-[180px]">Código de Barra</TableHead>
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
                  <TableCell className="bg-gray-50/30">
                    <AliasEditor ticket={ticket} />
                  </TableCell>
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
                    <div 
                      className="flex items-center gap-1 group cursor-pointer"
                      onClick={() => ticket.sku && handleCopySKU(ticket.sku)}
                      title="Haz clic para copiar SKU"
                    >
                      <span className="text-gray-600 group-hover:text-starbucks-green group-hover:underline transition-colors">
                        {ticket.sku || '---'}
                      </span>
                      {ticket.sku && (
                        <Copy className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                      {ticket.sku && skuCounts[ticket.sku] > 1 && (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px]">
                          (x{skuCounts[ticket.sku]})
                        </span>
                      )}
                    </div>
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
                <TableCell colSpan={27} className="text-center py-20 text-gray-400 bg-gray-50">
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

function CardItem({ 
  ticket, 
  expanded, 
  onToggle, 
  onUpdate, 
  onDelete, 
  onLabel,
  skuMetadata,
  skuCounts,
  handleCopySKU,
  BooleanSelect,
  TriStateSelect,
  RecolectorSelector,
  renderBoolean
}: any) {
  const estTime = skuMetadata && ticket.sku && skuMetadata[ticket.sku] ? `${skuMetadata[ticket.sku].time}m` : (ticket.esti_time ? `${ticket.esti_time}m` : '---');

  return (
    <div className={cn(
        "bg-white border-2 rounded-xl shadow-sm transition-all duration-300",
        expanded ? "border-starbucks-green ring-1 ring-starbucks-green/20" : "border-gray-100 hover:border-gray-200"
    )}>
      <div className="p-3 cursor-pointer" onClick={onToggle}>
        <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-gray-400">#{ticket.id}</span>
                <div 
                  className="flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded border border-gray-200"
                  onClick={(e) => { e.stopPropagation(); handleCopySKU(ticket.sku); }}
                >
                    <span className="text-xs font-bold text-gray-700 font-mono break-all">{ticket.sku || 'N/A'}</span>
                    <Copy className="h-3 w-3 text-gray-400" />
                </div>
            </div>
            <div className="flex gap-1">
                {ticket.confeccion === true && <Badge className="h-5 bg-blue-100 text-blue-700 text-[9px] px-1.5"><Scissors className="h-2 w-2 mr-1" /> CONF</Badge>}
                {ticket.empaquetado === true && <Badge className="h-5 bg-green-100 text-green-700 text-[9px] px-1.5"><Check className="h-2 w-2 mr-1" /> EMP</Badge>}
                {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </div>
        </div>

        <div className="space-y-1">
            <p className="text-[11px] font-bold text-starbucks-dark uppercase">{ticket.nombre_producto || 'NO MAPEADO'}</p>
            {ticket.alias && (
              <Badge variant="secondary" className="bg-amber-50 text-amber-800 text-[9px] font-black px-2 py-0">
                <Tag className="h-2 w-2 mr-1" /> {ticket.alias.toUpperCase()}
              </Badge>
            )}
            <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-3">
                    <span className="text-lg font-black text-blue-600">{ticket.cantidad || 0} <span className="text-[10px] font-bold text-gray-400">PZS</span></span>
                    <div className="h-4 w-[1px] bg-gray-200" />
                    <span className="text-xs font-bold text-amber-600 flex items-center gap-1"><Clock className="h-3 w-3" /> {estTime}</span>
                </div>
                <div className="text-right">
                    <p className="text-[9px] font-bold text-gray-400 uppercase">Entrega:</p>
                    <p className="text-[10px] font-black text-starbucks-green">
                        {ticket.fecha_entrega_paquete ? format(new Date(ticket.fecha_entrega_paquete), "dd/MM/yy", { locale: es }) : '---'}
                    </p>
                </div>
            </div>
        </div>
      </div>

      <Collapsible open={expanded} onOpenChange={onToggle}>
        <CollapsibleContent className="border-t border-gray-100 bg-gray-50/50 rounded-b-xl overflow-hidden animate-in slide-in-from-top-2 duration-300">
            <div className="p-4 space-y-6">
                {/* Seccion 0: Identificación Operativa */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-amber-600 border-b border-amber-100 pb-1">
                        <Tag className="h-3.5 w-3.5" />
                        <h4 className="text-[10px] font-black uppercase tracking-wider">Identificación Operativa</h4>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[9px] font-bold text-gray-400 uppercase">Alias del Ticket</Label>
                        <div className="flex gap-2">
                            <Input 
                                placeholder="Ej. Mesa negra, Costco..."
                                defaultValue={ticket.alias || ''}
                                onBlur={(e) => onUpdate?.(ticket.id, { alias: e.target.value.trim() || null })}
                                className="h-10 text-xs font-black uppercase bg-white"
                                maxLength={50}
                            />
                        </div>
                    </div>
                </div>

                {/* Seccion 1: Producción */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-blue-800 border-b border-blue-100 pb-1">
                        <Boxes className="h-3.5 w-3.5" />
                        <h4 className="text-[10px] font-black uppercase tracking-wider">Producción y Vaciado</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">Resp. Vaciado</p>
                            <p className="text-xs font-bold flex items-center gap-1"><User className="h-3 w-3" /> {ticket.responsable_vaciado || '---'}</p>
                        </div>
                        <div>
                            <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">Hora Vaciado</p>
                            <p className="text-xs font-bold flex items-center gap-1"><Clock className="h-3 w-3" /> {ticket.hora_vaciado || '---'}</p>
                        </div>
                        <div className="col-span-2">
                            <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">Cuenta / Empresa</p>
                            <p className="text-xs font-bold flex items-center gap-1 uppercase"><Building2 className="h-3 w-3" /> {ticket.cuenta || '---'}</p>
                        </div>
                    </div>
                </div>

                {/* Seccion 2: Corte y Costura */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-amber-800 border-b border-amber-100 pb-1">
                        <Scissors className="h-3.5 w-3.5" />
                        <h4 className="text-[10px] font-black uppercase tracking-wider">Corte y Confección</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-y-3 gap-x-2">
                        <div className="flex flex-col gap-1">
                            <Label className="text-[9px] font-bold text-gray-400 uppercase">Cortada</Label>
                            <BooleanSelect 
                                value={ticket.cortada} 
                                onValueChange={(val: any) => onUpdate?.(ticket.id, { cortada: val })} 
                                className="w-full h-9"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <Label className="text-[9px] font-bold text-gray-400 uppercase">Confección</Label>
                            <TriStateSelect 
                                value={ticket.confeccion} 
                                onValueChange={(val: any) => onUpdate?.(ticket.id, { confeccion: val })} 
                                className="w-full h-9"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <Label className="text-[9px] font-bold text-gray-400 uppercase">Perforado</Label>
                            <TriStateSelect 
                                value={ticket.perforado} 
                                onValueChange={(val: any) => onUpdate?.(ticket.id, { perforado: val })} 
                                className="w-full h-9"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <Label className="text-[9px] font-bold text-gray-400 uppercase">Ojillado</Label>
                            <TriStateSelect 
                                value={ticket.ojillado} 
                                onValueChange={(val: any) => onUpdate?.(ticket.id, { ojillado: val })} 
                                className="w-full h-9"
                            />
                        </div>
                    </div>
                </div>

                {/* Seccion 3: Control y Logística */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-starbucks-green border-b border-green-100 pb-1">
                        <Truck className="h-3.5 w-3.5" />
                        <h4 className="text-[10px] font-black uppercase tracking-wider">Control y Logística</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-y-3 gap-x-2">
                        <div className="flex flex-col gap-1">
                            <Label className="text-[9px] font-bold text-gray-400 uppercase">Empaquetado</Label>
                            <BooleanSelect 
                                value={ticket.empaquetado} 
                                onValueChange={(val: any) => onUpdate?.(ticket.id, { empaquetado: val })} 
                                className="w-full h-9"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <Label className="text-[9px] font-bold text-gray-400 uppercase">Lista Recolect.</Label>
                            <BooleanSelect 
                                value={ticket.lista_para_recoleccion} 
                                onValueChange={(val: any) => onUpdate?.(ticket.id, { lista_para_recoleccion: val })} 
                                className="w-full h-9"
                            />
                        </div>
                        <div className="col-span-2 flex flex-col gap-1">
                            <Label className="text-[9px] font-bold text-gray-400 uppercase">Recolectada Por</Label>
                            <RecolectorSelector 
                                value={ticket.recolectada_por} 
                                onChange={(val: any) => onUpdate?.(ticket.id, { recolectada_por: val })}
                                className="h-10 text-xs"
                            />
                        </div>
                        <div className="col-span-2 bg-white p-2 rounded border border-gray-200">
                             <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Estado Impresión</p>
                             <div className="flex justify-between items-center">
                                {renderBoolean(ticket.impresa)}
                                <div className="text-right">
                                    <p className="text-[9px] font-bold text-gray-400">RESP: {ticket.responsable_impresion || '---'}</p>
                                    <p className="text-[9px] font-bold text-gray-400">FECHA: {ticket.fecha_impresion ? format(new Date(ticket.fecha_impresion), "dd/MM/yy", { locale: es }) : '---'}</p>
                                </div>
                             </div>
                        </div>
                    </div>
                </div>

                {/* Acciones */}
                <div className="flex gap-2 pt-4 border-t border-gray-200">
                    <Button 
                        className="flex-1 bg-starbucks-green hover:bg-starbucks-dark text-white font-bold h-11 gap-2"
                        onClick={() => onLabel?.(ticket)}
                    >
                        <Tag className="h-4 w-4" /> ETIQUETA
                    </Button>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline" className="flex-1 border-red-200 text-red-600 hover:bg-red-50 font-bold h-11 gap-2">
                                <Trash2 className="h-4 w-4" /> BORRAR
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="w-[90vw] rounded-xl">
                            <AlertDialogHeader>
                                <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
                                <AlertDialogDescription>Esta acción no se puede deshacer. Se borrará el ticket #{ticket.id}.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex flex-col gap-2">
                                <AlertDialogCancel className="w-full">Cancelar</AlertDialogCancel>
                                <AlertDialogAction 
                                    onClick={() => onDelete?.(ticket.id)}
                                    className="bg-red-600 hover:bg-red-700 text-white w-full"
                                >
                                    Eliminar
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
                
                <div className="text-center">
                    <p className="text-[8px] font-bold text-gray-300 uppercase italic tracking-widest">
                        Registro: {ticket.created_at ? format(new Date(ticket.created_at), "dd/MM/yy HH:mm:ss", { locale: es }) : '---'}
                    </p>
                </div>
            </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
