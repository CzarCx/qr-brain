'use client';

/**
 * Hook de lógica de negocio para el módulo de Insumos.
 *
 * Modelo de trazabilidad:
 *   - Cada insumo físico (rollo de diurex, playo, etc.) lleva pegado un código
 *     de barra único que se imprime una sola vez desde este módulo.
 *   - El código recorre estados: GENERADO -> ASIGNADO -> ENTREGADO -> ASIGNADO...
 *   - "Renovar" = escanear un código ASIGNADO: se registra la ENTREGA del insumo
 *     consumido y el código queda disponible para asignar uno nuevo al operario.
 *   - Cada transición se guarda en `insumos_movimientos` para trazabilidad total
 *     (quién, cuándo, cuántos ciclos).
 *
 * Tablas requeridas en la BD de Etiquetas (ver DDL propuesto). Si no existen,
 * `setupNeeded` se pone en true para que la página muestre el instructivo.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabaseEtiquetas } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/AuthProvider';

export type InsumoEstado = 'GENERADO' | 'ASIGNADO' | 'ENTREGADO';

export type Insumo = {
  id: number;
  code: string;
  tipo: string;
  estado: InsumoEstado;
  asignado_a: string | null;
  id_empleado_asigna: string | null;
  ciclos: number;
  fecha_generado: string | null;
  fecha_asignado: string | null;
  fecha_entregado: string | null;
  notas: string | null;
  created_at: string;
};

// La tabla aún no existe en la BD (relación inexistente / no está en el schema cache).
const isMissingTableError = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === '42P01' || error.code === 'PGRST205' ||
    /does not exist|schema cache|could not find the table/i.test(error.message || ''));

export function useInsumos() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [loading, setLoading] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);

  const fetchInsumos = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    const { data, error } = await supabaseEtiquetas
      .from('insumos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) {
      if (isMissingTableError(error)) {
        setSetupNeeded(true);
      } else {
        console.error('Error al cargar insumos:', error);
        toast({ variant: 'destructive', title: 'Error al cargar insumos', description: error.message });
      }
    } else {
      setSetupNeeded(false);
      setInsumos((data || []) as Insumo[]);
    }
    if (showSpinner) setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchInsumos();
  }, [fetchInsumos]);

  // Registra un movimiento sin romper el flujo principal si falla (best-effort).
  const logMovimiento = useCallback(async (
    payload: { code: string; tipo: string | null; evento: InsumoEstado; empleado?: string | null; notas?: string | null; fecha: string }
  ) => {
    const { error } = await supabaseEtiquetas.from('insumos_movimientos').insert({
      code: payload.code,
      tipo: payload.tipo,
      evento: payload.evento,
      empleado: payload.empleado ?? null,
      id_empleado_registra: user?.id ?? null,
      fecha: payload.fecha,
      notas: payload.notas ?? null,
    });
    if (error) console.warn("No se pudo registrar el movimiento en 'insumos_movimientos':", error.message);
  }, [user]);

  /**
   * Genera `cantidad` códigos nuevos de un tipo y los deja en estado GENERADO,
   * listos para imprimir. El folio continúa desde el código INS-###### más alto.
   */
  const generateCodes = useCallback(async (tipo: string, cantidad: number, notas?: string): Promise<Insumo[]> => {
    const cleanTipo = tipo.trim().toUpperCase();
    if (!cleanTipo || !Number.isFinite(cantidad) || cantidad < 1) return [];

    setLoading(true);
    try {
      // Siguiente folio a partir del código más alto (los códigos son de ancho fijo,
      // así que el orden lexicográfico coincide con el numérico).
      const { data: lastRows, error: lastErr } = await supabaseEtiquetas
        .from('insumos')
        .select('code')
        .like('code', 'INS-%')
        .order('code', { ascending: false })
        .limit(1);
      if (lastErr) throw lastErr;

      let next = 1;
      if (lastRows && lastRows.length > 0) {
        const n = parseInt(String(lastRows[0].code).replace(/\D/g, ''), 10);
        if (!isNaN(n)) next = n + 1;
      }

      const nowIso = new Date().toISOString();
      const rows = Array.from({ length: Math.min(cantidad, 200) }, (_, i) => ({
        code: `INS-${String(next + i).padStart(6, '0')}`,
        tipo: cleanTipo,
        estado: 'GENERADO' as InsumoEstado,
        ciclos: 0,
        fecha_generado: nowIso,
        notas: notas?.trim() || null,
      }));

      const { data, error } = await supabaseEtiquetas.from('insumos').insert(rows).select();
      if (error) throw error;

      const created = (data || []) as Insumo[];
      await Promise.all(created.map(r => logMovimiento({ code: r.code, tipo: r.tipo, evento: 'GENERADO', fecha: nowIso })));

      toast({ variant: 'success', title: 'Códigos generados', description: `${created.length} código(s) de ${cleanTipo} listos para imprimir y pegar.` });
      await fetchInsumos(false);
      return created;
    } catch (e: any) {
      if (isMissingTableError(e)) setSetupNeeded(true);
      toast({ variant: 'destructive', title: 'Error al generar', description: e.message || 'No se pudieron generar los códigos.' });
      return [];
    } finally {
      setLoading(false);
    }
  }, [fetchInsumos, toast, logMovimiento]);

  /**
   * Asigna un código a un empleado. Solo procede si el código existe y NO está
   * ya ASIGNADO (para asignar uno en uso primero hay que renovarlo).
   */
  const assignCode = useCallback(async (code: string, empleado: string): Promise<boolean> => {
    const finalCode = code.trim();
    const cleanEmpleado = empleado.trim();
    if (!finalCode) return false;
    if (!cleanEmpleado) {
      toast({ variant: 'destructive', title: 'Falta el empleado', description: 'Selecciona a quién se le asigna el insumo.' });
      return false;
    }

    setLoading(true);
    try {
      const { data: row, error: qErr } = await supabaseEtiquetas
        .from('insumos').select('*').eq('code', finalCode).maybeSingle();
      if (qErr) throw qErr;

      if (!row) {
        toast({ variant: 'destructive', title: 'Código no encontrado', description: `${finalCode} no existe. Debe generarse antes de asignarse.` });
        return false;
      }
      if (row.estado === 'ASIGNADO') {
        toast({ variant: 'destructive', title: 'Insumo en uso', description: `${finalCode} ya está asignado a ${row.asignado_a || 'un operario'}. Usa "Renovar" para liberarlo primero.` });
        return false;
      }

      const nowIso = new Date().toISOString();
      const { error: uErr } = await supabaseEtiquetas.from('insumos').update({
        estado: 'ASIGNADO',
        asignado_a: cleanEmpleado,
        id_empleado_asigna: user?.id ?? null,
        fecha_asignado: nowIso,
      }).eq('code', finalCode);
      if (uErr) throw uErr;

      await logMovimiento({ code: finalCode, tipo: row.tipo, evento: 'ASIGNADO', empleado: cleanEmpleado, fecha: nowIso });
      toast({ variant: 'success', title: 'Insumo asignado', description: `${finalCode} (${row.tipo}) → ${cleanEmpleado}` });
      await fetchInsumos(false);
      return true;
    } catch (e: any) {
      if (isMissingTableError(e)) setSetupNeeded(true);
      toast({ variant: 'destructive', title: 'Error al asignar', description: e.message || 'No se pudo asignar el insumo.' });
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchInsumos, toast, logMovimiento, user]);

  /**
   * Renovar: escanear un código ASIGNADO registra la ENTREGA del insumo consumido.
   * El código pasa a ENTREGADO (disponible), suma un ciclo y libera al operario.
   * Devuelve { insumo, prevHolder, renewed } — `renewed` indica si de verdad hubo
   * una entrega (para que la UI encadene la asignación del insumo nuevo), o null si
   * el código no existe.
   */
  const renewCode = useCallback(async (code: string): Promise<{ insumo: Insumo; prevHolder: string | null; renewed: boolean } | null> => {
    const finalCode = code.trim();
    if (!finalCode) return null;

    setLoading(true);
    try {
      const { data: row, error: qErr } = await supabaseEtiquetas
        .from('insumos').select('*').eq('code', finalCode).maybeSingle();
      if (qErr) throw qErr;

      if (!row) {
        toast({ variant: 'destructive', title: 'Código no encontrado', description: `${finalCode} no existe en el sistema.` });
        return null;
      }
      if (row.estado !== 'ASIGNADO') {
        toast({ variant: 'default', title: 'Sin insumo activo', description: `${finalCode} no está en uso (estado: ${row.estado}). Puedes asignarlo directamente.` });
        return { insumo: row as Insumo, prevHolder: null, renewed: false };
      }

      const nowIso = new Date().toISOString();
      const prevHolder: string | null = row.asignado_a;
      const { data: updated, error: uErr } = await supabaseEtiquetas.from('insumos').update({
        estado: 'ENTREGADO',
        asignado_a: null,
        fecha_entregado: nowIso,
        ciclos: (row.ciclos || 0) + 1,
      }).eq('code', finalCode).select().maybeSingle();
      if (uErr) throw uErr;

      await logMovimiento({ code: finalCode, tipo: row.tipo, evento: 'ENTREGADO', empleado: prevHolder, fecha: nowIso });
      toast({ variant: 'success', title: 'Entrega registrada', description: `${finalCode} (${row.tipo}) entregado por ${prevHolder || 'operario'}. Asigna un insumo nuevo.` });
      await fetchInsumos(false);
      const insumo = (updated as Insumo) ?? ({ ...row, estado: 'ENTREGADO', asignado_a: null } as Insumo);
      return { insumo, prevHolder, renewed: true };
    } catch (e: any) {
      if (isMissingTableError(e)) setSetupNeeded(true);
      toast({ variant: 'destructive', title: 'Error al renovar', description: e.message || 'No se pudo registrar la entrega.' });
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchInsumos, toast, logMovimiento]);

  return { insumos, loading, setupNeeded, fetchInsumos, generateCodes, assignCode, renewCode };
}
