-- ============================================================================
-- Clasificador de ORIGEN para la tabla `personal`.
--
-- Objetivo: poder escanear y dar trazabilidad a etiquetas de paqueterías AJENAS
-- a Mercado Libre (Walmart, TikTok Shop, Amazon, Estafeta, etc.) reutilizando la
-- MISMA tabla `personal`. Así heredan gratis:
--   - la cadena de tiempos por empleado (date_ini / date_esti),
--   - el ciclo de estatus (ASIGNADO -> CALIFICADO -> ENTREGADO),
--   - y los flujos de calificar / entrega (que operan por `code`).
--
-- Por qué la MISMA tabla y no una aparte:
--   la cadena date_ini/date_esti se calcula por-empleado a partir del último
--   date_esti en `personal`. Separarlas rompería esa cadena (habría que mezclar
--   dos tablas por tiempo). Con `origen` como discriminador indexado, auditar las
--   externas es un WHERE, no un JOIN.
--
-- Correr en el SQL Editor de Supabase (proyecto de ETIQUETAS).
-- ============================================================================

-- Default 'Mercado Libre' => backfill automático de TODAS las filas existentes;
-- ninguna fila puede quedar sin clasificar. En Postgres 15 es metadata-only.
alter table public.personal
  add column if not exists origen text not null default 'Mercado Libre';

-- Auditar / filtrar externas se vuelve un WHERE indexado.
create index if not exists idx_personal_origen
  on public.personal (origen);

-- Vista de auditoría: la ergonomía de "una tabla solo de externas" sin serlo.
-- security_invoker => respeta las RLS de `personal` con el usuario que consulta.
create or replace view public.v_personal_externas
  with (security_invoker = true) as
  select * from public.personal
  where origen is distinct from 'Mercado Libre';
