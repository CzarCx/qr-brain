-- ============================================================================
-- migracion_kpis.sql — KPIs de calidad / incidencias
-- ----------------------------------------------------------------------------
-- Paste-and-run en el SQL Editor de Supabase (proyecto ETIQUETAS).
-- Es ADITIVO: agrega 1 columna + vistas. No borra ni modifica datos.
--
-- Unidad de negocio: "pedido" = una etiqueta = personal.code.
--
-- Concepto de "incidencia" (unificado en las vistas):
--   (a) DISCREPANCIA: fila en registro_incidencias_en_paquetes_listos_para_entrega
--       (paquete que se mandó a retrabajo por cantidad/producto).
--   (b) REPORTE:      personal.status = 'REPORTADO' (motivo en personal.details,
--       tomado del catálogo `reports`). NO vive en la tabla de incidencias.
--
-- "Revisado en QC" = personal.date_cal IS NOT NULL.
-- "Liberado"       = personal.status = 'ENTREGADO'.
-- ============================================================================

-- 1) tipo_error en la tabla de incidencias -----------------------------------
alter table public.registro_incidencias_en_paquetes_listos_para_entrega
  add column if not exists tipo_error text;

comment on column public.registro_incidencias_en_paquetes_listos_para_entrega.tipo_error is
  'Categoría de la discrepancia: CANTIDAD | PRODUCTO | CANTIDAD_Y_PRODUCTO | OTRO. '
  'La escribe el escáner al reportar; el backfill de abajo la deriva para filas viejas.';

-- Backfill para filas existentes (deriva el tipo de los datos ya guardados) ---
update public.registro_incidencias_en_paquetes_listos_para_entrega i
set tipo_error = case
    when i.producto_solicitado is distinct from i.producto_despachado
         and coalesce(i.piezas_solicitadas,0) <> coalesce(i.piezas_despachadas,0)
      then 'CANTIDAD_Y_PRODUCTO'
    when i.producto_solicitado is distinct from i.producto_despachado
      then 'PRODUCTO'
    when coalesce(i.piezas_solicitadas,0) <> coalesce(i.piezas_despachadas,0)
      then 'CANTIDAD'
    else 'OTRO'
  end
where i.tipo_error is null;

create index if not exists idx_incidencias_tipo_error
  on public.registro_incidencias_en_paquetes_listos_para_entrega (tipo_error);
create index if not exists idx_incidencias_inicio_retrabajo
  on public.registro_incidencias_en_paquetes_listos_para_entrega (inicio_retrabajo);

-- ============================================================================
-- VISTAS "FACT" (una fila por unidad) — para filtrar por rango de fecha en el
-- dashboard. El cerebro hace WHERE + agregación sobre estas.
-- ============================================================================

-- Nombre legible del empleado (helper) ---------------------------------------
create or replace view public.v_empleado_nombre as
select
  e.id,
  upper(trim(concat_ws(' ', e.nombres, e.apellido_paterno, e.apellido_materno))) as nombre
from public.empleados e;

-- Un renglón por paquete revisado en QC --------------------------------------
-- Base de FPY, % con incidencia, % liberados, torre de control.
create or replace view public.v_kpi_paquetes as
select
  p.code,
  p.status,
  p.date_cal,
  p.sku,
  p.product,
  p.sales_num,
  p.id_empleado_despacha                          as picker_id,
  (inc.bar_code is not null)                      as tuvo_discrepancia,
  (p.status = 'REPORTADO')                        as reportado,
  ((inc.bar_code is not null) or p.status = 'REPORTADO') as tuvo_incidencia,
  (p.status = 'ENTREGADO')                        as liberado
from public.personal p
left join (
  select distinct bar_code
  from public.registro_incidencias_en_paquetes_listos_para_entrega
  where bar_code is not null
) inc on inc.bar_code = p.code
where p.date_cal is not null;   -- solo lo que pasó por QC

-- Un renglón por incidencia (discrepancia) enriquecida -----------------------
create or replace view public.v_kpi_incidencias as
select
  i.id,
  i.bar_code,
  i.inicio_retrabajo,
  i.fin_retrabajo,
  (i.fin_retrabajo is null)                       as abierta,
  case when i.fin_retrabajo is not null
       then round(extract(epoch from (i.fin_retrabajo - i.inicio_retrabajo)) / 60.0, 1)
  end                                             as minutos_retrabajo,
  i.tipo_error,
  i.producto_solicitado,
  i.producto_despachado,
  coalesce(i.piezas_solicitadas,0)                as piezas_solicitadas,
  coalesce(i.piezas_despachadas,0)                as piezas_despachadas,
  abs(coalesce(i.piezas_solicitadas,0) - coalesce(i.piezas_despachadas,0)) as delta_piezas,
  i.id_empleado                                   as picker_id,
  pick.nombre                                     as picker_nombre,
  i.id_reportador,
  rep.nombre                                      as reportador_nombre,
  i.fecha
from public.registro_incidencias_en_paquetes_listos_para_entrega i
left join public.v_empleado_nombre pick on pick.id = i.id_empleado
left join public.v_empleado_nombre rep  on rep.id  = i.id_reportador;

-- ============================================================================
-- VISTAS AGREGADAS (listas para tarjetas) — histórico completo.
-- Para acotar por rango, usa las vistas fact de arriba.
-- ============================================================================

