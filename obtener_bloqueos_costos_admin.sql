-- Devuelve la identidad del usuario que mantiene cada bloqueo activo.
-- Ejecutar en Supabase SQL Editor antes de publicar el frontend que consume
-- public.obtener_bloqueos_costos_admin.
CREATE OR REPLACE FUNCTION public.obtener_bloqueos_costos_admin()
RETURNS TABLE (
  costo_id bigint,
  bloqueado_por_mi boolean,
  bloqueado_por_otro boolean,
  ultima_actividad timestamptz,
  auditor_id uuid,
  auditor_nombre text,
  auditor_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_usuario uuid;
BEGIN
  v_usuario := auth.uid();

  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_usuario
      AND ur.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'No tienes permisos para consultar los bloqueos de costos.';
  END IF;

  RETURN QUERY
  SELECT
    cb.costo_id,
    (cb.auditor_id = v_usuario) AS bloqueado_por_mi,
    (cb.auditor_id <> v_usuario) AS bloqueado_por_otro,
    cb.ultima_actividad,
    cb.auditor_id,
    COALESCE(
      NULLIF(BTRIM(u.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(BTRIM(u.raw_user_meta_data ->> 'name'), ''),
      NULLIF(BTRIM(u.raw_user_meta_data ->> 'nombre'), ''),
      NULLIF(SPLIT_PART(u.email, '@', 1), ''),
      'Auditor'
    )::text AS auditor_nombre,
    u.email::text AS auditor_email
  FROM public.costo_bloqueos cb
  LEFT JOIN auth.users u ON u.id = cb.auditor_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.obtener_bloqueos_costos_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_bloqueos_costos_admin() TO authenticated;
