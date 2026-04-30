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
        variant: 'destructive',
        title: 'Código Duplicado',
        description: `El ticket ${finalBarcode} ya ha sido escaneado recientemente.`,
      });
      return false;
    }

    setLoading(true);
    try {
      // 1. Consultar en etiquetas_i
      const { data: tagData, error: tagError } = await supabaseEtiquetas
        .from('etiquetas_i')
        .select('product, pack_id, sales_num, sku, personal_inc, organization')
        .eq('code', finalBarcode)
        .maybeSingle();

      if (tagError) {
        console.warn('Error al buscar en etiquetas_i:', tagError.message);
      }

      // 2. Preparar payload de inserción con mapeo de datos
      const insertPayload = {
        codigo_barra: finalBarcode,
        responsable_vaciado: responsable,
        // Si hay coincidencia, mapeamos. Si no, se quedan en null
        nombre_producto: tagData?.product || null,
        pack_id: tagData?.pack_id || null,
        sales_num: tagData?.sales_num || null,
        sku: tagData?.sku || null,
        responsable_impresion: tagData?.personal_inc || null,
        cuenta: tagData?.organization || null,
        // Otros campos requeridos por el esquema inicializados en null
        fecha_impresion: null,
        hora_vaciado: null,
        fecha_entrega_paquete: null,
        cantidad: null,
        tipo: null,
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

      // 3. Insertar en sewing_tickets
      const { error: insertError } = await supabaseEtiquetas
        .from('sewing_tickets')
        .insert([insertPayload]);

      if (insertError) {
          throw insertError;
      }

      toast({
        variant: 'success',
        title: tagData ? 'Ticket Encontrado y Registrado' : 'Ticket Registrado (Nuevo)',
        description: `Código ${finalBarcode} guardado por ${responsable}.`,
      });

      await fetchTickets();
      return true;
    } catch (error: any) {
      console.error('Excepción al crear ticket:', error);
      toast({
        variant: 'destructive',
        title: 'Error al registrar',
        description: error.message || 'Error al conectar con la base de datos.',
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchTickets, toast, tickets]);

  return {
    tickets,
    loading,
    fetchTickets,
    createTicket,
  };
}
