-- ============================================================================
-- Tabla para devoluciones de plataformas AJENAS a Mercado Libre
-- (TikTok, Walmart, Amazon, Shein, etc.)
--
-- Por qué tabla aparte y no reusar devoluciones_ml:
--   devoluciones_ml es, en su mayoría, el volcado del reporte de Mercado Libre
--   (se sube un Excel de ML emparejando por num_venta). Guardar aquí las
--   externas las aísla por completo de ese proceso de carga y evita arrastrar
--   ~40 columnas financieras de ML que en una externa siempre quedarían NULL.
--
-- El discriminador de plataforma es `origen` (NO el transportista: FedEx puede
-- transportar un paquete de Mercado Libre; son ejes distintos).
--
-- Correr en el SQL Editor de Supabase (proyecto de ETIQUETAS).
-- ============================================================================

create table if not exists public.devoluciones_externas (
  id             bigint generated always as identity primary key,
  created_at     timestamptz  not null default now(),
  code           text         not null,          -- código de barras escaneado (la identidad)
  origen         text         not null,          -- plataforma: TikTok, Walmart, Amazon, Shein, Otro
  tienda         text,                            -- empresa/marca interna (opcional en externas)
  sku            text,
  transportista  text,                            -- paquetería que trae la devolución
  driver_name    text,
  driver_plate   text,
  entregado      boolean      not null default true,
  date_entregado timestamptz,
  name_inc       uuid,                            -- usuario que la procesó (auth uid)
  observacion    text,
  product_name   text,                            -- producto (de etiquetas_tiktok al escanear)
  order_id       text                             -- id de la orden (de etiquetas_tiktok)
);

-- Búsquedas por código (dedup / "¿ya se devolvió?")
create index if not exists idx_devoluciones_externas_code
  on public.devoluciones_externas (code);

-- ----------------------------------------------------------------------------
-- RLS. La app entra con un usuario autenticado (rol `authenticated`).
-- Ajusta estas políticas para que coincidan con las de devoluciones_ml si esa
-- tabla usa condiciones más finas; estas son permisivas para authenticated.
-- ----------------------------------------------------------------------------
alter table public.devoluciones_externas enable row level security;

create policy "auth lee devoluciones_externas"
  on public.devoluciones_externas for select
  to authenticated using (true);

create policy "auth inserta devoluciones_externas"
  on public.devoluciones_externas for insert
  to authenticated with check (true);

create policy "auth actualiza devoluciones_externas"
  on public.devoluciones_externas for update
  to authenticated using (true) with check (true);
