-- ============================================================
-- CANDIDATO RLS: SOPORTE Y ALCANCE DE RED
-- NO aplicar a produccion sin comparar antes contra la base real.
--
-- Objetivo:
-- completar el mapa de politicas candidatas para:
--   - profiles
--   - settlements
--
-- Este archivo se enfoca en alcance de red, administracion de
-- usuarios y visibilidad de liquidaciones.
-- ============================================================


-- ============================================================
-- profiles
-- ============================================================

-- Regla objetivo:
-- - cada usuario ve su propio perfil
-- - admin ve su red
-- - sub_admin ve su propio perfil y vendedores asignados
-- - super_admin ve todo
--
-- Nota:
-- esta politica mejora la expresion de `sub_admin`, pero no intenta
-- resolver todavia todos los casos de edicion sensible.

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR parent_admin_id = auth.uid()
    OR sub_admin_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles self
      WHERE self.id = auth.uid()
        AND self.role = 'sub_admin'
        AND profiles.parent_admin_id = self.parent_admin_id
        AND profiles.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR parent_admin_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  )
  WITH CHECK (
    id = auth.uid()
    OR parent_admin_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );


-- ============================================================
-- settlements
-- ============================================================

-- Regla objetivo:
-- - seller ve solo sus propias liquidaciones
-- - admin ve las de su red
-- - sub_admin puede leer liquidaciones de vendedores asignados si
--   ese alcance existe en produccion
-- - super_admin puede auditar

DROP POLICY IF EXISTS settlements_select ON public.settlements;
DROP POLICY IF EXISTS settlements_insert ON public.settlements;
DROP POLICY IF EXISTS settlements_update ON public.settlements;
DROP POLICY IF EXISTS settlements_delete ON public.settlements;

CREATE POLICY settlements_select ON public.settlements
  FOR SELECT USING (
    admin_id = auth.uid()
    OR seller_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles s
      WHERE s.id = settlements.seller_id
        AND s.sub_admin_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

CREATE POLICY settlements_insert ON public.settlements
  FOR INSERT WITH CHECK (
    admin_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

-- Por ahora no se propone UPDATE/DELETE operativo porque el flujo
-- visible del frontend crea liquidaciones, pero no las edita ni borra.


-- ============================================================
-- RECOMENDACION COMPLEMENTARIA
-- ============================================================

-- `profiles_update` sigue siendo un area sensible:
-- un admin no deberia poder modificar todo campo de cualquier usuario
-- de su red sin restricciones adicionales.
--
-- Si se quiere endurecer esto despues, conviene separar:
-- 1. autoservicio del propio perfil
-- 2. edicion administrativa via RPCs (`setup_new_user`,
--    `update_admin_profile`, etc.)
--
-- y reducir el UPDATE directo por tabla.