-- Resumen global: FPY, %, MTTR ------------------------------------------------
create or replace view public.v_kpi_resumen as
select
  count(*)                                                     as revisados,
  count(*) filter (where tuvo_incidencia)                     as con_incidencia,
  count(*) filter (where tuvo_discrepancia)                   as con_discrepancia,
  count(*) filter (where reportado)                           as reportados,
  -- First Pass Yield: % que pasó sin ninguna incidencia
  round(100.0 * count(*) filter (where not tuvo_incidencia) / nullif(count(*),0), 2) as fpy_pct,
  round(100.0 * count(*) filter (where tuvo_incidencia)     / nullif(count(*),0), 2) as pct_con_incidencia,
  -- % liberados correctamente: de los ENTREGADO, cuántos nunca tuvieron incidencia
  round(100.0 * count(*) filter (where liberado and not tuvo_incidencia)
              / nullif(count(*) filter (where liberado),0), 2)                       as pct_liberados_ok,
  (select round(avg(minutos_retrabajo)::numeric, 1)
     from public.v_kpi_incidencias where minutos_retrabajo is not null)             as mttr_min
from public.v_kpi_paquetes;

-- Torre de control: estado actual del piso -----------------------------------
create or replace view public.v_kpi_torre_control as
select
  count(*) filter (where status = any (array['CALIFICADO','REPORTADO','RETRABAJANDO','ENTREGADO'])) as revisados,
  count(*) filter (where status = 'ENTREGADO')                                     as liberados,
  count(*) filter (where status = 'RETRABAJANDO')                                  as en_retrabajo,
  count(*) filter (where status = 'REPORTADO')                                     as reportados,
  count(*) filter (where status = any (array['ASIGNADO','SURTIDO']))               as pendientes
from public.personal;

-- Incidencias por picker ------------------------------------------------------
create or replace view public.v_kpi_incidencias_por_picker as
select
  coalesce(picker_nombre, 'SIN ASIGNAR')          as picker,
  picker_id,
  count(*)                                         as total,
  count(*) filter (where abierta)                  as abiertas,
  round(avg(minutos_retrabajo)::numeric, 1)        as mttr_min
from public.v_kpi_incidencias
group by picker_id, picker_nombre
order by total desc;

-- Producto con más incidencias ------------------------------------------------
create or replace view public.v_kpi_producto_top as
select
  coalesce(producto_solicitado, 'SIN DATO')       as producto,
  count(*)                                         as total,
  sum(delta_piezas)                                as piezas_afectadas
from public.v_kpi_incidencias
group by producto_solicitado
order by total desc;

-- Tipo de error más frecuente (UNIFICA discrepancias + motivos de reporte) ----
create or replace view public.v_kpi_tipos_error as
select tipo, count(*) as total
from (
  -- (a) discrepancias de QC
  select coalesce(tipo_error, 'OTRO') as tipo
  from public.registro_incidencias_en_paquetes_listos_para_entrega
  union all
  -- (b) motivos de reporte (personal.details en los REPORTADO)
  select coalesce(nullif(trim(details), ''), 'REPORTE SIN MOTIVO') as tipo
  from public.personal
  where status = 'REPORTADO'
) t
group by tipo
order by total desc;

-- Tendencias ------------------------------------------------------------------
create or replace view public.v_kpi_tendencia_diaria as
select date_trunc('day',   inicio_retrabajo)::date as periodo, count(*) as incidencias
from public.registro_incidencias_en_paquetes_listos_para_entrega
where inicio_retrabajo is not null
group by 1 order by 1;

create or replace view public.v_kpi_tendencia_semanal as
select date_trunc('week',  inicio_retrabajo)::date as periodo, count(*) as incidencias
from public.registro_incidencias_en_paquetes_listos_para_entrega
where inicio_retrabajo is not null
group by 1 order by 1;

create or replace view public.v_kpi_tendencia_mensual as
select date_trunc('month', inicio_retrabajo)::date as periodo, count(*) as incidencias
from public.registro_incidencias_en_paquetes_listos_para_entrega
where inicio_retrabajo is not null
group by 1 order by 1;

-- Retrabajos abiertos + antigüedad (cuello de botella) -----------------------
create or replace view public.v_kpi_retrabajos_abiertos as
select
  count(*)                                                                as abiertos,
  round(avg(extract(epoch from (now() - inicio_retrabajo)) / 3600.0)::numeric, 1) as horas_promedio_abierto,
  round(max(extract(epoch from (now() - inicio_retrabajo)) / 3600.0)::numeric, 1) as horas_mas_viejo
from public.registro_incidencias_en_paquetes_listos_para_entrega
where fin_retrabajo is null;

-- ============================================================================
-- Permisos: el dashboard (cerebro) solo lee. Ajusta el rol a tu setup.
-- Si el cerebro usa la API con sesión autenticada, esto basta:
-- ============================================================================
grant select on
  public.v_empleado_nombre,
  public.v_kpi_paquetes,
  public.v_kpi_incidencias,
  public.v_kpi_resumen,
  public.v_kpi_torre_control,
  public.v_kpi_incidencias_por_picker,
  public.v_kpi_producto_top,
  public.v_kpi_tipos_error,
  public.v_kpi_tendencia_diaria,
  public.v_kpi_tendencia_semanal,
  public.v_kpi_tendencia_mensual,
  public.v_kpi_retrabajos_abiertos
to authenticated;
-- Si el cerebro consulta con la anon key, agrega también `, anon`.
