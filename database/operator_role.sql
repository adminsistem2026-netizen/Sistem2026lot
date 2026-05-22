-- ============================================================
-- PATCH: ROL OPERADOR
--
-- Agrega el rol 'operator' al sistema.
-- Un operador es creado por un admin para delegar la gestión
-- de loterías y resultados.  Solo tiene acceso a esas dos
-- secciones; el resto del panel admin está bloqueado en el
-- frontend por ProtectedRoute.
--
-- Pasos:
--   1. Ampliar el CHECK constraint de profiles.role
--   2. Dar permisos de ejecución en las RPCs que el operador
--      necesita (las que ya usaba el admin para loterias/resultados)
-- ============================================================


-- 1. Ampliar CHECK constraint ─────────────────────────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('super_admin', 'admin', 'sub_admin', 'operator', 'seller'));


-- Nota: los GRANTs a funciones existentes ya están concedidos
-- desde los patches anteriores. No se repiten aquí.
