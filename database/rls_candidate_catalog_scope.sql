-- ============================================================
-- CANDIDATO RLS: CATALOGO Y PREMIOS
-- NO aplicar a produccion sin comparar antes contra la base real.
--
-- Objetivo:
-- complementar el bloque movil con politicas candidatas para:
--   - winning_tickets
--   - lotteries
--   - draw_times
--
-- Este archivo busca reflejar el comportamiento esperado del
-- frontend actual sin afirmar todavia que coincide exactamente con
-- produccion.
-- ============================================================


-- ============================================================
-- winning_tickets
-- ============================================================

-- Regla objetivo:
-- - seller: solo sus premios
-- - sub_admin: premios de su red si ese rol esta activo
-- - admin: premios de su red
-- - super_admin: acceso global
--
-- Nota:
-- si produccion solo permite que seller marque pagos desde otra capa,
-- esta politica deberia endurecerse despues.

DROP POLICY IF EXISTS winning_tickets_admin_select ON public.winning_tickets;
DROP POLICY IF EXISTS winning_tickets_seller_update ON public.winning_tickets;
DROP POLICY IF EXISTS winning_tickets_select ON public.winning_tickets;
DROP POLICY IF EXISTS winning_tickets_update ON public.winning_tickets;

CREATE POLICY winning_tickets_select ON public.winning_tickets
  FOR SELECT USING (
    seller_id = auth.uid()
    OR admin_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles s
      WHERE s.id = winning_tickets.seller_id
        AND s.sub_admin_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

CREATE POLICY winning_tickets_update ON public.winning_tickets
  FOR UPDATE USING (
    seller_id = auth.uid()
    OR admin_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  )
  WITH CHECK (
    seller_id = auth.uid()
    OR admin_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );


-- ============================================================
-- lotteries
-- ============================================================

-- Regla objetivo:
-- - seller y sub_admin leen loterias de su admin padre
-- - admin lee sus loterias
-- - super_admin ve todo
-- - loterias globales (`admin_id IS NULL`) siguen visibles

DROP POLICY IF EXISTS "lotteries_select" ON public.lotteries;
DROP POLICY IF EXISTS "lotteries_insert" ON public.lotteries;
DROP POLICY IF EXISTS "lotteries_update" ON public.lotteries;

CREATE POLICY "lotteries_select" ON public.lotteries
  FOR SELECT USING (
    admin_id IS NULL
    OR admin_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.parent_admin_id = lotteries.admin_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.sub_admin_id IS NOT NULL
        AND p.parent_admin_id = lotteries.admin_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

CREATE POLICY "lotteries_insert" ON public.lotteries
  FOR INSERT WITH CHECK (
    admin_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

CREATE POLICY "lotteries_update" ON public.lotteries
  FOR UPDATE USING (
    admin_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  )
  WITH CHECK (
    admin_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );


-- ============================================================
-- draw_times
-- ============================================================

-- Regla objetivo:
-- el acceso se hereda desde la loteria duenia del horario.

DROP POLICY IF EXISTS "draw_times_select" ON public.draw_times;
DROP POLICY IF EXISTS "draw_times_insert" ON public.draw_times;
DROP POLICY IF EXISTS "draw_times_update" ON public.draw_times;

CREATE POLICY "draw_times_select" ON public.draw_times
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.lotteries l
      WHERE l.id = draw_times.lottery_id
        AND (
          l.admin_id IS NULL
          OR l.admin_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.parent_admin_id = l.admin_id
          )
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.sub_admin_id IS NOT NULL
              AND p.parent_admin_id = l.admin_id
          )
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'super_admin'
          )
        )
    )
  );

CREATE POLICY "draw_times_insert" ON public.draw_times
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lotteries l
      WHERE l.id = draw_times.lottery_id
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

CREATE POLICY "draw_times_update" ON public.draw_times
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.lotteries l
      WHERE l.id = draw_times.lottery_id
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
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lotteries l
      WHERE l.id = draw_times.lottery_id
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


-- ============================================================
-- RECOMENDACION COMPLEMENTARIA
-- ============================================================

-- Si el negocio decide que el pago de premios no debe depender de
-- UPDATE directo sobre `winning_tickets`, conviene luego moverlo a
-- una RPC especifica y endurecer esta politica.

