-- ============================================================================
-- `personal.date_scan`: conserva la hora del PRIMER ESCANEO del registro.
--
-- POR QUÉ: `personal.date` es "el día/hora al que pertenece el registro" y toda la
-- app filtra por él (.gte/.lte). Cuando un registro entra a `personal` desde
-- `personal_prog` (Cargar Producción), `date` toma la hora de ESA carga — que es el
-- comportamiento deseado y NO se toca. El efecto colateral es que se pierde la hora
-- del escaneo original, que es la que necesita el tablero de KPIs por hora.
--
-- QUÉ HACE: agrega una columna puramente ADITIVA. No cambia el tipo, el significado
-- ni el llenado de `date`, `date_ini`, `date_esti` ni `date_cal`.
--
-- REGLAS (garantizadas por el trigger, no por la app):
--   * INSERT: si la app no manda `date_scan`, se fija solo = `date` de ese momento.
--   * UPDATE: una vez que tiene valor es INMUTABLE — ningún UPDATE lo puede pisar.
--     Si está en NULL (filas históricas), sí se permite establecerlo (para un
--     backfill futuro, si se decide hacerlo).
--
-- CÓMO CORRERLA: pégala completa en el SQL Editor de Supabase (proyecto de
-- ETIQUETAS) y ejecútala. Es idempotente.
-- ============================================================================

begin;

-- 1) La columna nueva. Nullable: las filas históricas se quedan en NULL (ver nota
--    de backfill al final del archivo).
alter table public.personal
  add column if not exists date_scan timestamptz null;

comment on column public.personal.date_scan is
  'Hora del primer escaneo del registro. Se fija UNA sola vez al crearlo y es inmutable: '
  'a diferencia de `date`, NO se reescribe cuando el registro se carga desde personal_prog. '
  'Usar esta columna para agrupar KPIs por hora real de escaneo.';

-- 2) El invariante vive en la BD, no en la app: así ningún camino de código
--    (actual o futuro) puede pisar el valor por descuido.
create or replace function public.personal_set_date_scan()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- Si la app mandó la hora original (caso Cargar Producción, que copia
    -- personal_prog.date), se respeta. Si no, cae al `date` de ese momento —
    -- que en una creación normal ES la hora del escaneo.
    new.date_scan := coalesce(new.date_scan, new.date);
  else
    -- UPDATE: inmutable una vez establecido. `coalesce(old, new)` conserva el
    -- valor viejo si existe, y permite fijarlo si venía en NULL.
    new.date_scan := coalesce(old.date_scan, new.date_scan);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_personal_set_date_scan on public.personal;
create trigger trg_personal_set_date_scan
  before insert or update on public.personal
  for each row execute function public.personal_set_date_scan();

-- 3) El tablero de KPIs agrupa/filtra por esta columna.
create index if not exists idx_personal_date_scan
  on public.personal (date_scan);

commit;

-- ----------------------------------------------------------------------------
-- BACKFILL DE HISTÓRICOS — NO INCLUIDO A PROPÓSITO.
--
-- Las filas que ya existen quedan con date_scan = NULL. Para las que se cargaron
-- desde personal_prog, su `date` es la hora de la RECARGA, no la del escaneo: un
-- backfill con date_scan = date sería inexacto y quedaría indistinguible de un
-- dato bueno. Por eso NO se hace aquí.
--
-- Si se decide hacerlo, este es el comando (el trigger lo permite porque el valor
-- viejo es NULL):
--   update public.personal set date_scan = date where date_scan is null;
-- ----------------------------------------------------------------------------
