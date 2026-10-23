-- Estado de habilitación consultado sobre la sesión del conteo actual.
-- No usa costo_bloqueos, que puede seguir apuntando al participante anterior.
CREATE OR REPLACE FUNCTION public.estado_habilitacion_apoyo_admin(p_costo_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_numero integer;
  v_estado text;
  v_owner uuid;
  v_s public.costo_apoyo_sesiones%ROWTYPE;
  v_hay_sesion boolean := false;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Solo un administrador puede consultar este estado.'; END IF;

  SELECT conteo_habilitado, estado, iniciado_por
  INTO v_numero, v_estado, v_owner
  FROM public.costos WHERE id = p_costo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'El costo no existe.'; END IF;

  IF v_estado = 'terminado' THEN
    RETURN jsonb_build_object('puede_habilitar',false,'motivo','costo_terminado','numero_conteo',v_numero);
  END IF;
  IF v_numero NOT BETWEEN 1 AND 3 THEN
    RETURN jsonb_build_object('puede_habilitar',false,'motivo','conteo_no_habilitado','numero_conteo',v_numero);
  END IF;

  SELECT * INTO v_s FROM public.costo_apoyo_sesiones
  WHERE costo_id = p_costo_id AND numero_conteo = v_numero;
  v_hay_sesion := FOUND;

  IF v_hay_sesion AND v_s.apoyo_habilitado THEN
    RETURN jsonb_build_object('puede_habilitar',false,'motivo','apoyo_ya_habilitado','numero_conteo',v_numero);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.conteos co
    JOIN public.detalle_costos dc ON dc.id = co.detalle_costo_id
    WHERE dc.costo_id = p_costo_id AND co.numero_conteo = v_numero
  ) THEN
    RETURN jsonb_build_object('puede_habilitar',false,'motivo','conteo_ya_guardado','numero_conteo',v_numero);
  END IF;
  IF v_numero = 1 AND v_owner IS NOT NULL THEN
    RETURN jsonb_build_object('puede_habilitar',false,'motivo','usuario_en_costo','numero_conteo',v_numero);
  END IF;
  IF v_hay_sesion AND (
    v_s.usuario_1 IS NOT NULL OR v_s.usuario_2 IS NOT NULL OR
    v_s.envio_1 IS NOT NULL OR v_s.envio_2 IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('puede_habilitar',false,'motivo','usuario_en_costo','numero_conteo',v_numero);
  END IF;

  RETURN jsonb_build_object('puede_habilitar',true,'motivo',null,'numero_conteo',v_numero);
END;
$function$;

REVOKE ALL ON FUNCTION public.estado_habilitacion_apoyo_admin(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estado_habilitacion_apoyo_admin(bigint) TO authenticated;
