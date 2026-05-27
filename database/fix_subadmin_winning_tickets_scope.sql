-- ============================================================
-- FIX: get_subadmin_winning_tickets
--
-- Problema:
-- La version anterior filtraba vendedores del subadmin usando
-- parent_admin_id = p_sub_admin_id, lo cual no coincide con el
-- modelo actual. Los vendedores del subadmin cuelgan por:
--   sub_admin_id = p_sub_admin_id
--
-- Ademas, el subadmin tambien vende numeros directamente, por lo
-- que debe ver:
-- - sus propios tickets premiados
-- - los tickets premiados de sus vendedores
-- ============================================================

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
  draw_date       DATE,
  customer_name   TEXT
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
    wt.draw_date,
    t.customer_name
  FROM public.winning_tickets wt
  JOIN public.lotteries l ON l.id = wt.lottery_id
  LEFT JOIN public.draw_times dt ON dt.id = wt.draw_time_id
  JOIN public.profiles pr ON pr.id = wt.seller_id
  JOIN public.tickets t ON t.id = wt.ticket_id
  WHERE wt.seller_id IN (
    SELECT p_sub_admin_id
    UNION
    SELECT p.id
    FROM public.profiles p
    WHERE p.sub_admin_id = p_sub_admin_id
      AND p.role = 'seller'
      AND p.is_active = TRUE
  )
    AND (p_date_from  IS NULL OR wt.draw_date   >= p_date_from)
    AND (p_date_to    IS NULL OR wt.draw_date   <= p_date_to)
    AND (p_seller_id  IS NULL OR wt.seller_id    = p_seller_id)
    AND (p_lottery_id IS NULL OR wt.lottery_id   = p_lottery_id)
    AND (
      p_status IS NULL
      OR (p_status = 'paid'    AND t.is_paid = TRUE)
      OR (p_status = 'pending' AND t.is_paid = FALSE)
    )
  ORDER BY t.is_paid ASC, wt.draw_date DESC, wt.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_subadmin_winning_tickets(UUID,DATE,DATE,UUID,UUID,TEXT) TO authenticated;
