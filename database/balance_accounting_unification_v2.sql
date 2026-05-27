-- ============================================================
-- PATCH: balance_accounting_unification_v2.sql
--
-- Aplicar encima del estado actual de produccion.
-- Esta version reemplaza de forma explicita la logica vieja
-- basada en "ultimo residual" por cuenta corriente unificada.
--
-- Regla oficial:
--   neto_periodo = ventas - comision - premios_generados
--   saldo_actual = neto_periodo - cortes_registrados
--
-- Convenciones:
--   amount > 0  -> vendedor entrega dinero al admin
--   amount < 0  -> admin entrega dinero al vendedor
--
-- Importante:
-- - Los premios que cuentan son los GENERADOS.
-- - Los cortes son movimientos contables; no cierran dias
--   ni reescriben el pasado.
-- - Se mantienen firmas legacy para no romper la app.
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
  v_pct               NUMERIC := 0;
  v_period_from       DATE;
  v_period_to         DATE;
  v_total_sales       NUMERIC := 0;
  v_total_prizes      NUMERIC := 0;
  v_total_commission  NUMERIC := 0;
  v_admin_part        NUMERIC := 0;
  v_total_settlements NUMERIC := 0;
  v_group_ids         UUID[];
BEGIN
  SELECT p.seller_percentage
  INTO v_pct
  FROM public.profiles p
  WHERE p.id = p_seller_id;

  v_pct := COALESCE(v_pct, 0);
  v_period_to := COALESCE(p_date_to, CURRENT_DATE);

  SELECT array_agg(member_id) INTO v_group_ids
  FROM (
    SELECT p_seller_id AS member_id
    UNION ALL
    SELECT p.id
    FROM public.profiles p
    WHERE p.sub_admin_id = p_seller_id
      AND p.parent_admin_id = p_admin_id
      AND p.is_active = TRUE
  ) members;

  IF p_date_from IS NULL THEN
    SELECT MIN(seed.activity_day)
    INTO v_period_from
    FROM (
      SELECT MIN(t.sale_date) AS activity_day
      FROM public.tickets t
      WHERE t.seller_id = ANY(v_group_ids)
        AND t.admin_id = p_admin_id
        AND t.is_cancelled = FALSE
        AND (p_lottery_id IS NULL OR t.lottery_id = p_lottery_id)
        AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)

      UNION ALL

      SELECT MIN(wt.draw_date) AS activity_day
      FROM public.winning_tickets wt
      WHERE wt.seller_id = ANY(v_group_ids)
        AND wt.admin_id = p_admin_id
        AND (p_lottery_id IS NULL OR wt.lottery_id = p_lottery_id)
        AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)

      UNION ALL

      SELECT MIN(s.period_start) AS activity_day
      FROM public.settlements s
      WHERE s.seller_id = p_seller_id
        AND s.admin_id = p_admin_id
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
  WHERE t.seller_id = ANY(v_group_ids)
    AND t.admin_id = p_admin_id
    AND t.is_cancelled = FALSE
    AND t.sale_date BETWEEN v_period_from AND v_period_to
    AND (p_lottery_id IS NULL OR t.lottery_id = p_lottery_id)
    AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id);

  SELECT COALESCE(SUM(wt.prize_amount), 0)
  INTO v_total_prizes
  FROM public.winning_tickets wt
  WHERE wt.seller_id = ANY(v_group_ids)
    AND wt.admin_id = p_admin_id
    AND wt.draw_date BETWEEN v_period_from AND v_period_to
    AND (p_lottery_id IS NULL OR wt.lottery_id = p_lottery_id)
    AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id);

  SELECT COALESCE(SUM(s.amount), 0)
  INTO v_total_settlements
  FROM public.settlements s
  WHERE s.seller_id = p_seller_id
    AND s.admin_id = p_admin_id
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
-- 2. get_seller_balance_detail (admin)
--    Solo neto operativo diario. Los cortes van aparte.
-- ============================================================
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
  v_pct         NUMERIC := 0;
  v_period_from DATE;
  v_period_to   DATE;
  v_group_ids   UUID[];
