-- ============================================================
-- MÓDULO: BALANCE Y LIQUIDACIONES VENDEDOR-ADMIN
-- Ejecutar en InsForge SQL Editor después del schema principal
-- y del winning_tickets_migration.sql
-- ============================================================


-- ============================================================
-- TABLA: settlements (cortes / liquidaciones)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.settlements (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id               UUID        NOT NULL REFERENCES public.profiles(id),
  seller_id              UUID        NOT NULL REFERENCES public.profiles(id),
  amount                 NUMERIC     NOT NULL,
  balance_at_settlement  NUMERIC     NOT NULL,
  total_sales            NUMERIC     NOT NULL DEFAULT 0,
  total_commission       NUMERIC     NOT NULL DEFAULT 0,
  total_prizes_paid      NUMERIC     NOT NULL DEFAULT 0,
  notes                  TEXT,
  period_start           DATE        NOT NULL,
  period_end             DATE        NOT NULL,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  created_by             UUID        REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_settlements_admin_seller
  ON public.settlements (admin_id, seller_id, created_at DESC);

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settlements_select ON public.settlements;
CREATE POLICY settlements_select ON public.settlements
  FOR SELECT USING (admin_id = auth.uid() OR seller_id = auth.uid());

DROP POLICY IF EXISTS settlements_insert ON public.settlements;
CREATE POLICY settlements_insert ON public.settlements
  FOR INSERT WITH CHECK (admin_id = auth.uid());


-- ============================================================
-- RPC: get_seller_balance
-- Calcula el balance acumulado de un vendedor.
-- Si no se pasan fechas, calcula desde el último corte hasta hoy.
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
  v_pct         NUMERIC;
  v_period_from DATE;
  v_period_to   DATE;
  v_last_settle DATE;
  v_prev_pending NUMERIC := 0;
BEGIN
  SELECT p.seller_percentage INTO v_pct
  FROM public.profiles p
  WHERE p.id = p_seller_id;
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
-- RPC: get_seller_balance_detail
-- Desglose diario del balance de un vendedor.
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
  balance_day      NUMERIC
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
BEGIN
  SELECT p.seller_percentage INTO v_pct
  FROM public.profiles p
  WHERE p.id = p_seller_id;
  v_pct := COALESCE(v_pct, 0);

  IF p_date_from IS NULL THEN
    SELECT period_end INTO v_last_settle
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
  WITH daily_sales AS (
    SELECT t.sale_date AS dt, COALESCE(SUM(tn.subtotal), 0) AS total
    FROM ticket_numbers tn
    JOIN tickets t ON t.id = tn.ticket_id
    WHERE t.seller_id  = p_seller_id
      AND t.admin_id   = p_admin_id
      AND t.is_cancelled = FALSE
      AND t.sale_date  BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
    GROUP BY t.sale_date
  ),
  daily_prizes AS (
    SELECT wt.draw_date AS dt, COALESCE(SUM(wt.prize_amount), 0) AS total
    FROM winning_tickets wt
    JOIN tickets t ON t.id = wt.ticket_id
    WHERE wt.seller_id  = p_seller_id
      AND wt.admin_id   = p_admin_id
      AND t.is_paid     = TRUE
      AND wt.draw_date  BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR wt.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
    GROUP BY wt.draw_date
  )
  SELECT
    COALESCE(ds.dt, dp.dt),
    COALESCE(ds.total, 0),
    v_pct,
    COALESCE(ds.total, 0) * v_pct / 100,
    COALESCE(ds.total, 0) - COALESCE(ds.total, 0) * v_pct / 100,
    COALESCE(dp.total, 0),
    (COALESCE(ds.total, 0) - COALESCE(ds.total, 0) * v_pct / 100) - COALESCE(dp.total, 0)
  FROM daily_sales ds
  FULL OUTER JOIN daily_prizes dp ON ds.dt = dp.dt
  ORDER BY COALESCE(ds.dt, dp.dt) DESC;
END;
$$;


-- ============================================================
-- RPC: get_all_sellers_balance
-- Balance de TODOS los vendedores del admin para una fecha/período.
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
  LEFT JOIN seller_sales  ss ON ss.seller_id = s.id
  LEFT JOIN seller_prizes sp ON sp.seller_id = s.id
  LEFT JOIN seller_pending pd ON pd.seller_id = s.id
  ORDER BY s.full_name;
$$;


-- ============================================================
-- RPC: create_settlement
-- El admin registra un corte/liquidación con un vendedor.
-- Calcula el balance del período y lo guarda como snapshot.
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pct          NUMERIC;
  v_period_from  DATE;
  v_period_to    DATE := CURRENT_DATE;
  v_last_settle  DATE;
  v_total_sales  NUMERIC := 0;
  v_total_prizes NUMERIC := 0;
  v_commission   NUMERIC := 0;
  v_admin_part   NUMERIC := 0;
  v_balance      NUMERIC := 0;
  v_amount       NUMERIC := 0;
  v_new_id       UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_seller_id
      AND p.parent_admin_id = p_admin_id
  ) THEN
    RAISE EXCEPTION 'El vendedor no pertenece a este administrador';
  END IF;

  SELECT p.seller_percentage INTO v_pct
  FROM public.profiles p
  WHERE p.id = p_seller_id;
  v_pct := COALESCE(v_pct, 0);

  SELECT period_end INTO v_last_settle
  FROM public.settlements s
  WHERE s.seller_id = p_seller_id
    AND s.admin_id = p_admin_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_last_settle IS NOT NULL THEN
    v_period_from := v_last_settle + 1;
  ELSE
    SELECT MIN(sale_date) INTO v_period_from
    FROM public.tickets t
    WHERE t.seller_id = p_seller_id
      AND t.admin_id = p_admin_id;
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
  SELECT COALESCE(balance_at_settlement - amount, 0)
  INTO v_amount
  FROM settlements
  WHERE seller_id = p_seller_id AND admin_id = p_admin_id
  ORDER BY created_at DESC
  LIMIT 1;

  v_balance := COALESCE(v_amount, 0) + v_admin_part - v_total_prizes;
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


