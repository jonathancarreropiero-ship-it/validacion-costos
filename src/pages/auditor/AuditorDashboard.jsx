
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from '../../supabaseClient'
import { notificarCambioCosto } from '../../services/sincronizacionCostos'

import {
  estaOnline,
  escucharConexion,
  contarPendientesOffline
} from '../../services/offlineStorage'

import {
  obtenerCostosAuditor,
  obtenerDetallesAuditor,
  guardarConteoCosto,
  iniciarCosto,
  renovarBloqueoCosto,
  obtenerEstadoConteoCompartido,
  obtenerResumenConteoCompartido
} from '../../services/costos'

import ConteoAuditor from './ConteoAuditor'
import ScrollableTable from '../../components/ScrollableTable'
import AuditorCostos from './AuditorCostos'
import ValidationNotice from '../../components/ValidationNotice'

// ==========================================================
// BORRADOR GENERAL
// ==========================================================

function obtenerClaveBorradorGeneral(usuarioId, costoId, numeroConteo) {
  return `validacion-costos-usuario-${usuarioId}-costo-${costoId}-conteo-${numeroConteo}`
}

function obtenerClaveBorradorNoManifestados(usuarioId, costoId, numeroConteo) {
  return `${obtenerClaveBorradorGeneral(usuarioId, costoId, numeroConteo)}-no-manifestados`
}

function obtenerClaveSesion(usuarioId) {
  return `validacion-costos-usuario-${usuarioId}-sesion`
}

// ==========================================================
// GUARDAR BORRADOR GENERAL
// ==========================================================

function guardarBorradorGeneral(usuarioId, costoId, numeroConteo, datos) {
  if (!usuarioId || !costoId || !numeroConteo) return

  try {
    const clave = obtenerClaveBorradorGeneral(
      usuarioId,
      costoId,
      numeroConteo
    )

    localStorage.setItem(
      clave,
      JSON.stringify({
        usuarioId,
        costoId,
        numeroConteo,
        ...datos,
        updatedAt: new Date().toISOString()
      })
    )
  } catch (error) {
    console.error('No se pudo guardar el borrador general:', error)
  }
}

// ==========================================================
// CARGAR BORRADOR GENERAL
// ==========================================================

function cargarBorradorGeneral(usuarioId, costoId, numeroConteo) {
  if (!usuarioId || !costoId || !numeroConteo) return null

  try {
    const clave = obtenerClaveBorradorGeneral(
      usuarioId,
      costoId,
      numeroConteo
    )

    const guardado = localStorage.getItem(clave)
    if (!guardado) return null

    const borrador = JSON.parse(guardado)

    if (
      !borrador ||
      String(borrador.usuarioId) !== String(usuarioId) ||
      Number(borrador.costoId) !== Number(costoId) ||
      Number(borrador.numeroConteo) !== Number(numeroConteo)
    ) {
      return null
    }

    return borrador
  } catch (error) {
    console.error('No se pudo cargar el borrador general:', error)
    return null
  }
}

function guardarNoManifestadosLocal(usuarioId, costoId, numeroConteo, datos) {
  if (!usuarioId || !costoId || !numeroConteo) return false

  try {
    localStorage.setItem(
      obtenerClaveBorradorNoManifestados(usuarioId, costoId, numeroConteo),
      JSON.stringify({ usuarioId, costoId, numeroConteo, ...datos, updatedAt: new Date().toISOString() })
    )
    return true
  } catch (error) {
    console.error('No se pudieron guardar los no manifestados localmente:', error)
    return false
  }
}

function cargarNoManifestadosLocal(usuarioId, costoId, numeroConteo) {
  if (!usuarioId || !costoId || !numeroConteo) return null

  try {
    const guardado = localStorage.getItem(
      obtenerClaveBorradorNoManifestados(usuarioId, costoId, numeroConteo)
    )
    if (!guardado) return null
    const borrador = JSON.parse(guardado)
    if (
      String(borrador?.usuarioId) !== String(usuarioId) ||
      Number(borrador?.costoId) !== Number(costoId) ||
      Number(borrador?.numeroConteo) !== Number(numeroConteo)
    ) return null
    return borrador
  } catch (error) {
    console.error('No se pudieron recuperar los no manifestados locales:', error)
    return null
  }
}

// ==========================================================
// GUARDAR SESIÓN
// ==========================================================

function guardarSesionActual(usuarioId, datos) {
  if (!usuarioId) return

  try {
    localStorage.setItem(
      obtenerClaveSesion(usuarioId),
      JSON.stringify({
        usuarioId,
        ...datos,
        updatedAt: new Date().toISOString()
      })
    )
  } catch (error) {
    console.error('No se pudo guardar la sesión:', error)
  }
}

// ==========================================================
// CARGAR SESIÓN
// ==========================================================

function cargarSesionActual(usuarioId) {
  if (!usuarioId) return null

  try {
    const guardado = localStorage.getItem(obtenerClaveSesion(usuarioId))
    if (!guardado) return null

    const sesion = JSON.parse(guardado)

    if (
      !sesion ||
      String(sesion.usuarioId) !== String(usuarioId)
    ) {
      return null
    }

    return sesion
  } catch (error) {
    console.error('No se pudo cargar la sesión:', error)
    return null
  }
}

// ==========================================================
// LIMPIAR SESIÓN
// ==========================================================

function limpiarSesionActual(usuarioId) {
  if (!usuarioId) return

  try {
    localStorage.removeItem(obtenerClaveSesion(usuarioId))
  } catch (error) {
    console.error('No se pudo limpiar la sesión:', error)
  }
}

// ==========================================================
// LIMPIAR BORRADORES DE UN CONTEO
// ==========================================================

function limpiarBorradoresCosto(usuarioId, costoId, numeroConteo, opciones = {}) {
  if (!usuarioId || !costoId || !numeroConteo) return

  try {
    const prefijo =
      `validacion-costos-usuario-${usuarioId}-costo-${costoId}-detalle-`

    const sufijo = `-conteo-${numeroConteo}`
    const claves = []

    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i)

      if (
        clave &&
        clave.startsWith(prefijo) &&
        clave.endsWith(sufijo)
      ) {
        claves.push(clave)
      }
    }

    claves.forEach(clave => localStorage.removeItem(clave))

    localStorage.removeItem(
      obtenerClaveBorradorGeneral(
        usuarioId,
        costoId,
        numeroConteo
      )
    )
    if (!opciones.conservarNoManifestados) {
      localStorage.removeItem(
        obtenerClaveBorradorNoManifestados(usuarioId, costoId, numeroConteo)
      )
    }
  } catch (error) {
    console.error('No se pudieron limpiar los borradores:', error)
  }
}

// ==========================================================
// INDICADOR DE CONEXIÓN
// ==========================================================

function IndicadorConexion({ conexionOnline, pendientesOffline }) {
  return (
    <div
      className={`conexion-indicador ${
        conexionOnline ? 'conexion-online' : 'conexion-offline'
      }`}
      title={
        conexionOnline
          ? 'Conexión disponible'
          : 'Sin conexión a Internet'
      }
    >
      <span
        className="conexion-indicador-dot"
        aria-hidden="true"
      />

      <div className="conexion-indicador-info">
        <strong>
          {conexionOnline ? 'Conectado' : 'Sin conexión'}
        </strong>

        <span>
          {conexionOnline
            ? pendientesOffline > 0
              ? `${pendientesOffline} cambio${
                  pendientesOffline === 1 ? '' : 's'
                } pendiente${
                  pendientesOffline === 1 ? '' : 's'
                }`
              : 'Sincronizado'
            : 'Los avances se guardan localmente'}
        </span>
      </div>
    </div>
  )
}

