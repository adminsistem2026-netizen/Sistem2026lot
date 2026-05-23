-- ============================================================
-- PARCHE DEFINITIVO: Corrige símbolo y nombres de moneda
--
-- 1. Corrige system_config.available_currencies (nombres + símbolo ₡)
-- 2. Corrige profiles con símbolo incorrecto (busca por símbolo, no código)
-- 3. Corrige lotteries con símbolo incorrecto
--
-- ⚠ Ejecutar UNA SOLA VEZ en el SQL Editor de InsForge.
-- ============================================================

-- 1. Corregir system_config.available_currencies
UPDATE public.system_config
SET config_value = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'code' = 'USD'
        THEN '{"code":"USD","symbol":"$","name":"Dólar Americano","decimal_places":2}'::jsonb
      WHEN elem->>'code' = 'PAB'
        THEN '{"code":"PAB","symbol":"B/.","name":"Balboa Panameño","decimal_places":2}'::jsonb
      WHEN elem->>'code' = 'NIO'
        THEN '{"code":"NIO","symbol":"C$","name":"Córdoba Nicaragüense","decimal_places":2}'::jsonb
      WHEN elem->>'code' = 'CRC'
        THEN '{"code":"CRC","symbol":"₡","name":"Colón Costarricense","decimal_places":0}'::jsonb
      WHEN elem->>'code' = 'HNL'
        THEN '{"code":"HNL","symbol":"L","name":"Lempira Hondureño","decimal_places":2}'::jsonb
      ELSE elem  -- monedas personalizadas se conservan intactas
    END
  )
  FROM jsonb_array_elements(config_value::jsonb) elem
)
WHERE config_key = 'available_currencies';

-- 2. Corregir profiles: busca por símbolo (cubre $Col, col, Col, $col, etc.)
UPDATE public.profiles
SET currency_symbol = '₡',
    currency_code   = 'CRC'
WHERE currency_symbol ILIKE '%col%';

-- 3. Corregir lotteries: misma lógica
UPDATE public.lotteries
SET currency_symbol = '₡',
    currency_code   = 'CRC'
WHERE currency_symbol ILIKE '%col%';
