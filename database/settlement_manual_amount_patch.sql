-- ============================================================
-- PATCH: CORTES MANUALES Y PARCIALES EN BALANCE
-- Aplicar en la base real para activar el nuevo flujo de cortes.
--
-- Este patch actualiza:
-- - `get_seller_balance`
-- - `get_all_sellers_balance`
-- - `create_settlement`
-- - `get_seller_balance_for_seller`
-- - grants de `create_settlement`
--
-- Objetivo:
-- permitir registrar monto real liquidado y arrastrar saldo pendiente
-- positivo o negativo al siguiente corte.
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
BEGIN
  SELECT seller_percentage INTO v_pct FROM profiles WHERE id = p_seller_id;
  v_pct := COALESCE(v_pct, 0);

  IF p_date_from IS NULL THEN
    SELECT period_end, COALESCE(balance_at_settlement - amount, 0)
    INTO v_last_settle, v_prev_pending
    FROM settlements
    WHERE seller_id = p_seller_id AND admin_id = p_admin_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last_settle IS NOT NULL THEN
      v_period_from := v_last_settle + 1;
    ELSE
      SELECT MIN(sale_date) INTO v_period_from
      FROM tickets
      WHERE seller_id = p_seller_id AND admin_id = p_admin_id;
      v_period_from := COALESCE(v_period_from, CURRENT_DATE - 30);
    END IF;
  ELSE
    v_period_from := p_date_from;
  END IF;

  v_period_to := COALESCE(p_date_to, CURRENT_DATE);

  RETURN QUERY
  WITH sales AS (
    SELECT COALESCE(SUM(tn.subtotal), 0) AS total
    FROM ticket_numbers tn
    JOIN tickets t ON t.id = tn.ticket_id
    WHERE t.seller_id  = p_seller_id
      AND t.admin_id   = p_admin_id
      AND t.is_cancelled = FALSE
      AND t.sale_date  BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
  ),
  prizes AS (
    SELECT COALESCE(SUM(wt.prize_amount), 0) AS total
    FROM winning_tickets wt
    JOIN tickets t ON t.id = wt.ticket_id
    WHERE wt.seller_id  = p_seller_id
      AND wt.admin_id   = p_admin_id
      AND t.is_paid     = TRUE
      AND wt.draw_date  BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR wt.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
  ),
  sinfo AS (
    SELECT full_name FROM profiles WHERE id = p_seller_id
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
    SELECT id, full_name, COALESCE(seller_percentage, 0) AS pct
    FROM profiles
    WHERE parent_admin_id = p_admin_id
      AND role = 'seller'
      AND is_active = TRUE
  ),
  seller_sales AS (
    SELECT t.seller_id, COALESCE(SUM(tn.subtotal), 0) AS total
    FROM ticket_numbers tn
    JOIN tickets t ON t.id = tn.ticket_id
    WHERE t.admin_id     = p_admin_id
      AND t.is_cancelled = FALSE
      AND (p_date_from   IS NULL OR t.sale_date  >= p_date_from)
      AND (p_date_to     IS NULL OR t.sale_date  <= p_date_to)
      AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
    GROUP BY t.seller_id
  ),
  seller_prizes AS (
    SELECT wt.seller_id, COALESCE(SUM(wt.prize_amount), 0) AS total
    FROM winning_tickets wt
    JOIN tickets t ON t.id = wt.ticket_id
    WHERE wt.admin_id  = p_admin_id
      AND t.is_paid    = TRUE
      AND (p_date_from   IS NULL OR wt.draw_date  >= p_date_from)
      AND (p_date_to     IS NULL OR wt.draw_date  <= p_date_to)
      AND (p_lottery_id   IS NULL OR wt.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
    GROUP BY wt.seller_id
  ),
  seller_pending AS (
    SELECT DISTINCT ON (s.seller_id)
      s.seller_id,
      COALESCE(s.balance_at_settlement - s.amount, 0) AS pending
    FROM settlements s
    WHERE s.admin_id = p_admin_id
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


CREATE OR REPLACE FUNCTION public.create_settlement(
  p_admin_id  UUID,
  p_seller_id UUID,
  p_amount    NUMERIC DEFAULT NULL,
  p_notes     TEXT DEFAULT NULL
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
  v_pct           NUMERIC;
  v_period_from   DATE;
  v_period_to     DATE := CURRENT_DATE;
  v_last_settle   DATE;
  v_total_sales   NUMERIC := 0;
  v_total_prizes  NUMERIC := 0;
  v_commission    NUMERIC := 0;
  v_admin_part    NUMERIC := 0;
  v_balance       NUMERIC := 0;
  v_prev_pending  NUMERIC := 0;
  v_amount        NUMERIC := 0;
  v_new_id        UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_seller_id AND parent_admin_id = p_admin_id
  ) THEN
    RAISE EXCEPTION 'El vendedor no pertenece a este administrador';
  END IF;

  SELECT seller_percentage INTO v_pct FROM profiles WHERE id = p_seller_id;
  v_pct := COALESCE(v_pct, 0);

  SELECT period_end, COALESCE(balance_at_settlement - amount, 0)
  INTO v_last_settle, v_prev_pending
  FROM settlements
  WHERE seller_id = p_seller_id AND admin_id = p_admin_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_last_settle IS NOT NULL THEN
    v_period_from := v_last_settle + 1;
  ELSE
    SELECT MIN(sale_date) INTO v_period_from
    FROM tickets
    WHERE seller_id = p_seller_id AND admin_id = p_admin_id;
    v_period_from := COALESCE(v_period_from, CURRENT_DATE);
  END IF;

  SELECT COALESCE(SUM(tn.subtotal), 0) INTO v_total_sales
  FROM ticket_numbers tn
  JOIN tickets t ON t.id = tn.ticket_id
  WHERE t.seller_id    = p_seller_id
    AND t.admin_id     = p_admin_id
    AND t.is_cancelled = FALSE
    AND t.sale_date    BETWEEN v_period_from AND v_period_to;

  SELECT COALESCE(SUM(wt.prize_amount), 0) INTO v_total_prizes
  FROM winning_tickets wt
  JOIN tickets t ON t.id = wt.ticket_id
  WHERE wt.seller_id = p_seller_id
    AND wt.admin_id  = p_admin_id
    AND t.is_paid    = TRUE
    AND wt.draw_date BETWEEN v_period_from AND v_period_to;

  v_commission := v_total_sales * v_pct / 100;
  v_admin_part := v_total_sales - v_commission;
  v_balance := v_prev_pending + v_admin_part - v_total_prizes;
  v_amount := COALESCE(p_amount, v_balance);

  IF v_balance > 0 AND (v_amount < 0 OR v_amount > v_balance) THEN
    RAISE EXCEPTION 'El monto del corte debe estar entre 0 y %', v_balance;
  END IF;

  IF v_balance < 0 AND (v_amount > 0 OR v_amount < v_balance) THEN
    RAISE EXCEPTION 'El monto del corte debe estar entre % y 0', v_balance;
  END IF;

  INSERT INTO settlements (
    admin_id, seller_id, amount, balance_at_settlement,
    total_sales, total_commission, total_prizes_paid,
    notes, period_start, period_end, created_by
  ) VALUES (
    p_admin_id, p_seller_id, v_amount, v_balance,
    v_total_sales, v_commission, v_total_prizes,
    p_notes, v_period_from, v_period_to, p_admin_id
  ) RETURNING id INTO v_new_id;

  RETURN QUERY
  SELECT v_new_id, v_amount, v_balance, v_total_sales, v_commission, v_total_prizes,
         v_period_from, v_period_to, NOW()::TIMESTAMPTZ;
END;
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
  v_pct          NUMERIC;
  v_period_from  DATE;
  v_period_to    DATE;
  v_last_settle  DATE;
  v_prev_pending NUMERIC := 0;
BEGIN
  IF p_seller_id != auth.uid() THEN
    RAISE EXCEPTION 'Solo puedes consultar tu propio balance';
  END IF;

  SELECT parent_admin_id, seller_percentage
  INTO v_admin_id, v_pct
  FROM profiles WHERE id = p_seller_id;

  v_pct := COALESCE(v_pct, 0);

  IF p_date_from IS NULL THEN
    SELECT period_end, COALESCE(balance_at_settlement - amount, 0)
    INTO v_last_settle, v_prev_pending
    FROM settlements
    WHERE seller_id = p_seller_id AND admin_id = v_admin_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last_settle IS NOT NULL THEN
      v_period_from := v_last_settle + 1;
    ELSE
      SELECT MIN(sale_date) INTO v_period_from
      FROM tickets WHERE seller_id = p_seller_id AND admin_id = v_admin_id;
      v_period_from := COALESCE(v_period_from, CURRENT_DATE - 30);
    END IF;
  ELSE
    v_period_from := p_date_from;
  END IF;

  v_period_to := COALESCE(p_date_to, CURRENT_DATE);

  RETURN QUERY
  WITH sales AS (
    SELECT COALESCE(SUM(tn.subtotal), 0) AS total
    FROM ticket_numbers tn
    JOIN tickets t ON t.id = tn.ticket_id
    WHERE t.seller_id    = p_seller_id
      AND t.admin_id     = v_admin_id
      AND t.is_cancelled = FALSE
      AND t.sale_date    BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
  ),
  prizes AS (
    SELECT COALESCE(SUM(wt.prize_amount), 0) AS total
    FROM winning_tickets wt
    JOIN tickets t ON t.id = wt.ticket_id
    WHERE wt.seller_id  = p_seller_id
      AND wt.admin_id   = v_admin_id
      AND t.is_paid     = TRUE
      AND wt.draw_date  BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR wt.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
  ),
  sinfo AS (
    SELECT full_name FROM profiles WHERE id = p_seller_id
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
GRANT EXECUTE ON FUNCTION public.create_settlement(UUID,UUID,NUMERIC,TEXT) TO authenticated;
