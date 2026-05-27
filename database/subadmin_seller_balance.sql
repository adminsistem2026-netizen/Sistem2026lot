-- ============================================================
-- BALANCE Y CORTES DEL SUB_ADMIN CON SUS VENDEDORES
--
-- Fuente de verdad para la cuenta corriente sub_admin -> seller.
--
-- Regla oficial:
--   neto_periodo = ventas - comision - premios_generados
--   saldo_actual = neto_periodo - cortes_registrados
--
-- Convenciones:
--   amount > 0  -> vendedor entrega dinero al sub_admin
--   amount < 0  -> sub_admin entrega dinero al vendedor
--
-- Importante:
-- - Los settlements de esta capa usan admin_id = sub_admin_id
--   para aislarlos de los cortes admin -> sub_admin/admin -> seller.
-- - Los premios que cuentan son los GENERADOS.
-- - Ya no se usa la logica de residual del ultimo corte.
-- ============================================================


-- ============================================================
-- 1. get_seller_balance_for_subadmin
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_seller_balance_for_subadmin(
  p_sub_admin_id UUID,
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
  v_pct               NUMERIC := 0;
  v_admin_id          UUID;
  v_period_from       DATE;
  v_period_to         DATE;
  v_total_sales       NUMERIC := 0;
  v_total_prizes      NUMERIC := 0;
  v_total_commission  NUMERIC := 0;
  v_admin_part        NUMERIC := 0;
  v_total_settlements NUMERIC := 0;
BEGIN
  IF auth.uid() <> p_sub_admin_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT p.parent_admin_id
  INTO v_admin_id
  FROM public.profiles p
  WHERE p.id = p_sub_admin_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_seller_id
      AND p.sub_admin_id = p_sub_admin_id
      AND p.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'El vendedor no pertenece a este sub-admin';
  END IF;

  SELECT p.seller_percentage
  INTO v_pct
  FROM public.profiles p
  WHERE p.id = p_seller_id;

  v_pct := COALESCE(v_pct, 0);
  v_period_to := COALESCE(p_date_to, CURRENT_DATE);

  IF p_date_from IS NULL THEN
    SELECT MIN(seed.activity_day)
    INTO v_period_from
    FROM (
      SELECT MIN(t.sale_date) AS activity_day
      FROM public.tickets t
      WHERE t.seller_id = p_seller_id
        AND t.admin_id = v_admin_id
        AND t.is_cancelled = FALSE
        AND (p_lottery_id IS NULL OR t.lottery_id = p_lottery_id)
        AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)

      UNION ALL

      SELECT MIN(wt.draw_date) AS activity_day
      FROM public.winning_tickets wt
      WHERE wt.seller_id = p_seller_id
        AND wt.admin_id = v_admin_id
        AND (p_lottery_id IS NULL OR wt.lottery_id = p_lottery_id)
        AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)

      UNION ALL

      SELECT MIN(s.period_start) AS activity_day
      FROM public.settlements s
      WHERE s.seller_id = p_seller_id
        AND s.admin_id = p_sub_admin_id
        AND (p_lottery_id IS NULL OR s.lottery_id = p_lottery_id)
        AND (p_draw_time_id IS NULL OR s.draw_time_id = p_draw_time_id)
    ) seed
    WHERE seed.activity_day IS NOT NULL;

    v_period_from := COALESCE(v_period_from, CURRENT_DATE);
  ELSE
    v_period_from := p_date_from;
  END IF;

  IF v_period_to < v_period_from THEN
    v_period_to := v_period_from;
  END IF;

  SELECT COALESCE(SUM(tn.subtotal), 0)
  INTO v_total_sales
  FROM public.ticket_numbers tn
  JOIN public.tickets t ON t.id = tn.ticket_id
  WHERE t.seller_id = p_seller_id
    AND t.admin_id = v_admin_id
    AND t.is_cancelled = FALSE
    AND t.sale_date BETWEEN v_period_from AND v_period_to
    AND (p_lottery_id IS NULL OR t.lottery_id = p_lottery_id)
    AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id);

  SELECT COALESCE(SUM(wt.prize_amount), 0)
  INTO v_total_prizes
  FROM public.winning_tickets wt
  WHERE wt.seller_id = p_seller_id
    AND wt.admin_id = v_admin_id
    AND wt.draw_date BETWEEN v_period_from AND v_period_to
    AND (p_lottery_id IS NULL OR wt.lottery_id = p_lottery_id)
    AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id);

  SELECT COALESCE(SUM(s.amount), 0)
  INTO v_total_settlements
  FROM public.settlements s
  WHERE s.seller_id = p_seller_id
    AND s.admin_id = p_sub_admin_id
    AND (p_lottery_id IS NULL OR s.lottery_id = p_lottery_id)
    AND (p_draw_time_id IS NULL OR s.draw_time_id = p_draw_time_id)
    AND s.period_start <= v_period_to
    AND s.period_end >= v_period_from;

  v_total_sales := ROUND(v_total_sales, 2);
  v_total_commission := ROUND(v_total_sales * v_pct / 100, 2);
  v_admin_part := ROUND(v_total_sales - v_total_commission, 2);
  v_total_prizes := ROUND(v_total_prizes, 2);
  v_total_settlements := ROUND(v_total_settlements, 2);

  RETURN QUERY
  SELECT
    p_seller_id,
    p.full_name,
    v_pct,
    v_total_sales,
    v_total_commission,
    v_admin_part,
    v_total_prizes,
    ROUND(v_admin_part - v_total_prizes - v_total_settlements, 2),
    v_period_from,
    v_period_to
  FROM public.profiles p
  WHERE p.id = p_seller_id;
