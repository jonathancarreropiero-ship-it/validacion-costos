-- Apoyo para conteos compartidos. Revisar y aplicar manualmente en Supabase.
-- El emparejamiento es opcional y su limite es dos usuarios por costo.

CREATE TABLE IF NOT EXISTS public.costo_apoyo_parejas (
  costo_id bigint PRIMARY KEY REFERENCES public.costos(id) ON DELETE CASCADE,
  usuario_1 uuid NOT NULL REFERENCES auth.users(id),
  usuario_2 uuid REFERENCES auth.users(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT costo_apoyo_pareja_distinta CHECK (usuario_2 IS NULL OR usuario_2 <> usuario_1)
);

CREATE TABLE IF NOT EXISTS public.costo_apoyo_sesiones (
  costo_id bigint NOT NULL REFERENCES public.costos(id) ON DELETE CASCADE,
  numero_conteo integer NOT NULL CHECK (numero_conteo BETWEEN 1 AND 3),
  apoyo_habilitado boolean NOT NULL DEFAULT false,
  habilitado_por uuid REFERENCES auth.users(id),
  usuario_1 uuid REFERENCES auth.users(id),
  usuario_2 uuid REFERENCES auth.users(id),
  envio_1 jsonb,
  envio_2 jsonb,
  actividad_1 timestamptz,
  actividad_2 timestamptz,
  PRIMARY KEY (costo_id, numero_conteo),
  CONSTRAINT costo_apoyo_sesion_distinta CHECK (usuario_2 IS NULL OR usuario_2 <> usuario_1)
);
ALTER TABLE public.costo_apoyo_sesiones ADD COLUMN IF NOT EXISTS actividad_1 timestamptz;
ALTER TABLE public.costo_apoyo_sesiones ADD COLUMN IF NOT EXISTS actividad_2 timestamptz;

ALTER TABLE public.costo_apoyo_parejas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.costo_apoyo_sesiones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.costo_apoyo_parejas, public.costo_apoyo_sesiones FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.habilitar_apoyo_conteo(p_costo_id bigint, p_numero_conteo integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_usuario uuid := auth.uid(); v_rol text; v_habilitado integer; v_estado text; v_owner uuid; v_s public.costo_apoyo_sesiones%ROWTYPE;
BEGIN
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado.'; END IF;
  SELECT role INTO v_rol FROM public.user_roles WHERE user_id=v_usuario LIMIT 1;
  IF v_rol IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo un administrador puede habilitar apoyo.'; END IF;
  SELECT conteo_habilitado,estado,iniciado_por INTO v_habilitado,v_estado,v_owner FROM public.costos WHERE id=p_costo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El costo no existe.'; END IF;
  IF p_numero_conteo NOT BETWEEN 1 AND 3 OR p_numero_conteo<>v_habilitado THEN
    RAISE EXCEPTION 'Habilita el Conteo % antes de habilitar apoyo.',p_numero_conteo;
  END IF;
  IF v_estado='terminado' THEN RAISE EXCEPTION 'El costo está terminado.'; END IF;
  IF p_numero_conteo=1 AND v_owner IS NOT NULL THEN
    RAISE EXCEPTION 'Ya existe un usuario realizando este costo.';
  END IF;
  SELECT * INTO v_s FROM public.costo_apoyo_sesiones WHERE costo_id=p_costo_id AND numero_conteo=p_numero_conteo FOR UPDATE;
  IF FOUND AND (v_s.usuario_1 IS NOT NULL OR v_s.envio_1 IS NOT NULL OR v_s.envio_2 IS NOT NULL) THEN
    RAISE EXCEPTION 'Ya existe un usuario realizando este conteo.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.conteos co JOIN public.detalle_costos dc ON dc.id=co.detalle_costo_id
             WHERE dc.costo_id=p_costo_id AND co.numero_conteo=p_numero_conteo) THEN
    RAISE EXCEPTION 'Este conteo ya fue iniciado o guardado.';
  END IF;
  INSERT INTO public.costo_apoyo_sesiones(costo_id,numero_conteo,apoyo_habilitado,habilitado_por)
  VALUES(p_costo_id,p_numero_conteo,true,v_usuario)
  ON CONFLICT(costo_id,numero_conteo) DO UPDATE SET apoyo_habilitado=true,habilitado_por=v_usuario;
  RETURN jsonb_build_object('success',true,'apoyo_habilitado',true,'costo_id',p_costo_id,'numero_conteo',p_numero_conteo);
END;$function$;

-- Reemplaza el inicio para registrar quién abrió el conteo antes de que el
-- administrador pueda habilitar apoyo. Sin apoyo se conserva el bloqueo único.
CREATE OR REPLACE FUNCTION public.iniciar_costo(p_costo_id bigint)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_usuario uuid:=auth.uid(); v_rol text; v_estado text; v_owner uuid; v_num integer;
  v_bloqueo public.costo_bloqueos%ROWTYPE; v_s public.costo_apoyo_sesiones%ROWTYPE;
  v_par public.costo_apoyo_parejas%ROWTYPE; v_slot integer;
BEGIN
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado.'; END IF;
  SELECT role INTO v_rol FROM public.user_roles WHERE user_id=v_usuario AND role IN('admin','auditor') LIMIT 1;
  IF v_rol IS NULL THEN RAISE EXCEPTION 'No tienes permisos para iniciar este costo.'; END IF;
  SELECT estado,iniciado_por,conteo_habilitado INTO v_estado,v_owner,v_num FROM public.costos WHERE id=p_costo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró el costo solicitado.'; END IF;
  IF v_estado='terminado' THEN RAISE EXCEPTION 'Este costo está terminado. Debe reiniciarse antes de volver a auditarlo.'; END IF;
  IF v_num NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'El costo no tiene un conteo válido habilitado.'; END IF;
  SELECT * INTO v_s FROM public.costo_apoyo_sesiones WHERE costo_id=p_costo_id AND numero_conteo=v_num FOR UPDATE;

  IF NOT FOUND OR NOT v_s.apoyo_habilitado THEN
    IF v_owner IS NOT NULL AND v_owner<>v_usuario THEN RAISE EXCEPTION 'Este costo pertenece a otro usuario. Habilita apoyo antes de permitir un segundo participante.'; END IF;
    SELECT * INTO v_bloqueo FROM public.costo_bloqueos WHERE costo_id=p_costo_id FOR UPDATE;
    IF v_bloqueo.auditor_id IS NOT NULL AND v_bloqueo.auditor_id<>v_usuario THEN RAISE EXCEPTION 'Este costo está siendo trabajado por otro usuario.'; END IF;
    INSERT INTO public.costo_bloqueos(costo_id,auditor_id,ultima_actividad) VALUES(p_costo_id,v_usuario,now())
      ON CONFLICT(costo_id) DO UPDATE SET ultima_actividad=now() WHERE public.costo_bloqueos.auditor_id=v_usuario RETURNING * INTO v_bloqueo;
    IF v_bloqueo.id IS NULL THEN RAISE EXCEPTION 'No se pudo obtener el bloqueo de este costo.'; END IF;
    UPDATE public.costos SET iniciado_por=COALESCE(iniciado_por,v_usuario),estado='en_proceso' WHERE id=p_costo_id
      RETURNING iniciado_por INTO v_owner;
    INSERT INTO public.costo_apoyo_sesiones(costo_id,numero_conteo,apoyo_habilitado,usuario_1)
      VALUES(p_costo_id,v_num,false,v_usuario) ON CONFLICT(costo_id,numero_conteo) DO NOTHING;
    RETURN json_build_object('success',true,'costoId',p_costo_id,'iniciado_por',v_owner,'conteo_habilitado',v_num,'apoyo_habilitado',false,'esperando_segundo',false);
  END IF;

  -- Si el costo ya tenía dueño antes de habilitar apoyo, ese usuario ocupa
  -- la primera plaza. En todo el costo solo se podrán registrar dos UUID.
  IF v_owner IS NULL THEN
    UPDATE public.costos SET iniciado_por=v_usuario,estado='en_proceso' WHERE id=p_costo_id;
    v_owner:=v_usuario;
  END IF;
  SELECT * INTO v_par FROM public.costo_apoyo_parejas WHERE costo_id=p_costo_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.costo_apoyo_parejas(costo_id,usuario_1) VALUES(p_costo_id,v_owner) RETURNING * INTO v_par;
  END IF;
  IF v_usuario=v_par.usuario_1 THEN v_slot:=1;
  ELSIF v_usuario=v_par.usuario_2 THEN v_slot:=2;
  ELSIF v_par.usuario_2 IS NULL THEN
    UPDATE public.costo_apoyo_parejas SET usuario_2=v_usuario WHERE costo_id=p_costo_id AND usuario_2 IS NULL;
    SELECT * INTO v_par FROM public.costo_apoyo_parejas WHERE costo_id=p_costo_id;
    IF v_par.usuario_2<>v_usuario THEN RAISE EXCEPTION 'Este costo ya tiene dos usuarios autorizados.'; END IF;
    v_slot:=2;
  ELSE RAISE EXCEPTION 'Este costo ya tiene dos usuarios autorizados para apoyo.';
  END IF;
  IF v_s.usuario_1 IS NULL OR v_s.usuario_1=v_usuario THEN
    UPDATE public.costo_apoyo_sesiones SET usuario_1=COALESCE(usuario_1,v_usuario) WHERE costo_id=p_costo_id AND numero_conteo=v_num;
    v_s.usuario_1:=COALESCE(v_s.usuario_1,v_usuario);
  ELSIF v_s.usuario_2 IS NULL OR v_s.usuario_2=v_usuario THEN
    UPDATE public.costo_apoyo_sesiones SET usuario_2=COALESCE(usuario_2,v_usuario) WHERE costo_id=p_costo_id AND numero_conteo=v_num;
    v_s.usuario_2:=COALESCE(v_s.usuario_2,v_usuario);
  ELSE RAISE EXCEPTION 'Este conteo ya está ocupado por los dos usuarios autorizados.'; END IF;
  RETURN json_build_object('success',true,'costoId',p_costo_id,'iniciado_por',v_owner,'conteo_habilitado',v_num,
    'apoyo_habilitado',true,'esperando_segundo',v_s.usuario_2 IS NULL,'participante',v_slot,
    'usuario_1',v_par.usuario_1,'usuario_2',v_par.usuario_2);
END;$function$;

-- RPC de lectura: en apoyo solo expone la mitad asignada al usuario actual.
CREATE OR REPLACE FUNCTION public.obtener_lineas_conteo(p_costo_id bigint,p_numero_conteo integer)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_rol text; v_owner uuid; v_s public.costo_apoyo_sesiones%ROWTYPE; v_par public.costo_apoyo_parejas%ROWTYPE; v_slot integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado.'; END IF;
  SELECT role INTO v_rol FROM public.user_roles WHERE user_id=v_uid AND role IN('admin','auditor') LIMIT 1;
  IF v_rol IS NULL THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  SELECT * INTO v_s FROM public.costo_apoyo_sesiones WHERE costo_id=p_costo_id AND numero_conteo=p_numero_conteo;
  IF NOT FOUND OR NOT v_s.apoyo_habilitado THEN
    SELECT iniciado_por INTO v_owner FROM public.costos WHERE id=p_costo_id;
    IF v_owner IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'Este costo pertenece a otro usuario.'; END IF;
    v_slot:=0;
  ELSE
    IF v_s.usuario_1 IS NULL OR v_s.usuario_2 IS NULL THEN RAISE EXCEPTION 'Esperando que se una el segundo usuario.'; END IF;
    SELECT * INTO v_par FROM public.costo_apoyo_parejas WHERE costo_id=p_costo_id;
    IF v_uid=v_par.usuario_1 THEN v_slot:=1; ELSIF v_uid=v_par.usuario_2 THEN v_slot:=2; ELSE RAISE EXCEPTION 'No perteneces a la pareja autorizada para este costo.'; END IF;
  END IF;
  RETURN QUERY
    WITH lineas AS (
      SELECT dc.id,dc.costo_id,dc.sku,dc.descripcion,dc.um,dc.ubicacion,dc.cantidad_fisica,dc.factor,
        row_number() OVER(ORDER BY dc.id) AS posicion,
        count(*) OVER() AS total
      FROM public.detalle_costos dc
      WHERE dc.costo_id=p_costo_id AND (
        p_numero_conteo=1 OR EXISTS(
          SELECT 1 FROM public.conteos co
          WHERE co.detalle_costo_id=dc.id AND co.numero_conteo=p_numero_conteo-1 AND co.resultado='diferencia'
        )
      )
    )
    SELECT to_jsonb(x) FROM (
      SELECT dc.id,dc.costo_id,dc.sku,dc.descripcion,dc.um,dc.ubicacion,dc.cantidad_fisica,dc.factor
      FROM lineas dc
      WHERE v_slot=0
         OR (v_slot=1 AND dc.posicion<=ceil(dc.total::numeric/2))
         OR (v_slot=2 AND dc.posicion>ceil(dc.total::numeric/2))
      ORDER BY dc.id
    ) x;
END;$function$;

REVOKE ALL ON FUNCTION public.habilitar_apoyo_conteo(bigint,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.obtener_lineas_conteo(bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.habilitar_apoyo_conteo(bigint,integer),public.obtener_lineas_conteo(bigint,integer) TO authenticated;

-- Único punto de entrada para guardar. La función antigua se conserva como
-- implementación interna, pero el cliente ya no puede invocarla directamente.
CREATE OR REPLACE FUNCTION public.guardar_conteo_compartido(
  p_costo_id bigint,p_numero_conteo integer,p_detalles jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_uid uuid:=auth.uid(); v_s public.costo_apoyo_sesiones%ROWTYPE; v_owner uuid;
  v_actual jsonb; v_other jsonb; v_merged jsonb; v_result json; v_expected jsonb;
  v_ids bigint[]; v_enviados integer; v_permitidos integer; v_usuario_1 uuid; v_usuario_2 uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado.'; END IF;
  IF p_detalles IS NULL OR jsonb_typeof(p_detalles)<>'array' THEN
    RAISE EXCEPTION 'No se recibió una lista válida de líneas para guardar.';
  END IF;
  SELECT * INTO v_s FROM public.costo_apoyo_sesiones
    WHERE costo_id=p_costo_id AND numero_conteo=p_numero_conteo FOR UPDATE;
  IF NOT FOUND OR NOT v_s.apoyo_habilitado THEN
    v_result:=public.guardar_conteo_costo(p_costo_id,p_numero_conteo,p_detalles);
    IF v_result->>'resultado' IS NOT NULL THEN
      UPDATE public.costos SET resultado=CASE WHEN lower(replace(v_result->>'resultado',' ','_'))='conforme' THEN 'conforme' ELSE 'no conforme' END
        WHERE id=p_costo_id;
    END IF;
    RETURN v_result::jsonb || jsonb_build_object('esperando_segundo',false,'apoyo_habilitado',false);
  END IF;
  IF v_s.usuario_1 IS NULL OR v_s.usuario_2 IS NULL THEN RAISE EXCEPTION 'Esperando que se una el segundo usuario.'; END IF;
  IF v_uid=v_s.usuario_1 THEN v_actual:=v_s.envio_1; v_other:=v_s.envio_2;
  ELSIF v_uid=v_s.usuario_2 THEN v_actual:=v_s.envio_2; v_other:=v_s.envio_1;
  ELSE RAISE EXCEPTION 'No estás autorizado para este conteo.'; END IF;
  IF v_actual IS NOT NULL THEN RAISE EXCEPTION 'Ya enviaste tu parte de este conteo.'; END IF;

  SELECT COALESCE(jsonb_agg(x->'id'),'[]'::jsonb) INTO v_expected
  FROM public.obtener_lineas_conteo(p_costo_id,p_numero_conteo) AS x;
  SELECT array_agg((value->>'detalleCostoId')::bigint),count(*),count(DISTINCT (value->>'detalleCostoId')::bigint)
    INTO v_ids,v_enviados,v_permitidos FROM jsonb_array_elements(p_detalles);
  IF v_enviados<>v_permitidos THEN RAISE EXCEPTION 'Hay líneas duplicadas en tu envío.'; END IF;
  SELECT count(*) INTO v_permitidos FROM jsonb_array_elements(v_expected);
  IF v_enviados<>v_permitidos OR EXISTS (
    SELECT 1 FROM unnest(v_ids) id WHERE NOT (v_expected @> jsonb_build_array(id))
  ) THEN RAISE EXCEPTION 'Las líneas enviadas no coinciden con tu bloque asignado.'; END IF;

  IF v_uid=v_s.usuario_1 THEN
    UPDATE public.costo_apoyo_sesiones SET envio_1=p_detalles WHERE costo_id=p_costo_id AND numero_conteo=p_numero_conteo;
  ELSE
    UPDATE public.costo_apoyo_sesiones SET envio_2=p_detalles WHERE costo_id=p_costo_id AND numero_conteo=p_numero_conteo;
  END IF;
  IF v_other IS NULL THEN
    RETURN jsonb_build_object('success',true,'esperando_segundo',true,'apoyo_habilitado',true,
      'mensaje','Tu parte quedó guardada. Espera a que el segundo usuario termine su conteo.');
  END IF;

  SELECT envio_1,envio_2,usuario_1,usuario_2 INTO v_s.envio_1,v_s.envio_2,v_usuario_1,v_usuario_2
    FROM public.costo_apoyo_sesiones WHERE costo_id=p_costo_id AND numero_conteo=p_numero_conteo;
  v_merged:=v_s.envio_1||v_s.envio_2;
  SELECT iniciado_por INTO v_owner FROM public.costos WHERE id=p_costo_id FOR UPDATE;
  -- La función existente conserva sus validaciones completas y cálculo. Se
  -- autoriza temporalmente al segundo remitente dentro de esta transacción;
  -- inmediatamente se restaura el propietario original.
  UPDATE public.costos SET iniciado_por=v_uid WHERE id=p_costo_id;
  v_result:=public.guardar_conteo_costo(p_costo_id,p_numero_conteo,v_merged);
  UPDATE public.conteos co SET auditor_id=v_usuario_1
    FROM jsonb_array_elements(v_s.envio_1) a
    WHERE co.detalle_costo_id=(a->>'detalleCostoId')::bigint AND co.numero_conteo=p_numero_conteo;
  UPDATE public.conteos co SET auditor_id=v_usuario_2
    FROM jsonb_array_elements(v_s.envio_2) a
    WHERE co.detalle_costo_id=(a->>'detalleCostoId')::bigint AND co.numero_conteo=p_numero_conteo;
  UPDATE public.costos SET iniciado_por=v_owner WHERE id=p_costo_id;
  IF v_result->>'resultado' IS NOT NULL THEN
    UPDATE public.costos SET resultado=CASE WHEN lower(replace(v_result->>'resultado',' ','_'))='conforme' THEN 'conforme' ELSE 'no conforme' END
      WHERE id=p_costo_id;
  END IF;
  RETURN v_result::jsonb || jsonb_build_object('esperando_segundo',false,'apoyo_habilitado',true,
    'usuario_1',v_usuario_1,'usuario_2',v_usuario_2);
END;$function$;

REVOKE ALL ON FUNCTION public.guardar_conteo_costo(bigint,integer,jsonb) FROM PUBLIC,authenticated;
REVOKE ALL ON FUNCTION public.guardar_conteo_compartido(bigint,integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guardar_conteo_compartido(bigint,integer,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.estado_conteo_compartido(p_costo_id bigint,p_numero_conteo integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_s public.costo_apoyo_sesiones%ROWTYPE; v_result text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado.'; END IF;
  SELECT * INTO v_s FROM public.costo_apoyo_sesiones
  WHERE costo_id=p_costo_id AND numero_conteo=p_numero_conteo;
  IF NOT FOUND OR NOT v_s.apoyo_habilitado THEN RAISE EXCEPTION 'No hay un conteo compartido activo.'; END IF;
  IF v_uid IS DISTINCT FROM v_s.usuario_1 AND v_uid IS DISTINCT FROM v_s.usuario_2 THEN RAISE EXCEPTION 'No estás autorizado para consultar esta sesión.'; END IF;
  SELECT CASE WHEN count(*)>0 AND bool_and(co.resultado='conforme') THEN 'conforme'
              WHEN count(*)>0 THEN 'no_conforme' ELSE NULL END
    INTO v_result FROM public.conteos co JOIN public.detalle_costos dc ON dc.id=co.detalle_costo_id
    WHERE dc.costo_id=p_costo_id AND co.numero_conteo=p_numero_conteo;
  RETURN jsonb_build_object('apoyo_habilitado',true,'esperando_segundo',v_s.usuario_2 IS NULL,
    'esperando_guardado',v_s.envio_1 IS NULL OR v_s.envio_2 IS NULL,
    'completado',v_s.envio_1 IS NOT NULL AND v_s.envio_2 IS NOT NULL,
    'resultado',v_result,'usuario_1',v_s.usuario_1,'usuario_2',v_s.usuario_2);
END;$function$;
REVOKE ALL ON FUNCTION public.estado_conteo_compartido(bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estado_conteo_compartido(bigint,integer) TO authenticated;

-- Evita que un cliente lea por la vista security-definer todas las líneas
-- de inventario. Las lecturas de detalle pasan por RPCs con validación de rol.
REVOKE ALL ON public.auditor_detalle_costos FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.resumen_conteos_auditor()
RETURNS TABLE(costo_id bigint,detalle_costo_id bigint,numero_conteo integer,resultado text,created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role IN('admin','auditor')) THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;
  RETURN QUERY SELECT dc.costo_id,co.detalle_costo_id,co.numero_conteo,co.resultado,co.created_at
    FROM public.conteos co JOIN public.detalle_costos dc ON dc.id=co.detalle_costo_id
    JOIN public.costos c ON c.id=dc.costo_id
    WHERE EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role='admin')
       OR c.iniciado_por=v_uid
       OR EXISTS(SELECT 1 FROM public.costo_apoyo_parejas p WHERE p.costo_id=c.id AND v_uid IN(p.usuario_1,p.usuario_2));
END;$function$;
REVOKE ALL ON FUNCTION public.resumen_conteos_auditor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resumen_conteos_auditor() TO authenticated;

CREATE OR REPLACE FUNCTION public.obtener_conteo_anterior_seguro(p_detalle_costo_id bigint,p_numero_conteo integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_rol text; v_costo bigint; v_s public.costo_apoyo_sesiones%ROWTYPE;
        v_anterior record; v_items jsonb; v_asignado boolean;
BEGIN
  IF v_uid IS NULL OR p_numero_conteo NOT IN(2,3) THEN RAISE EXCEPTION 'Conteo no válido o sesión ausente.'; END IF;
  SELECT role INTO v_rol FROM public.user_roles WHERE user_id=v_uid LIMIT 1;
  IF v_rol NOT IN('admin','auditor') THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  SELECT costo_id INTO v_costo FROM public.detalle_costos WHERE id=p_detalle_costo_id;
  IF v_costo IS NULL THEN RAISE EXCEPTION 'La línea no existe.'; END IF;
  SELECT * INTO v_s FROM public.costo_apoyo_sesiones WHERE costo_id=v_costo AND numero_conteo=p_numero_conteo;
  IF FOUND AND v_s.apoyo_habilitado THEN
    SELECT EXISTS(SELECT 1 FROM public.obtener_lineas_conteo(v_costo,p_numero_conteo) l WHERE (l->>'id')::bigint=p_detalle_costo_id) INTO v_asignado;
    IF NOT v_asignado THEN RAISE EXCEPTION 'Esta línea no está asignada a tu bloque.'; END IF;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM public.costos c WHERE c.id=v_costo AND c.iniciado_por=v_uid) THEN
      RAISE EXCEPTION 'No eres participante de este costo.';
    END IF;
  END IF;
  SELECT co.id,co.numero_conteo,co.factor,co.cantidad_total,co.cantidad_final INTO v_anterior
    FROM public.conteos co WHERE co.detalle_costo_id=p_detalle_costo_id AND co.numero_conteo=p_numero_conteo-1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(jsonb_agg(ci.cantidad ORDER BY ci.item_numero),'[]'::jsonb) INTO v_items
    FROM public.conteo_items ci WHERE ci.conteo_id=v_anterior.id;
  RETURN jsonb_build_object('id',v_anterior.id,'numeroConteo',v_anterior.numero_conteo,
    'factor',v_anterior.factor,'cantidadTotal',v_anterior.cantidad_total,
    'cantidadFinal',v_anterior.cantidad_final,'cantidades',v_items);
END;$function$;
REVOKE ALL ON FUNCTION public.obtener_conteo_anterior_seguro(bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_conteo_anterior_seguro(bigint,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.estados_apoyo_costos()
RETURNS TABLE(costo_id bigint,numero_conteo integer,apoyo_habilitado boolean,usuarios_unidos integer,soy_participante boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role IN('admin','auditor')) THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  RETURN QUERY SELECT c.id,c.conteo_habilitado,COALESCE(s.apoyo_habilitado,false),
    (CASE WHEN p.usuario_1 IS NULL THEN 0 ELSE 1 END + CASE WHEN p.usuario_2 IS NULL THEN 0 ELSE 1 END)::integer,
    COALESCE(s.usuario_1=v_uid OR s.usuario_2=v_uid OR p.usuario_1=v_uid OR p.usuario_2=v_uid,false)
    FROM public.costos c
    LEFT JOIN public.costo_apoyo_sesiones s ON s.costo_id=c.id AND s.numero_conteo=c.conteo_habilitado
    LEFT JOIN public.costo_apoyo_parejas p ON p.costo_id=c.id
    WHERE c.conteo_habilitado BETWEEN 1 AND 3
      AND (c.estado<>'terminado' OR COALESCE(s.apoyo_habilitado,false) OR p.usuario_2 IS NOT NULL);
END;$function$;
REVOKE ALL ON FUNCTION public.estados_apoyo_costos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estados_apoyo_costos() TO authenticated;

CREATE OR REPLACE FUNCTION public.renovar_bloqueo_costo(p_costo_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_rol text; v_owner uuid; v_estado text; v_num integer; v_actualizado integer; v_s public.costo_apoyo_sesiones%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado.'; END IF;
  SELECT role INTO v_rol FROM public.user_roles WHERE user_id=v_uid AND role IN('admin','auditor') LIMIT 1;
  IF v_rol IS NULL THEN RAISE EXCEPTION 'No autorizado para renovar este bloqueo.'; END IF;
  SELECT iniciado_por,estado,conteo_habilitado INTO v_owner,v_estado,v_num FROM public.costos WHERE id=p_costo_id FOR UPDATE;
  IF NOT FOUND OR v_estado='terminado' THEN RAISE EXCEPTION 'El costo no está disponible.'; END IF;
  IF v_owner=v_uid THEN
    UPDATE public.costo_bloqueos SET ultima_actividad=now() WHERE costo_id=p_costo_id AND auditor_id=v_uid;
    GET DIAGNOSTICS v_actualizado=ROW_COUNT;
    IF v_actualizado=0 THEN RAISE EXCEPTION 'No tienes el bloqueo de este costo.'; END IF;
  ELSE
    SELECT * INTO v_s FROM public.costo_apoyo_sesiones WHERE costo_id=p_costo_id AND numero_conteo=v_num AND apoyo_habilitado FOR UPDATE;
    IF NOT FOUND OR (v_s.usuario_1 IS DISTINCT FROM v_uid AND v_s.usuario_2 IS DISTINCT FROM v_uid) THEN
      RAISE EXCEPTION 'No eres participante autorizado de este costo.';
    END IF;
    IF v_s.usuario_1=v_uid THEN
      UPDATE public.costo_apoyo_sesiones SET actividad_1=now() WHERE costo_id=p_costo_id AND numero_conteo=v_num;
    ELSE
      UPDATE public.costo_apoyo_sesiones SET actividad_2=now() WHERE costo_id=p_costo_id AND numero_conteo=v_num;
    END IF;
  END IF;
  RETURN jsonb_build_object('success',true,'renovado',true,'costo_id',p_costo_id);
END;$function$;
REVOKE ALL ON FUNCTION public.renovar_bloqueo_costo(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renovar_bloqueo_costo(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.obtener_resultados_conteo_auditor(p_costo_id bigint,p_numero_conteo integer)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_rol text;
BEGIN
  IF v_uid IS NULL OR p_numero_conteo NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Solicitud no válida.'; END IF;
  SELECT role INTO v_rol FROM public.user_roles WHERE user_id=v_uid LIMIT 1;
  IF v_rol NOT IN('admin','auditor') THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  IF v_rol<>'admin' AND NOT EXISTS(
    SELECT 1 FROM public.costos c WHERE c.id=p_costo_id AND c.iniciado_por=v_uid
  ) AND NOT EXISTS(SELECT 1 FROM public.costo_apoyo_parejas p WHERE p.costo_id=p_costo_id AND (p.usuario_1=v_uid OR p.usuario_2=v_uid)) THEN
    RAISE EXCEPTION 'No eres participante de este costo.';
  END IF;
  RETURN QUERY SELECT jsonb_build_object(
    'id',dc.id,'costo_id',dc.costo_id,'sku',dc.sku,'descripcion',dc.descripcion,'um',dc.um,'ubicacion',dc.ubicacion,
    'conteo',CASE WHEN co.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id',co.id,'numeroConteo',co.numero_conteo,'factor',co.factor,'cantidadTotal',co.cantidad_total,
      'cantidadFinal',co.cantidad_final,'resultado',co.resultado,'createdAt',co.created_at) END)
    FROM public.detalle_costos dc LEFT JOIN public.conteos co
      ON co.detalle_costo_id=dc.id AND co.numero_conteo=p_numero_conteo
    WHERE dc.costo_id=p_costo_id ORDER BY dc.id;
END;$function$;
REVOKE ALL ON FUNCTION public.obtener_resultados_conteo_auditor(bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_resultados_conteo_auditor(bigint,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.participantes_apoyo_admin()
RETURNS TABLE(costo_id bigint,usuario_1 uuid,usuario_2 uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role='admin') THEN
    RAISE EXCEPTION 'Solo un administrador puede consultar los participantes de apoyo.';
  END IF;
  RETURN QUERY SELECT p.costo_id,p.usuario_1,p.usuario_2 FROM public.costo_apoyo_parejas p;
END;$function$;
REVOKE ALL ON FUNCTION public.participantes_apoyo_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.participantes_apoyo_admin() TO authenticated;

-- Los recuentos de no manifestados se mantienen por registro original y por
-- etapa; dos auditores que cargaron el mismo SKU nunca pisan sus cantidades.
CREATE TABLE IF NOT EXISTS public.no_manifestado_reconteos (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  no_manifestado_id bigint NOT NULL REFERENCES public.no_manifestados(id) ON DELETE CASCADE,
  numero_conteo integer NOT NULL CHECK (numero_conteo IN (2,3)),
  auditor_id uuid NOT NULL REFERENCES auth.users(id),
  cantidad numeric NOT NULL CHECK (cantidad >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(no_manifestado_id,numero_conteo,auditor_id)
);
CREATE TABLE IF NOT EXISTS public.no_manifestado_reconteos_habilitados (
  costo_id bigint NOT NULL REFERENCES public.costos(id) ON DELETE CASCADE,
  sku_normalizado text NOT NULL,
  numero_conteo integer NOT NULL CHECK (numero_conteo IN (2,3)),
  habilitado_por uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(costo_id,sku_normalizado,numero_conteo)
);
ALTER TABLE public.no_manifestado_reconteos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.no_manifestado_reconteos_habilitados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.no_manifestado_reconteos,public.no_manifestado_reconteos_habilitados FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.habilitar_reconteo_no_manifestado(
  p_costo_id bigint,p_sku text,p_numero_conteo integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_sku text; v_num integer;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role='admin') THEN
    RAISE EXCEPTION 'Solo un administrador puede habilitar el recuento.';
  END IF;
  v_sku:=lower(btrim(COALESCE(p_sku,'')));
  IF v_sku='' OR p_numero_conteo NOT IN(2,3) THEN RAISE EXCEPTION 'SKU o número de conteo inválido.'; END IF;
  SELECT conteo_habilitado INTO v_num FROM public.costos WHERE id=p_costo_id AND estado='en_proceso' FOR UPDATE;
  IF NOT FOUND OR v_num<>p_numero_conteo THEN RAISE EXCEPTION 'Primero habilita el Conteo % y asegúrate de que siga activo.',p_numero_conteo; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.no_manifestados WHERE costo_id=p_costo_id AND lower(btrim(sku))=v_sku) THEN
    RAISE EXCEPTION 'No existe ese SKU no manifestado en el costo.';
  END IF;
  INSERT INTO public.no_manifestado_reconteos_habilitados(costo_id,sku_normalizado,numero_conteo,habilitado_por)
  VALUES(p_costo_id,v_sku,p_numero_conteo,v_uid)
  ON CONFLICT(costo_id,sku_normalizado,numero_conteo) DO UPDATE SET habilitado_por=v_uid,created_at=now();
  RETURN jsonb_build_object('success',true,'costo_id',p_costo_id,'sku',v_sku,'numero_conteo',p_numero_conteo);
END;$function$;

CREATE OR REPLACE FUNCTION public.listar_reconteos_no_manifestados(p_costo_id bigint,p_numero_conteo integer)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role IN('admin','auditor')) THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.costos c WHERE c.id=p_costo_id AND c.estado='en_proceso' AND c.conteo_habilitado=p_numero_conteo AND (
      c.iniciado_por=v_uid OR EXISTS(SELECT 1 FROM public.costo_apoyo_parejas p WHERE p.costo_id=c.id AND v_uid IN(p.usuario_1,p.usuario_2)))) THEN
    RAISE EXCEPTION 'No eres participante autorizado para este costo.';
  END IF;
  RETURN QUERY SELECT jsonb_build_object('id',nm.id,'sku',nm.sku,'cantidad',nm.cantidad,'observacion',nm.observacion,
    'auditor_id',nm.auditor_id,'numero_conteo',p_numero_conteo,'cantidad_reconteo',nr.cantidad,'reconteo_auditor_id',nr.auditor_id)
  FROM public.no_manifestados nm
  JOIN public.no_manifestado_reconteos_habilitados h ON h.costo_id=nm.costo_id
    AND h.sku_normalizado=lower(btrim(nm.sku)) AND h.numero_conteo=p_numero_conteo
  LEFT JOIN public.no_manifestado_reconteos nr ON nr.no_manifestado_id=nm.id AND nr.numero_conteo=p_numero_conteo
    AND nr.auditor_id=v_uid
  WHERE nm.costo_id=p_costo_id ORDER BY nm.id;
END;$function$;

CREATE OR REPLACE FUNCTION public.guardar_reconteos_no_manifestados(
  p_costo_id bigint,p_numero_conteo integer,p_detalles jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_cantidad integer; v_actualizados integer;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role IN('admin','auditor')) THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  IF p_numero_conteo NOT IN(2,3) OR p_detalles IS NULL OR jsonb_typeof(p_detalles)<>'array' THEN RAISE EXCEPTION 'Envío de recuento inválido.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.costos c WHERE c.id=p_costo_id AND c.estado='en_proceso' AND c.conteo_habilitado=p_numero_conteo AND (
      c.iniciado_por=v_uid OR EXISTS(SELECT 1 FROM public.costo_apoyo_parejas p WHERE p.costo_id=c.id AND v_uid IN(p.usuario_1,p.usuario_2)))) THEN
    RAISE EXCEPTION 'No eres participante autorizado para este costo.';
  END IF;
  SELECT count(*) INTO v_cantidad FROM jsonb_array_elements(p_detalles);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_detalles) x WHERE (x->>'id') IS NULL OR
      (x->>'cantidad') IS NULL OR (x->>'cantidad')::numeric<0) THEN RAISE EXCEPTION 'Hay cantidades de no manifestados inválidas.'; END IF;
  IF v_cantidad<>(SELECT count(DISTINCT (x->>'id')::bigint) FROM jsonb_array_elements(p_detalles) x) THEN RAISE EXCEPTION 'Hay registros duplicados.'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_detalles) x WHERE NOT EXISTS(
      SELECT 1 FROM public.no_manifestados nm JOIN public.no_manifestado_reconteos_habilitados h
        ON h.costo_id=nm.costo_id AND h.sku_normalizado=lower(btrim(nm.sku)) AND h.numero_conteo=p_numero_conteo
      WHERE nm.id=(x->>'id')::bigint AND nm.costo_id=p_costo_id)) THEN RAISE EXCEPTION 'El SKU no está habilitado para este recuento.'; END IF;
  INSERT INTO public.no_manifestado_reconteos(no_manifestado_id,numero_conteo,auditor_id,cantidad)
  SELECT (x->>'id')::bigint,p_numero_conteo,v_uid,(x->>'cantidad')::numeric FROM jsonb_array_elements(p_detalles) x
  ON CONFLICT(no_manifestado_id,numero_conteo,auditor_id) DO UPDATE SET cantidad=EXCLUDED.cantidad,created_at=now();
  GET DIAGNOSTICS v_actualizados=ROW_COUNT;
  RETURN jsonb_build_object('success',true,'guardados',v_actualizados,'numero_conteo',p_numero_conteo);
END;$function$;

CREATE OR REPLACE FUNCTION public.resumen_reconteos_no_manifestados_admin(p_costo_id bigint)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role='admin') THEN RAISE EXCEPTION 'Solo un administrador puede ver este detalle.'; END IF;
  RETURN QUERY SELECT jsonb_build_object('id',nm.id,'sku',nm.sku,'numero_conteo',h.numero_conteo,
    'habilitado',true,'cantidad_reconteo',r.cantidad,'auditor_id',r.auditor_id)
  FROM public.no_manifestado_reconteos_habilitados h
  JOIN public.no_manifestados nm ON nm.costo_id=h.costo_id AND lower(btrim(nm.sku))=h.sku_normalizado
  LEFT JOIN public.no_manifestado_reconteos r ON r.no_manifestado_id=nm.id AND r.numero_conteo=h.numero_conteo
  WHERE h.costo_id=p_costo_id ORDER BY h.numero_conteo,nm.id,r.created_at;
END;$function$;

CREATE OR REPLACE FUNCTION public.reconteos_no_manifestados_disponibles_auditor()
RETURNS TABLE(costo_id bigint,numero_conteo integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role IN('admin','auditor')) THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  RETURN QUERY SELECT DISTINCT c.id,c.conteo_habilitado
  FROM public.costos c
  JOIN public.no_manifestado_reconteos_habilitados h ON h.costo_id=c.id AND h.numero_conteo=c.conteo_habilitado
  WHERE c.estado<>'terminado' AND (c.iniciado_por=v_uid OR EXISTS(
    SELECT 1 FROM public.costo_apoyo_parejas p WHERE p.costo_id=c.id AND v_uid IN(p.usuario_1,p.usuario_2)))
    AND EXISTS(SELECT 1 FROM public.no_manifestados nm WHERE nm.costo_id=c.id AND lower(btrim(nm.sku))=h.sku_normalizado
      AND NOT EXISTS(SELECT 1 FROM public.no_manifestado_reconteos r WHERE r.no_manifestado_id=nm.id AND r.numero_conteo=h.numero_conteo AND r.auditor_id=v_uid));
END;$function$;

REVOKE ALL ON FUNCTION public.habilitar_reconteo_no_manifestado(bigint,text,integer),public.listar_reconteos_no_manifestados(bigint,integer),public.guardar_reconteos_no_manifestados(bigint,integer,jsonb),public.resumen_reconteos_no_manifestados_admin(bigint),public.reconteos_no_manifestados_disponibles_auditor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.habilitar_reconteo_no_manifestado(bigint,text,integer),public.listar_reconteos_no_manifestados(bigint,integer),public.guardar_reconteos_no_manifestados(bigint,integer,jsonb),public.resumen_reconteos_no_manifestados_admin(bigint),public.reconteos_no_manifestados_disponibles_auditor() TO authenticated;

-- Validación adicional, separada de Conteo 1/2/3. Solo puede realizarla la
-- otra persona de la pareja de apoyo ya autorizada para el costo.
CREATE TABLE IF NOT EXISTS public.costo_validaciones_apoyo (
  costo_id bigint PRIMARY KEY REFERENCES public.costos(id) ON DELETE CASCADE,
  solicitante_id uuid NOT NULL REFERENCES auth.users(id),
  validador_id uuid NOT NULL REFERENCES auth.users(id),
  estado text NOT NULL DEFAULT 'solicitada' CHECK (estado IN ('solicitada','completada')),
  resultado text CHECK (resultado IS NULL OR resultado IN ('conforme','diferencia')),
  solicitada_en timestamptz NOT NULL DEFAULT now(),
  completada_en timestamptz,
  CHECK (solicitante_id<>validador_id)
);
CREATE TABLE IF NOT EXISTS public.costo_validacion_apoyo_lineas (
  costo_id bigint NOT NULL REFERENCES public.costos(id) ON DELETE CASCADE,
  detalle_costo_id bigint NOT NULL REFERENCES public.detalle_costos(id) ON DELETE CASCADE,
  cantidad_total numeric NOT NULL CHECK (cantidad_total>=0),
  factor numeric NOT NULL CHECK (factor>0),
  cantidad_final numeric NOT NULL CHECK (cantidad_final>=0),
  resultado text NOT NULL CHECK (resultado IN ('conforme','diferencia')),
  auditor_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(costo_id,detalle_costo_id)
);
ALTER TABLE public.costo_validaciones_apoyo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.costo_validacion_apoyo_lineas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.costo_validaciones_apoyo,public.costo_validacion_apoyo_lineas FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.solicitar_validacion_apoyo(p_costo_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_par public.costo_apoyo_parejas%ROWTYPE; v_validador uuid; v_cantidad integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role IN('admin','auditor')) THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  PERFORM 1 FROM public.costos WHERE id=p_costo_id AND estado='terminado' AND conteo_habilitado=3 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La validación por apoyo requiere que el Conteo 3 haya finalizado.'; END IF;
  SELECT * INTO v_par FROM public.costo_apoyo_parejas WHERE costo_id=p_costo_id FOR UPDATE;
  IF NOT FOUND OR v_uid NOT IN(v_par.usuario_1,v_par.usuario_2) OR v_par.usuario_2 IS NULL THEN
    RAISE EXCEPTION 'La validación requiere apoyo habilitado y dos participantes autorizados.';
  END IF;
  v_validador:=CASE WHEN v_uid=v_par.usuario_1 THEN v_par.usuario_2 ELSE v_par.usuario_1 END;
  SELECT count(*) INTO v_cantidad FROM public.conteos co JOIN public.detalle_costos dc ON dc.id=co.detalle_costo_id
    WHERE dc.costo_id=p_costo_id AND co.numero_conteo=3 AND co.resultado='diferencia';
  IF v_cantidad=0 THEN RAISE EXCEPTION 'El Conteo 3 no tiene líneas pendientes de validar por apoyo.'; END IF;
  INSERT INTO public.costo_validaciones_apoyo(costo_id,solicitante_id,validador_id)
  VALUES(p_costo_id,v_uid,v_validador)
  ON CONFLICT(costo_id) DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ya hay una validación por apoyo pendiente.'; END IF;
  DELETE FROM public.costo_validacion_apoyo_lineas WHERE costo_id=p_costo_id;
  RETURN jsonb_build_object('success',true,'costo_id',p_costo_id,'solicitante_id',v_uid,'validador_id',v_validador);
END;$function$;

CREATE OR REPLACE FUNCTION public.obtener_lineas_validacion_apoyo(p_costo_id bigint)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_estado text; v_validador uuid;
BEGIN
  SELECT estado,validador_id INTO v_estado,v_validador FROM public.costo_validaciones_apoyo WHERE costo_id=p_costo_id;
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role IN('admin','auditor'))
     OR v_estado IS DISTINCT FROM 'solicitada' OR v_validador IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'No eres el usuario asignado a esta validación.'; END IF;
  RETURN QUERY SELECT jsonb_build_object('id',dc.id,'sku',dc.sku,'descripcion',dc.descripcion,'cantidad_fisica',dc.cantidad_fisica,
    'cantidad_conteo_3',co.cantidad_final,'factor',co.factor)
  FROM public.detalle_costos dc JOIN public.conteos co ON co.detalle_costo_id=dc.id AND co.numero_conteo=3 AND co.resultado='diferencia'
  WHERE dc.costo_id=p_costo_id ORDER BY dc.id;
END;$function$;

CREATE OR REPLACE FUNCTION public.guardar_validacion_apoyo(p_costo_id bigint,p_detalles jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_expected integer; v_sent integer; v_distinct integer; v_resultado text;
BEGIN
  IF v_uid IS NULL OR p_detalles IS NULL OR jsonb_typeof(p_detalles)<>'array' THEN RAISE EXCEPTION 'Envío inválido.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role IN('admin','auditor')) THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  PERFORM 1 FROM public.costo_validaciones_apoyo WHERE costo_id=p_costo_id AND estado='solicitada' AND validador_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No tienes una validación por apoyo pendiente.'; END IF;
  SELECT count(*) INTO v_expected FROM public.detalle_costos dc JOIN public.conteos co
    ON co.detalle_costo_id=dc.id AND co.numero_conteo=3 AND co.resultado='diferencia' WHERE dc.costo_id=p_costo_id;
  SELECT count(*),count(DISTINCT (x->>'id')::bigint) INTO v_sent,v_distinct FROM jsonb_array_elements(p_detalles) x;
  IF v_expected=0 OR v_sent<>v_expected OR v_distinct<>v_sent THEN RAISE EXCEPTION 'Completa exactamente todas las líneas pendientes, sin duplicados.'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_detalles) x WHERE jsonb_typeof(x->'cantidades')<>'array'
      OR jsonb_array_length(x->'cantidades')=0 OR (x->>'factor') IS NULL OR (x->>'factor')::numeric<=0
      OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(x->'cantidades') q WHERE q='' OR q::numeric<0) OR NOT EXISTS(
      SELECT 1 FROM public.detalle_costos dc JOIN public.conteos co ON co.detalle_costo_id=dc.id AND co.numero_conteo=3 AND co.resultado='diferencia'
      WHERE dc.id=(x->>'id')::bigint AND dc.costo_id=p_costo_id)) THEN RAISE EXCEPTION 'Hay una línea o cantidad inválida.'; END IF;
  INSERT INTO public.costo_validacion_apoyo_lineas(costo_id,detalle_costo_id,cantidad_total,factor,cantidad_final,resultado,auditor_id)
  SELECT p_costo_id,(x->>'id')::bigint,sum(q.cantidad),(x->>'factor')::numeric,
    sum(q.cantidad)*(x->>'factor')::numeric,
    CASE WHEN sum(q.cantidad)*(x->>'factor')::numeric=dc.cantidad_fisica THEN 'conforme' ELSE 'diferencia' END,v_uid
  FROM jsonb_array_elements(p_detalles) x
  CROSS JOIN LATERAL jsonb_array_elements_text(x->'cantidades') qv(valor)
  CROSS JOIN LATERAL (SELECT qv.valor::numeric AS cantidad) q
  JOIN public.detalle_costos dc ON dc.id=(x->>'id')::bigint
  GROUP BY (x->>'id'),(x->>'factor'),dc.cantidad_fisica
  ON CONFLICT(costo_id,detalle_costo_id) DO UPDATE SET cantidad_total=EXCLUDED.cantidad_total,factor=EXCLUDED.factor,
    cantidad_final=EXCLUDED.cantidad_final,resultado=EXCLUDED.resultado,auditor_id=EXCLUDED.auditor_id,created_at=now();
  SELECT CASE WHEN bool_and(resultado='conforme') THEN 'conforme' ELSE 'diferencia' END INTO v_resultado
    FROM public.costo_validacion_apoyo_lineas WHERE costo_id=p_costo_id;
  UPDATE public.costo_validaciones_apoyo SET estado='completada',resultado=v_resultado,completada_en=now() WHERE costo_id=p_costo_id;
  UPDATE public.costos SET resultado=CASE WHEN v_resultado='conforme' THEN 'conforme' ELSE 'no conforme' END WHERE id=p_costo_id;
  RETURN jsonb_build_object('success',true,'resultado',v_resultado,'validado_por_apoyo',true);
END;$function$;

CREATE OR REPLACE FUNCTION public.estados_validacion_apoyo_costos()
RETURNS TABLE(costo_id bigint,estado text,resultado text,soy_solicitante boolean,soy_validador boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role IN('admin','auditor')) THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  RETURN QUERY SELECT v.costo_id,v.estado,v.resultado,v.solicitante_id=v_uid,v.validador_id=v_uid
    FROM public.costo_validaciones_apoyo v JOIN public.costos c ON c.id=v.costo_id
    WHERE EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role='admin')
      OR c.iniciado_por=v_uid
      OR EXISTS(SELECT 1 FROM public.costo_apoyo_parejas p WHERE p.costo_id=v.costo_id AND v_uid IN(p.usuario_1,p.usuario_2));
