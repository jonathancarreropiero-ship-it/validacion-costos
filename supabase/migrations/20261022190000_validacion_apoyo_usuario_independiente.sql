-- La validación por apoyo la puede reclamar cualquier admin/auditor que no
-- haya participado en el Conteo 3. El reclamo se asigna de forma atómica.
ALTER TABLE public.costo_validaciones_apoyo
  ALTER COLUMN validador_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.solicitar_validacion_apoyo(p_costo_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_cantidad integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role='admin') THEN
    RAISE EXCEPTION 'Solo un administrador puede solicitar la validación por apoyo.';
  END IF;
  PERFORM 1 FROM public.costos
  WHERE id=p_costo_id AND estado='terminado' AND conteo_habilitado=3
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La validación por apoyo requiere que el Conteo 3 haya finalizado.'; END IF;
  SELECT count(DISTINCT co.detalle_costo_id) INTO v_cantidad
  FROM public.conteos co
  JOIN public.detalle_costos dc ON dc.id=co.detalle_costo_id
  WHERE dc.costo_id=p_costo_id AND co.numero_conteo=3 AND co.resultado='diferencia';
  IF v_cantidad=0 THEN RAISE EXCEPTION 'El Conteo 3 no tiene líneas pendientes de validar por apoyo.'; END IF;
  INSERT INTO public.costo_validaciones_apoyo(costo_id,solicitante_id,validador_id)
  VALUES(p_costo_id,v_uid,NULL)
  ON CONFLICT(costo_id) DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ya hay una validación por apoyo pendiente o completada.'; END IF;
  DELETE FROM public.costo_validacion_apoyo_lineas WHERE costo_id=p_costo_id;
  RETURN jsonb_build_object('success',true,'costo_id',p_costo_id,'solicitante_id',v_uid,'validador_id',NULL);
END;$function$;

CREATE OR REPLACE FUNCTION public.obtener_lineas_validacion_apoyo(p_costo_id bigint)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  v_rol text;
  v_s public.costo_validaciones_apoyo%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado.'; END IF;
  SELECT role INTO v_rol FROM public.user_roles
  WHERE user_id=v_uid AND role IN('admin','auditor') LIMIT 1;
  IF v_rol IS NULL THEN RAISE EXCEPTION 'No autorizado.'; END IF;

  SELECT * INTO v_s FROM public.costo_validaciones_apoyo
  WHERE costo_id=p_costo_id AND estado='solicitada' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No hay una validación por apoyo disponible.'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.conteos co
    JOIN public.detalle_costos dc ON dc.id=co.detalle_costo_id
    WHERE dc.costo_id=p_costo_id AND co.numero_conteo=3 AND co.auditor_id=v_uid
  ) OR EXISTS(
    SELECT 1 FROM public.costo_apoyo_sesiones s
    WHERE s.costo_id=p_costo_id AND s.numero_conteo=3 AND (s.usuario_1=v_uid OR s.usuario_2=v_uid)
  ) THEN
    RAISE EXCEPTION 'Quienes realizaron el Conteo 3 no pueden validar este costo.';
  END IF;

  IF v_s.validador_id IS NULL THEN
    UPDATE public.costo_validaciones_apoyo
    SET validador_id=v_uid
    WHERE costo_id=p_costo_id AND estado='solicitada' AND validador_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Otro usuario ya tomó esta validación.'; END IF;
  ELSIF v_s.validador_id<>v_uid THEN
    RAISE EXCEPTION 'Otro usuario ya tomó esta validación.';
  END IF;

  RETURN QUERY SELECT jsonb_build_object(
    'id',dc.id,'sku',dc.sku,'descripcion',dc.descripcion,
    'cantidad_fisica',dc.cantidad_fisica,'cantidad_conteo_3',co.cantidad_final,'factor',co.factor
  )
  FROM public.detalle_costos dc
  JOIN LATERAL (
    SELECT c.cantidad_final,c.factor,c.resultado
    FROM public.conteos c
    WHERE c.detalle_costo_id=dc.id AND c.numero_conteo=3
    ORDER BY c.created_at DESC NULLS LAST,c.id DESC LIMIT 1
  ) co ON co.resultado='diferencia'
  WHERE dc.costo_id=p_costo_id ORDER BY dc.id;
