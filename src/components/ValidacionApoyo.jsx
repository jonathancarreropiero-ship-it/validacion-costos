import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import CountQuantityEditor from './CountQuantityEditor'

export default function ValidacionApoyo({ costo, onClose, onSaved }) {
  const [lineas, setLineas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true
    supabase.rpc('obtener_lineas_validacion_apoyo', { p_costo_id: Number(costo.id) })
      .then(({ data, error: errorCarga }) => {
        if (!activo) return
        if (errorCarga) setError(errorCarga.message || 'No se pudieron cargar las líneas.')
        else setLineas((data || []).map(linea => ({ ...linea, cantidades: [''], factor: Number(linea.factor) > 0 ? String(linea.factor) : '1' })))
        setCargando(false)
      })
    return () => { activo = false }
  }, [costo.id])

  async function guardar(event) {
    event.preventDefault()
    if (guardando) return
    if (!lineas.length || lineas.some(linea => !linea.cantidades.length || linea.cantidades.some(cantidad => cantidad === '' || !Number.isFinite(Number(cantidad)) || Number(cantidad) < 0) || !Number.isFinite(Number(linea.factor)) || Number(linea.factor) <= 0)) {
      setError('Completa una cantidad válida para cada SKU pendiente.')
      return
    }
    setGuardando(true)
    setError('')
    const { data, error: errorGuardar } = await supabase.rpc('guardar_validacion_apoyo', {
      p_costo_id: Number(costo.id),
      p_detalles: lineas.map(linea => ({ id: linea.id, cantidades: linea.cantidades.map(Number), factor: Number(linea.factor) }))
    })
    setGuardando(false)
    if (errorGuardar) {
      setError(errorGuardar.message || 'No se pudo guardar la validación.')
      return
    }
    onSaved?.(data)
    onClose?.()
  }

  return (
    <div className="support-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose?.()}>
      <section className="support-modal-card" role="dialog" aria-modal="true" aria-labelledby="validacion-apoyo-title">
        <button type="button" className="support-modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        <span className="section-kicker">VALIDACIÓN INDEPENDIENTE</span>
        <h2 id="validacion-apoyo-title">Validación por apoyo · Costo {costo.numero_costo}</h2>
        <p>Se muestran solo las líneas que quedaron no conformes en el Conteo 3.</p>
        {cargando ? <p role="status">Cargando líneas…</p> : (
          <form onSubmit={guardar}>
            <div className="support-recount-list">
              {lineas.map(linea => (
                <label className="support-recount-row" key={linea.id}>
                  <span><strong>{linea.sku}</strong><small>{linea.descripcion || 'Sin descripción'} · Conteo 3: {linea.cantidad_conteo_3}</small></span>
                  <div className="support-validation-inputs">
                    <CountQuantityEditor
                      cantidades={linea.cantidades}
                      etiqueta="Cantidad física"
                      onCambiar={(indice, valor) => setLineas(actual => actual.map(item => item.id === linea.id ? { ...item, cantidades: item.cantidades.map((cantidad, index) => index === indice ? valor : cantidad) } : item))}
                      onAgregar={() => setLineas(actual => actual.map(item => item.id === linea.id ? { ...item, cantidades: [...item.cantidades, ''] } : item))}
                      onEliminar={indice => setLineas(actual => actual.map(item => item.id === linea.id ? { ...item, cantidades: item.cantidades.filter((_, index) => index !== indice) } : item))}
                    />
                    <label className="support-validation-factor">Factor<input type="number" min="0.01" step="any" value={linea.factor} onChange={event => setLineas(actual => actual.map(item => item.id === linea.id ? { ...item, factor: event.target.value } : item))} /></label>
                  </div>
                </label>
              ))}
            </div>
            {error && <p className="support-recount-error" role="alert">{error}</p>}
            <footer>
              <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={guardando || cargando || !lineas.length}>{guardando ? 'Guardando…' : 'Guardar validación'}</button>
            </footer>
          </form>
        )}
      </section>
    </div>
  )
}
