import { useId } from 'react'
import { esAvisoCantidadesIncompletas } from './validationNoticeUtils'

export default function ValidationNotice({ message, onClose, type = 'error', title, action }) {
  const id = useId()
  if (!message) return null

  function cerrarYRecargar() {
    onClose?.()
    window.location.reload()
  }

  const heading = title || (type === 'success' ? 'Operación completada' : type === 'warning' ? 'Atención' : esAvisoCantidadesIncompletas(message) ? 'Conteo incompleto' : 'No se pudo completar')

  return (
    <div className="ui-notice-backdrop">
      <section
        className="ui-notice"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-message`}
      >
        <span className={`ui-notice-icon ui-notice-${type}`} aria-hidden="true">{type === 'success' ? '✓' : type === 'warning' ? '!' : '!'}</span>
        <h2 id={`${id}-title`}>{heading}</h2>
        <p id={`${id}-message`}>{message}</p>
        <div className="ui-notice-actions">
          {action && <button type="button" className="ui-notice-secondary" onClick={action.onClick} disabled={action.disabled}>{action.label}</button>}
          <button type="button" className="ui-notice-button" onClick={cerrarYRecargar}>Entendido</button>
        </div>
      </section>
    </div>
  )
}
