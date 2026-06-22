
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
import { Check, X, Clock, User, Package, Building2, Minus, Tag, ChevronsUpDown, Trash2, Copy, ChevronDown, ChevronUp, Scissors, Boxes, Truck, PencilLine, Plus, CheckCircle2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SewingTimeCaptureModal } from '@/components/SewingTimeCaptureModal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SewingTicketsTableProps {
  tickets: SewingTicket[];
  onUpdateTicket?: (id: number, updates: Partial<SewingTicket>) => Promise<void>;
  onDeleteTicket?: (id: number) => Promise<void>;
  onGenerateLabel?: (ticket: SewingTicket) => void;
  skuMetadata?: Record<string, { cat: string, time: number }>;
  isMuted?: boolean;
  prodStatusMap?: Record<string, string>;
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

export function SewingTicketsTable({ tickets, onUpdateTicket, onDeleteTicket, onGenerateLabel, skuMetadata, isMuted, prodStatusMap }: SewingTicketsTableProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});
  
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
  const [selectedTicketForTime, setSelectedTicketForTime] = useState<SewingTicket | null>(null);

  // Helper para fechas tipo DATE (sin hora, no requiere conversión UTC)
  const formatDateLocal = (dateStr: string | null | undefined, pattern: string = "dd/MM/yyyy") => {
    if (!dateStr) return '---';
    try {
      const parts = dateStr.split('-');
      if (parts.length !== 3) return dateStr;
      const [year, month, day] = parts.map(Number);
      const date = new Date(year, month - 1, day);
      return format(date, pattern, { locale: es });
    } catch (e) {
      return dateStr;
    }
  };

  // Helper para fechas tipo TIMESTAMPTZ (con hora UTC, requiere conversión a MX)
  const formatDateMX = (dateStr: string | null | undefined, pattern: string = "dd/MM/yyyy") => {
    if (!dateStr) return '---';
    try {
      // Asegurar que se interprete como UTC si no tiene offset
      const cleanDateStr = dateStr.includes('T') || dateStr.includes(' ') 
        ? (dateStr.endsWith('Z') || dateStr.includes('+') || dateStr.includes('-') ? dateStr : `${dateStr.replace(' ', 'T')}Z`)
        : dateStr;
        
      const date = new Date(cleanDateStr);
      if (isNaN(date.getTime())) return dateStr;
      
      const options: Intl.DateTimeFormatOptions = {
        timeZone: 'America/Mexico_City',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      };
      
      const mxDate = new Intl.DateTimeFormat('es-MX', options).format(date);
      
      if (pattern === "dd/MM/yy") {
          const parts = mxDate.split('/');
          return `${parts[0]}/${parts[1]}/${parts[2].slice(-2)}`;
      }
      
      return mxDate;
    } catch (e) {
      return dateStr;
    }
  };

  const skuCounts = useMemo(() => {
    return tickets.reduce((acc, ticket) => {
      if (ticket.sku) {
        acc[ticket.sku] = (acc[ticket.sku] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
  }, [tickets]);

  const handleCopy = (value: string | number | null, label: string) => {
    if (!value) return;
    navigator.clipboard.writeText(String(value));
    toast({
      title: `${label} Copiado`,
      description: `${value} se ha guardado en el portapapeles.`,
      duration: 2000,
    });
  };

  const toggleExpand = (id: number) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const openTimeModal = (ticket: SewingTicket) => {
    setSelectedTicketForTime(ticket);
    setIsTimeModalOpen(true);
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
        <span className="text-[10px] font-black uppercase break-all">
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
            className={cn("h-8 w-full justify-between text-left font-normal border-gray-200 bg-white px-2 overflow-hidden", className)}
          >
            <span className="truncate text-[10px] font-bold uppercase">{value || "PENDIENTE"}</span>
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

  if (isMobile) {
    return (
      <TooltipProvider>
        <div className={cn("space-y-4 px-2 pb-10 transition-all", isMuted && "opacity-90 grayscale-[0.2]")}>
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
                onTime={() => openTimeModal(ticket)}
                skuMetadata={skuMetadata}
                skuCounts={skuCounts}
                handleCopy={handleCopy}
                BooleanSelect={BooleanSelect}
                TriStateSelect={TriStateSelect}
                RecolectorSelector={RecolectorSelector}
                renderBoolean={renderBoolean}
                prodStatusMap={prodStatusMap}
                formatDateLocal={formatDateLocal}
                formatDateMX={formatDateMX}
              />
            ))
          ) : (
            <div className="text-center py-10 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
              <Package className="h-10 w-10 mx-auto mb-2 text-gray-300" />
              <p className="text-gray-400 font-bold">No hay registros que coincidan con los filtros.</p>
            </div>
          )}
        </div>
        
        {selectedTicketForTime && (
          <SewingTimeCaptureModal 
            isOpen={isTimeModalOpen}
            onOpenChange={setIsTimeModalOpen}
            sku={selectedTicketForTime.sku || 'S/N'}
            ticketId={selectedTicketForTime.id}
            defaultPieces={selectedTicketForTime.cantidad}
          />
        )}
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn("border rounded-b-lg overflow-x-auto bg-white shadow-sm transition-all", isMuted && "opacity-90 grayscale-[0.2]")}>
        <Table className="min-w-[2800px] table-fixed">
          <TableHeader className="bg-gray-50 sticky top-0 z-30">
            <TableRow>
              <TableHead className="w-[60px] text-center">Label</TableHead>
              <TableHead className="w-[80px] text-center">ID</TableHead>
              <TableHead className="w-[180px]">Alias Operativo</TableHead>
              <TableHead className="w-[180px]">Código de Barra</TableHead>
              <TableHead className="w-[250px]">Producto</TableHead>
              <TableHead className="w-[80px] text-center">Cant.</TableHead>
              <TableHead className="w-[90px] text-center">T. Est.</TableHead>
              <TableHead className="w-[200px]">SKU (Repetidos)</TableHead>
              <TableHead className="w-[150px]">Responsable Vaciado</TableHead>
              <TableHead className="w-[120px]">Hora Vaciado</TableHead>
              <TableHead className="w-[150px]">Cuenta / Org.</TableHead>
              <TableHead className="w-[150px]">No. Venta</TableHead>
              <TableHead className="w-[150px]">Pack ID</TableHead>
              <TableHead className="w-[100px] text-center">Impresa</TableHead>
              <TableHead className="w-[150px]">Resp. Impresión</TableHead>
              <TableHead className="w-[120px]">Fecha Impresión</TableHead>
              <TableHead className="w-[150px]">Asignada A</TableHead>
              <TableHead className="w-[100px] text-center">Cortada</TableHead>
              <TableHead className="w-[100px] text-center">Confección</TableHead>
              <TableHead className="w-[100px] text-center">Perforado</TableHead>
              <TableHead className="w-[100px] text-center">Ojillado</TableHead>
              <TableHead className="w-[110px] text-center">Empaquetado</TableHead>
              <TableHead className="w-[120px] text-center">Lista Recolecc.</TableHead>
              <TableHead className="w-[200px]">Recolectada Por</TableHead>
              <TableHead className="w-[120px]">Fecha Entrega</TableHead>
              <TableHead className="w-[150px]">Registro Sistema</TableHead>
              <TableHead className="w-[120px] text-center bg-gray-50 sticky right-0 z-40 shadow-[-2px_0_5px_rgba(0,0,0,0.05)] border-l">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.length > 0 ? (
              tickets.map((ticket) => {
                const prodStatus = prodStatusMap?.[ticket.codigo_barra];
                const isFinished = prodStatus === 'PPC' || prodStatus === 'ENTREGADO';
                
                return (
                  <TableRow 
                    key={ticket.id} 
                    className={cn(
                      "hover:bg-gray-50 transition-colors h-14",
                      isFinished && "bg-[#E6F7EC] hover:bg-[#DDF2E5] border-l-4 border-l-[#34A853]"
                    )}
                  >
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
                    <TableCell>
                      <AliasEditor ticket={ticket} />
                    </TableCell>
                    <TableCell className="font-mono font-bold text-starbucks-green truncate">
                      <div className="flex items-center gap-2">
                        {isFinished && <CheckCircle2 className="h-4 w-4 text-[#34A853] shrink-0" />}
                        {ticket.codigo_barra}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="text-xs font-semibold truncate cursor-help">
                            {ticket.nombre_producto || '---'}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[300px]">
                          <p>{ticket.nombre_producto || '---'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-center font-bold text-blue-600">
                      {ticket.cantidad !== null ? ticket.cantidad : '---'}
                    </TableCell>
                    <TableCell className="text-center font-bold text-amber-600 text-xs">
                      {skuMetadata && ticket.sku && skuMetadata[ticket.sku] ? `${skuMetadata[ticket.sku].time}m` : (ticket.esti_time ? `${ticket.esti_time}m` : '---')}
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div 
                            className="flex items-center gap-1 group cursor-pointer truncate"
                            onClick={() => ticket.sku && handleCopy(ticket.sku, "SKU")}
                          >
                            <span className="text-xs font-mono text-gray-600 group-hover:text-starbucks-green group-hover:underline transition-colors break-all">
                              {ticket.sku || '---'}
                            </span>
                            {ticket.sku && skuCounts[ticket.sku] > 1 && (
                              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold text-[9px] shrink-0">
                                (x{skuCounts[ticket.sku]})
                              </span>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{ticket.sku || '---'}</p>
                          <p className="text-[10px] text-gray-400 mt-1">Haz clic para copiar</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-xs truncate">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3 text-gray-400 shrink-0" />
                        <span className="truncate">{ticket.responsable_vaciado || '---'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-gray-600">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-gray-400 shrink-0" />
                        {ticket.hora_vaciado || '---'}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs uppercase text-gray-500 truncate">
                      <div className="flex items-center gap-1 truncate">
                        <Building2 className="h-3 w-3 text-gray-400 shrink-0" />
                        <span className="truncate">{ticket.cuenta || '---'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      <div 
                        className="flex items-center gap-1 group cursor-pointer"
                        onClick={() => ticket.sales_num && handleCopy(ticket.sales_num, "Venta")}
                      >
                        <span className="text-gray-600 group-hover:text-starbucks-green group-hover:underline transition-colors truncate">
                          {ticket.sales_num || '---'}
                        </span>
                        {ticket.sales_num && <Copy className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      <div 
                        className="flex items-center gap-1 group cursor-pointer"
                        onClick={() => ticket.pack_id && handleCopy(ticket.pack_id, "Pack ID")}
                      >
                        <span className="text-gray-600 group-hover:text-starbucks-green group-hover:underline transition-colors truncate">
                          {ticket.pack_id || '---'}
                        </span>
                        {ticket.pack_id && <Copy className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {renderBoolean(ticket.impresa)}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 truncate">
                      {ticket.responsable_impresion || '---'}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {formatDateMX(ticket.fecha_impresion)}
                    </TableCell>
                    <TableCell className="text-xs truncate">
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
                    <TableCell>
                      <RecolectorSelector 
                        value={ticket.recolectada_por} 
                        onChange={(val) => ticket.id && onUpdateTicket?.(ticket.id, { recolectada_por: val })}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {formatDateLocal(ticket.fecha_entrega_paquete)}
                    </TableCell>
                    <TableCell className="text-[10px] text-gray-400">
                      {ticket.created_at ? format(new Date(ticket.created_at), "dd/MM HH:mm:ss", { locale: es }) : '---'}
                    </TableCell>
                    <TableCell className={cn("text-center bg-white sticky right-0 z-40 shadow-[-2px_0_5px_rgba(0,0,0,0.05)] border-l", isFinished && "bg-[#E6F7EC]")}>
                      <div className="flex items-center justify-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-amber-600 hover:bg-amber-50"
                          onClick={() => openTimeModal(ticket)}
                        >
                          <Clock className="h-4 w-4" />
                        </Button>
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
                                Esta acción eliminará el ticket #{ticket.id}. No se puede deshacer.
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
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={27} className="text-center py-20 text-gray-400">
                  No hay tickets registrados que coincidan con los filtros.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      
      {selectedTicketForTime && (
        <SewingTimeCaptureModal 
          isOpen={isTimeModalOpen}
          onOpenChange={setIsTimeModalOpen}
          sku={selectedTicketForTime.sku || 'S/N'}
          ticketId={selectedTicketForTime.id}
          defaultPieces={selectedTicketForTime.cantidad}
        />
      )}
    </TooltipProvider>
  );
}

function CardItem({ 
  ticket, 
  expanded, 
  onToggle, 
  onUpdate, 
  onDelete, 
  onLabel,
  onTime,
  skuMetadata,
  skuCounts,
  handleCopy,
  BooleanSelect,
  TriStateSelect,
  RecolectorSelector,
  renderBoolean,
  prodStatusMap,
  formatDateLocal,
  formatDateMX
}: any) {
  const estTime = skuMetadata && ticket.sku && skuMetadata[ticket.sku] ? `${skuMetadata[ticket.sku].time}m` : (ticket.esti_time ? `${ticket.esti_time}m` : '---');
  const prodStatus = prodStatusMap?.[ticket.codigo_barra];
  const isFinished = prodStatus === 'PPC' || prodStatus === 'ENTREGADO';
  
  const [isEditingAlias, setIsEditingAlias] = useState(false);
  const [tempAlias, setTempAlias] = useState(ticket.alias || '');

  const handleAliasSave = async (e?: any) => {
    if (e) e.stopPropagation();
    if (tempAlias.trim() !== (ticket.alias || '')) {
      await onUpdate?.(ticket.id!, { alias: tempAlias.trim() || null });
    }
    setIsEditingAlias(false);
  };

  return (
    <div className={cn(
        "bg-white border-2 rounded-xl shadow-sm transition-all duration-300",
        expanded ? "border-starbucks-green ring-1 ring-starbucks-green/20" : "border-gray-100",
        isFinished && "bg-[#E6F7EC] border-[#A8E6B8]"
    )}>
      <div className="p-3 cursor-pointer" onClick={onToggle}>
        <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-gray-400">#{ticket.id}</span>
                <div 
                  className="flex items-center gap-1 bg-white/50 px-2 py-0.5 rounded border border-gray-200"
                  onClick={(e) => { e.stopPropagation(); handleCopy(ticket.sku, "SKU"); }}
                >
                    <span className="text-xs font-bold text-gray-700 font-mono break-all">{ticket.sku || 'N/A'}</span>
                    <Copy className="h-3 w-3 text-gray-400 shrink-0" />
                </div>
            </div>
            <div className="flex gap-1">
                {isFinished && <Badge className="h-5 bg-green-600 text-white text-[9px] px-1.5"><CheckCircle2 className="h-2 w-2 mr-1" /> OK</Badge>}
                {ticket.confeccion === true && <Badge className="h-5 bg-blue-100 text-blue-700 text-[9px] px-1.5"><Scissors className="h-2 w-2 mr-1" /> CONF</Badge>}
                {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </div>
        </div>

        <div className="space-y-1">
            <p className="text-[11px] font-bold text-starbucks-dark uppercase">{ticket.nombre_producto || 'NO MAPEADO'}</p>
            
            <div onClick={(e) => e.stopPropagation()} className="mt-1 flex flex-wrap gap-1 items-center">
               {isEditingAlias ? (
                 <Input 
                   autoFocus
                   value={tempAlias}
                   onChange={(e) => setTempAlias(e.target.value)}
                   onBlur={handleAliasSave}
                   onKeyDown={(e) => e.key === 'Enter' && handleAliasSave()}
                   className="h-7 text-[9px] font-black uppercase bg-white border-amber-300 w-full"
                   maxLength={50}
                   placeholder="ASIGNAR ALIAS..."
                 />
               ) : (
                 <Badge 
                   variant="secondary" 
                   onClick={() => { setTempAlias(ticket.alias || ''); setIsEditingAlias(true); }}
                   className={cn(
                     "h-5 text-[9px] font-black px-2 py-0 cursor-pointer transition-colors border-2",
                     ticket.alias 
                      ? "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100" 
                      : "bg-gray-50 text-gray-400 border-dashed border-gray-300 hover:bg-gray-100"
                   )}
                 >
                   {ticket.alias ? (
                     <>
                        <Tag className="h-2 w-2 mr-1" /> 
                        {ticket.alias.toUpperCase()}
                        <PencilLine className="h-2 w-2 ml-1 opacity-40" />
                     </>
                   ) : (
                     <>
                        <Plus className="h-2 w-2 mr-1" />
                        AÑADIR ALIAS
                     </>
                   )}
                 </Badge>
               )}
            </div>

            <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-3">
                    <span className="text-lg font-black text-blue-600">{ticket.cantidad || 0} <span className="text-[10px] font-bold text-gray-400">PZS</span></span>
                    <div className="h-4 w-[1px] bg-gray-200" />
                    <span className="text-xs font-bold text-amber-600 flex items-center gap-1"><Clock className="h-3 w-3" /> {estTime}</span>
                </div>
                <div className="text-right">
                    <p className="text-[9px] font-bold text-gray-400 uppercase">Entrega:</p>
                    <p className="text-[10px] font-black text-starbucks-green">
                        {formatDateLocal(ticket.fecha_entrega_paquete, "dd/MM/yy")}
                    </p>
                </div>
            </div>
        </div>
      </div>

      <Collapsible open={expanded} onOpenChange={onToggle}>
        <CollapsibleContent className="border-t border-gray-100 bg-gray-50/50 rounded-b-xl overflow-hidden animate-in slide-in-from-top-2 duration-300">
            <div className="p-4 space-y-6">
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
                        <div className="col-span-2 grid grid-cols-2 gap-2">
                           <div onClick={(e) => { e.stopPropagation(); handleCopy(ticket.sales_num, "Venta"); }} className="p-2 bg-white rounded border cursor-pointer hover:border-starbucks-green transition-colors">
                              <p className="text-[8px] font-bold text-gray-400 uppercase">Venta</p>
                              <p className="text-[10px] font-mono font-bold flex items-center justify-between">
                                {ticket.sales_num || '---'}
                                {ticket.sales_num && <Copy className="h-3 w-3 text-gray-300 shrink-0" />}
                              </p>
                           </div>
                           <div onClick={(e) => { e.stopPropagation(); handleCopy(ticket.pack_id, "Pack ID"); }} className="p-2 bg-white rounded border cursor-pointer hover:border-starbucks-green transition-colors">
                              <p className="text-[8px] font-bold text-gray-400 uppercase">Pack ID</p>
                              <p className="text-[10px] font-mono font-bold flex items-center justify-between">
                                {ticket.pack_id || '---'}
                                {ticket.pack_id && <Copy className="h-3 w-3 text-gray-300 shrink-0" />}
                              </p>
                           </div>
                        </div>
                    </div>
                </div>

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
                            <Label className="text-[9px] font-bold text-gray-400 uppercase">Lista Recolecc.</Label>
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
                                    <p className="text-[9px] font-bold text-gray-400">FECHA: {formatDateMX(ticket.fecha_impresion, "dd/MM/yy")}</p>
                                </div>
                             </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-4 border-t border-gray-200">
                    <Button 
                        className="bg-starbucks-green hover:bg-starbucks-dark text-white font-bold h-11 gap-2"
                        onClick={(e) => { e.stopPropagation(); onLabel?.(ticket); }}
                    >
                        <Tag className="h-4 w-4" /> ETIQUETA
                    </Button>
                    <Button 
                        className="bg-amber-600 hover:bg-amber-700 text-white font-bold h-11 gap-2"
                        onClick={(e) => { e.stopPropagation(); onTime?.(); }}
                    >
                        <Clock className="h-4 w-4" /> TIEMPO
                    </Button>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline" className="col-span-2 border-red-200 text-red-600 hover:bg-red-50 font-bold h-11 gap-2">
                                <Trash2 className="h-4 w-4" /> BORRAR REGISTRO
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
