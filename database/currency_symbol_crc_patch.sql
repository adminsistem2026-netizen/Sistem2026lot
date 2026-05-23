-- ============================================================
-- PARCHE: Corrige el símbolo de CRC en system_config
--
-- Propósito: Actualiza el símbolo de la moneda Colón Costarricense
--   de cualquier valor previo ("$Col", "Col", etc.) al símbolo
--   oficial ₡ en la tabla system_config (clave available_currencies).
--
-- ⚠ Ejecutar UNA SOLA VEZ en el SQL Editor de InsForge/Supabase.
-- ============================================================

UPDATE public.system_config
SET config_value = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'code' = 'CRC'
        THEN jsonb_set(elem, '{symbol}', '"₡"')
      ELSE elem
    END
  )
  FROM jsonb_array_elements(config_value::jsonb) elem
)
WHERE config_key = 'available_currencies';
