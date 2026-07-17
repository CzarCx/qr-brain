-- ============================================================================
-- Arreglo: el combo "Selecciona paquetería" en /devoluciones sale VACÍO.
--
-- Causa: la tabla `paqueterias` devuelve 0 filas para la app. Comparado con otras
-- tablas, se comporta igual que `etiquetas_i` y `roles` (que SÍ tienen datos pero
-- están ocultas al rol anónimo): tiene RLS activo pero le falta una política de
-- SELECT para el rol con el que entra la app. Sin política, PostgREST no da error,
-- simplemente devuelve 0 filas.
--
-- Correr en el SQL Editor de Supabase (proyecto de ETIQUETAS).
--
-- ANTES de correrlo, confirma en el Table Editor que `paqueterias` SÍ tiene filas.
--   - Si tiene filas  -> es esto (falta la política). Corre el bloque de abajo.
--   - Si está vacía   -> primero inserta tus paqueterías (bloque opcional al final).
-- El catálogo de respaldo del código te desbloquea mientras tanto en cualquier caso.
-- ============================================================================

-- Es un catálogo, no dato sensible: se permite leerlo a la app (authenticated) y,
-- por consistencia con cómo se leen sku_m/empleados, también a anon.
alter table public.paqueterias enable row level security;   -- no-op si ya estaba

create policy "todos leen paqueterias"
  on public.paqueterias for select
  to anon, authenticated
  using (true);

-- Si ya existe una policy con ese nombre, borra la anterior y vuelve a crearla:
--   drop policy "todos leen paqueterias" on public.paqueterias;

-- ----------------------------------------------------------------------------
-- OPCIONAL — solo si la tabla está VACÍA, siembra el catálogo (ajusta la lista):
-- ----------------------------------------------------------------------------
-- insert into public.paqueterias (nombre) values
--   ('FEDEX'), ('ESTAFETA'), ('DHL'), ('PAQUETEXPRESS'),
--   ('MERCADO ENVÍOS'), ('UPS'), ('99 MINUTOS'), ('CORREOS DE MÉXICO');
