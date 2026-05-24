-- ============================================================
-- PATCH FINAL: fix_get_seller_balance_group_final.sql
--
-- Fusiona:
--   + v_group_ids de sub_admin_group_balance.sql
--   + NOT EXISTS (días saldados) de balance_settled_days_exclusion.sql
--
-- Soluciona: al seleccionar un sub_admin en el panel admin,
-- el balance ahora incluye sus propias ventas + las de todos
-- sus vendedores subordinados.
--
-- Para vendedores directos: comportamiento idéntico al anterior
-- (v_group_ids = [seller_id], mismo resultado que antes).
--
-- Sobreescribe las versiones de balance_settled_days_exclusion.sql.
-- ============================================================


-- ============================================================
-- 1. get_seller_balance  (vista del admin)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_seller_balance(
  p_seller_id    UUID,
  p_admin_id     UUID,
  p_date_from    DATE DEFAULT NULL,
  p_date_to      DATE DEFAULT NULL,
  p_lottery_id   UUID DEFAULT NULL,
  p_draw_time_id UUID DEFAULT NULL
)
RETURNS TABLE (
  seller_id         UUID,
  seller_name       TEXT,
  commission_pct    NUMERIC,
  total_sales       NUMERIC,
  total_commission  NUMERIC,
  admin_part        NUMERIC,
  total_prizes_paid NUMERIC,
  balance           NUMERIC,
  period_start      DATE,
  period_end        DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pct          NUMERIC;
  v_period_from  DATE;
  v_period_to    DATE;
  v_last_settle  DATE;
  v_prev_pending NUMERIC := 0;
  v_group_ids    UUID[];
BEGIN
  -- % del sub_admin (o seller): el que el admin le asignó
  SELECT p.seller_percentage INTO v_pct
  FROM public.profiles p WHERE p.id = p_seller_id;
  v_pct := COALESCE(v_pct, 0);

  -- Grupo: el propio ID + vendedores subordinados (si es sub_admin)
  -- Para vendedor directo: solo contiene su propio ID
  SELECT array_agg(sub.id) INTO v_group_ids
  FROM (
    SELECT p_seller_id AS id
    UNION ALL
    SELECT p.id FROM public.profiles p
    WHERE p.sub_admin_id    = p_seller_id
      AND p.parent_admin_id = p_admin_id
      AND p.is_active       = TRUE
  ) sub;

  v_period_to := COALESCE(p_date_to, CURRENT_DATE);

  IF p_date_from IS NULL THEN
    -- Modo rolling: desde el último corte (a nivel sub_admin) hasta hoy
    SELECT s.period_end, COALESCE(s.balance_at_settlement - s.amount, 0)
    INTO v_last_settle, v_prev_pending
    FROM public.settlements s
    WHERE s.seller_id = p_seller_id
      AND s.admin_id  = p_admin_id
      AND ((p_lottery_id   IS NULL AND s.lottery_id   IS NULL) OR s.lottery_id   = p_lottery_id)
      AND ((p_draw_time_id IS NULL AND s.draw_time_id IS NULL) OR s.draw_time_id = p_draw_time_id)
    ORDER BY s.created_at DESC
    LIMIT 1;

    v_prev_pending := COALESCE(v_prev_pending, 0);

    IF v_last_settle IS NOT NULL THEN
      v_period_from := v_last_settle + 1;
    ELSE
      -- Primera vez: buscar la venta más antigua del grupo
      SELECT MIN(t.sale_date) INTO v_period_from
      FROM public.tickets t
      WHERE t.seller_id = ANY(v_group_ids)
        AND t.admin_id  = p_admin_id
        AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
        AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id);
      v_period_from := COALESCE(v_period_from, CURRENT_DATE - 30);
    END IF;

  ELSE
    -- Modo filtro de fecha: pendiente = residuales de cortes en el rango
    v_period_from := p_date_from;
    SELECT COALESCE(SUM(s.balance_at_settlement - s.amount), 0)
    INTO v_prev_pending
    FROM public.settlements s
    WHERE s.seller_id   = p_seller_id
      AND s.admin_id    = p_admin_id
      AND s.period_end  BETWEEN v_period_from AND v_period_to
      AND ((p_lottery_id   IS NULL AND s.lottery_id   IS NULL) OR s.lottery_id   = p_lottery_id)
      AND ((p_draw_time_id IS NULL AND s.draw_time_id IS NULL) OR s.draw_time_id = p_draw_time_id);
    v_prev_pending := COALESCE(v_prev_pending, 0);
  END IF;

  RETURN QUERY
  WITH sales AS (
    SELECT COALESCE(SUM(tn.subtotal), 0) AS total
    FROM public.ticket_numbers tn
    JOIN public.tickets t ON t.id = tn.ticket_id
    WHERE t.seller_id     = ANY(v_group_ids)   -- ← grupo completo
      AND t.admin_id      = p_admin_id
      AND t.is_cancelled  = FALSE
      AND t.sale_date     BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
      -- Excluir días ya saldados a nivel del sub_admin/seller
      AND NOT EXISTS (
        SELECT 1 FROM public.settlements s2
        WHERE s2.seller_id = p_seller_id        -- cortes del sub_admin (no de sus vendedores)
          AND s2.admin_id  = p_admin_id
          AND t.sale_date  BETWEEN s2.period_start AND s2.period_end
          AND ((p_lottery_id   IS NULL AND s2.lottery_id   IS NULL) OR s2.lottery_id   = p_lottery_id)
          AND ((p_draw_time_id IS NULL AND s2.draw_time_id IS NULL) OR s2.draw_time_id = p_draw_time_id)
      )
  ),
  prizes AS (
    SELECT COALESCE(SUM(wt.prize_amount), 0) AS total
    FROM public.winning_tickets wt
    WHERE wt.seller_id  = ANY(v_group_ids)     -- ← grupo completo
      AND wt.admin_id   = p_admin_id
      AND wt.draw_date  BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR wt.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.settlements s2
        WHERE s2.seller_id = p_seller_id
          AND s2.admin_id  = p_admin_id
          AND wt.draw_date BETWEEN s2.period_start AND s2.period_end
          AND ((p_lottery_id   IS NULL AND s2.lottery_id   IS NULL) OR s2.lottery_id   = p_lottery_id)
          AND ((p_draw_time_id IS NULL AND s2.draw_time_id IS NULL) OR s2.draw_time_id = p_draw_time_id)
      )
  ),
  sinfo AS (
    SELECT p.full_name FROM public.profiles p WHERE p.id = p_seller_id
  )
  SELECT
    p_seller_id,
    si.full_name,
    v_pct,
    sa.total,
    sa.total * v_pct / 100,
    sa.total - sa.total * v_pct / 100,
    pr.total,
    v_prev_pending + (sa.total - sa.total * v_pct / 100) - pr.total,
    v_period_from,
    v_period_to
  FROM sales sa, prizes pr, sinfo si;
