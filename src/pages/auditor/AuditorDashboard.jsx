
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from '../../supabaseClient'

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
  renovarBloqueoCosto
} from '../../services/costos'

import ConteoAuditor from './ConteoAuditor'
import AuditorCostos from './AuditorCostos'
import ValidationNotice from '../../components/ValidationNotice'
import { esAvisoCantidadesIncompletas } from '../../components/validationNoticeUtils'

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
              Líneas con diferencias
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
          onClick={onCerrar}
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
  const [usuarioId, setUsuarioId] = useState(null)
  const [usuarioNombre, setUsuarioNombre] = useState('Auditor')
  const [costos, setCostos] = useState([])
  const [costoSeleccionado, setCostoSeleccionado] = useState(null)
  const [detalles, setDetalles] = useState([])
  const [resultados, setResultados] = useState({})
  const [borradores, setBorradores] = useState({})
  const [noManifestados, setNoManifestados] = useState([])

  const [nuevoNoManifestado, setNuevoNoManifestado] = useState({
    sku: '',
    cantidad: '',
    observacion: ''
  })

  const [borradorGuardado, setBorradorGuardado] = useState(false)
  const [filtroResultado, setFiltroResultado] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [versionLimpieza, setVersionLimpieza] = useState(0)
  const [restauracionRealizada, setRestauracionRealizada] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingDetalles, setLoadingDetalles] = useState(false)
  const [guardandoCosto, setGuardandoCosto] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [resultadoGuardado, setResultadoGuardado] = useState(null)
  const [noManifestadosPendientes, setNoManifestadosPendientes] = useState(null)
  const [reintentandoNoManifestados, setReintentandoNoManifestados] = useState(false)

  const [conexionOnline, setConexionOnline] = useState(estaOnline())
  const [pendientesOffline, setPendientesOffline] = useState(0)

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

  useEffect(() => {
    const limpiarConexion = escucharConexion({
      alConectar: () => setConexionOnline(true),
      alDesconectar: () => setConexionOnline(false)
    })

    return () => limpiarConexion()
  }, [])

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
    } catch (err) {
      console.error(err)
      const cacheLocal = localStorage.getItem('validacion-costos-auditor-' + usuarioId + '-costos-offline')
      if (cacheLocal) { setCostos(JSON.parse(cacheLocal)); setError('Sin conexión: costos recuperados desde este equipo.') }
      else setError(err?.message || 'No se pudieron cargar los costos.')
    } finally {
      setLoading(false)
    }
  }, [usuarioId])

  useEffect(() => {
    if (!usuarioId) return
    const timer = window.setTimeout(() => cargarCostos(), 0)
    return () => window.clearTimeout(timer)
  }, [usuarioId, cargarCostos])

  // ==========================================================
  // SELECCIONAR COSTO
  // ==========================================================

  const seleccionarCosto = useCallback(async (costo, opciones = {}) => {
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

      if (conexionOnline) {
        try { await iniciarCosto(costo.id) } catch (errorInicio) {
          console.error('Error iniciando el costo:', errorInicio)
          throw new Error(errorInicio?.message || 'No se pudo iniciar el costo.', { cause: errorInicio })
        }
      } else {
        const sesionLocal = cargarSesionActual(usuarioId)
        if (Number(sesionLocal?.costoId) !== Number(costo.id) || Number(sesionLocal?.numeroConteo) !== numeroConteo) throw new Error('Sin conexión solo puedes retomar el costo ya iniciado en este equipo.')
      }

      setCostoSeleccionado(costo)
      setDetalles([])
      setResultados({})
      setBorradores({})
      setNoManifestados([])
      setBorradorGuardado(false)
      setFiltroResultado(opciones.filtroResultado || 'todos')
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
        setBorradorGuardado(true)
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
        setBorradorGuardado(true)
      }

      guardarSesionActual(usuarioId, {
        costoId: costo.id,
        numeroConteo,
        busqueda: opciones.busqueda || '',
        filtroResultado: opciones.filtroResultado || 'todos'
      })
      sesionActualRef.current = {
        costoId: costo.id,
        numeroConteo,
        busqueda: opciones.busqueda || '',
        filtroResultado: opciones.filtroResultado || 'todos'
      }
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No se pudo abrir el costo.')
      setCostoSeleccionado(null)
    } finally {
      setLoadingDetalles(false)
    }
  }, [conexionOnline, usuarioId])

  // ==========================================================
  // RENOVAR BLOQUEO
  // ==========================================================

  useEffect(() => {
    if (!usuarioId || !costoSeleccionado) return

    const costoId = costoSeleccionado.id

    async function renovar() {
      try {
        await renovarBloqueoCosto(costoId)
      } catch (errorRenovacion) {
        console.error(
          'No se pudo renovar el bloqueo:',
          errorRenovacion
        )

        setError(
          'Se perdió el acceso a este costo. Otro usuario podría estar trabajando en él.'
        )

        setCostoSeleccionado(null)
        setDetalles([])
        setResultados({})
        setBorradores({})
        setNoManifestados([])
        limpiarSesionActual(usuarioId)
      }
    }

    renovar()

    const intervalo = setInterval(renovar, 60 * 1000)

    return () => clearInterval(intervalo)
  }, [usuarioId, costoSeleccionado])

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

    if (!costo || costo.estado === 'terminado') {
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
      busqueda: sesion.busqueda || '',
      filtroResultado: sesion.filtroResultado || 'todos'
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
    setCostoSeleccionado(null)
    setDetalles([])
    setResultados({})
    setBorradores({})
    setNoManifestados([])
    setBusqueda('')
    setFiltroResultado('todos')
    sesionActualRef.current = null
    limpiarSesionActual(usuarioId)
  }

  // ==========================================================
  // MANEJAR RESULTADO INDIVIDUAL
  // ==========================================================

  function manejarResultado(detalleId, resultado) {
    setResultados(anterior => ({
      ...anterior,
      [detalleId]: resultado
    }))

    setBorradorGuardado(true)
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

    setResultados(anterior => {
      const nuevo = { ...anterior }
      delete nuevo[datos.detalleId]
      return nuevo
    })

    setBorradorGuardado(true)

    if (sesionActualRef.current) {
      guardarSesionActual(usuarioId, sesionActualRef.current)
    }
  }, [usuarioId])

  // ==========================================================
  // GUARDAR SESIÓN CON FILTROS
  // ==========================================================

  function guardarSesionConFiltros(nuevoValor) {
    if (!costoSeleccionado) return

    const sesion = {
      costoId: costoSeleccionado.id,
      numeroConteo: Number(costoSeleccionado.conteo_habilitado),
      busqueda: nuevoValor.busqueda ?? busqueda,
      filtroResultado:
        nuevoValor.filtroResultado ?? filtroResultado
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
    setBorradorGuardado(true)
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
    setBorradorGuardado(true)
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

    setBorradorGuardado(true)
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

    setBorradorGuardado(true)
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

      if (detalles.length === 0) {
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

      if (
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
        await guardarNoManifestadosOficiales()
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

      const resumenResultado = {
        conteo: numeroConteo,
        resultado: resultadoReconocido
          ? resultadoServidor
          : 'no_disponible',
        resultadoTexto,
        lineasConformes:
          respuestaGuardado.lineasConformes ?? null,
        lineasDiferencia:
          respuestaGuardado.lineasDiferencia ?? null,
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
      setResultados({})
      setBorradores({})
      setNoManifestados([])
      setCostoSeleccionado(null)
      setVersionLimpieza(valor => valor + 1)
      setBorradorGuardado(false)

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

    if (filtroResultado !== 'todos') {
      lista = lista.filter(
        detalle => resultados[detalle.id] === filtroResultado
      )
    }

    return lista
  }, [detalles, busqueda, filtroResultado, resultados])

  // ==========================================================
  // CONTADORES
  // ==========================================================

  const totalDetalles = detalles.length

  const totalConformes = Object.values(resultados).filter(
    resultado => resultado === 'conforme'
  ).length

  const totalDiferencias = Object.values(resultados).filter(
    resultado => resultado === 'diferencia'
  ).length

  // ==========================================================
  // LISTA PRINCIPAL DE COSTOS
  // ==========================================================

  if (!costoSeleccionado) {
    return (
      <div className="auditor-page">
        <ValidationNotice message={error} onClose={() => setError('')} />
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

          {mensaje && (
            <div className="auditor-alert success" role="status">
              <span className="auditor-alert-icon">✓</span>
              <span>{mensaje}</span>
            </div>
          )}

          {error && !esAvisoCantidadesIncompletas(error) && (
            <div className="auditor-alert error" role="alert">
              <span className="auditor-alert-icon">!</span>
              <span>{error}</span>
            </div>
          )}

          {noManifestadosPendientes && (
            <div className="auditor-alert error" role="alert">
              <span className="auditor-alert-icon">!</span>
              <span>Hay no manifestados pendientes de sincronizar. El respaldo local se conservará hasta confirmar el envío.</span>
              <button type="button" onClick={reintentarGuardadoNoManifestados} disabled={reintentandoNoManifestados}>
                {reintentandoNoManifestados ? 'Reintentando...' : 'Reintentar sincronización'}
              </button>
            </div>
          )}

          <AuditorCostos
            costos={costos}
            loading={loading}
            onSeleccionar={seleccionarCosto}
          />
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
      <ValidationNotice message={error} onClose={() => setError('')} />
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
                Bienvenido, {usuarioNombre} · Validación de inventario
              </span>

              <h1>
                Costo #{costoSeleccionado.numero_costo}
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

        {mensaje && (
          <div className="auditor-alert success" role="status">
            <span className="auditor-alert-icon">✓</span>
            <span>{mensaje}</span>
          </div>
        )}

        {error && !esAvisoCantidadesIncompletas(error) && (
          <div className="auditor-alert error" role="alert">
            <span className="auditor-alert-icon">!</span>
            <span>{error}</span>
          </div>
        )}

        {/* RESUMEN */}

        <section className="auditor-summary">
          <div className="summary-item">
            <span className="summary-item-label">Líneas</span>
            <strong>{totalDetalles}</strong>
          </div>

          <div className="summary-item conforme">
            <span className="summary-item-label">Conformes</span>
            <strong>{totalConformes}</strong>
          </div>

          <div className="summary-item diferencia">
            <span className="summary-item-label">Diferencias</span>
            <strong>{totalDiferencias}</strong>
          </div>

          <div className="summary-item pendiente">
            <span className="summary-item-label">Pendientes</span>
            <strong>
              {Math.max(
                totalDetalles - totalConformes - totalDiferencias,
                0
              )}
            </strong>
          </div>
        </section>

        {/* BÚSQUEDA Y FILTROS */}

        <section className="auditor-tools">
          <div className="auditor-search">
            <input
              type="text"
              value={busqueda}
              placeholder="Buscar SKU, descripción o ubicación..."
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

          <div className="auditor-filter-group">
            <button
              type="button"
              className={
                filtroResultado === 'todos'
                  ? 'auditor-filter active'
                  : 'auditor-filter'
              }
              onClick={() => {
                setFiltroResultado('todos')
                guardarSesionConFiltros({
                  filtroResultado: 'todos'
                })
              }}
            >
              Todos
            </button>

            <button
              type="button"
              className={
                filtroResultado === 'conforme'
                  ? 'auditor-filter active conforme'
                  : 'auditor-filter'
              }
              onClick={() => {
                setFiltroResultado('conforme')
                guardarSesionConFiltros({
                  filtroResultado: 'conforme'
                })
              }}
            >
              Conformes
            </button>

            <button
              type="button"
              className={
                filtroResultado === 'diferencia'
                  ? 'auditor-filter active diferencia'
                  : 'auditor-filter'
              }
              onClick={() => {
                setFiltroResultado('diferencia')
                guardarSesionConFiltros({
                  filtroResultado: 'diferencia'
                })
              }}
            >
              Diferencias
            </button>
          </div>

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
                Detalle del conteo
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
                Prueba cambiando la búsqueda o el filtro de resultado.
              </p>
            </div>
          ) : (
            <div className="auditor-table-wrapper">
              <table className="auditor-table">
                <thead>
                  <tr>
                    <th className="col-sku">SKU</th>
                    <th className="col-descripcion">Descripción</th>
                    <th className="col-um">UM</th>
                    <th className="col-ubicacion">Ubicación</th>
                    <th className="col-conteo">Conteo</th>
                  </tr>
                </thead>

                <tbody>
                  {detallesFiltrados.map(detalle => (
                    <tr key={detalle.id}>
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
                          onRegistrado={datos =>
                            manejarResultado(
                              datos.detalleId,
                              datos.resultado
                            )
                          }
                          onCambio={manejarCambio}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

              <p>
                Registra productos encontrados físicamente que no aparecen en el costo.
              </p>
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
          <div className="auditor-save-info">
            <span className="auditor-save-status-icon">
              {borradorGuardado ? '✓' : '•'}
            </span>

            <div>
              <strong>
                {borradorGuardado
                  ? 'Cambios guardados localmente'
                  : 'Conteo en edición'}
              </strong>

              <span>
                Puedes guardar un borrador o finalizar el conteo cuando hayas completado las líneas.
              </span>
            </div>
          </div>

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
              disabled={guardandoCosto || loadingDetalles}
            >
              {guardandoCosto ? (
                <>
                  <span className="button-spinner" />
                  Guardando...
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

