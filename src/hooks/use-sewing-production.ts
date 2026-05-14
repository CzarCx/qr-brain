'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { SewingProcessTime } from '@/types/sewing';
import { useToast } from '@/hooks/use-toast';

export function useSewingProduction() {
  const [loading, setLoading] = useState(false);
  const [processTimes, setProcessTimes] = useState<SewingProcessTime[]>([]);
  const { toast } = useToast();

  const fetchProcessTimes = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sewing_ticket_process_times')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProcessTimes(data || []);
    } catch (error: any) {
      console.error('Error fetching process times:', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveProcessTime = async (record: Omit<SewingProcessTime, 'id' | 'created_at'>) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('sewing_ticket_process_times')
        .insert([record]);

      if (error) throw error;

      toast({
        variant: 'success',
        title: 'Tiempo Registrado',
        description: `Se guardó el tiempo de ${record.process_name} para ${record.sku}.`,
      });

      await fetchProcessTimes();
      return true;
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al Guardar',
        description: error.message,
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    processTimes,
    loading,
    fetchProcessTimes,
    saveProcessTime,
  };
}