BEGIN
  SELECT p.seller_percentage
  INTO v_pct
  FROM public.profiles p
  WHERE p.id = p_seller_id;

  v_pct := COALESCE(v_pct, 0);
  v_period_to := COALESCE(p_date_to, CURRENT_DATE);

  SELECT array_agg(member_id) INTO v_group_ids
  FROM (
    SELECT p_seller_id AS member_id
    UNION ALL
    SELECT p.id
    FROM public.profiles p
    WHERE p.sub_admin_id = p_seller_id
      AND p.parent_admin_id = p_admin_id
      AND p.is_active = TRUE
  ) members;

  IF p_date_from IS NULL THEN
    SELECT MIN(seed.activity_day)
    INTO v_period_from
    FROM (
      SELECT MIN(t.sale_date) AS activity_day
      FROM public.tickets t
      WHERE t.seller_id = ANY(v_group_ids)
        AND t.admin_id = p_admin_id
        AND t.is_cancelled = FALSE
        AND (p_lottery_id IS NULL OR t.lottery_id = p_lottery_id)
        AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)

      UNION ALL

      SELECT MIN(wt.draw_date) AS activity_day
      FROM public.winning_tickets wt
      WHERE wt.seller_id = ANY(v_group_ids)
        AND wt.admin_id = p_admin_id
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
    WHERE t.seller_id = ANY(v_group_ids)
      AND t.admin_id = p_admin_id
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
    WHERE wt.seller_id = ANY(v_group_ids)
      AND wt.admin_id = p_admin_id
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
-- 3. get_all_sellers_balance
-- ============================================================
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
  WITH entities AS (
    SELECT
      p.id AS entity_id,
      p.full_name AS entity_name,
      COALESCE(p.seller_percentage, 0) AS pct
    FROM public.profiles p
    WHERE p.parent_admin_id = p_admin_id
      AND p.role = 'sub_admin'
      AND p.is_active = TRUE

    UNION ALL

    SELECT
      p.id,
      p.full_name,
      COALESCE(p.seller_percentage, 0)
    FROM public.profiles p
    WHERE p.parent_admin_id = p_admin_id
      AND p.role = 'seller'
      AND p.sub_admin_id IS NULL
      AND p.is_active = TRUE
  ),
  entity_members AS (
    SELECT e.entity_id, e.entity_id AS member_id
    FROM entities e

    UNION ALL

    SELECT e.entity_id, p.id AS member_id
    FROM entities e
    JOIN public.profiles p
      ON p.sub_admin_id = e.entity_id
     AND p.parent_admin_id = p_admin_id
     AND p.is_active = TRUE
  ),
  entity_sales AS (
    SELECT
      em.entity_id,
      COALESCE(SUM(tn.subtotal), 0) AS total
    FROM entity_members em
    JOIN public.tickets t
      ON t.seller_id = em.member_id
     AND t.admin_id = p_admin_id
     AND t.is_cancelled = FALSE
    JOIN public.ticket_numbers tn ON tn.ticket_id = t.id
    WHERE (p_date_from IS NULL OR t.sale_date >= p_date_from)
      AND (p_date_to IS NULL OR t.sale_date <= COALESCE(p_date_to, CURRENT_DATE))
      AND (p_lottery_id IS NULL OR t.lottery_id = p_lottery_id)
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
    GROUP BY em.entity_id
  ),
  entity_prizes AS (
    SELECT
      em.entity_id,
      COALESCE(SUM(wt.prize_amount), 0) AS total
    FROM entity_members em
    JOIN public.winning_tickets wt
      ON wt.seller_id = em.member_id
     AND wt.admin_id = p_admin_id
    WHERE (p_date_from IS NULL OR wt.draw_date >= p_date_from)
      AND (p_date_to IS NULL OR wt.draw_date <= COALESCE(p_date_to, CURRENT_DATE))
      AND (p_lottery_id IS NULL OR wt.lottery_id = p_lottery_id)
      AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
    GROUP BY em.entity_id
  ),
  entity_settlements AS (
    SELECT
      s.seller_id AS entity_id,
      COALESCE(SUM(s.amount), 0) AS total
    FROM public.settlements s
    WHERE s.admin_id = p_admin_id
      AND (p_lottery_id IS NULL OR s.lottery_id = p_lottery_id)
      AND (p_draw_time_id IS NULL OR s.draw_time_id = p_draw_time_id)
      AND (
        p_date_from IS NULL OR (
          s.period_start <= COALESCE(p_date_to, CURRENT_DATE)
          AND s.period_end >= p_date_from
        )
      )
    GROUP BY s.seller_id
  )
  SELECT
    e.entity_id AS seller_id,
    e.entity_name AS seller_name,
    e.pct AS commission_pct,
    ROUND(COALESCE(es.total, 0), 2) AS total_sales,
    ROUND(COALESCE(es.total, 0) * e.pct / 100, 2) AS total_commission,
    ROUND(COALESCE(es.total, 0) - (COALESCE(es.total, 0) * e.pct / 100), 2) AS admin_part,
    ROUND(COALESCE(ep.total, 0), 2) AS total_prizes_paid,
    ROUND(
      (COALESCE(es.total, 0) - (COALESCE(es.total, 0) * e.pct / 100))
      - COALESCE(ep.total, 0)
      - COALESCE(st.total, 0),
      2
    ) AS balance
  FROM entities e
  LEFT JOIN entity_sales es ON es.entity_id = e.entity_id
  LEFT JOIN entity_prizes ep ON ep.entity_id = e.entity_id
  LEFT JOIN entity_settlements st ON st.entity_id = e.entity_id
  ORDER BY e.entity_name;
