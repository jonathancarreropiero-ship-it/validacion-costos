-- En una sesión compartida el primer participante es iniciado_por, pero no
-- tiene una fila en costo_bloqueos. Su actividad debe renovarse en la sesión
-- compartida en vez de intentar renovar un bloqueo individual inexistente.
CREATE OR REPLACE FUNCTION public.renovar_bloqueo_costo(p_costo_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_rol text;
  v_owner uuid;
  v_estado text;
  v_num integer;
  v_actualizado integer;
  v_s public.costo_apoyo_sesiones%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  SELECT role INTO v_rol
  FROM public.user_roles
  WHERE user_id = v_uid AND role IN ('admin', 'auditor')
  LIMIT 1;

  IF v_rol IS NULL THEN
    RAISE EXCEPTION 'No autorizado para renovar este bloqueo.';
  END IF;

  SELECT iniciado_por, estado, conteo_habilitado
  INTO v_owner, v_estado, v_num
  FROM public.costos
  WHERE id = p_costo_id;

  IF NOT FOUND OR v_estado = 'terminado' THEN
    RAISE EXCEPTION 'El costo no está disponible.';
  END IF;

  SELECT *
  INTO v_s
  FROM public.costo_apoyo_sesiones
  WHERE costo_id = p_costo_id
    AND numero_conteo = v_num
    AND apoyo_habilitado
  FOR UPDATE;

  IF FOUND THEN
    IF v_s.usuario_1 = v_uid THEN
      UPDATE public.costo_apoyo_sesiones
      SET actividad_1 = now()
      WHERE costo_id = p_costo_id AND numero_conteo = v_num;
    ELSIF v_s.usuario_2 = v_uid THEN
      UPDATE public.costo_apoyo_sesiones
      SET actividad_2 = now()
      WHERE costo_id = p_costo_id AND numero_conteo = v_num;
    ELSE
      RAISE EXCEPTION 'No eres participante autorizado de este conteo compartido.';
    END IF;

    RETURN jsonb_build_object('success', true, 'renovado', true, 'compartido', true, 'costo_id', p_costo_id);
  END IF;

  IF v_owner IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'No eres responsable de este costo.';
  END IF;

  UPDATE public.costo_bloqueos
  SET ultima_actividad = now()
  WHERE costo_id = p_costo_id AND auditor_id = v_uid;
  GET DIAGNOSTICS v_actualizado = ROW_COUNT;

  IF v_actualizado = 0 THEN
    RAISE EXCEPTION 'No tienes el bloqueo de este costo.';
  END IF;

  RETURN jsonb_build_object('success', true, 'renovado', true, 'costo_id', p_costo_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.renovar_bloqueo_costo(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renovar_bloqueo_costo(bigint) TO authenticated;
