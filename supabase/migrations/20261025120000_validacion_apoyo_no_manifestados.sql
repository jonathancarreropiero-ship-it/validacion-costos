-- Extiende la validación final por apoyo a SKU no manifestados con un tercer
-- recuento diferente de la cantidad inicialmente registrada. La validación se
-- guarda en una tabla aparte y conserva la exclusión de quienes participaron
-- en el Conteo 3.

CREATE TABLE IF NOT EXISTS public.costo_validacion_apoyo_no_manifestados (
  costo_id bigint NOT NULL REFERENCES public.costos(id) ON DELETE CASCADE,
  no_manifestado_id bigint NOT NULL REFERENCES public.no_manifestados(id) ON DELETE CASCADE,
  cantidad_conteo_3 numeric NOT NULL CHECK (cantidad_conteo_3 >= 0),
  cantidad_validada numeric NOT NULL CHECK (cantidad_validada >= 0),
  resultado text NOT NULL CHECK (resultado IN ('conforme','diferencia')),
  auditor_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (costo_id,no_manifestado_id)
);
ALTER TABLE public.costo_validacion_apoyo_no_manifestados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.costo_validacion_apoyo_no_manifestados FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.resumen_no_manifestados_conteo3_pendientes_admin()
RETURNS TABLE(costo_id bigint,cantidad_pendiente bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role='admin') THEN
    RAISE EXCEPTION 'Solo un administrador puede consultar estos recuentos.';
  END IF;
  RETURN QUERY
  SELECT nm.costo_id,count(*)::bigint
  FROM public.no_manifestados nm
  JOIN public.no_manifestado_reconteos_habilitados h
    ON h.costo_id=nm.costo_id AND h.sku_normalizado=lower(btrim(nm.sku)) AND h.numero_conteo=3
  JOIN public.no_manifestado_reconteos r ON r.no_manifestado_id=nm.id AND r.numero_conteo=3
  JOIN public.costos c ON c.id=nm.costo_id AND c.estado='terminado' AND c.conteo_habilitado=3
  WHERE r.cantidad IS DISTINCT FROM nm.cantidad
  GROUP BY nm.costo_id;
END;$function$;

CREATE OR REPLACE FUNCTION public.solicitar_validacion_apoyo(p_costo_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_regulares integer; v_adicionales integer;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role='admin') THEN
    RAISE EXCEPTION 'Solo un administrador puede solicitar la validación por apoyo.';
  END IF;
  PERFORM 1 FROM public.costos
  WHERE id=p_costo_id AND estado='terminado' AND conteo_habilitado=3
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La validación por apoyo requiere que el Conteo 3 haya finalizado.'; END IF;

  SELECT count(*) INTO v_regulares
  FROM public.detalle_costos dc
  JOIN LATERAL (
    SELECT co.resultado FROM public.conteos co
    WHERE co.detalle_costo_id=dc.id AND co.numero_conteo=3
    ORDER BY co.created_at DESC NULLS LAST,co.id DESC LIMIT 1
  ) co ON co.resultado='diferencia'
  WHERE dc.costo_id=p_costo_id;

  SELECT count(*) INTO v_adicionales
  FROM public.no_manifestados nm
  JOIN public.no_manifestado_reconteos_habilitados h
    ON h.costo_id=nm.costo_id AND h.sku_normalizado=lower(btrim(nm.sku)) AND h.numero_conteo=3
  JOIN public.no_manifestado_reconteos r ON r.no_manifestado_id=nm.id AND r.numero_conteo=3
  WHERE nm.costo_id=p_costo_id AND r.cantidad IS DISTINCT FROM nm.cantidad;

  IF v_regulares+v_adicionales=0 THEN
    RAISE EXCEPTION 'El Conteo 3 no tiene líneas ni SKU no manifestados pendientes de validar.';
  END IF;

  INSERT INTO public.costo_validaciones_apoyo(costo_id,solicitante_id,validador_id)
  VALUES(p_costo_id,v_uid,NULL) ON CONFLICT(costo_id) DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ya hay una validación por apoyo pendiente o completada.'; END IF;
  DELETE FROM public.costo_validacion_apoyo_lineas WHERE costo_id=p_costo_id;
  DELETE FROM public.costo_validacion_apoyo_no_manifestados WHERE costo_id=p_costo_id;
  RETURN jsonb_build_object('success',true,'costo_id',p_costo_id,'solicitante_id',v_uid,
    'validador_id',NULL,'lineas_regulares',v_regulares,'no_manifestados',v_adicionales);
