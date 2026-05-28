-- ============================================================
-- HOTFIX: cortes antes del cierre del dia (vendedor directo)
--
-- Problema:
-- - Se crea un corte a mitad del dia, por ejemplo 2026-05-27 11:26
-- - Luego siguen entrando tickets/premios con sale_date/draw_date = 2026-05-27
-- - La logica actual trabaja por FECHA y considera todo el 27 como cortado
--
-- Efecto:
-- - El balance actual deja fuera ventas/premios creados despues del corte
-- - Las tarjetas pueden quedar en 0 aunque existan movimientos posteriores
--
-- Solucion:
-- - Un movimiento se considera cubierto por un settlement solo si:
--     1) su fecha cae dentro de period_start..period_end
--     2) su created_at <= settlement.created_at
-- - En modo rolling, el periodo abierto vuelve a arrancar desde
--   period_end del ultimo corte (no desde period_end + 1), para que
--   el mismo dia siga acumulando movimientos posteriores al corte.
--
-- Alcance de este hotfix:
-- - admin -> vendedor directo
-- - vendedor directo viendo su propio balance
--
-- Funciones redefinidas:
-- - get_seller_balance
-- - get_seller_balance_detail
-- - create_settlement
-- - get_seller_balance_for_seller
-- - get_seller_balance_detail_for_seller
-- ============================================================


-- ============================================================
-- 1. get_seller_balance (admin)
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
  v_pct             NUMERIC := 0;
  v_period_from     DATE;
  v_period_to       DATE;
  v_last_settle_end DATE;
  v_last_settle_at  TIMESTAMPTZ;
  v_prev_pending    NUMERIC := 0;
  v_group_ids       UUID[];
BEGIN
  SELECT p.seller_percentage INTO v_pct
  FROM public.profiles p
  WHERE p.id = p_seller_id;
  v_pct := COALESCE(v_pct, 0);

  SELECT array_agg(sub.id) INTO v_group_ids
  FROM (
    SELECT p_seller_id AS id
    UNION ALL
    SELECT p.id
    FROM public.profiles p
    WHERE p.sub_admin_id = p_seller_id
      AND p.parent_admin_id = p_admin_id
      AND p.is_active = TRUE
  ) sub;

  v_period_to := COALESCE(p_date_to, CURRENT_DATE);

  IF p_date_from IS NULL THEN
    SELECT
      s.period_end,
      s.created_at,
      COALESCE(s.balance_at_settlement - s.amount, 0)
    INTO v_last_settle_end, v_last_settle_at, v_prev_pending
    FROM public.settlements s
    WHERE s.seller_id = p_seller_id
      AND s.admin_id = p_admin_id
      AND ((p_lottery_id IS NULL AND s.lottery_id IS NULL) OR s.lottery_id = p_lottery_id)
      AND ((p_draw_time_id IS NULL AND s.draw_time_id IS NULL) OR s.draw_time_id = p_draw_time_id)
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_last_settle_end IS NOT NULL THEN
      v_period_from := v_last_settle_end;
      v_prev_pending := COALESCE(v_prev_pending, 0);
    ELSE
      SELECT MIN(t.sale_date) INTO v_period_from
      FROM public.tickets t
      WHERE t.seller_id = ANY(v_group_ids)
        AND t.admin_id = p_admin_id
        AND (p_lottery_id IS NULL OR t.lottery_id = p_lottery_id)
        AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id);
      v_period_from := COALESCE(v_period_from, CURRENT_DATE - 30);
      v_prev_pending := 0;
    END IF;
  ELSE
    v_period_from := p_date_from;
    SELECT COALESCE(SUM(s.balance_at_settlement - s.amount), 0)
    INTO v_prev_pending
    FROM public.settlements s
    WHERE s.seller_id = p_seller_id
      AND s.admin_id = p_admin_id
      AND s.period_end BETWEEN v_period_from AND v_period_to
      AND ((p_lottery_id IS NULL AND s.lottery_id IS NULL) OR s.lottery_id = p_lottery_id)
      AND ((p_draw_time_id IS NULL AND s.draw_time_id IS NULL) OR s.draw_time_id = p_draw_time_id);
  END IF;

  RETURN QUERY
  WITH sales AS (
    SELECT COALESCE(SUM(tn.subtotal), 0) AS total
    FROM public.ticket_numbers tn
    JOIN public.tickets t ON t.id = tn.ticket_id
    WHERE t.seller_id = ANY(v_group_ids)
      AND t.admin_id = p_admin_id
      AND t.is_cancelled = FALSE
      AND t.sale_date BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id IS NULL OR t.lottery_id = p_lottery_id)
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.settlements s2
        WHERE s2.seller_id = p_seller_id
          AND s2.admin_id = p_admin_id
          AND t.sale_date BETWEEN s2.period_start AND s2.period_end
          AND t.created_at <= s2.created_at
          AND ((p_lottery_id IS NULL AND s2.lottery_id IS NULL) OR s2.lottery_id = p_lottery_id)
          AND ((p_draw_time_id IS NULL AND s2.draw_time_id IS NULL) OR s2.draw_time_id = p_draw_time_id)
      )
  ),
  prizes AS (
    SELECT COALESCE(SUM(wt.prize_amount), 0) AS total
    FROM public.winning_tickets wt
    WHERE wt.seller_id = ANY(v_group_ids)
      AND wt.admin_id = p_admin_id
      AND wt.draw_date BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id IS NULL OR wt.lottery_id = p_lottery_id)
      AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.settlements s2
        WHERE s2.seller_id = p_seller_id
          AND s2.admin_id = p_admin_id
          AND wt.draw_date BETWEEN s2.period_start AND s2.period_end
          AND wt.created_at <= s2.created_at
          AND ((p_lottery_id IS NULL AND s2.lottery_id IS NULL) OR s2.lottery_id = p_lottery_id)
          AND ((p_draw_time_id IS NULL AND s2.draw_time_id IS NULL) OR s2.draw_time_id = p_draw_time_id)
      )
  ),
  sinfo AS (
    SELECT p.full_name
    FROM public.profiles p
    WHERE p.id = p_seller_id
  )
  SELECT
    p_seller_id,
    si.full_name,
    v_pct,
    sa.total,
    ROUND(sa.total * v_pct / 100, 2),
    ROUND(sa.total - (sa.total * v_pct / 100), 2),
    pr.total,
    ROUND(v_prev_pending + (sa.total - (sa.total * v_pct / 100)) - pr.total, 2),
    v_period_from,
    v_period_to
  FROM sales sa, prizes pr, sinfo si;
