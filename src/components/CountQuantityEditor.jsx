import { useState } from 'react'

export default function CountQuantityEditor({
  cantidades,
  onCambiar,
  onAgregar,
  onEliminar,
  disabled = false,
  etiqueta = 'Cantidad'
}) {
  const [abierto, setAbierto] = useState(false)
  const items = Array.isArray(cantidades) && cantidades.length ? cantidades : ['']
  const indiceVisible = items.length - 1
  const valoresCompletos = items.every(valor => valor !== '' && valor !== null && valor !== undefined && Number.isFinite(Number(valor)))
  const suma = valoresCompletos
    ? items.reduce((total, valor) => total + Number(valor), 0)
    : null

  function agregarItem() {
    if (items.at(-1) === '' || items.at(-1) === null || items.at(-1) === undefined) {
      setAbierto(true)
      return
    }
    onAgregar()
  }

  return (
    <div className="count-quantity-editor">
      <div className="count-quantity-entry">
        <label className="sr-only">{etiqueta} del item actual</label>
        <input
          type="text"
          inputMode="decimal"
          className="count-quantity-input"
          value={items[indiceVisible] ?? ''}
          onChange={event => onCambiar(indiceVisible, event.target.value)}
          placeholder={etiqueta}
          aria-label={`${etiqueta}, item ${items.length}`}
          disabled={disabled}
        />
        <button
          type="button"
          className="count-add-item-button"
          onClick={agregarItem}
          disabled={disabled}
          aria-label="Agregar una cantidad al conteo"
          title="Agregar otro item"
        >
          +
        </button>
        <button
          type="button"
          className="count-view-items-button"
          onClick={() => setAbierto(true)}
          disabled={disabled}
        >
          Ver items <span>{items.length}</span>
        </button>
      </div>
      <div className="count-quantity-summary" aria-live="polite">
        <span>{items.length} {items.length === 1 ? 'item' : 'items'}</span>
        <strong>{suma === null ? 'Completa los items' : `Total: ${new Intl.NumberFormat('es-PE', { maximumFractionDigits: 4 }).format(suma)}`}</strong>
      </div>

      {abierto && (
        <div className="count-items-backdrop" onMouseDown={event => event.target === event.currentTarget && setAbierto(false)}>
          <section className="count-items-modal" role="dialog" aria-modal="true" aria-labelledby="count-items-title">
            <header className="count-items-modal-header">
              <div>
                <span>DETALLE DE CAPTURA</span>
                <h3 id="count-items-title">Items del conteo</h3>
              </div>
              <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar items">×</button>
            </header>
            <div className="count-items-modal-list">
              {items.map((cantidad, index) => (
                <div className="count-items-modal-row" key={`count-item-${index}`}>
                  <label htmlFor={`count-item-${index}`}>Item {index + 1}</label>
                  <input
                    id={`count-item-${index}`}
                    type="text"
                    inputMode="decimal"
                    value={cantidad ?? ''}
                    onChange={event => onCambiar(index, event.target.value)}
                    disabled={disabled}
                  />
                  <button
                    type="button"
                    onClick={() => onEliminar(index)}
                    disabled={disabled || items.length === 1}
                    aria-label={`Eliminar item ${index + 1}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <footer className="count-items-modal-footer">
              <button type="button" className="count-items-add-modal" onClick={onAgregar} disabled={disabled}>+ Agregar item</button>
              <span>Total parcial: {suma === null ? 'Completa los items' : new Intl.NumberFormat('es-PE', { maximumFractionDigits: 4 }).format(suma)}</span>
              <button type="button" className="count-items-done" onClick={() => setAbierto(false)}>Listo</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
