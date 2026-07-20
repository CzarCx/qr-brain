-- ============================================================================
-- Agrega a `devoluciones_externas` los datos que llegan de etiquetas_tiktok al
-- escanear una devolución de TikTok: nombre del producto y order id.
--
-- Se enlazan al escanear (processCode busca por tracking_number en
-- etiquetas_tiktok) y se persisten al finalizar la vuelta. Para el resto de las
-- externas (plataforma elegida a mano, sin match) quedan NULL, sin problema.
--
-- Idempotente: `add column if not exists`. Correr en el SQL Editor de Supabase
-- (proyecto de ETIQUETAS).
-- ============================================================================

alter table public.devoluciones_externas
  add column if not exists product_name text,   -- producto (etiquetas_tiktok.product_name)
  add column if not exists order_id     text;    -- id de la orden (etiquetas_tiktok.order_id)
