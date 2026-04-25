-- ============================================================
-- MÓDULO: TICKETS GANADORES Y PAGO DE PREMIOS
-- Ejecutar en InsForge SQL Editor después del schema principal
-- ============================================================

-- ============================================================
-- TABLA: winning_tickets
-- ============================================================

CREATE TABLE IF NOT EXISTS public.winning_tickets (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id         UUID        NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  ticket_number_id  UUID        NOT NULL REFERENCES public.ticket_numbers(id) ON DELETE CASCADE,
  lottery_id        UUID        NOT NULL REFERENCES public.lotteries(id),
  draw_time_id      UUID        REFERENCES public.draw_times(id),
  admin_id          UUID        NOT NULL REFERENCES public.profiles(id),
  seller_id         UUID        NOT NULL REFERENCES public.profiles(id),
  number            TEXT        NOT NULL,
  winning_number    TEXT        NOT NULL,
  prize_position    TEXT        NOT NULL CHECK (prize_position IN ('1st','2nd','3rd')),
  -- match_type values:
  --   'chance'          - 2-digit chance (last 2 of prize)
  --   'billete_4exactas'- exact 4-digit billete
  --   'pale_1er'        - palé: prize1+prize2
  --   'pale_2do'        - palé: prize1+prize3
  --   'pale_3er'        - palé: prize2+prize3
  --   'nac_3_primeras'  - nacional: 3 primeras cifras
  --   'nac_3_ultimas'   - nacional: 3 últimas cifras
  --   'nac_2_primeras'  - nacional: 2 primeras (solo 1er)
  --   'nac_2_ultimas'   - nacional: 2 últimas
  --   'nac_1_ultima'    - nacional: última cifra (solo 1er)
  match_type        TEXT        NOT NULL,
  multiplier        NUMERIC(12,4) NOT NULL,
  bet_amount        NUMERIC(10,2) NOT NULL,
  prize_amount      NUMERIC(12,2) NOT NULL,
  is_paid           BOOLEAN     DEFAULT FALSE,
  paid_at           TIMESTAMPTZ,
  paid_by           UUID        REFERENCES public.profiles(id),
  draw_date         DATE        NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_winning_tickets_admin_date
  ON public.winning_tickets (admin_id, draw_date);

CREATE INDEX IF NOT EXISTS idx_winning_tickets_seller
  ON public.winning_tickets (seller_id, is_paid);

CREATE INDEX IF NOT EXISTS idx_winning_tickets_lottery_date
  ON public.winning_tickets (lottery_id, draw_date, draw_time_id);

-- RLS
ALTER TABLE public.winning_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS winning_tickets_admin_select ON public.winning_tickets;
CREATE POLICY winning_tickets_admin_select ON public.winning_tickets
  FOR SELECT USING (admin_id = auth.uid() OR seller_id = auth.uid());

-- ============================================================
-- RPC: generate_winning_tickets
-- Cruza todos los tickets vendidos contra los resultados del sorteo
-- y genera (o regenera) los registros en winning_tickets.
-- Retorna la cantidad de registros insertados.
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_winning_tickets(
  p_admin_id     UUID,
  p_lottery_id   UUID,
  p_draw_time_id UUID,
  p_draw_date    DATE
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_lt   TEXT;
  v_lm   TEXT;
  v_is_pale       BOOLEAN;
  v_is_nacional   BOOLEAN;
  v_is_gordito    BOOLEAN;

  -- chance multipliers (draw_time custom overrides lottery default)
  v_cm1  NUMERIC;
  v_cm2  NUMERIC;
  v_cm3  NUMERIC;
  -- billete multipliers
  v_bm1  NUMERIC;
  v_bm2  NUMERIC;
  v_bm3  NUMERIC;
  -- nacional partial multipliers
  v_nm3_1 NUMERIC; v_nm3_2 NUMERIC; v_nm3_3 NUMERIC;
  v_nm2f1 NUMERIC;
  v_nm2l1 NUMERIC; v_nm2l2 NUMERIC; v_nm2l3 NUMERIC;
  v_nm1l1 NUMERIC;

  v_prize1 TEXT;
  v_prize2 TEXT;
  v_prize3 TEXT;
  v_pale1  TEXT;
  v_pale2  TEXT;
  v_pale3  TEXT;

  v_tmp      INTEGER;
  v_inserted INTEGER := 0;
BEGIN

  -- ── 1. Lottery type ──────────────────────────────────────────
  SELECT lottery_type, lottery_modality
  INTO v_lt, v_lm
  FROM lotteries
  WHERE id = p_lottery_id AND admin_id = p_admin_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lottery % not found for admin %', p_lottery_id, p_admin_id;
  END IF;

  v_is_pale     := (v_lt = 'pale');
  v_is_nacional := (v_lt = 'nacional');
  v_is_gordito  := (v_is_nacional AND v_lm = 'gordito');

  -- ── 2. Multipliers ───────────────────────────────────────────
  SELECT
    COALESCE(prize_1st_multiplier, 11),
    COALESCE(prize_2nd_multiplier, 3),
    COALESCE(prize_3rd_multiplier, 2)
  INTO v_cm1, v_cm2, v_cm3
  FROM lotteries WHERE id = p_lottery_id;

  IF p_draw_time_id IS NOT NULL THEN
    SELECT
      COALESCE(custom_prize_1st_multiplier, v_cm1),
      COALESCE(custom_prize_2nd_multiplier, v_cm2),
      COALESCE(custom_prize_3rd_multiplier, v_cm3)
    INTO v_cm1, v_cm2, v_cm3
    FROM draw_times WHERE id = p_draw_time_id;
  END IF;

  SELECT
    COALESCE(billete_prize_1st_multiplier, 2000),
    COALESCE(billete_prize_2nd_multiplier, 600),
    COALESCE(billete_prize_3rd_multiplier, 300)
  INTO v_bm1, v_bm2, v_bm3
  FROM lotteries WHERE id = p_lottery_id;

  SELECT
    COALESCE(nat_mult_3match_1, 50),
    COALESCE(nat_mult_3match_2, 20),
    COALESCE(nat_mult_3match_3, 10),
    COALESCE(nat_mult_2first_1, 3),
    COALESCE(nat_mult_2last_1, 3),
    COALESCE(nat_mult_2last_2, 2),
    COALESCE(nat_mult_2last_3, 1),
    COALESCE(nat_mult_1last_1, 1)
  INTO v_nm3_1, v_nm3_2, v_nm3_3, v_nm2f1, v_nm2l1, v_nm2l2, v_nm2l3, v_nm1l1
  FROM lotteries WHERE id = p_lottery_id;

  -- ── 3. Winning numbers ───────────────────────────────────────
  IF p_draw_time_id IS NOT NULL THEN
    SELECT
      COALESCE(first_prize,  ''),
      COALESCE(second_prize, ''),
      COALESCE(third_prize,  '')
    INTO v_prize1, v_prize2, v_prize3
    FROM winning_numbers
    WHERE lottery_id = p_lottery_id
      AND draw_time_id = p_draw_time_id
      AND draw_date = p_draw_date;
  ELSE
    SELECT
      COALESCE(first_prize,  ''),
      COALESCE(second_prize, ''),
      COALESCE(third_prize,  '')
    INTO v_prize1, v_prize2, v_prize3
    FROM winning_numbers
    WHERE lottery_id = p_lottery_id
      AND draw_time_id IS NULL
      AND draw_date = p_draw_date;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No winning numbers for lottery % on %', p_lottery_id, p_draw_date;
  END IF;

  -- Palé combos
  IF v_is_pale THEN
    v_pale1 := CASE WHEN LENGTH(v_prize1)=2 AND LENGTH(v_prize2)=2 THEN v_prize1||v_prize2 ELSE NULL END;
    v_pale2 := CASE WHEN LENGTH(v_prize1)=2 AND LENGTH(v_prize3)=2 THEN v_prize1||v_prize3 ELSE NULL END;
    v_pale3 := CASE WHEN LENGTH(v_prize2)=2 AND LENGTH(v_prize3)=2 THEN v_prize2||v_prize3 ELSE NULL END;
  END IF;

  -- ── 4. Delete non-paid records for this draw ─────────────────
  DELETE FROM winning_tickets
  WHERE admin_id   = p_admin_id
    AND lottery_id = p_lottery_id
    AND draw_date  = p_draw_date
    AND is_paid    = FALSE
    AND (p_draw_time_id IS NULL OR draw_time_id = p_draw_time_id);

  -- ── 5. INSERT CHANCE matches (2-digit tickets, all lottery types) ─
  -- Last 2 digits of each prize match the ticket's 2-digit number.
  -- For gordito 2nd/3rd (2-digit prizes): RIGHT('12',2)='12' ≡ exact match.
  INSERT INTO winning_tickets (
    ticket_id, ticket_number_id, lottery_id, draw_time_id,
    admin_id, seller_id, number, winning_number,
    prize_position, match_type, multiplier, bet_amount, prize_amount, draw_date
  )
  SELECT
    t.id, tn.id, t.lottery_id, t.draw_time_id,
    t.admin_id, t.seller_id,
    tn.number,
    pz.prize_val,
    pz.prize_pos,
    'chance',
    pz.mult,
    tn.subtotal,
    tn.pieces::NUMERIC * pz.mult,
    t.sale_date
  FROM ticket_numbers tn
  JOIN tickets t ON t.id = tn.ticket_id
  JOIN (
    SELECT v_prize1 AS prize_val, '1st' AS prize_pos, v_cm1 AS mult
      WHERE v_prize1 != '' AND LENGTH(v_prize1) >= 2 AND v_cm1 > 0
    UNION ALL
    SELECT v_prize2, '2nd', v_cm2
      WHERE v_prize2 != '' AND LENGTH(v_prize2) >= 2 AND v_cm2 > 0
    UNION ALL
    SELECT v_prize3, '3rd', v_cm3
      WHERE v_prize3 != '' AND LENGTH(v_prize3) >= 2 AND v_cm3 > 0
  ) pz ON tn.number = RIGHT(pz.prize_val, 2)
  WHERE t.lottery_id = p_lottery_id
    AND t.admin_id   = p_admin_id
    AND t.sale_date  = p_draw_date
    AND t.is_cancelled = FALSE
    AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
    AND LENGTH(tn.number) = 2;

  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_inserted := v_inserted + v_tmp;

  -- ── 6. INSERT BILLETE matches (4-digit tickets) ──────────────

  IF NOT v_is_nacional AND NOT v_is_pale THEN
    -- Regular / Reventado: exact 4-digit match
    INSERT INTO winning_tickets (
      ticket_id, ticket_number_id, lottery_id, draw_time_id,
      admin_id, seller_id, number, winning_number,
      prize_position, match_type, multiplier, bet_amount, prize_amount, draw_date
    )
    SELECT
      t.id, tn.id, t.lottery_id, t.draw_time_id,
      t.admin_id, t.seller_id,
      tn.number,
      pz.prize_val,
      pz.prize_pos,
      'billete_4exactas',
      pz.mult,
      tn.subtotal,
      tn.pieces::NUMERIC * pz.mult,
      t.sale_date
    FROM ticket_numbers tn
    JOIN tickets t ON t.id = tn.ticket_id
    JOIN (
      SELECT v_prize1 AS prize_val, '1st' AS prize_pos, v_bm1 AS mult
        WHERE v_prize1 != '' AND LENGTH(v_prize1) = 4 AND v_bm1 > 0
      UNION ALL
      SELECT v_prize2, '2nd', v_bm2
        WHERE v_prize2 != '' AND LENGTH(v_prize2) = 4 AND v_bm2 > 0
      UNION ALL
      SELECT v_prize3, '3rd', v_bm3
        WHERE v_prize3 != '' AND LENGTH(v_prize3) = 4 AND v_bm3 > 0
    ) pz ON tn.number = pz.prize_val
    WHERE t.lottery_id  = p_lottery_id
      AND t.admin_id    = p_admin_id
      AND t.sale_date   = p_draw_date
      AND t.is_cancelled = FALSE
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
      AND LENGTH(tn.number) = 4;

    GET DIAGNOSTICS v_tmp = ROW_COUNT;
    v_inserted := v_inserted + v_tmp;

  ELSIF v_is_pale THEN
    -- Palé: match 4-digit ticket against prize combinations
    INSERT INTO winning_tickets (
      ticket_id, ticket_number_id, lottery_id, draw_time_id,
      admin_id, seller_id, number, winning_number,
      prize_position, match_type, multiplier, bet_amount, prize_amount, draw_date
    )
    SELECT
      t.id, tn.id, t.lottery_id, t.draw_time_id,
      t.admin_id, t.seller_id,
      tn.number,
      pz.combo,
      pz.prize_pos,
      pz.mt,
      pz.mult,
      tn.subtotal,
      tn.pieces::NUMERIC * pz.mult,
      t.sale_date
    FROM ticket_numbers tn
    JOIN tickets t ON t.id = tn.ticket_id
    JOIN (
      SELECT v_pale1 AS combo, '1st' AS prize_pos, 'pale_1er' AS mt, v_bm1 AS mult
        WHERE v_pale1 IS NOT NULL AND v_bm1 > 0
      UNION ALL
      SELECT v_pale2, '2nd', 'pale_2do', v_bm2
        WHERE v_pale2 IS NOT NULL AND v_bm2 > 0
      UNION ALL
      SELECT v_pale3, '3rd', 'pale_3er', v_bm3
        WHERE v_pale3 IS NOT NULL AND v_bm3 > 0
    ) pz ON tn.number = pz.combo
    WHERE t.lottery_id  = p_lottery_id
      AND t.admin_id    = p_admin_id
      AND t.sale_date   = p_draw_date
      AND t.is_cancelled = FALSE
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
      AND LENGTH(tn.number) = 4;

    GET DIAGNOSTICS v_tmp = ROW_COUNT;
    v_inserted := v_inserted + v_tmp;

  ELSIF v_is_nacional THEN
    -- Nacional / Gordito: 4-digit billete vs 4-digit prizes (strict hierarchy)
    -- Only prizes with LENGTH=4 are included; gordito 2nd/3rd (2-digit) are excluded automatically.
    INSERT INTO winning_tickets (
      ticket_id, ticket_number_id, lottery_id, draw_time_id,
      admin_id, seller_id, number, winning_number,
      prize_position, match_type, multiplier, bet_amount, prize_amount, draw_date
    )
    WITH prizes AS (
      SELECT prize_val, prize_pos
      FROM (VALUES
        (v_prize1, '1st'::TEXT),
        (v_prize2, '2nd'::TEXT),
        (v_prize3, '3rd'::TEXT)
      ) AS p(prize_val, prize_pos)
      WHERE prize_val IS NOT NULL AND prize_val != '' AND LENGTH(prize_val) = 4
    ),
    candidates AS (
      SELECT
        tn.id        AS tn_id,
        t.id         AS t_id,
        t.seller_id,
        t.draw_time_id,
        tn.number,
        tn.pieces,
        tn.subtotal,
        p.prize_val,
        p.prize_pos,
        CASE
          WHEN tn.number = p.prize_val                                             THEN 'billete_4exactas'
          WHEN LEFT(tn.number,3) = LEFT(p.prize_val,3)                            THEN 'nac_3_primeras'
          WHEN RIGHT(tn.number,3) = RIGHT(p.prize_val,3)                          THEN 'nac_3_ultimas'
          WHEN p.prize_pos = '1st' AND LEFT(tn.number,2) = LEFT(p.prize_val,2)   THEN 'nac_2_primeras'
          WHEN RIGHT(tn.number,2) = RIGHT(p.prize_val,2)                          THEN 'nac_2_ultimas'
          WHEN p.prize_pos = '1st' AND RIGHT(tn.number,1) = RIGHT(p.prize_val,1) THEN 'nac_1_ultima'
          ELSE NULL
        END AS mt
      FROM ticket_numbers tn
      JOIN tickets t ON t.id = tn.ticket_id
      CROSS JOIN prizes p
      WHERE t.lottery_id  = p_lottery_id
        AND t.admin_id    = p_admin_id
        AND t.sale_date   = p_draw_date
        AND t.is_cancelled = FALSE
        AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
        AND LENGTH(tn.number) = 4
    ),
    with_mult AS (
      SELECT *,
        CASE mt
          WHEN 'billete_4exactas' THEN
            CASE prize_pos WHEN '1st' THEN v_bm1  WHEN '2nd' THEN v_bm2  ELSE v_bm3  END
          WHEN 'nac_3_primeras'   THEN
            CASE prize_pos WHEN '1st' THEN v_nm3_1 WHEN '2nd' THEN v_nm3_2 ELSE v_nm3_3 END
          WHEN 'nac_3_ultimas'    THEN
            CASE prize_pos WHEN '1st' THEN v_nm3_1 WHEN '2nd' THEN v_nm3_2 ELSE v_nm3_3 END
          WHEN 'nac_2_primeras'   THEN v_nm2f1
          WHEN 'nac_2_ultimas'    THEN
            CASE prize_pos WHEN '1st' THEN v_nm2l1 WHEN '2nd' THEN v_nm2l2 ELSE v_nm2l3 END
          WHEN 'nac_1_ultima'     THEN v_nm1l1
          ELSE 0
        END AS mult
      FROM candidates
      WHERE mt IS NOT NULL
    )
    SELECT
      t_id, tn_id, p_lottery_id, draw_time_id,
      p_admin_id, seller_id,
      number, prize_val,
      prize_pos, mt, mult,
      subtotal,
      pieces::NUMERIC * mult,
      p_draw_date
    FROM with_mult
    WHERE mult IS NOT NULL AND mult > 0;

    GET DIAGNOSTICS v_tmp = ROW_COUNT;
    v_inserted := v_inserted + v_tmp;

  END IF;

  RETURN v_inserted;
END;
$func$;


-- ============================================================
-- RPC: get_winning_tickets
-- Consulta con filtros para el panel admin.
-- ============================================================

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
    wt.is_paid,
    wt.paid_at,
    wt.paid_by,
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
      OR (p_status = 'paid'    AND wt.is_paid = TRUE)
      OR (p_status = 'pending' AND wt.is_paid = FALSE)
    )
  ORDER BY wt.draw_date DESC, wt.created_at DESC;
$$;


-- ============================================================
-- RPC: get_winning_tickets_summary
-- Totales para las tarjetas de resumen.
-- ============================================================

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
    COALESCE(SUM(prize_amount), 0),
    COALESCE(SUM(CASE WHEN is_paid     THEN prize_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN NOT is_paid THEN prize_amount ELSE 0 END), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE is_paid),
    COUNT(*) FILTER (WHERE NOT is_paid)
  FROM winning_tickets
  WHERE admin_id = p_admin_id
    AND (p_date_from    IS NULL OR draw_date   >= p_date_from)
    AND (p_date_to      IS NULL OR draw_date   <= p_date_to)
    AND (p_seller_id    IS NULL OR seller_id    = p_seller_id)
    AND (p_lottery_id   IS NULL OR lottery_id   = p_lottery_id)
    AND (p_draw_time_id IS NULL OR draw_time_id = p_draw_time_id);
$$;


-- ============================================================
-- RPC: pay_winning_ticket
-- El vendedor marca un ticket ganador como pagado.
-- Verifica que el ticket le pertenezca al vendedor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.pay_winning_ticket(
  p_winning_ticket_id UUID,
  p_seller_id         UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE winning_tickets
  SET is_paid = TRUE,
      paid_at = NOW(),
      paid_by = p_seller_id
  WHERE id        = p_winning_ticket_id
    AND seller_id = p_seller_id
    AND is_paid   = FALSE;

  RETURN FOUND;
END;
$$;


-- ============================================================
-- RPC: get_seller_winning_tickets
-- Para la app móvil del vendedor (y sub-admin viendo sus vendedores).
-- ============================================================

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
    wt.is_paid,
    wt.paid_at,
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
      OR (p_status = 'paid'    AND wt.is_paid = TRUE)
      OR (p_status = 'pending' AND wt.is_paid = FALSE)
    )
  ORDER BY wt.is_paid ASC, wt.draw_date DESC, wt.created_at DESC;
$$;


-- ============================================================
-- RPC: get_subadmin_winning_tickets
-- Sub-admin ve los tickets ganadores de sus vendedores.
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
    wt.is_paid,
    wt.paid_at,
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
      OR (p_status = 'paid'    AND wt.is_paid = TRUE)
      OR (p_status = 'pending' AND wt.is_paid = FALSE)
    )
  ORDER BY wt.is_paid ASC, wt.draw_date DESC, wt.created_at DESC;
$$;


-- Grant execute on all new functions
GRANT EXECUTE ON FUNCTION public.generate_winning_tickets(UUID,UUID,UUID,DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_winning_tickets(UUID,DATE,DATE,UUID,UUID,UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_winning_tickets_summary(UUID,DATE,DATE,UUID,UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_winning_ticket(UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_winning_tickets(UUID,DATE,DATE,UUID,UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subadmin_winning_tickets(UUID,DATE,DATE,UUID,UUID,TEXT) TO authenticated;
