export function normalizarResultadoCosto(resultado) {
  const normalizado = String(resultado || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

  return normalizado === 'diferencia' ? 'no_conforme' : normalizado
}

export function obtenerCategoriaResultadoCosto(costo) {
  if (costo?.validado_por_apoyo) return 'validado_por_apoyo'
  const resultado = normalizarResultadoCosto(costo?.resultado)
  if (resultado === 'conforme' || resultado === 'no_conforme') return resultado
  return 'pendiente'
}

export function obtenerFechaLocal(valor) {
  if (!valor) return ''
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return ''
  const partes = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(fecha)
  const mapa = Object.fromEntries(partes.map(parte => [parte.type, parte.value]))
  return `${mapa.year}-${mapa.month}-${mapa.day}`
}

export function formatoFechaCosto(valor) {
  if (!valor) return '—'
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return '—'
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(fecha)
}

export function filtrarListaCostos(costos, { busqueda, fecha, modoFecha, estado, resultado }) {
  const texto = String(busqueda || '').trim().toLowerCase()

  return (costos || []).filter(costo => {
    if (texto && !String(costo.numero_costo ?? '').toLowerCase().includes(texto)) return false

    const estadoEfectivo = normalizarResultadoCosto(costo?.resultado) === 'conforme'
      ? 'terminado'
      : String(costo.estado || '').toLowerCase()
    if (estado && estado !== 'todos' && estadoEfectivo !== estado) return false
    if (resultado && resultado !== 'todos' && obtenerCategoriaResultadoCosto(costo) !== resultado) return false

    if (modoFecha === 'realizado') {
      const resultado = normalizarResultadoCosto(costo.resultado)
      if (!['conforme', 'no_conforme'].includes(resultado)) return false
      if (fecha && obtenerFechaLocal(costo.fecha_realizado) !== fecha) return false
    } else if (fecha && obtenerFechaLocal(costo.created_at) !== fecha) {
      return false
    }

    return true
  })
}
