-- ============================================================
-- FIX: Leer is_paid desde la tabla tickets (no winning_tickets)
-- El vendedor marca el ticket como pagado en la sección Ventas.
-- Los RPCs de premios deben reflejar ese estado.
-- Ejecutar en InsForge SQL Editor.
-- ============================================================

-- 1. get_winning_tickets (panel admin)
CREATE OR REPLACE FUNCTION public.get_winning_tickets(
  p_admin_id     UUID,
  p_date_from    DATE    DEFAULT NULL,
  p_date_to      DATE    DEFAULT NULL,
  p_seller_id    UUID    DEFAULT NULL,
  p_lottery_id   UUID    DEFAULT NULL,
  p_draw_time_id UUID    DEFAULT NULL,
  p_status       TEXT    DEFAULT NULL
)
RETURNS TABLE (
  id               UUID,
  ticket_id        UUID,
  ticket_number_id UUID,
  lottery_id       UUID,
  lottery_name     TEXT,
  draw_time_id     UUID,
  draw_time_label  TEXT,
  admin_id         UUID,
  seller_id        UUID,
  seller_name      TEXT,
  ticket_num       TEXT,
  number           TEXT,
  winning_number   TEXT,
  prize_position   TEXT,
  match_type       TEXT,
  multiplier       NUMERIC,
  bet_amount       NUMERIC,
  prize_amount     NUMERIC,
  is_paid          BOOLEAN,
  paid_at          TIMESTAMPTZ,
  paid_by          UUID,
  draw_date        DATE,
  created_at       TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    wt.id,
    wt.ticket_id,
    wt.ticket_number_id,
    wt.lottery_id,
    l.display_name,
    wt.draw_time_id,
    dt.time_label,
    wt.admin_id,
    wt.seller_id,
    pr.full_name,
    t.ticket_number,
    wt.number,
    wt.winning_number,
    wt.prize_position,
    wt.match_type,
    wt.multiplier,
    wt.bet_amount,
    wt.prize_amount,
    t.is_paid,
    NULL::TIMESTAMPTZ,
    NULL::UUID,
    wt.draw_date,
    wt.created_at
  FROM winning_tickets wt
  JOIN lotteries  l  ON l.id  = wt.lottery_id
  LEFT JOIN draw_times dt ON dt.id = wt.draw_time_id
  JOIN profiles   pr ON pr.id = wt.seller_id
  JOIN tickets    t  ON t.id  = wt.ticket_id
  WHERE wt.admin_id = p_admin_id
    AND (p_date_from    IS NULL OR wt.draw_date  >= p_date_from)
    AND (p_date_to      IS NULL OR wt.draw_date  <= p_date_to)
    AND (p_seller_id    IS NULL OR wt.seller_id   = p_seller_id)
    AND (p_lottery_id   IS NULL OR wt.lottery_id  = p_lottery_id)
    AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
    AND (
      p_status IS NULL
      OR (p_status = 'paid'    AND t.is_paid = TRUE)
      OR (p_status = 'pending' AND t.is_paid = FALSE)
    )
  ORDER BY t.is_paid ASC, wt.draw_date DESC, wt.created_at DESC;
$$;


-- 2. get_winning_tickets_summary (panel admin)
CREATE OR REPLACE FUNCTION public.get_winning_tickets_summary(
  p_admin_id     UUID,
  p_date_from    DATE DEFAULT NULL,
  p_date_to      DATE DEFAULT NULL,
  p_seller_id    UUID DEFAULT NULL,
  p_lottery_id   UUID DEFAULT NULL,
  p_draw_time_id UUID DEFAULT NULL
)
RETURNS TABLE (
  total_prize_amount NUMERIC,
  total_paid         NUMERIC,
  total_pending      NUMERIC,
  count_total        BIGINT,
  count_paid         BIGINT,
  count_pending      BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(wt.prize_amount), 0),
    COALESCE(SUM(CASE WHEN t.is_paid     THEN wt.prize_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN NOT t.is_paid THEN wt.prize_amount ELSE 0 END), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE t.is_paid),
    COUNT(*) FILTER (WHERE NOT t.is_paid)
  FROM winning_tickets wt
  JOIN tickets t ON t.id = wt.ticket_id
  WHERE wt.admin_id = p_admin_id
    AND (p_date_from    IS NULL OR wt.draw_date   >= p_date_from)
    AND (p_date_to      IS NULL OR wt.draw_date   <= p_date_to)
    AND (p_seller_id    IS NULL OR wt.seller_id    = p_seller_id)
    AND (p_lottery_id   IS NULL OR wt.lottery_id   = p_lottery_id)
    AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id);
$$;


