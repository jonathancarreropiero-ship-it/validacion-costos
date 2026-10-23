-- Recalcula la completitud usando una sola fila vigente por SKU/conteo.
-- Conteos anteriores pueden tener filas duplicadas por reintentos; esas filas
-- no deben hacer que el conteo final aparezca incompleto.
CREATE OR REPLACE FUNCTION public.habilitar_conteo_seguro(
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
  v_rol text;
  v_numero_actual integer;
  v_estado text;
  v_esperadas integer := 0;
  v_guardadas integer := 0;
  v_resultados integer := 0;
  v_diferencias integer := 0;
  v_s public.costo_apoyo_sesiones%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  SELECT role INTO v_rol
  FROM public.user_roles
  WHERE user_id = v_uid
  LIMIT 1;

  IF v_rol IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo un administrador puede habilitar el siguiente conteo.';
  END IF;

  SELECT conteo_habilitado, estado
  INTO v_numero_actual, v_estado
  FROM public.costos
  WHERE id = p_costo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El costo no existe.';
  END IF;

  IF v_estado = 'terminado' THEN
    RAISE EXCEPTION 'El costo está terminado.';
  END IF;

  IF p_numero_conteo NOT IN (2, 3) OR p_numero_conteo <> v_numero_actual + 1 THEN
    RAISE EXCEPTION 'El número de conteo solicitado no es el siguiente habilitable.';
  END IF;

  SELECT * INTO v_s
  FROM public.costo_apoyo_sesiones
  WHERE costo_id = p_costo_id AND numero_conteo = v_numero_actual
  FOR UPDATE;

  IF FOUND AND v_s.apoyo_habilitado
    AND (v_s.envio_1 IS NULL OR v_s.envio_2 IS NULL) THEN
    RAISE EXCEPTION 'Espera a que todos los usuarios guarden su bloque antes de habilitar el siguiente conteo.';
  END IF;

  -- Serializa el cambio del conteo después de bloquear la sesión compartida.
  SELECT conteo_habilitado, estado
  INTO v_numero_actual, v_estado
  FROM public.costos
  WHERE id = p_costo_id
  FOR UPDATE;

  IF NOT FOUND OR v_estado = 'terminado' THEN
    RAISE EXCEPTION 'El costo no está disponible.';
  END IF;

  IF p_numero_conteo <> v_numero_actual + 1 THEN
    RAISE EXCEPTION 'El número de conteo solicitado ya no es el siguiente habilitable.';
  END IF;

  -- Para cada línea toma el resultado vigente. Los reintentos o registros
  -- históricos duplicados no inflan el número de líneas guardadas.
  WITH resultados_anteriores AS (
    SELECT DISTINCT ON (co.detalle_costo_id)
      co.detalle_costo_id,
      co.resultado
    FROM public.conteos co
    JOIN public.detalle_costos dc ON dc.id = co.detalle_costo_id
    WHERE dc.costo_id = p_costo_id
      AND co.numero_conteo = v_numero_actual
    ORDER BY co.detalle_costo_id, co.created_at DESC NULLS LAST, co.id DESC
  ), esperadas AS (
    SELECT dc.id
    FROM public.detalle_costos dc
    LEFT JOIN resultados_anteriores anterior ON anterior.detalle_costo_id = dc.id
    WHERE dc.costo_id = p_costo_id
      AND (v_numero_actual = 1 OR anterior.resultado = 'diferencia')
  ), resultados_actuales AS (
    SELECT DISTINCT ON (co.detalle_costo_id)
      co.detalle_costo_id,
      co.resultado
    FROM public.conteos co
    JOIN public.detalle_costos dc ON dc.id = co.detalle_costo_id
    WHERE dc.costo_id = p_costo_id
      AND co.numero_conteo = v_numero_actual
    ORDER BY co.detalle_costo_id, co.created_at DESC NULLS LAST, co.id DESC
  )
  SELECT
    count(*)::integer,
    count(actual.detalle_costo_id)::integer,
    count(*) FILTER (WHERE actual.resultado IS NOT NULL)::integer,
    count(*) FILTER (WHERE actual.resultado = 'diferencia')::integer
  INTO v_esperadas, v_guardadas, v_resultados, v_diferencias
  FROM esperadas esperada
  LEFT JOIN resultados_actuales actual ON actual.detalle_costo_id = esperada.id;

  IF v_esperadas = 0 OR v_guardadas <> v_esperadas OR v_resultados <> v_esperadas THEN
    RAISE EXCEPTION 'El Conteo % todavía no está guardado por completo.', v_numero_actual;
  END IF;

  IF v_diferencias = 0 THEN
    RAISE EXCEPTION 'No existen líneas no conformes que requieran otro conteo.';
  END IF;

  UPDATE public.costos
  SET conteo_habilitado = p_numero_conteo,
      estado = 'en_proceso'
  WHERE id = p_costo_id;

  RETURN jsonb_build_object(
    'success', true,
    'costo_id', p_costo_id,
    'conteo_habilitado', p_numero_conteo,
    'lineas_esperadas', v_esperadas,
    'lineas_guardadas', v_guardadas
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.habilitar_conteo_seguro(bigint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.habilitar_conteo_seguro(bigint, integer) TO authenticated;
