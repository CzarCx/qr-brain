-- ============================================================================
-- MIGRACIÓN COMPLETA: etiquetas de paqueterías ajenas a Mercado Libre.
--
-- Hace dos cosas para dar trazabilidad a etiquetas externas (Walmart, TikTok
-- Shop, Amazon, Estafeta, etc.) reutilizando la MISMA tabla `personal`:
--   1) `code` -> TEXT en `personal` y `etiquetas_i` (acepta códigos alfanuméricos).
--   2) Agrega el clasificador `origen` a `personal` + índice + vista de auditoría.
--
-- CÓMO CORRERLA: pégala completa en el SQL Editor de Supabase (proyecto de
-- ETIQUETAS) y ejecútala. Nada más.
--
-- Notas:
--   * Todo va en UNA transacción: si algo falla, revierte solo (no queda a medias).
--   * `alter ... type text` reescribe `personal` y `etiquetas_i` con lock
--     exclusivo => hazlo en un momento de BAJO tráfico.
--   * Es idempotente: si ya la corriste, volver a correrla no hace daño
--     (text::text es válido; `add column if not exists`; `create index if not exists`).
--   * Si truena por una FK que apunta a `code` o por otra vista dependiente,
--     mándame el mensaje de error y ajusto el script (la transacción ya revirtió).
-- ============================================================================

begin;

-- 1) La vista de auditoría depende de `personal` (SELECT *) y bloquearía el ALTER;
--    se elimina y se recrea idéntica al final.
drop view if exists public.v_personal_externas;

-- 2) `code` -> TEXT para aceptar códigos alfanuméricos. Sentido seguro: numérico
--    -> text no pierde datos (y si ya es text, text::text es un no-op válido).
alter table public.personal    alter column code type text using code::text;
alter table public.etiquetas_i alter column code type text using code::text;

-- 3) Clasificador de origen. Default 'Mercado Libre' => backfill automático de
--    TODAS las filas existentes; ninguna queda sin clasificar.
alter table public.personal
  add column if not exists origen text not null default 'Mercado Libre';

-- Auditar / filtrar externas se vuelve un WHERE indexado.
create index if not exists idx_personal_origen
  on public.personal (origen);

-- 4) Vista de auditoría: la ergonomía de "una tabla solo de externas" sin serlo.
--    security_invoker => respeta las RLS de `personal` con el usuario que consulta.
create view public.v_personal_externas
  with (security_invoker = true) as
  select * from public.personal
  where origen is distinct from 'Mercado Libre';

commit;