-- ============================================================
-- RPC: get_settlements_history
-- Historial de cortes/liquidaciones.
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
    s.created_at
  FROM settlements s
  JOIN profiles p ON p.id = s.seller_id
  WHERE s.admin_id = p_admin_id
    AND (p_seller_id IS NULL OR s.seller_id = p_seller_id)
  ORDER BY s.created_at DESC;
$$;


-- ============================================================
-- RPC: get_seller_balance_for_seller
-- Para la app móvil: el vendedor ve su propio balance.
-- Solo puede consultar su propio seller_id.
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
  v_admin_id    UUID;
  v_pct         NUMERIC;
  v_period_from DATE;
  v_period_to   DATE;
  v_last_settle DATE;
  v_prev_pending NUMERIC := 0;
BEGIN
  IF p_seller_id != auth.uid() THEN
    RAISE EXCEPTION 'Solo puedes consultar tu propio balance';
  END IF;

  SELECT p.parent_admin_id, p.seller_percentage
  INTO v_admin_id, v_pct
  FROM public.profiles p
  WHERE p.id = p_seller_id;

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
-- RPC: get_seller_balance_detail_for_seller
-- Desglose diario para la app móvil del vendedor.
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
  balance_day      NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id    UUID;
  v_pct         NUMERIC;
  v_period_from DATE;
  v_period_to   DATE;
  v_last_settle DATE;
BEGIN
  IF p_seller_id != auth.uid() THEN
    RAISE EXCEPTION 'Solo puedes consultar tu propio balance';
  END IF;

  SELECT p.parent_admin_id, p.seller_percentage
  INTO v_admin_id, v_pct
  FROM public.profiles p
  WHERE p.id = p_seller_id;

  v_pct := COALESCE(v_pct, 0);

  IF p_date_from IS NULL THEN
    SELECT period_end INTO v_last_settle
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
  WITH daily_sales AS (
    SELECT t.sale_date AS dt, COALESCE(SUM(tn.subtotal), 0) AS total
    FROM ticket_numbers tn
    JOIN tickets t ON t.id = tn.ticket_id
    WHERE t.seller_id    = p_seller_id
      AND t.admin_id     = v_admin_id
      AND t.is_cancelled = FALSE
      AND t.sale_date    BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
    GROUP BY t.sale_date
  ),
  daily_prizes AS (
    SELECT wt.draw_date AS dt, COALESCE(SUM(wt.prize_amount), 0) AS total
    FROM winning_tickets wt
    JOIN tickets t ON t.id = wt.ticket_id
    WHERE wt.seller_id  = p_seller_id
      AND wt.admin_id   = v_admin_id
      AND t.is_paid     = TRUE
      AND wt.draw_date  BETWEEN v_period_from AND v_period_to
      AND (p_lottery_id   IS NULL OR wt.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
    GROUP BY wt.draw_date
  )
  SELECT
    COALESCE(ds.dt, dp.dt),
    COALESCE(ds.total, 0),
    v_pct,
    COALESCE(ds.total, 0) * v_pct / 100,
    COALESCE(ds.total, 0) - COALESCE(ds.total, 0) * v_pct / 100,
    COALESCE(dp.total, 0),
    (COALESCE(ds.total, 0) - COALESCE(ds.total, 0) * v_pct / 100) - COALESCE(dp.total, 0)
  FROM daily_sales ds
  FULL OUTER JOIN daily_prizes dp ON ds.dt = dp.dt
  ORDER BY COALESCE(ds.dt, dp.dt) DESC;
END;
$$;


-- ============================================================
-- GRANTS
-- ============================================================

GRANT EXECUTE ON FUNCTION public.get_seller_balance(UUID,UUID,DATE,DATE,UUID,UUID)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_balance_detail(UUID,UUID,DATE,DATE,UUID,UUID)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_sellers_balance(UUID,DATE,DATE,UUID,UUID)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_settlement(UUID,UUID,NUMERIC,TEXT)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_settlements_history(UUID,UUID)                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_balance_for_seller(UUID,DATE,DATE,UUID,UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_balance_detail_for_seller(UUID,DATE,DATE,UUID,UUID) TO authenticated;
