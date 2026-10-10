
import { useEffect, useState } from 'react'

import { obtenerCostosAuditor } from '../../services/costos'

function AuditorCostos({
  costos: costosProp = [],
  onSeleccionar
}) {
  const [costosCargados, setCostosCargados] = useState([])
  const costos = costosProp.length > 0 ? costosProp : costosCargados

  const [loading, setLoading] = useState(
    costosProp.length === 0
  )

  const [busqueda, setBusqueda] = useState('')
  const [alerta, setAlerta] = useState(null)

  // ==========================================================
  // CARGAR COSTOS
  // ==========================================================

  useEffect(() => {
    if (costosProp.length > 0) return

    let activo = true
    async function cargarCostos() {
      await Promise.resolve()
      if (!activo) return

      try {
        setLoading(true)
        const data = await obtenerCostosAuditor()
        if (activo) setCostosCargados(data || [])
      } catch (error) {
        console.error('Error cargando costos del auditor:', error)
      } finally {
        if (activo) setLoading(false)
      }
    }

    cargarCostos()
    return () => {
      activo = false
    }
  }, [costosProp.length])

  async function cargarCostos() {
    setLoading(true)
    try {
      const data = await obtenerCostosAuditor()
      setCostosCargados(data || [])
    } catch (error) {
      console.error('Error cargando costos del auditor:', error)
    } finally {
      setLoading(false)
    }
  }

  // ==========================================================
  // NORMALIZAR RESULTADO
  // ==========================================================

  function obtenerResultadoNormalizado(resultado) {
    return String(resultado || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
  }

  function costoConforme(costo) {
    return obtenerResultadoNormalizado(costo?.resultado) === 'conforme'
  }

  // ==========================================================
  // BUSCAR
  // ==========================================================

  const costosFiltrados = costos.filter(costo => {
    const texto = busqueda.trim().toLowerCase()

    if (!texto) {
      return true
    }

    return String(costo.numero_costo ?? '')
      .toLowerCase()
      .includes(texto)
  })

  // ==========================================================
  // SELECCIONAR COSTO Y VALIDAR BLOQUEO VISUAL
  // ==========================================================

  function seleccionarCosto(costo) {
    // No permitir ingresar a costos terminados.
    if (costo.estado === 'terminado' || costoConforme(costo)) {
      const siguienteConteo =
        Number(costo.conteo_habilitado || 1) + 1

      if (
        obtenerResultadoNormalizado(costo.resultado) ===
          'no_conforme' &&
        siguienteConteo <= 3
      ) {
        setAlerta({
          tipo: 'espera',
          titulo: 'Conteo pendiente de habilitación',
          mensaje:
            `Debes esperar a que el administrador habilite el Conteo ${siguienteConteo}.`
        })
      } else {
        setAlerta({
          tipo: 'info',
          titulo: 'Costo finalizado',
          mensaje:
            'Este costo ya está finalizado y no admite nuevos conteos.'
        })
      }

      return
    }

    // No permitir ingresar si otro usuario tiene el bloqueo.
    if (costo.bloqueado_por_otro) {
      setAlerta({
        tipo: 'bloqueo',
        titulo: 'Costo ocupado',
        mensaje:
          'Otro usuario está realizando este costo. Podrás ingresar cuando termine su conteo.'
      })

      return
    }

    const numeroConteo =
      Number(costo.conteo_habilitado || 1)

    if (
      !Number.isInteger(numeroConteo) ||
      numeroConteo < 1 ||
      numeroConteo > 3
    ) {
      setAlerta({
        tipo: 'info',
        titulo: 'Conteo no disponible',
        mensaje:
          'Este costo no tiene un conteo habilitado válido. Comunícate con el administrador.'
      })

      return
    }

    // Protección adicional en la interfaz.
    const conteosRegistrados = (
      costo.conteos_registrados || []
    ).map(Number)

    if (conteosRegistrados.includes(numeroConteo)) {
      setAlerta({
        tipo: 'espera',
        titulo: 'Conteo ya registrado',
        mensaje:
          `El Conteo ${numeroConteo} ya fue registrado. Debes esperar a que el administrador habilite el siguiente conteo.`
      })

      cargarCostos()
      return
    }

    // El componente padre gestiona el ingreso real al costo.
    if (typeof onSeleccionar === 'function') {
      onSeleccionar(costo)
    }
  }

  // ==========================================================
  // TEXTO DEL ESTADO
  // ==========================================================

  function obtenerEstadoTexto(costo) {
    if (costoConforme(costo)) {
      return 'Conforme'
    }

    if (costo.estado === 'terminado') {
      if (
        obtenerResultadoNormalizado(costo.resultado) ===
        'no_conforme'
      ) {
        const siguienteConteo =
          Number(costo.conteo_habilitado || 1) + 1

        if (siguienteConteo <= 3) {
          return `Esperando Conteo ${siguienteConteo}`
        }
      }

      return 'Costo finalizado'
    }

    if (costo.estado === 'en_proceso') {
      return 'En proceso'
    }

    return 'Pendiente'
  }

  // ==========================================================
  // TEXTO DEL BOTÓN
  // ==========================================================

  function obtenerTextoAccion(costo) {
    if (costoConforme(costo)) {
      return 'Costo conforme'
    }

    if (costo.estado === 'terminado') {
      if (
        obtenerResultadoNormalizado(costo.resultado) ===
        'no_conforme'
      ) {
        const siguienteConteo =
          Number(costo.conteo_habilitado || 1) + 1

        if (siguienteConteo <= 3) {
          return `Esperando Conteo ${siguienteConteo}`
        }
      }

      return 'Costo finalizado'
    }

    const numeroConteo =
      Number(costo.conteo_habilitado || 1)

    return `Iniciar Conteo ${numeroConteo}`
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
    <section
      className="auditor-costos"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}
    >
      {/* CABECERA PRINCIPAL */}

      <div
        className="auditor-costos-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)'
        }}
      >
        <div className="auditor-costos-heading">
          <span
            className="auditor-costos-kicker"
            style={{
              fontSize: '11px',
              fontWeight: 750,
              color: '#1e40af',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'block',
              marginBottom: '4px'
            }}
          >
            Gestión de inventario
          </span>

          <h2
            style={{
              margin: 0,
              fontSize: '20px',
              color: '#0f172a',
              fontWeight: 750
            }}
          >
            Costos disponibles
          </h2>

          <p
            style={{
              margin: '4px 0 0',
              color: '#64748b',
              fontSize: '13px'
            }}
          >
            Selecciona un costo para realizar el conteo habilitado.
          </p>
        </div>

        <div
          className="auditor-costos-total"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#f8fafc',
            padding: '10px 16px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0'
          }}
        >
          <span
            style={{
              color: '#64748b',
              fontWeight: 600,
              fontSize: '13px'
            }}
          >
            Total:
          </span>

          <strong
            style={{
              fontSize: '18px',
              color: '#0f172a'
            }}
          >
            {costos.length}
          </strong>

          <span
            style={{
              color: '#64748b',
              fontWeight: 600,
              fontSize: '13px'
            }}
          >
            costos
          </span>
        </div>
      </div>

      {/* BUSCADOR */}

      <div className="auditor-costos-toolbar">
        <div
          className="auditor-costos-search"
          style={{
            position: 'relative',
            flex: 1,
            maxWidth: '400px'
          }}
        >
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

        <div
          className="auditor-costos-results"
          style={{
            fontSize: '13px',
            color: '#64748b',
            fontWeight: 600
          }}
        >
          {costosFiltrados.length}{' '}
          {costosFiltrados.length === 1
            ? 'resultado'
            : 'resultados'}
        </div>
      </div>

      {/* SIN RESULTADOS */}

      {costosFiltrados.length === 0 ? (
        <div className="auditor-empty">
          <div className="auditor-empty-icon">
            {busqueda ? '⌕' : '□'}
          </div>

          <h3>
            {busqueda
              ? 'No se encontró ningún costo'
              : 'No hay costos registrados'}
          </h3>

          <p>
            {busqueda
              ? 'Prueba con otro número de costo.'
              : 'Cuando exista un costo disponible aparecerá aquí.'}
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
          {/* ENCABEZADO DE TABLA */}

          <div
            className="auditor-costos-table-header"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              background: '#fff'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: '#64748b'
                }}
              >
                Costos registrados:
              </span>

              <strong
                style={{
                  fontSize: '13px',
                  color: '#0f172a'
                }}
              >
                {costosFiltrados.length}{' '}
                {costosFiltrados.length === 1
                  ? 'costo'
                  : 'costos'}
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
                  const resultadoOriginal =
                    obtenerResultadoNormalizado(costo.resultado)

                  const terminado =
                    costo.estado === 'terminado' ||
                    resultadoOriginal === 'conforme'

                  const ocupadoPorOtro =
                    Boolean(costo.bloqueado_por_otro)

                  const propio =
                    Boolean(costo.bloqueado_por_mi)

                  const numeroConteo =
                    Number(costo.conteo_habilitado || 1)

                  const conteoYaRegistrado = (
                    costo.conteos_registrados || []
                  )
                    .map(Number)
                    .includes(numeroConteo)

                  const esperandoSiguienteConteo =
                    !terminado && conteoYaRegistrado

                  const bloqueado =
                    terminado || esperandoSiguienteConteo

                  // ==================================================
                  // RESULTADO DEL ÚLTIMO CONTEO
                  // ==================================================

                  const lineasConDiferencia =
                    Number(costo.lineas_con_diferencia || 0)

                  const resultado =
                    resultadoOriginal === 'conforme' ||
                    resultadoOriginal === 'no_conforme'
                      ? resultadoOriginal
                      : costo.conteo_completo
                        ? lineasConDiferencia > 0
                          ? 'no_conforme'
                          : 'conforme'
                        : 'pendiente'

                  return (
                    <tr
                      key={costo.id}
                      className={
                        bloqueado ? 'fila-bloqueada' : ''
                      }
                    >
                      {/* COSTO */}

                      <td>
                        <div className="auditor-costo-number">
                          <span className="auditor-costo-number-icon">
                            #
                          </span>

                          <strong>
                            {costo.numero_costo}
                          </strong>
                        </div>
                      </td>

                      {/* LÍNEAS */}

                      <td>
                        <span className="auditor-table-value">
                          {costo.lineas_count}
                        </span>
                      </td>

                      {/* ESTADO */}

                      <td>
                        <span
                          className={
                            terminado
                              ? 'estado-badge terminado'
                              : esperandoSiguienteConteo
                                ? 'estado-badge pendiente'
                                : ocupadoPorOtro
                                  ? 'estado-badge ocupado'
                                  : propio
                                    ? 'estado-badge proceso'
                                    : costo.estado === 'en_proceso'
                                      ? 'estado-badge proceso'
                                      : 'estado-badge pendiente'
                          }
                        >
                          <span className="estado-badge-dot" />

                          {terminado
                            ? obtenerEstadoTexto(costo)
                            : esperandoSiguienteConteo
                              ? 'Esperando habilitación del administrador'
                              : ocupadoPorOtro
                                ? 'En proceso por otro usuario'
                                : propio
                                  ? 'Continuar mi conteo'
                                  : obtenerEstadoTexto(costo)}
                        </span>
                      </td>

                      {/* RESULTADO */}

                      <td>
                        {resultado === 'conforme' ? (
                          <span className="resultado-badge conforme">
                            <span className="resultado-badge-dot" />
                            CONFORME
                          </span>
                        ) : resultado === 'no_conforme' ? (
                          <span className="resultado-badge diferencia">
                            <span className="resultado-badge-dot" />
                            NO CONFORME
                          </span>
                        ) : (
                          <span className="resultado-pendiente">
                            {costo.numero_ultimo_conteo ? 'Pendiente' : 'Sin conteo'}
                          </span>
                        )}
                      </td>

                      {/* CONTEO */}

                      <td>
                        {bloqueado ? (
                          <span className="conteo-cerrado">
                            <span className="conteo-cerrado-icon">
                              ✓
                            </span>
                            Cerrado
                          </span>
                        ) : (
                          <span className="conteo-activo">
                            <span className="conteo-activo-dot" />
                            Conteo {numeroConteo}
                          </span>
                        )}
                      </td>

                      {/* ACCIÓN */}

                      <td>
                        <button
                          type="button"
                          className={
                            bloqueado
                              ? 'btn-costo bloqueado'
                              : ocupadoPorOtro
                                ? 'btn-costo ocupado'
                                : 'btn-costo'
                          }
                          disabled={bloqueado}
                          onClick={() => seleccionarCosto(costo)}
                        >
                          {!bloqueado && (
                            <span className="btn-costo-icon">
                              {ocupadoPorOtro
                                ? '🔒'
                                : propio
                                  ? '↻'
                                  : '→'}
                            </span>
                          )}

                          {terminado
                            ? obtenerTextoAccion(costo)
                            : esperandoSiguienteConteo
                              ? 'Conteo ya registrado'
                              : ocupadoPorOtro
                                ? 'Ver bloqueo'
                                : propio
                                  ? `Continuar Conteo ${numeroConteo}`
                                  : obtenerTextoAccion(costo)}
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

      {/* ALERTA VISUAL */}

      {alerta && (
        <div
          role="presentation"
          onClick={() => setAlerta(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            background: 'rgba(15, 23, 42, 0.58)',
            backdropFilter: 'blur(4px)'
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="alerta-costo-titulo"
            aria-describedby="alerta-costo-mensaje"
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '420px',
              padding: '28px',
              borderRadius: '20px',
              background: '#ffffff',
              boxShadow: '0 24px 70px rgba(0, 0, 0, 0.22)',
              textAlign: 'center',
              border: '1px solid #e2e8f0'
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                margin: '0 auto 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                background:
                  alerta.tipo === 'bloqueo'
                    ? '#fff7ed'
                    : alerta.tipo === 'espera'
                      ? '#eff6ff'
                      : '#f1f5f9',
                fontSize: '30px'
              }}
            >
              {alerta.tipo === 'bloqueo'
                ? '🔒'
                : alerta.tipo === 'espera'
                  ? '⏳'
                  : 'ℹ️'}
            </div>

            <h3
              id="alerta-costo-titulo"
              style={{
                margin: '0 0 10px',
                color: '#0f172a',
                fontSize: '21px',
                fontWeight: 750
              }}
            >
              {alerta.titulo}
            </h3>

            <p
              id="alerta-costo-mensaje"
              style={{
                margin: '0 0 24px',
                color: '#64748b',
                fontSize: '14px',
                lineHeight: 1.7
              }}
            >
              {alerta.mensaje}
            </p>

            <button
              type="button"
              onClick={() => setAlerta(null)}
              autoFocus
              style={{
                width: '100%',
                minHeight: '46px',
                border: 'none',
                borderRadius: '10px',
                background: '#1d4ed8',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export default AuditorCostos

