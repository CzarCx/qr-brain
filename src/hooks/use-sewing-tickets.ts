'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { SewingTicket } from '@/types/sewing';
import { useToast } from '@/hooks/use-toast';

/**
 * Hook personalizado para gestionar la lógica de negocio de los tickets de costura.
 * Asegúrate de haber ejecutado el SQL de creación de la tabla 'sewing_tickets' 
 * en el proyecto de Supabase configurado en tu .env.
 */
export function useSewingTickets() {
  const [tickets, setTickets] = useState<SewingTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      // Intentamos cargar los últimos 50 tickets
      const { data, error } = await supabase
        .from('sewing_tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        // Log detallado para diagnosticar si el problema es de tabla inexistente o permisos
        console.error('Error de Supabase (fetchTickets):', error.message, error.details, error.hint);
        
        if (error.message.includes('Could not find the table')) {
            throw new Error('La tabla "sewing_tickets" no existe en el proyecto. Por favor, ejecuta el script SQL en el panel de Supabase.');
        }
        throw error;
      }
      setTickets(data || []);
    } catch (error: any) {
      console.error('Excepción al cargar tickets:', error?.message || error);
      toast({
        variant: 'destructive',
        title: 'Error de Conexión',
        description: error.message || 'No se pudo encontrar la tabla sewing_tickets.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const createTicket = async (barcode: string) => {
    if (!barcode || !barcode.trim()) return false;

    setLoading(true);
    try {
      // Según el esquema, enviamos solo codigo_barra. El ID y created_at son automáticos.
      const { error } = await supabase
        .from('sewing_tickets')
        .insert([{ codigo_barra: barcode.trim() }]);

      if (error) {
          console.error('Error de Supabase (createTicket):', error.message, error.details);
          throw error;
      }

      toast({
        variant: 'success',
        title: 'Ticket registrado',
        description: `Código ${barcode} guardado correctamente.`,
      });

      // Refrescar lista para ver el nuevo registro
      await fetchTickets();
      return true;
    } catch (error: any) {
      console.error('Excepción al crear ticket:', error?.message || error);
      toast({
        variant: 'destructive',
        title: 'Error al registrar',
        description: error.message || 'La tabla no existe o no tienes permisos.',
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
