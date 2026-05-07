'use client';

import { useState, useCallback } from 'react';
import { supabaseEtiquetas } from '@/lib/supabaseClient';
import { SewingTicket } from '@/types/sewing';
import { useToast } from '@/hooks/use-toast';

/**
 * Hook personalizado para gestionar la lógica de negocio de los tickets de costura.
 * Realiza una búsqueda en etiquetas_i para enriquecer los datos de sewing_tickets.
 */
export function useSewingTickets() {
  const [tickets, setTickets] = useState<SewingTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseEtiquetas
        .from('sewing_tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error de Supabase Etiquetas (fetchTickets):', error.message);
        throw error;
      }
      setTickets(data || []);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error de Conexión',
        description: error.message || 'No se pudo cargar la lista de tickets.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const createTicket = useCallback(async (barcode: string, responsable: string) => {
    if (!barcode || !barcode.trim()) return false;
    
    const finalBarcode = barcode.trim();

    // VALIDACIÓN DE DUPLICADOS LOCAL
    const isDuplicate = tickets.some(t => t.codigo_barra === finalBarcode);
    if (isDuplicate) {
        toast({
            variant: 'warning',
            title: 'Código Duplicado',
            description: `El ticket ${finalBarcode} ya se encuentra registrado en la lista actual.`,
        });
        return false;
    }

    setLoading(true);
    try {
      // 1. Consultar en etiquetas_i para mapeo automático
      const { data: tagData, error: tagError } = await supabaseEtiquetas
        .from('etiquetas_i')
        .select('product, pack_id, sales_num, sku, personal_inc, organization, created_at, quantity, deli_date')
        .eq('code', finalBarcode)
        .maybeSingle();

      if (tagError) {
        console.error('Error al consultar etiquetas_i:', tagError.message);
      }

      // 2. Preparar payload según condiciones
      let insertPayload: Partial<SewingTicket>;

      if (tagData) {
        // CASO B: Existe coincidencia -> Mapeo completo
        insertPayload = {
          codigo_barra: finalBarcode,
          responsable_vaciado: responsable,
          nombre_producto: tagData.product,
          pack_id: tagData.pack_id,
          sales_num: tagData.sales_num,
          sku: tagData.sku,
          responsable_impresion: tagData.personal_inc,
          cuenta: tagData.organization,
          fecha_impresion: tagData.created_at ? new Date(tagData.created_at).toISOString().split('T')[0] : null,
          cantidad: tagData.quantity,
          impresa: true,
          hora_vaciado: new Date().toLocaleTimeString('es-MX', { hour12: false }),
          fecha_entrega_paquete: tagData.deli_date,
          tipo: null,
          asignada_a: null,
          cortada: false,
          confeccion: false,
          perforado: false,
          ojillado: false,
          empaquetado: false,
          lista_para_recoleccion: false,
          recolectada_por: null
        };
      } else {
        // CASO A: No existe en etiquetas_i -> Registro básico
        insertPayload = {
          codigo_barra: finalBarcode,
          responsable_vaciado: responsable,
          impresa: false,
          hora_vaciado: new Date().toLocaleTimeString('es-MX', { hour12: false }),
          nombre_producto: null,
          pack_id: null,
          sales_num: null,
          sku: null,
          responsable_impresion: null,
          cuenta: null,
          fecha_impresion: null,
          cantidad: null,
          fecha_entrega_paquete: null,
          tipo: null,
          asignada_a: null,
          cortada: false,
          confeccion: false,
          perforado: false,
          ojillado: false,
          empaquetado: false,
          lista_para_recoleccion: false,
          recolectada_por: null
        };
      }

      // 3. Insertar en sewing_tickets
      const { error: insertError } = await supabaseEtiquetas
        .from('sewing_tickets')
        .insert([insertPayload]);

      if (insertError) {
          throw insertError;
      }

      toast({
        variant: 'success',
        title: tagData ? 'Ticket Mapeado con Éxito' : 'Ticket Registrado (No Encontrado)',
        description: tagData 
            ? `Se importaron datos de ${tagData.product} para el código ${finalBarcode}.`
            : `El código ${finalBarcode} se guardó sin datos adicionales.`,
      });

      await fetchTickets();
      return true;
    } catch (error: any) {
      console.error('Excepción en módulo de costura:', error);
      toast({
        variant: 'destructive',
        title: 'Error de Registro',
        description: error.message || 'No se pudo guardar el ticket en la base de datos.',
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchTickets, toast, tickets]);

  const updateTicket = useCallback(async (id: number, updates: Partial<SewingTicket>) => {
    try {
      // Actualización optimista en el estado local
      setTickets(prev => prev.map(t => Number(t.id) === Number(id) ? { ...t, ...updates } : t));

      const { error } = await supabaseEtiquetas
        .from('sewing_tickets')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

    } catch (error: any) {
      console.error('Error al actualizar ticket:', error.message);
      toast({
        variant: 'destructive',
        title: 'Error de Actualización',
        description: 'No se pudo sincronizar el cambio con la base de datos.',
      });
      // Revertir en caso de error
      await fetchTickets();
    }
  }, [toast, fetchTickets]);

  const deleteTicket = useCallback(async (id: number | string) => {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
    
    try {
      const { error } = await supabaseEtiquetas
        .from('sewing_tickets')
        .delete()
        .eq('id', numericId);

      if (error) throw error;

      setTickets(prev => prev.filter(t => Number(t.id) !== numericId));
      toast({
        title: 'Ticket Eliminado',
        description: 'El registro se ha borrado correctamente de la bitácora.',
      });
    } catch (error: any) {
      console.error('Error al eliminar ticket:', error.message);
      toast({
        variant: 'destructive',
        title: 'Error al Eliminar',
        description: 'No se pudo borrar el registro de la base de datos.',
      });
    }
  }, [toast]);

  return {
    tickets,
    loading,
    fetchTickets,
    createTicket,
    updateTicket,
    deleteTicket,
  };
}
