-- El administrador solo puede habilitar el siguiente conteo cuando todas las
-- líneas del conteo actual quedaron registradas. En conteo compartido también
-- exige los envíos de ambos participantes.
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

  SELECT *
  INTO v_s
  FROM public.costo_apoyo_sesiones
  WHERE costo_id = p_costo_id
    AND numero_conteo = v_numero_actual
  FOR UPDATE;

  IF FOUND AND v_s.apoyo_habilitado
    AND (v_s.envio_1 IS NULL OR v_s.envio_2 IS NULL) THEN
    RAISE EXCEPTION 'Espera a que todos los usuarios guarden su bloque antes de habilitar el siguiente conteo.';
  END IF;

  -- Sigue el mismo orden de bloqueo que el guardado compartido: primero la
  -- sesión y después el costo. Así las dos operaciones se serializan sin
  -- invertir los bloqueos.
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

  SELECT count(*)::integer
  INTO v_esperadas
  FROM public.detalle_costos dc
  WHERE dc.costo_id = p_costo_id
    AND (
      v_numero_actual = 1
      OR EXISTS (
        SELECT 1
        FROM public.conteos anterior
        WHERE anterior.detalle_costo_id = dc.id
          AND anterior.numero_conteo = v_numero_actual
          AND anterior.resultado = 'diferencia'
      )
    );

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE co.resultado IS NOT NULL)::integer,
    count(*) FILTER (WHERE co.resultado = 'diferencia')::integer
  INTO v_guardadas, v_resultados, v_diferencias
  FROM public.conteos co
  JOIN public.detalle_costos dc ON dc.id = co.detalle_costo_id
  WHERE dc.costo_id = p_costo_id
    AND co.numero_conteo = v_numero_actual;

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
