'use client';

import { useState, useCallback } from 'react';
import { supabaseEtiquetas } from '@/lib/supabaseClient';
import { SewingTicket } from '@/types/sewing';
import { useToast } from '@/hooks/use-toast';

/**
 * Hook personalizado para gestionar la lógica de negocio de los tickets de costura.
 * Ahora utiliza las credenciales de Etiquetas DB (supabaseEtiquetas).
 */
export function useSewingTickets() {
  const [tickets, setTickets] = useState<SewingTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      // Intentamos cargar los últimos 50 tickets de la DB de Etiquetas
      const { data, error } = await supabaseEtiquetas
        .from('sewing_tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error de Supabase Etiquetas (fetchTickets):', error.message, error.details, error.hint);
        
        if (error.message.includes('Could not find the table')) {
            throw new Error('La tabla "sewing_tickets" no existe en el proyecto de ETIQUETAS. Por favor, ejecuta el script SQL en ese panel.');
        }
        throw error;
      }
      setTickets(data || []);
    } catch (error: any) {
      console.error('Excepción al cargar tickets (Etiquetas DB):', error?.message || error);
      toast({
        variant: 'destructive',
        title: 'Error de Conexión (Etiquetas)',
        description: error.message || 'No se pudo encontrar la tabla en la base de datos de etiquetas.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const createTicket = async (barcode: string) => {
    if (!barcode || !barcode.trim()) return false;

    setLoading(true);
    try {
      // Insertamos en la tabla de la DB de Etiquetas
      const { error } = await supabaseEtiquetas
        .from('sewing_tickets')
        .insert([{ codigo_barra: barcode.trim() }]);

      if (error) {
          console.error('Error de Supabase Etiquetas (createTicket):', error.message, error.details);
          throw error;
      }

      toast({
        variant: 'success',
        title: 'Ticket registrado',
        description: `Código ${barcode} guardado en DB Etiquetas.`,
      });

      // Refrescar lista para ver el nuevo registro
      await fetchTickets();
      return true;
    } catch (error: any) {
      console.error('Excepción al crear ticket (Etiquetas DB):', error?.message || error);
      toast({
        variant: 'destructive',
        title: 'Error al registrar',
        description: error.message || 'Error al conectar con la base de datos de etiquetas.',
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
