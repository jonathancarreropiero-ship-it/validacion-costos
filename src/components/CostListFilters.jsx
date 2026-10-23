const RESULTADOS = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'conforme', etiqueta: 'Conforme', clase: 'conforme' },
  { valor: 'no_conforme', etiqueta: 'No conforme', clase: 'no-conforme' },
  { valor: 'validado_por_apoyo', etiqueta: 'Validado por apoyo', clase: 'validado-apoyo' },
  { valor: 'pendiente', etiqueta: 'Pendiente', clase: 'pendiente' }
]

export default function CostListFilters({
  busqueda,
  onBusquedaChange,
  fecha,
  onFechaChange,
  modoFecha,
  onModoFechaChange,
  estado = 'todos',
  resultado = 'todos',
  onResultadoChange,
  onLimpiar,
  soloResultados = false,
  ocultarResultados = false
}) {
  const hayFiltros = Boolean(busqueda || fecha || estado !== 'todos' || resultado !== 'todos')

  const controlResultado = (
    <div className={`cost-result-filter${soloResultados ? ' cost-result-filter-standalone' : ''}`}>
      <span>Resultado</span>
      <div className="cost-result-options" role="group" aria-label="Filtrar por resultado">
        {RESULTADOS.map(opcion => (
          <button
            key={opcion.valor}
            type="button"
            className={[
              'btn btn-sm cost-result-option',
              opcion.clase || 'todos',
              resultado === opcion.valor ? 'active' : ''
            ].filter(Boolean).join(' ')}
            aria-pressed={resultado === opcion.valor}
            onClick={() => onResultadoChange(opcion.valor)}
          >
            {opcion.etiqueta}
          </button>
        ))}
      </div>
    </div>
  )

  if (soloResultados) return controlResultado

  return (
    <div className="cost-list-filters">
      <label className="cost-list-search">
        <span className="sr-only">Buscar por número de costo</span>
        <input
          type="search"
          placeholder="Buscar por número de costo..."
          value={busqueda}
          onChange={event => onBusquedaChange(event.target.value)}
          aria-label="Buscar por número de costo"
        />
      </label>

      <div className="cost-date-filter">
        <label>
          <span>Fecha</span>
          <input
            type="date"
            value={fecha}
            onChange={event => onFechaChange(event.target.value)}
            aria-label="Filtrar costos por fecha"
          />
        </label>
        <div className="cost-date-mode" role="group" aria-label="Tipo de fecha">
          <button
            type="button"
            className={modoFecha === 'subido' ? 'active' : ''}
            aria-pressed={modoFecha === 'subido'}
            onClick={() => onModoFechaChange('subido')}
          >
            Subido
          </button>
          <button
            type="button"
            className={modoFecha === 'realizado' ? 'active' : ''}
            aria-pressed={modoFecha === 'realizado'}
            onClick={() => onModoFechaChange('realizado')}
          >
            Realizado
          </button>
        </div>
      </div>

      {!ocultarResultados && controlResultado}

      {hayFiltros && (
          <button type="button" className="btn btn-sm cost-filters-clear" onClick={onLimpiar}>
          Limpiar
        </button>
      )}
    </div>
  )
}
