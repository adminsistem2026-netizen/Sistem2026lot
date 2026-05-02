-- ============================================================
-- RPC: delete_settlement
-- Solo el admin dueño del corte puede eliminarlo.
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_settlement(
  p_settlement_id UUID,
  p_admin_id      UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.settlements
    WHERE id = p_settlement_id AND admin_id = p_admin_id
  ) THEN
    RAISE EXCEPTION 'Corte no encontrado o no tienes permiso para eliminarlo';
  END IF;

  DELETE FROM public.settlements
  WHERE id = p_settlement_id AND admin_id = p_admin_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_settlement(UUID, UUID) TO authenticated;