$$;


-- ============================================================
-- 4. create_settlement (9 args, permite saldo a favor opcional)
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_settlement(
  p_admin_id     UUID,
  p_seller_id    UUID,
  p_amount       NUMERIC DEFAULT NULL,
  p_notes        TEXT DEFAULT NULL,
  p_date_from    DATE DEFAULT NULL,
  p_date_to      DATE DEFAULT NULL,
  p_lottery_id   UUID DEFAULT NULL,
  p_draw_time_id UUID DEFAULT NULL,
  p_allow_overpay BOOLEAN DEFAULT FALSE
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
  v_new_id           UUID;
  v_balance_row      RECORD;
  v_period_from      DATE;
  v_period_to        DATE;
  v_amount           NUMERIC;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_seller_id
      AND p.parent_admin_id = p_admin_id
  ) THEN
    RAISE EXCEPTION 'El vendedor no pertenece a este administrador';
  END IF;

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

  IF v_balance_row.balance > 0 THEN
    IF v_amount < 0 THEN
      RAISE EXCEPTION 'El monto del corte debe ser mayor o igual a 0';
    END IF;

    IF NOT p_allow_overpay AND v_amount > v_balance_row.balance THEN
      RAISE EXCEPTION 'El monto del corte debe estar entre 0 y %', ROUND(v_balance_row.balance, 2);
    END IF;
  END IF;

  IF v_balance_row.balance < 0 AND (v_amount > 0 OR v_amount < v_balance_row.balance) THEN
    RAISE EXCEPTION 'El monto del corte debe estar entre % y 0', ROUND(v_balance_row.balance, 2);
  END IF;

  IF p_allow_overpay AND v_balance_row.balance <= 0 THEN
    RAISE EXCEPTION 'El saldo a favor adicional solo aplica cuando el vendedor tiene balance pendiente a cobrar';
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
-- 5. create_settlement wrappers legacy
-- ============================================================
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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.create_settlement(
    p_admin_id,
    p_seller_id,
    p_amount,
    p_notes,
    NULL::DATE,
    NULL::DATE,
    NULL::UUID,
    NULL::UUID,
    FALSE
  );
