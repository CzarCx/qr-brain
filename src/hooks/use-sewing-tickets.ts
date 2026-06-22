
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
      // 1. Consultar en etiquetas_i para validación y mapeo automático (Soportando múltiples registros)
      const { data: tagDataArray, error: tagError } = await supabaseEtiquetas
        .from('etiquetas_i')
        .select('product, pack_id, sales_num, sku, personal_inc, organization, created_at, quantity, deli_date, imp_date')
        .eq('code', finalBarcode);

      if (tagError) {
        throw new Error(`Error al consultar etiquetas_i: ${tagError.message}`);
      }

      // VALIDACIÓN CRÍTICA: El código DEBE existir en etiquetas_i
      if (!tagDataArray || tagDataArray.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Código Inválido',
          description: 'Este código no existe en etiquetas_i. Verifica que haya sido generado correctamente antes de escanearlo.',
        });
        setLoading(false);
        return false;
      }

      // Agregar lógica de concatenación y suma de bultos multiregistro
      const firstRow = tagDataArray[0];
      const allSkus = tagDataArray.map(item => item.sku).filter(Boolean).join(' | ');
      const totalQuantity = tagDataArray.reduce((acc, curr) => acc + (curr.quantity || 0), 0);

      // Calcular fecha de impresión real en México para el guardado
      const printDateSource = firstRow.imp_date || firstRow.created_at;
      const mxDateStr = printDateSource 
        ? new Date(printDateSource).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }) 
        : null;

      // --- SINCRONIZACIÓN AUTOMÁTICA CON TABLA 'PERSONAL' (Main DB) ---
      const numericCode = parseFloat(finalBarcode);

      if (!isNaN(numericCode)) {
        const { data: personalCheckRows } = await supabase
            .from('personal')
            .select('code')
            .eq('code', numericCode);

        if (!personalCheckRows || personalCheckRows.length === 0) {
            // Replicar lógica de obtención de tiempo estimado (Sumando tiempos para múltiples SKUs)
            let totalEstimatedTime = 0;
            const skusToProcess = allSkus.split(' | ');

            for (const singleSku of skusToProcess) {
                const { data: skuAltRows } = await supabaseEtiquetas
                    .from('sku_alterno')
                    .select('sku_mdr')
                    .eq('sku', singleSku);
                
                if (skuAltRows && skuAltRows.length > 0) {
                    const { data: skuMRows } = await supabaseEtiquetas
                        .from('sku_m')
                        .select('esti_time')
                        .eq('sku_mdr', skuAltRows[0].sku_mdr);
                    if (skuMRows && skuMRows.length > 0) totalEstimatedTime += skuMRows[0].esti_time || 0;
                }
            }

            const now = new Date();
            const dateEsti = new Date(now.getTime());
            if (totalEstimatedTime > 0) {
                dateEsti.setMinutes(dateEsti.getMinutes() + totalEstimatedTime);
            }

            const personalPayload = {
                code: numericCode,
                sku: allSkus,
                name: responsable,
                name_inc: responsable,
                product: firstRow.product,
                quantity: totalQuantity,
                organization: firstRow.organization,
                sales_num: firstRow.sales_num,
                date: now.toISOString(),
                status: 'EN PRODUCCION',
                esti_time: totalEstimatedTime > 0 ? totalEstimatedTime : null,
                deli_date: firstRow.deli_date,
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
      }
      // --- FIN SINCRONIZACIÓN ---

      // 2. Preparar payload para sewing_tickets (Database de Etiquetas)
      const insertPayload = {
        codigo_barra: finalBarcode,
        responsable_vaciado: responsable,
        nombre_producto: firstRow.product,
        pack_id: firstRow.pack_id,
        sales_num: firstRow.sales_num,
        sku: allSkus,
        responsable_impresion: firstRow.personal_inc,
        cuenta: firstRow.organization,
        fecha_impresion: mxDateStr,
        cantidad: totalQuantity,
        impreso: false,
        hora_vaciado: new Date().toLocaleTimeString('es-MX', { hour12: false }),
        fecha_entrega_paquete: firstRow.deli_date,
        cortada: false,
        confeccion: false,
        perforado: false,
        ojillado: false,
        empaquetado: false,
        lista_para_recoleccion: false,
        alias: null
      };

      // 3. Insertar en sewing_tickets
      const { error: insertError } = await supabaseEtiquetas
        .from('sewing_tickets')
        .insert([insertPayload]);

      if (insertError) throw insertError;

      toast({
        variant: 'success',
        title: 'Ticket Mapeado y Sincronizado',
        description: `Se detectaron ${tagDataArray.length} registros para este bulto.`,
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
