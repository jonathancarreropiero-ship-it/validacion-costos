function numeroDesdeCeldaExcel(valorCrudo, valorVisible) {
  if (typeof valorCrudo === 'number' && Number.isFinite(valorCrudo)) return valorCrudo
  const textoOriginal = String(valorVisible ?? valorCrudo ?? '').trim()
  if (!textoOriginal) return ''

  let texto = textoOriginal.replace(/[\s\u00a0]/g, '')
  const ultimaComa = texto.lastIndexOf(',')
  const ultimoPunto = texto.lastIndexOf('.')

  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    texto = ultimaComa > ultimoPunto
      ? texto.replace(/\./g, '').replace(',', '.')
      : texto.replace(/,/g, '')
  } else if (ultimaComa >= 0) {
    texto = /^-?\d{1,3}(,\d{3})+$/.test(texto)
      ? texto.replace(/,/g, '')
      : texto.replace(',', '.')
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(texto)) {
    texto = texto.replace(/\./g, '')
  }

  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : textoOriginal
}

export async function leerExcel(file) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: 'array',
    cellDates: false
  })

  const primeraHoja = workbook.Sheets[workbook.SheetNames[0]]
  if (!primeraHoja) throw new Error('El archivo Excel no contiene ninguna hoja.')

  const filas = XLSX.utils.sheet_to_json(primeraHoja, {
    defval: '',
    raw: false,
    blankrows: false
  })
  const filasCrudas = XLSX.utils.sheet_to_json(primeraHoja, {
    defval: '',
    raw: true,
    blankrows: false
  })
  if (!filas.length) throw new Error('El archivo Excel no contiene registros.')

  const normalizarEncabezado = valor => String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

  const aliases = {
    ficha: ['ficha', 'numerocosto', 'costo'],
    sku: ['sku', 'codigo', 'codigoproducto'],
    descripcion: ['descripcion', 'descrip'],
    cantidad: ['cantidad', 'cantidadlogica', 'stock'],
    um: ['um', 'unidad', 'unidadmedida'],
    ubicacion: ['ubicacion', 'localizacion'],
    factor: ['factor', 'conversion']
  }

  const encabezados = new Map(
    Object.keys(filas[0] || {}).map(encabezado => [normalizarEncabezado(encabezado), encabezado])
  )
  const obtenerValor = (fila, campo) => {
    for (const alias of aliases[campo]) {
      const encabezado = encabezados.get(normalizarEncabezado(alias))
      const valor = encabezado ? fila[encabezado] : ''
      if (valor !== undefined && valor !== null && String(valor).trim() !== '') return valor
    }
    return ''
  }

  if (!encabezados.has('sku') && !encabezados.has('codigo') && !encabezados.has('codigoproducto')) {
    throw new Error('No se encontró la columna SKU en la plantilla (SKU o Código).')
  }

  const grupos = new Map()
  let fichaActual = ''
  filas.forEach((fila, indice) => {
    const filaCruda = filasCrudas[indice] || fila
    const sku = String(obtenerValor(fila, 'sku') ?? '').trim()
    const descripcion = String(obtenerValor(fila, 'descripcion') ?? '').trim()
    const cantidad = numeroDesdeCeldaExcel(
      obtenerValor(filaCruda, 'cantidad'),
      obtenerValor(fila, 'cantidad')
    )
    const um = String(obtenerValor(fila, 'um') ?? '').trim()
    const ubicacion = String(obtenerValor(fila, 'ubicacion') ?? '').trim()
    const factor = numeroDesdeCeldaExcel(
      obtenerValor(filaCruda, 'factor'),
      obtenerValor(fila, 'factor')
    ) || 1
    const tieneDatos = Boolean(sku || descripcion || String(cantidad).trim() || um || ubicacion)
    if (!tieneDatos) return

    const fichaFila = String(obtenerValor(fila, 'ficha') ?? '')
      .trim()
      .replace(/^costo[\s:#-]*/i, '')
      .trim()
    if (fichaFila) fichaActual = fichaFila
    if (!fichaActual) {
      throw new Error(`La fila ${indice + 2} tiene datos, pero no indica su costo en la columna Ficha.`)
    }

    if (!grupos.has(fichaActual)) grupos.set(fichaActual, [])
    grupos.get(fichaActual).push({
      SKU: sku,
      'Descripción': descripcion,
      Cantidad: cantidad,
      UM: um,
      'Ubicación': ubicacion,
      Factor: factor
    })
  })

  if (grupos.size === 0) {
    throw new Error('No se encontraron filas de productos con un costo asociado en la columna Ficha.')
  }

  return {
    costos: Array.from(grupos, ([numeroCosto, productos]) => ({
      numeroCosto,
      filas: productos
    }))
  }
}