-- 3. get_seller_winning_tickets (app vendedor)
CREATE OR REPLACE FUNCTION public.get_seller_winning_tickets(
  p_seller_id    UUID,
  p_date_from    DATE DEFAULT NULL,
  p_date_to      DATE DEFAULT NULL,
  p_lottery_id   UUID DEFAULT NULL,
  p_draw_time_id UUID DEFAULT NULL,
  p_status       TEXT DEFAULT NULL
)
RETURNS TABLE (
  id              UUID,
  ticket_id       UUID,
  ticket_num      TEXT,
  lottery_name    TEXT,
  draw_time_label TEXT,
  number          TEXT,
  winning_number  TEXT,
  prize_position  TEXT,
  match_type      TEXT,
  multiplier      NUMERIC,
  bet_amount      NUMERIC,
  prize_amount    NUMERIC,
  is_paid         BOOLEAN,
  paid_at         TIMESTAMPTZ,
  draw_date       DATE,
  created_at      TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    wt.id,
    wt.ticket_id,
    t.ticket_number,
    l.display_name,
    dt.time_label,
    wt.number,
    wt.winning_number,
    wt.prize_position,
    wt.match_type,
    wt.multiplier,
    wt.bet_amount,
    wt.prize_amount,
    t.is_paid,
    NULL::TIMESTAMPTZ,
    wt.draw_date,
    wt.created_at
  FROM winning_tickets wt
  JOIN lotteries  l  ON l.id  = wt.lottery_id
  LEFT JOIN draw_times dt ON dt.id = wt.draw_time_id
  JOIN tickets    t  ON t.id  = wt.ticket_id
  WHERE wt.seller_id = p_seller_id
    AND (p_date_from    IS NULL OR wt.draw_date   >= p_date_from)
    AND (p_date_to      IS NULL OR wt.draw_date   <= p_date_to)
    AND (p_lottery_id   IS NULL OR wt.lottery_id   = p_lottery_id)
    AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
    AND (
      p_status IS NULL
      OR (p_status = 'paid'    AND t.is_paid = TRUE)
      OR (p_status = 'pending' AND t.is_paid = FALSE)
    )
  ORDER BY t.is_paid ASC, wt.draw_date DESC, wt.created_at DESC;
$$;


-- 4. get_subadmin_winning_tickets (sub-admin)
CREATE OR REPLACE FUNCTION public.get_subadmin_winning_tickets(
  p_sub_admin_id UUID,
  p_date_from    DATE DEFAULT NULL,
  p_date_to      DATE DEFAULT NULL,
  p_seller_id    UUID DEFAULT NULL,
  p_lottery_id   UUID DEFAULT NULL,
  p_status       TEXT DEFAULT NULL
)
RETURNS TABLE (
  id              UUID,
  ticket_id       UUID,
  ticket_num      TEXT,
  lottery_name    TEXT,
  draw_time_label TEXT,
  seller_name     TEXT,
  seller_id       UUID,
  number          TEXT,
  winning_number  TEXT,
  prize_position  TEXT,
  match_type      TEXT,
  multiplier      NUMERIC,
  bet_amount      NUMERIC,
  prize_amount    NUMERIC,
  is_paid         BOOLEAN,
  paid_at         TIMESTAMPTZ,
  draw_date       DATE
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    wt.id,
    wt.ticket_id,
    t.ticket_number,
    l.display_name,
    dt.time_label,
    pr.full_name,
    wt.seller_id,
    wt.number,
    wt.winning_number,
    wt.prize_position,
    wt.match_type,
    wt.multiplier,
    wt.bet_amount,
    wt.prize_amount,
    t.is_paid,
    NULL::TIMESTAMPTZ,
    wt.draw_date
  FROM winning_tickets wt
  JOIN lotteries  l  ON l.id  = wt.lottery_id
  LEFT JOIN draw_times dt ON dt.id = wt.draw_time_id
  JOIN profiles   pr ON pr.id = wt.seller_id
  JOIN tickets    t  ON t.id  = wt.ticket_id
  WHERE wt.seller_id IN (
    SELECT id FROM profiles WHERE parent_admin_id = p_sub_admin_id AND role = 'seller'
  )
    AND (p_date_from  IS NULL OR wt.draw_date  >= p_date_from)
    AND (p_date_to    IS NULL OR wt.draw_date  <= p_date_to)
    AND (p_seller_id  IS NULL OR wt.seller_id   = p_seller_id)
    AND (p_lottery_id IS NULL OR wt.lottery_id  = p_lottery_id)
    AND (
      p_status IS NULL
      OR (p_status = 'paid'    AND t.is_paid = TRUE)
      OR (p_status = 'pending' AND t.is_paid = FALSE)
    )
  ORDER BY t.is_paid ASC, wt.draw_date DESC, wt.created_at DESC;
$$;