END;
$$;


-- ============================================================
-- 2. get_seller_balance_detail_for_subadmin
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_seller_balance_detail_for_subadmin(
  p_sub_admin_id UUID,
  p_seller_id    UUID,
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
  v_pct         NUMERIC := 0;
  v_admin_id    UUID;
  v_period_from DATE;
  v_period_to   DATE;
BEGIN
  IF auth.uid() <> p_sub_admin_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT p.parent_admin_id
  INTO v_admin_id
  FROM public.profiles p
  WHERE p.id = p_sub_admin_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_seller_id
      AND p.sub_admin_id = p_sub_admin_id
      AND p.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'El vendedor no pertenece a este sub-admin';
  END IF;

  SELECT p.seller_percentage
  INTO v_pct
  FROM public.profiles p
  WHERE p.id = p_seller_id;

  v_pct := COALESCE(v_pct, 0);
  v_period_to := COALESCE(p_date_to, CURRENT_DATE);

  IF p_date_from IS NULL THEN
    SELECT MIN(seed.activity_day)
    INTO v_period_from
    FROM (
      SELECT MIN(t.sale_date) AS activity_day
      FROM public.tickets t
      WHERE t.seller_id = p_seller_id
        AND t.admin_id = v_admin_id
        AND t.is_cancelled = FALSE
        AND (p_lottery_id IS NULL OR t.lottery_id = p_lottery_id)
        AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)

      UNION ALL

      SELECT MIN(wt.draw_date) AS activity_day
      FROM public.winning_tickets wt
      WHERE wt.seller_id = p_seller_id
        AND wt.admin_id = v_admin_id
        AND (p_lottery_id IS NULL OR wt.lottery_id = p_lottery_id)
        AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
    ) seed
    WHERE seed.activity_day IS NOT NULL;

    v_period_from := COALESCE(v_period_from, CURRENT_DATE);
  ELSE
    v_period_from := p_date_from;
  END IF;

  IF v_period_to < v_period_from THEN
    v_period_to := v_period_from;
  END IF;

  RETURN QUERY
  WITH daily_sales AS (
    SELECT
      t.sale_date AS dt,
      COALESCE(SUM(tn.subtotal), 0) AS total
    FROM public.ticket_numbers tn
    JOIN public.tickets t ON t.id = tn.ticket_id
    WHERE t.seller_id = p_seller_id
      AND t.admin_id = v_admin_id
      AND t.is_cancelled = FALSE
      AND t.sale_date BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id IS NULL OR t.lottery_id = p_lottery_id)
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
    GROUP BY t.sale_date
  ),
  daily_prizes AS (
    SELECT
      wt.draw_date AS dt,
      COALESCE(SUM(wt.prize_amount), 0) AS total
    FROM public.winning_tickets wt
    WHERE wt.seller_id = p_seller_id
      AND wt.admin_id = v_admin_id
      AND wt.draw_date BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id IS NULL OR wt.lottery_id = p_lottery_id)
      AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
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
-- 3. create_settlement_by_subadmin
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_settlement_by_subadmin(
  p_sub_admin_id UUID,
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
  v_new_id      UUID;
  v_balance_row RECORD;
  v_period_from DATE;
  v_period_to   DATE;
  v_amount      NUMERIC;
BEGIN
  IF auth.uid() <> p_sub_admin_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_seller_id
      AND p.sub_admin_id = p_sub_admin_id
      AND p.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'El vendedor no pertenece a este sub-admin';
  END IF;

  SELECT *
  INTO v_balance_row
  FROM public.get_seller_balance_for_subadmin(
    p_sub_admin_id,
    p_seller_id,
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
    p_sub_admin_id,
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
    p_sub_admin_id
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
-- 4. get_settlements_history_for_subadmin (6 args)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_settlements_history_for_subadmin(
  p_sub_admin_id UUID,
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() <> p_sub_admin_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_seller_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_seller_id
      AND p.sub_admin_id = p_sub_admin_id
      AND p.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'El vendedor no pertenece a este sub-admin';
  END IF;

  RETURN QUERY
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
  WHERE s.admin_id = p_sub_admin_id
    AND (p_seller_id IS NULL OR s.seller_id = p_seller_id)
    AND (p_lottery_id IS NULL OR s.lottery_id = p_lottery_id)
    AND (p_draw_time_id IS NULL OR s.draw_time_id = p_draw_time_id)
    AND (
      p_date_from IS NULL OR (
        s.period_start <= COALESCE(p_date_to, CURRENT_DATE)
        AND s.period_end >= p_date_from
      )
    )
  ORDER BY s.created_at DESC;
END;
$$;


-- ============================================================
-- 5. get_settlements_history_for_subadmin wrapper 2 args
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_settlements_history_for_subadmin(
  p_sub_admin_id UUID,
  p_seller_id    UUID
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
  created_at            TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    h.id,
    h.seller_id,
    h.seller_name,
    h.amount,
    h.balance_at_settlement,
    h.total_sales,
    h.total_commission,
    h.total_prizes_paid,
    h.notes,
    h.period_start,
    h.period_end,
    h.created_at
  FROM public.get_settlements_history_for_subadmin(
    p_sub_admin_id,
    p_seller_id,
    NULL::DATE,
    NULL::DATE,
    NULL::UUID,
    NULL::UUID
  ) h;
$$;


-- ============================================================
-- 6. delete_settlement_by_subadmin
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_settlement_by_subadmin(
  p_settlement_id UUID,
  p_sub_admin_id  UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() <> p_sub_admin_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.settlements
    WHERE id = p_settlement_id
      AND admin_id = p_sub_admin_id
  ) THEN
    RAISE EXCEPTION 'Corte no encontrado o no tienes permiso para eliminarlo';
  END IF;

  DELETE FROM public.settlements
  WHERE id = p_settlement_id
    AND admin_id = p_sub_admin_id;
END;
$$;


-- ============================================================
-- Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_seller_balance_for_subadmin(UUID,UUID,DATE,DATE,UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_balance_detail_for_subadmin(UUID,UUID,DATE,DATE,UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_settlement_by_subadmin(UUID,UUID,NUMERIC,TEXT,DATE,DATE,UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_settlements_history_for_subadmin(UUID,UUID,DATE,DATE,UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_settlements_history_for_subadmin(UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_settlement_by_subadmin(UUID,UUID) TO authenticated;
