-- ============================================================
-- FIX: delete_seller — eliminar settlements antes de borrar perfil
--
-- El RPC anterior no borraba settlements, lo que causaba:
--   "violates foreign key constraint settlements_seller_id_fkey"
--
-- Secuencia correcta de borrado:
--   1. settlements       (seller_id FK)
--   2. winning_tickets   (seller_id FK)
--   3. ticket_numbers    (vía tickets.seller_id)
--   4. tickets           (seller_id FK)
--   5. sales_limits      (seller_id FK, nullable)
--   6. auth.users        (cascada → borra profiles)
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_seller(p_seller_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  -- Validar que el vendedor pertenece al admin autenticado
  SELECT parent_admin_id INTO v_admin_id
  FROM public.profiles
  WHERE id = p_seller_id;

  IF v_admin_id IS NULL OR v_admin_id != auth.uid() THEN
    RAISE EXCEPTION 'No autorizado para eliminar este vendedor';
  END IF;

  -- Bloquear si es sub_admin con vendedores activos
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE sub_admin_id = p_seller_id
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar: el sub-admin tiene vendedores asignados';
  END IF;

  -- Borrar en orden de dependencias FK
  DELETE FROM public.settlements   WHERE seller_id = p_seller_id;
  DELETE FROM public.winning_tickets WHERE seller_id = p_seller_id;
  DELETE FROM public.ticket_numbers WHERE ticket_id IN (
    SELECT id FROM public.tickets WHERE seller_id = p_seller_id
  );
  DELETE FROM public.tickets       WHERE seller_id = p_seller_id;
  DELETE FROM public.sales_limits  WHERE seller_id = p_seller_id;

  -- Borrar usuario auth (cascada borra public.profiles)
  DELETE FROM auth.users WHERE id = p_seller_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_seller(UUID) TO authenticated;
