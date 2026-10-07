import {
  useEffect,
  useMemo,
  useState
} from 'react'

import { supabase } from '../../supabaseClient'
import {
  estaOnline,
  escucharConexion,
  contarPendientesOffline,
} from "../../services/offlineStorage";

import {
  obtenerCostosAuditor,
  obtenerDetallesAuditor,
  guardarConteoCosto,
  adquirirBloqueoCosto,
  renovarBloqueoCosto
} from '../../services/costos'

import ConteoAuditor from './ConteoAuditor'
import AuditorCostos from './AuditorCostos'

// ==========================================================
// BORRADOR GENERAL
// ==========================================================

function obtenerClaveBorradorGeneral(
  usuarioId,
  costoId,
  numeroConteo
) {
  return `validacion-costos-usuario-${usuarioId}-costo-${costoId}-conteo-${numeroConteo}`
}

// ==========================================================
// SESIÓN ACTUAL
// ==========================================================

function obtenerClaveSesion(usuarioId) {
  return `validacion-costos-usuario-${usuarioId}-sesion`
}

// ==========================================================
// GUARDAR BORRADOR GENERAL
// ==========================================================

function guardarBorradorGeneral(
  usuarioId,
  costoId,
  numeroConteo,
  datos
) {
  if (
    !usuarioId ||
    !costoId ||
    !numeroConteo
  ) {
    return
  }

  try {
    const clave =
      obtenerClaveBorradorGeneral(
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
        updatedAt:
          new Date().toISOString()
      })
    )
  } catch (error) {
    console.error(
      'No se pudo guardar el borrador general:',
      error
    )
  }
}

// ==========================================================
// CARGAR BORRADOR GENERAL
// ==========================================================

function cargarBorradorGeneral(
  usuarioId,
  costoId,
  numeroConteo
) {
  if (
    !usuarioId ||
    !costoId ||
    !numeroConteo
  ) {
    return null
  }

  try {
    const clave =
      obtenerClaveBorradorGeneral(
        usuarioId,
        costoId,
        numeroConteo
      )

    const guardado =
      localStorage.getItem(clave)

    if (!guardado) {
      return null
    }

    const borrador =
      JSON.parse(guardado)

    if (
      !borrador ||
      String(borrador.usuarioId) !==
        String(usuarioId) ||
      Number(borrador.costoId) !==
        Number(costoId) ||
      Number(borrador.numeroConteo) !==
        Number(numeroConteo)
    ) {
      return null
    }

    return borrador
  } catch (error) {
    console.error(
      'No se pudo cargar el borrador general:',
      error
    )

    return null
  }
}

// ==========================================================
// GUARDAR SESIÓN
// ==========================================================

function guardarSesionActual(
  usuarioId,
  datos
) {
  if (!usuarioId) {
    return
  }

  try {
    const clave =
      obtenerClaveSesion(usuarioId)

    localStorage.setItem(
      clave,
      JSON.stringify({
        usuarioId,
        ...datos,
        updatedAt:
          new Date().toISOString()
      })
    )
  } catch (error) {
    console.error(
      'No se pudo guardar la sesión:',
      error
    )
  }
}

// ==========================================================
// CARGAR SESIÓN
// ==========================================================

function cargarSesionActual(
  usuarioId
) {
  if (!usuarioId) {
    return null
  }

  try {
    const clave =
      obtenerClaveSesion(usuarioId)

    const guardado =
      localStorage.getItem(clave)

    if (!guardado) {
      return null
    }

    const sesion =
      JSON.parse(guardado)

    if (
      !sesion ||
      String(sesion.usuarioId) !==
        String(usuarioId)
    ) {
      return null
    }

    return sesion
  } catch (error) {
    console.error(
      'No se pudo cargar la sesión:',
      error
    )

    return null
  }
}

// ==========================================================
// LIMPIAR SESIÓN
// ==========================================================

function limpiarSesionActual(
  usuarioId
) {
  if (!usuarioId) {
    return
  }

  try {
    localStorage.removeItem(
      obtenerClaveSesion(usuarioId)
    )
  } catch (error) {
    console.error(
      'No se pudo limpiar la sesión:',
      error
    )
  }
}

// ==========================================================
// LIMPIAR BORRADORES DE UN COSTO
// ==========================================================

function limpiarBorradoresCosto(
  usuarioId,
  costoId,
  numeroConteo
) {
  if (
    !usuarioId ||
    !costoId ||
    !numeroConteo
  ) {
    return
  }

  try {
    const prefijo =
      `validacion-costos-usuario-${usuarioId}-costo-${costoId}-detalle-`

    const sufijo =
      `-conteo-${numeroConteo}`

    const claves = []

    for (
      let i = 0;
      i < localStorage.length;
      i++
    ) {
      const clave =
        localStorage.key(i)

      if (
        clave &&
        clave.startsWith(prefijo) &&
        clave.endsWith(sufijo)
      ) {
        claves.push(clave)
      }
    }

    claves.forEach(
      clave =>
        localStorage.removeItem(clave)
    )

    localStorage.removeItem(
      obtenerClaveBorradorGeneral(
        usuarioId,
        costoId,
        numeroConteo
      )
    )
  } catch (error) {
    console.error(
      'No se pudieron limpiar los borradores:',
      error
    )
  }
}

