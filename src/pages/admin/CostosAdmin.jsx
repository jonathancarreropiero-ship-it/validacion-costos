
import { useCallback, useEffect, useState } from 'react'

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
  const [aviso, setAviso] = useState(null)
  const [costoPorReiniciar, setCostoPorReiniciar] = useState(null)


  function mostrarAviso(mensaje) {
    setAviso({ mensaje: String(mensaje), tipo: /no se pudo|no puedes|error/i.test(String(mensaje)) ? 'error' : 'success' })
  }

  // ==========================================================
  // CARGAR COSTOS
  // ==========================================================

  const cargarCostos = useCallback(async () => {
    await Promise.resolve()
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

      const costosActualizados = [...(data || [])]
      const resultadosPersistidos = new Map(costosActualizados.map(costo => [
        String(costo.id),
        (() => {
          const resultado = String(costo.resultado || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
          return resultado === 'diferencia' ? 'no_conforme' : resultado
        })()
      ]))
      for (const costo of costosActualizados) {
        costo.resultado = null
        costo.conteos_registrados = []
        costo.numero_ultimo_conteo = null
      }
      const idsCostos = costosActualizados.map(costo => costo.id)

      if (idsCostos.length) {
        const { data: detalles, error: errorDetalles } = await supabase
          .from('detalle_costos')
          .select('id, costo_id')
          .in('costo_id', idsCostos)
        if (errorDetalles) throw errorDetalles

        const detallePorId = new Map((detalles || []).map(detalle => [String(detalle.id), String(detalle.costo_id)]))
        const idsDetalles = (detalles || []).map(detalle => detalle.id)
        if (idsDetalles.length) {
          const { data: conteos, error: errorConteos } = await supabase
            .from('conteos')
            .select('detalle_costo_id, numero_conteo, resultado')
            .in('detalle_costo_id', idsDetalles)
          if (errorConteos) throw errorConteos

          const resumenPorCosto = new Map()
          const conteosRegistradosPorCosto = new Map()
          for (const conteo of conteos || []) {
            const costoId = detallePorId.get(String(conteo.detalle_costo_id))
            if (!costoId) continue
            const numero = Number(conteo.numero_conteo)
            if (!conteosRegistradosPorCosto.has(costoId)) conteosRegistradosPorCosto.set(costoId, new Set())
            conteosRegistradosPorCosto.get(costoId).add(numero)
            const resumen = resumenPorCosto.get(costoId)
            if (!resumen || numero > resumen.numero) {
              resumenPorCosto.set(costoId, { numero, lineas: 0, diferencias: 0, resultados: 0 })
            }
            const ultimo = resumenPorCosto.get(costoId)
            if (numero !== ultimo.numero) continue
            ultimo.lineas += 1
            const resultadoConteo = String(conteo.resultado || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
            if (resultadoConteo === 'diferencia' || resultadoConteo === 'no_conforme') {
              ultimo.diferencias += 1
              ultimo.resultados += 1
            }
            if (resultadoConteo === 'conforme') ultimo.resultados += 1
          }

          for (const costo of costosActualizados) {
            const clave = String(costo.id)
            const resumen = resumenPorCosto.get(clave)
            const registrados = conteosRegistradosPorCosto.get(clave)
            costo.conteos_registrados = registrados ? [...registrados] : []
            costo.numero_ultimo_conteo = resumen?.numero ?? null
            const resultadoDerivado = resumen &&
              resumen.lineas === Number(costo.lineas_count) &&
              resumen.resultados === Number(costo.lineas_count)
              ? (resumen.diferencias > 0 ? 'no_conforme' : 'conforme')
              : null
            const resultadoGuardado = resultadosPersistidos.get(clave)
            costo.resultado = resultadoDerivado || (
              registrados?.size > 0 && String(costo.estado || '').toLowerCase() === 'terminado'
              && ['conforme', 'no_conforme'].includes(resultadoGuardado)
                ? resultadoGuardado
                : null
            )

            // El admin puede leer todas las líneas. Publicar el resultado
            // completo en la fila compartida para que otros auditores lo vean
            // aunque sus permisos no incluyan el detalle de conteos.
            if (resultadoDerivado && resultadoGuardado !== resultadoDerivado) {
              const resultadoPersistido = resultadoDerivado === 'no_conforme'
                ? 'diferencia'
                : resultadoDerivado
              const { error: errorPublicacion } = await supabase
                .from('costos')
                .update({ resultado: resultadoPersistido })
                .eq('id', costo.id)

              if (errorPublicacion) {
                console.error('No se pudo compartir el resultado calculado:', errorPublicacion)
              }
            }
          }
        }
      }

      setCostos(costosActualizados)
      localStorage.setItem('validacion-costos-admin-' + usuarioId + '-costos-offline', JSON.stringify(costosActualizados))
    } catch (error) {
      console.error('Error cargando costos:', error)
      try {
        const cache = localStorage.getItem('validacion-costos-admin-' + usuarioId + '-costos-offline')
        if (cache) setCostos(JSON.parse(cache))
      } catch (errorCache) {
        console.error('No se pudo recuperar la lista local:', errorCache)
      }
    } finally {
      setLoading(false)
    }
  }, [usuarioId])

  useEffect(() => {
    const timer = window.setTimeout(() => cargarCostos(), 0)
    return () => window.clearTimeout(timer)
  }, [cargarCostos])


  // ==========================================================
  // RESTAURAR SESIÓN
  // ==========================================================

  useEffect(() => {
    let activo = true
    async function restaurarSesion() {
      await Promise.resolve()
      if (!activo) return
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

      const restaurarConteoLocal = () => setConteoAdmin({ costo, numeroConteo })
      if (!navigator.onLine) {
        restaurarConteoLocal()
        return
      }

      iniciarCosto(costo.id)
        .then(restaurarConteoLocal)
        .catch(async error => {
          console.error(
            'No se pudo restaurar el conteo del administrador:',
            error
          )

          limpiarSesionAdmin(usuarioId)

          mostrarAviso(
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
    }

    restaurarSesion()
    return () => {
      activo = false
    }
  }, [
    usuarioId,
    loading,
    costos,
    restauracionRealizada,
    cargarCostos
  ])


  // ==========================================================
  // REALIZAR CONTEO
  // Validar el responsable antes de abrir la pantalla.
  // ==========================================================

  async function realizarConteo(costo) {
    const numeroConteo = Number(costo.conteo_habilitado)

    if (![1, 2, 3].includes(numeroConteo)) {
      mostrarAviso(
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

      mostrarAviso(
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

  async function manejarConteoGuardado(resultadoGuardado) {
    const resultado = String(resultadoGuardado?.resultado || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')

    limpiarSesionAdmin(usuarioId)
    setConteoAdmin(null)

    await cargarCostos()

    if (resultado === 'conforme' || resultado === 'no_conforme') {
      setCostos(actuales => {
        const actualizados = actuales.map(costo =>
          Number(costo.id) === Number(resultadoGuardado.costoId)
            ? { ...costo, resultado }
            : costo
        )
        try {
          localStorage.setItem(`validacion-costos-admin-${usuarioId}-costos-offline`, JSON.stringify(actualizados))
        } catch (errorCache) {
          console.error('No se pudo actualizar la lista local:', errorCache)
        }
        return actualizados
      })
    }
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

      mostrarAviso(
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

      mostrarAviso(
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

  function manejarReinicio(costo) {
    setCostoPorReiniciar(costo)
  }

  async function confirmarReinicio() {
    const costo = costoPorReiniciar
    if (!costo) return
    setCostoPorReiniciar(null)

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

      mostrarAviso(
        `El costo ${costo.numero_costo} fue reiniciado correctamente.`
      )

      await cargarCostos()
    } catch (error) {
      console.error(
        'Error reiniciando costo:',
        error
      )

      mostrarAviso(
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
    costo =>
      costo.estado === 'pendiente' &&
      String(costo.resultado || '').trim().toLowerCase() !== 'conforme'
  ).length

  const costosEnProceso = costos.filter(
    costo =>
      costo.estado === 'en_proceso' &&
      String(costo.resultado || '').trim().toLowerCase() !== 'conforme'
  ).length

  const costosTerminados = costos.filter(
    costo =>
      costo.estado === 'terminado' ||
      String(costo.resultado || '').trim().toLowerCase() === 'conforme'
  ).length


  // ==========================================================
  // MOSTRAR CONTEO ADMIN
  // ==========================================================

  if (conteoAdmin) {
    return (
      <ConteoAdmin
        usuarioId={usuarioId}
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
                    <StatusBadge
                      estado={
                        String(costo.resultado || '').trim().toLowerCase() === 'conforme'
                          ? 'conforme'
                          : costo.estado
                      }
                    />
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
                        {costo.numero_ultimo_conteo ? 'Pendiente' : 'Sin conteo'}
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
                      ) && String(costo.resultado || '').trim().toLowerCase() !== 'conforme' && (
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

                      {Number(costo.conteo_habilitado) === 1 && String(costo.resultado || '').trim().toLowerCase() !== 'conforme' && (
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

                      {Number(costo.conteo_habilitado) === 2 && String(costo.resultado || '').trim().toLowerCase() !== 'conforme' && (
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

      {aviso && (
        <div className="ui-notice-backdrop" role="presentation" onClick={() => setAviso(null)}>
          <section className="ui-notice" role="alertdialog" aria-modal="true" aria-labelledby="ui-notice-title" onClick={event => event.stopPropagation()}>
            <span className={`ui-notice-icon ui-notice-${aviso.tipo}`} aria-hidden="true">{aviso.tipo === 'error' ? '!' : '✓'}</span>
            <h2 id="ui-notice-title">{aviso.tipo === 'error' ? 'No se pudo completar' : 'Operación completada'}</h2>
            <p>{aviso.mensaje}</p>
            <button type="button" className="ui-notice-button" onClick={() => setAviso(null)}>Entendido</button>
          </section>
        </div>
      )}
      {costoPorReiniciar && (
        <div className="ui-notice-backdrop" role="presentation">
          <section className="ui-notice" role="alertdialog" aria-modal="true" aria-labelledby="ui-confirm-title">
            <span className="ui-notice-icon ui-notice-warning" aria-hidden="true">!</span>
            <h2 id="ui-confirm-title">¿Reiniciar el costo {costoPorReiniciar.numero_costo}?</h2>
            <p>Se eliminarán los conteos y no manifestados realizados hasta ahora, y se liberará el costo para otro auditor. Los productos originales se conservarán.</p>
            <div className="ui-notice-actions">
              <button type="button" className="ui-notice-secondary" onClick={() => setCostoPorReiniciar(null)}>Cancelar</button>
              <button type="button" className="ui-notice-button ui-notice-danger" onClick={confirmarReinicio}>Reiniciar costo</button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default CostosAdmin
