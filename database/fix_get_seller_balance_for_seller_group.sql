-- ============================================================
-- PATCH: fix_get_seller_balance_for_seller_group.sql
--
-- Añade el parámetro p_include_group BOOLEAN DEFAULT FALSE a:
--   ✓ get_seller_balance_for_seller
--   ✓ get_seller_balance_detail_for_seller
--
-- Cuando p_include_group = TRUE (sub_admin activa el switch
-- "Ver total del grupo"), las ventas y premios incluyen al
-- sub_admin más todos sus vendedores activos.
--
-- Cuando p_include_group = FALSE (default), comportamiento
-- idéntico al anterior: solo las ventas del propio usuario.
--
-- Compatible con la versión anterior: las llamadas sin ese
-- parámetro siguen funcionando igual.
-- ============================================================


-- ============================================================
-- 1. get_seller_balance_for_seller
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_seller_balance_for_seller(
  p_seller_id     UUID,
  p_date_from     DATE    DEFAULT NULL,
  p_date_to       DATE    DEFAULT NULL,
  p_lottery_id    UUID    DEFAULT NULL,
  p_draw_time_id  UUID    DEFAULT NULL,
  p_include_group BOOLEAN DEFAULT FALSE
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
  v_admin_id     UUID;
  v_sub_admin_id UUID;
  v_pct          NUMERIC;
  v_period_from  DATE;
  v_period_to    DATE;
  v_last_settle  DATE;
  v_prev_pending NUMERIC := 0;
  v_group_ids    UUID[];
BEGIN
  IF p_seller_id != auth.uid() THEN
    RAISE EXCEPTION 'Solo puedes consultar tu propio balance';
  END IF;

  SELECT p.parent_admin_id, p.seller_percentage, p.sub_admin_id
  INTO v_admin_id, v_pct, v_sub_admin_id
  FROM public.profiles p
  WHERE p.id = p_seller_id;

  v_pct := COALESCE(v_pct, 0);
  v_period_to := COALESCE(p_date_to, CURRENT_DATE);

  -- ── Construir grupo ─────────────────────────────────────────
  -- p_include_group=TRUE: sub_admin + sus vendedores activos
  -- p_include_group=FALSE: solo el propio usuario
  IF p_include_group THEN
    SELECT array_agg(sub.id) INTO v_group_ids
    FROM (
      SELECT p_seller_id AS id
      UNION ALL
      SELECT p.id FROM public.profiles p
      WHERE p.sub_admin_id    = p_seller_id
        AND p.parent_admin_id = v_admin_id
        AND p.is_active       = TRUE
    ) sub;
  ELSE
    v_group_ids := ARRAY[p_seller_id];
  END IF;

  -- ── Período ─────────────────────────────────────────────────
  IF p_date_from IS NULL THEN
    -- Modo rolling: último corte del admin al sub_admin
    SELECT s.period_end, COALESCE(s.balance_at_settlement - s.amount, 0)
    INTO v_last_settle, v_prev_pending
    FROM public.settlements s
    WHERE s.seller_id = p_seller_id
      AND (s.admin_id = v_admin_id OR (v_sub_admin_id IS NOT NULL AND s.admin_id = v_sub_admin_id))
      AND (p_lottery_id   IS NULL OR s.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR s.draw_time_id = p_draw_time_id)
    ORDER BY s.created_at DESC
    LIMIT 1;

    v_prev_pending := COALESCE(v_prev_pending, 0);

    IF v_last_settle IS NOT NULL THEN
      v_period_from := v_last_settle + 1;
      v_period_from := LEAST(v_period_from, CURRENT_DATE);
    ELSE
      -- Sin cortes previos: fecha del primer ticket del grupo
      SELECT MIN(t.sale_date) INTO v_period_from
      FROM public.tickets t
      WHERE t.seller_id = ANY(v_group_ids)
        AND t.admin_id  = v_admin_id
        AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
        AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id);
      v_period_from := COALESCE(v_period_from, CURRENT_DATE - 30);
    END IF;

  ELSE
    v_period_from := p_date_from;
    SELECT COALESCE(SUM(s.balance_at_settlement - s.amount), 0)
    INTO v_prev_pending
    FROM public.settlements s
    WHERE s.seller_id    = p_seller_id
      AND (s.admin_id = v_admin_id OR (v_sub_admin_id IS NOT NULL AND s.admin_id = v_sub_admin_id))
      AND s.period_end BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR s.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR s.draw_time_id = p_draw_time_id);
    v_prev_pending := COALESCE(v_prev_pending, 0);
  END IF;

  RETURN QUERY
  WITH sales AS (
    SELECT COALESCE(SUM(tn.subtotal), 0) AS total
    FROM public.ticket_numbers tn
    JOIN public.tickets t ON t.id = tn.ticket_id
    WHERE t.seller_id     = ANY(v_group_ids)
      AND t.admin_id      = v_admin_id
      AND t.is_cancelled  = FALSE
      AND t.sale_date     BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
      -- Excluir días ya saldados (corte al nivel del sub_admin)
      AND NOT EXISTS (
        SELECT 1 FROM public.settlements s2
        WHERE s2.seller_id = p_seller_id
          AND (s2.admin_id = v_admin_id OR (v_sub_admin_id IS NOT NULL AND s2.admin_id = v_sub_admin_id))
          AND t.sale_date >= s2.period_start
          AND t.sale_date <= LEAST(s2.period_end, CURRENT_DATE - 1)
          AND (p_lottery_id   IS NULL OR s2.lottery_id   = p_lottery_id)
          AND (p_draw_time_id IS NULL OR s2.draw_time_id = p_draw_time_id)
      )
  ),
  prizes AS (
    SELECT COALESCE(SUM(wt.prize_amount), 0) AS total
    FROM public.winning_tickets wt
    WHERE wt.seller_id  = ANY(v_group_ids)
      AND wt.admin_id   = v_admin_id
      AND wt.draw_date  BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR wt.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
      -- Excluir premios de días ya saldados
      AND NOT EXISTS (
        SELECT 1 FROM public.settlements s2
        WHERE s2.seller_id = p_seller_id
          AND (s2.admin_id = v_admin_id OR (v_sub_admin_id IS NOT NULL AND s2.admin_id = v_sub_admin_id))
          AND wt.draw_date >= s2.period_start
          AND wt.draw_date <= LEAST(s2.period_end, CURRENT_DATE - 1)
          AND (p_lottery_id   IS NULL OR s2.lottery_id   = p_lottery_id)
          AND (p_draw_time_id IS NULL OR s2.draw_time_id = p_draw_time_id)
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
-- 2. get_seller_balance_detail_for_seller
-- ============================================================
DROP FUNCTION IF EXISTS public.get_seller_balance_detail_for_seller(UUID,DATE,DATE,UUID,UUID);
DROP FUNCTION IF EXISTS public.get_seller_balance_detail_for_seller(UUID,DATE,DATE,UUID,UUID,BOOLEAN);
CREATE OR REPLACE FUNCTION public.get_seller_balance_detail_for_seller(
  p_seller_id     UUID,
  p_date_from     DATE    DEFAULT NULL,
  p_date_to       DATE    DEFAULT NULL,
  p_lottery_id    UUID    DEFAULT NULL,
  p_draw_time_id  UUID    DEFAULT NULL,
  p_include_group BOOLEAN DEFAULT FALSE
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
  v_admin_id     UUID;
  v_sub_admin_id UUID;
  v_pct          NUMERIC;
  v_period_from  DATE;
  v_period_to    DATE;
  v_last_settle  DATE;
  v_group_ids    UUID[];
BEGIN
  IF p_seller_id != auth.uid() THEN
    RAISE EXCEPTION 'Solo puedes consultar tu propio balance';
  END IF;

  SELECT p.parent_admin_id, p.seller_percentage, p.sub_admin_id
  INTO v_admin_id, v_pct, v_sub_admin_id
  FROM public.profiles p
  WHERE p.id = p_seller_id;

  v_pct := COALESCE(v_pct, 0);

  -- ── Construir grupo ─────────────────────────────────────────
  IF p_include_group THEN
    SELECT array_agg(sub.id) INTO v_group_ids
    FROM (
      SELECT p_seller_id AS id
      UNION ALL
      SELECT p.id FROM public.profiles p
      WHERE p.sub_admin_id    = p_seller_id
        AND p.parent_admin_id = v_admin_id
        AND p.is_active       = TRUE
    ) sub;
  ELSE
    v_group_ids := ARRAY[p_seller_id];
  END IF;

  -- ── Período ─────────────────────────────────────────────────
  IF p_date_from IS NULL THEN
    SELECT s.period_end INTO v_last_settle
    FROM public.settlements s
    WHERE s.seller_id = p_seller_id
      AND (s.admin_id = v_admin_id OR (v_sub_admin_id IS NOT NULL AND s.admin_id = v_sub_admin_id))
      AND (p_lottery_id   IS NULL OR s.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR s.draw_time_id = p_draw_time_id)
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_last_settle IS NOT NULL THEN
      v_period_from := v_last_settle + 1;
      v_period_from := LEAST(v_period_from, CURRENT_DATE);
    ELSE
      SELECT MIN(t.sale_date) INTO v_period_from
      FROM public.tickets t
      WHERE t.seller_id = ANY(v_group_ids)
        AND t.admin_id  = v_admin_id
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
    -- Cortes del admin al sub_admin (no cambia aunque se vea el grupo)
    SELECT s.period_start, LEAST(s.period_end, CURRENT_DATE - 1) AS period_end,
           COALESCE(s.balance_at_settlement - s.amount, 0) AS residual
    FROM public.settlements s
    WHERE s.seller_id      = p_seller_id
      AND (s.admin_id = v_admin_id OR (v_sub_admin_id IS NOT NULL AND s.admin_id = v_sub_admin_id))
      AND s.period_start  <= v_period_to
      AND s.period_end    >= v_period_from
      AND (p_lottery_id   IS NULL OR s.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR s.draw_time_id = p_draw_time_id)
  ),
  daily_sales AS (
    SELECT t.sale_date AS dt, COALESCE(SUM(tn.subtotal), 0) AS total
    FROM public.ticket_numbers tn
    JOIN public.tickets t ON t.id = tn.ticket_id
    WHERE t.seller_id     = ANY(v_group_ids)
      AND t.admin_id      = v_admin_id
      AND t.is_cancelled  = FALSE
      AND t.sale_date     BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
    GROUP BY t.sale_date
  ),
  daily_prizes AS (
    SELECT wt.draw_date AS dt, COALESCE(SUM(wt.prize_amount), 0) AS total
    FROM public.winning_tickets wt
    WHERE wt.seller_id  = ANY(v_group_ids)
      AND wt.admin_id   = v_admin_id
      AND wt.draw_date  BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR wt.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
    GROUP BY wt.draw_date
  )
  SELECT
    COALESCE(ds.dt, dp.dt)                                          AS day,
    COALESCE(ds.total, 0)                                           AS total_sales,
    v_pct                                                           AS commission_pct,
    COALESCE(ds.total, 0) * v_pct / 100                            AS total_commission,
    COALESCE(ds.total, 0) - COALESCE(ds.total, 0) * v_pct / 100   AS admin_part,
    COALESCE(dp.total, 0)                                           AS prizes_paid,
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
    END                                                             AS balance_day,
    EXISTS (
      SELECT 1 FROM settled_periods sp
      WHERE COALESCE(ds.dt, dp.dt) BETWEEN sp.period_start AND sp.period_end
    )                                                               AS is_settled
  FROM daily_sales ds
  FULL OUTER JOIN daily_prizes dp ON ds.dt = dp.dt
  ORDER BY COALESCE(ds.dt, dp.dt) DESC;
END;
$$;


-- ============================================================
-- Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_seller_balance_for_seller(UUID,DATE,DATE,UUID,UUID,BOOLEAN)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_balance_detail_for_seller(UUID,DATE,DATE,UUID,UUID,BOOLEAN) TO authenticated;
