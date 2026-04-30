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

      if (error) {
        // Mejoramos el log del error para identificar si es RLS, tabla inexistente, etc.
        console.error('Error de Supabase al cargar tickets:', error.message, error.details, error.hint);
        throw error;
      }
      setTickets(data || []);
    } catch (error: any) {
      console.error('Excepción al cargar tickets:', error?.message || error);
      toast({
        variant: 'destructive',
        title: 'Error al cargar tickets',
        description: error.message || 'No se pudo conectar con la base de datos.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const createTicket = async (barcode: string) => {
    if (!barcode || !barcode.trim()) return false;

    setLoading(true);
    try {
      // Solo llenamos codigo_barra. El resto se inicializa en NULL por defecto en la DB.
      const newTicket = {
        codigo_barra: barcode.trim()
      };

      const { error } = await supabase
        .from('sewing_tickets')
        .insert([newTicket]);

      if (error) {
          console.error('Error de Supabase al crear ticket:', error.message, error.details);
          throw error;
      }

      toast({
        variant: 'success',
        title: 'Ticket registrado',
        description: `Código ${barcode} guardado automáticamente.`,
      });

      // Refrescar lista para ver el nuevo registro
      await fetchTickets();
      return true;
    } catch (error: any) {
      console.error('Excepción al crear ticket:', error?.message || error);
      toast({
        variant: 'destructive',
        title: 'Error al registrar ticket',
        description: error.message || 'Error de conexión con el servidor.',
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
