CREATE OR REPLACE FUNCTION public.estado_conteo_compartido(
  p_costo_id bigint,
  p_numero_conteo integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_s public.costo_apoyo_sesiones%ROWTYPE;
  v_result text;
  v_total integer := 0;
  v_conformes integer := 0;
  v_diferencias integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  SELECT *
  INTO v_s
  FROM public.costo_apoyo_sesiones
  WHERE costo_id = p_costo_id
    AND numero_conteo = p_numero_conteo;

  IF NOT FOUND OR NOT v_s.apoyo_habilitado THEN
    RAISE EXCEPTION 'No hay un conteo compartido activo.';
  END IF;

  IF v_uid IS DISTINCT FROM v_s.usuario_1
    AND v_uid IS DISTINCT FROM v_s.usuario_2 THEN
    RAISE EXCEPTION 'No estás autorizado para consultar esta sesión.';
  END IF;

  SELECT
    count(*)::integer,
    (count(*) FILTER (WHERE co.resultado = 'conforme'))::integer,
    (count(*) FILTER (WHERE co.resultado = 'diferencia'))::integer,
    CASE
      WHEN count(*) > 0 AND bool_and(co.resultado = 'conforme') THEN 'conforme'
      WHEN count(*) > 0 THEN 'no_conforme'
      ELSE NULL
    END
  INTO v_total, v_conformes, v_diferencias, v_result
  FROM public.conteos co
  JOIN public.detalle_costos dc ON dc.id = co.detalle_costo_id
  WHERE dc.costo_id = p_costo_id
    AND co.numero_conteo = p_numero_conteo;

  RETURN jsonb_build_object(
    'apoyo_habilitado', true,
    'esperando_segundo', v_s.usuario_2 IS NULL,
    'esperando_guardado', v_s.envio_1 IS NULL OR v_s.envio_2 IS NULL,
    'completado', v_s.envio_1 IS NOT NULL AND v_s.envio_2 IS NOT NULL,
    'resultado', v_result,
    'lineasConformes', v_conformes,
    'lineasDiferencia', v_diferencias,
    'totalLineas', v_total,
    'usuario_1', v_s.usuario_1,
    'usuario_2', v_s.usuario_2
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.estado_conteo_compartido(bigint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estado_conteo_compartido(bigint, integer) TO authenticated;
