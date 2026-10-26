import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { notificarCambioCosto } from '../services/sincronizacionCostos'

export default function ReconteoNoManifestados({ costoId, numeroConteo, sku, onClose, onSaved }) {
  const [lineas, setLineas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true
    supabase.rpc('listar_reconteos_no_manifestados', {
      p_costo_id: Number(costoId),
      p_numero_conteo: Number(numeroConteo)
    }).then(({ data, error: errorCarga }) => {
      if (!activo) return
      if (errorCarga) setError(errorCarga.message || 'No se pudieron cargar los SKU habilitados.')
      else setLineas((data || [])
        .filter(linea => !sku || String(linea.sku || '').trim().toLowerCase() === String(sku).trim().toLowerCase())
        .map(linea => ({ ...linea, nuevaCantidad: linea.cantidad_reconteo ?? '' })))
      setCargando(false)
    })
    return () => { activo = false }
  }, [costoId, numeroConteo, sku])

  async function guardar(event) {
    event.preventDefault()
    if (guardando) return
    const detalles = lineas.map(linea => ({
      id: linea.id,
      cantidad: Number(linea.nuevaCantidad)
    }))
    if (lineas.some(linea => linea.nuevaCantidad === '' || !Number.isFinite(Number(linea.nuevaCantidad)) || Number(linea.nuevaCantidad) < 0)) {
      setError('Ingresa una cantidad válida para cada SKU habilitado.')
      return
    }
    setGuardando(true)
    setError('')
    const { error: errorGuardar } = await supabase.rpc('guardar_reconteos_no_manifestados', {
      p_costo_id: Number(costoId),
      p_numero_conteo: Number(numeroConteo),
      p_detalles: detalles
    })
    setGuardando(false)
    if (errorGuardar) {
      setError(errorGuardar.message || 'No se pudieron guardar los recuentos.')
      return
    }
    notificarCambioCosto(costoId, 'no_manifestados_guardados')
    onSaved?.()
    onClose?.()
  }

  return (
    <div className="support-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose?.()}>
      <section className="support-modal-card" role="dialog" aria-modal="true" aria-labelledby="no-manifestados-reconteo-title">
        <button type="button" className="support-modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        <span className="section-kicker">RECUENTO INDEPENDIENTE</span>
        <h2 id="no-manifestados-reconteo-title">No manifestados · Conteo {numeroConteo}</h2>
        <p>Este recuento se guarda separado de las líneas SKU del costo.</p>
        {cargando ? <p role="status">Cargando SKU habilitados…</p> : (
          <form onSubmit={guardar}>
            {lineas.length === 0 ? <p>No hay SKU no manifestados habilitados para este conteo.</p> : (
              <div className="support-recount-list">
                {lineas.map(linea => (
                  <label className="support-recount-row" key={linea.id}>
                    <span><strong>{linea.sku}</strong><small>Registro inicial: {linea.cantidad}</small></span>
                    <input type="number" min="0" step="any" value={linea.nuevaCantidad} onChange={event => setLineas(actual => actual.map(item => item.id === linea.id ? { ...item, nuevaCantidad: event.target.value } : item))} aria-label={`Cantidad contada para ${linea.sku}`} />
                  </label>
                ))}
              </div>
            )}
            {error && <p className="support-recount-error" role="alert">{error}</p>}
            <footer>
              <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={guardando || cargando || lineas.length === 0}>{guardando ? 'Guardando…' : 'Guardar recuento'}</button>
            </footer>
          </form>
        )}
        {error && cargando && <p className="support-recount-error" role="alert">{error}</p>}
      </section>
    </div>
  )
}
