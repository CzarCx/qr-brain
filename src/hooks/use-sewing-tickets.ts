'use client';

import { useState, useCallback } from 'react';
import { supabase, supabaseEtiquetas } from '@/lib/supabaseClient';
import { SewingTicket } from '@/types/sewing';
import { useToast } from '@/hooks/use-toast';

/**
 * Hook personalizado para gestionar la lógica de negocio de los tickets de costura.
 * Utiliza 'supabaseEtiquetas' para las operaciones de la tabla sewing_tickets y etiquetas_i.
 * Utiliza 'supabase' (Main DB) para la sincronización con la tabla personal.
 */
export function useSewingTickets() {
  const [tickets, setTickets] = useState<SewingTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchTickets = useCallback(async (isHistory: boolean = false) => {
    setLoading(true);
    try {
      let query = supabaseEtiquetas
        .from('sewing_tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (isHistory) {
        // Registros procesados (impreso = true)
        query = query.eq('impreso', true);
      } else {
        // Registros pendientes (impreso = false o null)
        query = query.or('impreso.eq.false,impreso.is.null');
      }

      const { data, error } = await query.limit(500);

      if (error) {
        console.error('Error de Supabase (fetchTickets):', error.message);
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
            description: `El ticket ${finalBarcode} ya se encuentra en la lista de pendientes.`,
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

      // --- SINCRONIZACIÓN AUTOMÁTICA CON TABLA 'PERSONAL' (Main DB) ---
      if (tagData) {
        // Intentar convertir a número para el campo 'code' que es numeric en Postgres
        const numericCode = parseFloat(finalBarcode);

        if (!isNaN(numericCode)) {
          // Verificar si ya existe el registro en la tabla de producción
          const { data: existingInPersonal } = await supabase
              .from('personal')
              .select('code')
              .eq('code', numericCode)
              .maybeSingle();

          if (!existingInPersonal) {
              // Replicar lógica de obtención de tiempo estimado (esti_time)
              let estimatedTime = null;
              if (tagData.sku) {
                  const { data: skuAlt } = await supabaseEtiquetas
                      .from('sku_alterno')
                      .select('sku_mdr')
                      .eq('sku', tagData.sku)
                      .maybeSingle();
                  
                  if (skuAlt) {
                      const { data: skuM } = await supabaseEtiquetas
                          .from('sku_m')
                          .select('esti_time')
                          .eq('sku_mdr', skuAlt.sku_mdr)
                          .maybeSingle();
                      if (skuM) estimatedTime = skuM.esti_time;
                  }
              }

              const now = new Date();
              const dateEsti = new Date(now.getTime());
              if (estimatedTime) {
                  dateEsti.setMinutes(dateEsti.getMinutes() + estimatedTime);
              }

              const personalPayload = {
                  code: numericCode,
                  sku: tagData.sku,
                  name: responsable, // NOT NULL en esquema
                  name_inc: responsable,
                  product: tagData.product,
                  quantity: tagData.quantity,
                  organization: tagData.organization,
                  sales_num: tagData.sales_num,
                  date: now.toISOString(),
                  status: 'EN PRODUCCION',
                  esti_time: estimatedTime,
                  deli_date: tagData.deli_date,
                  date_ini: now.toISOString(),
                  date_esti: dateEsti.toISOString(),
                  rea_details: 'Sin reasignar'
              };

              const { error: personalError } = await supabase
                  .from('personal')
                  .insert([personalPayload]);

              if (personalError) {
                  console.warn("Fallo el registro en la tabla 'personal':", personalError.message);
              }
          }
        } else {
            console.warn("El código no es un número válido, se omite registro en 'personal':", finalBarcode);
        }
      }
      // --- FIN SINCRONIZACIÓN ---

      // 2. Preparar payload para sewing_tickets (Database de Etiquetas)
      const insertPayload = tagData ? {
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
        impreso: false,
        impresa: false,
        hora_vaciado: new Date().toLocaleTimeString('es-MX', { hour12: false }),
        fecha_entrega_paquete: tagData.deli_date,
        cortada: false,
        confeccion: false,
        perforado: false,
        ojillado: false,
        empaquetado: false,
        lista_para_recoleccion: false
      } : {
        codigo_barra: finalBarcode,
        responsable_vaciado: responsable,
        impreso: false,
        impresa: false,
        hora_vaciado: new Date().toLocaleTimeString('es-MX', { hour12: false }),
        cortada: false,
        confeccion: false,
        perforado: false,
        ojillado: false,
        empaquetado: false,
        lista_para_recoleccion: false
      };

      // 3. Insertar en sewing_tickets
      const { error: insertError } = await supabaseEtiquetas
        .from('sewing_tickets')
        .insert([insertPayload]);

      if (insertError) throw insertError;

      toast({
        variant: 'success',
        title: tagData ? 'Ticket Mapeado y Sincronizado' : 'Ticket Registrado',
        description: tagData 
            ? `Se importaron datos y se inició el seguimiento en 'Personal'.`
            : `Código ${finalBarcode} guardado sin metadatos.`,
      });

      await fetchTickets(false);
      return true;
    } catch (error: any) {
      console.error('Excepción en registro de costura:', error);
      toast({
        variant: 'destructive',
        title: 'Error de Registro',
        description: error.message || 'No se pudo guardar el ticket.',
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchTickets, toast, tickets]);

  const updateTicket = useCallback(async (id: number, updates: Partial<SewingTicket>) => {
    try {
      // Actualización optimista
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
        description: 'No se pudo sincronizar el cambio.',
      });
      await fetchTickets();
    }
  }, [toast, fetchTickets]);

  const markMultipleAsPrinted = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;
    setLoading(true);
    try {
      const { error } = await supabaseEtiquetas
        .from('sewing_tickets')
        .update({ 
          impreso: true,
          impresa: true,
          responsable_impresion: localStorage.getItem('sewing_responsable') || 'SISTEMA'
        })
        .in('id', ids);

      if (error) throw error;

      toast({
        variant: 'success',
        title: 'Registros Procesados',
        description: `${ids.length} bultos marcados como impresos.`,
      });
    } catch (error: any) {
      console.error('Error en actualización masiva:', error.message);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron marcar como impresos.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const deleteTicket = useCallback(async (id: number) => {
    try {
      const { error } = await supabaseEtiquetas
        .from('sewing_tickets')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setTickets(prev => prev.filter(t => Number(t.id) !== id));
      toast({
        title: 'Registro Eliminado',
        description: 'El ticket ha sido borrado de la bitácora.',
      });
    } catch (error: any) {
      console.error('Error al eliminar ticket:', error.message);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo eliminar el registro.',
      });
    }
  }, [toast]);

  return {
    tickets,
    loading,
    fetchTickets,
    createTicket,
    updateTicket,
    markMultipleAsPrinted,
    deleteTicket,
  };
}
