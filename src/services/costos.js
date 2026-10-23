
import { supabase } from '../supabaseClient'

// ============================================================
// CREAR COSTO
// ============================================================

export async function crearCosto(numeroCosto, filas) {
  if (!numeroCosto) {
    throw new Error('Debes ingresar el número de costo.')
  }

  if (!Array.isArray(filas) || filas.length === 0) {
    throw new Error('El archivo no contiene registros.')
  }

  const numero = String(numeroCosto).trim()

  const filasNormalizadas = filas.map((fila) => {
    const sku = String(
      fila.SKU ?? fila.sku ?? fila.Sku ?? ''
    ).trim()

    const descripcion = String(
      fila.Descripción ??
      fila.Descripcion ??
      fila.descripcion ??
      ''
    ).trim()

    const cantidad = (
      fila.Cantidad ??
      fila.cantidad ??
      fila.cantidad_fisica ??
      ''
    )

    const um = String(
      fila.UM ?? fila.Um ?? fila.um ?? ''
    ).trim()

    const ubicacion = String(
      fila.Ubicación ??
      fila.Ubicacion ??
      fila.ubicacion ??
      ''
    ).trim()

    const factor = fila.Factor ?? fila.factor ?? 1

    return {
      sku,
      descripcion,
      cantidad,
      um,
      ubicacion,
      factor
    }
  })

  filasNormalizadas.forEach((fila, index) => {
    if (!fila.sku) {
      throw new Error(`La fila ${index + 2} no tiene SKU.`)
    }
  })

  const skus = filasNormalizadas
    .map(fila => fila.sku)
    .filter(Boolean)

  const skusDuplicados = skus.filter(
    (sku, index) => skus.indexOf(sku) !== index
  )

  if (skusDuplicados.length > 0) {
    const unicos = [...new Set(skusDuplicados)]

    throw new Error(
      `Existen SKU duplicados en el archivo: ${unicos.join(', ')}`
    )
  }

  const detalles = filasNormalizadas.map((fila) => {
    const cantidadFisica = Number(fila.cantidad)
    const factor = Number(fila.factor)

    if (
      !Number.isFinite(cantidadFisica) ||
      cantidadFisica < 0
    ) {
      throw new Error(
        `La cantidad "${String(fila.cantidad ?? '')}" del SKU ${fila.sku} no es válida.`
      )
    }

    if (!Number.isFinite(factor) || factor <= 0) {
      throw new Error(`El factor del SKU ${fila.sku} no es válido.`)
    }

    return {
      ubicacion: fila.ubicacion,
      sku: fila.sku,
      descripcion: fila.descripcion,
      um: fila.um,
      cantidad_fisica: cantidadFisica,
      conteo: [],
      cantidad: 0,
      factor,
      cantidad_final: 0,
      comentarios: null,
      conteo_actual: 1
    }
  })

  const {
    data: costo,
    error: errorCosto
  } = await supabase
    .from('costos')
    .insert({
      numero_costo: numero,
      estado: 'pendiente',
      resultado: null,
      lineas_count: detalles.length,
      conteo_habilitado: 1
    })
    .select()
    .single()

  if (errorCosto) {
    console.error('Error creando costo:', errorCosto)
    throw errorCosto
  }

  const detallesConCosto = detalles.map((detalle) => ({
    ...detalle,
    costo_id: costo.id
  }))

  const {
    error: errorDetalles
  } = await supabase
    .from('detalle_costos')
    .insert(detallesConCosto)

  if (errorDetalles) {
    console.error('Error creando detalles:', errorDetalles)

    await supabase
      .from('costos')
      .delete()
      .eq('id', costo.id)

    throw errorDetalles
  }

  return costo
}

// ============================================================
// OBTENER COSTOS DEL AUDITOR
// ============================================================

