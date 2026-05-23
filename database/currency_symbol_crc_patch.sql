-- ============================================================
-- PARCHE AMPLIADO: Corrige símbolos Y nombres de moneda
--
-- 1. Corrige available_currencies en system_config:
--    - Agrega nombres a todas las monedas conocidas
--    - Corrige símbolo CRC: $Col → ₡
-- 2. Actualiza profiles donde currency_code = 'CRC'
-- 3. Actualiza lotteries donde currency_code = 'CRC'
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

-- 2. Corregir symbol en profiles (app móvil)
UPDATE public.profiles
SET currency_symbol = '₡'
WHERE currency_code = 'CRC'
  AND (currency_symbol IS NULL OR currency_symbol <> '₡');

-- 3. Corregir symbol en lotteries
UPDATE public.lotteries
SET currency_symbol = '₡'
WHERE currency_code = 'CRC'
  AND (currency_symbol IS NULL OR currency_symbol <> '₡');
