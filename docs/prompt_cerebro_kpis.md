# Prompt para el Claude del proyecto "cerebro" (admin-mod-cerebro)

Copia y pega lo de abajo en el Claude de ese repo.

---

Quiero agregar una página de **KPIs de calidad / incidencias** a este proyecto.
Los datos ya existen en la **misma base de Supabase que ya usa este proyecto**
(proyecto ETIQUETAS). No hay que crear tablas ni tocar el otro sistema: ya dejé
listas unas **vistas SQL** que hacen todo el cálculo. Tu trabajo es solo
**consumirlas y graficarlas**. Reutiliza el cliente de Supabase que ya existe en
este repo (misma URL y key).

## Vistas disponibles (todas en el schema `public`)

**Agregadas (una sola fila / ranking — para tarjetas y gráficas directas):**

- `v_kpi_resumen` → tarjetas principales. Columnas: `revisados`, `con_incidencia`,
  `con_discrepancia`, `reportados`, `fpy_pct` (First Pass Yield %),
  `pct_con_incidencia`, `pct_liberados_ok`, `mttr_min` (tiempo promedio de
  retrabajo en minutos).
- `v_kpi_torre_control` → una fila: `revisados`, `liberados`, `en_retrabajo`,
  `reportados`, `pendientes`.
- `v_kpi_incidencias_por_picker` → ranking. Columnas: `picker`, `picker_id`,
  `total`, `abiertas`, `mttr_min`. Ya viene ordenado por `total` desc.
- `v_kpi_producto_top` → `producto`, `total`, `piezas_afectadas`. Ordenado desc.
- `v_kpi_tipos_error` → `tipo`, `total`. Ordenado desc. (Unifica discrepancias de
  QC + motivos de reporte.)
- `v_kpi_tendencia_diaria` / `v_kpi_tendencia_semanal` / `v_kpi_tendencia_mensual`
  → `periodo` (fecha), `incidencias`. Para gráficas de línea.
- `v_kpi_retrabajos_abiertos` → una fila: `abiertos`, `horas_promedio_abierto`,
  `horas_mas_viejo`. (Semáforo de cuello de botella.)

**Fact (una fila por unidad — para filtrar por rango de fecha):**

- `v_kpi_paquetes` → un renglón por paquete revisado en QC. Columnas útiles:
  `code`, `status`, `date_cal` (timestamp de calificación), `picker_id`,
  `tuvo_incidencia` (bool), `tuvo_discrepancia` (bool), `reportado` (bool),
  `liberado` (bool), `sku`, `product`, `sales_num`.
- `v_kpi_incidencias` → un renglón por incidencia. Columnas: `bar_code`,
  `inicio_retrabajo`, `fin_retrabajo`, `abierta` (bool), `minutos_retrabajo`,
  `tipo_error`, `producto_solicitado`, `delta_piezas`, `picker_nombre`,
  `reportador_nombre`, `fecha`.

## Cómo armar la página

1. **Tarjetas arriba (torre de control + resumen):** un `select *` a
   `v_kpi_torre_control` y a `v_kpi_resumen`. Muestra FPY %, % con incidencia,
   % liberados OK y MTTR como tarjetas grandes. La torre (revisados/liberados/
   en retrabajo/reportados/pendientes) como fila de contadores.

2. **Selector de rango de fecha (hoy / semana / mes / personalizado):** las
   tarjetas de arriba son histórico completo. Para respetar el rango, calcula tú
   sobre las vistas **fact**. Ejemplo del FPY y % con incidencia por rango:

   ```sql
   select
     count(*)                                          as revisados,
     round(100.0 * count(*) filter (where not tuvo_incidencia)
                 / nullif(count(*),0), 2)              as fpy_pct,
     round(100.0 * count(*) filter (where tuvo_incidencia)
                 / nullif(count(*),0), 2)              as pct_con_incidencia
   from v_kpi_paquetes
   where date_cal >= :desde and date_cal < :hasta;
   ```

   Con supabase-js sería sobre `v_kpi_paquetes` con `.gte('date_cal', desde)` y
   `.lt('date_cal', hasta)`, trayendo las filas y agregando en el cliente, o con
   un RPC si prefieres agregación en el servidor.

3. **Gráficas:**
   - Barras: `v_kpi_tipos_error` (tipo de error más frecuente),
     `v_kpi_producto_top` (top productos), `v_kpi_incidencias_por_picker`
     (incidencias por picker).
   - Línea: `v_kpi_tendencia_diaria/_semanal/_mensual` (tabs para cambiar).
   - Semáforo: `v_kpi_retrabajos_abiertos` — si `horas_mas_viejo` es alto, alerta.

4. Usa la librería de gráficas que ya tenga este proyecto. Diseño consistente con
   el resto del panel. Todo es **solo lectura** (nunca escribas a estas vistas).

## Notas de negocio

- Unidad = una etiqueta (`personal.code`). No se agrupa por pedido/orden.
- "Revisado" = pasó por QC (`date_cal` no nulo).
- "Con incidencia" = tuvo discrepancia (fue a retrabajo) **o** quedó REPORTADO.
- "Liberado correctamente" = ENTREGADO que nunca tuvo incidencia.
- FPY = % de revisados que pasaron sin ninguna incidencia.

Primero dame un plan de la página (layout + qué vista alimenta cada bloque)
antes de escribir código.