export async function obtenerCostosAuditor() {
  // 1. Obtener los costos.
  const {
    data: costos,
    error: errorCostos
  } = await supabase
    .from('costos')
    .select(`
      id,
      numero_costo,
      estado,
      resultado,
      lineas_count,
      conteo_habilitado,
      created_at
    `)
    .order('created_at', { ascending: false })

  if (errorCostos) {
    console.error(
      'Error obteniendo costos del auditor:',
      errorCostos
    )
    throw errorCostos
  }

  const listaCostos = costos || []

  if (listaCostos.length === 0) {
    return []
  }

  // Los builders de Supabase son thenables, pero no exponen `.catch()`.
  // Envolver la llamada en una promesa nativa conserva el fallback de bloqueos
  // si la RPC falla y evita abortar la carga completa del auditor.
  const bloqueosPromise = Promise.resolve()
    .then(() => supabase.rpc('obtener_bloqueos_costos_auditor'))
    .catch(error => ({ data: null, error }))
  const apoyosPromise = Promise.resolve()
    .then(() => supabase.rpc('estados_apoyo_costos'))
    .catch(error => ({ data: null, error }))
  const reconteosNoManifestadosPromise = Promise.resolve()
    .then(() => supabase.rpc('reconteos_no_manifestados_disponibles_auditor'))
    .catch(error => ({ data: null, error }))
  const validacionesApoyoPromise = Promise.resolve()
    .then(() => supabase.rpc('estados_validacion_apoyo_costos'))
    .catch(error => ({ data: null, error }))

  // El RPC entrega únicamente el resumen necesario para la lista, sin abrir
  // el acceso auditor a todos los registros de detalle por medio de la vista.
  const { data: conteos, error: errorConteos } = await supabase.rpc('resumen_conteos_auditor')
  if (errorConteos) throw errorConteos

  // 5. Agrupar los números de conteo registrados.
  const conteosPorCosto = new Map()

  for (const conteo of conteos) {
    const costoId = conteo.costo_id

    if (costoId == null) continue

    const clave = String(costoId)

    if (!conteosPorCosto.has(clave)) {
      conteosPorCosto.set(clave, new Set())
    }

    conteosPorCosto.get(clave).add(
      Number(conteo.numero_conteo)
    )
  }

  // 6. Resumir cada conteo. Los conteos posteriores pueden incluir solo
  // las líneas con diferencia del conteo anterior, no todas las líneas base.
  const resultadosPorConteoCosto = new Map()
  const resultadoPorCosto = new Map()

  for (const conteo of conteos) {
    const costoId = conteo.costo_id

    if (costoId == null) continue

    const clave = String(costoId)
    const numeroConteo = Number(conteo.numero_conteo)

    let resultadosPorNumero = resultadosPorConteoCosto.get(clave)
    if (!resultadosPorNumero) {
      resultadosPorNumero = new Map()
      resultadosPorConteoCosto.set(clave, resultadosPorNumero)
    }

    if (!resultadosPorNumero.has(numeroConteo)) {
      resultadosPorNumero.set(numeroConteo, {
        numeroConteo,
        lineasConDiferencia: 0,
        lineasConformes: 0,
        lineasEvaluadas: 0,
        fechaRealizado: null
      })
    }

    const resumen = resultadosPorNumero.get(numeroConteo)
    if (conteo.created_at && (!resumen.fechaRealizado || conteo.created_at > resumen.fechaRealizado)) {
      resumen.fechaRealizado = conteo.created_at
    }
    resumen.lineasEvaluadas += 1
    const resultadoConteo = String(conteo.resultado || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
    if (resultadoConteo === 'diferencia' || resultadoConteo === 'no_conforme') {
      resumen.lineasConDiferencia += 1
    } else if (resultadoConteo === 'conforme') {
      resumen.lineasConformes += 1
    }
  }

  for (const costo of listaCostos) {
    const clave = String(costo.id)
    const resultadosPorNumero = resultadosPorConteoCosto.get(clave)
    if (!resultadosPorNumero?.size) continue

    const numeroConteo = Math.max(...resultadosPorNumero.keys())
    const resumen = resultadosPorNumero.get(numeroConteo)
    const lineasEsperadas = numeroConteo === 1
      ? Number(costo.lineas_count)
      : (resultadosPorNumero.get(numeroConteo - 1)?.lineasConDiferencia ?? 0)
    resumen.completo = resumen.lineasEvaluadas > 0 &&
      resumen.lineasEvaluadas === lineasEsperadas &&
      resumen.lineasConformes + resumen.lineasConDiferencia === resumen.lineasEvaluadas
    resultadoPorCosto.set(clave, resumen)
  }

  // 7. Obtener bloqueos actuales.
  const {
    data: bloqueos,
    error: errorBloqueos
  } = await bloqueosPromise

  const { data: apoyos } = await apoyosPromise
  const { data: reconteosNoManifestados } = await reconteosNoManifestadosPromise
  const { data: validacionesApoyo } = await validacionesApoyoPromise

  if (errorBloqueos) {
    console.error(
      'Error obteniendo bloqueos de costos:',
      errorBloqueos
    )
    throw errorBloqueos
  }

  const mapaBloqueos = new Map(
    (bloqueos || []).map(bloqueo => [
      Number(bloqueo.costo_id),
      bloqueo
    ])
  )
  const mapaApoyos = new Map((apoyos || []).map(apoyo => [
    Number(apoyo.costo_id), apoyo
  ]))
  const mapaReconteosNoManifestados = new Map((reconteosNoManifestados || []).map(item => [
    Number(item.costo_id), Number(item.numero_conteo)
  ]))
  const mapaValidacionesApoyo = new Map((validacionesApoyo || []).map(item => [Number(item.costo_id), item]))

  // 8. Devolver costos, conteos, resultados y bloqueos.
  const costosConResultado = listaCostos.map(costo => {
    const bloqueo = mapaBloqueos.get(Number(costo.id))
    const apoyo = mapaApoyos.get(Number(costo.id))
    const numeroReconteoNoManifestado = mapaReconteosNoManifestados.get(Number(costo.id))
    const validacionApoyo = mapaValidacionesApoyo.get(Number(costo.id))
    const clave = String(costo.id)

    const registrados = conteosPorCosto.get(clave)
    const resumenResultado = resultadoPorCosto.get(clave)
    const resultadoPersistido = String(costo.resultado || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
    const resultadoCompartido = resultadoPersistido === 'diferencia' || resultadoPersistido === 'no_conforme'
      ? 'no_conforme'
      : resultadoPersistido === 'conforme'
        ? 'conforme'
        : null

    return {
      ...costo,

      apoyo_habilitado: Boolean(apoyo?.apoyo_habilitado && Number(apoyo.numero_conteo) === Number(costo.conteo_habilitado)),
      usuarios_apoyo_unidos: Number(apoyo?.usuarios_unidos || 0),
      soy_participante_apoyo: Boolean(apoyo?.soy_participante),
      reconteo_no_manifestado_habilitado: numeroReconteoNoManifestado || null,
      validado_por_apoyo: validacionApoyo?.estado === 'completada',
      validacion_apoyo_pendiente: validacionApoyo?.estado === 'solicitada',
      soy_solicitante_apoyo_final: Boolean(validacionApoyo?.soy_solicitante),
      soy_validador_apoyo_final: Boolean(validacionApoyo?.soy_validador),
      resultado_validacion_apoyo: validacionApoyo?.resultado || null,

      conteos_registrados: registrados
        ? [...registrados]
        : [],

      lineas_con_diferencia:
        resumenResultado?.lineasConDiferencia ?? 0,

      lineas_conformes:
        resumenResultado?.lineasConformes ?? 0,

      conteo_completo: Boolean(
        resumenResultado &&
        resumenResultado.completo
      ),

      numero_ultimo_conteo:
        resumenResultado?.numeroConteo ?? null,

      fecha_realizado:
        resumenResultado?.fechaRealizado ?? null,

      resultado: resumenResultado &&
        resumenResultado.completo
        ? (resumenResultado.lineasConDiferencia > 0 ? 'no_conforme' : 'conforme')
        : (resultadoCompartido
          ? resultadoCompartido
          : null),

      bloqueado_por_mi: Boolean(
        bloqueo?.bloqueado_por_mi
      ),

      bloqueado_por_otro: Boolean(
        bloqueo?.bloqueado_por_otro
      ),

      ultima_actividad:
        bloqueo?.ultima_actividad ?? null
    }
  })

  return costosConResultado
}

// ============================================================
// OBTENER DETALLES DEL AUDITOR
// ============================================================

export async function obtenerDetallesAuditor(
  costoId,
  numeroConteo = 1
) {
  if (!costoId) {
    throw new Error('No se recibió el costo.')
  }

  const numero = Number(numeroConteo)

  if (![1, 2, 3].includes(numero)) {
    throw new Error('Número de conteo no válido.')
  }

  const { data, error } = await supabase.rpc('obtener_lineas_conteo', {
    p_costo_id: Number(costoId),
    p_numero_conteo: numero
  })

  if (error) {
    console.error(
      'Error obteniendo detalles del auditor:',
      error
    )
    throw error
  }

  return data || []
}

// ============================================================
// OBTENER RESULTADOS DE UN COSTO
// ============================================================

export async function obtenerResultadosCostoAuditor(
  costoId,
  numeroConteo
) {
  if (!costoId) {
    throw new Error('No se recibió el costo.')
  }

  const numero = Number(numeroConteo)

  if (![1, 2, 3].includes(numero)) {
    throw new Error('Número de conteo no válido.')
  }

  const { data, error } = await supabase.rpc('obtener_resultados_conteo_auditor', {
    p_costo_id: Number(costoId),
    p_numero_conteo: numero
  })
  if (error) throw error
  return data || []
}

// ============================================================
// OBTENER CONTEO ANTERIOR
// ============================================================

export async function obtenerConteoAnterior(
  detalleCostoId,
  numeroConteo
) {
  const numero = Number(numeroConteo)

  if (![2, 3].includes(numero)) {
    return null
  }

  const { data, error } = await supabase.rpc('obtener_conteo_anterior_seguro', {
    p_detalle_costo_id: Number(detalleCostoId),
    p_numero_conteo: numero
  })
  if (error) throw error
  return data ? {
    id: data.id,
    numeroConteo: Number(data.numeroConteo),
    factor: Number(data.factor),
    cantidadTotal: Number(data.cantidadTotal),
    cantidadFinal: Number(data.cantidadFinal),
    cantidades: (data.cantidades || []).map(Number)
  } : null
}

// ============================================================
// VALIDAR CONTEO
// ============================================================

export async function validarConteo(
  detalleCostoId,
  cantidades,
  factor
) {
  if (!detalleCostoId) {
    throw new Error('No se recibió el producto.')
  }

  if (!Array.isArray(cantidades) || cantidades.length === 0) {
    throw new Error('Debes ingresar al menos una cantidad.')
  }

  const cantidadesNumericas = cantidades.map(cantidad => {
    const numero = Number(cantidad)

    if (!Number.isFinite(numero) || numero < 0) {
      throw new Error(
        'Todas las cantidades deben ser números válidos mayores o iguales a cero.'
      )
    }

    return numero
  })

  const factorNumerico = Number(factor)

  if (
    !Number.isFinite(factorNumerico) ||
    factorNumerico <= 0
  ) {
    throw new Error('El factor debe ser mayor que cero.')
  }

  const {
    data,
    error
  } = await supabase.rpc('validar_conteo', {
    p_detalle_costo_id: detalleCostoId,
    p_cantidades: cantidadesNumericas,
    p_factor: factorNumerico
  })

  if (error) {
    console.error('Error validando conteo:', error)
    throw error
  }

  return {
    cantidadTotal: Number(data?.cantidadTotal ?? 0),
    cantidadFinal: Number(data?.cantidadFinal ?? 0),
    resultado: data?.resultado ?? null
  }
}

// ============================================================
// GUARDAR TODO EL CONTEO DEL COSTO
// ============================================================

export async function guardarConteoCosto(
  costoId,
  numeroConteo,
  detalles
) {
  if (!costoId) {
    throw new Error('No se recibió el costo.')
  }

  const numero = Number(numeroConteo)

  if (![1, 2, 3].includes(numero)) {
    throw new Error('Número de conteo no válido.')
  }

  if (!Array.isArray(detalles)) throw new Error('El conteo no contiene una lista válida de líneas.')

  const detallesParaGuardar = detalles.map(detalle => {
    const detalleCostoId = Number(
      detalle.detalleCostoId ?? detalle.id
    )

    if (!Number.isFinite(detalleCostoId)) {
      throw new Error('Una de las líneas no tiene un ID válido.')
    }

    if (
      !Array.isArray(detalle.cantidades) ||
      detalle.cantidades.length === 0
    ) {
      throw new Error(
        `El SKU ${detalle.sku ?? detalleCostoId} no tiene cantidades ingresadas.`
      )
    }

    const cantidades = detalle.cantidades.map(cantidad => {
      const numeroCantidad = Number(cantidad)

      if (
        !Number.isFinite(numeroCantidad) ||
        numeroCantidad < 0
      ) {
        throw new Error(
          `El SKU ${detalle.sku ?? detalleCostoId} tiene una cantidad inválida.`
        )
      }

      return numeroCantidad
    })

    const factor = Number(detalle.factor)

    if (!Number.isFinite(factor) || factor <= 0) {
      throw new Error(
        `El factor del SKU ${detalle.sku ?? detalleCostoId} debe ser mayor que cero.`
      )
    }

    return {
      detalleCostoId,
      cantidades,
      factor
    }
  })

  const {
    data,
    error
  } = await supabase.rpc('guardar_conteo_compartido', {
    p_costo_id: Number(costoId),
    p_numero_conteo: numero,
    p_detalles: detallesParaGuardar
  })

  if (error) {
    console.error('Error guardando conteo completo:', error)
    throw error
  }

  if (data?.esperando_segundo) {
    return {
      ...data,
      esperando_segundo: true,
      apoyo_habilitado: true
    }
  }

  const resultadoServidor = String(data?.resultado || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  const resultadoFinal = resultadoServidor === 'diferencia'
    ? 'no_conforme'
    : resultadoServidor

  return {
    costoId: Number(data?.costoId ?? costoId),
    numeroConteo: Number(data?.numeroConteo ?? numero),
    totalLineas: Number(data?.totalLineas ?? 0),
    lineasConformes: Number(data?.lineasConformes ?? 0),
    lineasDiferencia: Number(data?.lineasDiferencia ?? 0),
    resultado: (resultadoFinal || data?.resultado) ?? null,
    estado: data?.estado ?? 'terminado'
  }
}

// ============================================================
// REGISTRAR CONTEO INDIVIDUAL — LEGACY
// ============================================================

export async function registrarConteo(
  detalleCostoId,
  numeroConteo,
  cantidades,
  factor
) {
  if (!detalleCostoId) {
    throw new Error('No se recibió el producto.')
  }

  const numero = Number(numeroConteo)

  if (![1, 2, 3].includes(numero)) {
    throw new Error('Número de conteo no válido.')
  }

  if (!Array.isArray(cantidades) || cantidades.length === 0) {
    throw new Error('Debes ingresar al menos una cantidad.')
  }

  const cantidadesNumericas = cantidades.map(cantidad => {
    const numeroCantidad = Number(cantidad)

    if (!Number.isFinite(numeroCantidad) || numeroCantidad < 0) {
      throw new Error('Las cantidades no son válidas.')
    }

    return numeroCantidad
  })

  const factorNumerico = Number(factor)

  if (
    !Number.isFinite(factorNumerico) ||
    factorNumerico <= 0
  ) {
    throw new Error('El factor debe ser mayor que cero.')
  }

  const {
    data,
    error
  } = await supabase.rpc('registrar_conteo', {
    p_detalle_costo_id: detalleCostoId,
    p_numero_conteo: numero,
    p_cantidades: cantidadesNumericas,
    p_factor: factorNumerico
  })

  if (error) {
    console.error('Error registrando conteo:', error)
    throw error
  }

  return {
    id: data?.id,
    numeroConteo: Number(data?.numeroConteo),
    cantidadTotal: Number(data?.cantidadTotal ?? 0),
    cantidadFinal: Number(data?.cantidadFinal ?? 0),
    resultado: data?.resultado ?? null
  }
}

// ============================================================
// HABILITAR CONTEO
// ============================================================

export async function habilitarConteo(
  costoId,
  numeroConteo
) {
  const numero = Number(numeroConteo)

  if (![1, 2, 3].includes(numero)) {
    throw new Error('Número de conteo no válido.')
  }

  if (!costoId) {
    throw new Error('No se recibió el costo.')
  }

  const { data, error } = await supabase.rpc('habilitar_conteo_seguro', {
    p_costo_id: Number(costoId),
    p_numero_conteo: numero
  })

  if (error) {
    console.error('Error habilitando conteo:', error)
    throw error
  }

  if (!data?.success) throw new Error('No se pudo habilitar el conteo.')
  return data
}

export async function habilitarApoyoConteo(costoId, numeroConteo) {
  const { data, error } = await supabase.rpc('habilitar_apoyo_conteo', {
    p_costo_id: Number(costoId),
    p_numero_conteo: Number(numeroConteo)
  })
  if (error) throw error
  return data
}

export async function obtenerEstadoConteoCompartido(costoId, numeroConteo) {
  const { data, error } = await supabase.rpc('estado_conteo_compartido', {
    p_costo_id: Number(costoId),
    p_numero_conteo: Number(numeroConteo)
  })
  if (error) throw error
  return data
}

// Lee el resultado desde los conteos persistidos para que ambos participantes
// calculen el mismo resumen, independientemente de quién guardó al final.
export async function obtenerResumenConteoCompartido(costoId, numeroConteo) {
  const { data, error } = await supabase.rpc('resumen_conteos_auditor')
  if (error) throw error

  const filas = (data || []).filter(fila =>
    String(fila.costo_id) === String(costoId) &&
    Number(fila.numero_conteo) === Number(numeroConteo)
  )
  const lineasConformes = filas.filter(fila =>
    String(fila.resultado || '').trim().toLowerCase() === 'conforme'
  ).length

  return {
    totalLineas: filas.length,
    lineasConformes,
    lineasDiferencia: filas.length - lineasConformes
  }
}

// ============================================================
// GUARDAR CONTEO LEGACY
// ============================================================

export async function guardarConteo({
  detalleCostoId,
  numeroConteo,
  cantidades,
  factor
}) {
  return registrarConteo(
    detalleCostoId,
    numeroConteo,
    cantidades,
    factor
  )
}

// ============================================================
// ADQUIRIR BLOQUEO DEL COSTO
// ============================================================

export async function adquirirBloqueoCosto(costoId) {
  if (!costoId) {
    throw new Error('No se recibió el costo.')
  }

  const {
    data,
    error
  } = await supabase.rpc('adquirir_bloqueo_costo', {
    p_costo_id: Number(costoId)
  })

  if (error) {
    console.error('Error adquiriendo bloqueo del costo:', error)
    throw error
  }

  return data
}

// ============================================================
// INICIAR COSTO
// ============================================================

export async function iniciarCosto(costoId) {
  if (!costoId) {
    throw new Error('No se recibió el costo.')
  }

  const {
    data,
    error
  } = await supabase.rpc('iniciar_costo', {
    p_costo_id: Number(costoId)
  })

  if (error) {
    console.error('Error iniciando el costo:', error)
    throw error
  }

  if (!data?.success) {
    throw new Error('No se pudo iniciar el costo.')
  }

  return data
}

// ============================================================
// RENOVAR BLOQUEO DEL COSTO
// ============================================================

export async function renovarBloqueoCosto(costoId) {
  if (!costoId) {
    throw new Error('No se recibió el costo.')
  }

  const {
    data,
    error
  } = await supabase.rpc('renovar_bloqueo_costo', {
    p_costo_id: Number(costoId)
  })

  if (error) {
    console.error('Error renovando bloqueo del costo:', error)
    throw error
  }

  return data
}

// ============================================================
// REINICIAR COSTO
// ============================================================

export async function reiniciarCosto(costoId) {
  if (!costoId) {
    throw new Error('No se recibió el costo.')
  }

  const {
    data,
    error
  } = await supabase.rpc('reiniciar_costo', {
    p_costo_id: Number(costoId)
  })

  if (error) {
    console.error('Error reiniciando costo:', error)
    throw error
  }

  return data
}

// ============================================================
// OBTENER DETALLES DEL COSTO PARA ADMIN
// ============================================================

export async function obtenerDetallesCostoAdmin(
  costoId,
  numeroConteo = 1
) {
  if (!costoId) {
    throw new Error('No se recibió el costo.')
  }

  const numero = Number(numeroConteo)

  if (![1, 2, 3].includes(numero)) {
    throw new Error('Número de conteo no válido.')
  }

  const {
    data,
    error
  } = await supabase.rpc('obtener_lineas_conteo', {
    p_costo_id: Number(costoId),
    p_numero_conteo: numero
  })

  if (error) {
    console.error(
      'Error obteniendo detalles del costo para admin:',
      error
    )
    throw error
  }

  return data ?? []
}
