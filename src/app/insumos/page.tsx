'use client';

/**
 * Módulo de Insumos — endpoint NUEVO (no toca ninguno existente).
 *
 * Flujo:
 *   1. GENERAR: se crean códigos de barra únicos (INS-######) y se imprimen para
 *      pegarlos en los insumos físicos (diurex, playo, etc.).
 *   2. ASIGNAR: se escanea el código y se asigna a un operario (queda ASIGNADO).
 *   3. RENOVAR: cuando el insumo se acaba, se escanea de nuevo. Se registra la
 *      ENTREGA del insumo consumido y se procede a asignar uno nuevo al operario.
 *
 * Toda la trazabilidad vive en las tablas `insumos` e `insumos_movimientos`
 * (ver DDL propuesto — la página muestra el instructivo si aún no existen).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Barcode from 'react-barcode';
import { useReactToPrint } from 'react-to-print';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { supabaseEtiquetas } from '@/lib/supabaseClient';
import { useIsMobile } from '@/hooks/use-mobile';
import { useInsumos, type Insumo, type InsumoEstado } from '@/hooks/use-insumos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Tags, Printer, ScanLine, Recycle, Plus, RefreshCw, PackagePlus,
  AlertTriangle, Camera, X, ClipboardCopy, Boxes, CheckCircle2,
} from 'lucide-react';

const TIPOS_SUGERIDOS = ['DIUREX', 'PLAYO', 'CINTA', 'BOLSA', 'STRETCH'];

const DDL_SQL = `-- Tabla principal: 1 fila por código físico (estado ACTUAL)
create table if not exists public.insumos (
  id                 bigint generated always as identity primary key,
  code               text not null unique,               -- valor del código de barra (INS-000001)
  tipo               text not null,                       -- DIUREX, PLAYO, etc.
  estado             text not null default 'GENERADO',    -- GENERADO | ASIGNADO | ENTREGADO
  asignado_a         text,                                -- operario que lo tiene ahora
  id_empleado_asigna uuid,                                -- usuario que hizo la última asignación
  ciclos             integer not null default 0,          -- veces que se ha renovado
  fecha_generado     timestamptz not null default now(),
  fecha_asignado     timestamptz,
  fecha_entregado    timestamptz,
  notas              text,
  created_at         timestamptz not null default now()
);
create index if not exists idx_insumos_estado on public.insumos (estado);
create index if not exists idx_insumos_tipo   on public.insumos (tipo);

-- Bitácora de movimientos: 1 fila por transición (trazabilidad completa)
create table if not exists public.insumos_movimientos (
  id                   bigint generated always as identity primary key,
  code                 text not null references public.insumos(code),
  tipo                 text,
  evento               text not null,                     -- GENERADO | ASIGNADO | ENTREGADO
  empleado             text,                              -- operario involucrado
  id_empleado_registra uuid,                              -- usuario que escaneó / registró
  fecha                timestamptz not null default now(),
  notas                text
);
create index if not exists idx_insumos_mov_code  on public.insumos_movimientos (code);
create index if not exists idx_insumos_mov_fecha on public.insumos_movimientos (fecha);`;

const estadoBadgeClass: Record<InsumoEstado, string> = {
  GENERADO: 'bg-slate-100 text-slate-700 border-slate-200',
  ASIGNADO: 'bg-green-100 text-green-800 border-green-200',
  ENTREGADO: 'bg-amber-100 text-amber-800 border-amber-200',
};

type Empleado = { value: string; label: string };

export default function InsumosPage() {
  const isMobile = useIsMobile();
  const { insumos, loading, setupNeeded, fetchInsumos, generateCodes, assignCode, renewCode } = useInsumos();

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  // ---------- Empleados (para asignar) ----------
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  useEffect(() => {
    const fetchEmpleados = async () => {
      const { data, error } = await supabaseEtiquetas
        .from('empleados')
        .select('nombres, apellido_paterno, apellido_materno')
        .order('nombres', { ascending: true });
      if (error) { console.error('Error cargando empleados:', error.message); return; }
      const list = (data || [])
        .map((e: any) => [e.nombres, e.apellido_paterno, e.apellido_materno].filter(Boolean).join(' ').toUpperCase().trim())
        .filter(Boolean);
      setEmpleados(Array.from(new Set(list)).map(n => ({ value: n, label: n })));
    };
    fetchEmpleados();
  }, []);

  // ---------- Generar e imprimir ----------
  const [tipo, setTipo] = useState('DIUREX');
  const [cantidad, setCantidad] = useState(6);
  const [notas, setNotas] = useState('');
  const [lastBatch, setLastBatch] = useState<Insumo[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Insumos_${tipo}_${lastBatch[0]?.code ?? ''}`,
  });

  const handleGenerate = async () => {
    const batch = await generateCodes(tipo, cantidad, notas);
    if (batch.length > 0) setLastBatch(batch);
  };

  // ---------- Escáner (asignar / renovar) ----------
  const [scanMode, setScanMode] = useState<'asignar' | 'renovar'>('asignar');
  const [empleado, setEmpleado] = useState('');
  const [renewingFor, setRenewingFor] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [scanMsg, setScanMsg] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const lastScanRef = useRef(0);

  const showScanMsg = (text: string, type: 'info' | 'success' | 'error' = 'info') => setScanMsg({ text, type });

  const processScan = useCallback(async (raw: string) => {
    const code = String(raw || '').trim();
    if (!code) return;
    if (Date.now() - lastScanRef.current < 1500) return; // anti-rebote de la cámara
    lastScanRef.current = Date.now();
    if ('vibrate' in navigator) navigator.vibrate(80);

    // Estamos encadenando la asignación del insumo NUEVO tras una entrega.
    if (renewingFor) {
      const ok = await assignCode(code, renewingFor);
      if (ok) { showScanMsg(`Nuevo insumo ${code} asignado a ${renewingFor}.`, 'success'); setRenewingFor(null); }
      return;
    }

    if (scanMode === 'renovar') {
      const res = await renewCode(code);
      if (res?.renewed) {
        const holder = res.prevHolder || empleado || '';
        setRenewingFor(holder);
        showScanMsg(`Entrega registrada. Escanea el NUEVO insumo${holder ? ` para ${holder}` : ''}.`, 'info');
      }
      return;
    }

    // Modo asignar
    const ok = await assignCode(code, empleado);
    if (ok) showScanMsg(`${code} asignado a ${empleado}.`, 'success');
  }, [renewingFor, scanMode, empleado, assignCode, renewCode]);

  // Callback estable para la cámara: lee siempre la última versión de processScan
  // sin reiniciar la cámara cuando cambian modo/empleado/renovación.
  const processScanRef = useRef(processScan);
  useEffect(() => { processScanRef.current = processScan; }, [processScan]);
  const stableOnScan = useCallback((decoded: string) => { processScanRef.current(decoded); }, []);

  const handleManualSubmit = () => {
    if (!manualCode.trim()) return;
    processScan(manualCode);
    setManualCode('');
  };

  // Ciclo de vida de la cámara (patrón probado del resto de escáneres del sistema).
  useEffect(() => {
    if (!isMounted || !readerRef.current) return;
    if (!html5QrCodeRef.current) html5QrCodeRef.current = new Html5Qrcode(readerRef.current.id, false);
    const qr = html5QrCodeRef.current;

    const cleanup = () => {
      if (qr && qr.isScanning) {
        return qr.stop().catch(err => {
          if (!String(err).includes('not started')) console.error('Fallo al detener el escáner:', err);
        });
      }
      return Promise.resolve();
    };

    if (cameraActive) {
      if (qr.getState() !== Html5QrcodeScannerState.SCANNING) {
        qr.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 160 } },
          stableOnScan,
          () => {},
        ).catch(err => {
          console.error('Error al iniciar cámara:', err);
          showScanMsg('No se pudo iniciar la cámara. Revisa los permisos.', 'error');
          setCameraActive(false);
        });
      }
    } else {
      cleanup();
    }

    return () => { cleanup(); };
  }, [cameraActive, isMounted, stableOnScan]);

  // Al cambiar de modo se cancela cualquier renovación pendiente.
  useEffect(() => { setRenewingFor(null); }, [scanMode]);

  // ---------- Inventario (filtros) ----------
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | InsumoEstado>('TODOS');
  const [filtroTipo, setFiltroTipo] = useState('TODOS');
  const [busqueda, setBusqueda] = useState('');

  const tiposEnUso = useMemo(
    () => Array.from(new Set(insumos.map(i => i.tipo).filter(Boolean))).sort(),
    [insumos],
  );

  const stats = useMemo(() => ({
    total: insumos.length,
    generado: insumos.filter(i => i.estado === 'GENERADO').length,
    asignado: insumos.filter(i => i.estado === 'ASIGNADO').length,
    entregado: insumos.filter(i => i.estado === 'ENTREGADO').length,
  }), [insumos]);

  const insumosFiltrados = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    return insumos.filter(i =>
      (filtroEstado === 'TODOS' || i.estado === filtroEstado) &&
      (filtroTipo === 'TODOS' || i.tipo === filtroTipo) &&
      (!q || i.code.toUpperCase().includes(q) || (i.asignado_a || '').toUpperCase().includes(q)),
    );
  }, [insumos, filtroEstado, filtroTipo, busqueda]);

  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—';

  const copyDDL = () => { navigator.clipboard?.writeText(DDL_SQL).catch(() => {}); };

  const scanMsgClass = scanMsg?.type === 'success'
    ? 'bg-green-50 border-green-200 text-green-800'
    : scanMsg?.type === 'error'
      ? 'bg-red-50 border-red-200 text-red-800'
      : 'bg-blue-50 border-blue-200 text-blue-800';

  return (
    <>
      <Head><title>Insumos</title></Head>
      <div className="max-w-5xl mx-auto p-4 space-y-6">
        <header className="text-center space-y-1">
          <h1 className="text-2xl md:text-3xl font-black text-starbucks-green flex items-center justify-center gap-2">
            <Tags className="h-7 w-7" /> Control de Insumos
          </h1>
          <p className="text-sm text-gray-500">Genera, pega, asigna y renueva insumos con trazabilidad por código.</p>
        </header>

        {setupNeeded && (
          <Alert variant="destructive" className="bg-amber-50 border-amber-200 text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="font-black">Falta crear las tablas en la base de datos</AlertTitle>
            <AlertDescription className="space-y-3">
              <p className="text-xs">Ejecuta este SQL en el editor de Supabase (BD de Etiquetas) y luego pulsa «Reintentar».</p>
              <pre className="text-[10px] leading-relaxed bg-white/70 border border-amber-200 rounded-lg p-3 overflow-x-auto max-h-64 text-slate-800">{DDL_SQL}</pre>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copyDDL} className="gap-1"><ClipboardCopy className="h-3.5 w-3.5" /> Copiar SQL</Button>
                <Button size="sm" onClick={() => fetchInsumos()} className="gap-1 bg-starbucks-green hover:bg-starbucks-dark text-white"><RefreshCw className="h-3.5 w-3.5" /> Reintentar</Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: stats.total, cls: 'text-slate-700' },
            { label: 'Generados', value: stats.generado, cls: 'text-slate-500' },
            { label: 'En uso', value: stats.asignado, cls: 'text-green-600' },
            { label: 'Entregados', value: stats.entregado, cls: 'text-amber-600' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-sm">
              <p className={`text-2xl font-black ${s.cls}`}>{s.value}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="generar" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="generar" className="gap-1 text-xs font-bold"><PackagePlus className="h-4 w-4" /> Generar</TabsTrigger>
            <TabsTrigger value="escaner" className="gap-1 text-xs font-bold"><ScanLine className="h-4 w-4" /> Asignar / Renovar</TabsTrigger>
            <TabsTrigger value="inventario" className="gap-1 text-xs font-bold"><Boxes className="h-4 w-4" /> Inventario</TabsTrigger>
          </TabsList>

          {/* ============ GENERAR ============ */}
          <TabsContent value="generar" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Plus className="h-5 w-5 text-starbucks-green" /> Generar códigos</CardTitle>
                <CardDescription>Crea códigos únicos, imprímelos y pégalos en los insumos.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2 md:col-span-1">
                    <Label className="text-xs font-black uppercase text-gray-400">Tipo de insumo</Label>
                    <Input value={tipo} onChange={e => setTipo(e.target.value.toUpperCase())} placeholder="Ej. DIUREX" className="h-11 rounded-xl font-bold uppercase" />
                    <div className="flex flex-wrap gap-1 pt-1">
                      {TIPOS_SUGERIDOS.map(t => (
                        <button key={t} onClick={() => setTipo(t)} className={`text-[10px] font-bold px-2 py-1 rounded-full border transition-colors ${tipo === t ? 'bg-starbucks-green text-white border-starbucks-green' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>{t}</button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-black uppercase text-gray-400">Cantidad</Label>
                    <Input type="number" min={1} max={200} value={cantidad} onChange={e => setCantidad(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))} className="h-11 rounded-xl font-bold" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-black uppercase text-gray-400">Notas (opcional)</Label>
                    <Input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Lote, proveedor..." className="h-11 rounded-xl" />
                  </div>
                </div>
                <Button onClick={handleGenerate} disabled={loading || setupNeeded || !tipo.trim()} className="w-full h-12 rounded-xl bg-starbucks-green hover:bg-starbucks-dark text-white font-black gap-2">
                  <Plus className="h-4 w-4" /> Generar {cantidad} código(s)
                </Button>

                {lastBatch.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-gray-700 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" /> {lastBatch.length} código(s) listos</p>
                      <Button onClick={handlePrint} variant="outline" className="gap-2 font-bold"><Printer className="h-4 w-4" /> Imprimir</Button>
                    </div>
                    {/* Área imprimible */}
                    <div ref={printRef} style={{ padding: '8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                        {isMounted && lastBatch.map(item => (
                          <div key={item.code} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', textAlign: 'center', breakInside: 'avoid' }}>
                            <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1px', color: '#0f5132' }}>{item.tipo}</div>
                            <Barcode value={item.code} format="CODE128" width={1.5} height={45} fontSize={12} margin={4} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ ESCÁNER ============ */}
          <TabsContent value="escaner" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {scanMode === 'asignar' ? <ScanLine className="h-5 w-5 text-starbucks-green" /> : <Recycle className="h-5 w-5 text-amber-600" />}
                  {scanMode === 'asignar' ? 'Asignar insumo' : 'Renovar insumo'}
                </CardTitle>
                <CardDescription>
                  {scanMode === 'asignar'
                    ? 'Escanea un código disponible y asígnalo a un operario.'
                    : 'Escanea un insumo en uso: se registra la entrega y luego asignas uno nuevo.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button variant={scanMode === 'asignar' ? 'default' : 'outline'} onClick={() => setScanMode('asignar')} className={`h-11 font-bold ${scanMode === 'asignar' ? 'bg-starbucks-green hover:bg-starbucks-dark' : ''}`}>Asignar</Button>
                  <Button variant={scanMode === 'renovar' ? 'default' : 'outline'} onClick={() => setScanMode('renovar')} className={`h-11 font-bold ${scanMode === 'renovar' ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}`}>Renovar</Button>
                </div>

                {/* Operario (solo en asignar; en renovar se hereda del insumo entregado) */}
                {scanMode === 'asignar' && (
                  <div className="space-y-2">
                    <Label className="text-xs font-black uppercase text-gray-400">Operario</Label>
                    <Combobox
                      options={empleados}
                      value={empleado}
                      onValueChange={setEmpleado}
                      placeholder="Selecciona operario..."
                      emptyMessage="No hay empleados."
                      buttonClassName="h-11 rounded-xl font-bold uppercase"
                    />
                  </div>
                )}

                {renewingFor && (
                  <Alert className="bg-amber-50 border-amber-200 text-amber-900">
                    <Recycle className="h-4 w-4" />
                    <AlertTitle className="font-black text-sm">Asignar insumo nuevo</AlertTitle>
                    <AlertDescription className="text-xs">Escanea o captura el código del NUEVO insumo para <span className="font-black">{renewingFor || 'el operario'}</span>.</AlertDescription>
                  </Alert>
                )}

                {/* Cámara */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-3">
                  <div id="insumos-reader" ref={readerRef} className="w-full rounded-lg overflow-hidden" style={{ display: cameraActive ? 'block' : 'none' }} />
                  {!cameraActive && (
                    <div className="text-center py-6 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg">Cámara desactivada</div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button onClick={() => setCameraActive(true)} disabled={cameraActive || setupNeeded || (scanMode === 'asignar' && !empleado && !renewingFor)} className="h-10 bg-blue-600 hover:bg-blue-700 text-white gap-2"><Camera className="h-4 w-4" /> Iniciar cámara</Button>
                    <Button onClick={() => setCameraActive(false)} disabled={!cameraActive} variant="outline" className="h-10 gap-2"><X className="h-4 w-4" /> Detener</Button>
                  </div>
                </div>

                {/* Captura manual / escáner físico */}
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase text-gray-400">Captura manual / escáner físico</Label>
                  <div className="flex gap-2">
                    <Input
                      value={manualCode}
                      onChange={e => setManualCode(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
                      placeholder="INS-000001"
                      disabled={setupNeeded}
                      className="h-11 rounded-xl font-mono font-bold uppercase"
                    />
                    <Button onClick={handleManualSubmit} disabled={loading || setupNeeded || !manualCode.trim()} className="h-11 px-5 bg-starbucks-green hover:bg-starbucks-dark text-white font-bold">OK</Button>
                  </div>
                </div>

                {scanMsg && (
                  <div className={`text-center text-sm font-bold p-3 rounded-xl border ${scanMsgClass}`}>{scanMsg.text}</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ INVENTARIO ============ */}
          <TabsContent value="inventario" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg"><Boxes className="h-5 w-5 text-starbucks-green" /> Inventario</CardTitle>
                    <CardDescription>{insumosFiltrados.length} de {insumos.length} insumos</CardDescription>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => fetchInsumos()} disabled={loading} title="Actualizar"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-3 gap-2">
                  <Input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar código u operario..." className="h-10 rounded-xl" />
                  <Select value={filtroEstado} onValueChange={(v) => setFiltroEstado(v as any)}>
                    <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Estado" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TODOS">Todos los estados</SelectItem>
                      <SelectItem value="GENERADO">Generado</SelectItem>
                      <SelectItem value="ASIGNADO">Asignado</SelectItem>
                      <SelectItem value="ENTREGADO">Entregado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                    <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Tipo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TODOS">Todos los tipos</SelectItem>
                      {tiposEnUso.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="border border-gray-200 rounded-xl overflow-auto max-h-[420px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-gray-50 z-10">
                      <TableRow>
                        <TableHead className="text-xs font-black">Código</TableHead>
                        <TableHead className="text-xs font-black">Tipo</TableHead>
                        <TableHead className="text-xs font-black">Estado</TableHead>
                        <TableHead className="text-xs font-black">Operario</TableHead>
                        <TableHead className="text-xs font-black text-center">Ciclos</TableHead>
                        <TableHead className="text-xs font-black">Última entrega</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {insumosFiltrados.length > 0 ? insumosFiltrados.map(i => (
                        <TableRow key={i.code}>
                          <TableCell className="font-mono text-xs font-bold">{i.code}</TableCell>
                          <TableCell className="text-xs">{i.tipo}</TableCell>
                          <TableCell><Badge variant="outline" className={`text-[10px] font-black ${estadoBadgeClass[i.estado] || ''}`}>{i.estado}</Badge></TableCell>
                          <TableCell className="text-xs">{i.asignado_a || '—'}</TableCell>
                          <TableCell className="text-xs text-center font-bold">{i.ciclos}</TableCell>
                          <TableCell className="text-xs text-gray-500">{fmt(i.fecha_entregado)}</TableCell>
                        </TableRow>
                      )) : (
                        <TableRow><TableCell colSpan={6} className="text-center text-gray-400 py-10 text-sm">Sin insumos que coincidan.</TableCell></TableRow>
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
