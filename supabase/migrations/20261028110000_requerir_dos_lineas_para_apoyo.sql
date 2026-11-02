-- El conteo compartido divide el costo en dos bloques. No habilitarlo cuando
-- existe una sola línea porque no es posible asignar un bloque a cada usuario.
CREATE OR REPLACE FUNCTION public.habilitar_apoyo_conteo(p_costo_id bigint, p_numero_conteo integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_usuario uuid := auth.uid();
  v_rol text;
  v_habilitado integer;
  v_estado text;
  v_owner uuid;
  v_lineas bigint;
  v_s public.costo_apoyo_sesiones%ROWTYPE;
BEGIN
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado.'; END IF;
  SELECT role INTO v_rol FROM public.user_roles WHERE user_id=v_usuario LIMIT 1;
  IF v_rol IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo un administrador puede habilitar apoyo.'; END IF;

  SELECT conteo_habilitado,estado,iniciado_por
    INTO v_habilitado,v_estado,v_owner
  FROM public.costos WHERE id=p_costo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El costo no existe.'; END IF;
  IF p_numero_conteo NOT BETWEEN 1 AND 3 OR p_numero_conteo<>v_habilitado THEN
    RAISE EXCEPTION 'Habilita el Conteo % antes de habilitar apoyo.',p_numero_conteo;
  END IF;
  SELECT count(*) INTO v_lineas FROM public.detalle_costos WHERE costo_id=p_costo_id;
  IF v_lineas<2 THEN
    RAISE EXCEPTION 'No se puede habilitar apoyo: se requieren al menos dos líneas SKU.';
  END IF;
  IF v_estado='terminado' THEN RAISE EXCEPTION 'El costo está terminado.'; END IF;
  IF p_numero_conteo=1 AND v_owner IS NOT NULL THEN
    RAISE EXCEPTION 'Ya existe un usuario realizando este costo.';
  END IF;

  SELECT * INTO v_s FROM public.costo_apoyo_sesiones
  WHERE costo_id=p_costo_id AND numero_conteo=p_numero_conteo FOR UPDATE;
  IF FOUND AND (v_s.usuario_1 IS NOT NULL OR v_s.envio_1 IS NOT NULL OR v_s.envio_2 IS NOT NULL) THEN
    RAISE EXCEPTION 'Ya existe un usuario realizando este conteo.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.conteos co
    JOIN public.detalle_costos dc ON dc.id=co.detalle_costo_id
    WHERE dc.costo_id=p_costo_id AND co.numero_conteo=p_numero_conteo
  ) THEN
    RAISE EXCEPTION 'Este conteo ya fue iniciado o guardado.';
  END IF;

  INSERT INTO public.costo_apoyo_sesiones(costo_id,numero_conteo,apoyo_habilitado,habilitado_por)
  VALUES(p_costo_id,p_numero_conteo,true,v_usuario)
  ON CONFLICT(costo_id,numero_conteo) DO UPDATE
    SET apoyo_habilitado=true,habilitado_por=v_usuario;
  RETURN jsonb_build_object(
    'success',true,'apoyo_habilitado',true,'costo_id',p_costo_id,'numero_conteo',p_numero_conteo
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.habilitar_apoyo_conteo(bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.habilitar_apoyo_conteo(bigint,integer) TO authenticated;