END;
$$;


-- ============================================================
-- 2. get_seller_balance_detail (admin)
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
  v_pct             NUMERIC := 0;
  v_period_from     DATE;
  v_period_to       DATE;
  v_last_settle_end DATE;
  v_group_ids       UUID[];
BEGIN
  SELECT p.seller_percentage INTO v_pct
  FROM public.profiles p
  WHERE p.id = p_seller_id;
  v_pct := COALESCE(v_pct, 0);

  SELECT array_agg(sub.id) INTO v_group_ids
  FROM (
    SELECT p_seller_id AS id
    UNION ALL
    SELECT p.id
    FROM public.profiles p
    WHERE p.sub_admin_id = p_seller_id
      AND p.parent_admin_id = p_admin_id
      AND p.is_active = TRUE
  ) sub;

  IF p_date_from IS NULL THEN
    SELECT s.period_end
    INTO v_last_settle_end
    FROM public.settlements s
    WHERE s.seller_id = p_seller_id
      AND s.admin_id = p_admin_id
      AND ((p_lottery_id IS NULL AND s.lottery_id IS NULL) OR s.lottery_id = p_lottery_id)
      AND ((p_draw_time_id IS NULL AND s.draw_time_id IS NULL) OR s.draw_time_id = p_draw_time_id)
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_last_settle_end IS NOT NULL THEN
      v_period_from := v_last_settle_end;
    ELSE
      SELECT MIN(t.sale_date) INTO v_period_from
      FROM public.tickets t
      WHERE t.seller_id = ANY(v_group_ids)
        AND t.admin_id = p_admin_id
        AND (p_lottery_id IS NULL OR t.lottery_id = p_lottery_id)
        AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id);
      v_period_from := COALESCE(v_period_from, CURRENT_DATE - 30);
    END IF;
  ELSE
    v_period_from := p_date_from;
  END IF;

  v_period_to := COALESCE(p_date_to, CURRENT_DATE);

  RETURN QUERY
  WITH daily_sales AS (
    SELECT t.sale_date AS dt, COALESCE(SUM(tn.subtotal), 0) AS total
    FROM public.ticket_numbers tn
    JOIN public.tickets t ON t.id = tn.ticket_id
    WHERE t.seller_id = ANY(v_group_ids)
      AND t.admin_id = p_admin_id
      AND t.is_cancelled = FALSE
      AND t.sale_date BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id IS NULL OR t.lottery_id = p_lottery_id)
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.settlements s2
        WHERE s2.seller_id = p_seller_id
          AND s2.admin_id = p_admin_id
          AND t.sale_date BETWEEN s2.period_start AND s2.period_end
          AND t.created_at <= s2.created_at
          AND ((p_lottery_id IS NULL AND s2.lottery_id IS NULL) OR s2.lottery_id = p_lottery_id)
          AND ((p_draw_time_id IS NULL AND s2.draw_time_id IS NULL) OR s2.draw_time_id = p_draw_time_id)
      )
    GROUP BY t.sale_date
  ),
  daily_prizes AS (
    SELECT wt.draw_date AS dt, COALESCE(SUM(wt.prize_amount), 0) AS total
    FROM public.winning_tickets wt
    WHERE wt.seller_id = ANY(v_group_ids)
      AND wt.admin_id = p_admin_id
      AND wt.draw_date BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id IS NULL OR wt.lottery_id = p_lottery_id)
      AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.settlements s2
        WHERE s2.seller_id = p_seller_id
          AND s2.admin_id = p_admin_id
          AND wt.draw_date BETWEEN s2.period_start AND s2.period_end
          AND wt.created_at <= s2.created_at
          AND ((p_lottery_id IS NULL AND s2.lottery_id IS NULL) OR s2.lottery_id = p_lottery_id)
          AND ((p_draw_time_id IS NULL AND s2.draw_time_id IS NULL) OR s2.draw_time_id = p_draw_time_id)
      )
    GROUP BY wt.draw_date
  )
  SELECT
    COALESCE(ds.dt, dp.dt) AS day,
    ROUND(COALESCE(ds.total, 0), 2) AS total_sales,
    v_pct AS commission_pct,
    ROUND(COALESCE(ds.total, 0) * v_pct / 100, 2) AS total_commission,
    ROUND(COALESCE(ds.total, 0) - (COALESCE(ds.total, 0) * v_pct / 100), 2) AS admin_part,
    ROUND(COALESCE(dp.total, 0), 2) AS prizes_paid,
    ROUND((COALESCE(ds.total, 0) - (COALESCE(ds.total, 0) * v_pct / 100)) - COALESCE(dp.total, 0), 2) AS balance_day,
    FALSE AS is_settled
  FROM daily_sales ds
  FULL OUTER JOIN daily_prizes dp ON dp.dt = ds.dt
  ORDER BY COALESCE(ds.dt, dp.dt) DESC;
