import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/** Provides a persistent horizontal control for wide tables. */
export default function ScrollableTable({
  className = '',
  tableClassName = '',
  ariaLabel = 'Tabla desplazable horizontalmente',
  children
}) {
  const viewportRef = useRef(null)
  const tableRef = useRef(null)
  const [scrollState, setScrollState] = useState({ left: 0, max: 0 })

  const updateMetrics = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    setScrollState(current => ({
      max,
      left: Math.min(current.left, max)
    }))
  }, [])

  useLayoutEffect(() => {
    const table = tableRef.current
    const viewport = viewportRef.current
    if (!table || !viewport) return undefined

    viewport.scrollLeft = 0
    updateMetrics()

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateMetrics)
      : null
    observer?.observe(table)
    observer?.observe(viewport)
    window.addEventListener('resize', updateMetrics)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateMetrics)
    }
  }, [updateMetrics])

  const handleViewportScroll = event => {
    const left = event.currentTarget.scrollLeft
    setScrollState(current => ({
      ...current,
      left: Math.min(left, current.max)
    }))
  }

  const handleRangeChange = event => {
    const left = Number(event.currentTarget.value)
    if (viewportRef.current) viewportRef.current.scrollLeft = left
    setScrollState(current => ({ ...current, left }))
  }

  return (
    <div className="scrollable-table-shell">
      <div className="scrollable-table-sticky-control">
        <input
          className="scrollable-table-control"
          type="range"
          min="0"
          max={scrollState.max}
          step="1"
          value={Math.min(scrollState.left, scrollState.max)}
          onChange={handleRangeChange}
          style={{ '--scroll-progress': `${scrollState.max > 0
            ? (scrollState.left / scrollState.max) * 100
            : 0}%` }}
          aria-label={`Desplazar ${ariaLabel} horizontalmente`}
          aria-valuetext={scrollState.max > 0
            ? `${Math.round((scrollState.left / scrollState.max) * 100)}%`
            : 'Inicio'}
          disabled={scrollState.max === 0}
        />
      </div>
      <div
        ref={viewportRef}
        className={`scrollable-table-viewport ${className}`.trim()}
        role="region"
        aria-label={ariaLabel}
        onScroll={handleViewportScroll}
      >
        <table ref={tableRef} className={tableClassName}>
          {children}
        </table>
      </div>
    </div>
  )
}
