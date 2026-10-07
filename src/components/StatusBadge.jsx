function StatusBadge({ estado }) {
  const clases = {
    pendiente: 'status status-pendiente',
    en_proceso: 'status status-en-proceso',
    terminado: 'status status-terminado'
  }

  const textos = {
    pendiente: 'Pendiente',
    en_proceso: 'En proceso',
    terminado: 'Terminado'
  }

  const claseEstado =
    clases[estado] || 'status status-default'

  const textoEstado =
    textos[estado] || estado || 'Sin estado'

  return (
    <span
      className={claseEstado}
      title={`Estado: ${textoEstado}`}
    >
      <span
        className="status-dot"
        aria-hidden="true"
      />

      <span className="status-text">
        {textoEstado}
      </span>
    </span>
  )
}

export default StatusBadge