END;
$$;


-- ============================================================
-- 3. create_settlement (admin)
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_settlement(
  p_admin_id     UUID,
  p_seller_id    UUID,
  p_amount       NUMERIC DEFAULT NULL,
  p_notes        TEXT DEFAULT NULL,
  p_date_from    DATE DEFAULT NULL,
  p_date_to      DATE DEFAULT NULL,
  p_lottery_id   UUID DEFAULT NULL,
  p_draw_time_id UUID DEFAULT NULL
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
  v_new_id          UUID;
  v_balance_row     RECORD;
  v_period_from     DATE;
  v_period_to       DATE;
  v_amount          NUMERIC;
BEGIN
  SELECT *
  INTO v_balance_row
  FROM public.get_seller_balance(
    p_seller_id,
    p_admin_id,
    p_date_from,
    p_date_to,
    p_lottery_id,
    p_draw_time_id
  )
  LIMIT 1;

  v_period_from := v_balance_row.period_start;
  v_period_to := v_balance_row.period_end;
  v_amount := ROUND(COALESCE(p_amount, v_balance_row.balance), 2);

  IF v_balance_row.balance > 0 AND (v_amount < 0 OR v_amount > v_balance_row.balance) THEN
    RAISE EXCEPTION 'El monto del corte debe estar entre 0 y %', ROUND(v_balance_row.balance, 2);
  END IF;

  IF v_balance_row.balance < 0 AND (v_amount > 0 OR v_amount < v_balance_row.balance) THEN
    RAISE EXCEPTION 'El monto del corte debe estar entre % y 0', ROUND(v_balance_row.balance, 2);
  END IF;

  v_new_id := gen_random_uuid();

  INSERT INTO public.settlements (
    id,
    admin_id,
    seller_id,
    lottery_id,
    draw_time_id,
    amount,
    balance_at_settlement,
    total_sales,
    total_commission,
    total_prizes_paid,
    notes,
    period_start,
    period_end,
    created_at,
    created_by
  ) VALUES (
    v_new_id,
    p_admin_id,
    p_seller_id,
    p_lottery_id,
    p_draw_time_id,
    v_amount,
    ROUND(v_balance_row.balance, 2),
    ROUND(v_balance_row.total_sales, 2),
    ROUND(v_balance_row.total_commission, 2),
    ROUND(v_balance_row.total_prizes_paid, 2),
    p_notes,
    v_period_from,
    v_period_to,
    NOW(),
    p_admin_id
  );

  RETURN QUERY
  SELECT
    v_new_id,
    v_amount,
    ROUND(v_balance_row.balance, 2),
    ROUND(v_balance_row.total_sales, 2),
    ROUND(v_balance_row.total_commission, 2),
    ROUND(v_balance_row.total_prizes_paid, 2),
    v_period_from,
    v_period_to,
    NOW()::TIMESTAMPTZ;
END;
$$;


-- ============================================================
-- 4. get_seller_balance_for_seller
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_seller_balance_for_seller(
  p_seller_id     UUID,
  p_date_from     DATE DEFAULT NULL,
  p_date_to       DATE DEFAULT NULL,
  p_lottery_id    UUID DEFAULT NULL,
  p_draw_time_id  UUID DEFAULT NULL,
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
  v_admin_id        UUID;
  v_sub_admin_id    UUID;
  v_account_admin   UUID;
  v_pct             NUMERIC := 0;
  v_period_from     DATE;
  v_period_to       DATE;
  v_last_settle_end DATE;
  v_prev_pending    NUMERIC := 0;
  v_group_ids       UUID[];
BEGIN
  IF p_seller_id != auth.uid() THEN
    RAISE EXCEPTION 'Solo puedes consultar tu propio balance';
  END IF;

  SELECT p.parent_admin_id, p.seller_percentage, p.sub_admin_id
  INTO v_admin_id, v_pct, v_sub_admin_id
  FROM public.profiles p
  WHERE p.id = p_seller_id;

  v_account_admin := COALESCE(v_sub_admin_id, v_admin_id);
  v_pct := COALESCE(v_pct, 0);
  v_period_to := COALESCE(p_date_to, CURRENT_DATE);

  IF p_include_group THEN
    SELECT array_agg(sub.id) INTO v_group_ids
    FROM (
      SELECT p_seller_id AS id
      UNION ALL
      SELECT p.id
      FROM public.profiles p
      WHERE p.sub_admin_id = p_seller_id
        AND p.parent_admin_id = v_admin_id
        AND p.is_active = TRUE
    ) sub;
  ELSE
    v_group_ids := ARRAY[p_seller_id];
  END IF;

  IF p_date_from IS NULL THEN
    SELECT
      s.period_end,
      COALESCE(s.balance_at_settlement - s.amount, 0)
    INTO v_last_settle_end, v_prev_pending
    FROM public.settlements s
    WHERE s.seller_id = p_seller_id
      AND s.admin_id = v_account_admin
      AND (p_lottery_id IS NULL OR s.lottery_id = p_lottery_id)
      AND (p_draw_time_id IS NULL OR s.draw_time_id = p_draw_time_id)
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_last_settle_end IS NOT NULL THEN
      v_period_from := v_last_settle_end;
      v_prev_pending := COALESCE(v_prev_pending, 0);
    ELSE
      SELECT MIN(t.sale_date) INTO v_period_from
      FROM public.tickets t
      WHERE t.seller_id = ANY(v_group_ids)
        AND t.admin_id = v_admin_id
        AND t.is_cancelled = FALSE
        AND (p_lottery_id IS NULL OR t.lottery_id = p_lottery_id)
        AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id);
      v_period_from := COALESCE(v_period_from, CURRENT_DATE - 30);
      v_prev_pending := 0;
    END IF;
  ELSE
    v_period_from := p_date_from;
    SELECT COALESCE(SUM(s.balance_at_settlement - s.amount), 0)
    INTO v_prev_pending
    FROM public.settlements s
    WHERE s.seller_id = p_seller_id
      AND s.admin_id = v_account_admin
      AND s.period_end BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id IS NULL OR s.lottery_id = p_lottery_id)
      AND (p_draw_time_id IS NULL OR s.draw_time_id = p_draw_time_id);
  END IF;

  RETURN QUERY
  WITH sales AS (
    SELECT COALESCE(SUM(tn.subtotal), 0) AS total
    FROM public.ticket_numbers tn
    JOIN public.tickets t ON t.id = tn.ticket_id
    WHERE t.seller_id = ANY(v_group_ids)
      AND t.admin_id = v_admin_id
      AND t.is_cancelled = FALSE
      AND t.sale_date BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id IS NULL OR t.lottery_id = p_lottery_id)
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.settlements s2
        WHERE s2.seller_id = p_seller_id
          AND s2.admin_id = v_account_admin
          AND t.sale_date BETWEEN s2.period_start AND s2.period_end
          AND t.created_at <= s2.created_at
          AND (p_lottery_id IS NULL OR s2.lottery_id = p_lottery_id)
          AND (p_draw_time_id IS NULL OR s2.draw_time_id = p_draw_time_id)
      )
  ),
  prizes AS (
    SELECT COALESCE(SUM(wt.prize_amount), 0) AS total
    FROM public.winning_tickets wt
    WHERE wt.seller_id = ANY(v_group_ids)
      AND wt.admin_id = v_admin_id
      AND wt.draw_date BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id IS NULL OR wt.lottery_id = p_lottery_id)
      AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.settlements s2
        WHERE s2.seller_id = p_seller_id
          AND s2.admin_id = v_account_admin
          AND wt.draw_date BETWEEN s2.period_start AND s2.period_end
          AND wt.created_at <= s2.created_at
          AND (p_lottery_id IS NULL OR s2.lottery_id = p_lottery_id)
          AND (p_draw_time_id IS NULL OR s2.draw_time_id = p_draw_time_id)
      )
  ),
  sinfo AS (
    SELECT p.full_name
    FROM public.profiles p
    WHERE p.id = p_seller_id
  )
  SELECT
    p_seller_id,
    si.full_name,
    v_pct,
    sa.total,
    ROUND(sa.total * v_pct / 100, 2),
    ROUND(sa.total - (sa.total * v_pct / 100), 2),
    pr.total,
    ROUND(v_prev_pending + (sa.total - (sa.total * v_pct / 100)) - pr.total, 2),
    v_period_from,
    v_period_to
  FROM sales sa, prizes pr, sinfo si;