END;$function$;

CREATE OR REPLACE FUNCTION public.guardar_validacion_apoyo(p_costo_id bigint,p_detalles jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  v_expected integer;
  v_sent integer;
  v_distinct integer;
  v_resultado text;
BEGIN
  IF v_uid IS NULL OR p_detalles IS NULL OR jsonb_typeof(p_detalles)<>'array' THEN
    RAISE EXCEPTION 'Envío inválido.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role IN('admin','auditor')) THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;
  PERFORM 1 FROM public.costo_validaciones_apoyo
  WHERE costo_id=p_costo_id AND estado='solicitada' AND validador_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No tienes asignada esta validación por apoyo.'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.conteos co
    JOIN public.detalle_costos dc ON dc.id=co.detalle_costo_id
    WHERE dc.costo_id=p_costo_id AND co.numero_conteo=3 AND co.auditor_id=v_uid
  ) OR EXISTS(
    SELECT 1 FROM public.costo_apoyo_sesiones s
    WHERE s.costo_id=p_costo_id AND s.numero_conteo=3 AND (s.usuario_1=v_uid OR s.usuario_2=v_uid)
  ) THEN
    RAISE EXCEPTION 'Quienes realizaron el Conteo 3 no pueden validar este costo.';
  END IF;

  SELECT count(DISTINCT co.detalle_costo_id) INTO v_expected
  FROM public.conteos co
  JOIN public.detalle_costos dc ON dc.id=co.detalle_costo_id
  WHERE dc.costo_id=p_costo_id AND co.numero_conteo=3 AND co.resultado='diferencia';
  SELECT count(*),count(DISTINCT (x->>'id')::bigint)
  INTO v_sent,v_distinct FROM jsonb_array_elements(p_detalles) x;
  IF v_expected=0 OR v_sent<>v_expected OR v_distinct<>v_sent THEN
    RAISE EXCEPTION 'Completa exactamente todas las líneas pendientes, sin duplicados.';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_detalles) x
    WHERE jsonb_typeof(x->'cantidades')<>'array'
      OR jsonb_array_length(x->'cantidades')=0
      OR (x->>'factor') IS NULL OR (x->>'factor')::numeric<=0
      OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(x->'cantidades') q WHERE q='' OR q::numeric<0)
      OR NOT EXISTS(
        SELECT 1 FROM public.detalle_costos dc
        JOIN LATERAL (
          SELECT c.resultado FROM public.conteos c
          WHERE c.detalle_costo_id=dc.id AND c.numero_conteo=3
          ORDER BY c.created_at DESC NULLS LAST,c.id DESC LIMIT 1
        ) co ON co.resultado='diferencia'
        WHERE dc.id=(x->>'id')::bigint AND dc.costo_id=p_costo_id
      )
  ) THEN RAISE EXCEPTION 'Hay una línea o cantidad inválida.'; END IF;

  INSERT INTO public.costo_validacion_apoyo_lineas(
    costo_id,detalle_costo_id,cantidad_total,factor,cantidad_final,resultado,auditor_id
  )
  SELECT p_costo_id,(x->>'id')::bigint,sum(q.cantidad),(x->>'factor')::numeric,
    sum(q.cantidad)*(x->>'factor')::numeric,
    CASE WHEN sum(q.cantidad)*(x->>'factor')::numeric=dc.cantidad_fisica THEN 'conforme' ELSE 'diferencia' END,
    v_uid
  FROM jsonb_array_elements(p_detalles) x
  CROSS JOIN LATERAL jsonb_array_elements_text(x->'cantidades') qv(valor)
  CROSS JOIN LATERAL (SELECT qv.valor::numeric AS cantidad) q
  JOIN public.detalle_costos dc ON dc.id=(x->>'id')::bigint
  GROUP BY (x->>'id'),(x->>'factor'),dc.cantidad_fisica
  ON CONFLICT(costo_id,detalle_costo_id) DO UPDATE SET
    cantidad_total=EXCLUDED.cantidad_total,factor=EXCLUDED.factor,
    cantidad_final=EXCLUDED.cantidad_final,resultado=EXCLUDED.resultado,
    auditor_id=EXCLUDED.auditor_id,created_at=now();

  SELECT CASE WHEN bool_and(resultado='conforme') THEN 'conforme' ELSE 'diferencia' END
  INTO v_resultado FROM public.costo_validacion_apoyo_lineas WHERE costo_id=p_costo_id;
  UPDATE public.costo_validaciones_apoyo
  SET estado='completada',resultado=v_resultado,completada_en=now()
  WHERE costo_id=p_costo_id AND validador_id=v_uid;
  UPDATE public.costos SET resultado=CASE WHEN v_resultado='conforme' THEN 'conforme' ELSE 'no conforme' END
  WHERE id=p_costo_id;
  RETURN jsonb_build_object('success',true,'resultado',v_resultado,'validado_por_apoyo',true);
