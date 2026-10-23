-- Esta migración define una RPC administrativa; aplicarla no elimina registros.
CREATE OR REPLACE FUNCTION public.eliminar_costos_admin(p_costos_ids bigint[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_usuario uuid := auth.uid();
  v_rol text;
  v_eliminados integer;
  v_numeros text[];
BEGIN
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado.'; END IF;
  SELECT role INTO v_rol FROM public.user_roles WHERE user_id = v_usuario LIMIT 1;
  IF v_rol IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo un administrador puede eliminar costos.'; END IF;
  IF p_costos_ids IS NULL OR cardinality(p_costos_ids) = 0 THEN RAISE EXCEPTION 'Selecciona al menos un costo.'; END IF;

  SELECT array_agg(c.numero_costo::text ORDER BY c.numero_costo::text) INTO v_numeros
  FROM public.costos c WHERE c.id = ANY(p_costos_ids);

  DELETE FROM public.costos WHERE id = ANY(p_costos_ids);
  GET DIAGNOSTICS v_eliminados = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'eliminados', v_eliminados,
    'numeros_costo', COALESCE(to_jsonb(v_numeros), '[]'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.eliminar_costos_admin(bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_costos_admin(bigint[]) TO authenticated;
