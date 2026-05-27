-- ============================================================
-- PATCH: permitir saldo a favor adicional en cortes del admin
--
-- Caso de uso:
-- - balance actual del vendedor = 50.00
-- - admin registra corte por 90.00 con p_allow_overpay = true
-- - nuevo balance = -40.00
--
-- Regla de seguridad:
-- - solo aplica cuando el balance actual es positivo
-- - no cambia el comportamiento normal si p_allow_overpay = false
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_settlement(
  p_admin_id      UUID,
  p_seller_id     UUID,
  p_amount        NUMERIC DEFAULT NULL,
  p_notes         TEXT DEFAULT NULL,
  p_date_from     DATE DEFAULT NULL,
  p_date_to       DATE DEFAULT NULL,
  p_lottery_id    UUID DEFAULT NULL,
  p_draw_time_id  UUID DEFAULT NULL,
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
  v_new_id      UUID;
  v_balance_row RECORD;
  v_period_from DATE;
  v_period_to   DATE;
  v_amount      NUMERIC;
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

GRANT EXECUTE ON FUNCTION public.create_settlement(UUID,UUID,NUMERIC,TEXT,DATE,DATE,UUID,UUID,BOOLEAN) TO authenticated;
