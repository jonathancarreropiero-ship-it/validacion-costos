
import { useEffect, useState } from 'react'

import { supabase } from '../../supabaseClient'

import {
  habilitarConteo,
  reiniciarCosto,
  iniciarCosto
} from '../../services/costos'

import StatusBadge from '../../components/StatusBadge'

import DetalleCosto from './DetalleCosto'
import ConteoAdmin from './ConteoAdmin'


// ==========================================================
// SESIÓN ADMINISTRADOR
// ==========================================================

function obtenerClaveSesionAdmin(usuarioId) {
  return `validacion-costos-admin-${usuarioId}-sesion`
}


// ==========================================================
// CARGAR SESIÓN
// ==========================================================

function cargarSesionAdmin(usuarioId) {
  if (!usuarioId) {
    return null
  }

  try {
    const clave = obtenerClaveSesionAdmin(usuarioId)
    const guardado = localStorage.getItem(clave)

    if (!guardado) {
      return null
    }

    const sesion = JSON.parse(guardado)

    if (
      !sesion ||
      String(sesion.usuarioId) !== String(usuarioId)
    ) {
      return null
    }

    return sesion
  } catch (error) {
    console.error(
      'No se pudo cargar la sesión del administrador:',
      error
    )

    return null
  }
}


// ==========================================================
// GUARDAR SESIÓN
// ==========================================================

function guardarSesionAdmin(usuarioId, datos) {
  if (!usuarioId) {
    return
  }

  try {
    const clave = obtenerClaveSesionAdmin(usuarioId)

    localStorage.setItem(
      clave,
      JSON.stringify({
        usuarioId,
        ...datos,
        updatedAt: new Date().toISOString()
      })
    )
  } catch (error) {
    console.error(
      'No se pudo guardar la sesión del administrador:',
      error
    )
  }
}


// ==========================================================
// LIMPIAR SESIÓN
// ==========================================================

function limpiarSesionAdmin(usuarioId) {
  if (!usuarioId) {
    return
  }

  try {
    localStorage.removeItem(
      obtenerClaveSesionAdmin(usuarioId)
    )
  } catch (error) {
    console.error(
      'No se pudo limpiar la sesión del administrador:',
      error
    )
  }
}


// ==========================================================
// COMPONENTE
// ==========================================================