END;$function$;

CREATE OR REPLACE FUNCTION public.estados_validacion_apoyo_costos()
RETURNS TABLE(costo_id bigint,estado text,resultado text,soy_solicitante boolean,soy_validador boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_rol text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  SELECT role INTO v_rol FROM public.user_roles
  WHERE user_id=v_uid AND role IN('admin','auditor') LIMIT 1;
  IF v_rol IS NULL THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  RETURN QUERY
  SELECT v.costo_id,v.estado,v.resultado,v.solicitante_id=v_uid,
    CASE WHEN v.estado='solicitada' THEN
      v.validador_id=v_uid OR (v.validador_id IS NULL AND NOT EXISTS(
          SELECT 1 FROM public.conteos co
          JOIN public.detalle_costos dc ON dc.id=co.detalle_costo_id
          WHERE dc.costo_id=v.costo_id AND co.numero_conteo=3 AND co.auditor_id=v_uid
        ) AND NOT EXISTS(
          SELECT 1 FROM public.costo_apoyo_sesiones s
          WHERE s.costo_id=v.costo_id AND s.numero_conteo=3 AND (s.usuario_1=v_uid OR s.usuario_2=v_uid)
        ))
      ELSE v.validador_id=v_uid END
  FROM public.costo_validaciones_apoyo v
  WHERE (v.estado='solicitada' AND (
      v.solicitante_id=v_uid OR (
        v.validador_id=v_uid OR (v.validador_id IS NULL AND NOT EXISTS(
          SELECT 1 FROM public.conteos co
          JOIN public.detalle_costos dc ON dc.id=co.detalle_costo_id
          WHERE dc.costo_id=v.costo_id AND co.numero_conteo=3 AND co.auditor_id=v_uid
        ) AND NOT EXISTS(
          SELECT 1 FROM public.costo_apoyo_sesiones s
          WHERE s.costo_id=v.costo_id AND s.numero_conteo=3 AND (s.usuario_1=v_uid OR s.usuario_2=v_uid)
        ))
      )
    )) OR (v.estado='completada' AND (
      v_rol='admin' OR v.solicitante_id=v_uid OR v.validador_id=v_uid
      OR EXISTS(SELECT 1 FROM public.costo_apoyo_parejas p WHERE p.costo_id=v.costo_id AND v_uid IN(p.usuario_1,p.usuario_2))
    ));
END;$function$;

REVOKE ALL ON FUNCTION public.solicitar_validacion_apoyo(bigint),
  public.obtener_lineas_validacion_apoyo(bigint),
  public.guardar_validacion_apoyo(bigint,jsonb),
  public.estados_validacion_apoyo_costos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.solicitar_validacion_apoyo(bigint),
  public.obtener_lineas_validacion_apoyo(bigint),
  public.guardar_validacion_apoyo(bigint,jsonb),
  public.estados_validacion_apoyo_costos() TO authenticated;





