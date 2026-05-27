-- ============================================================
-- FIX: vendedor bajo subadmin debe tomar cortes del subadmin
--
-- Problema:
-- - El vendedor ve en historial el corte hecho por su subadmin
-- - Pero get_seller_balance_for_seller(...) seguia descontando
--   solo settlements con admin_id = parent_admin_id
--
-- Efecto:
-- - El balance actual del vendedor no bajaba a 0 aunque el corte
--   ya existiera en historial
--
-- Regla correcta:
-- - Si el vendedor tiene sub_admin_id, su cuenta corriente visible
--   en "Mi Balance" es seller <-> sub_admin
-- - Si no tiene sub_admin_id, su cuenta es seller <-> admin
--
-- Nota:
-- - Ventas y premios siguen saliendo del admin principal
--   (tickets.admin_id / winning_tickets.admin_id)
-- - Solo la capa de settlements cambia al account owner correcto
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
  v_sub_admin_id      UUID;
  v_account_admin_id  UUID;
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

GRANT EXECUTE ON FUNCTION public.get_seller_balance_for_seller(UUID,DATE,DATE,UUID,UUID,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_balance_for_seller(UUID,DATE,DATE,UUID,UUID) TO authenticated;
