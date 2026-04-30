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

    // VALIDACIÓN DE DUPLICADOS LOCAL (Opcional, permitimos duplicados según req pero validamos para feedback)
    const isDuplicate = tickets.some(t => t.codigo_barra === finalBarcode);
    if (isDuplicate) {
        // Solo avisamos, pero el flujo permite continuar si se requiere registrar varias veces
        console.log(`Aviso: El ticket ${finalBarcode} ya se encuentra en la lista reciente.`);
    }

    setLoading(true);
    try {
      // 1. Consultar en etiquetas_i para mapeo automático
      const { data: tagData, error: tagError } = await supabaseEtiquetas
        .from('etiquetas_i')
        .select('product, pack_id, sales_num, sku, personal_inc, organization, created_at, quantity')
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
          // Resto inicializados en null
          hora_vaciado: new Date().toLocaleTimeString('es-MX', { hour12: false }),
          fecha_entrega_paquete: null,
          tipo: null,
          asignada_a: null,
          cortada: null,
          confeccion: null,
          perforado: null,
          ojillado: null,
          empaquetado: null,
          lista_para_recoleccion: null,
          recolectada_por: null
        };
      } else {
        // CASO A: No existe en etiquetas_i -> Registro básico
        insertPayload = {
          codigo_barra: finalBarcode,
          responsable_vaciado: responsable,
          impresa: false,
          hora_vaciado: new Date().toLocaleTimeString('es-MX', { hour12: false }),
          // Todo lo demás NULL
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
          cortada: null,
          confeccion: null,
          perforado: null,
          ojillado: null,
          empaquetado: null,
          lista_para_recoleccion: null,
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

  return {
    tickets,
    loading,
    fetchTickets,
    createTicket,
  };
}
