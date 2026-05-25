-- Función para sincronización de hora del servidor en el cliente (APK).
-- Permite ignorar el reloj del celular del vendedor al verificar bloqueos de sorteos.
-- Ejecutar una sola vez en el SQL Editor de InsForge.

CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint;
$$;
