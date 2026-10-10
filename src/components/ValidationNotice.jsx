import { esAvisoCantidadesIncompletas } from './validationNoticeUtils'

export default function ValidationNotice({ message, onClose }) {
  if (!esAvisoCantidadesIncompletas(message)) return null

  return (
    <div className="ui-notice-backdrop">
      <section
        className="ui-notice"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="validation-notice-title"
        aria-describedby="validation-notice-message"
      >
        <span className="ui-notice-icon ui-notice-error" aria-hidden="true">!</span>
        <h2 id="validation-notice-title">Conteo incompleto</h2>
        <p id="validation-notice-message">{message}</p>
        <button type="button" className="ui-notice-button" onClick={onClose}>
          Entendido
        </button>
      </section>
    </div>
  )
}