END;$function$;

CREATE OR REPLACE FUNCTION public.obtener_no_manifestados_validacion_apoyo(p_costo_id bigint)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_s public.costo_validaciones_apoyo%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role IN('admin','auditor')) THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;
  SELECT * INTO v_s FROM public.costo_validaciones_apoyo
  WHERE costo_id=p_costo_id AND estado='solicitada' FOR UPDATE;
  IF NOT FOUND OR v_s.validador_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'No tienes asignada esta validación por apoyo.';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.conteos co JOIN public.detalle_costos dc ON dc.id=co.detalle_costo_id
    WHERE dc.costo_id=p_costo_id AND co.numero_conteo=3 AND co.auditor_id=v_uid
  ) OR EXISTS(
    SELECT 1 FROM public.costo_apoyo_sesiones s
    WHERE s.costo_id=p_costo_id AND s.numero_conteo=3 AND v_uid IN(s.usuario_1,s.usuario_2)
  ) OR EXISTS(
    SELECT 1 FROM public.no_manifestado_reconteos r JOIN public.no_manifestados nm ON nm.id=r.no_manifestado_id
    WHERE nm.costo_id=p_costo_id AND r.numero_conteo=3 AND r.auditor_id=v_uid
  ) THEN RAISE EXCEPTION 'Quienes realizaron el Conteo 3 no pueden validar este costo.'; END IF;

  RETURN QUERY
  SELECT jsonb_build_object('id',nm.id,'sku',nm.sku,'observacion',nm.observacion,
    'cantidad',nm.cantidad,'cantidad_conteo_3',r.cantidad,'auditor_conteo_3',r.auditor_id)
  FROM public.no_manifestados nm
  JOIN public.no_manifestado_reconteos_habilitados h
    ON h.costo_id=nm.costo_id AND h.sku_normalizado=lower(btrim(nm.sku)) AND h.numero_conteo=3
  JOIN public.no_manifestado_reconteos r ON r.no_manifestado_id=nm.id AND r.numero_conteo=3
  WHERE nm.costo_id=p_costo_id AND r.cantidad IS DISTINCT FROM nm.cantidad
  ORDER BY nm.id;
END;$function$;

