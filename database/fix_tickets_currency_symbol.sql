-- ============================================================
-- PARCHE: Corrige currency_symbol en tickets históricos
--
-- Problema: tickets guardados antes del parche CRC tienen
--   currency_symbol = '$' aunque el vendedor usa ₡.
--
-- Solución: actualiza los tickets cuyo seller/admin tenga
--   un currency_symbol distinto de '$' en su perfil.
--
-- ⚠ Ejecutar UNA SOLA VEZ en el SQL Editor de InsForge/Supabase.
-- ============================================================

UPDATE public.tickets t
SET currency_symbol = p.currency_symbol
FROM public.profiles p
WHERE (t.seller_id = p.id OR t.admin_id = p.id)
  AND t.currency_symbol = '$'
  AND p.currency_symbol IS NOT NULL
  AND p.currency_symbol <> '$';
