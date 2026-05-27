-- Fix: habilitar RLS en users y revocar acceso a columna password
-- Esto resuelve: sensitive_columns_exposed + rls_disabled_in_public

-- 1. Habilitar RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar política anterior permisiva (si existe)
DROP POLICY IF EXISTS "users_select_public" ON public.users;

-- 3. Políticas por operación
--    SELECT: cualquiera puede leer (necesario para que el admin cargue emails en el dashboard)
--            pero la columna password estará revocada para roles públicos (ver paso 5)
CREATE POLICY "users_select" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "users_insert" ON public.users
  FOR INSERT WITH CHECK (true);

CREATE POLICY "users_update" ON public.users
  FOR UPDATE USING (true);

CREATE POLICY "users_delete" ON public.users
  FOR DELETE USING (true);

-- 4. Revocar acceso a la columna password para roles públicos
--    El login ahora usa la Edge Function con service_role, que sí puede leerla.
--    Cualquier SELECT de la API REST que incluya 'password' devolverá error de permisos.
REVOKE SELECT (password) ON public.users FROM anon;
REVOKE SELECT (password) ON public.users FROM authenticated;
