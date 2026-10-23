import { useRef, useState } from 'react'

/** Horizontal table viewport with mouse drag and native touch scrolling. */
export default function ScrollableTable({
  className = '',
  tableClassName = '',
  ariaLabel = 'Tabla desplazable horizontalmente',
  children
}) {
  const viewportRef = useRef(null)
  const dragRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  function comenzarArrastre(event) {
    if (event.pointerType === 'touch' || event.button !== 0) return
    if (event.target.closest('button, a, input, select, textarea, [role="button"]')) return

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: viewportRef.current?.scrollLeft || 0,
      movido: false
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moverTabla(event) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || !viewportRef.current) return

    const desplazamiento = event.clientX - drag.startX
    if (Math.abs(desplazamiento) > 3) {
      drag.movido = true
      setDragging(true)
      event.preventDefault()
    }
    viewportRef.current.scrollLeft = drag.scrollLeft - desplazamiento
  }

  function terminarArrastre(event) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      ref={viewportRef}
      className={`scrollable-table-viewport ${className} ${dragging ? 'is-dragging' : ''}`.trim()}
      role="region"
      aria-label={ariaLabel}
      aria-description="Desliza horizontalmente con el mouse o usa el desplazamiento táctil."
      onPointerDown={comenzarArrastre}
      onPointerMove={moverTabla}
      onPointerUp={terminarArrastre}
      onPointerCancel={terminarArrastre}
      onLostPointerCapture={terminarArrastre}
    >
      <table className={tableClassName}>
        {children}
      </table>
    </div>
  )
}
