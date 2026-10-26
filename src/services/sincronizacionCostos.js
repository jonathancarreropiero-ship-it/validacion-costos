import { supabase } from '../supabaseClient'

const TOPIC = 'costos-cambios-en-vivo-v1'

// Solo difunde una señal de invalidación; nunca envía datos del costo.
export function notificarCambioCosto(costoId, accion = 'actualizado') {
  if (!costoId || !navigator.onLine) return
  const channel = supabase.channel(TOPIC, { config: { broadcast: { self: false } } })
  let cerrado = false
  const limpiar = () => {
    if (cerrado) return
    cerrado = true
    window.clearTimeout(limite)
    void supabase.removeChannel(channel)
  }
  const limite = window.setTimeout(limpiar, 5000)
  channel.subscribe(status => {
    if (status === 'SUBSCRIBED') {
      void channel.send({
        type: 'broadcast',
        event: 'cambio',
        payload: { costoId: String(costoId), accion, momento: Date.now() }
      }).then(limpiar, limpiar)
    } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
      limpiar()
    }
  })
}

export function escucharCambiosCostos(onCambio) {
  const channel = supabase
    .channel(TOPIC, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'cambio' }, ({ payload }) => {
      const costoId = Number(payload?.costoId)
      if (Number.isSafeInteger(costoId) && costoId > 0) {
        onCambio?.({ costoId, accion: String(payload?.accion || 'actualizado') })
      }
    })
    .subscribe()

  return () => { void supabase.removeChannel(channel) }
}
