export default function CostListFilters({
  busqueda,
  onBusquedaChange,
  fecha,
  onFechaChange,
  modoFecha,
  onModoFechaChange,
  estado,
  onEstadoChange,
  onLimpiar
}) {
  const hayFiltros = Boolean(busqueda || fecha || estado !== 'todos')

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

      <label className="cost-state-filter">
        <span>Estado</span>
        <select value={estado} onChange={event => onEstadoChange(event.target.value)}>
          <option value="todos">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="en_proceso">En proceso</option>
          <option value="terminado">Terminado</option>
        </select>
      </label>

      {hayFiltros && (
        <button type="button" className="cost-filters-clear" onClick={onLimpiar}>
          Limpiar
        </button>
      )}
    </div>
  )
}
