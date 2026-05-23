-- ============================================================
-- PATCH: CORTES MANUALES, PARCIALES Y POR ALCANCE EN BALANCE
--
-- FUNCIONES QUE ESTE ARCHIVO DEFINE (FUENTE DE VERDAD):
--   ✓ get_all_sellers_balance
--   ✓ get_settlements_history
--   ✓ get_seller_balance_for_seller
--
-- ⛔ NO AGREGAR AQUÍ:
--   ✗ get_seller_balance       → está en balance_settled_days_exclusion.sql
--   ✗ create_settlement        → está en balance_settled_days_exclusion.sql
--   ✗ get_seller_balance_detail         → ídem
--   ✗ get_seller_balance_detail_for_seller → ídem
--   ✗ create_settlement_by_subadmin    → está en subadmin_seller_balance.sql
--
-- Orden de ejecución obligatorio:
--   1. subadmin_seller_balance.sql
--   2. balance_settled_days_exclusion.sql
--   3. settlement_manual_amount_patch.sql  ← este archivo
-- ============================================================

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS lottery_id UUID REFERENCES public.lotteries(id),
  ADD COLUMN IF NOT EXISTS draw_time_id UUID REFERENCES public.draw_times(id);

CREATE INDEX IF NOT EXISTS idx_settlements_scope
  ON public.settlements (admin_id, seller_id, lottery_id, draw_time_id, period_start, period_end, created_at DESC);


CREATE OR REPLACE FUNCTION public.get_all_sellers_balance(
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
  balance           NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH sellers AS (
    SELECT p.id, p.full_name, COALESCE(p.seller_percentage, 0) AS pct
    FROM public.profiles p
    WHERE p.parent_admin_id = p_admin_id
      AND p.role = 'seller'
      AND p.is_active = TRUE
  ),
  seller_sales AS (
    SELECT t.seller_id, COALESCE(SUM(tn.subtotal), 0) AS total
    FROM public.ticket_numbers tn
    JOIN public.tickets t ON t.id = tn.ticket_id
    WHERE t.admin_id = p_admin_id
      AND t.is_cancelled = FALSE
      AND (p_date_from IS NULL OR t.sale_date >= p_date_from)
      AND (p_date_to IS NULL OR t.sale_date <= p_date_to)
      AND (p_lottery_id IS NULL OR t.lottery_id = p_lottery_id)
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
    GROUP BY t.seller_id
  ),
  seller_prizes AS (
    SELECT wt.seller_id, COALESCE(SUM(wt.prize_amount), 0) AS total
    FROM public.winning_tickets wt
    WHERE wt.admin_id = p_admin_id
      AND (p_date_from IS NULL OR wt.draw_date >= p_date_from)
      AND (p_date_to IS NULL OR wt.draw_date <= p_date_to)
      AND (p_lottery_id IS NULL OR wt.lottery_id = p_lottery_id)
      AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
    GROUP BY wt.seller_id
  ),
  seller_pending AS (
    SELECT DISTINCT ON (s.seller_id)
      s.seller_id,
      COALESCE(s.balance_at_settlement - s.amount, 0) AS pending
    FROM public.settlements s
    WHERE s.admin_id = p_admin_id
      AND ((p_lottery_id IS NULL AND s.lottery_id IS NULL) OR s.lottery_id = p_lottery_id)
      AND ((p_draw_time_id IS NULL AND s.draw_time_id IS NULL) OR s.draw_time_id = p_draw_time_id)
      AND (
        p_date_from IS NULL OR (
          s.period_start = p_date_from
          AND s.period_end = COALESCE(p_date_to, CURRENT_DATE)
        )
      )
    ORDER BY s.seller_id, s.created_at DESC
  )
  SELECT
    s.id,
    s.full_name,
    s.pct,
    COALESCE(ss.total, 0),
    COALESCE(ss.total, 0) * s.pct / 100,
    COALESCE(ss.total, 0) - COALESCE(ss.total, 0) * s.pct / 100,
    COALESCE(sp.total, 0),
    COALESCE(pd.pending, 0) + (COALESCE(ss.total, 0) - COALESCE(ss.total, 0) * s.pct / 100) - COALESCE(sp.total, 0)
  FROM sellers s
  LEFT JOIN seller_sales ss ON ss.seller_id = s.id
  LEFT JOIN seller_prizes sp ON sp.seller_id = s.id
  LEFT JOIN seller_pending pd ON pd.seller_id = s.id
  ORDER BY s.full_name;
$$;


CREATE OR REPLACE FUNCTION public.get_settlements_history(
  p_admin_id     UUID,
  p_seller_id    UUID DEFAULT NULL,
  p_date_from    DATE DEFAULT NULL,
  p_date_to      DATE DEFAULT NULL,
  p_lottery_id   UUID DEFAULT NULL,
  p_draw_time_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id                    UUID,
  seller_id             UUID,
  seller_name           TEXT,
  amount                NUMERIC,
  balance_at_settlement NUMERIC,
  total_sales           NUMERIC,
  total_commission      NUMERIC,
  total_prizes_paid     NUMERIC,
  notes                 TEXT,
  period_start          DATE,
  period_end            DATE,
  created_at            TIMESTAMPTZ,
  lottery_id            UUID,
  draw_time_id          UUID
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.seller_id,
    p.full_name,
    s.amount,
    s.balance_at_settlement,
    s.total_sales,
    s.total_commission,
    s.total_prizes_paid,
    s.notes,
    s.period_start,
    s.period_end,
    s.created_at,
    s.lottery_id,
    s.draw_time_id
  FROM public.settlements s
  JOIN public.profiles p ON p.id = s.seller_id
  WHERE (s.admin_id = p_admin_id
     OR (p_seller_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.profiles pr
       WHERE pr.id = p_seller_id AND pr.sub_admin_id = s.admin_id
     )))
    AND (p_seller_id IS NULL OR s.seller_id = p_seller_id)
    AND (p_lottery_id   IS NULL OR s.lottery_id   = p_lottery_id)
    AND (p_draw_time_id IS NULL OR s.draw_time_id = p_draw_time_id)
    AND (
      p_date_from IS NULL OR (
        s.period_start <= COALESCE(p_date_to, CURRENT_DATE)
        AND s.period_end >= p_date_from
      )
    )
  ORDER BY s.created_at DESC;
$$;


CREATE OR REPLACE FUNCTION public.get_seller_balance_for_seller(
  p_seller_id    UUID,
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
  v_admin_id     UUID;
  v_sub_admin_id UUID;
  v_pct          NUMERIC;
  v_period_from  DATE;
  v_period_to    DATE;
  v_last_settle  DATE;
  v_prev_pending NUMERIC := 0;
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

  IF p_date_from IS NULL THEN
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
      SELECT MIN(t.sale_date) INTO v_period_from
      FROM public.tickets t
      WHERE t.seller_id = p_seller_id
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
    WHERE t.seller_id     = p_seller_id
      AND t.admin_id      = v_admin_id
      AND t.is_cancelled  = FALSE
      AND t.sale_date     BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
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
    WHERE wt.seller_id  = p_seller_id
      AND wt.admin_id   = v_admin_id
      AND wt.draw_date  BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR wt.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
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


REVOKE EXECUTE ON FUNCTION public.create_settlement(UUID,UUID,TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_settlement(UUID,UUID,NUMERIC,TEXT,DATE,DATE,UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_settlements_history(UUID,UUID,DATE,DATE,UUID,UUID) TO authenticated;
