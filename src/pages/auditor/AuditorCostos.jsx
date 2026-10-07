import { useEffect, useState } from 'react'

import { obtenerCostosAuditor } from '../../services/costos'

function AuditorCostos({
  costos: costosProp = [],
  onSeleccionar
}) {
  const [costos, setCostos] = useState(costosProp)

  const [loading, setLoading] = useState(
    costosProp.length === 0
  )

  const [busqueda, setBusqueda] = useState('')

  // ==========================================================
  // CARGAR COSTOS
  // ==========================================================

  useEffect(() => {
    if (
      Array.isArray(costosProp) &&
      costosProp.length > 0
    ) {
      setCostos(costosProp)
      setLoading(false)
      return
    }

    cargarCostos()
  }, [costosProp])

  async function cargarCostos() {
    try {
      setLoading(true)

      const data =
        await obtenerCostosAuditor()

      setCostos(data || [])
    } catch (error) {
      console.error(
        'Error cargando costos del auditor:',
        error
      )
    } finally {
      setLoading(false)
    }
  }

  // ==========================================================
  // BUSCAR
  // ==========================================================

  const costosFiltrados =
    costos.filter(
      costo => {
        const texto =
          busqueda
            .trim()
            .toLowerCase()

        if (!texto) {
          return true
        }

        return String(
          costo.numero_costo ?? ''
        )
          .toLowerCase()
          .includes(texto)
      }
    )

  // ==========================================================
  // SELECCIONAR COSTO
  // ==========================================================

  function seleccionarCosto(costo) {
    if (
      costo.estado === 'terminado'
    ) {
      return
    }

    const numeroConteo =
      Number(
        costo.conteo_habilitado
      )

    if (
      !Number.isInteger(
        numeroConteo
      ) ||
      numeroConteo < 1 ||
      numeroConteo > 3
    ) {
      return
    }

    if (
      typeof onSeleccionar === 'function'
    ) {
      onSeleccionar(costo)
    }
  }

  // ==========================================================
  // TEXTO DEL ESTADO
  // ==========================================================

  function obtenerEstadoTexto(costo) {
    if (
      costo.estado === 'terminado'
    ) {
      if (
        costo.resultado === 'no_conforme'
      ) {
        const siguienteConteo =
          Number(
            costo.conteo_habilitado || 1
          ) + 1

        if (
          siguienteConteo <= 3
        ) {
          return (
            'Esperando Conteo ' +
            siguienteConteo
          )
        }

        return 'Costo finalizado'
      }

      return 'Costo finalizado'
    }

    if (
      costo.estado === 'en_proceso'
    ) {
      return 'En proceso'
    }

    return 'Pendiente'
  }

  // ==========================================================
  // TEXTO DEL BOTÓN
  // ==========================================================

  function obtenerTextoAccion(costo) {
    if (
      costo.estado === 'terminado'
    ) {
      if (
        costo.resultado === 'no_conforme'
      ) {
        const siguienteConteo =
          Number(
            costo.conteo_habilitado || 1
          ) + 1

        if (
          siguienteConteo <= 3
        ) {
          return (
            'Esperando Conteo ' +
            siguienteConteo
          )
        }
      }

      return 'Costo finalizado'
    }

    const numeroConteo =
      Number(
        costo.conteo_habilitado || 1
      )

    return (
      'Iniciar Conteo ' +
      numeroConteo
    )
  }

  // ==========================================================
  // LOADING
  // ==========================================================

  if (loading) {
    return (
      <section className="auditor-costos">
        <div className="auditor-loading-state">
          <span className="auditor-loading-spinner" />
          <span>Cargando costos...</span>
        </div>
      </section>
    )
  }

  // ==========================================================
  // VISTA
  // ==========================================================

  return (
    <section className="auditor-costos" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ====================================================
          CABECERA PRINCIPAL UNIFICADA
      ==================================================== */}
      <div className="auditor-costos-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)' }}>
        <div className="auditor-costos-heading">
          <span className="auditor-costos-kicker" style={{ fontSize: '11px', fontWeight: 750, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>
            Gestión de inventario
          </span>
          <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: 750 }}>
            Costos disponibles
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
            Selecciona un costo para realizar el conteo habilitado.
          </p>
        </div>

        <div className="auditor-costos-total" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '10px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <span style={{ color: '#64748b', fontWeight: 600, fontSize: '13px' }}>Total:</span>
          <strong style={{ fontSize: '18px', color: '#0f172a' }}>{costos.length}</strong>
          <span style={{ color: '#64748b', fontWeight: 600, fontSize: '13px' }}>costos</span>
        </div>
      </div>

      {/* ====================================================
          BUSCADOR Y TOOLBAR
      ==================================================== */}
      <div className="auditor-costos-toolbar">
        <div className="auditor-costos-search" style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por número de costo..."
            aria-label="Buscar costo por número"
          />

          {busqueda && (
            <button
              type="button"
              className="auditor-costos-search-clear"
              onClick={() => setBusqueda('')}
              aria-label="Limpiar búsqueda"
              title="Limpiar búsqueda"
            >
              ×
            </button>
          )}
        </div>

        <div className="auditor-costos-results" style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
          {costosFiltrados.length}{' '}
          {costosFiltrados.length === 1 ? 'resultado' : 'resultados'}
        </div>
      </div>

      {/* ====================================================
          SIN RESULTADOS
      ==================================================== */}
      {costosFiltrados.length === 0 ? (
        <div className="auditor-empty">
          <div className="auditor-empty-icon">
            {busqueda ? '⌕' : '□'}
          </div>
          <h3>
            {busqueda ? 'No se encontró ningún costo' : 'No hay costos registrados'}
          </h3>
          <p>
            {busqueda ? 'Prueba con otro número de costo.' : 'Cuando exista un costo disponible aparecerá aquí.'}
          </p>
          {busqueda && (
            <button
              type="button"
              className="auditor-empty-clear"
              onClick={() => setBusqueda('')}
            >
              Limpiar búsqueda
            </button>
          )}
        </div>
      ) : (
        <div className="auditor-costos-table-card">

          {/* Encabezado interno de la tabla */}
          <div className="auditor-costos-table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
                Costos registrados:
              </span>
              <strong style={{ fontSize: '13px', color: '#0f172a' }}>
                {costosFiltrados.length}{' '}
                {costosFiltrados.length === 1 ? 'costo' : 'costos'}
              </strong>
            </div>
          </div>

          <div className="auditor-costos-table-wrapper">
            <table className="auditor-costos-table">
              <thead>
                <tr>
                  <th className="col-costo">Costo</th>
                  <th className="col-lineas">Líneas</th>
                  <th className="col-estado">Estado</th>
                  <th className="col-resultado">Resultado</th>
                  <th className="col-conteo">Conteo</th>
                  <th className="col-accion">Acción</th>
                </tr>
              </thead>

              <tbody>
                {costosFiltrados.map(costo => {
                  const terminado = costo.estado === 'terminado'
                  const bloqueado = terminado
                  const numeroConteo = Number(costo.conteo_habilitado || 1)

                  return (
                    <tr key={costo.id} className={bloqueado ? 'fila-bloqueada' : ''}>
                      <td>
                        <div className="auditor-costo-number">
                          <span className="auditor-costo-number-icon">#</span>
                          <strong>{costo.numero_costo}</strong>
                        </div>
                      </td>

                      <td>
                        <span className="auditor-table-value">{costo.lineas_count}</span>
                      </td>

                      <td>
                        <span
                          className={
                            terminado
                              ? 'estado-badge terminado'
                              : costo.estado === 'en_proceso'
                                ? 'estado-badge proceso'
                                : 'estado-badge pendiente'
                          }
                        >
                          <span className="estado-badge-dot" />
                          {obtenerEstadoTexto(costo)}
                        </span>
                      </td>

                      <td>
                        {costo.resultado === 'conforme' ? (
                          <span className="resultado-badge conforme">
                            <span className="resultado-badge-dot" />
                            CONFORME
                          </span>
                        ) : costo.resultado === 'no_conforme' ? (
                          <span className="resultado-badge diferencia">
                            <span className="resultado-badge-dot" />
                            NO CONFORME
                          </span>
                        ) : (
                          <span className="resultado-pendiente">Pendiente</span>
                        )}
                      </td>

                      <td>
                        {bloqueado ? (
                          <span className="conteo-cerrado">
                            <span className="conteo-cerrado-icon">✓</span>
                            Cerrado
                          </span>
                        ) : (
                          <span className="conteo-activo">
                            <span className="conteo-activo-dot" />
                            Conteo {numeroConteo}
                          </span>
                        )}
                      </td>

                      <td>
                        <button
                          type="button"
                          className={bloqueado ? 'btn-costo bloqueado' : 'btn-costo'}
                          disabled={bloqueado}
                          onClick={() => seleccionarCosto(costo)}
                        >
                          {!bloqueado && <span className="btn-costo-icon">→</span>}
                          {obtenerTextoAccion(costo)}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

        </div>
      )}

    </section>
  )
}

export default AuditorCostos