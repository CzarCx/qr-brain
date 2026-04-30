
'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { SewingTicket } from '@/types/sewing';
import { useToast } from '@/hooks/use-toast';

/**
 * Hook personalizado para gestionar la lógica de negocio de los tickets de costura.
 */
export function useSewingTickets() {
  const [tickets, setTickets] = useState<SewingTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sewing_tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setTickets(data || []);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al cargar tickets',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const createTicket = async (barcode: string) => {
    if (!barcode.trim()) return;

    setLoading(true);
    try {
      // Estructura requerida: Solo llenar codigo_barra, el resto null.
      const newTicket: SewingTicket = {
        codigo_barra: barcode,
        fecha_impresion: null,
        hora_vaciado: null,
        responsable_vaciado: null,
        cuenta: null,
        fecha_entrega_paquete: null,
        id_venta: null,
        nombre_producto: null,
        cantidad: null,
        tipo: null,
        responsable_impresion: null,
        impresa: null,
        asignada_a: null,
        cortada: null,
        confeccion: null,
        perforado: null,
        ojillado: null,
        empaquetado: null,
        lista_para_recoleccion: null,
        recolectada_por: null
      };

      const { error } = await supabase
        .from('sewing_tickets')
        .insert([newTicket]);

      if (error) throw error;

      toast({
        variant: 'success',
        title: 'Ticket registrado',
        description: `Código ${barcode} guardado automáticamente.`,
      });

      // Refrescar lista
      await fetchTickets();
      return true;
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al registrar ticket',
        description: error.message,
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    tickets,
    loading,
    fetchTickets,
    createTicket,
  };
}
