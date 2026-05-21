-- ============================================================
-- FIX: BALANCE CORRECTO DESPUÉS DE UN CORTE
--
-- Problema: al usar filtro de fecha, hacer un corte no cambiaba
-- el balance porque la función recalculaba las ventas del mismo
-- período y sumaba v_prev_pending encima.
--
-- Corrección:
--   - Caso SIN filtro de fecha (rolling): sin cambios, ya era correcto.
--     v_period_from = last_settle.period_end + 1  →  rango vacío  →  balance = prev_pending
--
--   - Caso CON filtro de fecha:
--     Antes: v_prev_pending = balance_at_settlement - amount   (doble cuenta)
--     Ahora: v_total_settled = SUM(amount) de todos los cortes de ese período
--            balance = (admin_part - prizes) - v_total_settled
--
-- Afecta: get_seller_balance, get_seller_balance_for_seller, create_settlement
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
  v_pct           NUMERIC;
  v_period_from   DATE;
  v_period_to     DATE;
  v_last_settle   DATE;
  v_prev_pending  NUMERIC := 0;
  v_total_settled NUMERIC := 0;
  v_use_date_mode BOOLEAN := FALSE;
BEGIN
  SELECT p.seller_percentage INTO v_pct
  FROM public.profiles p
  WHERE p.id = p_seller_id;
  v_pct := COALESCE(v_pct, 0);

  v_period_to := COALESCE(p_date_to, CURRENT_DATE);

  IF p_date_from IS NULL THEN
    -- Modo rolling: desde el último corte hasta hoy
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
      WHERE t.seller_id = p_seller_id
        AND t.admin_id  = p_admin_id
        AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
        AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id);
      v_period_from := COALESCE(v_period_from, CURRENT_DATE - 30);
    END IF;

  ELSE
    -- Modo filtro de fecha: mostrar balance bruto del período menos lo ya liquidado
    v_use_date_mode := TRUE;
    v_period_from   := p_date_from;

    SELECT COALESCE(SUM(s.amount), 0)
    INTO v_total_settled
    FROM public.settlements s
    WHERE s.seller_id    = p_seller_id
      AND s.admin_id     = p_admin_id
      AND s.period_start = p_date_from
      AND s.period_end   = v_period_to
      AND ((p_lottery_id   IS NULL AND s.lottery_id   IS NULL) OR s.lottery_id   = p_lottery_id)
      AND ((p_draw_time_id IS NULL AND s.draw_time_id IS NULL) OR s.draw_time_id = p_draw_time_id);

    v_total_settled := COALESCE(v_total_settled, 0);
  END IF;

  RETURN QUERY
  WITH sales AS (
    SELECT COALESCE(SUM(tn.subtotal), 0) AS total
    FROM public.ticket_numbers tn
    JOIN public.tickets t ON t.id = tn.ticket_id
    WHERE t.seller_id     = p_seller_id
      AND t.admin_id      = p_admin_id
      AND t.is_cancelled  = FALSE
      AND t.sale_date     BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
  ),
  prizes AS (
    SELECT COALESCE(SUM(wt.prize_amount), 0) AS total
    FROM public.winning_tickets wt
    WHERE wt.seller_id  = p_seller_id
      AND wt.admin_id   = p_admin_id
      AND wt.draw_date  BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR wt.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
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
    CASE
      WHEN v_use_date_mode THEN
        -- balance bruto del período menos lo ya liquidado
        (sa.total - sa.total * v_pct / 100) - pr.total - v_total_settled
      ELSE
        -- modo rolling: prev_pending + ventas nuevas - premios nuevos
        v_prev_pending + (sa.total - sa.total * v_pct / 100) - pr.total
    END,
    v_period_from,
    v_period_to
  FROM sales sa, prizes pr, sinfo si;
END;
$$;


-- ============================================================
-- 2. get_seller_balance_for_seller  (vista del vendedor en la app)
-- ============================================================
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
  v_admin_id      UUID;
  v_pct           NUMERIC;
  v_period_from   DATE;
  v_period_to     DATE;
  v_last_settle   DATE;
  v_prev_pending  NUMERIC := 0;
  v_total_settled NUMERIC := 0;
  v_use_date_mode BOOLEAN := FALSE;
BEGIN
  IF p_seller_id != auth.uid() THEN
    RAISE EXCEPTION 'Solo puedes consultar tu propio balance';
  END IF;

  SELECT p.parent_admin_id, p.seller_percentage
  INTO v_admin_id, v_pct
  FROM public.profiles p
  WHERE p.id = p_seller_id;

  v_pct := COALESCE(v_pct, 0);
  v_period_to := COALESCE(p_date_to, CURRENT_DATE);

  IF p_date_from IS NULL THEN
    SELECT s.period_end, COALESCE(s.balance_at_settlement - s.amount, 0)
    INTO v_last_settle, v_prev_pending
    FROM public.settlements s
    WHERE s.seller_id = p_seller_id
      AND s.admin_id  = v_admin_id
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
      WHERE t.seller_id = p_seller_id
        AND t.admin_id  = v_admin_id
        AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
        AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id);
      v_period_from := COALESCE(v_period_from, CURRENT_DATE - 30);
    END IF;

  ELSE
    v_use_date_mode := TRUE;
    v_period_from   := p_date_from;

    SELECT COALESCE(SUM(s.amount), 0)
    INTO v_total_settled
    FROM public.settlements s
    WHERE s.seller_id    = p_seller_id
      AND s.admin_id     = v_admin_id
      AND s.period_start = p_date_from
      AND s.period_end   = v_period_to
      AND ((p_lottery_id   IS NULL AND s.lottery_id   IS NULL) OR s.lottery_id   = p_lottery_id)
      AND ((p_draw_time_id IS NULL AND s.draw_time_id IS NULL) OR s.draw_time_id = p_draw_time_id);

    v_total_settled := COALESCE(v_total_settled, 0);
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
  ),
  prizes AS (
    SELECT COALESCE(SUM(wt.prize_amount), 0) AS total
    FROM public.winning_tickets wt
    WHERE wt.seller_id  = p_seller_id
      AND wt.admin_id   = v_admin_id
      AND wt.draw_date  BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR wt.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
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
    CASE
      WHEN v_use_date_mode THEN
        (sa.total - sa.total * v_pct / 100) - pr.total - v_total_settled
      ELSE
        v_prev_pending + (sa.total - sa.total * v_pct / 100) - pr.total
    END,
    v_period_from,
    v_period_to
  FROM sales sa, prizes pr, sinfo si;
END;
$$;


-- ============================================================
-- 3. create_settlement  (crear corte)
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
  v_pct           NUMERIC;
  v_period_from   DATE;
  v_period_to     DATE;
  v_last_settle   DATE;
  v_total_sales   NUMERIC := 0;
  v_total_prizes  NUMERIC := 0;
  v_commission    NUMERIC := 0;
  v_admin_part    NUMERIC := 0;
  v_balance       NUMERIC := 0;
  v_prev_pending  NUMERIC := 0;
  v_total_settled NUMERIC := 0;
  v_amount        NUMERIC := 0;
  v_new_id        UUID;
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

  v_period_to := COALESCE(p_date_to, CURRENT_DATE);

  IF p_date_from IS NULL THEN
    -- Modo rolling: usar el último corte para definir el período
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
      WHERE t.seller_id = p_seller_id
        AND t.admin_id  = p_admin_id
        AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
        AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id);
      v_period_from := COALESCE(v_period_from, CURRENT_DATE);
    END IF;

  ELSE
    -- Modo filtro de fecha: el balance ya liquidado no se arrastra
    v_period_from := p_date_from;

    SELECT COALESCE(SUM(s.amount), 0)
    INTO v_total_settled
    FROM public.settlements s
    WHERE s.seller_id    = p_seller_id
      AND s.admin_id     = p_admin_id
      AND s.period_start = p_date_from
      AND s.period_end   = v_period_to
      AND ((p_lottery_id   IS NULL AND s.lottery_id   IS NULL) OR s.lottery_id   = p_lottery_id)
      AND ((p_draw_time_id IS NULL AND s.draw_time_id IS NULL) OR s.draw_time_id = p_draw_time_id);

    v_total_settled := COALESCE(v_total_settled, 0);
    v_prev_pending  := 0;
  END IF;

  -- Calcular ventas y premios del período
  SELECT COALESCE(SUM(tn.subtotal), 0) INTO v_total_sales
  FROM public.ticket_numbers tn
  JOIN public.tickets t ON t.id = tn.ticket_id
  WHERE t.seller_id    = p_seller_id
    AND t.admin_id     = p_admin_id
    AND t.is_cancelled = FALSE
    AND t.sale_date    BETWEEN v_period_from AND v_period_to
    AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
    AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id);

  SELECT COALESCE(SUM(wt.prize_amount), 0) INTO v_total_prizes
  FROM public.winning_tickets wt
  WHERE wt.seller_id  = p_seller_id
    AND wt.admin_id   = p_admin_id
    AND wt.draw_date  BETWEEN v_period_from AND v_period_to
    AND (p_lottery_id   IS NULL OR wt.lottery_id   = p_lottery_id)
    AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id);

  v_commission := v_total_sales * v_pct / 100;
  v_admin_part := v_total_sales - v_commission;

  -- balance a liquidar = ventas del período + prev_pending - premios - ya liquidado
  v_balance := v_prev_pending + v_admin_part - v_total_prizes - v_total_settled;
  v_amount  := COALESCE(p_amount, v_balance);

  IF v_balance > 0 AND (v_amount < 0 OR v_amount > v_balance) THEN
    RAISE EXCEPTION 'El monto del corte debe estar entre 0 y %', v_balance;
  END IF;

  IF v_balance < 0 AND (v_amount > 0 OR v_amount < v_balance) THEN
    RAISE EXCEPTION 'El monto del corte debe estar entre % y 0', v_balance;
  END IF;

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
-- Grants (si no existen ya)
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_seller_balance(UUID,UUID,DATE,DATE,UUID,UUID)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_balance_for_seller(UUID,DATE,DATE,UUID,UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_settlement(UUID,UUID,NUMERIC,TEXT,DATE,DATE,UUID,UUID) TO authenticated;