CREATE OR REPLACE FUNCTION public.guardar_validacion_apoyo_completa(
  p_costo_id bigint,p_detalles jsonb,p_no_manifestados jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_uid uuid:=auth.uid(); v_expected integer; v_sent integer; v_distinct integer;
  v_expected_nm integer; v_sent_nm integer; v_distinct_nm integer; v_resultado text;
BEGIN
  IF v_uid IS NULL OR p_detalles IS NULL OR jsonb_typeof(p_detalles)<>'array'
    OR p_no_manifestados IS NULL OR jsonb_typeof(p_no_manifestados)<>'array' THEN
    RAISE EXCEPTION 'Envío de validación inválido.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role IN('admin','auditor')) THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;
  PERFORM 1 FROM public.costo_validaciones_apoyo
  WHERE costo_id=p_costo_id AND estado='solicitada' AND validador_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No tienes asignada esta validación por apoyo.'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.conteos co JOIN public.detalle_costos dc ON dc.id=co.detalle_costo_id
    WHERE dc.costo_id=p_costo_id AND co.numero_conteo=3 AND co.auditor_id=v_uid
  ) OR EXISTS(
    SELECT 1 FROM public.costo_apoyo_sesiones s
    WHERE s.costo_id=p_costo_id AND s.numero_conteo=3 AND v_uid IN(s.usuario_1,s.usuario_2)
  ) OR EXISTS(
    SELECT 1 FROM public.no_manifestado_reconteos r JOIN public.no_manifestados nm ON nm.id=r.no_manifestado_id
    WHERE nm.costo_id=p_costo_id AND r.numero_conteo=3 AND r.auditor_id=v_uid
  ) THEN RAISE EXCEPTION 'Quienes realizaron el Conteo 3 no pueden validar este costo.'; END IF;

  SELECT count(*) INTO v_expected FROM public.detalle_costos dc
  JOIN LATERAL (SELECT c.resultado FROM public.conteos c
    WHERE c.detalle_costo_id=dc.id AND c.numero_conteo=3
    ORDER BY c.created_at DESC NULLS LAST,c.id DESC LIMIT 1) co ON co.resultado='diferencia'
  WHERE dc.costo_id=p_costo_id;
  SELECT count(*),count(DISTINCT (x->>'id')::bigint) INTO v_sent,v_distinct
  FROM jsonb_array_elements(p_detalles) x;
  IF v_sent<>v_expected OR v_distinct<>v_sent THEN
    RAISE EXCEPTION 'Completa exactamente todas las líneas SKU pendientes, sin duplicados.';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_detalles) x
    WHERE jsonb_typeof(x->'cantidades')<>'array' OR jsonb_array_length(x->'cantidades')=0
      OR (x->>'factor') IS NULL OR (x->>'factor')::numeric<=0
      OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(x->'cantidades') q WHERE q='' OR q::numeric<0)
      OR NOT EXISTS(
        SELECT 1 FROM public.detalle_costos dc
        JOIN LATERAL (SELECT c.resultado FROM public.conteos c WHERE c.detalle_costo_id=dc.id AND c.numero_conteo=3
          ORDER BY c.created_at DESC NULLS LAST,c.id DESC LIMIT 1) co ON co.resultado='diferencia'
        WHERE dc.id=(x->>'id')::bigint AND dc.costo_id=p_costo_id
      )
  ) THEN RAISE EXCEPTION 'Hay una línea o cantidad SKU inválida.'; END IF;

  SELECT count(*) INTO v_expected_nm
  FROM public.no_manifestados nm
  JOIN public.no_manifestado_reconteos_habilitados h
    ON h.costo_id=nm.costo_id AND h.sku_normalizado=lower(btrim(nm.sku)) AND h.numero_conteo=3
  JOIN public.no_manifestado_reconteos r ON r.no_manifestado_id=nm.id AND r.numero_conteo=3
  WHERE nm.costo_id=p_costo_id AND r.cantidad IS DISTINCT FROM nm.cantidad;
  SELECT count(*),count(DISTINCT (x->>'id')::bigint) INTO v_sent_nm,v_distinct_nm
  FROM jsonb_array_elements(p_no_manifestados) x;
  IF v_sent_nm<>v_expected_nm OR v_distinct_nm<>v_sent_nm THEN
    RAISE EXCEPTION 'Completa exactamente todos los SKU no manifestados pendientes, sin duplicados.';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_no_manifestados) x
    WHERE (x->>'cantidad') IS NULL OR (x->>'cantidad')::numeric<0
      OR NOT EXISTS(
        SELECT 1 FROM public.no_manifestados nm
        JOIN public.no_manifestado_reconteos_habilitados h ON h.costo_id=nm.costo_id
          AND h.sku_normalizado=lower(btrim(nm.sku)) AND h.numero_conteo=3
        JOIN public.no_manifestado_reconteos r ON r.no_manifestado_id=nm.id AND r.numero_conteo=3
        WHERE nm.id=(x->>'id')::bigint AND nm.costo_id=p_costo_id
          AND r.cantidad IS DISTINCT FROM nm.cantidad
      )
  ) THEN RAISE EXCEPTION 'Hay un SKU no manifestado o cantidad inválida.'; END IF;

  DELETE FROM public.costo_validacion_apoyo_lineas WHERE costo_id=p_costo_id;
  INSERT INTO public.costo_validacion_apoyo_lineas(
    costo_id,detalle_costo_id,cantidad_total,factor,cantidad_final,resultado,auditor_id
  )
  SELECT p_costo_id,(x->>'id')::bigint,sum(q.cantidad),(x->>'factor')::numeric,
    sum(q.cantidad)*(x->>'factor')::numeric,
    CASE WHEN sum(q.cantidad)*(x->>'factor')::numeric=dc.cantidad_fisica THEN 'conforme' ELSE 'diferencia' END,v_uid
  FROM jsonb_array_elements(p_detalles) x
  CROSS JOIN LATERAL jsonb_array_elements_text(x->'cantidades') qv(valor)
  CROSS JOIN LATERAL (SELECT qv.valor::numeric AS cantidad) q
  JOIN public.detalle_costos dc ON dc.id=(x->>'id')::bigint AND dc.costo_id=p_costo_id
  GROUP BY (x->>'id'),(x->>'factor'),dc.cantidad_fisica;

  DELETE FROM public.costo_validacion_apoyo_no_manifestados WHERE costo_id=p_costo_id;
  INSERT INTO public.costo_validacion_apoyo_no_manifestados(
    costo_id,no_manifestado_id,cantidad_conteo_3,cantidad_validada,resultado,auditor_id
  )
  SELECT p_costo_id,nm.id,r.cantidad,(x->>'cantidad')::numeric,
    CASE WHEN (x->>'cantidad')::numeric=nm.cantidad THEN 'conforme' ELSE 'diferencia' END,v_uid
  FROM jsonb_array_elements(p_no_manifestados) x
  JOIN public.no_manifestados nm ON nm.id=(x->>'id')::bigint AND nm.costo_id=p_costo_id
  JOIN public.no_manifestado_reconteos r ON r.no_manifestado_id=nm.id AND r.numero_conteo=3;

  v_resultado:=CASE WHEN EXISTS(SELECT 1 FROM public.costo_validacion_apoyo_lineas WHERE costo_id=p_costo_id AND resultado<>'conforme')
      OR EXISTS(SELECT 1 FROM public.costo_validacion_apoyo_no_manifestados WHERE costo_id=p_costo_id AND resultado<>'conforme')
    THEN 'diferencia' ELSE 'conforme' END;
  UPDATE public.costo_validaciones_apoyo
  SET estado='completada',resultado=v_resultado,completada_en=now()
  WHERE costo_id=p_costo_id AND estado='solicitada' AND validador_id=v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'La solicitud de validación ya no está disponible.'; END IF;
  UPDATE public.costos SET resultado=CASE WHEN v_resultado='conforme' THEN 'conforme' ELSE 'no conforme' END
  WHERE id=p_costo_id;
  RETURN jsonb_build_object('success',true,'resultado',v_resultado,'validado_por_apoyo',true,
    'lineas_regulares',v_sent,'no_manifestados',v_sent_nm);