END;
$$;


-- ============================================================
-- 2. get_seller_balance_detail  (desglose diario - admin)
-- ============================================================
DROP FUNCTION IF EXISTS public.get_seller_balance_detail(UUID,UUID,DATE,DATE,UUID,UUID);
CREATE OR REPLACE FUNCTION public.get_seller_balance_detail(
  p_seller_id    UUID,
  p_admin_id     UUID,
  p_date_from    DATE DEFAULT NULL,
  p_date_to      DATE DEFAULT NULL,
  p_lottery_id   UUID DEFAULT NULL,
  p_draw_time_id UUID DEFAULT NULL
)
RETURNS TABLE (
  day              DATE,
  total_sales      NUMERIC,
  commission_pct   NUMERIC,
  total_commission NUMERIC,
  admin_part       NUMERIC,
  prizes_paid      NUMERIC,
  balance_day      NUMERIC,
  is_settled       BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pct         NUMERIC;
  v_period_from DATE;
  v_period_to   DATE;
  v_last_settle DATE;
  v_group_ids   UUID[];
BEGIN
  SELECT p.seller_percentage INTO v_pct
  FROM public.profiles p WHERE p.id = p_seller_id;
  v_pct := COALESCE(v_pct, 0);

  SELECT array_agg(sub.id) INTO v_group_ids
  FROM (
    SELECT p_seller_id AS id
    UNION ALL
    SELECT p.id FROM public.profiles p
    WHERE p.sub_admin_id    = p_seller_id
      AND p.parent_admin_id = p_admin_id
      AND p.is_active       = TRUE
  ) sub;

  IF p_date_from IS NULL THEN
    SELECT s.period_end INTO v_last_settle
    FROM public.settlements s
    WHERE s.seller_id = p_seller_id
      AND s.admin_id  = p_admin_id
      AND ((p_lottery_id   IS NULL AND s.lottery_id   IS NULL) OR s.lottery_id   = p_lottery_id)
      AND ((p_draw_time_id IS NULL AND s.draw_time_id IS NULL) OR s.draw_time_id = p_draw_time_id)
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_last_settle IS NOT NULL THEN
      v_period_from := v_last_settle + 1;
    ELSE
      SELECT MIN(t.sale_date) INTO v_period_from
      FROM public.tickets t
      WHERE t.seller_id = ANY(v_group_ids)
        AND t.admin_id  = p_admin_id
        AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
        AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id);
      v_period_from := COALESCE(v_period_from, CURRENT_DATE - 30);
    END IF;
  ELSE
    v_period_from := p_date_from;
  END IF;

  v_period_to := COALESCE(p_date_to, CURRENT_DATE);

  RETURN QUERY
  WITH settled_periods AS (
    SELECT s.period_start, s.period_end,
           COALESCE(s.balance_at_settlement - s.amount, 0) AS residual
    FROM public.settlements s
    WHERE s.seller_id      = p_seller_id
      AND s.admin_id       = p_admin_id
      AND s.period_start  <= v_period_to
      AND s.period_end    >= v_period_from
      AND ((p_lottery_id   IS NULL AND s.lottery_id   IS NULL) OR s.lottery_id   = p_lottery_id)
      AND ((p_draw_time_id IS NULL AND s.draw_time_id IS NULL) OR s.draw_time_id = p_draw_time_id)
  ),
  daily_sales AS (
    SELECT t.sale_date AS dt, COALESCE(SUM(tn.subtotal), 0) AS total
    FROM public.ticket_numbers tn
    JOIN public.tickets t ON t.id = tn.ticket_id
    WHERE t.seller_id     = ANY(v_group_ids)   -- ← grupo completo
      AND t.admin_id      = p_admin_id
      AND t.is_cancelled  = FALSE
      AND t.sale_date     BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
    GROUP BY t.sale_date
  ),
  daily_prizes AS (
    SELECT wt.draw_date AS dt, COALESCE(SUM(wt.prize_amount), 0) AS total
    FROM public.winning_tickets wt
    WHERE wt.seller_id  = ANY(v_group_ids)     -- ← grupo completo
      AND wt.admin_id   = p_admin_id
      AND wt.draw_date  BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR wt.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
    GROUP BY wt.draw_date
  )
  SELECT
    COALESCE(ds.dt, dp.dt)                                        AS day,
    COALESCE(ds.total, 0)                                         AS total_sales,
    v_pct                                                         AS commission_pct,
    COALESCE(ds.total, 0) * v_pct / 100                          AS total_commission,
    COALESCE(ds.total, 0) - COALESCE(ds.total, 0) * v_pct / 100 AS admin_part,
    COALESCE(dp.total, 0)                                         AS prizes_paid,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM settled_periods sp
        WHERE COALESCE(ds.dt, dp.dt) BETWEEN sp.period_start AND sp.period_end
      ) THEN (
        SELECT COALESCE(SUM(sp2.residual), 0)
        FROM settled_periods sp2
        WHERE COALESCE(ds.dt, dp.dt) = sp2.period_end
      )
      ELSE (COALESCE(ds.total, 0) - COALESCE(ds.total, 0) * v_pct / 100) - COALESCE(dp.total, 0)
    END                                                           AS balance_day,
    EXISTS (
      SELECT 1 FROM settled_periods sp
      WHERE COALESCE(ds.dt, dp.dt) BETWEEN sp.period_start AND sp.period_end
    )                                                             AS is_settled
  FROM daily_sales ds
  FULL OUTER JOIN daily_prizes dp ON ds.dt = dp.dt
  ORDER BY COALESCE(ds.dt, dp.dt) DESC;