// ==========================================================
// INDICADOR DE CONEXIÓN
// ==========================================================

function IndicadorConexion({
  conexionOnline,
  pendientesOffline
}) {
  return (
    <div
      className={`conexion-indicador ${
        conexionOnline
          ? 'conexion-online'
          : 'conexion-offline'
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
          {conexionOnline
            ? 'Conectado'
            : 'Sin conexión'}
        </strong>

        <span>
          {conexionOnline
            ? pendientesOffline > 0
              ? `${pendientesOffline} cambio${
                  pendientesOffline === 1
                    ? ''
                    : 's'
                } pendiente${
                  pendientesOffline === 1
                    ? ''
                    : 's'
                }`
              : 'Sincronizado'
            : 'Los avances se guardan localmente'}
        </span>
      </div>
    </div>
  )
}

// ==========================================================
// COMPONENTE
// ==========================================================

function AuditorDashboard() {
  const [
    usuarioId,
    setUsuarioId
  ] = useState(null)

  const [
    costos,
    setCostos
  ] = useState([])

  const [
    costoSeleccionado,
    setCostoSeleccionado
  ] = useState(null)

  const [
    detalles,
    setDetalles
  ] = useState([])

  const [
    resultados,
    setResultados
  ] = useState({})

  const [
    borradores,
    setBorradores
  ] = useState({})

  const [
    noManifestados,
    setNoManifestados
  ] = useState([])

  const [
    nuevoNoManifestado,
    setNuevoNoManifestado
  ] = useState({
    sku: '',
    cantidad: '',
    observacion: ''
  })

  const [
    borradorGuardado,
    setBorradorGuardado
  ] = useState(false)

  const [
    filtroResultado,
    setFiltroResultado
  ] = useState('todos')

  const [
    busqueda,
    setBusqueda
  ] = useState('')

  const [
    versionLimpieza,
    setVersionLimpieza
  ] = useState(0)

  const [
    restauracionRealizada,
    setRestauracionRealizada
  ] = useState(false)

  const [
    loading,
    setLoading
  ] = useState(true)

  const [
    loadingDetalles,
    setLoadingDetalles
  ] = useState(false)

  const [
    guardandoCosto,
    setGuardandoCosto
  ] = useState(false)

  const [
    error,
    setError
  ] = useState('')

  const [
    mensaje,
    setMensaje
  ] = useState('')

  // ==========================================================
  // ESTADO DE CONEXIÓN
  // ==========================================================

  const [
    conexionOnline,
    setConexionOnline
  ] = useState(
    estaOnline()
  )

  const [
    pendientesOffline,
    setPendientesOffline
  ] = useState(0)

  // ==========================================================
  // CERRAR SESIÓN
  // ==========================================================

  async function cerrarSesion() {
    try {
      limpiarSesionActual(
        usuarioId
      )

      await supabase.auth.signOut()
    } catch (error) {
      console.error(
        'Error cerrando sesión:',
        error
      )

      setError(
        'No se pudo cerrar la sesión.'
      )
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
      } =
        await supabase.auth.getUser()

      if (errorUsuario) {
        console.error(
          errorUsuario
        )

        setError(
          'No se pudo obtener el usuario.'
        )

        setLoading(false)

        return
      }

      if (!data?.user?.id) {
        setError(
          'No se encontró una sesión activa.'
        )

        setLoading(false)

        return
      }

      setUsuarioId(
        data.user.id
      )
    }

    obtenerUsuario()
  }, [])

  // ==========================================================
  // DETECTAR CONEXIÓN A INTERNET
  // ==========================================================

  useEffect(() => {
    const limpiarConexion =
      escucharConexion({
        alConectar: () => {
          setConexionOnline(true)
        },

        alDesconectar: () => {
          setConexionOnline(false)
        }
      })

    return () => {
      limpiarConexion()
    }
  }, [])

  // ==========================================================
  // CARGAR PENDIENTES OFFLINE
  // ==========================================================

  useEffect(() => {
    async function cargarPendientesOffline() {
      if (!usuarioId) {
        return
      }

      try {
        const cantidad =
          await contarPendientesOffline({
            usuarioId
          })

        setPendientesOffline(cantidad)
      } catch (error) {
        console.error(
          'Error obteniendo pendientes offline:',
          error
        )
      }
    }

    cargarPendientesOffline()
  }, [
    usuarioId
  ])

  // ==========================================================
  // CARGAR COSTOS
  // ==========================================================

  useEffect(() => {
    if (!usuarioId) {
      return
    }

    cargarCostos()
  }, [usuarioId])

  async function cargarCostos() {
    try {
      setLoading(true)
      setError('')

      const datos =
        await obtenerCostosAuditor()

      setCostos(
        datos || []
      )
    } catch (err) {
      console.error(err)

      setError(
        err?.message ||
        'No se pudieron cargar los costos.'
      )
    } finally {
      setLoading(false)
    }
  }

  // ==========================================================
  // SELECCIONAR COSTO
  // ==========================================================

  async function seleccionarCosto(
    costo,
    opciones = {}
  ) {
    try {
      setError('')
      setMensaje('')

      // --------------------------------------------------------
      // VALIDAR ESTADO
      // --------------------------------------------------------

      if (
        costo.estado ===
        'terminado'
      ) {
        throw new Error(
          'Este costo ya está terminado.'
        )
      }

      // --------------------------------------------------------
      // VALIDAR CONTEO
      // --------------------------------------------------------

      const numeroConteo =
        Number(
          costo.conteo_habilitado
        )

      if (
        numeroConteo < 1 ||
        numeroConteo > 3
      ) {
        throw new Error(
          'El costo no tiene un conteo habilitado.'
        )
      }

      // --------------------------------------------------------
      // ADQUIRIR BLOQUEO
      // --------------------------------------------------------

      try {
        await adquirirBloqueoCosto(
          costo.id
        )
      } catch (errorBloqueo) {
        console.error(
          'Error adquiriendo bloqueo:',
          errorBloqueo
        )

        throw new Error(
          'Este costo está siendo trabajado por otro auditor.'
        )
      }

      // --------------------------------------------------------
      // PREPARAR INTERFAZ
      // --------------------------------------------------------

      setCostoSeleccionado(
        costo
      )

      setDetalles([])

      setResultados({})

      setBorradores({})

      setNoManifestados([])

      setBorradorGuardado(false)

      setFiltroResultado(
        opciones.filtroResultado ||
        'todos'
      )

      setBusqueda(
        opciones.busqueda ||
        ''
      )

      setLoadingDetalles(true)

      // --------------------------------------------------------
      // CARGAR DETALLES
      // --------------------------------------------------------

      const datos =
        await obtenerDetallesAuditor(
          costo.id,
          numeroConteo
        )

      setDetalles(
        datos || []
      )

      // --------------------------------------------------------
      // RESTAURAR BORRADOR GENERAL
      // --------------------------------------------------------

      const borrador =
        cargarBorradorGeneral(
          usuarioId,
          costo.id,
          numeroConteo
        )

      if (borrador) {
        setNoManifestados(
          Array.isArray(
            borrador.noManifestados
          )
            ? borrador.noManifestados
            : []
        )

        setBorradorGuardado(
          true
        )
      }

      // --------------------------------------------------------
      // GUARDAR SESIÓN
      // --------------------------------------------------------

      guardarSesionActual(
        usuarioId,
        {
          costoId:
            costo.id,

          numeroConteo,

          busqueda:
            opciones.busqueda ||
            '',

          filtroResultado:
            opciones.filtroResultado ||
            'todos'
        }
      )
    } catch (err) {
      console.error(err)

      setError(
        err?.message ||
        'No se pudo abrir el costo.'
      )

      setCostoSeleccionado(
        null
      )
    } finally {
      setLoadingDetalles(
        false
      )
    }
  }

  // ==========================================================
  // RENOVAR BLOQUEO
  // ==========================================================

  useEffect(() => {
    if (
      !usuarioId ||
      !costoSeleccionado
    ) {
      return
    }

    const costoId =
      costoSeleccionado.id

    async function renovar() {
      try {
        await renovarBloqueoCosto(
          costoId
        )
      } catch (errorRenovacion) {
        console.error(
          'No se pudo renovar el bloqueo:',
          errorRenovacion
        )

        setError(
          'Se perdió el acceso a este costo. Otro usuario podría estar trabajando en él.'
        )

        setCostoSeleccionado(
          null
        )

        setDetalles([])

        setResultados({})

        setBorradores({})

        setNoManifestados([])

        limpiarSesionActual(
          usuarioId
        )
      }
    }

    renovar()

    const intervalo =
      setInterval(
        renovar,
        60 * 1000
      )

    return () => {
      clearInterval(
        intervalo
      )
    }
  }, [
    usuarioId,
    costoSeleccionado
  ])

  // ==========================================================
  // RESTAURAR SESIÓN
  // ==========================================================

  useEffect(() => {
    if (
      !usuarioId ||
      costos.length === 0 ||
      restauracionRealizada
    ) {
      return
    }

    const sesion =
      cargarSesionActual(
        usuarioId
      )

    if (!sesion?.costoId) {
      setRestauracionRealizada(
        true
      )

      return
    }

    const costo =
      costos.find(
        item =>
          Number(item.id) ===
          Number(sesion.costoId)
      )

    if (
      !costo ||
      costo.estado ===
        'terminado'
    ) {
      limpiarSesionActual(
        usuarioId
      )

      setRestauracionRealizada(
        true
      )

      return
    }

    const numeroConteoActual =
      Number(
        costo.conteo_habilitado
      )

    const numeroConteoSesion =
      Number(
        sesion.numeroConteo
      )

    if (
      numeroConteoActual !==
      numeroConteoSesion
    ) {
      limpiarSesionActual(
        usuarioId
      )

      setRestauracionRealizada(
        true
      )

      return
    }

    setRestauracionRealizada(
      true
    )

    seleccionarCosto(
      costo,
      {
        busqueda:
          sesion.busqueda ||
          '',

        filtroResultado:
          sesion.filtroResultado ||
          'todos'
      }
    )
  }, [
    usuarioId,
    costos,
    restauracionRealizada
  ])

  // ==========================================================
  // VOLVER A COSTOS
  // ==========================================================

  function volverCostos() {
    setCostoSeleccionado(
      null
    )

    setDetalles([])

    setResultados({})

    setBorradores({})

    setNoManifestados([])

    setBusqueda('')

    setFiltroResultado(
      'todos'
    )

    limpiarSesionActual(
      usuarioId
    )
  }

  // ==========================================================
  // MANEJAR RESULTADO
  // ==========================================================

  function manejarResultado(
    detalleId,
    resultado
  ) {
    setResultados(
      anterior => ({
        ...anterior,
        [detalleId]:
          resultado
      })
    )

    setBorradorGuardado(
      true
    )
  }

  // ==========================================================
  // MANEJAR CAMBIO
  // ==========================================================

  function manejarCambio(
    datos
  ) {
    if (!datos?.detalleId) {
      return
    }

    setBorradores(
      anterior => ({
        ...anterior,
        [datos.detalleId]:
          datos
      })
    )

    setResultados(
      anterior => {
        const nuevo =
          { ...anterior }

        delete nuevo[
          datos.detalleId
        ]

        return nuevo
      }
    )

    setBorradorGuardado(
      true
    )

    // --------------------------------------------------------
    // GUARDAR POSICIÓN ACTUAL
    // --------------------------------------------------------

    if (costoSeleccionado) {
      guardarSesionActual(
        usuarioId,
        {
          costoId:
            costoSeleccionado.id,

          numeroConteo:
            Number(
              costoSeleccionado.conteo_habilitado
            ),

          busqueda,

          filtroResultado
        }
      )
    }
  }

  // ==========================================================
  // GUARDAR SESIÓN CON FILTROS
  // ==========================================================

  function guardarSesionConFiltros(
    nuevoValor
  ) {
    if (!costoSeleccionado) {
      return
    }

    guardarSesionActual(
      usuarioId,
      {
        costoId:
          costoSeleccionado.id,

        numeroConteo:
          Number(
            costoSeleccionado.conteo_habilitado
          ),

        busqueda:
          nuevoValor.busqueda ??
          busqueda,

        filtroResultado:
          nuevoValor.filtroResultado ??
          filtroResultado
      }
    )
  }

  // ==========================================================
  // AGREGAR NO MANIFESTADO
  // ==========================================================

  function agregarNoManifestado() {
    const sku =
      nuevoNoManifestado.sku
        .trim()

    const cantidad =
      Number(
        nuevoNoManifestado.cantidad
      )

    const observacion =
      nuevoNoManifestado.observacion
        .trim()

    if (!sku) {
      setError(
        'Ingresa el SKU del producto no manifestado.'
      )

      return
    }

    if (
      Number.isNaN(cantidad) ||
      cantidad <= 0
    ) {
      setError(
        'La cantidad del no manifestado debe ser mayor que 0.'
      )

      return
    }

    const existe =
      noManifestados.some(
        item =>
          String(item.sku)
            .toLowerCase() ===
          sku.toLowerCase()
      )

    if (existe) {
      setError(
        'Ese SKU ya fue agregado como no manifestado.'
      )

      return
    }

    const nuevo = {
      id:
        `local-${Date.now()}`,
      sku,
      cantidad,
      observacion
    }

    const lista = [
      ...noManifestados,
      nuevo
    ]

    setNoManifestados(
      lista
    )

    setNuevoNoManifestado({
      sku: '',
      cantidad: '',
      observacion: ''
    })

    setError('')

    setBorradorGuardado(
      true
    )
  }

  // ==========================================================
  // ELIMINAR NO MANIFESTADO
  // ==========================================================

  function eliminarNoManifestado(
    id
  ) {
    const lista =
      noManifestados.filter(
        item =>
          item.id !== id
      )

    setNoManifestados(
      lista
    )

    setBorradorGuardado(
      true
    )
  }

  // ==========================================================
  // EDITAR NO MANIFESTADO
  // ==========================================================

  function editarNoManifestado(
    id,
    campo,
    valor
  ) {
    let nuevoValor =
      valor

    if (
      campo ===
      'cantidad'
    ) {
      if (
        !/^\d*\.?\d*$/.test(
          valor
        )
      ) {
        return
      }

      nuevoValor =
        valor === ''
          ? ''
          : Number(valor)
    }

    const lista =
      noManifestados.map(
        item =>
          item.id === id
            ? {
                ...item,
                [campo]:
                  nuevoValor
              }
            : item
      )

    setNoManifestados(
      lista
    )

    setBorradorGuardado(
      true
    )
  }

  // ==========================================================
  // VALIDAR NO MANIFESTADOS
  // ==========================================================

  function validarNoManifestados() {
    for (
      const item
      of noManifestados
    ) {
      if (
        !String(
          item.sku || ''
        ).trim()
      ) {
        setError(
          'Existe un no manifestado sin SKU.'
        )

        return false
      }

      const cantidad =
        Number(
          item.cantidad
        )

      if (
        Number.isNaN(cantidad) ||
        cantidad <= 0
      ) {
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
    if (!costoSeleccionado) {
      return
    }

    const numeroConteo =
      Number(
        costoSeleccionado.conteo_habilitado
      )

    guardarBorradorGeneral(
      usuarioId,
      costoSeleccionado.id,
      numeroConteo,
      {
        noManifestados
      }
    )

    setBorradorGuardado(
      true
    )
  }

  // ==========================================================
  // GUARDAR NO MANIFESTADOS OFICIALES
  // ==========================================================

  async function guardarNoManifestadosOficiales() {
    if (!costoSeleccionado) {
      return
    }

    const {
      data: usuarioActual,
      error:
        errorUsuario
    } =
      await supabase.auth.getUser()

    if (
      errorUsuario ||
      !usuarioActual?.user?.id
    ) {
      throw new Error(
        'No se pudo identificar al auditor.'
      )
    }

    const auditorId =
      usuarioActual.user.id

    const {
      error:
        errorEliminar
    } =
      await supabase
        .from('no_manifestados')
        .delete()
        .eq(
          'costo_id',
          costoSeleccionado.id
        )

    if (errorEliminar) {
      throw errorEliminar
    }

    if (
      noManifestados.length ===
      0
    ) {
      return
    }

    const registros =
      noManifestados.map(
        item => ({
          costo_id:
            costoSeleccionado.id,

          sku:
            String(
              item.sku
            ).trim(),

          cantidad:
            Number(
              item.cantidad
            ),

          auditor_id:
            auditorId,

          observacion:
            String(
              item.observacion ||
              ''
            ).trim()
        })
      )

    const {
      error:
        errorInsertar
    } =
      await supabase
        .from('no_manifestados')
        .insert(
          registros
        )

    if (errorInsertar) {
      throw errorInsertar
    }
  }

  // ==========================================================
  // GUARDAR COSTO
  // ==========================================================

  async function guardarCosto() {
    if (!costoSeleccionado) {
      return
    }

    try {
      setGuardandoCosto(
        true
      )

      setError('')

      setMensaje('')

      // ------------------------------------------------------
      // VALIDAR ESTADO
      // ------------------------------------------------------

      if (
        costoSeleccionado.estado ===
        'terminado'
      ) {
        throw new Error(
          'Este costo ya está terminado.'
        )
      }

      const numeroConteo =
        Number(
          costoSeleccionado.conteo_habilitado
        )

      if (
        numeroConteo < 1 ||
        numeroConteo > 3
      ) {
        throw new Error(
          'El número de conteo no es válido.'
        )
      }

      if (
        detalles.length ===
        0
      ) {
        throw new Error(
          'No existen productos para guardar.'
        )
      }

      // ------------------------------------------------------
      // PREPARAR DETALLES
      // ------------------------------------------------------

      const detallesParaGuardar =
        detalles.map(
          detalle => {
            const borrador =
              borradores[
                detalle.id
              ]

            if (!borrador) {
              throw new Error(
                `Falta completar el SKU ${detalle.sku}.`
              )
            }

            if (
              !Array.isArray(
                borrador.cantidades
              ) ||
              borrador.cantidades.length ===
                0
            ) {
              throw new Error(
                `El SKU ${detalle.sku} no tiene cantidades válidas.`
              )
            }

            const cantidades =
              borrador.cantidades.map(
                valor =>
                  Number(valor)
              )

            if (
              cantidades.some(
                cantidad =>
                  Number.isNaN(
                    cantidad
                  ) ||
                  cantidad < 0
              )
            ) {
              throw new Error(
                `El SKU ${detalle.sku} tiene cantidades inválidas.`
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

            const factor =
              Number(
                borrador.factor
              )

            if (
              Number.isNaN(
                factor
              ) ||
              factor <= 0
            ) {
              throw new Error(
                `El factor del SKU ${detalle.sku} debe ser mayor que 0.`
              )
            }

            return {
              detalleCostoId:
                detalle.id,

              cantidades,

              factor
            }
          }
        )

      // ------------------------------------------------------
      // VALIDAR NO MANIFESTADOS
      // ------------------------------------------------------

      if (
        !validarNoManifestados()
      ) {
        return
      }

      // ------------------------------------------------------
      // GUARDAR CONTEO
      // ------------------------------------------------------

      await guardarConteoCosto(
        costoSeleccionado.id,
        numeroConteo,
        detallesParaGuardar
      )

      // ------------------------------------------------------
      // GUARDAR NO MANIFESTADOS
      // ------------------------------------------------------

      await guardarNoManifestadosOficiales()

      // ------------------------------------------------------
      // LIMPIAR BORRADORES
      // ------------------------------------------------------

      limpiarBorradoresCosto(
        usuarioId,
        costoSeleccionado.id,
        numeroConteo
      )

      limpiarSesionActual(
        usuarioId
      )

      // ------------------------------------------------------
      // RECARGAR COSTOS
      // ------------------------------------------------------

      await cargarCostos()

      // ------------------------------------------------------
      // LIMPIAR INTERFAZ
      // ------------------------------------------------------

      setDetalles([])

      setResultados({})

      setBorradores({})

      setNoManifestados([])

      setCostoSeleccionado(
        null
      )

      setVersionLimpieza(
        valor =>
          valor + 1
      )

      setMensaje(
        `Conteo ${numeroConteo} guardado correctamente.`
      )

      setBorradorGuardado(
        false
      )
    } catch (err) {
      console.error(err)

      setError(
        err?.message ||
        'No se pudo guardar el conteo.'
      )
    } finally {
      setGuardandoCosto(
        false
      )
    }
  }

  // ==========================================================
  // FILTRO DE DETALLES
  // ==========================================================

  const detallesFiltrados =
    useMemo(() => {
      let lista =
        [...detalles]

      const texto =
        busqueda
          .trim()
          .toLowerCase()

      if (texto) {
        lista =
          lista.filter(
            detalle => {
              return (
                String(
                  detalle.sku ||
                  ''
                )
                  .toLowerCase()
                  .includes(texto) ||
                String(
                  detalle.descripcion ||
                  ''
                )
                  .toLowerCase()
                  .includes(texto) ||
                String(
                  detalle.ubicacion ||
                  ''
                )
                  .toLowerCase()
                  .includes(texto)
              )
            }
          )
      }

      if (
        filtroResultado !==
        'todos'
      ) {
        lista =
          lista.filter(
            detalle =>
              resultados[
                detalle.id
              ] ===
              filtroResultado
          )
      }

      return lista
    }, [
      detalles,
      busqueda,
      filtroResultado,
      resultados
    ])

  // ==========================================================
  // CONTADORES
  // ==========================================================

  const totalDetalles =
    detalles.length

  const totalConformes =
    Object.values(
      resultados
    ).filter(
      resultado =>
        resultado ===
        'conforme'
    ).length

  const totalDiferencias =
    Object.values(
      resultados
    ).filter(
      resultado =>
        resultado ===
        'diferencia'
    ).length

  // ==========================================================
  // RENDER LISTA DE COSTOS
  // ==========================================================

  if (!costoSeleccionado) {
    return (
      <div className="auditor-page">

        <div className="auditor-main">

          <header className="auditor-dashboard-header">

            <div className="auditor-dashboard-heading">

              <span className="auditor-dashboard-kicker">
                Panel de auditoría
              </span>

              <h1>
                Validación de costos
              </h1>

              <p>
                Revisa los costos disponibles y
                realiza el conteo habilitado.
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
                onClick={
                  cerrarSesion
                }
              >
                <span className="btn-logout-icon">
                  ↪
                </span>

                Salir
              </button>

            </div>

          </header>

          {mensaje && (
            <div className="auditor-alert success">
              <span className="auditor-alert-icon">
                ✓
              </span>

              <span>
                {mensaje}
              </span>
            </div>
          )}

          {error && (
            <div className="auditor-alert error">
              <span className="auditor-alert-icon">
                !
              </span>

              <span>
                {error}
              </span>
            </div>
          )}

          <AuditorCostos
            costos={costos}
            loading={loading}
            onSeleccionar={
              seleccionarCosto
            }
          />

        </div>

      </div>
    )
  }

  // ==========================================================
  // COSTO SELECCIONADO
  // ==========================================================

  const numeroConteo =
    Number(
      costoSeleccionado.conteo_habilitado
    )

  return (
    <div className="auditor-page">

      <div className="auditor-main">

        {/* ====================================================
            CABECERA DEL COSTO
        ==================================================== */}

        <header className="auditor-topbar">

          <div className="auditor-cost-header">

            <div className="auditor-cost-heading">

              <button
                type="button"
                className="btn-volver"
                onClick={
                  volverCostos
                }
                disabled={
                  guardandoCosto
                }
              >
                <span>
                  ←
                </span>

                Volver a costos
              </button>

              <span className="auditor-dashboard-kicker">
                Validación de inventario
              </span>

              <h1>
                Costo #
                {costoSeleccionado.numero_costo}
              </h1>

            </div>

            <div className="auditor-cost-meta">

              <div className="auditor-cost-meta-item">

                <span>
                  Conteo actual
                </span>

                <strong>
                  {numeroConteo}
                </strong>

              </div>

              <div className="auditor-cost-meta-item">

                <span>
                  Estado
                </span>

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
                onClick={
                  cerrarSesion
                }
                disabled={
                  guardandoCosto
                }
              >
                <span className="btn-logout-icon">
                  ↪
                </span>

                Salir
              </button>

            </div>

          </div>

        </header>

        {/* ====================================================
            MENSAJES
        ==================================================== */}

        {mensaje && (
          <div className="auditor-alert success">
            <span className="auditor-alert-icon">
              ✓
            </span>

            <span>
              {mensaje}
            </span>
          </div>
        )}

        {error && (
          <div className="auditor-alert error">
            <span className="auditor-alert-icon">
              !
            </span>

            <span>
              {error}
            </span>
          </div>
        )}

        {/* ====================================================
            RESUMEN
        ==================================================== */}

        <section className="auditor-summary">

          <div className="summary-item">

            <span className="summary-item-label">
              Líneas
            </span>

            <strong>
              {totalDetalles}
            </strong>

          </div>

          <div className="summary-item conforme">

            <span className="summary-item-label">
              Conformes
            </span>

            <strong>
              {totalConformes}
            </strong>

          </div>

          <div className="summary-item diferencia">

            <span className="summary-item-label">
              Diferencias
            </span>

            <strong>
              {totalDiferencias}
            </strong>

          </div>

          <div className="summary-item pendiente">

            <span className="summary-item-label">
              Pendientes
            </span>

            <strong>
              {Math.max(
                totalDetalles -
                totalConformes -
                totalDiferencias,
                0
              )}
            </strong>

          </div>

        </section>

        {/* ====================================================
            HERRAMIENTAS
        ==================================================== */}

        <section className="auditor-tools">

          <div className="auditor-search">

            

            <input
              type="text"
              value={busqueda}
              placeholder="Buscar SKU, descripción o ubicación..."
              onChange={e => {
                const valor =
                  e.target.value

                setBusqueda(
                  valor
                )

                guardarSesionConFiltros({
                  busqueda:
                    valor
                })
              }}
              aria-label="Buscar productos"
            />

            {busqueda && (
              <button
                type="button"
                className="search-clear"
                onClick={() => {
                  setBusqueda('')

                  guardarSesionConFiltros({
                    busqueda: ''
                  })
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
                filtroResultado ===
                'todos'
                  ? 'auditor-filter active'
                  : 'auditor-filter'
              }
              onClick={() => {
                setFiltroResultado(
                  'todos'
                )

                guardarSesionConFiltros({
                  filtroResultado:
                    'todos'
                })
              }}
            >
              Todos
            </button>

            <button
              type="button"
              className={
                filtroResultado ===
                'conforme'
                  ? 'auditor-filter active conforme'
                  : 'auditor-filter'
              }
              onClick={() => {
                setFiltroResultado(
                  'conforme'
                )

                guardarSesionConFiltros({
                  filtroResultado:
                    'conforme'
                })
              }}
            >
              Conformes
            </button>

            <button
              type="button"
              className={
                filtroResultado ===
                'diferencia'
                  ? 'auditor-filter active diferencia'
                  : 'auditor-filter'
              }
              onClick={() => {
                setFiltroResultado(
                  'diferencia'
                )

                guardarSesionConFiltros({
                  filtroResultado:
                    'diferencia'
                })
              }}
            >
              Diferencias
            </button>

          </div>

          <div className="auditor-search-info">

            Mostrando{' '}
            <strong>
              {detallesFiltrados.length}
            </strong>
            {' '}
            de{' '}
            <strong>
              {totalDetalles}
            </strong>
            {' '}
            líneas

          </div>

        </section>

        {/* ====================================================
            NO MANIFESTADOS
        ==================================================== */}

        <section className="auditor-no-manifestados">

          <div className="auditor-section-heading">

            <div>

              <span className="auditor-section-kicker">
                Registro adicional
              </span>

              <h2>
                No manifestados
              </h2>

              <p>
                Registra productos encontrados físicamente
                que no aparecen en el costo.
              </p>

            </div>

            <span className="auditor-section-badge">
              {noManifestados.length}
            </span>

          </div>

          <div className="no-manifestados-form">

            <div className="no-manifestados-field">

              <label htmlFor="no-manifestado-sku">
                SKU
              </label>

              <input
                id="no-manifestado-sku"
                type="text"
                placeholder="Código del producto"
                value={
                  nuevoNoManifestado.sku
                }
                onChange={e =>
                  setNuevoNoManifestado(
                    anterior => ({
                      ...anterior,
                      sku:
                        e.target.value
                    })
                  )
                }
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
                value={
                  nuevoNoManifestado.cantidad
                }
                onChange={e => {
                  const valor =
                    e.target.value

                  if (
                    !/^\d*\.?\d*$/.test(
                      valor
                    )
                  ) {
                    return
                  }

                  setNuevoNoManifestado(
                    anterior => ({
                      ...anterior,
                      cantidad:
                        valor
                    })
                  )
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
                value={
                  nuevoNoManifestado.observacion
                }
                onChange={e =>
                  setNuevoNoManifestado(
                    anterior => ({
                      ...anterior,
                      observacion:
                        e.target.value
                    })
                  )
                }
              />

            </div>

            <button
              type="button"
              className="btn-no-manifestado-agregar"
              onClick={
                agregarNoManifestado
              }
            >
              <span>
                +
              </span>

              Agregar
            </button>

          </div>

          {noManifestados.length >
            0 && (

            <div className="no-manifestados-table-wrapper">

              <table className="no-manifestados-table">

                <thead>

                  <tr>

                    <th>
                      SKU
                    </th>

                    <th>
                      Cantidad
                    </th>

                    <th>
                      Observación
                    </th>

                    <th>
                      Acción
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {noManifestados.map(
                    item => (
                      <tr
                        key={
                          item.id
                        }
                      >

                        <td>

                          <input
                            type="text"
                            value={
                              item.sku
                            }
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
                            value={
                              item.cantidad
                            }
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
                            value={
                              item.observacion ||
                              ''
                            }
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
                            onClick={() =>
                              eliminarNoManifestado(
                                item.id
                              )
                            }
                          >
                            Eliminar
                          </button>

                        </td>

                      </tr>
                    )
                  )}

                </tbody>

              </table>

            </div>
          )}

        </section>

        {/* ====================================================
            TABLA DE CONTEO
        ==================================================== */}

        <section className="auditor-table-container">

          <div className="auditor-table-heading">

            <div>

              <span className="auditor-section-kicker">
                Detalle del conteo
              </span>

              <h2>
                Productos a validar
              </h2>

            </div>

            <span className="auditor-table-count">
              {detallesFiltrados.length}
              {' '}
              líneas
            </span>

          </div>

          {loadingDetalles ? (

            <div className="auditor-table-loading">

              <span className="auditor-loading-spinner" />

              <span>
                Cargando detalles...
              </span>

            </div>

          ) : detallesFiltrados.length ===
            0 ? (

            <div className="auditor-empty">

              <div className="auditor-empty-icon">
                ⌕
              </div>

              <h3>
                No hay productos para este filtro
              </h3>

              <p>
                Prueba cambiando la búsqueda
                o el filtro de resultado.
              </p>

            </div>

          ) : (

            <div className="auditor-table-wrapper">

              <table className="auditor-table">

                <thead>

                  <tr>

                    <th className="col-sku">
                      SKU
                    </th>

                    <th className="col-descripcion">
                      Descripción
                    </th>

                    <th className="col-um">
                      UM
                    </th>

                    <th className="col-ubicacion">
                      Ubicación
                    </th>

                    <th className="col-conteo">
                      Conteo
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {detallesFiltrados.map(
                    detalle => (
                      <tr
                        key={
                          detalle.id
                        }
                      >

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
                            detalle={
                              detalle
                            }
                            costoId={
                              costoSeleccionado.id
                            }
                            usuarioId={
                              usuarioId
                            }
                            numeroConteo={
                              numeroConteo
                            }
                            onRegistrado={
                              datos =>
                                manejarResultado(
                                  datos.detalleId,
                                  datos.resultado
                                )
                            }
                            onCambio={
                              manejarCambio
                            }
                          />

                        </td>

                      </tr>
                    )
                  )}

                </tbody>

              </table>

            </div>
          )}

        </section>

        {/* ====================================================
            GUARDAR
        ==================================================== */}

        <section className="auditor-save-section">

          <div className="auditor-save-info">

            <span className="auditor-save-status-icon">
              {borradorGuardado
                ? '✓'
                : '•'}
            </span>

            <div>

              <strong>
                {borradorGuardado
                  ? 'Cambios guardados localmente'
                  : 'Conteo en edición'}
              </strong>

              <span>
                Puedes guardar un borrador o finalizar
                el conteo cuando hayas completado las líneas.
              </span>

            </div>

          </div>

          <div className="auditor-save-actions">

            <button
              type="button"
              className="btn-guardar-borrador"
              onClick={
                guardarBorradorActual
              }
              disabled={
                guardandoCosto
              }
            >
              <span>
                ⬇
              </span>

              Guardar borrador
            </button>

            <button
              type="button"
              className="btn-guardar-costo"
              onClick={
                guardarCosto
              }
              disabled={
                guardandoCosto ||
                loadingDetalles
              }
            >
              {guardandoCosto ? (
                <>
                  <span className="button-spinner" />
                  Guardando...
                </>
              ) : (
                <>
                  <span>
                    ✓
                  </span>

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