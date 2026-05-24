-- ============================================================
-- PATCH: fix_get_all_sellers_balance_subadmin.sql
--
-- Reemplaza get_all_sellers_balance para mostrar correctamente
-- el balance agrupado cuando existen sub_admins:
--
--   ✓ Sub_admins aparecen como entidades grupales:
--     sus propias ventas + las de todos sus vendedores subordinados.
--   ✓ Vendedores directos (sub_admin_id IS NULL) aparecen
--     individualmente como siempre.
--   ✓ Vendedores bajo sub_admins NO aparecen por separado;
--     quedan incluidos en el total del sub_admin.
--
-- Regla de negocio:
--   Al hacer el corte a un sub_admin, el admin le cobra el
--   total del grupo. El sub_admin gestiona los cortes con
--   sus propios vendedores de forma independiente.
--
-- Orden de ejecución obligatorio:
--   1. subadmin_seller_balance.sql
--   2. balance_settled_days_exclusion.sql
--   3. settlement_manual_amount_patch.sql
--   4. este archivo  ← aquí
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
  WITH

  -- ──────────────────────────────────────────────────────────
  -- 1. ENTIDADES DE FACTURACIÓN
  --    Sub_admins representan a su grupo completo.
  --    Vendedores directos (sin sub_admin) se facturan solos.
  -- ──────────────────────────────────────────────────────────
  entities AS (
    -- Sub_admins
    SELECT
      p.id                             AS entity_id,
      p.full_name                      AS entity_name,
      COALESCE(p.seller_percentage, 0) AS pct
    FROM public.profiles p
    WHERE p.parent_admin_id = p_admin_id
      AND p.role            = 'sub_admin'
      AND p.is_active       = TRUE

    UNION ALL

    -- Vendedores directos (sin sub_admin encima)
    SELECT
      p.id,
      p.full_name,
      COALESCE(p.seller_percentage, 0)
    FROM public.profiles p
    WHERE p.parent_admin_id = p_admin_id
      AND p.role            = 'seller'
      AND p.sub_admin_id    IS NULL
      AND p.is_active       = TRUE
  ),

  -- ──────────────────────────────────────────────────────────
  -- 2. VENTAS AGRUPADAS POR ENTIDAD
  --
  --    COALESCE(p.sub_admin_id, t.seller_id) mapea cada ticket
  --    a su entidad de facturación:
  --      - Vendedor bajo sub_admin  → sub_admin_id del vendedor
  --      - Sub_admin (ticket propio) → su propio id
  --                                   (p.sub_admin_id = NULL → devuelve t.seller_id = sub_admin.id)
  --      - Vendedor directo         → seller_id propio
  -- ──────────────────────────────────────────────────────────
  entity_sales AS (
    SELECT
      COALESCE(p.sub_admin_id, t.seller_id) AS entity_id,
      COALESCE(SUM(tn.subtotal), 0)          AS total
    FROM public.ticket_numbers tn
    JOIN public.tickets  t ON t.id = tn.ticket_id
    JOIN public.profiles p ON p.id = t.seller_id
    WHERE t.admin_id      = p_admin_id
      AND t.is_cancelled  = FALSE
      AND (p_date_from    IS NULL OR t.sale_date    >= p_date_from)
      AND (p_date_to      IS NULL OR t.sale_date    <= p_date_to)
      AND (p_lottery_id   IS NULL OR t.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR t.draw_time_id = p_draw_time_id)
    GROUP BY COALESCE(p.sub_admin_id, t.seller_id)
  ),

  -- ──────────────────────────────────────────────────────────
  -- 3. PREMIOS AGRUPADOS POR ENTIDAD (misma lógica)
  -- ──────────────────────────────────────────────────────────
  entity_prizes AS (
    SELECT
      COALESCE(p.sub_admin_id, wt.seller_id) AS entity_id,
      COALESCE(SUM(wt.prize_amount), 0)       AS total
    FROM public.winning_tickets wt
    JOIN public.profiles p ON p.id = wt.seller_id
    WHERE wt.admin_id     = p_admin_id
      AND (p_date_from    IS NULL OR wt.draw_date    >= p_date_from)
      AND (p_date_to      IS NULL OR wt.draw_date    <= p_date_to)
      AND (p_lottery_id   IS NULL OR wt.lottery_id   = p_lottery_id)
      AND (p_draw_time_id IS NULL OR wt.draw_time_id = p_draw_time_id)
    GROUP BY COALESCE(p.sub_admin_id, wt.seller_id)
  ),

  -- ──────────────────────────────────────────────────────────
  -- 4. SALDO PENDIENTE DEL ÚLTIMO CORTE admin → entidad
  --    (solo cortes del admin principal, no del sub_admin)
  -- ──────────────────────────────────────────────────────────
  entity_pending AS (
    SELECT DISTINCT ON (s.seller_id)
      s.seller_id                                     AS entity_id,
      COALESCE(s.balance_at_settlement - s.amount, 0) AS pending
    FROM public.settlements s
    WHERE s.admin_id = p_admin_id
      AND ((p_lottery_id   IS NULL AND s.lottery_id   IS NULL) OR s.lottery_id   = p_lottery_id)
      AND ((p_draw_time_id IS NULL AND s.draw_time_id IS NULL) OR s.draw_time_id = p_draw_time_id)
    ORDER BY s.seller_id, s.created_at DESC
  )

  -- ──────────────────────────────────────────────────────────
  -- 5. RESULTADO FINAL
  -- ──────────────────────────────────────────────────────────
  SELECT
    e.entity_id,
    e.entity_name,
    e.pct,
    COALESCE(es.total, 0)                                                                AS total_sales,
    COALESCE(es.total, 0) * e.pct / 100                                                  AS total_commission,
    COALESCE(es.total, 0) - COALESCE(es.total, 0) * e.pct / 100                         AS admin_part,
    COALESCE(ep.total, 0)                                                                AS total_prizes_paid,
    COALESCE(pd.pending, 0)
      + (COALESCE(es.total, 0) - COALESCE(es.total, 0) * e.pct / 100)
      - COALESCE(ep.total, 0)                                                            AS balance
  FROM entities e
  LEFT JOIN entity_sales   es ON es.entity_id = e.entity_id
  LEFT JOIN entity_prizes  ep ON ep.entity_id = e.entity_id
  LEFT JOIN entity_pending pd ON pd.entity_id = e.entity_id
  ORDER BY e.entity_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_sellers_balance(UUID,DATE,DATE,UUID,UUID) TO authenticated;
