
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

    return {
      sku,
      descripcion,
      cantidad,
      um,
      ubicacion
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

    if (
      !Number.isFinite(cantidadFisica) ||
      cantidadFisica < 0
    ) {
      throw new Error(
        `La cantidad del SKU ${fila.sku} no es válida.`
      )
    }

    return {
      ubicacion: fila.ubicacion,
      sku: fila.sku,
      descripcion: fila.descripcion,
      um: fila.um,
      cantidad_fisica: cantidadFisica,
      conteo: [],
      cantidad: 0,
      factor: 1,
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

  const costoIds = listaCostos.map(costo => costo.id)

  // 2. Obtener IDs de detalles visibles para el auditor.
  // Para el resumen de estado basta con leer los IDs de líneas y su costo.
  // Intentar primero la tabla base permite reconstruir el resultado aunque
  // la vista de auditor no exponga filas a un segundo auditor; si la política
  // de lectura no lo permite, conservar el comportamiento actual como respaldo.
  let { data: detalles, error: errorDetalles } = await supabase
    .from('detalle_costos')
    .select('id, costo_id')
    .in('costo_id', costoIds)

  if (errorDetalles || !detalles?.length) {
    const respuestaVista = await supabase
      .from('auditor_detalle_costos')
      .select('id, costo_id')
      .in('costo_id', costoIds)

    detalles = respuestaVista.data
    errorDetalles = respuestaVista.error
  }

  if (errorDetalles) {
    console.error(
      'Error obteniendo detalles de costos:',
      errorDetalles
    )
    throw errorDetalles
  }

  // 3. Obtener conteos y resultados de las líneas.
  const detalleIds = (detalles || []).map(detalle => detalle.id)
  let conteos = []

  if (detalleIds.length > 0) {
    const {
      data,
      error: errorConteos
    } = await supabase
      .from('conteos')
      .select(`
        detalle_costo_id,
        numero_conteo,
        resultado
      `)
      .in('detalle_costo_id', detalleIds)

    if (errorConteos) {
      console.error(
        'Error consultando conteos registrados:',
        errorConteos
      )
      throw errorConteos
    }

    conteos = data || []
  }

  // 4. Relacionar cada detalle con su costo.
  const detallePorId = new Map(
    (detalles || []).map(detalle => [
      String(detalle.id),
      detalle.costo_id
    ])
  )

  // 5. Agrupar los números de conteo registrados.
  const conteosPorCosto = new Map()

  for (const conteo of conteos) {
    const costoId = detallePorId.get(
      String(conteo.detalle_costo_id)
    )

    if (costoId == null) continue

    const clave = String(costoId)

    if (!conteosPorCosto.has(clave)) {
      conteosPorCosto.set(clave, new Set())
    }

    conteosPorCosto.get(clave).add(
      Number(conteo.numero_conteo)
    )
  }

  // 6. Resumir el resultado del último conteo de cada costo.
  const resultadoPorCosto = new Map()

  for (const conteo of conteos) {
    const costoId = detallePorId.get(
      String(conteo.detalle_costo_id)
    )

    if (costoId == null) continue

    const clave = String(costoId)
    const numeroConteo = Number(conteo.numero_conteo)

    if (!resultadoPorCosto.has(clave)) {
      resultadoPorCosto.set(clave, {
        numeroConteo: 0,
        lineasConDiferencia: 0,
        lineasConformes: 0,
        lineasEvaluadas: 0
      })
    }

    const resumen = resultadoPorCosto.get(clave)

    // Si encontramos un conteo posterior, empezar su resumen.
    if (numeroConteo > resumen.numeroConteo) {
      resumen.numeroConteo = numeroConteo
      resumen.lineasConDiferencia = 0
      resumen.lineasConformes = 0
      resumen.lineasEvaluadas = 0
    }

    // Contabilizar solamente las líneas del último conteo.
    if (numeroConteo === resumen.numeroConteo) {
      resumen.lineasEvaluadas += 1
      const resultadoConteo = String(conteo.resultado || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
      if (resultadoConteo === 'diferencia' || resultadoConteo === 'no_conforme') {
        resumen.lineasConDiferencia += 1
      } else if (resultadoConteo === 'conforme') {
        resumen.lineasConformes += 1
      }
    }
  }

  // 7. Obtener bloqueos actuales.
  const {
    data: bloqueos,
    error: errorBloqueos
  } = await supabase.rpc('obtener_bloqueos_costos_auditor')

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

  // 8. Devolver costos, conteos, resultados y bloqueos.
  const costosConResultado = listaCostos.map(costo => {
    const bloqueo = mapaBloqueos.get(Number(costo.id))
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

      conteos_registrados: registrados
        ? [...registrados]
        : [],

      lineas_con_diferencia:
        resumenResultado?.lineasConDiferencia ?? 0,

      lineas_conformes:
        resumenResultado?.lineasConformes ?? 0,

      conteo_completo: Boolean(
        resumenResultado &&
        resumenResultado.lineasEvaluadas === Number(costo.lineas_count)
      ),

      numero_ultimo_conteo:
        resumenResultado?.numeroConteo ?? null,

      resultado: resumenResultado &&
        resumenResultado.lineasEvaluadas === Number(costo.lineas_count)
        && resumenResultado.lineasConformes + resumenResultado.lineasConDiferencia === Number(costo.lineas_count)
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

  const {
    data,
    error
  } = await supabase
    .from('auditor_detalle_costos')
    .select(`
      id,
      costo_id,
      sku,
      descripcion,
      um,
      ubicacion
    `)
    .eq('costo_id', costoId)
    .order('id', { ascending: true })

  if (error) {
    console.error(
      'Error obteniendo detalles del auditor:',
      error
    )
    throw error
  }

  const detalles = data || []

  if (numero === 1) {
    return detalles
  }

  const conteoAnterior = numero - 1
  const detalleIds = detalles.map(detalle => detalle.id)

  if (detalleIds.length === 0) {
    return []
  }

  const {
    data: conteosAnteriores,
    error: errorConteos
  } = await supabase
    .from('conteos')
    .select(`
      detalle_costo_id,
      numero_conteo,
      resultado
    `)
    .in('detalle_costo_id', detalleIds)
    .eq('numero_conteo', conteoAnterior)
    .eq('resultado', 'diferencia')

  if (errorConteos) {
    console.error(
      'Error obteniendo diferencias anteriores:',
      errorConteos
    )
    throw errorConteos
  }

  const idsDiferencia = new Set(
    (conteosAnteriores || []).map(
      conteo => conteo.detalle_costo_id
    )
  )

  return detalles.filter(
    detalle => idsDiferencia.has(detalle.id)
  )
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

  const {
    data: detalles,
    error: errorDetalles
  } = await supabase
    .from('auditor_detalle_costos')
    .select(`
      id,
      costo_id,
      sku,
      descripcion,
      um,
      ubicacion
    `)
    .eq('costo_id', costoId)
    .order('id', { ascending: true })

  if (errorDetalles) {
    console.error(
      'Error obteniendo detalles para resultados:',
      errorDetalles
    )
    throw errorDetalles
  }

  const listaDetalles = detalles || []

  if (listaDetalles.length === 0) {
    return []
  }

  const detalleIds = listaDetalles.map(detalle => detalle.id)

  const {
    data: conteos,
    error: errorConteos
  } = await supabase
    .from('conteos')
    .select(`
      id,
      detalle_costo_id,
      numero_conteo,
      factor,
      cantidad_total,
      cantidad_final,
      resultado,
      created_at
    `)
    .in('detalle_costo_id', detalleIds)
    .eq('numero_conteo', numero)
    .order('id', { ascending: true })

  if (errorConteos) {
    console.error(
      'Error obteniendo resultados del costo:',
      errorConteos
    )
    throw errorConteos
  }

  const mapaConteos = new Map(
    (conteos || []).map(conteo => [
      conteo.detalle_costo_id,
      conteo
    ])
  )

  return listaDetalles.map(detalle => {
    const conteo = mapaConteos.get(detalle.id)

    return {
      ...detalle,

      conteo: conteo
        ? {
            id: conteo.id,
            numeroConteo: Number(conteo.numero_conteo),
            factor: Number(conteo.factor),
            cantidadTotal: Number(conteo.cantidad_total),
            cantidadFinal: Number(conteo.cantidad_final),
            resultado: conteo.resultado,
            createdAt: conteo.created_at
          }
        : null
    }
  })
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

  const anterior = numero - 1

  const {
    data: conteo,
    error: errorConteo
  } = await supabase
    .from('conteos')
    .select(`
      id,
      numero_conteo,
      factor,
      cantidad_total,
      cantidad_final
    `)
    .eq('detalle_costo_id', detalleCostoId)
    .eq('numero_conteo', anterior)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (errorConteo) {
    console.error(
      'Error obteniendo conteo anterior:',
      errorConteo
    )
    throw errorConteo
  }

  if (!conteo) {
    return null
  }

  const {
    data: items,
    error: errorItems
  } = await supabase
    .from('conteo_items')
    .select(`
      item_numero,
      cantidad
    `)
    .eq('conteo_id', conteo.id)
    .order('item_numero', { ascending: true })

  if (errorItems) {
    console.error(
      'Error obteniendo cantidades anteriores:',
      errorItems
    )
    throw errorItems
  }

  return {
    id: conteo.id,
    numeroConteo: Number(conteo.numero_conteo),
    factor: Number(conteo.factor),
    cantidadTotal: Number(conteo.cantidad_total),
    cantidadFinal: Number(conteo.cantidad_final),

    cantidades: (items || []).map(
      item => Number(item.cantidad)
    )
  }
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

  if (!Array.isArray(detalles) || detalles.length === 0) {
    throw new Error('No hay líneas para guardar.')
  }

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
  } = await supabase.rpc('guardar_conteo_costo', {
    p_costo_id: Number(costoId),
    p_numero_conteo: numero,
    p_detalles: detallesParaGuardar
  })

  if (error) {
    console.error('Error guardando conteo completo:', error)
    throw error
  }

  const resultadoServidor = String(data?.resultado || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  const resultadoFinal = resultadoServidor === 'diferencia'
    ? 'no_conforme'
    : resultadoServidor

  // Publicar el resultado en la fila compartida del costo.
  if (resultadoFinal === 'conforme' || resultadoFinal === 'no_conforme') {
    const resultadoPersistido = resultadoFinal === 'no_conforme'
      ? 'diferencia'
      : resultadoFinal
    const { data: costoActualizado, error: errorResultado } = await supabase
      .from('costos')
      .update({ resultado: resultadoPersistido })
      .eq('id', Number(costoId))
      .select('id')
      .maybeSingle()

    if (errorResultado || !costoActualizado) {
      console.error('El conteo se guardó, pero no se pudo publicar el resultado compartido:', errorResultado)
    }
  }

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

  const {
    error
  } = await supabase
    .from('costos')
    .update({
      conteo_habilitado: numero,
      estado: 'en_proceso'
    })
    .eq('id', costoId)

  if (error) {
    console.error('Error habilitando conteo:', error)
    throw error
  }

  return true
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
  } = await supabase.rpc('obtener_detalles_costo_admin', {
    p_costo_id: costoId,
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
