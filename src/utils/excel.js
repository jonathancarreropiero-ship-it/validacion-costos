export async function leerExcel(file) {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()

  const workbook = XLSX.read(buffer, {
    type: 'array'
  })

  const primeraHoja =
    workbook.Sheets[workbook.SheetNames[0]]

  if (!primeraHoja) {
    throw new Error('El archivo Excel no contiene ninguna hoja.')
  }

  const filas = XLSX.utils.sheet_to_json(
    primeraHoja,
    {
      defval: '',
      raw: false
    }
  )

  if (!filas || filas.length === 0) {
    return []
  }

  // ==========================================
  // NORMALIZAR ENCABEZADOS
  // ==========================================

  const datosNormalizados = filas.map((fila) => {
    const obtenerValor = (...nombres) => {
      for (const nombre of nombres) {
        if (
          fila[nombre] !== undefined &&
          fila[nombre] !== null &&
          String(fila[nombre]).trim() !== ''
        ) {
          return fila[nombre]
        }
      }

      return ''
    }

    return {
      SKU: String(
        obtenerValor(
          'SKU',
          'sku',
          'Sku',
          'S.K.U',
          'Código',
          'Codigo',
          'código',
          'codigo'
        )
      ).trim(),

      Descripción: String(
        obtenerValor(
          'Descripción',
          'Descripcion',
          'descripción',
          'descripcion'
        )
      ).trim(),

      Cantidad: obtenerValor(
        'Cantidad',
        'cantidad',
        'CANTIDAD'
      ),

      UM: String(
        obtenerValor(
          'UM',
          'Um',
          'um',
          'U.M.',
          'Unidad',
          'unidad'
        )
      ).trim(),

      Ubicación: String(
        obtenerValor(
          'Ubicación',
          'Ubicacion',
          'ubicación',
          'ubicacion'
        )
      ).trim()
    }
  })

  // ==========================================
  // ELIMINAR FILAS COMPLETAMENTE VACÍAS
  // ==========================================

  return datosNormalizados.filter((fila) => {
    return (
      fila.SKU !== '' ||
      fila.Descripción !== '' ||
      fila.Cantidad !== '' ||
      fila.UM !== '' ||
      fila.Ubicación !== ''
    )
  })
}
