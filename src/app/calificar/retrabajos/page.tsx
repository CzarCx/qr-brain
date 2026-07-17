'use client';

/**
 * Monitoreo de retrabajos — sub-ruta de /calificar (mismo patrón que
 * /sewing-tickets/status): la pantalla operativa escanea, esta observa.
 *
 * Cada fila de `registro_incidencias_en_paquetes_listos_para_entrega` es un ciclo
 * de retrabajo. Abierto = `fin_retrabajo is null`; cerrado trae `segundos_retrabajo`
 * (columna generada por la BD).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { supabaseEtiquetas } from '@/lib/supabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, RefreshCw, Timer, AlertTriangle, History, Hourglass, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const INCIDENCIAS_TABLE = 'registro_incidencias_en_paquetes_listos_para_entrega';

type Incidencia = {
  id: string;
  bar_code: string | null;
  producto_solicitado: string | null;
  producto_despachado: string | null;
  piezas_solicitadas: number | null;
  piezas_despachadas: number | null;
  observaciones: string | null;
  id_empleado: string | null;
  inicio_retrabajo: string | null;
  fin_retrabajo: string | null;
  segundos_retrabajo: number | null;
};

/** "2h 05m 13s" — las horas se omiten cuando no aplican, para no ensuciar la lectura. */
const formatDuration = (totalSeconds: number | null): string => {
  if (totalSeconds === null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return '—';
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}h ${pad(m)}m ${pad(sec)}s` : `${m}m ${pad(sec)}s`;
};

// Semáforo por antigüedad: el supervisor debe ver de un vistazo qué se está atorando.
const urgencia = (segundos: number) => {
  if (segundos >= 7200) return { cls: 'text-red-600', chip: 'bg-red-100 text-red-800 border-red-200', label: '+2h' };
  if (segundos >= 1800) return { cls: 'text-amber-600', chip: 'bg-amber-100 text-amber-800 border-amber-200', label: '+30m' };
  return { cls: 'text-green-600', chip: 'bg-green-100 text-green-800 border-green-200', label: 'Reciente' };
};

const fmtFecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Mexico_City' }) : '—';

const fmtDia = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', timeZone: 'America/Mexico_City' }) : '—';

const fmtHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' }) : '';

// Tarjeta expandible para el historial en móvil — mismo patrón que las cards de
// /ASIGNAR (MobilePendingRow): reemplaza la tabla con scroll horizontal por una
// lista compacta. Definida fuera del componente para no recrearse en cada render.
function MobileHistorialRow({ item, empleadoNombre, sku }: { item: Incidencia; empleadoNombre: string; sku?: string }) {
  const [expanded, setExpanded] = useState(false);
  const difierePiezas = item.piezas_solicitadas !== item.piezas_despachadas;
  const toggle = () => setExpanded(v => !v);

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden mb-1.5 bg-white">
      <div
        className="flex items-center gap-2 px-2.5 py-2 cursor-pointer"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
      >
        {/* Código de barras arriba y el SKU debajo, igual que las cards de /ASIGNAR. */}
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <span className="font-mono text-xs font-bold text-starbucks-dark whitespace-nowrap">{item.bar_code || '—'}</span>
          {sku && <span className="font-mono text-[9px] font-bold text-starbucks-accent truncate">{sku}</span>}
          <span className="text-[9px] font-medium text-gray-400">
            {fmtDia(item.inicio_retrabajo)} <span className="font-mono">{fmtHora(item.inicio_retrabajo)}</span>
          </span>
        </div>
        <span className="text-sm font-black font-mono text-starbucks-green tabular-nums shrink-0">{formatDuration(item.segundos_retrabajo)}</span>
        {/* Cantidad solicitada como badge ×N, igual que las cards de /ASIGNAR. */}
        <span className="text-sm font-black text-starbucks-accent bg-starbucks-cream rounded px-2 py-1 tabular-nums shrink-0">×{item.piezas_solicitadas ?? '—'}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-gray-400 transition-transform shrink-0', expanded && 'rotate-180')} />
      </div>
      <div className="grid transition-[grid-template-rows] duration-200" style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}>
        <div className="overflow-hidden">
          <div className="px-2.5 pb-2.5 pt-2 border-t border-dashed border-gray-200">
            <div className="grid grid-cols-2 gap-2.5 mb-2">
              <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
                <p className="text-[8px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Solicitado</p>
                <p className="text-[11px] font-bold text-gray-800 break-words">{item.producto_solicitado || '—'}</p>
                <p className="text-[10px] font-mono font-bold text-gray-500 mt-0.5">{item.piezas_solicitadas ?? '—'} pzas</p>
              </div>
              <div className="bg-red-50/50 rounded-lg p-2 border border-red-100">
                <p className="text-[8px] font-black uppercase tracking-widest text-red-400 mb-0.5">Despachado</p>
                <p className="text-[11px] font-bold text-gray-800 break-words">{item.producto_despachado || '—'}</p>
                <p className={cn('text-[10px] font-mono font-bold mt-0.5', difierePiezas ? 'text-red-500' : 'text-green-600')}>{item.piezas_despachadas ?? '—'} pzas</p>
              </div>
            </div>
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Despachó</p>
              <p className="text-[11px] font-semibold text-starbucks-dark">{empleadoNombre || '—'}</p>
            </div>
            {item.observaciones && (
              <div className="mt-2">
                <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Observaciones</p>
                <p className="text-[11px] text-gray-600 italic border-l-2 border-gray-200 pl-2 mt-0.5 break-words">{item.observaciones}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RetrabajosPage() {
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [empleados, setEmpleados] = useState<Record<string, string>>({});
  // La tabla de incidencias solo guarda `id_producto_solicitado` (numérico) y la
  // subcategoría en `producto_solicitado`, no el SKU de texto. Se cruza aparte
  // contra `personal` por bar_code para mostrarlo junto al código.
  const [skus, setSkus] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  // Tick del cronómetro: se recalcula cada segundo solo si hay retrabajos abiertos.
  const [now, setNow] = useState(() => Date.now());

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabaseEtiquetas
      .from(INCIDENCIAS_TABLE)
      .select('id, bar_code, producto_solicitado, producto_despachado, piezas_solicitadas, piezas_despachadas, observaciones, id_empleado, inicio_retrabajo, fin_retrabajo, segundos_retrabajo')
      .order('inicio_retrabajo', { ascending: false })
      .limit(500);

    if (err) {
      console.error('Error cargando retrabajos:', err);
      setError(err.message);
    } else {
      setError(null);
      setIncidencias((data || []) as Incidencia[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // La tabla de incidencias no tiene FK a empleados, así que PostgREST no puede
  // embeberlos: se traen aparte y se cruzan en memoria por uuid.
  useEffect(() => {
    const fetchEmpleados = async () => {
      const { data } = await supabaseEtiquetas
        .from('empleados')
        .select('id, nombres, apellido_paterno, apellido_materno');
      if (!data) return;
      const mapa: Record<string, string> = {};
      data.forEach((e: any) => {
        mapa[e.id] = [e.nombres, e.apellido_paterno, e.apellido_materno].filter(Boolean).join(' ').toUpperCase();
      });
      setEmpleados(mapa);
    };
    fetchEmpleados();
  }, []);

  // SKU por bar_code: se resuelve contra `personal` (donde `code` = bar_code) cada
  // vez que cambian las incidencias cargadas, y se cruza en memoria.
  useEffect(() => {
    const codes = Array.from(new Set(incidencias.map(i => i.bar_code).filter(Boolean))) as string[];
    if (codes.length === 0) return;
    const fetchSkus = async () => {
      const { data } = await supabaseEtiquetas
        .from('personal')
        .select('code, sku')
        .in('code', codes);
      if (!data) return;
      const mapa: Record<string, string> = {};
      data.forEach((p: any) => { if (p.code && p.sku) mapa[p.code] = p.sku; });
      setSkus(mapa);
    };
    fetchSkus();
  }, [incidencias]);

  const filtrar = useCallback((lista: Incidencia[]) => {
    const q = busqueda.trim().toUpperCase();
    if (!q) return lista;
    return lista.filter(i =>
      (i.bar_code || '').toUpperCase().includes(q) ||
      (i.producto_solicitado || '').toUpperCase().includes(q) ||
      (i.producto_despachado || '').toUpperCase().includes(q) ||
      (empleados[i.id_empleado || ''] || '').includes(q),
    );
  }, [busqueda, empleados]);

  const enCurso = useMemo(
    () => filtrar(incidencias.filter(i => !i.fin_retrabajo))
      // Los más viejos primero: son los que se están atorando.
      .sort((a, b) => new Date(a.inicio_retrabajo || 0).getTime() - new Date(b.inicio_retrabajo || 0).getTime()),
    [incidencias, filtrar],
  );

  const historial = useMemo(
    () => filtrar(incidencias.filter(i => !!i.fin_retrabajo)),
    [incidencias, filtrar],
  );

  // El intervalo solo corre si hay algo que cronometrar.
  useEffect(() => {
    if (enCurso.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [enCurso.length]);

  const promedioCerrados = useMemo(() => {
    const conDuracion = historial.filter(i => typeof i.segundos_retrabajo === 'number');
    if (conDuracion.length === 0) return null;
    return conDuracion.reduce((acc, i) => acc + (i.segundos_retrabajo || 0), 0) / conDuracion.length;
  }, [historial]);

  const segundosAbiertos = (i: Incidencia) =>
    i.inicio_retrabajo ? Math.max(0, (now - new Date(i.inicio_retrabajo).getTime()) / 1000) : 0;

  const Piezas = ({ solicitadas, despachadas }: { solicitadas: number | null; despachadas: number | null }) => {
    const difiere = solicitadas !== despachadas;
    return (
      <span className="font-mono text-xs font-bold whitespace-nowrap">
        <span className="text-gray-700">{solicitadas ?? '—'}</span>
        <span className="text-gray-300 mx-1">→</span>
        <span className={difiere ? 'text-red-600' : 'text-green-600'}>{despachadas ?? '—'}</span>
      </span>
    );
  };

  return (
    <>
      <Head><title>Retrabajos</title></Head>
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        <header className="space-y-3">
          <Link href="/calificar" className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-starbucks-green transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver a Calificar
          </Link>
          <div className="text-center space-y-1">
            <h1 className="text-2xl md:text-3xl font-black text-starbucks-green flex items-center justify-center gap-2">
              <Hourglass className="h-7 w-7" /> Retrabajos
            </h1>
            <p className="text-sm text-gray-500">Paquetes devueltos a producción por una discrepancia en control de calidad.</p>
          </div>
        </header>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No se pudieron cargar los retrabajos</AlertTitle>
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-sm">
            <p className="text-2xl font-black text-amber-600">{enCurso.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">En curso</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-sm">
            <p className="text-2xl font-black text-slate-700">{historial.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Resueltos</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-sm col-span-2 md:col-span-1">
            <p className="text-2xl font-black text-starbucks-green">{promedioCerrados !== null ? formatDuration(promedioCerrados) : '—'}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Promedio</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar código, producto u operario..." className="h-10 rounded-xl" />
          <Button variant="outline" size="icon" onClick={fetchData} disabled={loading} title="Actualizar" className="h-10 w-10 shrink-0">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>

        <Tabs defaultValue="curso" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="curso" className="gap-1 text-xs font-bold"><Timer className="h-4 w-4" /> En curso ({enCurso.length})</TabsTrigger>
            <TabsTrigger value="historial" className="gap-1 text-xs font-bold"><History className="h-4 w-4" /> Historial ({historial.length})</TabsTrigger>
          </TabsList>

          {/* ---------- EN CURSO (con cronómetro en vivo) ---------- */}
          <TabsContent value="curso" className="mt-4 space-y-3">
            {enCurso.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-gray-400 text-sm">
                {loading ? 'Cargando...' : 'No hay paquetes en retrabajo. 🎉'}
              </CardContent></Card>
            ) : enCurso.map(i => {
              const secs = segundosAbiertos(i);
              const u = urgencia(secs);
              return (
                <Card key={i.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <CardTitle className="text-base font-mono font-black">{i.bar_code || 'SIN CÓDIGO'}</CardTitle>
                        <CardDescription className="text-xs">
                          Inició {fmtFecha(i.inicio_retrabajo)}
                          {i.id_empleado && <> · Despachó <span className="font-bold">{empleados[i.id_empleado] || 'N/D'}</span></>}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <p className={cn('text-2xl font-black font-mono tabular-nums', u.cls)}>{formatDuration(secs)}</p>
                        <Badge variant="outline" className={cn('text-[9px] font-black', u.chip)}>{u.label}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">Solicitado</p>
                        <p className="text-xs font-bold text-gray-800 break-words">{i.producto_solicitado || '—'}</p>
                        <p className="text-[10px] font-mono font-bold text-gray-500 mt-1">{i.piezas_solicitadas ?? '—'} pzas</p>
                      </div>
                      <div className="bg-red-50/50 rounded-lg p-3 border border-red-100">
                        <p className="text-[9px] font-black uppercase tracking-widest text-red-400 mb-1">Despachado (real)</p>
                        <p className="text-xs font-bold text-gray-800 break-words">{i.producto_despachado || '—'}</p>
                        <p className="text-[10px] font-mono font-bold text-red-500 mt-1">{i.piezas_despachadas ?? '—'} pzas</p>
                      </div>
                    </div>
                    {i.observaciones && (
                      <p className="text-[11px] text-gray-500 italic border-l-2 border-gray-200 pl-2">{i.observaciones}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* ---------- HISTORIAL ---------- */}
          <TabsContent value="historial" className="mt-4">
            {/* Móvil: tarjetas expandibles (mismo patrón que /ASIGNAR) en vez de la
                tabla, que en pantallas chicas se corta y obliga a scroll horizontal. */}
            <div className="md:hidden space-y-1.5">
              {historial.length > 0 ? historial.map(i => (
                <MobileHistorialRow key={i.id} item={i} empleadoNombre={empleados[i.id_empleado || ''] || ''} sku={skus[i.bar_code || '']} />
              )) : (
                <Card><CardContent className="py-12 text-center text-gray-400 text-sm">
                  {loading ? 'Cargando...' : 'Sin retrabajos resueltos todavía.'}
                </CardContent></Card>
              )}
            </div>

            {/* Escritorio: tabla completa. */}
            <Card className="hidden md:block">
              <CardContent className="p-0">
                <div className="overflow-auto max-h-[520px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-gray-50 z-10">
                      <TableRow>
                        <TableHead className="text-xs font-black">Fecha</TableHead>
                        <TableHead className="text-xs font-black">Código</TableHead>
                        <TableHead className="text-xs font-black">Solicitado</TableHead>
                        <TableHead className="text-xs font-black">Despachado</TableHead>
                        <TableHead className="text-xs font-black text-center">Pzas</TableHead>
                        <TableHead className="text-xs font-black">Despachó</TableHead>
                        <TableHead className="text-xs font-black">Observaciones</TableHead>
                        <TableHead className="text-xs font-black text-right">Duración</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historial.length > 0 ? historial.map(i => (
                        <TableRow key={i.id}>
                          <TableCell className="text-xs whitespace-nowrap" title={`Inicio: ${fmtFecha(i.inicio_retrabajo)}\nFin: ${fmtFecha(i.fin_retrabajo)}`}>
                            <span className="font-bold text-gray-700">{fmtDia(i.inicio_retrabajo)}</span>
                            <span className="text-gray-400 font-mono ml-1">{fmtHora(i.inicio_retrabajo)}</span>
                          </TableCell>
                          <TableCell className="font-mono text-xs font-bold">
                            <div>{i.bar_code || '—'}</div>
                            {skus[i.bar_code || ''] && <div className="text-[10px] font-normal text-starbucks-accent">{skus[i.bar_code || '']}</div>}
                          </TableCell>
                          <TableCell className="text-xs max-w-[180px] truncate" title={i.producto_solicitado || ''}>{i.producto_solicitado || '—'}</TableCell>
                          <TableCell className="text-xs max-w-[180px] truncate" title={i.producto_despachado || ''}>{i.producto_despachado || '—'}</TableCell>
                          <TableCell className="text-center"><Piezas solicitadas={i.piezas_solicitadas} despachadas={i.piezas_despachadas} /></TableCell>
                          <TableCell className="text-xs">{empleados[i.id_empleado || ''] || '—'}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate text-gray-500 italic" title={i.observaciones || ''}>{i.observaciones || '—'}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-bold text-starbucks-green">{formatDuration(i.segundos_retrabajo)}</TableCell>
                        </TableRow>
                      )) : (
                        <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-10 text-sm">
                          {loading ? 'Cargando...' : 'Sin retrabajos resueltos todavía.'}
                        </TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
