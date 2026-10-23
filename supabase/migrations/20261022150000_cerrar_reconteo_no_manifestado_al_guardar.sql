-- El reconteo independiente es compartido: al guardar cualquiera de los
-- participantes, se cierra para el otro y también se rechazan formularios viejos.

CREATE OR REPLACE FUNCTION public.listar_reconteos_no_manifestados(
  p_costo_id bigint,
  p_numero_conteo integer
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role IN ('admin','auditor')
  ) THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.costos c
    WHERE c.id = p_costo_id
      AND c.estado = 'en_proceso'
      AND c.conteo_habilitado = p_numero_conteo
      AND (
        c.iniciado_por = v_uid
        OR EXISTS (
          SELECT 1 FROM public.costo_apoyo_parejas p
          WHERE p.costo_id = c.id AND v_uid IN (p.usuario_1,p.usuario_2)
        )
      )
  ) THEN
    RAISE EXCEPTION 'No eres participante autorizado para este costo.';
  END IF;

  -- Si una persona ya guardó el lote, no se vuelve a ofrecer al compañero.
  IF EXISTS (
    SELECT 1 FROM public.no_manifestado_reconteos r
    JOIN public.no_manifestados nm ON nm.id = r.no_manifestado_id
    WHERE nm.costo_id = p_costo_id AND r.numero_conteo = p_numero_conteo
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id',nm.id,'sku',nm.sku,'cantidad',nm.cantidad,'observacion',nm.observacion,
    'auditor_id',nm.auditor_id,'numero_conteo',p_numero_conteo,
    'cantidad_reconteo',nr.cantidad,'reconteo_auditor_id',nr.auditor_id
  )
  FROM public.no_manifestados nm
  JOIN public.no_manifestado_reconteos_habilitados h
    ON h.costo_id = nm.costo_id
    AND h.sku_normalizado = lower(btrim(nm.sku))
    AND h.numero_conteo = p_numero_conteo
  LEFT JOIN public.no_manifestado_reconteos nr
    ON nr.no_manifestado_id = nm.id AND nr.numero_conteo = p_numero_conteo
    AND nr.auditor_id = v_uid
  WHERE nm.costo_id = p_costo_id
  ORDER BY nm.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guardar_reconteos_no_manifestados(
  p_costo_id bigint,
  p_numero_conteo integer,
  p_detalles jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_cantidad integer; v_actualizados integer;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role IN ('admin','auditor')
  ) THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  IF p_numero_conteo NOT IN (2,3) OR p_detalles IS NULL OR jsonb_typeof(p_detalles) <> 'array' THEN
    RAISE EXCEPTION 'Envío de recuento inválido.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.costos c
    WHERE c.id = p_costo_id AND c.estado = 'en_proceso' AND c.conteo_habilitado = p_numero_conteo
      AND (c.iniciado_por = v_uid OR EXISTS (
        SELECT 1 FROM public.costo_apoyo_parejas p
        WHERE p.costo_id = c.id AND v_uid IN (p.usuario_1,p.usuario_2)
      ))
  ) THEN RAISE EXCEPTION 'No eres participante autorizado para este costo.'; END IF;

  -- Serializa el cierre por costo/conteo para evitar que dos sesiones guarden a la vez.
  PERFORM 1 FROM public.costos WHERE id = p_costo_id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.no_manifestado_reconteos r
    JOIN public.no_manifestados nm ON nm.id = r.no_manifestado_id
    WHERE nm.costo_id = p_costo_id AND r.numero_conteo = p_numero_conteo
  ) THEN
    RAISE EXCEPTION 'Este recuento ya fue guardado por el otro participante.';
  END IF;

  SELECT count(*) INTO v_cantidad FROM jsonb_array_elements(p_detalles);
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_detalles) x
    WHERE (x->>'id') IS NULL OR (x->>'cantidad') IS NULL OR (x->>'cantidad')::numeric < 0
  ) THEN RAISE EXCEPTION 'Hay cantidades de no manifestados inválidas.'; END IF;
  IF v_cantidad <> (SELECT count(DISTINCT (x->>'id')::bigint) FROM jsonb_array_elements(p_detalles) x) THEN
    RAISE EXCEPTION 'Hay registros duplicados.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_detalles) x
    WHERE NOT EXISTS (
      SELECT 1 FROM public.no_manifestados nm
      JOIN public.no_manifestado_reconteos_habilitados h
        ON h.costo_id = nm.costo_id AND h.sku_normalizado = lower(btrim(nm.sku))
        AND h.numero_conteo = p_numero_conteo
      WHERE nm.id = (x->>'id')::bigint AND nm.costo_id = p_costo_id
    )
  ) THEN RAISE EXCEPTION 'El SKU no está habilitado para este recuento.'; END IF;

  INSERT INTO public.no_manifestado_reconteos(no_manifestado_id,numero_conteo,auditor_id,cantidad)
  SELECT (x->>'id')::bigint,p_numero_conteo,v_uid,(x->>'cantidad')::numeric
  FROM jsonb_array_elements(p_detalles) x;
  GET DIAGNOSTICS v_actualizados = ROW_COUNT;
  RETURN jsonb_build_object('success',true,'guardados',v_actualizados,'numero_conteo',p_numero_conteo);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reconteos_no_manifestados_disponibles_auditor()
RETURNS TABLE(costo_id bigint, numero_conteo integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role IN ('admin','auditor')
  ) THEN RAISE EXCEPTION 'No autorizado.'; END IF;

  RETURN QUERY
  SELECT DISTINCT c.id,c.conteo_habilitado
  FROM public.costos c
  JOIN public.no_manifestado_reconteos_habilitados h
    ON h.costo_id = c.id AND h.numero_conteo = c.conteo_habilitado
  WHERE c.estado <> 'terminado'
    AND (c.iniciado_por = v_uid OR EXISTS (
      SELECT 1 FROM public.costo_apoyo_parejas p
      WHERE p.costo_id = c.id AND v_uid IN (p.usuario_1,p.usuario_2)
    ))
    AND EXISTS (
      SELECT 1 FROM public.no_manifestados nm
      WHERE nm.costo_id = c.id AND lower(btrim(nm.sku)) = h.sku_normalizado
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.no_manifestado_reconteos r
      JOIN public.no_manifestados nm ON nm.id = r.no_manifestado_id
      WHERE nm.costo_id = c.id AND r.numero_conteo = c.conteo_habilitado
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.listar_reconteos_no_manifestados(bigint,integer),
  public.guardar_reconteos_no_manifestados(bigint,integer,jsonb),
  public.reconteos_no_manifestados_disponibles_auditor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_reconteos_no_manifestados(bigint,integer),
  public.guardar_reconteos_no_manifestados(bigint,integer,jsonb),
  public.reconteos_no_manifestados_disponibles_auditor() TO authenticated;
