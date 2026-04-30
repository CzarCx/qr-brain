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
      console.error('Error fetching tickets:', error);
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
    if (!barcode || !barcode.trim()) return false;

    setLoading(true);
    try {
      // Estructura requerida por el esquema sewing_tickets: Solo llenar codigo_barra.
      // El resto se inicializa en NULL por defecto según el requerimiento.
      const newTicket = {
        codigo_barra: barcode.trim(),
        // Los timestamps created_at y updated_at son automáticos (DB Default)
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

      // Refrescar lista para ver el nuevo registro
      await fetchTickets();
      return true;
    } catch (error: any) {
      console.error('Error creating ticket:', error);
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