END;$function$;

REVOKE ALL ON FUNCTION public.solicitar_validacion_apoyo(bigint),public.obtener_lineas_validacion_apoyo(bigint),public.guardar_validacion_apoyo(bigint,jsonb),public.estados_validacion_apoyo_costos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.solicitar_validacion_apoyo(bigint),public.obtener_lineas_validacion_apoyo(bigint),public.guardar_validacion_apoyo(bigint,jsonb),public.estados_validacion_apoyo_costos() TO authenticated;

CREATE OR REPLACE FUNCTION public.resumen_validacion_apoyo_admin(p_costo_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_s public.costo_validaciones_apoyo%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role='admin') THEN RAISE EXCEPTION 'Solo un administrador puede consultar la validación.'; END IF;
  SELECT * INTO v_s FROM public.costo_validaciones_apoyo WHERE costo_id=p_costo_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('costo_id',v_s.costo_id,'estado',v_s.estado,'resultado',v_s.resultado,
    'solicitante_id',v_s.solicitante_id,'validador_id',v_s.validador_id,'solicitada_en',v_s.solicitada_en,
    'completada_en',v_s.completada_en,'lineas',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'detalle_costo_id',l.detalle_costo_id,'cantidad_total',l.cantidad_total,'factor',l.factor,
      'cantidad_final',l.cantidad_final,'resultado',l.resultado,'auditor_id',l.auditor_id)
      ORDER BY l.detalle_costo_id) FROM public.costo_validacion_apoyo_lineas l WHERE l.costo_id=p_costo_id),'[]'::jsonb));
