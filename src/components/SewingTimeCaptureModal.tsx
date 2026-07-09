'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SewingProcessName, SewingProcessTime } from '@/types/sewing';
import { useSewingProduction } from '@/hooks/use-sewing-production';
import { Loader2, Clock, User, Package, MessageSquare } from 'lucide-react';

const PROCESSES: SewingProcessName[] = [
  'CORTE',
  'COSTURA',
  'OJILLADO',
  'DOBLADO',
  'ETIQUETADO',
  'VERIFICACION',
  'EMPAQUE'
];

interface SewingTimeCaptureModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sku: string;
  ticketId?: number | null;
  defaultPieces?: number | null;
  onSuccess?: () => void;
}

export function SewingTimeCaptureModal({
  isOpen,
  onOpenChange,
  sku,
  ticketId,
  defaultPieces,
  onSuccess
}: SewingTimeCaptureModalProps) {
  const { saveProcessTime, loading } = useSewingProduction();
  const [process, setProcess] = useState<SewingProcessName | ''>('');
  const [minutes, setMinutes] = useState<string>('');
  const [pieces, setPieces] = useState<string>(defaultPieces?.toString() || '1');
  const [operator, setOperator] = useState<string>('');
  const [observations, setObservations] = useState<string>('');

  const handleSave = async () => {
    if (!process || !minutes || !pieces || !operator) return;

    const success = await saveProcessTime({
      sku,
      ticket_id: ticketId,
      process_name: process as SewingProcessName,
      time_minutes: parseFloat(minutes),
      quantity_pieces: parseInt(pieces),
      operator_name: operator.toUpperCase(),
      observations: observations.trim() || null
    });

    if (success) {
      setProcess('');
      setMinutes('');
      setObservations('');
      onOpenChange(false);
      onSuccess?.();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-starbucks-green">
            <Clock className="h-5 w-5" />
            Registrar Tiempo de Producción
          </DialogTitle>
          <DialogDescription>
            Registra los tiempos reales para el SKU: <span className="font-bold text-black">{sku}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-500">Subproceso</Label>
              <Select value={process} onValueChange={(v) => setProcess(v as SewingProcessName)}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {PROCESSES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-500">Operador</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input 
                  value={operator} 
                  onChange={(e) => setOperator(e.target.value)} 
                  placeholder="NOMBRE..." 
                  className="pl-9 h-11 uppercase font-bold"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-500">Tiempo (Minutos)</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input 
                  type="number" 
                  value={minutes} 
                  onChange={(e) => setMinutes(e.target.value)} 
                  placeholder="0.0" 
                  className="pl-9 h-11 font-mono font-bold"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-500">Piezas Realizadas</Label>
              <div className="relative">
                <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input 
                  type="number" 
                  value={pieces} 
                  onChange={(e) => setPieces(e.target.value)} 
                  placeholder="1" 
                  className="pl-9 h-11 font-bold"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-gray-500">Observaciones (Opcional)</Label>
            <div className="relative">
              <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Textarea 
                value={observations} 
                onChange={(e) => setObservations(e.target.value)} 
                placeholder="Cualquier inconveniente o detalle..." 
                className="pl-9 min-h-[80px]"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11">Cancelar</Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || !process || !minutes || !pieces || !operator}
            className="bg-starbucks-green hover:bg-starbucks-dark h-11 px-8 font-black"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            GUARDAR REGISTRO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