$$;

CREATE OR REPLACE FUNCTION public.create_settlement(
  p_admin_id  UUID,
  p_seller_id UUID,
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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.create_settlement(
    p_admin_id,
    p_seller_id,
    NULL::NUMERIC,
    p_notes,
    NULL::DATE,
    NULL::DATE,
    NULL::UUID,
    NULL::UUID,
    FALSE
  );
$$;


-- ============================================================
-- 6. get_seller_balance_for_seller
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
  v_admin_id          UUID;
  v_account_admin_id  UUID;
  v_sub_admin_id      UUID;
  v_pct               NUMERIC := 0;
  v_period_from       DATE;
  v_period_to         DATE;
  v_total_sales       NUMERIC := 0;
  v_total_prizes      NUMERIC := 0;
  v_total_commission  NUMERIC := 0;
  v_admin_part        NUMERIC := 0;
  v_total_settlements NUMERIC := 0;
  v_group_ids         UUID[];
BEGIN
  IF auth.uid() <> p_seller_id THEN
    RAISE EXCEPTION 'Solo puedes consultar tu propio balance';
  END IF;

  SELECT p.parent_admin_id, p.seller_percentage, p.sub_admin_id
  INTO v_admin_id, v_pct, v_sub_admin_id
  FROM public.profiles p
  WHERE p.id = p_seller_id;

  v_account_admin_id := COALESCE(v_sub_admin_id, v_admin_id);
  v_pct := COALESCE(v_pct, 0);
  v_period_to := COALESCE(p_date_to, CURRENT_DATE);

  IF p_include_group THEN
    SELECT array_agg(member_id) INTO v_group_ids
    FROM (
      SELECT p_seller_id AS member_id
      UNION ALL
      SELECT p.id
      FROM public.profiles p
      WHERE p.sub_admin_id = p_seller_id
        AND p.parent_admin_id = v_admin_id
        AND p.is_active = TRUE
    ) members;
  ELSE
    v_group_ids := ARRAY[p_seller_id];
  END IF;

  IF p_date_from IS NULL THEN
    SELECT MIN(seed.activity_day)
    INTO v_period_from
    FROM (
      SELECT MIN(t.sale_date) AS activity_day
      FROM public.tickets t
      WHERE t.seller_id = ANY(v_group_ids)
        AND t.admin_id = v_admin_id
        AND t.is_cancelled = FALSE
        AND (p_lottery_id IS NULL OR t.lottery_id = p_lottery_id)
        AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)

      UNION ALL

      SELECT MIN(wt.draw_date) AS activity_day
      FROM public.winning_tickets wt
      WHERE wt.seller_id = ANY(v_group_ids)
        AND wt.admin_id = v_admin_id
        AND (p_lottery_id IS NULL OR wt.lottery_id = p_lottery_id)
        AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)

      UNION ALL

      SELECT MIN(s.period_start) AS activity_day
      FROM public.settlements s
      WHERE s.seller_id = p_seller_id
        AND s.admin_id = v_account_admin_id
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
  WHERE t.seller_id = ANY(v_group_ids)
    AND t.admin_id = v_admin_id
    AND t.is_cancelled = FALSE
    AND t.sale_date BETWEEN v_period_from AND v_period_to
    AND (p_lottery_id IS NULL OR t.lottery_id = p_lottery_id)
    AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id);

  SELECT COALESCE(SUM(wt.prize_amount), 0)
  INTO v_total_prizes
  FROM public.winning_tickets wt
  WHERE wt.seller_id = ANY(v_group_ids)
    AND wt.admin_id = v_admin_id
    AND wt.draw_date BETWEEN v_period_from AND v_period_to
    AND (p_lottery_id IS NULL OR wt.lottery_id = p_lottery_id)
    AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id);

  SELECT COALESCE(SUM(s.amount), 0)
  INTO v_total_settlements
  FROM public.settlements s
  WHERE s.seller_id = p_seller_id
    AND s.admin_id = v_account_admin_id
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
-- 7. get_seller_balance_for_seller wrapper 5 args
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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.get_seller_balance_for_seller(
    p_seller_id,
    p_date_from,
    p_date_to,
    p_lottery_id,
    p_draw_time_id,
    FALSE
  );
