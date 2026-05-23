-- ============================================================
-- CANDIDATO RLS: ALCANCE CRITICO APP MOVIL
-- NO aplicar a produccion sin comparar antes contra la base real.
--
-- Objetivo:
-- alinear el repo con el comportamiento que la app ya necesita
-- para vendedor, admin y super_admin en estas tablas:
--   - sales_limits
--   - tickets
--   - ticket_numbers
--
-- Nota importante:
-- este archivo propone una base razonable para versionar SQL.
-- No garantiza replicar exactamente las politicas actuales de
-- produccion, porque estas todavia no han sido exportadas.
-- ============================================================


-- ============================================================
-- sales_limits
-- ============================================================

-- El repo actual solo deja leer a admin/super_admin, pero el
-- vendedor usa esta tabla desde `useLimits.js` para validar ventas.
-- Por eso se propone abrir SELECT a usuarios cuya red pertenezca al
-- admin de la fila, manteniendo escritura solo para admin/super_admin.

DROP POLICY IF EXISTS "sales_limits_all" ON public.sales_limits;
DROP POLICY IF EXISTS "sales_limits_select" ON public.sales_limits;
DROP POLICY IF EXISTS "sales_limits_insert" ON public.sales_limits;
DROP POLICY IF EXISTS "sales_limits_update" ON public.sales_limits;
DROP POLICY IF EXISTS "sales_limits_delete" ON public.sales_limits;

CREATE POLICY "sales_limits_select" ON public.sales_limits
  FOR SELECT USING (
    admin_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.parent_admin_id = sales_limits.admin_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

CREATE POLICY "sales_limits_insert" ON public.sales_limits
  FOR INSERT WITH CHECK (
    admin_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

CREATE POLICY "sales_limits_update" ON public.sales_limits
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

CREATE POLICY "sales_limits_delete" ON public.sales_limits
  FOR DELETE USING (
    admin_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );


-- ============================================================
-- tickets
-- ============================================================

-- Regla objetivo:
-- - seller: solo sus tickets
-- - sub_admin: sus propios tickets y los de vendedores asignados
-- - admin: tickets de su red via admin_id
-- - super_admin: acceso global
--
-- Nota:
-- RLS no limita columnas. Si se quiere impedir que un seller cambie
-- campos sensibles distintos a `is_paid` o `is_cancelled`, eso debe
-- reforzarse con trigger o RPC.

DROP POLICY IF EXISTS "tickets_select" ON public.tickets;
DROP POLICY IF EXISTS "tickets_insert" ON public.tickets;
DROP POLICY IF EXISTS "tickets_update" ON public.tickets;

CREATE POLICY "tickets_select" ON public.tickets
  FOR SELECT USING (
    seller_id = auth.uid()
    OR admin_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles s
      WHERE s.id = tickets.seller_id
        AND s.sub_admin_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

CREATE POLICY "tickets_insert" ON public.tickets
  FOR INSERT WITH CHECK (
    seller_id = auth.uid()
    AND admin_id = COALESCE(
      (SELECT p.parent_admin_id FROM public.profiles p WHERE p.id = auth.uid()),
      auth.uid()
    )
  );

CREATE POLICY "tickets_update" ON public.tickets
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
    (
      seller_id = auth.uid()
      AND admin_id = COALESCE(
        (SELECT p.parent_admin_id FROM public.profiles p WHERE p.id = auth.uid()),
        auth.uid()
      )
    )
    OR admin_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );


-- ============================================================
-- ticket_numbers
-- ============================================================

-- Esta tabla hereda el alcance desde `tickets`.
-- La propuesta mantiene insert solo para el vendedor duenio del ticket.

DROP POLICY IF EXISTS "ticket_numbers_select" ON public.ticket_numbers;
DROP POLICY IF EXISTS "ticket_numbers_insert" ON public.ticket_numbers;

CREATE POLICY "ticket_numbers_select" ON public.ticket_numbers
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.tickets t
      WHERE t.id = ticket_id
        AND (
          t.seller_id = auth.uid()
          OR t.admin_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles s
            WHERE s.id = t.seller_id
              AND s.sub_admin_id = auth.uid()
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

CREATE POLICY "ticket_numbers_insert" ON public.ticket_numbers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tickets t
      WHERE t.id = ticket_id
        AND t.seller_id = auth.uid()
    )
  );


-- ============================================================
-- RECOMENDACION COMPLEMENTARIA
-- ============================================================

-- El frontend actual permite que seller haga UPDATE de tickets para:
--   - marcar como cobrado
--   - anular ticket
--
-- Si se quiere impedir que seller cambie otros campos estructurales,
-- agregar despues una de estas dos defensas:
--
-- 1. un trigger BEFORE UPDATE que rechace cambios no permitidos
-- 2. mover esas acciones a RPCs especificas (`mark_ticket_paid`,
--    `cancel_ticket`) y quitar UPDATE directo al seller

