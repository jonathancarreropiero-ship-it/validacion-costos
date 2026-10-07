
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


  // ----------------------------------------------------------
  // NORMALIZAR DATOS DEL EXCEL
  // ----------------------------------------------------------

  const filasNormalizadas = filas.map((fila) => {

    const sku = String(
      fila.SKU ??
      fila.sku ??
      fila.Sku ??
      ''
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
      fila.UM ??
      fila.Um ??
      fila.um ??
      ''
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


  // ----------------------------------------------------------
  // VALIDAR SKU
  // ----------------------------------------------------------

  filasNormalizadas.forEach((fila, index) => {

    if (!fila.sku) {

      throw new Error(
        `La fila ${index + 2} no tiene SKU.`
      )

    }

  })


  // ----------------------------------------------------------
  // VALIDAR DUPLICADOS DE SKU
  // ----------------------------------------------------------

  const skus = filasNormalizadas
    .map(fila => fila.sku)
    .filter(Boolean)


  const skusDuplicados = skus.filter(
    (sku, index) =>
      skus.indexOf(sku) !== index
  )


  if (skusDuplicados.length > 0) {

    const unicos = [
      ...new Set(skusDuplicados)
    ]

    throw new Error(
      `Existen SKU duplicados en el archivo: ${unicos.join(', ')}`
    )

  }


  // ----------------------------------------------------------
  // PREPARAR DETALLES
  // ----------------------------------------------------------

  const detalles = filasNormalizadas.map(
    (fila) => {

      const cantidadFisica = Number(
        fila.cantidad
      )


      if (
        !Number.isFinite(cantidadFisica) ||
        cantidadFisica < 0
      ) {

        throw new Error(
          `La cantidad del SKU ${fila.sku} no es válida.`
        )

      }


      return {

        ubicacion:
          fila.ubicacion,

        sku:
          fila.sku,

        descripcion:
          fila.descripcion,

        um:
          fila.um,

        // IMPORTANTE:
        // Se guarda en la BD.
        // NO se expone al auditor.

        cantidad_fisica:
          cantidadFisica,

        conteo:
          [],

        cantidad:
          0,

        factor:
          1,

        cantidad_final:
          0,

        comentarios:
          null,

        conteo_actual:
          1

      }

    }
  )


  // ==========================================================
  // CREAR CABECERA DEL COSTO
  // ==========================================================

  const {
    data: costo,
    error: errorCosto
  } = await supabase
    .from('costos')
    .insert({

      numero_costo:
        numero,

      estado:
        'pendiente',

      resultado:
        null,

      lineas_count:
        detalles.length,

      conteo_habilitado:
        1

    })
    .select()
    .single()


  if (errorCosto) {

    console.error(
      'Error creando costo:',
      errorCosto
    )

    throw errorCosto

  }


  // ==========================================================
  // AGREGAR COSTO_ID
  // ==========================================================

  const detallesConCosto =
    detalles.map(
      (detalle) => ({

        ...detalle,

        costo_id:
          costo.id

      })
    )


  // ==========================================================
  // INSERTAR DETALLES
  // ==========================================================

  const {
    error: errorDetalles
  } = await supabase
    .from('detalle_costos')
    .insert(
      detallesConCosto
    )


  if (errorDetalles) {

    console.error(
      'Error creando detalles:',
      errorDetalles
    )


    // Intentar eliminar cabecera
    // para evitar costo incompleto.

    await supabase
      .from('costos')
      .delete()
      .eq(
        'id',
        costo.id
      )


    throw errorDetalles

  }


  return costo

}


// ============================================================
// OBTENER COSTOS DEL AUDITOR
// ============================================================
//
// Se muestran:
//
// - pendiente
// - en_proceso
// - terminado
//
// IMPORTANTE:
//
// Los terminados aparecen en la lista,
// pero AuditorCostos.jsx debe impedir abrirlos.
//
// ============================================================

export async function obtenerCostosAuditor() {

  const {
    data,
    error
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
    .order(
      'created_at',
      {
        ascending: false
      }
    )


  if (error) {

    console.error(
      'Error obteniendo costos del auditor:',
      error
    )

    throw error

  }


  return data || []

}


// ============================================================
// OBTENER DETALLES DEL AUDITOR
// ============================================================
//
// El auditor trabaja a ciegas.
//
// NO SE CONSULTA:
//
// cantidad_fisica
//
// Tampoco se consulta ninguna diferencia numérica.
//
// ============================================================

export async function obtenerDetallesAuditor(
  costoId,
  numeroConteo = 1
) {

  if (!costoId) {

    throw new Error(
      'No se recibió el costo.'
    )

  }


  const numero =
    Number(numeroConteo)


  if (
    ![1, 2, 3].includes(numero)
  ) {

    throw new Error(
      'Número de conteo no válido.'
    )

  }


  // ----------------------------------------------------------
  // DETALLES VISIBLES
  // ----------------------------------------------------------

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
    .eq(
      'costo_id',
      costoId
    )
    .order(
      'id',
      {
        ascending: true
      }
    )


  if (error) {

    console.error(
      'Error obteniendo detalles del auditor:',
      error
    )

    throw error

  }


  const detalles =
    data || []


  // ----------------------------------------------------------
  // CONTEO 1
  // ----------------------------------------------------------

  if (numero === 1) {

    return detalles

  }


  // ----------------------------------------------------------
  // CONTEO 2 / 3
  // ----------------------------------------------------------
  //
  // Solo diferencias del conteo anterior.
  //

  const conteoAnterior =
    numero - 1


  const detalleIds =
    detalles.map(
      detalle =>
        detalle.id
    )


  if (
    detalleIds.length === 0
  ) {

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
    .in(
      'detalle_costo_id',
      detalleIds
    )
    .eq(
      'numero_conteo',
      conteoAnterior
    )
    .eq(
      'resultado',
      'diferencia'
    )


  if (errorConteos) {

    console.error(
      'Error obteniendo diferencias anteriores:',
      errorConteos
    )

    throw errorConteos

  }


  const idsDiferencia =
    new Set(
      (conteosAnteriores || []).map(
        conteo =>
          conteo.detalle_costo_id
      )
    )


  return detalles.filter(
    detalle =>
      idsDiferencia.has(
        detalle.id
      )
  )

}


// ============================================================
// OBTENER RESULTADOS DE UN COSTO
// ============================================================
//
// Se mantiene para compatibilidad.
//
// IMPORTANTE:
//
// Esta función NO consulta cantidad_fisica.
//
// Puede utilizarse para consultas históricas seguras,
// principalmente desde Admin si fuera necesario.
//
// ============================================================

export async function obtenerResultadosCostoAuditor(
  costoId,
  numeroConteo
) {

  if (!costoId) {

    throw new Error(
      'No se recibió el costo.'
    )

  }


  const numero =
    Number(numeroConteo)


  if (
    ![1, 2, 3].includes(numero)
  ) {

    throw new Error(
      'Número de conteo no válido.'
    )

  }


  // ----------------------------------------------------------
  // DETALLES VISIBLES
  // ----------------------------------------------------------

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
    .eq(
      'costo_id',
      costoId
    )
    .order(
      'id',
      {
        ascending: true
      }
    )


  if (errorDetalles) {

    console.error(
      'Error obteniendo detalles para resultados:',
      errorDetalles
    )

    throw errorDetalles

  }


  const listaDetalles =
    detalles || []


  if (
    listaDetalles.length === 0
  ) {

    return []

  }


  // ----------------------------------------------------------
  // IDS
  // ----------------------------------------------------------

  const detalleIds =
    listaDetalles.map(
      detalle =>
        detalle.id
    )


  // ----------------------------------------------------------
  // OBTENER CONTEOS
  // ----------------------------------------------------------

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
    .in(
      'detalle_costo_id',
      detalleIds
    )
    .eq(
      'numero_conteo',
      numero
    )
    .order(
      'id',
      {
        ascending: true
      }
    )


  if (errorConteos) {

    console.error(
      'Error obteniendo resultados del costo:',
      errorConteos
    )

    throw errorConteos

  }


  const mapaConteos =
    new Map(
      (conteos || []).map(
        conteo => [

          conteo.detalle_costo_id,

          conteo

        ]
      )
    )


  // ----------------------------------------------------------
  // UNIR PRODUCTO + RESULTADO
  // ----------------------------------------------------------

  return listaDetalles.map(
    detalle => {

      const conteo =
        mapaConteos.get(
          detalle.id
        )


      return {

        ...detalle,

        conteo:
          conteo
            ? {

                id:
                  conteo.id,

                numeroConteo:
                  Number(
                    conteo.numero_conteo
                  ),

                factor:
                  Number(
                    conteo.factor
                  ),

                cantidadTotal:
                  Number(
                    conteo.cantidad_total
                  ),

                cantidadFinal:
                  Number(
                    conteo.cantidad_final
                  ),

                resultado:
                  conteo.resultado,

                createdAt:
                  conteo.created_at

              }

            : null

      }

    }
  )

}


// ============================================================
// OBTENER CONTEO ANTERIOR
// ============================================================
//
// Conteo 2:
//
// carga valores del Conteo 1.
//
// Conteo 3:
//
// carga valores del Conteo 2.
//
// Los valores son EDITABLES.
//
// ============================================================

export async function obtenerConteoAnterior(
  detalleCostoId,
  numeroConteo
) {

  const numero =
    Number(numeroConteo)


  if (
    ![2, 3].includes(numero)
  ) {

    return null

  }


  const anterior =
    numero - 1


  // ----------------------------------------------------------
  // CONTEO ANTERIOR
  // ----------------------------------------------------------

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
    .eq(
      'detalle_costo_id',
      detalleCostoId
    )
    .eq(
      'numero_conteo',
      anterior
    )
    .order(
      'id',
      {
        ascending: false
      }
    )
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


  // ----------------------------------------------------------
  // CANTIDADES INDIVIDUALES
  // ----------------------------------------------------------

  const {
    data: items,
    error: errorItems
  } = await supabase
    .from('conteo_items')
    .select(`
      item_numero,
      cantidad
    `)
    .eq(
      'conteo_id',
      conteo.id
    )
    .order(
      'item_numero',
      {
        ascending: true
      }
    )


  if (errorItems) {

    console.error(
      'Error obteniendo cantidades anteriores:',
      errorItems
    )

    throw errorItems

  }


  return {

    id:
      conteo.id,

    numeroConteo:
      Number(
        conteo.numero_conteo
      ),

    factor:
      Number(
        conteo.factor
      ),

    cantidadTotal:
      Number(
        conteo.cantidad_total
      ),

    cantidadFinal:
      Number(
        conteo.cantidad_final
      ),

    cantidades:
      (items || []).map(
        item =>
          Number(
            item.cantidad
          )
      )

  }

}


// ============================================================
// VALIDAR CONTEO
// ============================================================
//
// NO GUARDA.
//
// Es solamente una validación temporal.
//
// El auditor NO recibe cantidad_fisica.
//
// ============================================================

export async function validarConteo(
  detalleCostoId,
  cantidades,
  factor
) {

  if (!detalleCostoId) {

    throw new Error(
      'No se recibió el producto.'
    )

  }


  if (
    !Array.isArray(cantidades) ||
    cantidades.length === 0
  ) {

    throw new Error(
      'Debes ingresar al menos una cantidad.'
    )

  }


  const cantidadesNumericas =
    cantidades.map(
      cantidad => {

        const numero =
          Number(cantidad)


        if (
          !Number.isFinite(numero) ||
          numero < 0
        ) {

          throw new Error(
            'Todas las cantidades deben ser números válidos mayores o iguales a cero.'
          )

        }


        return numero

      }
    )


  const factorNumerico =
    Number(factor)


  if (
    !Number.isFinite(factorNumerico) ||
    factorNumerico <= 0
  ) {

    throw new Error(
      'El factor debe ser mayor que cero.'
    )

  }


  // ----------------------------------------------------------
  // RPC
  // ----------------------------------------------------------

  const {
    data,
    error
  } = await supabase.rpc(
    'validar_conteo',
    {

      p_detalle_costo_id:
        detalleCostoId,

      p_cantidades:
        cantidadesNumericas,

      p_factor:
        factorNumerico

    }
  )


  if (error) {

    console.error(
      'Error validando conteo:',
      error
    )

    throw error

  }


  return {

    cantidadTotal:
      Number(
        data?.cantidadTotal ?? 0
      ),

    cantidadFinal:
      Number(
        data?.cantidadFinal ?? 0
      ),

    resultado:
      data?.resultado ?? null

  }

}


// ============================================================
// GUARDAR TODO EL CONTEO DEL COSTO
// ============================================================
//
// ESTA ES LA FUNCIÓN PRINCIPAL.
//
// El frontend NO compara cantidad_fisica.
//
// PostgreSQL:
//
// - valida
// - compara
// - guarda conteos
// - guarda conteo_items
// - determina resultado por línea
// - determina resultado general
// - cierra el costo
//
// ============================================================

export async function guardarConteoCosto(
  costoId,
  numeroConteo,
  detalles
) {

  if (!costoId) {

    throw new Error(
      'No se recibió el costo.'
    )

  }


  const numero =
    Number(numeroConteo)


  if (
    ![1, 2, 3].includes(numero)
  ) {

    throw new Error(
      'Número de conteo no válido.'
    )

  }


  if (
    !Array.isArray(detalles) ||
    detalles.length === 0
  ) {

    throw new Error(
      'No hay líneas para guardar.'
    )

  }


  // ----------------------------------------------------------
  // PREPARAR DETALLES
  // ----------------------------------------------------------

  const detallesParaGuardar =
    detalles.map(
      detalle => {

        const detalleCostoId =
          Number(
            detalle.detalleCostoId ??
            detalle.id
          )


        if (
          !Number.isFinite(
            detalleCostoId
          )
        ) {

          throw new Error(
            'Una de las líneas no tiene un ID válido.'
          )

        }


        if (
          !Array.isArray(
            detalle.cantidades
          ) ||
          detalle.cantidades.length === 0
        ) {

          throw new Error(
            `El SKU ${detalle.sku ?? detalleCostoId} no tiene cantidades ingresadas.`
          )

        }


        const cantidades =
          detalle.cantidades.map(
            cantidad => {

              const numeroCantidad =
                Number(cantidad)


              if (
                !Number.isFinite(
                  numeroCantidad
                ) ||
                numeroCantidad < 0
              ) {

                throw new Error(
                  `El SKU ${detalle.sku ?? detalleCostoId} tiene una cantidad inválida.`
                )

              }


              return numeroCantidad

            }
          )


        const factor =
          Number(
            detalle.factor
          )


        if (
          !Number.isFinite(factor) ||
          factor <= 0
        ) {

          throw new Error(
            `El factor del SKU ${detalle.sku ?? detalleCostoId} debe ser mayor que cero.`
          )

        }


        return {

          detalleCostoId,

          cantidades,

          factor

        }

      }
    )


  // ----------------------------------------------------------
  // RPC ATÓMICO
  // ----------------------------------------------------------

  const {
    data,
    error
  } = await supabase.rpc(
    'guardar_conteo_costo',
    {

      p_costo_id:
        Number(costoId),

      p_numero_conteo:
        numero,

      p_detalles:
        detallesParaGuardar

    }
  )


  if (error) {

    console.error(
      'Error guardando conteo completo:',
      error
    )

    throw error

  }


  // ----------------------------------------------------------
  // RESPUESTA
  // ----------------------------------------------------------

  return {

    costoId:
      Number(
        data?.costoId ??
        costoId
      ),

    numeroConteo:
      Number(
        data?.numeroConteo ??
        numero
      ),

    totalLineas:
      Number(
        data?.totalLineas ??
        0
      ),

    lineasConformes:
      Number(
        data?.lineasConformes ??
        0
      ),

    lineasDiferencia:
      Number(
        data?.lineasDiferencia ??
        0
      ),

    resultado:
      data?.resultado ??
      null,

    estado:
      data?.estado ??
      'terminado'

  }

}


// ============================================================
// REGISTRAR CONTEO INDIVIDUAL — LEGACY
// ============================================================
//
// Se mantiene únicamente por compatibilidad.
//
// NO utilizar para "Guardar costo".
//
// ============================================================

export async function registrarConteo(
  detalleCostoId,
  numeroConteo,
  cantidades,
  factor
) {

  if (!detalleCostoId) {

    throw new Error(
      'No se recibió el producto.'
    )

  }


  const numero =
    Number(numeroConteo)


  if (
    ![1, 2, 3].includes(numero)
  ) {

    throw new Error(
      'Número de conteo no válido.'
    )

  }


  if (
    !Array.isArray(cantidades) ||
    cantidades.length === 0
  ) {

    throw new Error(
      'Debes ingresar al menos una cantidad.'
    )

  }


  const cantidadesNumericas =
    cantidades.map(
      cantidad => {

        const numeroCantidad =
          Number(cantidad)


        if (
          !Number.isFinite(
            numeroCantidad
          ) ||
          numeroCantidad < 0
        ) {

          throw new Error(
            'Las cantidades no son válidas.'
          )

        }


        return numeroCantidad

      }
    )


  const factorNumerico =
    Number(factor)


  if (
    !Number.isFinite(factorNumerico) ||
    factorNumerico <= 0
  ) {

    throw new Error(
      'El factor debe ser mayor que cero.'
    )

  }


  const {
    data,
    error
  } = await supabase.rpc(
    'registrar_conteo',
    {

      p_detalle_costo_id:
        detalleCostoId,

      p_numero_conteo:
        numero,

      p_cantidades:
        cantidadesNumericas,

      p_factor:
        factorNumerico

    }
  )


  if (error) {

    console.error(
      'Error registrando conteo:',
      error
    )

    throw error

  }


  return {

    id:
      data?.id,

    numeroConteo:
      Number(
        data?.numeroConteo
      ),

    cantidadTotal:
      Number(
        data?.cantidadTotal ??
        0
      ),

    cantidadFinal:
      Number(
        data?.cantidadFinal ??
        0
      ),

    resultado:
      data?.resultado ??
      null

  }

}


// ============================================================
// HABILITAR CONTEO
// ============================================================
//
// Admin habilita Conteo 2 o Conteo 3.
//
// ============================================================

export async function habilitarConteo(
  costoId,
  numeroConteo
) {

  const numero =
    Number(numeroConteo)


  if (
    ![1, 2, 3].includes(numero)
  ) {

    throw new Error(
      'Número de conteo no válido.'
    )

  }


  if (!costoId) {

    throw new Error(
      'No se recibió el costo.'
    )

  }


  const {
    error
  } = await supabase
    .from('costos')
    .update({

      conteo_habilitado:
        numero,

      estado:
        'en_proceso'

    })
    .eq(
      'id',
      costoId
    )


  if (error) {

    console.error(
      'Error habilitando conteo:',
      error
    )

    throw error

  }


  return true

}


// ============================================================
// GUARDAR CONTEO LEGACY
// ============================================================
//
// Se conserva para no romper componentes antiguos.
//
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
//
// El servidor determina si el costo está libre o pertenece
// a otro auditor.
//
// Si ya pertenece al mismo auditor, se permite continuar.
//
// ============================================================

export async function adquirirBloqueoCosto(costoId) {

  if (!costoId) {

    throw new Error(
      'No se recibió el costo.'
    )

  }


  const {
    data,
    error
  } = await supabase.rpc(
    'adquirir_bloqueo_costo',
    {
      p_costo_id:
        Number(costoId)
    }
  )


  if (error) {

    console.error(
      'Error adquiriendo bloqueo del costo:',
      error
    )

    throw error

  }


  return data

}


// ============================================================
// RENOVAR BLOQUEO DEL COSTO
// ============================================================
//
// Actualiza la última actividad del auditor.
//
// IMPORTANTE:
//
// Esto NO libera ni transfiere el bloqueo.
// Solo demuestra que el auditor continúa trabajando.
//
// ============================================================

export async function renovarBloqueoCosto(costoId) {

  if (!costoId) {

    throw new Error(
      'No se recibió el costo.'
    )

  }


  const {
    data,
    error
  } = await supabase.rpc(
    'renovar_bloqueo_costo',
    {
      p_costo_id:
        Number(costoId)
    }
  )


  if (error) {

    console.error(
      'Error renovando bloqueo del costo:',
      error
    )

    throw error

  }


  return data

}


// ============================================================
// REINICIAR COSTO
// ============================================================
//
// SOLO ADMIN.
//
// El servidor:
// - elimina conteos
// - elimina no manifestados
// - elimina bloqueo
// - vuelve a pendiente
// - habilita Conteo 1
//
// ============================================================

export async function reiniciarCosto(costoId) {

  if (!costoId) {

    throw new Error(
      'No se recibió el costo.'
    )

  }


  const {
    data,
    error
  } = await supabase.rpc(
    'reiniciar_costo',
    {
      p_costo_id:
        Number(costoId)
    }
  )


  if (error) {

    console.error(
      'Error reiniciando costo:',
      error
    )

    throw error

  }


  return data

}

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

  const { data, error } = await supabase.rpc(
    'obtener_detalles_costo_admin',
    {
      p_costo_id: costoId,
      p_numero_conteo: numero
    }
  )

  if (error) {
    console.error(
      'Error obteniendo detalles del costo para admin:',
      error
    )

    throw error
  }

  return data ?? []
}