// ==========================================================
// VENTANA DE RESULTADO DEL CONTEO
// ==========================================================

function ModalResultadoConteo({ resultado, onCerrar, onReintentar, reintentando }) {
  if (!resultado) return null

  const esConforme = resultado.resultado === 'conforme'
  const esNoConforme = resultado.resultado === 'no_conforme'

  const color = esConforme
    ? '#15803d'
    : esNoConforme
      ? '#b91c1c'
      : '#475569'

  const fondo = esConforme
    ? '#dcfce7'
    : esNoConforme
      ? '#fee2e2'
      : '#f1f5f9'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="resultado-guardado-titulo"
      onClick={evento => {
        if (evento.target === evento.currentTarget) {
          onCerrar()
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          maxHeight: 'calc(100dvh - 32px)',
          overflowY: 'auto',
          background: '#ffffff',
          borderRadius: '20px',
          padding: 'clamp(22px, 5vw, 32px)',
          textAlign: 'center',
          boxShadow: '0 24px 70px rgba(0, 0, 0, 0.3)',
          boxSizing: 'border-box'
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: '70px',
            height: '70px',
            borderRadius: '50%',
            margin: '0 auto 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '36px',
            fontWeight: 800,
            color,
            background: fondo
          }}
        >
          {esConforme ? '✓' : esNoConforme ? '!' : '?'}
        </div>

        <h2
          id="resultado-guardado-titulo"
          style={{
            margin: '0 0 10px',
            fontSize: 'clamp(21px, 5vw, 26px)',
            lineHeight: 1.3,
            color: '#0f172a'
          }}
        >
          Conteo {resultado.conteo} registrado
        </h2>

        <p
          style={{
            margin: '0 0 12px',
            fontSize: 'clamp(20px, 5vw, 24px)',
            fontWeight: 900,
            letterSpacing: '0.4px',
            color
          }}
        >
          {resultado.resultadoTexto}
        </p>

        {!esConforme && !esNoConforme && (
          <p
            style={{
              margin: '0 0 18px',
              color: '#64748b',
              fontSize: '14px',
              lineHeight: 1.5
            }}
          >
            El conteo se guardó, pero la respuesta no incluyó un
            resultado reconocido. Consulta el detalle con el administrador.
          </p>
        )}

        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '16px',
            margin: '20px 0',
            textAlign: 'left'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              paddingBottom: '12px',
              borderBottom: '1px solid #e2e8f0'
            }}
          >
            <span style={{ color: '#475569', fontSize: '14px' }}>
              Líneas conformes
            </span>

            <strong
              style={{
                color: '#15803d',
                fontSize: '20px',
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {resultado.lineasConformes ?? '—'}
            </strong>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              paddingTop: '12px'
            }}
          >
            <span style={{ color: '#475569', fontSize: '14px' }}>
              Líneas no conformes
            </span>

            <strong
              style={{
                color: '#b91c1c',
                fontSize: '20px',
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {resultado.lineasDiferencia ?? '—'}
            </strong>
          </div>
        </div>

        {resultado.factoresModificados?.length > 0 && (
          <section className="auditor-saved-factor-changes" aria-label="Factores modificados en este conteo">
            <div>
              <strong>Factores modificados</strong>
              <span>{resultado.factoresModificados.length} {resultado.factoresModificados.length === 1 ? 'línea modificada' : 'líneas modificadas'}</span>
            </div>
            <ul>
              {resultado.factoresModificados.map(item => (
                <li key={item.id}>
                  <strong>{item.sku}</strong>
                  <span>Plantilla × {item.factorPlantilla} <b>→</b> Aplicado × {item.factorAplicado}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {resultado.advertencia && (
          <div
            role="alert"
            style={{
              padding: '12px',
              borderRadius: '10px',
              background: '#fffbeb',
              border: '1px solid #fcd34d',
              color: '#92400e',
              fontSize: '13px',
              lineHeight: 1.5,
              textAlign: 'left',
              marginBottom: '18px'
            }}
          >
            {resultado.advertencia}
          </div>
        )}

        {resultado.advertencia && onReintentar && (
          <button
            type="button"
            onClick={onReintentar}
            disabled={reintentando}
            style={{
              width: '100%',
              border: '1px solid #f59e0b',
              borderRadius: '12px',
              padding: '12px 18px',
              background: '#fffbeb',
              color: '#92400e',
              fontSize: '14px',
              fontWeight: 800,
              cursor: reintentando ? 'wait' : 'pointer',
              minHeight: '46px',
              marginBottom: '10px'
            }}
          >
            {reintentando ? 'Reintentando guardado...' : 'Reintentar guardado de no manifestados'}
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            onCerrar?.()
            window.location.reload()
          }}
          autoFocus
          style={{
            width: '100%',
            border: 'none',
            borderRadius: '12px',
            padding: '14px 18px',
            background: '#15803d',
            color: '#ffffff',
            fontSize: '15px',
            fontWeight: 800,
            cursor: 'pointer',
            minHeight: '48px'
          }}
        >
          Entendido, continuar
        </button>
      </div>
    </div>
  )
}

// ==========================================================
// COMPONENTE PRINCIPAL
// ==========================================================

function AuditorDashboard() {
  const sesionActualRef = useRef(null)
  const cancelarEsperaApoyoRef = useRef(false)
  const [usuarioId, setUsuarioId] = useState(null)
  const [usuarioNombre, setUsuarioNombre] = useState('Auditor')
  const [costos, setCostos] = useState([])
  const [costoSeleccionado, setCostoSeleccionado] = useState(null)
  const [detalles, setDetalles] = useState([])
  const [borradores, setBorradores] = useState({})
  const [noManifestados, setNoManifestados] = useState([])

  const [nuevoNoManifestado, setNuevoNoManifestado] = useState({
    sku: '',
    cantidad: '',
    observacion: ''
  })

  const [busqueda, setBusqueda] = useState('')
  const [filtroFactorModificado, setFiltroFactorModificado] = useState('todos')
  const [versionLimpieza, setVersionLimpieza] = useState(0)
  const [restauracionRealizada, setRestauracionRealizada] = useState(false)
  const [loading, setLoading] = useState(true)
  const [errorCargaCostos, setErrorCargaCostos] = useState(false)
  const [loadingDetalles, setLoadingDetalles] = useState(false)
  const [esperandoApoyo, setEsperandoApoyo] = useState(false)
  const [apoyoGuardadoPendiente, setApoyoGuardadoPendiente] = useState(false)
  const [apoyoConteoCompletado, setApoyoConteoCompletado] = useState(false)
  const [guardandoCosto, setGuardandoCosto] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [resultadoGuardado, setResultadoGuardado] = useState(null)
  const [noManifestadosPendientes, setNoManifestadosPendientes] = useState(null)
  const [reintentandoNoManifestados, setReintentandoNoManifestados] = useState(false)
  const [avisoNoManifestadosCerrado, setAvisoNoManifestadosCerrado] = useState(false)

  const [conexionOnline, setConexionOnline] = useState(estaOnline())
  const [pendientesOffline, setPendientesOffline] = useState(0)
  const apoyoCostoId = costoSeleccionado?.id
  const apoyoNumeroConteo = costoSeleccionado?.conteo_habilitado

  useEffect(() => {
    if (!apoyoGuardadoPendiente || apoyoConteoCompletado || !apoyoCostoId) return undefined
    let activo = true
    let timer
    const consultar = async () => {
      try {
        const estado = await obtenerEstadoConteoCompartido(apoyoCostoId, apoyoNumeroConteo)
        if (!activo) return
        if (estado?.completado) {
          const resumen = await obtenerResumenConteoCompartido(apoyoCostoId, apoyoNumeroConteo)
          if (!activo) return
          setResultadoGuardado({
            conteo: Number(apoyoNumeroConteo),
            resultado: estado.resultado === 'conforme' ? 'conforme' : 'no_conforme',
            resultadoTexto: estado.resultado === 'conforme' ? 'CONFORME' : 'NO CONFORME',
            lineasConformes: resumen.lineasConformes,
            lineasDiferencia: resumen.lineasDiferencia,
            factoresModificados: []
          })
          setApoyoConteoCompletado(true)
          return
        }
      } catch (estadoError) {
        console.error('No se pudo consultar el estado del conteo compartido:', estadoError)
        if (/no hay un conteo compartido activo|no existe.*sesión|no está disponible/i.test(String(estadoError?.message || ''))) {
          if (activo) {
            setError('El administrador reinició el costo. Tu conteo se cerró y el acceso quedó liberado.')
            setApoyoGuardadoPendiente(false)
            setApoyoConteoCompletado(false)
            setCostoSeleccionado(null)
            setDetalles([])
            setBorradores({})
            setNoManifestados([])
            limpiarSesionActual(usuarioId)
          }
          return
        }
      }
      timer = window.setTimeout(consultar, 2500)
    }
    timer = window.setTimeout(consultar, 2500)
    return () => { activo = false; window.clearTimeout(timer) }
  }, [apoyoGuardadoPendiente, apoyoConteoCompletado, apoyoCostoId, apoyoNumeroConteo, usuarioId])

  // ==========================================================
  // CERRAR VENTANA DEL RESULTADO
  // ==========================================================

  function cerrarResultadoGuardado() {
    setResultadoGuardado(null)
  }

  // ==========================================================
  // CERRAR SESIÓN
  // ==========================================================

  async function cerrarSesion() {
    try {
      limpiarSesionActual(usuarioId)
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Error cerrando sesión:', error)
      setError('No se pudo cerrar la sesión.')
    }
  }

  // ==========================================================
  // OBTENER USUARIO
  // ==========================================================

  useEffect(() => {
    async function obtenerUsuario() {
      const {
        data,
        error: errorUsuario
      } = await supabase.auth.getSession()

      if (errorUsuario) {
        console.error(errorUsuario)
        setError('No se pudo obtener el usuario.')
        setLoading(false)
        return
      }

      const user = data?.session?.user
      if (!user?.id) {
        setError('No se encontró una sesión activa.')
        setLoading(false)
        return
      }

      setUsuarioId(user.id)
      setUsuarioNombre(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Auditor')
    }

    obtenerUsuario()
  }, [])

  useEffect(() => {
    if (!usuarioId || noManifestadosPendientes) return

    let activo = true
    async function restaurarPendiente() {
      await Promise.resolve()
      const prefijo = `validacion-costos-usuario-${usuarioId}-costo-`
      for (let indice = 0; indice < localStorage.length; indice += 1) {
        const clave = localStorage.key(indice)
        if (!clave?.startsWith(prefijo) || !clave.endsWith('-no-manifestados-pendiente')) continue

        try {
          const pendiente = JSON.parse(localStorage.getItem(clave) || 'null')
          const borrador = cargarNoManifestadosLocal(
            usuarioId,
            pendiente?.costoId,
            pendiente?.numeroConteo
          )
          if (activo && borrador) {
            setNoManifestadosPendientes({
              costoId: pendiente.costoId,
              numeroConteo: pendiente.numeroConteo,
              registros: Array.isArray(borrador.noManifestados) ? borrador.noManifestados : []
            })
            break
          }
        } catch (error) {
          console.error('No se pudo recuperar la sincronización pendiente:', error)
        }
      }
    }
    restaurarPendiente()

    return () => {
      activo = false
    }
  }, [usuarioId, noManifestadosPendientes])

  // ==========================================================
  // DETECTAR CONEXIÓN
  // ==========================================================

  // ==========================================================
  // CARGAR PENDIENTES OFFLINE
  // ==========================================================

  useEffect(() => {
    async function cargarPendientesOffline() {
      if (!usuarioId) return

      try {
        const cantidad = await contarPendientesOffline({ usuarioId })
        setPendientesOffline(cantidad)
      } catch (error) {
        console.error('Error obteniendo pendientes offline:', error)
      }
    }

    cargarPendientesOffline()
  }, [usuarioId])

  // ==========================================================
  // CARGAR COSTOS
  // ==========================================================

  const cargarCostos = useCallback(async () => {
    await Promise.resolve()
    try {
      setLoading(true)
      setError('')

      const datos = await obtenerCostosAuditor()
      setCostos(datos || [])
      localStorage.setItem('validacion-costos-auditor-' + usuarioId + '-costos-offline', JSON.stringify(datos || []))
      setErrorCargaCostos(false)
    } catch (err) {
      console.error(err)
      const cacheLocal = localStorage.getItem('validacion-costos-auditor-' + usuarioId + '-costos-offline')
      const sinConexion = !navigator.onLine
      setErrorCargaCostos(true)
      if (cacheLocal) {
        setCostos(JSON.parse(cacheLocal))
        setError(sinConexion
          ? 'Sin conexión: se muestran los costos guardados en este equipo.'
          : 'No se pudieron actualizar los costos desde el servidor. Se muestran los datos guardados en este equipo.')
      } else {
        setError(sinConexion
          ? 'Sin conexión y no hay costos guardados en este equipo.'
          : 'No se pudieron cargar los costos desde el servidor. Intenta nuevamente.')
      }
    } finally {
      setLoading(false)
    }
  }, [usuarioId])

  useEffect(() => {
    const limpiarConexion = escucharConexion({
      alConectar: () => {
        setConexionOnline(true)
        cargarCostos()
      },
      alDesconectar: () => setConexionOnline(false)
    })

    return () => limpiarConexion()
  }, [cargarCostos])

  useEffect(() => {
    if (!usuarioId) return
    const timer = window.setTimeout(() => cargarCostos(), 0)
    return () => window.clearTimeout(timer)
  }, [usuarioId, cargarCostos])

  // ==========================================================
  // SELECCIONAR COSTO
  // ==========================================================

  const seleccionarCosto = useCallback(async (costo, opciones = {}) => {
    cancelarEsperaApoyoRef.current = false
    try {
      setError('')
      setMensaje('')
      setResultadoGuardado(null)

      if (costo.estado === 'terminado') {
        throw new Error('Este costo ya está terminado.')
      }

      const numeroConteo = Number(costo.conteo_habilitado)

      if (numeroConteo < 1 || numeroConteo > 3) {
        throw new Error('El costo no tiene un conteo habilitado.')
      }

      let accesoCosto = null
      if (conexionOnline) {
        try {
          accesoCosto = await iniciarCosto(costo.id)
          if (accesoCosto?.esperando_segundo) {
            setCostoSeleccionado(costo)
            setDetalles([])
            setLoadingDetalles(true)
            setEsperandoApoyo(true)
            while (accesoCosto?.esperando_segundo && !cancelarEsperaApoyoRef.current) {
              await new Promise(resolve => window.setTimeout(resolve, 2200))
              if (cancelarEsperaApoyoRef.current) return
              accesoCosto = await iniciarCosto(costo.id)
            }
            if (cancelarEsperaApoyoRef.current) return
            if (costo.apoyoHabilitado && !accesoCosto?.apoyo_habilitado) {
              throw new Error('El apoyo fue cancelado o el costo se reinició. Vuelve a la lista para ingresar nuevamente.')
            }
            setEsperandoApoyo(false)
          }
        } catch (errorInicio) {
          console.error('Error iniciando el costo:', errorInicio)
          throw new Error(errorInicio?.message || 'No se pudo iniciar el costo.', { cause: errorInicio })
        }
      } else {
        const sesionLocal = cargarSesionActual(usuarioId)
        if (Number(sesionLocal?.costoId) !== Number(costo.id) || Number(sesionLocal?.numeroConteo) !== numeroConteo) throw new Error('Sin conexión solo puedes retomar el costo ya iniciado en este equipo.')
      }

      setCostoSeleccionado({ ...costo, apoyoHabilitado: Boolean(accesoCosto?.apoyo_habilitado) })
      setDetalles([])
      setBorradores({})
      setNoManifestados([])
      setBusqueda(opciones.busqueda || '')
      setLoadingDetalles(true)

      const claveDetallesOffline = 'validacion-costos-auditor-' + usuarioId + '-' + costo.id + '-' + numeroConteo + '-detalles'
      let datos
      try { datos = await obtenerDetallesAuditor(costo.id, numeroConteo); localStorage.setItem(claveDetallesOffline, JSON.stringify(datos || [])) }
      catch (errorDetalles) { const local = !conexionOnline ? localStorage.getItem(claveDetallesOffline) : null; if (!local) throw errorDetalles; datos = JSON.parse(local) }
      setDetalles(datos || [])

      const borrador = cargarBorradorGeneral(
        usuarioId,
        costo.id,
        numeroConteo
      )

      if (borrador) {
        setNoManifestados(
          Array.isArray(borrador.noManifestados)
            ? borrador.noManifestados
            : []
        )
        if (borrador.nuevoNoManifestado) {
          setNuevoNoManifestado(borrador.nuevoNoManifestado)
        }
      }

      const borradorNoManifestados = cargarNoManifestadosLocal(
        usuarioId,
        costo.id,
        numeroConteo
      )
      if (borradorNoManifestados) {
        setNoManifestados(
          Array.isArray(borradorNoManifestados.noManifestados)
            ? borradorNoManifestados.noManifestados
            : []
        )
        setNuevoNoManifestado(
          borradorNoManifestados.nuevoNoManifestado || {
            sku: '',
            cantidad: '',
            observacion: ''
          }
        )
      }

      guardarSesionActual(usuarioId, {
        costoId: costo.id,
        numeroConteo,
        busqueda: opciones.busqueda || ''
      })
      sesionActualRef.current = {
        costoId: costo.id,
        numeroConteo,
        busqueda: opciones.busqueda || ''
      }
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No se pudo abrir el costo.')
      setCostoSeleccionado(null)
      setEsperandoApoyo(false)
    } finally {
      setLoadingDetalles(false)
    }
  }, [conexionOnline, usuarioId])

  // ==========================================================
  // RENOVAR BLOQUEO
  // ==========================================================

  useEffect(() => {
    if (!usuarioId || !costoSeleccionado || esperandoApoyo) return

    const costoId = costoSeleccionado.id

    async function renovar() {
      try {
        await renovarBloqueoCosto(costoId)
      } catch (errorRenovacion) {
        console.error(
          'No se pudo renovar el bloqueo:',
          errorRenovacion
        )
        const mensajeError = String(errorRenovacion?.message || '')

        // En versiones anteriores del RPC, el primer participante de apoyo
        // intentaba renovar un bloqueo individual que nunca se creó. Mantener
        // la sesión en pantalla evita expulsarlo mientras se aplica la RPC
        // corregida en Supabase.
        if (
          costoSeleccionado.apoyoHabilitado &&
          /no tienes el bloqueo de este costo/i.test(mensajeError)
        ) {
          return
        }

        if (/no eres responsable|no eres participante|no autorizado|no está disponible|no tienes el bloqueo|está terminado/i.test(mensajeError)) {
          setError('El costo fue reiniciado o tu acceso dejó de estar vigente. Volviendo a la lista de costos.')
          setCostoSeleccionado(null)
          setDetalles([])
          setBorradores({})
          setNoManifestados([])
          limpiarSesionActual(usuarioId)
        } else {
          setError(mensajeError || 'No se pudo verificar tu acceso al costo. Reintentaremos en unos segundos.')
        }
      }
    }

    renovar()

    const intervalo = setInterval(renovar, 8 * 1000)

    return () => clearInterval(intervalo)
  }, [usuarioId, costoSeleccionado, esperandoApoyo])

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
      costos.length === 0 ||
      restauracionRealizada
    ) {
      return
    }

    const sesion = cargarSesionActual(usuarioId)

    if (!sesion?.costoId) {
      setRestauracionRealizada(true)
      return
    }

    const costo = costos.find(
      item => Number(item.id) === Number(sesion.costoId)
    )

    if (!costo || costo.estado === 'pendiente' || costo.estado === 'terminado') {
      limpiarSesionActual(usuarioId)
      setRestauracionRealizada(true)
      return
    }

    const numeroConteoActual = Number(costo.conteo_habilitado)
    const numeroConteoSesion = Number(sesion.numeroConteo)

    if (numeroConteoActual !== numeroConteoSesion) {
      limpiarSesionActual(usuarioId)
      setRestauracionRealizada(true)
      return
    }

    setRestauracionRealizada(true)

    seleccionarCosto(costo, {
      busqueda: sesion.busqueda || ''
    })
    }

    restaurarSesion()
    return () => {
      activo = false
    }
  }, [usuarioId, costos, restauracionRealizada, seleccionarCosto])

  // ==========================================================
  // VOLVER A COSTOS
  // ==========================================================

  function volverCostos() {
    cancelarEsperaApoyoRef.current = true
    setEsperandoApoyo(false)
    setApoyoGuardadoPendiente(false)
    setApoyoConteoCompletado(false)
    setCostoSeleccionado(null)
    setDetalles([])
    setBorradores({})
    setNoManifestados([])
    setBusqueda('')
    sesionActualRef.current = null
    limpiarSesionActual(usuarioId)
  }

  // ==========================================================
  // MANEJAR CAMBIO EN CONTEO
  // ==========================================================

  const manejarCambio = useCallback((datos) => {
    if (!datos?.detalleId) return

    setBorradores(anterior => ({
      ...anterior,
      [datos.detalleId]: datos
    }))


    if (sesionActualRef.current) {
      guardarSesionActual(usuarioId, sesionActualRef.current)
    }
  }, [usuarioId])

  function obtenerResultadoConteo(detalleId) {
    const borrador = borradores[detalleId]
    if (!borrador || !Array.isArray(borrador.cantidades) || borrador.cantidades.length === 0) {
      return null
    }

    const cantidades = borrador.cantidades.map(valor => {
      if (valor === '' || valor === null || valor === undefined) return null
      const numero = Number(valor)
      return Number.isFinite(numero) && numero >= 0 ? numero : null
    })
    const factor = Number(borrador.factor)

    if (cantidades.some(valor => valor === null) || !Number.isFinite(factor) || factor <= 0) {
      return null
    }

    return cantidades.reduce((suma, valor) => suma + valor, 0) * factor
  }

  // ==========================================================
  // GUARDAR SESIÓN CON FILTROS
  // ==========================================================

  function guardarSesionConFiltros(nuevoValor) {
    if (!costoSeleccionado) return

    const sesion = {
      costoId: costoSeleccionado.id,
      numeroConteo: Number(costoSeleccionado.conteo_habilitado),
      busqueda: nuevoValor.busqueda ?? busqueda
    }
    sesionActualRef.current = sesion
    guardarSesionActual(usuarioId, sesion)
  }

  // ==========================================================
  // AGREGAR NO MANIFESTADO
  // ==========================================================

  function guardarNoManifestadosDelCosto(lista = noManifestados, formulario = nuevoNoManifestado) {
    if (!costoSeleccionado) return false
    const numeroConteo = Number(costoSeleccionado.conteo_habilitado)
    const guardado = guardarNoManifestadosLocal(
      usuarioId,
      costoSeleccionado.id,
      numeroConteo,
      { noManifestados: lista, nuevoNoManifestado: formulario }
    )
    if (!guardado) {
      setError('No se pudo guardar el avance de no manifestados en este equipo.')
      return false
    }
    setError('')
    return true
  }

  function cambiarCampoNuevoNoManifestado(campo, valor) {
    const formulario = { ...nuevoNoManifestado, [campo]: valor }
    guardarNoManifestadosDelCosto(noManifestados, formulario)
    setNuevoNoManifestado(formulario)
  }

  function agregarNoManifestado() {
    const sku = nuevoNoManifestado.sku.trim()
    const cantidad = Number(nuevoNoManifestado.cantidad)
    const observacion = nuevoNoManifestado.observacion.trim()

    if (!sku) {
      setError('Ingresa el SKU del producto no manifestado.')
      return
    }

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      setError('La cantidad del no manifestado debe ser mayor que 0.')
      return
    }

    const existe = noManifestados.some(
      item => String(item.sku).toLowerCase() === sku.toLowerCase()
    )

    if (existe) {
      setError('Ese SKU ya fue agregado como no manifestado.')
      return
    }

    const listaActualizada = [
      ...noManifestados,
      {
        id: `local-${Date.now()}`,
        sku,
        cantidad,
        observacion
      }
    ]

    const formularioVacio = {
      sku: '',
      cantidad: '',
      observacion: ''
    }
    const guardadoLocal = guardarNoManifestadosDelCosto(listaActualizada, formularioVacio)
    setNoManifestados(listaActualizada)
    setNuevoNoManifestado(formularioVacio)

    if (guardadoLocal) setError('')
  }

  // ==========================================================
  // ELIMINAR NO MANIFESTADO
  // ==========================================================

  function eliminarNoManifestado(id) {
    const listaActualizada = noManifestados.filter(item => item.id !== id)
    guardarNoManifestadosDelCosto(listaActualizada)
    setNoManifestados(listaActualizada)
  }

  // ==========================================================
  // EDITAR NO MANIFESTADO
  // ==========================================================

  function editarNoManifestado(id, campo, valor) {
    let nuevoValor = valor

    if (campo === 'cantidad') {
      if (!/^\d*\.?\d*$/.test(valor)) return
      nuevoValor = valor === '' ? '' : valor
    }

    const listaActualizada = noManifestados.map(item =>
        item.id === id
          ? { ...item, [campo]: nuevoValor }
          : item
      )
    guardarNoManifestadosDelCosto(listaActualizada)
    setNoManifestados(listaActualizada)

  }

  // ==========================================================
  // VALIDAR NO MANIFESTADOS
  // ==========================================================

  function validarNoManifestados() {
    for (const item of noManifestados) {
      if (!String(item.sku || '').trim()) {
        setError('Existe un no manifestado sin SKU.')
        return false
      }

      const cantidad = Number(item.cantidad)

      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        setError(
          'Todos los no manifestados deben tener una cantidad mayor que 0.'
        )
        return false
      }
    }

    return true
  }

  // ==========================================================
  // GUARDAR BORRADOR ACTUAL
  // ==========================================================

  function guardarBorradorActual() {
    if (!costoSeleccionado) return

    const numeroConteo = Number(
      costoSeleccionado.conteo_habilitado
    )

    guardarBorradorGeneral(
      usuarioId,
      costoSeleccionado.id,
      numeroConteo,
      { noManifestados, nuevoNoManifestado }
    )
    guardarNoManifestadosDelCosto()

  }

  // ==========================================================
  // GUARDAR NO MANIFESTADOS OFICIALES
  // ==========================================================

  async function guardarNoManifestadosOficiales({ costoId = costoSeleccionado?.id, registrosLocales = noManifestados } = {}) {
    if (!costoId) return

    const {
      data: usuarioActual,
      error: errorUsuario
    } = await supabase.auth.getUser()

    if (errorUsuario || !usuarioActual?.user?.id) {
      throw new Error('No se pudo identificar al auditor.')
    }

    const auditorId = usuarioActual.user.id

    const { error: errorEliminar } = await supabase
      .from('no_manifestados')
      .delete()
      .eq('costo_id', costoId)
      .eq('auditor_id', auditorId)

    if (errorEliminar) throw errorEliminar

    if (registrosLocales.length === 0) return

    const registros = registrosLocales.map(item => ({
      costo_id: costoId,
      sku: String(item.sku).trim(),
      cantidad: Number(item.cantidad),
      auditor_id: auditorId,
      observacion: String(item.observacion || '').trim()
    }))

    const { error: errorInsertar } = await supabase
      .from('no_manifestados')
      .insert(registros)

    if (errorInsertar) throw errorInsertar
    notificarCambioCosto(costoId, 'no_manifestados_guardados')
  }

  async function reintentarGuardadoNoManifestados() {
    if (!noManifestadosPendientes || reintentandoNoManifestados) return
    setReintentandoNoManifestados(true)
    try {
      await guardarNoManifestadosOficiales({
        costoId: noManifestadosPendientes.costoId,
        registrosLocales: noManifestadosPendientes.registros
      })
      localStorage.removeItem(obtenerClaveBorradorNoManifestados(
        usuarioId,
        noManifestadosPendientes.costoId,
        noManifestadosPendientes.numeroConteo
      ))
      localStorage.removeItem(`${obtenerClaveBorradorNoManifestados(
        usuarioId,
        noManifestadosPendientes.costoId,
        noManifestadosPendientes.numeroConteo
      )}-pendiente`)
      setNoManifestadosPendientes(null)
      setResultadoGuardado(actual => actual ? { ...actual, advertencia: '' } : actual)
    } catch (error) {
      console.error('No se pudieron reintentar los no manifestados:', error)
      setResultadoGuardado(actual => actual ? {
        ...actual,
        advertencia: 'No se pudieron guardar todavía. El respaldo permanece en este equipo; verifica la conexión e inténtalo nuevamente.'
      } : actual)
    } finally {
      setReintentandoNoManifestados(false)
    }
  }

  // ==========================================================
  // GUARDAR CONTEO COMPLETO
  // ==========================================================

  async function guardarCosto() {
    if (!costoSeleccionado || guardandoCosto) return
    let noManifestadosGuardadosAntes = false

    try {
      setGuardandoCosto(true)
      setError('')
      setMensaje('')
      setResultadoGuardado(null)

      if (!conexionOnline) {
        throw new Error(
          'No tienes conexión a Internet. El conteo no se ha enviado a Supabase. Tus avances locales se mantienen guardados.'
        )
      }

      if (costoSeleccionado.estado === 'terminado') {
        throw new Error('Este costo ya está terminado.')
      }

      const numeroConteo = Number(
        costoSeleccionado.conteo_habilitado
      )

      if (numeroConteo < 1 || numeroConteo > 3) {
        throw new Error('El número de conteo no es válido.')
      }

      if (detalles.length === 0 && !costoSeleccionado.apoyoHabilitado) {
        throw new Error('No existen productos para guardar.')
      }

      // ------------------------------------------------------
      // PREPARAR DETALLES
      // ------------------------------------------------------

      const detallesParaGuardar = detalles.map(detalle => {
        const borrador = borradores[detalle.id]

        if (!borrador) {
          throw new Error(
            `Falta completar el SKU ${detalle.sku}.`
          )
        }

        if (
          !Array.isArray(borrador.cantidades) ||
          borrador.cantidades.length === 0
        ) {
          throw new Error(
            `El SKU ${detalle.sku} no tiene cantidades válidas.`
          )
        }

        if (
          borrador.cantidades.some(
            valor =>
              valor === '' ||
              valor === null ||
              valor === undefined
          )
        ) {
          throw new Error(
            `Completa todas las cantidades del SKU ${detalle.sku}.`
          )
        }

        const cantidades = borrador.cantidades.map(
          valor => Number(valor)
        )

        if (
          cantidades.some(
            cantidad =>
              !Number.isFinite(cantidad) ||
              cantidad < 0
          )
        ) {
          throw new Error(
            `El SKU ${detalle.sku} tiene cantidades inválidas.`
          )
        }

        const factor = Number(borrador.factor)

        if (!Number.isFinite(factor) || factor <= 0) {
          throw new Error(
            `El factor del SKU ${detalle.sku} debe ser mayor que 0.`
          )
        }

        return {
          detalleCostoId: detalle.id,
          cantidades,
          factor
        }
      })

      // ------------------------------------------------------
      // VALIDAR NO MANIFESTADOS
      // ------------------------------------------------------

      if (!validarNoManifestados()) {
        return
      }

      if (costoSeleccionado.apoyoHabilitado) {
        await guardarNoManifestadosOficiales()
        noManifestadosGuardadosAntes = true
      }

      // ------------------------------------------------------
      // GUARDAR CONTEO EN SUPABASE
      // ------------------------------------------------------

      const respuestaGuardado = await guardarConteoCosto(
        costoSeleccionado.id,
        numeroConteo,
        detallesParaGuardar
      )

      if (!respuestaGuardado) {
        throw new Error(
          'No se recibió la confirmación del guardado.'
        )
      }

      if (respuestaGuardado.esperando_segundo) {
        setApoyoGuardadoPendiente(true)
        return
      }

      if (
        !respuestaGuardado.apoyo_habilitado &&
        !costoSeleccionado.apoyoHabilitado &&
        Number(respuestaGuardado.totalLineas) !==
        detallesParaGuardar.length
      ) {
        throw new Error(
          'La cantidad de líneas guardadas no coincide con las enviadas. Verifica el costo antes de continuar.'
        )
      }

      // ------------------------------------------------------
      // INTERPRETAR EL RESULTADO REAL DEL SERVIDOR
      // ------------------------------------------------------

      const resultadoServidor = String(
        respuestaGuardado.resultado || ''
      )
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_')

      const resultadoReconocido =
        resultadoServidor === 'conforme' ||
        resultadoServidor === 'no_conforme'

      const resultadoTexto =
        resultadoServidor === 'conforme'
          ? 'CONFORME'
          : resultadoServidor === 'no_conforme'
            ? 'NO CONFORME'
            : 'RESULTADO NO DISPONIBLE'

      // ------------------------------------------------------
      // GUARDAR NO MANIFESTADOS
      // ------------------------------------------------------

      let advertenciaNoManifestados = ''

      try {
        if (!noManifestadosGuardadosAntes) await guardarNoManifestadosOficiales()
        setNoManifestadosPendientes(null)
      } catch (errorNoManifestados) {
        console.error(
          'El conteo se guardó, pero falló el registro de no manifestados:',
          errorNoManifestados
        )

        advertenciaNoManifestados =
          'El conteo se guardó, pero no se pudieron guardar los productos no manifestados. Verifica esos productos con el administrador.'
        setNoManifestadosPendientes({
          costoId: costoSeleccionado.id,
          numeroConteo,
          registros: noManifestados
        })
        localStorage.setItem(
          `${obtenerClaveBorradorNoManifestados(usuarioId, costoSeleccionado.id, numeroConteo)}-pendiente`,
          JSON.stringify({ costoId: costoSeleccionado.id, numeroConteo })
        )
      }

      // ------------------------------------------------------
      // CAPTURAR RESUMEN DEL RESULTADO
      // ------------------------------------------------------

      const factoresModificados = detalles.flatMap(detalle => {
        const factorPlantilla = Number(detalle.factor) > 0 ? Number(detalle.factor) : 1
        const valorBorrador = borradores[detalle.id]?.factor
        const factorAplicado = valorBorrador === undefined || valorBorrador === null
          ? factorPlantilla
          : Number(valorBorrador)
        return Number.isFinite(factorAplicado) && factorAplicado !== factorPlantilla
          ? [{ id: detalle.id, sku: detalle.sku, factorPlantilla, factorAplicado }]
          : []
      })
      let resumenCompartido = null
      if (respuestaGuardado.apoyo_habilitado) {
        try {
          resumenCompartido = await obtenerResumenConteoCompartido(costoSeleccionado.id, numeroConteo)
        } catch (errorResumen) {
          console.error('No se pudo cargar el resumen compartido persistido:', errorResumen)
        }
      }
      const resumenResultado = {
        conteo: numeroConteo,
        factoresModificados,
        resultado: resultadoReconocido
          ? resultadoServidor
          : 'no_disponible',
        resultadoTexto,
        lineasConformes:
          resumenCompartido?.lineasConformes ?? respuestaGuardado.lineasConformes ?? null,
        lineasDiferencia:
          resumenCompartido?.lineasDiferencia ?? respuestaGuardado.lineasDiferencia ?? null,
        advertencia: advertenciaNoManifestados
      }

      // ------------------------------------------------------
      // LIMPIAR BORRADORES DEL CONTEO YA GUARDADO
      // ------------------------------------------------------

      limpiarBorradoresCosto(
        usuarioId,
        costoSeleccionado.id,
        numeroConteo,
        { conservarNoManifestados: Boolean(advertenciaNoManifestados) }
      )

      limpiarSesionActual(usuarioId)

      // ------------------------------------------------------
      // RECARGAR LISTA DE COSTOS
      // ------------------------------------------------------

      await cargarCostos()

      // ------------------------------------------------------
      // VOLVER A LA LISTA PRINCIPAL
      // ------------------------------------------------------

      setDetalles([])
      setBorradores({})
      setNoManifestados([])
      setCostoSeleccionado(null)
      setVersionLimpieza(valor => valor + 1)

      // ------------------------------------------------------
      // MOSTRAR VENTANA CON EL RESULTADO
      // ------------------------------------------------------

      setMensaje('')
      setResultadoGuardado(resumenResultado)
    } catch (err) {
      console.error('Error guardando el conteo:', err)

      setError(
        err?.message || 'No se pudo guardar el conteo.'
      )
    } finally {
      setGuardandoCosto(false)
    }
  }

  // ==========================================================
  // FILTRAR DETALLES
  // ==========================================================

  const detallesFiltrados = useMemo(() => {
    let lista = [...detalles]
    const texto = busqueda.trim().toLowerCase()

    if (texto) {
      lista = lista.filter(detalle =>
        String(detalle.sku || '').toLowerCase().includes(texto) ||
        String(detalle.descripcion || '').toLowerCase().includes(texto) ||
        String(detalle.ubicacion || '').toLowerCase().includes(texto)
      )
    }

    if (filtroFactorModificado !== 'todos') {
      lista = lista.filter(detalle => {
        const factorPlantilla = Number(detalle.factor) > 0 ? Number(detalle.factor) : 1
        const factorBorrador = borradores[detalle.id]?.factor
        const factorActual = factorBorrador === undefined || factorBorrador === null ? factorPlantilla : Number(factorBorrador)
        const modificado = Number.isFinite(factorActual) && factorActual !== factorPlantilla
        return filtroFactorModificado === 'modificados' ? modificado : !modificado
      })
    }

    return lista
  }, [detalles, busqueda, borradores, filtroFactorModificado])

  // ==========================================================
  // CONTADORES
  // ==========================================================

  const totalDetalles = detalles.length

  // ==========================================================
  // LISTA PRINCIPAL DE COSTOS
  // ==========================================================

  if (!costoSeleccionado) {
    return (
      <div className="auditor-page">
        <ValidationNotice
          message={error || mensaje || (noManifestadosPendientes && !avisoNoManifestadosCerrado ? 'Hay no manifestados pendientes de sincronizar. El respaldo local se conservará hasta confirmar el envío.' : '')}
          title={!error && !mensaje && noManifestadosPendientes ? 'Sincronización pendiente' : undefined}
          type={error ? 'error' : mensaje ? 'success' : 'warning'}
          onClose={() => error ? setError('') : mensaje ? setMensaje('') : setAvisoNoManifestadosCerrado(true)}
          action={errorCargaCostos && error
            ? { label: loading ? 'Actualizando…' : 'Reintentar', onClick: cargarCostos, disabled: loading }
            : !error && !mensaje && noManifestadosPendientes
              ? { label: reintentandoNoManifestados ? 'Reintentando…' : 'Reintentar sincronización', onClick: reintentarGuardadoNoManifestados, disabled: reintentandoNoManifestados }
              : undefined}
        />
        <ModalResultadoConteo
          resultado={resultadoGuardado}
          onCerrar={cerrarResultadoGuardado}
          onReintentar={noManifestadosPendientes ? reintentarGuardadoNoManifestados : null}
          reintentando={reintentandoNoManifestados}
        />

        <div className="auditor-main">
          <header className="auditor-dashboard-header">
            <div className="auditor-dashboard-heading">
              <span className="auditor-dashboard-kicker">
                Panel de auditoría
              </span>

              <h1>Bienvenido, {usuarioNombre}</h1>

              <p>
                Revisa los costos disponibles y realiza el conteo habilitado.
              </p>
            </div>

            <div className="auditor-dashboard-header-actions">
              <IndicadorConexion
                conexionOnline={conexionOnline}
                pendientesOffline={pendientesOffline}
              />

              <button
                type="button"
                className="btn-logout"
                onClick={cerrarSesion}
              >
                <span className="btn-logout-icon">↪</span>
                Salir
              </button>
            </div>
          </header>

          <AuditorCostos
            costos={costos}
            loading={loading}
            onSeleccionar={seleccionarCosto}
          onActualizar={cargarCostos}
          />
        </div>
      </div>
    )
  }

  if (esperandoApoyo) {
    return (
      <div className="support-wait-page" role="status" aria-live="polite">
        <div className="support-wait-card">
          <div className="support-wait-orbit"><span /><span /><span /></div>
          <span className="support-wait-kicker">CONTEO COMPARTIDO</span>
          <h1>Esperando al segundo usuario</h1>
          <p>El administrador habilitó apoyo para este conteo. En cuanto se una la otra persona, ambos recibirán sus líneas asignadas.</p>
          <div className="support-wait-cost">Costo {costoSeleccionado?.numero_costo} · Conteo {costoSeleccionado?.conteo_habilitado}</div>
          <button type="button" className="support-wait-cancel" onClick={volverCostos}>Volver a costos</button>
        </div>
      </div>
    )
  }

  if (apoyoGuardadoPendiente) {
    if (apoyoConteoCompletado && resultadoGuardado) {
      return (
        <ModalResultadoConteo
          resultado={resultadoGuardado}
          onCerrar={() => {
            cerrarResultadoGuardado()
            volverCostos()
          }}
          onReintentar={null}
          reintentando={false}
        />
      )
    }
    return (
      <div className="support-wait-page" role="status" aria-live="polite">
        <div className="support-wait-card">
          <div className="support-wait-orbit"><span /><span /><span /></div>
          <span className="support-wait-kicker">CONTEO COMPARTIDO</span>
          <h1>Tu bloque quedó guardado</h1>
          <p>Espera mientras la otra persona termina su bloque. El resultado se calculará cuando ambos hayan guardado.</p>
          <div className="support-wait-cost">Costo {costoSeleccionado.numero_costo} · Conteo {costoSeleccionado.conteo_habilitado}</div>
        </div>
      </div>
    )
  }

  // ==========================================================
  // COSTO SELECCIONADO
  // ==========================================================

  const numeroConteo = Number(
    costoSeleccionado.conteo_habilitado
  )

  return (
    <div className="auditor-page">
      <ValidationNotice
        message={error || mensaje}
        type={error ? 'error' : 'success'}
        onClose={() => error ? setError('') : setMensaje('')}
      />
      <div className="auditor-main">
        <header className="auditor-topbar">
          <div className="auditor-cost-header">
            <div className="auditor-cost-heading">
              <button
                type="button"
                className="btn-volver"
                onClick={volverCostos}
                disabled={guardandoCosto}
              >
                <span>←</span>
                Volver a costos
              </button>

              <span className="auditor-dashboard-kicker">
                Bienvenido, {usuarioNombre} · Validación de Costos
              </span>

              <h1>
                Costo {costoSeleccionado.numero_costo}
              </h1>
            </div>

            <div className="auditor-cost-meta">
              <div className="auditor-cost-meta-item">
                <span>Conteo actual</span>
                <strong>{numeroConteo}</strong>
              </div>

              <div className="auditor-cost-meta-item">
                <span>Estado</span>
                <strong className="auditor-cost-meta-active">
                  En proceso
                </strong>
              </div>
            </div>

            <div className="auditor-topbar-actions">
              <IndicadorConexion
                conexionOnline={conexionOnline}
                pendientesOffline={pendientesOffline}
              />

              <button
                type="button"
                className="btn-logout"
                onClick={cerrarSesion}
                disabled={guardandoCosto}
              >
                <span className="btn-logout-icon">↪</span>
                Salir
              </button>
            </div>
          </div>
        </header>

        {/* RESUMEN */}

        <section className="auditor-summary">
          <div className="summary-item">
            <span className="summary-item-label">Líneas</span>
            <strong>{totalDetalles}</strong>
          </div>

          <div className="summary-item pendiente">
            <span className="summary-item-label">Pendientes</span>
            <strong>{totalDetalles}</strong>
          </div>
        </section>

        {/* BÚSQUEDA Y FILTROS */}

        <section className="auditor-tools">
          <div className="auditor-search">
            <svg className="count-search-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none">
              <circle cx="10.8" cy="10.8" r="6.8" />
              <path d="m16 16 4.2 4.2" />
            </svg>
            <input
              type="text"
              className="count-search-input"
              value={busqueda}
              placeholder="Buscar SKU, descripción o ubicación"
              aria-label="Buscar producto por SKU, descripción o ubicación"
              onChange={e => {
                const valor = e.target.value
                setBusqueda(valor)
                guardarSesionConFiltros({ busqueda: valor })
              }}
              aria-label="Buscar productos"
            />

            {busqueda && (
              <button
                type="button"
                className="search-clear"
                onClick={() => {
                  setBusqueda('')
                  guardarSesionConFiltros({ busqueda: '' })
                }}
                aria-label="Limpiar búsqueda"
              >
                ×
              </button>
            )}
          </div>

          <label className="auditor-factor-filter">
            <span>Factor</span>
            <select className="form-select form-select-sm" value={filtroFactorModificado} onChange={event => setFiltroFactorModificado(event.target.value)} aria-label="Filtrar por factor modificado">
              <option value="todos">Todos</option>
              <option value="modificados">Modificados</option>
              <option value="sin_modificar">Sin modificar</option>
            </select>
          </label>

          <div className="auditor-search-info">
            Mostrando <strong>{detallesFiltrados.length}</strong> de{' '}
            <strong>{totalDetalles}</strong> líneas
          </div>
        </section>

        {/* TABLA DE CONTEO */}

        <section className="auditor-table-container">
          <div className="auditor-table-heading">
            <div>
              <span className="auditor-section-kicker">
                Productos incluidos en el costo
              </span>

              <h2>Productos a validar</h2>
            </div>

            <span className="auditor-table-count">
              {detallesFiltrados.length} líneas
            </span>
          </div>

          {loadingDetalles ? (
            <div className="auditor-table-loading">
              <span className="auditor-loading-spinner" />
              <span>Cargando detalles...</span>
            </div>
          ) : detallesFiltrados.length === 0 ? (
            <div className="auditor-empty">
              <div className="auditor-empty-icon">⌕</div>
              <h3>No hay productos para este filtro</h3>
              <p>
                Prueba cambiando la búsqueda o el filtro del factor.
              </p>
            </div>
          ) : (
            <ScrollableTable
              className="auditor-table-wrapper"
              tableClassName="auditor-table"
              ariaLabel="productos del conteo del auditor"
            >
                <thead>
                  <tr>
                    <th className="col-sku">SKU</th>
                    <th className="col-descripcion">Descripción</th>
                    <th className="col-um">UM</th>
                    <th className="col-ubicacion">Ubicación</th>
                    <th className="col-conteo">Conteo</th>
                    <th className="col-resultado">Resultado</th>
                  </tr>
                </thead>

                <tbody>
                  {detallesFiltrados.map(detalle => {
                    const borrador = borradores[detalle.id]
                    const factorPlantilla = Number(detalle.factor) > 0 ? Number(detalle.factor) : 1
                    const factorActual = borrador?.factor
                    const factorModificado = factorActual !== undefined && factorActual !== null &&
                      Number(factorActual) !== factorPlantilla

                    return (
                    <tr key={detalle.id} className={factorModificado ? 'fila-factor-modificado' : ''}>
                      <td>
                        <strong className="auditor-sku">
                          {detalle.sku}
                        </strong>
                      </td>

                      <td>
                        <span className="auditor-descripcion">
                          {detalle.descripcion}
                        </span>
                      </td>

                      <td>
                        <span className="auditor-um">
                          {detalle.um}
                        </span>
                      </td>

                      <td>
                        <span className="ubicacion-badge">
                          {detalle.ubicacion}
                        </span>
                      </td>

                      <td>
                        <ConteoAuditor
                          key={`${detalle.id}-${numeroConteo}-${versionLimpieza}`}
                          detalle={detalle}
                          costoId={costoSeleccionado.id}
                          usuarioId={usuarioId}
                          numeroConteo={numeroConteo}
                          validando={guardandoCosto}
                          onCambio={manejarCambio}
                        />
                      </td>
                      <td className="auditor-result-cell">
                        {(() => {
                          const resultado = obtenerResultadoConteo(detalle.id)
                          return resultado === null
                            ? <span className="auditor-result-pending">Pendiente</span>
                            : <output className="auditor-result-value">{new Intl.NumberFormat('es-PE', { maximumFractionDigits: 4 }).format(resultado)}</output>
                        })()}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
            </ScrollableTable>
          )}
        </section>

        {/* NO MANIFESTADOS */}

        <section className="auditor-no-manifestados">
          <div className="auditor-section-heading">
            <div>
              <span className="auditor-section-kicker">
                Registro adicional
              </span>

              <h2>No manifestados</h2>

              <p>Registra aquí los productos encontrados que no están en el costo.</p>
            </div>

            <span className="auditor-section-badge">
              {noManifestados.length}
            </span>
          </div>

          <div className="no-manifestados-form">
            <div className="no-manifestados-field">
              <label htmlFor="no-manifestado-sku">SKU</label>

              <input
                id="no-manifestado-sku"
                type="text"
                placeholder="Código del producto"
                value={nuevoNoManifestado.sku}
                onChange={e => cambiarCampoNuevoNoManifestado('sku', e.target.value)}
              />
            </div>

            <div className="no-manifestados-field">
              <label htmlFor="no-manifestado-cantidad">
                Cantidad
              </label>

              <input
                id="no-manifestado-cantidad"
                type="text"
                inputMode="decimal"
                placeholder="Cantidad"
                value={nuevoNoManifestado.cantidad}
                onChange={e => {
                  const valor = e.target.value
                  if (!/^\d*\.?\d*$/.test(valor)) return

                  cambiarCampoNuevoNoManifestado('cantidad', valor)
                }}
              />
            </div>

            <div className="no-manifestados-field no-manifestados-field-wide">
              <label htmlFor="no-manifestado-observacion">
                Observación
              </label>

              <input
                id="no-manifestado-observacion"
                type="text"
                placeholder="Observación opcional"
                value={nuevoNoManifestado.observacion}
                onChange={e => cambiarCampoNuevoNoManifestado('observacion', e.target.value)}
              />
            </div>

            <button
              type="button"
              className="btn-no-manifestado-agregar"
              onClick={agregarNoManifestado}
            >
              <span>+</span>
              Agregar
            </button>
          </div>

          {noManifestados.length > 0 && (
            <div className="no-manifestados-table-wrapper">
              <table className="no-manifestados-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Cantidad</th>
                    <th>Observación</th>
                    <th>Acción</th>
                  </tr>
                </thead>

                <tbody>
                  {noManifestados.map(item => (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="text"
                          value={item.sku}
                          onChange={e =>
                            editarNoManifestado(
                              item.id,
                              'sku',
                              e.target.value
                            )
                          }
                        />
                      </td>

                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={item.cantidad}
                          onChange={e =>
                            editarNoManifestado(
                              item.id,
                              'cantidad',
                              e.target.value
                            )
                          }
                        />
                      </td>

                      <td>
                        <input
                          type="text"
                          value={item.observacion || ''}
                          onChange={e =>
                            editarNoManifestado(
                              item.id,
                              'observacion',
                              e.target.value
                            )
                          }
                        />
                      </td>

                      <td>
                        <button
                          type="button"
                          className="btn-no-manifestado-eliminar"
                          onClick={() => eliminarNoManifestado(item.id)}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>


        {/* GUARDAR */}

        <section className="auditor-save-section">
          <div className="auditor-save-actions">
            <button
              type="button"
              className="btn-guardar-borrador"
              onClick={guardarBorradorActual}
              disabled={guardandoCosto}
            >
              <span>⬇</span>
              Guardar borrador
            </button>

            <button
              type="button"
              className="btn-guardar-costo"
              onClick={guardarCosto}
              disabled={guardandoCosto || loadingDetalles || !conexionOnline}
            >
              {guardandoCosto ? (
                <>
                  <span className="button-spinner" />
                  Validando y guardando...
                </>
              ) : (
                <>
                  <span>✓</span>
                  Guardar Conteo {numeroConteo}
                </>
              )}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

export default AuditorDashboard

