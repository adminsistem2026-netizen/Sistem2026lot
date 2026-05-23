-- ============================================================
-- CANDIDATO RLS: RESULTADOS Y CONFIGURACION GLOBAL
-- NO aplicar a produccion sin comparar antes contra la base real.
--
-- Objetivo:
-- cerrar el paquete de politicas candidatas con:
--   - winning_numbers
--   - system_config
--
-- Estas tablas no son las mas sensibles para el alcance del vendedor,
-- pero si para integridad operativa y administracion global.
-- ============================================================


-- ============================================================
-- winning_numbers
-- ============================================================

-- Regla objetivo:
-- - lectura abierta para la app, porque distintos modulos consumen
--   resultados para mostrar o calcular premios
-- - escritura reservada a admin duenio de la loteria o super_admin
--
-- Nota:
-- el frontend actual guarda resultados con delete + insert.
-- Por eso se incluye DELETE ademas de INSERT.

DROP POLICY IF EXISTS "winning_numbers_select" ON public.winning_numbers;
DROP POLICY IF EXISTS "winning_numbers_insert" ON public.winning_numbers;
DROP POLICY IF EXISTS "winning_numbers_delete" ON public.winning_numbers;

CREATE POLICY "winning_numbers_select" ON public.winning_numbers
  FOR SELECT USING (true);

CREATE POLICY "winning_numbers_insert" ON public.winning_numbers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lotteries l
      WHERE l.id = winning_numbers.lottery_id
        AND (
          l.admin_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'super_admin'
          )
        )
    )
  );

CREATE POLICY "winning_numbers_delete" ON public.winning_numbers
  FOR DELETE USING (
    registered_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.lotteries l
      WHERE l.id = winning_numbers.lottery_id
        AND l.admin_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );


-- ============================================================
-- system_config
-- ============================================================

-- Regla objetivo:
-- - lectura abierta
-- - escritura solo para super_admin

DROP POLICY IF EXISTS "system_config_select" ON public.system_config;
DROP POLICY IF EXISTS "system_config_update" ON public.system_config;
DROP POLICY IF EXISTS "system_config_insert" ON public.system_config;
DROP POLICY IF EXISTS "system_config_delete" ON public.system_config;

CREATE POLICY "system_config_select" ON public.system_config
  FOR SELECT USING (true);

CREATE POLICY "system_config_insert" ON public.system_config
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

CREATE POLICY "system_config_update" ON public.system_config
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

CREATE POLICY "system_config_delete" ON public.system_config
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );


-- ============================================================
-- RECOMENDACION COMPLEMENTARIA
-- ============================================================

-- Si la operacion de resultados crece en complejidad, podria convenir
-- reemplazar el delete + insert directo por una RPC especifica
-- (`save_winning_numbers`) para dejar una sola via de escritura.