$$;


-- ============================================================
-- 8. get_seller_balance_detail_for_seller
-- ============================================================
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
  v_admin_id    UUID;
  v_pct         NUMERIC := 0;
  v_period_from DATE;
  v_period_to   DATE;
  v_group_ids   UUID[];
BEGIN
  IF auth.uid() <> p_seller_id THEN
    RAISE EXCEPTION 'Solo puedes consultar tu propio balance';
  END IF;

  SELECT p.parent_admin_id, p.seller_percentage
  INTO v_admin_id, v_pct
  FROM public.profiles p
  WHERE p.id = p_seller_id;

  v_pct := COALESCE(v_pct, 0);
  v_period_to := COALESCE(p_date_to, CURRENT_DATE);

  IF p_include_group THEN
    SELECT array_agg(member_id) INTO v_group_ids
    FROM (
      SELECT p_seller_id AS member_id
      UNION ALL
      SELECT p.id
      FROM public.profiles p
      WHERE p.sub_admin_id = p_seller_id
        AND p.parent_admin_id = v_admin_id
        AND p.is_active = TRUE
    ) members;
  ELSE
    v_group_ids := ARRAY[p_seller_id];
  END IF;

  IF p_date_from IS NULL THEN
    SELECT MIN(seed.activity_day)
    INTO v_period_from
    FROM (
      SELECT MIN(t.sale_date) AS activity_day
      FROM public.tickets t
      WHERE t.seller_id = ANY(v_group_ids)
        AND t.admin_id = v_admin_id
        AND t.is_cancelled = FALSE
        AND (p_lottery_id IS NULL OR t.lottery_id = p_lottery_id)
        AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)

      UNION ALL

      SELECT MIN(wt.draw_date) AS activity_day
      FROM public.winning_tickets wt
      WHERE wt.seller_id = ANY(v_group_ids)
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
    WHERE t.seller_id = ANY(v_group_ids)
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
    WHERE wt.seller_id = ANY(v_group_ids)
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
-- 9. get_seller_balance_detail_for_seller wrapper 5 args
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_seller_balance_detail_for_seller(
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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.get_seller_balance_detail_for_seller(
    p_seller_id,
    p_date_from,
    p_date_to,
    p_lottery_id,
    p_draw_time_id,
    FALSE
  );
$$;


-- ============================================================
-- 10. get_settlements_history wrapper legacy (2 args)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_settlements_history(
  p_admin_id  UUID,
  p_seller_id UUID DEFAULT NULL
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
  FROM public.get_settlements_history(
    p_admin_id,
    p_seller_id,
    NULL::DATE,
    NULL::DATE,
    NULL::UUID,
    NULL::UUID
  ) h;
$$;


-- ============================================================
-- 11. Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_seller_balance(UUID,UUID,DATE,DATE,UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_balance_detail(UUID,UUID,DATE,DATE,UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_sellers_balance(UUID,DATE,DATE,UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_settlement(UUID,UUID,NUMERIC,TEXT,DATE,DATE,UUID,UUID,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_settlement(UUID,UUID,NUMERIC,TEXT,DATE,DATE,UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_settlement(UUID,UUID,NUMERIC,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_settlement(UUID,UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_balance_for_seller(UUID,DATE,DATE,UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_balance_for_seller(UUID,DATE,DATE,UUID,UUID,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_balance_detail_for_seller(UUID,DATE,DATE,UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_balance_detail_for_seller(UUID,DATE,DATE,UUID,UUID,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_settlements_history(UUID,UUID) TO authenticated;
