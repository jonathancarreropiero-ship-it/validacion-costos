-- Vuelve a validar a los usuarios ya asignados: una validación antigua pudo
-- quedar tomada por alguien que participó en el Conteo 3.
UPDATE public.costo_validaciones_apoyo v
SET validador_id=NULL
WHERE v.estado='solicitada' AND v.validador_id IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM public.conteos co
      JOIN public.detalle_costos dc ON dc.id=co.detalle_costo_id
      WHERE dc.costo_id=v.costo_id AND co.numero_conteo=3 AND co.auditor_id=v.validador_id
    ) OR EXISTS (
      SELECT 1 FROM public.costo_apoyo_sesiones s
      WHERE s.costo_id=v.costo_id AND s.numero_conteo=3
        AND (s.usuario_1=v.validador_id OR s.usuario_2=v.validador_id)
    )
  );

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
  WITH validaciones AS (
    SELECT v.*,
      NOT EXISTS(
        SELECT 1 FROM public.conteos co
        JOIN public.detalle_costos dc ON dc.id=co.detalle_costo_id
        WHERE dc.costo_id=v.costo_id AND co.numero_conteo=3 AND co.auditor_id=v_uid
      ) AND NOT EXISTS(
        SELECT 1 FROM public.costo_apoyo_sesiones s
        WHERE s.costo_id=v.costo_id AND s.numero_conteo=3
          AND (s.usuario_1=v_uid OR s.usuario_2=v_uid)
      ) AS usuario_habilitado
    FROM public.costo_validaciones_apoyo v
  )
  SELECT v.costo_id,v.estado,v.resultado,v.solicitante_id=v_uid,
    CASE WHEN v.estado='solicitada'
      THEN v.usuario_habilitado AND (v.validador_id IS NULL OR v.validador_id=v_uid)
      ELSE v.validador_id=v_uid
    END
  FROM validaciones v
  WHERE (v.estado='solicitada' AND (
      v.solicitante_id=v_uid OR
      (v.usuario_habilitado AND (v.validador_id IS NULL OR v.validador_id=v_uid))
    )) OR (v.estado='completada' AND (
      v_rol='admin' OR v.solicitante_id=v_uid OR v.validador_id=v_uid
      OR EXISTS(
        SELECT 1 FROM public.costo_apoyo_parejas p
        WHERE p.costo_id=v.costo_id AND v_uid IN(p.usuario_1,p.usuario_2)
      )
    ));
END;$function$;

REVOKE ALL ON FUNCTION public.estados_validacion_apoyo_costos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estados_validacion_apoyo_costos() TO authenticated;