END;$function$;
REVOKE ALL ON FUNCTION public.resumen_validacion_apoyo_admin(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resumen_validacion_apoyo_admin(bigint) TO authenticated;

-- Al reiniciar un costo también se limpian las parejas y las sesiones de
-- apoyo, de modo que el nuevo ciclo vuelve a aplicar el bloqueo individual.
CREATE OR REPLACE FUNCTION public.reiniciar_costo(p_costo_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $function$
DECLARE v_usuario uuid:=auth.uid(); v_rol text; v_conteos_borrados integer; v_no_manifestados_borrados integer;
BEGIN
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
  SELECT role INTO v_rol FROM public.user_roles WHERE user_id=v_usuario LIMIT 1;
  IF v_rol IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo un administrador puede reiniciar un costo'; END IF;
  PERFORM 1 FROM public.costos WHERE id=p_costo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El costo no existe'; END IF;
  DELETE FROM public.no_manifestados WHERE costo_id=p_costo_id;
  GET DIAGNOSTICS v_no_manifestados_borrados=ROW_COUNT;
  DELETE FROM public.conteos WHERE detalle_costo_id IN (SELECT id FROM public.detalle_costos WHERE costo_id=p_costo_id);
  GET DIAGNOSTICS v_conteos_borrados=ROW_COUNT;
  DELETE FROM public.costo_validaciones_apoyo WHERE costo_id=p_costo_id;
  DELETE FROM public.costo_validacion_apoyo_lineas WHERE costo_id=p_costo_id;
  DELETE FROM public.costo_apoyo_sesiones WHERE costo_id=p_costo_id;
  DELETE FROM public.costo_apoyo_parejas WHERE costo_id=p_costo_id;
  DELETE FROM public.costo_bloqueos WHERE costo_id=p_costo_id;
  UPDATE public.costos SET estado='pendiente',resultado=NULL,conteo_habilitado=1,iniciado_por=NULL WHERE id=p_costo_id;
  RETURN jsonb_build_object('success',true,'costo_id',p_costo_id,'estado','pendiente','conteo_habilitado',1,
    'iniciado_por',NULL,'conteos_borrados',v_conteos_borrados,'no_manifestados_borrados',v_no_manifestados_borrados);
END;$function$;
REVOKE ALL ON FUNCTION public.reiniciar_costo(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reiniciar_costo(bigint) TO authenticated;