END;
$$;


-- ============================================================
-- 5. get_seller_balance_detail_for_seller
-- ============================================================
DROP FUNCTION IF EXISTS public.get_seller_balance_detail_for_seller(UUID,DATE,DATE,UUID,UUID);
DROP FUNCTION IF EXISTS public.get_seller_balance_detail_for_seller(UUID,DATE,DATE,UUID,UUID,BOOLEAN);
CREATE OR REPLACE FUNCTION public.get_seller_balance_detail_for_seller(
  p_seller_id     UUID,
  p_date_from     DATE DEFAULT NULL,
  p_date_to       DATE DEFAULT NULL,
  p_lottery_id    UUID DEFAULT NULL,
  p_draw_time_id  UUID DEFAULT NULL,
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
  v_admin_id        UUID;
  v_sub_admin_id    UUID;
  v_account_admin   UUID;
  v_pct             NUMERIC := 0;
  v_period_from     DATE;
  v_period_to       DATE;
  v_last_settle_end DATE;
  v_group_ids       UUID[];
BEGIN
  IF p_seller_id != auth.uid() THEN
    RAISE EXCEPTION 'Solo puedes consultar tu propio balance';
  END IF;

  SELECT p.parent_admin_id, p.seller_percentage, p.sub_admin_id
  INTO v_admin_id, v_pct, v_sub_admin_id
  FROM public.profiles p
  WHERE p.id = p_seller_id;

  v_account_admin := COALESCE(v_sub_admin_id, v_admin_id);
  v_pct := COALESCE(v_pct, 0);

  IF p_include_group THEN
    SELECT array_agg(sub.id) INTO v_group_ids
    FROM (
      SELECT p_seller_id AS id
      UNION ALL
      SELECT p.id
      FROM public.profiles p
      WHERE p.sub_admin_id = p_seller_id
        AND p.parent_admin_id = v_admin_id
        AND p.is_active = TRUE
    ) sub;
  ELSE
    v_group_ids := ARRAY[p_seller_id];
  END IF;

  IF p_date_from IS NULL THEN
    SELECT s.period_end
    INTO v_last_settle_end
    FROM public.settlements s
    WHERE s.seller_id = p_seller_id
      AND s.admin_id = v_account_admin
      AND (p_lottery_id IS NULL OR s.lottery_id = p_lottery_id)
      AND (p_draw_time_id IS NULL OR s.draw_time_id = p_draw_time_id)
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_last_settle_end IS NOT NULL THEN
      v_period_from := v_last_settle_end;
    ELSE
      SELECT MIN(t.sale_date) INTO v_period_from
      FROM public.tickets t
      WHERE t.seller_id = ANY(v_group_ids)
        AND t.admin_id = v_admin_id
        AND (p_lottery_id IS NULL OR t.lottery_id = p_lottery_id)
        AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id);
      v_period_from := COALESCE(v_period_from, CURRENT_DATE - 30);
    END IF;
  ELSE
    v_period_from := p_date_from;
  END IF;

  v_period_to := COALESCE(p_date_to, CURRENT_DATE);

  RETURN QUERY
  WITH daily_sales AS (
    SELECT t.sale_date AS dt, COALESCE(SUM(tn.subtotal), 0) AS total
    FROM public.ticket_numbers tn
    JOIN public.tickets t ON t.id = tn.ticket_id
    WHERE t.seller_id = ANY(v_group_ids)
      AND t.admin_id = v_admin_id
      AND t.is_cancelled = FALSE
      AND t.sale_date BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id IS NULL OR t.lottery_id = p_lottery_id)
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.settlements s2
        WHERE s2.seller_id = p_seller_id
          AND s2.admin_id = v_account_admin
          AND t.sale_date BETWEEN s2.period_start AND s2.period_end
          AND t.created_at <= s2.created_at
          AND (p_lottery_id IS NULL OR s2.lottery_id = p_lottery_id)
          AND (p_draw_time_id IS NULL OR s2.draw_time_id = p_draw_time_id)
      )
    GROUP BY t.sale_date
  ),
  daily_prizes AS (
    SELECT wt.draw_date AS dt, COALESCE(SUM(wt.prize_amount), 0) AS total
    FROM public.winning_tickets wt
    WHERE wt.seller_id = ANY(v_group_ids)
      AND wt.admin_id = v_admin_id
      AND wt.draw_date BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id IS NULL OR wt.lottery_id = p_lottery_id)
      AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.settlements s2
        WHERE s2.seller_id = p_seller_id
          AND s2.admin_id = v_account_admin
          AND wt.draw_date BETWEEN s2.period_start AND s2.period_end
          AND wt.created_at <= s2.created_at
          AND (p_lottery_id IS NULL OR s2.lottery_id = p_lottery_id)
          AND (p_draw_time_id IS NULL OR s2.draw_time_id = p_draw_time_id)
      )
    GROUP BY wt.draw_date
  )
  SELECT
    COALESCE(ds.dt, dp.dt) AS day,
    ROUND(COALESCE(ds.total, 0), 2) AS total_sales,
    v_pct AS commission_pct,
    ROUND(COALESCE(ds.total, 0) * v_pct / 100, 2) AS total_commission,
    ROUND(COALESCE(ds.total, 0) - (COALESCE(ds.total, 0) * v_pct / 100), 2) AS admin_part,
    ROUND(COALESCE(dp.total, 0), 2) AS prizes_paid,
    ROUND((COALESCE(ds.total, 0) - (COALESCE(ds.total, 0) * v_pct / 100)) - COALESCE(dp.total, 0), 2) AS balance_day,
    FALSE AS is_settled
  FROM daily_sales ds
  FULL OUTER JOIN daily_prizes dp ON dp.dt = ds.dt
  ORDER BY COALESCE(ds.dt, dp.dt) DESC;
END;
$$;


GRANT EXECUTE ON FUNCTION public.get_seller_balance(UUID,UUID,DATE,DATE,UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_balance_detail(UUID,UUID,DATE,DATE,UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_settlement(UUID,UUID,NUMERIC,TEXT,DATE,DATE,UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_balance_for_seller(UUID,DATE,DATE,UUID,UUID,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_balance_detail_for_seller(UUID,DATE,DATE,UUID,UUID,BOOLEAN) TO authenticated;