END;$function$;

CREATE OR REPLACE FUNCTION public.estados_validacion_apoyo_costos()
RETURNS TABLE(costo_id bigint,estado text,resultado text,soy_solicitante boolean,soy_validador boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_rol text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  SELECT role INTO v_rol FROM public.user_roles WHERE user_id=v_uid AND role IN('admin','auditor') LIMIT 1;
  IF v_rol IS NULL THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  RETURN QUERY
  WITH validaciones AS (
    SELECT v.*,
      NOT EXISTS(SELECT 1 FROM public.conteos co JOIN public.detalle_costos dc ON dc.id=co.detalle_costo_id
        WHERE dc.costo_id=v.costo_id AND co.numero_conteo=3 AND co.auditor_id=v_uid)
      AND NOT EXISTS(SELECT 1 FROM public.costo_apoyo_sesiones s
        WHERE s.costo_id=v.costo_id AND s.numero_conteo=3 AND v_uid IN(s.usuario_1,s.usuario_2))
      AND NOT EXISTS(SELECT 1 FROM public.no_manifestado_reconteos r JOIN public.no_manifestados nm ON nm.id=r.no_manifestado_id
        WHERE nm.costo_id=v.costo_id AND r.numero_conteo=3 AND r.auditor_id=v_uid) AS usuario_habilitado
    FROM public.costo_validaciones_apoyo v
  )
  SELECT v.costo_id,v.estado,v.resultado,v.solicitante_id=v_uid,
    CASE WHEN v.estado='solicitada' THEN v.usuario_habilitado AND (v.validador_id IS NULL OR v.validador_id=v_uid)
      ELSE v.validador_id=v_uid END
  FROM validaciones v
  WHERE (v.estado='solicitada' AND (v.solicitante_id=v_uid OR
      (v.usuario_habilitado AND (v.validador_id IS NULL OR v.validador_id=v_uid))))
    OR (v.estado='completada' AND (v_rol='admin' OR v.solicitante_id=v_uid OR v.validador_id=v_uid
      OR EXISTS(SELECT 1 FROM public.costo_apoyo_parejas p WHERE p.costo_id=v.costo_id AND v_uid IN(p.usuario_1,p.usuario_2))));
END;$function$;

CREATE OR REPLACE FUNCTION public.resumen_validacion_apoyo_admin(p_costo_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_s public.costo_validaciones_apoyo%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role='admin') THEN
    RAISE EXCEPTION 'Solo un administrador puede consultar la validación.';
  END IF;
  SELECT * INTO v_s FROM public.costo_validaciones_apoyo WHERE costo_id=p_costo_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('costo_id',v_s.costo_id,'estado',v_s.estado,'resultado',v_s.resultado,
    'solicitante_id',v_s.solicitante_id,'validador_id',v_s.validador_id,'solicitada_en',v_s.solicitada_en,
    'completada_en',v_s.completada_en,
    'lineas',COALESCE((SELECT jsonb_agg(jsonb_build_object('detalle_costo_id',l.detalle_costo_id,
      'cantidad_total',l.cantidad_total,'factor',l.factor,'cantidad_final',l.cantidad_final,
      'resultado',l.resultado,'auditor_id',l.auditor_id) ORDER BY l.detalle_costo_id)
      FROM public.costo_validacion_apoyo_lineas l WHERE l.costo_id=p_costo_id),'[]'::jsonb),
    'no_manifestados',COALESCE((SELECT jsonb_agg(jsonb_build_object('no_manifestado_id',l.no_manifestado_id,
      'cantidad_conteo_3',l.cantidad_conteo_3,'cantidad_validada',l.cantidad_validada,
      'resultado',l.resultado,'auditor_id',l.auditor_id,'sku',nm.sku) ORDER BY nm.id)
      FROM public.costo_validacion_apoyo_no_manifestados l
      JOIN public.no_manifestados nm ON nm.id=l.no_manifestado_id WHERE l.costo_id=p_costo_id),'[]'::jsonb));
END;$function$;

REVOKE ALL ON FUNCTION public.resumen_no_manifestados_conteo3_pendientes_admin(),
  public.obtener_no_manifestados_validacion_apoyo(bigint),
  public.guardar_validacion_apoyo_completa(bigint,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resumen_no_manifestados_conteo3_pendientes_admin(),
  public.obtener_no_manifestados_validacion_apoyo(bigint),
  public.guardar_validacion_apoyo_completa(bigint,jsonb,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.solicitar_validacion_apoyo(bigint),
  public.estados_validacion_apoyo_costos(),public.resumen_validacion_apoyo_admin(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.solicitar_validacion_apoyo(bigint),
  public.estados_validacion_apoyo_costos(),public.resumen_validacion_apoyo_admin(bigint) TO authenticated;