function CostosAdmin({ usuarioId }) {
  const [costos, setCostos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [costoSeleccionado, setCostoSeleccionado] = useState(null)
  const [conteoAdmin, setConteoAdmin] = useState(null)
  const [habilitando, setHabilitando] = useState(null)
  const [reiniciando, setReiniciando] = useState(null)
  const [abriendoConteo, setAbriendoConteo] = useState(null)
  const [restauracionRealizada, setRestauracionRealizada] = useState(false)


  // ==========================================================
  // CARGAR COSTOS
  // ==========================================================

  useEffect(() => {
    cargarCostos()
  }, [])


  async function cargarCostos() {
    setLoading(true)

    try {
      const {
        data,
        error
      } = await supabase
        .from('costos')
        .select('*')
        .order('created_at', {
          ascending: false
        })

      if (error) {
        throw error
      }

      setCostos(data || [])
    } catch (error) {
      console.error('Error cargando costos:', error)
    } finally {
      setLoading(false)
    }
  }


  // ==========================================================
  // RESTAURAR SESIÓN
  // ==========================================================

  useEffect(() => {
    if (
      !usuarioId ||
      loading ||
      restauracionRealizada
    ) {
      return
    }

    const sesion = cargarSesionAdmin(usuarioId)

    if (!sesion) {
      setRestauracionRealizada(true)
      return
    }


    // ========================================================
    // RESTAURAR BÚSQUEDA
    // ========================================================

    if (typeof sesion.busqueda === 'string') {
      setBusqueda(sesion.busqueda)
    }


    // ========================================================
    // SESIÓN DE LISTA
    // ========================================================

    if (sesion.view === 'lista') {
      setRestauracionRealizada(true)
      return
    }


    // ========================================================
    // SI NO HAY COSTO
    // ========================================================

    if (!sesion.costoId) {
      limpiarSesionAdmin(usuarioId)
      setRestauracionRealizada(true)
      return
    }


    // ========================================================
    // BUSCAR COSTO
    // ========================================================

    const costo = costos.find(
      item =>
        Number(item.id) === Number(sesion.costoId)
    )


    // ========================================================
    // COSTO NO EXISTE
    // ========================================================

    if (!costo) {
      console.log(
        'No se encontró el costo guardado en la sesión.'
      )

      limpiarSesionAdmin(usuarioId)
      setRestauracionRealizada(true)
      return
    }


    // ========================================================
    // RESTAURAR DETALLE
    // La consulta del detalle se mantiene independiente
    // del acceso al registro de conteos.
    // ========================================================

    if (sesion.view === 'detalle') {
      setCostoSeleccionado(costo)
      setRestauracionRealizada(true)
      return
    }


    // ========================================================
    // RESTAURAR CONTEO
    // Verificar nuevamente el responsable en Supabase.
    // ========================================================

    if (sesion.view === 'conteo') {
      const numeroConteo = Number(sesion.numeroConteo)
      const conteoHabilitado = Number(costo.conteo_habilitado)

      if (
        ![1, 2, 3].includes(numeroConteo) ||
        conteoHabilitado !== numeroConteo
      ) {
        limpiarSesionAdmin(usuarioId)
        setRestauracionRealizada(true)
        return
      }

      // Evitar que el efecto vuelva a iniciar otra restauración.
      setRestauracionRealizada(true)

      iniciarCosto(costo.id)
        .then(() => {
          setConteoAdmin({
            costo,
            numeroConteo
          })
        })
        .catch(async error => {
          console.error(
            'No se pudo restaurar el conteo del administrador:',
            error
          )

          limpiarSesionAdmin(usuarioId)

          alert(
            error?.message ||
            'No puedes continuar este conteo porque está asignado a otro usuario.'
          )

          await cargarCostos()
        })

      return
    }


    // ========================================================
    // SESIÓN NO RECONOCIDA
    // ========================================================

    limpiarSesionAdmin(usuarioId)
    setRestauracionRealizada(true)
  }, [
    usuarioId,
    loading,
    costos,
    restauracionRealizada
  ])


  // ==========================================================
  // REALIZAR CONTEO
  // Validar el responsable antes de abrir la pantalla.
  // ==========================================================

  async function realizarConteo(costo) {
    const numeroConteo = Number(costo.conteo_habilitado)

    if (![1, 2, 3].includes(numeroConteo)) {
      alert(
        'Este costo no tiene un conteo habilitado.'
      )

      return
    }

    try {
      setAbriendoConteo(costo.id)

      // Supabase verifica si el administrador es responsable
      // o si el costo todavía no ha sido iniciado.
      await iniciarCosto(costo.id)

      // Guardar la sesión únicamente después de autorizar
      // al administrador.
      guardarSesionAdmin(usuarioId, {
        view: 'conteo',
        costoId: costo.id,
        numeroConteo,
        busqueda
      })

      setConteoAdmin({
        costo,
        numeroConteo
      })
    } catch (error) {
      console.error(
        'No se pudo abrir el conteo:',
        error
      )

      alert(
        error?.message ||
        'No puedes abrir este costo porque está asignado a otro usuario.'
      )

      await cargarCostos()
    } finally {
      setAbriendoConteo(null)
    }
  }


  // ==========================================================
  // CONTEO ADMIN GUARDADO
  // ==========================================================

  async function manejarConteoGuardado() {
    limpiarSesionAdmin(usuarioId)
    setConteoAdmin(null)

    await cargarCostos()
  }


  // ==========================================================
  // VOLVER DESDE CONTEO ADMIN
  // ==========================================================

  function volverDesdeConteo() {
    limpiarSesionAdmin(usuarioId)
    setConteoAdmin(null)

    cargarCostos()
  }


  // ==========================================================
  // VER DETALLE
  // ==========================================================

  function verDetalle(costo) {
    guardarSesionAdmin(usuarioId, {
      view: 'detalle',
      costoId: costo.id,
      busqueda
    })

    setCostoSeleccionado(costo)
  }


  // ==========================================================
  // VOLVER DESDE DETALLE
  // ==========================================================

  function volverDesdeDetalle() {
    limpiarSesionAdmin(usuarioId)
    setCostoSeleccionado(null)
  }


  // ==========================================================
  // HABILITAR CONTEO 2
  // ==========================================================

  async function habilitarConteo2(costo) {
    try {
      setHabilitando(costo.id)

      const {
        data: detalles,
        error: errorDetalles
      } = await supabase
        .from('detalle_costos')
        .select('id')
        .eq('costo_id', costo.id)

      if (errorDetalles) {
        throw errorDetalles
      }

      const idsDetalles =
        detalles?.map(detalle => detalle.id) || []

      if (idsDetalles.length === 0) {
        throw new Error(
          'El costo no tiene productos registrados.'
        )
      }

      const {
        data: diferencias,
        error
      } = await supabase
        .from('conteos')
        .select(`
          id,
          detalle_costo_id,
          numero_conteo,
          resultado
        `)
        .eq('numero_conteo', 1)
        .eq('resultado', 'diferencia')
        .in('detalle_costo_id', idsDetalles)

      if (error) {
        throw error
      }

      if (!diferencias || diferencias.length === 0) {
        throw new Error(
          'No existen productos con diferencias en el Conteo 1.'
        )
      }

      await habilitarConteo(costo.id, 2)

      await cargarCostos()
    } catch (error) {
      console.error(error)

      alert(
        error.message ||
        'No se pudo habilitar el Conteo 2.'
      )
    } finally {
      setHabilitando(null)
    }
  }


  // ==========================================================
  // HABILITAR CONTEO 3
  // ==========================================================

  async function habilitarConteo3(costo) {
    try {
      setHabilitando(costo.id)

      const {
        data: detalles,
        error: errorDetalles
      } = await supabase
        .from('detalle_costos')
        .select('id')
        .eq('costo_id', costo.id)

      if (errorDetalles) {
        throw errorDetalles
      }

      const idsDetalles =
        detalles?.map(detalle => detalle.id) || []

      if (idsDetalles.length === 0) {
        throw new Error(
          'El costo no tiene productos registrados.'
        )
      }

      const {
        data: diferencias,
        error
      } = await supabase
        .from('conteos')
        .select(`
          id,
          detalle_costo_id,
          numero_conteo,
          resultado
        `)
        .eq('numero_conteo', 2)
        .eq('resultado', 'diferencia')
        .in('detalle_costo_id', idsDetalles)

      if (error) {
        throw error
      }

      if (!diferencias || diferencias.length === 0) {
        throw new Error(
          'No existen productos con diferencias en el Conteo 2.'
        )
      }

      await habilitarConteo(costo.id, 3)

      await cargarCostos()
    } catch (error) {
      console.error(error)

      alert(
        error.message ||
        'No se pudo habilitar el Conteo 3.'
      )
    } finally {
      setHabilitando(null)
    }
  }


  // ==========================================================
  // REINICIAR COSTO
  // ==========================================================

  async function manejarReinicio(costo) {
    const confirmado = window.confirm(
      `¿Reiniciar el costo ${costo.numero_costo}?\n\n` +
      `Se eliminarán los conteos y no manifestados ` +
      `realizados hasta ahora y se liberará el costo ` +
      `para que otro auditor pueda trabajarlo.\n\n` +
      `Los productos originales del costo NO serán eliminados.`
    )

    if (!confirmado) {
      return
    }

    try {
      setReiniciando(costo.id)

      await reiniciarCosto(costo.id)

      const sesion = cargarSesionAdmin(usuarioId)

      if (
        sesion &&
        Number(sesion.costoId) === Number(costo.id)
      ) {
        limpiarSesionAdmin(usuarioId)
        setCostoSeleccionado(null)
        setConteoAdmin(null)
      }

      alert(
        `El costo ${costo.numero_costo} fue reiniciado correctamente.`
      )

      await cargarCostos()
    } catch (error) {
      console.error(
        'Error reiniciando costo:',
        error
      )

      alert(
        error?.message ||
        'No se pudo reiniciar el costo.'
      )
    } finally {
      setReiniciando(null)
    }
  }


  // ==========================================================
  // BÚSQUEDA
  // ==========================================================

  function manejarBusqueda(valor) {
    setBusqueda(valor)

    const sesion = cargarSesionAdmin(usuarioId)

    if (sesion?.view === 'detalle') {
      guardarSesionAdmin(usuarioId, {
        ...sesion,
        busqueda: valor
      })

      return
    }

    if (sesion?.view === 'conteo') {
      guardarSesionAdmin(usuarioId, {
        ...sesion,
        busqueda: valor
      })

      return
    }

    guardarSesionAdmin(usuarioId, {
      view: 'lista',
      busqueda: valor
    })
  }


  // ==========================================================
  // FILTRO
  // ==========================================================

  const costosFiltrados = costos.filter(
    costo =>
      String(costo.numero_costo)
        .toLowerCase()
        .includes(busqueda.toLowerCase())
  )


  // ==========================================================
  // RESUMEN
  // ==========================================================

  const totalCostos = costos.length

  const costosPendientes = costos.filter(
    costo => costo.estado === 'pendiente'
  ).length

  const costosEnProceso = costos.filter(
    costo => costo.estado === 'en_proceso'
  ).length

  const costosTerminados = costos.filter(
    costo => costo.estado === 'terminado'
  ).length


  // ==========================================================
  // MOSTRAR CONTEO ADMIN
  // ==========================================================

  if (conteoAdmin) {
    return (
      <ConteoAdmin
        costo={conteoAdmin.costo}
        numeroConteo={conteoAdmin.numeroConteo}
        onGuardado={manejarConteoGuardado}
        onVolver={volverDesdeConteo}
      />
    )
  }


  // ==========================================================
  // MOSTRAR DETALLE
  // ==========================================================

  if (costoSeleccionado) {
    return (
      <DetalleCosto
        costo={costoSeleccionado}
        onVolver={volverDesdeDetalle}
      />
    )
  }


  // ==========================================================
  // INTERFAZ
  // ==========================================================

  return (
    <section className="costos-admin">

      {/* ENCABEZADO */}

      <header className="costos-admin-header">
        <div className="costos-admin-heading">
          <span className="costos-admin-label">
            Control de costos
          </span>

          <h3>
            Costos registrados
          </h3>

          <p>
            Consulta, supervisa y habilita los conteos
            correspondientes a cada costo.
          </p>
        </div>
      </header>


      {/* RESUMEN */}

      <div className="costos-summary-grid">

        <div className="costos-summary-card">
          <div className="costos-summary-icon blue">#</div>
          <div>
            <span>Total</span>
            <strong>{totalCostos}</strong>
          </div>
        </div>

        <div className="costos-summary-card">
          <div className="costos-summary-icon orange">!</div>
          <div>
            <span>Pendientes</span>
            <strong>{costosPendientes}</strong>
          </div>
        </div>

        <div className="costos-summary-card">
          <div className="costos-summary-icon purple">↻</div>
          <div>
            <span>En proceso</span>
            <strong>{costosEnProceso}</strong>
          </div>
        </div>

        <div className="costos-summary-card">
          <div className="costos-summary-icon green">✓</div>
          <div>
            <span>Terminados</span>
            <strong>{costosTerminados}</strong>
          </div>
        </div>

      </div>


      {/* HERRAMIENTAS */}

      <div className="costos-toolbar">
        <div className="costos-search">
          <input
            type="text"
            placeholder="Buscar por número de costo..."
            value={busqueda}
            onChange={e => manejarBusqueda(e.target.value)}
            aria-label="Buscar costo"
          />

          {busqueda && (
            <button
              type="button"
              className="costos-search-clear"
              onClick={() => manejarBusqueda('')}
              title="Limpiar búsqueda"
              aria-label="Limpiar búsqueda"
            >
              ×
            </button>
          )}
        </div>

        <div className="costos-results-count">
          <strong>{costosFiltrados.length}</strong>
          <span>
            {costosFiltrados.length === 1
              ? ' costo'
              : ' costos'}
          </span>
        </div>
      </div>


      {/* CARGANDO */}

      {loading && (
        <div className="costos-empty-card">
          <div className="costos-loading-spinner"></div>
          <h4>Cargando costos</h4>
          <p>Estamos obteniendo la información...</p>
        </div>
      )}


      {/* SIN RESULTADOS */}

      {!loading && costosFiltrados.length === 0 && (
        <div className="costos-empty-card">
          <div className="costos-empty-icon">
            {busqueda ? '⌕' : '+'}
          </div>

          <h4>
            {busqueda
              ? 'No encontramos resultados'
              : 'No existen costos registrados'}
          </h4>

          <p>
            {busqueda
              ? 'Intenta buscar utilizando otro número de costo.'
              : 'Cuando registres un nuevo costo aparecerá aquí.'}
          </p>

          {busqueda && (
            <button
              className="costos-clear-button"
              type="button"
              onClick={() => manejarBusqueda('')}
            >
              Limpiar búsqueda
            </button>
          )}
        </div>
      )}


      {/* TABLA */}

      {!loading && costosFiltrados.length > 0 && (
        <div className="costos-table-wrapper">
          <table className="costos-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Estado</th>
                <th>Líneas</th>
                <th>Conteo actual</th>
                <th>Resultado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {costosFiltrados.map(costo => (
                <tr key={costo.id}>

                  {/* NÚMERO */}

                  <td>
                    <div className="costos-number-cell">
                      <div className="costos-number-icon">#</div>

                      <div>
                        <strong>{costo.numero_costo}</strong>
                        <span>Costo registrado</span>
                      </div>
                    </div>
                  </td>


                  {/* ESTADO */}

                  <td>
                    <StatusBadge estado={costo.estado} />
                  </td>


                  {/* LÍNEAS */}

                  <td>
                    <span className="costos-lines-value">
                      {costo.lineas_count}
                    </span>
                  </td>


                  {/* CONTEO */}

                  <td>
                    <span
                      className={
                        Number(costo.conteo_habilitado) === 0
                          ? 'conteo-pill none'
                          : 'conteo-pill active'
                      }
                    >
                      <span className="conteo-pill-dot"></span>

                      {Number(costo.conteo_habilitado) === 0
                        ? 'Ninguno'
                        : `Conteo ${costo.conteo_habilitado}`}
                    </span>
                  </td>


                  {/* RESULTADO */}

                  <td>
                    {costo.resultado ? (
                      <span
                        className={
                          costo.resultado === 'conforme'
                            ? 'resultado-pill conforme'
                            : 'resultado-pill diferencia'
                        }
                      >
                        <span>
                          {costo.resultado === 'conforme'
                            ? '✓'
                            : '!'}
                        </span>

                        {costo.resultado === 'conforme'
                          ? 'Conforme'
                          : 'No conforme'}
                      </span>
                    ) : (
                      <span className="resultado-pendiente">
                        Pendiente
                      </span>
                    )}
                  </td>


                  {/* ACCIONES */}

                  <td>
                    <div className="costos-actions">

                      {/* VER DETALLE */}

                      <button
                        className="costos-view-button"
                        onClick={() => verDetalle(costo)}
                        type="button"
                        disabled={reiniciando === costo.id}
                      >
                        Ver detalle
                      </button>


                      {/* REALIZAR CONTEO */}

                      {[1, 2, 3].includes(
                        Number(costo.conteo_habilitado)
                      ) && (
                        <button
                          className="costos-admin-count-button"
                          onClick={() => realizarConteo(costo)}
                          disabled={
                            reiniciando === costo.id ||
                            habilitando === costo.id ||
                            abriendoConteo === costo.id
                          }
                          type="button"
                        >
                          {abriendoConteo === costo.id ? (
                            <>
                              <span className="button-spinner"></span>
                              Verificando acceso...
                            </>
                          ) : (
                            <>
                              <span className="action-icon">✓</span>
                              Realizar conteo
                            </>
                          )}
                        </button>
                      )}


                      {/* HABILITAR CONTEO 2 */}

                      {Number(costo.conteo_habilitado) === 1 && (
                        <button
                          className="costos-count-button"
                          onClick={() => habilitarConteo2(costo)}
                          disabled={
                            habilitando === costo.id ||
                            reiniciando === costo.id
                          }
                          type="button"
                        >
                          {habilitando === costo.id ? (
                            <>
                              <span className="button-spinner"></span>
                              Habilitando...
                            </>
                          ) : (
                            <>
                              Conteo 2
                              <span>→</span>
                            </>
                          )}
                        </button>
                      )}


                      {/* HABILITAR CONTEO 3 */}

                      {Number(costo.conteo_habilitado) === 2 && (
                        <button
                          className="costos-count-button"
                          onClick={() => habilitarConteo3(costo)}
                          disabled={
                            habilitando === costo.id ||
                            reiniciando === costo.id
                          }
                          type="button"
                        >
                          {habilitando === costo.id ? (
                            <>
                              <span className="button-spinner"></span>
                              Habilitando...
                            </>
                          ) : (
                            <>
                              Conteo 3
                              <span>→</span>
                            </>
                          )}
                        </button>
                      )}


                      {/* REINICIAR */}

                      <button
                        className="costos-reset-button"
                        onClick={() => manejarReinicio(costo)}
                        disabled={
                          reiniciando === costo.id ||
                          habilitando === costo.id ||
                          abriendoConteo === costo.id
                        }
                        type="button"
                      >
                        {reiniciando === costo.id ? (
                          <>
                            <span className="button-spinner"></span>
                            Reiniciando...
                          </>
                        ) : (
                          <>
                            <span className="action-icon">↻</span>
                            Reiniciar
                          </>
                        )}
                      </button>

                    </div>
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </section>
  )
}

export default CostosAdmin