END;
$$;


-- ============================================================
-- 3. create_settlement  (crear corte - agrupado)
--    Calcula ventas del grupo pero el settlement queda a nombre
--    del sub_admin solamente (sus vendedores no reciben corte).
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_settlement(
  p_admin_id     UUID,
  p_seller_id    UUID,
  p_amount       NUMERIC DEFAULT NULL,
  p_notes        TEXT    DEFAULT NULL,
  p_date_from    DATE    DEFAULT NULL,
  p_date_to      DATE    DEFAULT NULL,
  p_lottery_id   UUID    DEFAULT NULL,
  p_draw_time_id UUID    DEFAULT NULL
)
RETURNS TABLE (
  id                    UUID,
  amount                NUMERIC,
  balance_at_settlement NUMERIC,
  total_sales           NUMERIC,
  total_commission      NUMERIC,
  total_prizes_paid     NUMERIC,
  period_start          DATE,
  period_end            DATE,
  created_at            TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pct          NUMERIC;
  v_period_from  DATE;
  v_period_to    DATE;
  v_last_settle  DATE;
  v_total_sales  NUMERIC := 0;
  v_total_prizes NUMERIC := 0;
  v_commission   NUMERIC := 0;
  v_admin_part   NUMERIC := 0;
  v_balance      NUMERIC := 0;
  v_prev_pending NUMERIC := 0;
  v_amount       NUMERIC := 0;
  v_new_id       UUID;
  v_group_ids    UUID[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_seller_id AND p.parent_admin_id = p_admin_id
  ) THEN
    RAISE EXCEPTION 'El vendedor no pertenece a este administrador';
  END IF;

  SELECT p.seller_percentage INTO v_pct
  FROM public.profiles p WHERE p.id = p_seller_id;
  v_pct := COALESCE(v_pct, 0);

  SELECT array_agg(sub.id) INTO v_group_ids
  FROM (
    SELECT p_seller_id AS id
    UNION ALL
    SELECT p.id FROM public.profiles p
    WHERE p.sub_admin_id    = p_seller_id
      AND p.parent_admin_id = p_admin_id
      AND p.is_active       = TRUE
  ) sub;

  v_period_to := COALESCE(p_date_to, CURRENT_DATE);

  IF p_date_from IS NULL THEN
    SELECT s.period_end, COALESCE(s.balance_at_settlement - s.amount, 0)
    INTO v_last_settle, v_prev_pending
    FROM public.settlements s
    WHERE s.seller_id = p_seller_id
      AND s.admin_id  = p_admin_id
      AND ((p_lottery_id   IS NULL AND s.lottery_id   IS NULL) OR s.lottery_id   = p_lottery_id)
      AND ((p_draw_time_id IS NULL AND s.draw_time_id IS NULL) OR s.draw_time_id = p_draw_time_id)
    ORDER BY s.created_at DESC
    LIMIT 1;

    v_prev_pending := COALESCE(v_prev_pending, 0);

    IF v_last_settle IS NOT NULL THEN
      v_period_from := v_last_settle + 1;
    ELSE
      SELECT MIN(t.sale_date) INTO v_period_from
      FROM public.tickets t
      WHERE t.seller_id = ANY(v_group_ids)
        AND t.admin_id  = p_admin_id
        AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
        AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id);
      v_period_from := COALESCE(v_period_from, CURRENT_DATE);
    END IF;

  ELSE
    v_period_from := p_date_from;
    SELECT COALESCE(SUM(s.balance_at_settlement - s.amount), 0)
    INTO v_prev_pending
    FROM public.settlements s
    WHERE s.seller_id    = p_seller_id
      AND s.admin_id     = p_admin_id
      AND s.period_start >= v_period_from
      AND s.period_end   <= v_period_to
      AND ((p_lottery_id   IS NULL AND s.lottery_id   IS NULL) OR s.lottery_id   = p_lottery_id)
      AND ((p_draw_time_id IS NULL AND s.draw_time_id IS NULL) OR s.draw_time_id = p_draw_time_id);
    v_prev_pending := COALESCE(v_prev_pending, 0);
  END IF;

  -- Ventas del grupo, excluyendo días ya saldados a nivel sub_admin
  SELECT COALESCE(SUM(tn.subtotal), 0) INTO v_total_sales
  FROM public.ticket_numbers tn
  JOIN public.tickets t ON t.id = tn.ticket_id
  WHERE t.seller_id    = ANY(v_group_ids)
    AND t.admin_id     = p_admin_id
    AND t.is_cancelled = FALSE
    AND t.sale_date    BETWEEN v_period_from AND v_period_to
    AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
    AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.settlements s2
      WHERE s2.seller_id = p_seller_id
        AND s2.admin_id  = p_admin_id
        AND t.sale_date  BETWEEN s2.period_start AND s2.period_end
        AND ((p_lottery_id   IS NULL AND s2.lottery_id   IS NULL) OR s2.lottery_id   = p_lottery_id)
        AND ((p_draw_time_id IS NULL AND s2.draw_time_id IS NULL) OR s2.draw_time_id = p_draw_time_id)
    );

  -- Premios del grupo
  SELECT COALESCE(SUM(wt.prize_amount), 0) INTO v_total_prizes
  FROM public.winning_tickets wt
  WHERE wt.seller_id  = ANY(v_group_ids)
    AND wt.admin_id   = p_admin_id
    AND wt.draw_date  BETWEEN v_period_from AND v_period_to
    AND (p_lottery_id   IS NULL OR wt.lottery_id   = p_lottery_id)
    AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.settlements s2
      WHERE s2.seller_id = p_seller_id
        AND s2.admin_id  = p_admin_id
        AND wt.draw_date BETWEEN s2.period_start AND s2.period_end
        AND ((p_lottery_id   IS NULL AND s2.lottery_id   IS NULL) OR s2.lottery_id   = p_lottery_id)
        AND ((p_draw_time_id IS NULL AND s2.draw_time_id IS NULL) OR s2.draw_time_id = p_draw_time_id)
    );

  v_commission := v_total_sales * v_pct / 100;
  v_admin_part := v_total_sales - v_commission;
  v_balance    := ROUND(v_prev_pending + v_admin_part - v_total_prizes, 2);
  v_amount     := ROUND(COALESCE(p_amount, v_balance), 2);

  IF v_balance > 0 AND (v_amount < 0 OR v_amount > v_balance) THEN
    RAISE EXCEPTION 'El monto del corte debe estar entre 0 y %', v_balance;
  END IF;
  IF v_balance < 0 AND (v_amount > 0 OR v_amount < v_balance) THEN
    RAISE EXCEPTION 'El monto del corte debe estar entre % y 0', v_balance;
  END IF;

  -- El settlement queda registrado solo para el sub_admin (p_seller_id)
  -- Sus vendedores individuales NO reciben settlement en el nivel admin
  INSERT INTO public.settlements AS s (
    admin_id, seller_id, lottery_id, draw_time_id,
    amount, balance_at_settlement,
    total_sales, total_commission, total_prizes_paid,
    notes, period_start, period_end, created_by, created_at
  ) VALUES (
    p_admin_id, p_seller_id, p_lottery_id, p_draw_time_id,
    v_amount, v_balance,
    v_total_sales, v_commission, v_total_prizes,
    p_notes, v_period_from, v_period_to, p_admin_id, NOW()
  ) RETURNING s.id INTO v_new_id;

  RETURN QUERY
  SELECT v_new_id, v_amount, v_balance,
         v_total_sales, v_commission, v_total_prizes,
         v_period_from, v_period_to, NOW()::TIMESTAMPTZ;
END;
$$;


-- ============================================================
-- Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_seller_balance(UUID,UUID,DATE,DATE,UUID,UUID)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_balance_detail(UUID,UUID,DATE,DATE,UUID,UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_settlement(UUID,UUID,NUMERIC,TEXT,DATE,DATE,UUID,UUID) TO authenticated;
