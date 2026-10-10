import { useEffect, useMemo, useState } from 'react'

import {
  obtenerDetallesCostoAdmin,
  obtenerConteoAnterior,
  validarConteo,
  guardarConteoCosto
} from '../../services/costos'

import { supabase } from '../../supabaseClient'
import { estaOnline, escucharConexion } from '../../services/offlineStorage'
import ValidationNotice from '../../components/ValidationNotice'
import { esAvisoCantidadesIncompletas } from '../../components/validationNoticeUtils'




function ConteoAdmin({
  costo,
  numeroConteo,
  onGuardado,
  onVolver,
  usuarioId: usuarioIdInicial
}) {
  const [detalles, setDetalles] = useState([])
  const [cantidades, setCantidades] = useState({})
  const [factores, setFactores] = useState({})
  const [resultados, setResultados] = useState({})
  const [noManifestados, setNoManifestados] = useState([])
  const [nuevoNoManifestado, setNuevoNoManifestado] = useState({ sku: '', cantidad: '', observacion: '' })
  const [busqueda, setBusqueda] = useState('')

  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [validandoTodo, setValidandoTodo] = useState(false)

  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  const [usuarioId, setUsuarioId] = useState(usuarioIdInicial || null)
  const [borradorRecuperado, setBorradorRecuperado] = useState(false)
  const [conexionOnline, setConexionOnline] = useState(estaOnline())


  // ==========================================================
  // CLAVE DEL BORRADOR
  // ==========================================================

  const claveBorrador = useMemo(() => {
    if (!usuarioId || !costo?.id || !numeroConteo) {
      return null
    }

    return `conteo_admin_${usuarioId}_${costo.id}_${numeroConteo}`
  }, [
    usuarioId,
    costo?.id,
    numeroConteo
  ])


  // ==========================================================
  // OBTENER USUARIO ACTUAL
  // ==========================================================

  useEffect(() => {
    if (usuarioIdInicial) return
    let activo = true
    async function obtenerUsuario() {
      try {
        const {
          data,
          error: errorUsuario
        } = await supabase.auth.getUser()

        if (errorUsuario) {
          throw errorUsuario
        }

        if (!activo) {
          return
        }

        setUsuarioId(
          data?.user?.id || null
        )
      } catch (errorUsuario) {
        console.error(
          'Error obteniendo usuario actual:',
          errorUsuario
        )
      }
    }

    obtenerUsuario()

    return () => {
      activo = false
    }
  }, [usuarioIdInicial])

  useEffect(() => escucharConexion({
    alConectar: () => setConexionOnline(true),
    alDesconectar: () => setConexionOnline(false)
  }), [])

  // ==========================================================
  // CARGAR DETALLES
  // ==========================================================

  useEffect(() => {
    let activo = true

    async function cargar() {
      try {
        setCargando(true)
        setError('')
        setMensaje('')
        setBorradorRecuperado(false)

        let datos
        try { datos = await obtenerDetallesCostoAdmin(costo.id, numeroConteo) } catch (errorRemoto) {
          const local = claveBorrador ? JSON.parse(localStorage.getItem(claveBorrador) || 'null') : null
          if (!navigator.onLine && Array.isArray(local?.detalles) && local.detalles.length) datos = local.detalles
          else throw errorRemoto
        }

        if (!activo) {
          return
        }

        setDetalles(datos)

        // ----------------------------------------------------
        // CANTIDADES INICIALES
        // ----------------------------------------------------

        const cantidadesIniciales = {}
        const factoresIniciales = {}

        for (const detalle of datos) {
          let valores = ['']
          let factor = 1

          // --------------------------------------------------
          // CONTEO 1
          // --------------------------------------------------

          if (Number(numeroConteo) === 1) {
            valores = ['']
            factor = 1
          }

          // --------------------------------------------------
          // CONTEO 2 / 3
          // --------------------------------------------------

          else if (navigator.onLine) {
            try {
              const anterior = await obtenerConteoAnterior(detalle.id, numeroConteo)

              if (
                anterior &&
                Array.isArray(anterior.cantidades) &&
                anterior.cantidades.length > 0
              ) {
                valores =
                  anterior.cantidades.map(
                    cantidad =>
                      String(cantidad)
                  )

                factor =
                  Number(
                    anterior.factor ?? 1
                  )
              }
            } catch (errorAnterior) {
              console.error(
                'Error obteniendo conteo anterior:',
                errorAnterior
              )

              throw errorAnterior
            }
          }

          cantidadesIniciales[detalle.id] =
            valores

          factoresIniciales[detalle.id] =
            factor
        }

        if (!activo) {
          return
        }

        // ----------------------------------------------------
        // APLICAR VALORES INICIALES
        // ----------------------------------------------------

        setCantidades(
          cantidadesIniciales
        )

        setFactores(
          factoresIniciales
        )

        // ----------------------------------------------------
        // RECUPERAR BORRADOR LOCAL
        // ----------------------------------------------------

        if (claveBorrador) {
          try {
            const borradorGuardado =
              localStorage.getItem(
                claveBorrador
              )

            if (borradorGuardado) {
              const borrador =
                JSON.parse(
                  borradorGuardado
                )

              if (
                borrador &&
                typeof borrador === 'object'
              ) {
                if (
                  borrador.cantidades &&
                  typeof borrador.cantidades === 'object'
                ) {
                  setCantidades(
                    borrador.cantidades
                  )
                }

                if (
                  borrador.factores &&
                  typeof borrador.factores === 'object'
                ) {
                  setFactores(
                    borrador.factores
                  )
                }

                if (
                  borrador.resultados &&
                  typeof borrador.resultados === 'object'
                ) {
                  setResultados(
                    borrador.resultados
                  )
                }

                if (Array.isArray(borrador.noManifestados)) {
                  setNoManifestados(borrador.noManifestados)
                }

                if (borrador.nuevoNoManifestado && typeof borrador.nuevoNoManifestado === 'object') {
                  setNuevoNoManifestado({
                    sku: String(borrador.nuevoNoManifestado.sku || ''),
                    cantidad: String(borrador.nuevoNoManifestado.cantidad || ''),
                    observacion: String(borrador.nuevoNoManifestado.observacion || '')
                  })
                }

                if (
                  typeof borrador.busqueda === 'string'
                ) {
                  setBusqueda(
                    borrador.busqueda
                  )
                }

                setBorradorRecuperado(true)

                setMensaje(
                  'Se recuperó tu avance guardado.'
                )
              }
            }

            const borradorAdicional = JSON.parse(
              localStorage.getItem(`${claveBorrador}_no_manifestados`) || 'null'
            )
            if (Array.isArray(borradorAdicional?.noManifestados)) {
              setNoManifestados(borradorAdicional.noManifestados)
              setBorradorRecuperado(true)
            }
            if (borradorAdicional?.nuevoNoManifestado) {
              setNuevoNoManifestado({
                sku: String(borradorAdicional.nuevoNoManifestado.sku || ''),
                cantidad: String(borradorAdicional.nuevoNoManifestado.cantidad || ''),
                observacion: String(borradorAdicional.nuevoNoManifestado.observacion || '')
              })
              setBorradorRecuperado(true)
            }
          } catch (errorBorrador) {
            console.error(
              'Error recuperando borrador local:',
              errorBorrador
            )
          }
        }
      } catch (errorCarga) {
        console.error(
          'Error cargando conteo admin:',
          errorCarga
        )

        if (activo) {
          setError(
            errorCarga?.message ||
            'No se pudieron cargar los productos.'
          )
        }
      } finally {
        if (activo) {
          setCargando(false)
        }
      }
    }

    if (
      costo?.id &&
      claveBorrador
    ) {
      cargar()
    }

    return () => {
      activo = false
    }
  }, [
    costo?.id,
    numeroConteo,
    claveBorrador
  ])


  // ==========================================================
  // GUARDAR BORRADOR AUTOMÁTICAMENTE
  // ==========================================================

  useEffect(() => {
    if (
      !claveBorrador ||
      cargando
    ) {
      return
    }

    const borrador = {
      cantidades,
      factores,
      resultados,
      noManifestados,
      nuevoNoManifestado,
      busqueda,
      detalles,
      actualizadoEn:
        new Date().toISOString()
    }

    try {
      localStorage.setItem(
        claveBorrador,
        JSON.stringify(borrador)
      )
    } catch (errorBorrador) {
      console.error(
        'Error guardando borrador local:',
        errorBorrador
      )
    }
  }, [
    claveBorrador,
    cantidades,
    factores,
    resultados,
    noManifestados,
    nuevoNoManifestado,
    busqueda,
    detalles,
    cargando
  ])


  // ==========================================================
  // CAMBIAR CANTIDAD
  // ==========================================================

  function cambiarCantidad(
    detalleId,
    index,
    valor
  ) {
    if (!/^\d*\.?\d*$/.test(valor)) {
      return
    }

    setCantidades(
      anterior => {
        const actuales =
          Array.isArray(
            anterior[detalleId]
          )
            ? [
                ...anterior[detalleId]
              ]
            : ['']

        actuales[index] =
          valor

        return {
          ...anterior,
          [detalleId]:
            actuales
        }
      }
    )

    // Al modificar una cantidad,
    // la validación anterior deja
    // de ser válida.

    setResultados(
      anterior => {
        const copia = {
          ...anterior
        }

        delete copia[detalleId]

        return copia
      }
    )
  }


  // ==========================================================
  // CAMBIAR FACTOR
  // ==========================================================

  function cambiarFactor(
    detalleId,
    valor
  ) {
    if (!/^\d*\.?\d*$/.test(valor)) {
      return
    }

    setFactores(
      anterior => ({
        ...anterior,
        [detalleId]:
          valor
      })
    )

    setResultados(
      anterior => {
        const copia = {
          ...anterior
        }

        delete copia[detalleId]

        return copia
      }
    )
  }


  // ==========================================================
  // AGREGAR CANTIDAD
  // ==========================================================

  function agregarCantidad(
    detalleId
  ) {
    setCantidades(
      anterior => {
        const actuales =
          Array.isArray(
            anterior[detalleId]
          )
            ? [
                ...anterior[detalleId]
              ]
            : ['']

        return {
          ...anterior,
          [detalleId]: [
            ...actuales,
            ''
          ]
        }
      }
    )
  }


  // ==========================================================
  // ELIMINAR CANTIDAD
  // ==========================================================

  function eliminarCantidad(
    detalleId,
    index
  ) {
    setCantidades(
      anterior => {
        const actuales =
          Array.isArray(
            anterior[detalleId]
          )
            ? [
                ...anterior[detalleId]
              ]
            : ['']

        if (actuales.length <= 1) {
          return anterior
        }

        actuales.splice(
          index,
          1
        )

        return {
          ...anterior,
          [detalleId]:
            actuales
        }
      }
    )

    setResultados(
      anterior => {
        const copia = {
          ...anterior
        }

        delete copia[detalleId]

        return copia
      }
    )
  }


  // ==========================================================
  // CALCULAR RESULTADO LOCAL
  // ==========================================================

  function calcularLocal(
    detalleId
  ) {
    const lista =
      cantidades[detalleId] || []

    const factor =
      Number(
        factores[detalleId] ?? 1
      )

    const valores =
      lista.map(
        Number
      )

    if (
      valores.length === 0 ||
      valores.some(
        numero =>
          !Number.isFinite(numero) ||
          numero < 0
      )
    ) {
      return {
        valido: false,
        total: 0,
        final: 0
      }
    }

    if (
      !Number.isFinite(factor) ||
      factor <= 0
    ) {
      return {
        valido: false,
        total: 0,
        final: 0
      }
    }

    const total =
      valores.reduce(
        (suma, valor) =>
          suma + valor,
        0
      )

    const final =
      total * factor

    return {
      valido: true,
      total,
      final
    }
  }


  // ==========================================================
  // VALIDAR UNA LÍNEA
  // ==========================================================

  async function validarLinea(
    detalle
  ) {
    try {
      setError('')
      setMensaje('')

      const lista =
        cantidades[detalle.id] || []

      const factor =
        factores[detalle.id]

      if (
        lista.length === 0 ||
        lista.some(
          valor =>
            valor === ''
        )
      ) {
        throw new Error(
          `Ingresa todas las cantidades del SKU ${detalle.sku}.`
        )
      }

      const valores =
        lista.map(
          Number
        )

      if (
        valores.some(
          valor =>
            !Number.isFinite(valor) ||
            valor < 0
        )
      ) {
        throw new Error(
          `Las cantidades del SKU ${detalle.sku} no son válidas.`
        )
      }

      const factorNumerico =
        Number(factor)

      if (
        !Number.isFinite(
          factorNumerico
        ) ||
        factorNumerico <= 0
      ) {
        throw new Error(
          `El factor del SKU ${detalle.sku} debe ser mayor que cero.`
        )
      }

      const resultado =
        await validarConteo(
          detalle.id,
          valores,
          factorNumerico
        )

      setResultados(
        anterior => ({
          ...anterior,
          [detalle.id]:
            resultado
        })
      )
    } catch (errorValidacion) {
      console.error(
        'Error validando línea:',
        errorValidacion
      )

      setError(
        errorValidacion?.message ||
        'No se pudo validar el producto.'
      )
    }
  }


  // ==========================================================
  // VALIDAR TODO
  // ==========================================================

  async function validarTodo() {
    try {
      setValidandoTodo(true)
      setError('')
      setMensaje('')

      const nuevosResultados = {}

      for (const detalle of detalles) {
        const lista =
          cantidades[detalle.id] || []

        const factor =
          factores[detalle.id]

        if (
          lista.length === 0 ||
          lista.some(
            valor =>
              valor === ''
          )
        ) {
          throw new Error(
            `Falta completar el SKU ${detalle.sku}.`
          )
        }

        const valores =
          lista.map(
            Number
          )

        const factorNumerico =
          Number(factor)

        if (
          valores.some(
            valor =>
              !Number.isFinite(valor) ||
              valor < 0
          )
        ) {
          throw new Error(
            `Las cantidades del SKU ${detalle.sku} no son válidas.`
          )
        }

        if (
          !Number.isFinite(
            factorNumerico
          ) ||
          factorNumerico <= 0
        ) {
          throw new Error(
            `El factor del SKU ${detalle.sku} no es válido.`
          )
        }

        const resultado =
          await validarConteo(
            detalle.id,
            valores,
            factorNumerico
          )

        nuevosResultados[detalle.id] =
          resultado
      }

      setResultados(
        nuevosResultados
      )

      setMensaje(
        'Todas las líneas fueron validadas.'
      )
    } catch (errorValidacion) {
      console.error(
        'Error validando todo:',
        errorValidacion
      )

      setError(
        errorValidacion?.message ||
        'No se pudieron validar todas las líneas.'
      )
    } finally {
      setValidandoTodo(false)
    }
  }


  // ==========================================================
  // GUARDAR CONTEO
  // ==========================================================

  function guardarBorradorNoManifestadosLocal(lista = noManifestados, formulario = nuevoNoManifestado) {
    if (!claveBorrador) return false

    try {
      localStorage.setItem(`${claveBorrador}_no_manifestados`, JSON.stringify({
        noManifestados: lista,
        nuevoNoManifestado: formulario,
        actualizadoEn: new Date().toISOString()
      }))
      setError('')
      return true
    } catch (errorBorrador) {
      console.error('Error guardando no manifestados localmente:', errorBorrador)
      setError('No se pudo guardar el avance en este equipo. Revisa el espacio disponible del navegador.')
      return false
    }
  }

  async function guardarNoManifestadosOficiales() {
    if (!usuarioId) throw new Error('No se pudo identificar al administrador.')

    const { data: existentes, error: errorExistentes } = await supabase
      .from('no_manifestados')
      .select('id, sku')
      .eq('costo_id', costo.id)
      .eq('auditor_id', usuarioId)
    if (errorExistentes) throw errorExistentes

    for (const item of noManifestados) {
      const registro = {
        costo_id: costo.id,
        sku: String(item.sku).trim(),
        cantidad: Number(item.cantidad),
        auditor_id: usuarioId,
        observacion: String(item.observacion || '').trim()
      }
      const existente = (existentes || []).find(
        fila => String(fila.sku || '').trim().toLowerCase() === registro.sku.toLowerCase()
      )

      const { error } = existente
        ? await supabase.from('no_manifestados').update(registro).eq('id', existente.id)
        : await supabase.from('no_manifestados').insert(registro)
      if (error) throw error
    }
  }

  function agregarNoManifestado() {
    const sku = nuevoNoManifestado.sku.trim()
    const cantidad = Number(nuevoNoManifestado.cantidad)
    if (!sku) return setError('Ingresa el SKU del producto no manifestado.')
    if (!Number.isFinite(cantidad) || cantidad <= 0) return setError('La cantidad del no manifestado debe ser mayor que 0.')
    if (noManifestados.some(item => String(item.sku).toLowerCase() === sku.toLowerCase())) {
      return setError('Ese SKU ya fue agregado como no manifestado.')
    }
    const listaActualizada = [...noManifestados, { id: `local-${Date.now()}`, sku, cantidad, observacion: nuevoNoManifestado.observacion.trim() }]
    const formularioVacio = { sku: '', cantidad: '', observacion: '' }
    const guardadoLocal = guardarBorradorNoManifestadosLocal(listaActualizada, formularioVacio)
    setNoManifestados(listaActualizada)
    setNuevoNoManifestado(formularioVacio)
      if (guardadoLocal) setError('')
  }

  function editarNoManifestado(id, campo, valor) {
    if (campo === 'cantidad' && !/^\d*\.?\d*$/.test(valor)) return
    const listaActualizada = noManifestados.map(item => item.id === id ? { ...item, [campo]: valor } : item)
    guardarBorradorNoManifestadosLocal(listaActualizada)
    setNoManifestados(listaActualizada)
  }

  function cambiarCampoNuevoNoManifestado(campo, valor) {
    const formularioActualizado = { ...nuevoNoManifestado, [campo]: valor }
    guardarBorradorNoManifestadosLocal(noManifestados, formularioActualizado)
    setNuevoNoManifestado(formularioActualizado)
  }

  async function guardar() {
    try {
      setGuardando(true)
      setError('')
      setMensaje('')

      if (!navigator.onLine) throw new Error('Sin conexión: el avance queda guardado localmente hasta recuperar Internet.')

      for (const item of noManifestados) {
        if (!String(item.sku || '').trim()) throw new Error('Existe un no manifestado sin SKU.')
        if (!Number.isFinite(Number(item.cantidad)) || Number(item.cantidad) <= 0) {
          throw new Error(`El SKU no manifestado ${item.sku} debe tener cantidad mayor que cero.`)
        }
      }

      if (detalles.length === 0) {
        throw new Error(
          'No existen líneas para guardar.'
        )
      }

      const detallesParaGuardar =
        detalles.map(
          detalle => {
            const lista =
              cantidades[detalle.id] || []

            if (
              lista.length === 0 ||
              lista.some(
                valor =>
                  valor === ''
              )
            ) {
              throw new Error(
                `Completa todas las cantidades del SKU ${detalle.sku}.`
              )
            }

            const valores =
              lista.map(
                Number
              )

            if (
              valores.some(
                valor =>
                  !Number.isFinite(valor) ||
                  valor < 0
              )
            ) {
              throw new Error(
                `El SKU ${detalle.sku} tiene cantidades inválidas.`
              )
            }

            const factor =
              Number(
                factores[detalle.id]
              )

            if (
              !Number.isFinite(factor) ||
              factor <= 0
            ) {
              throw new Error(
                `El factor del SKU ${detalle.sku} debe ser mayor que cero.`
              )
            }

            return {
              detalleCostoId:
                detalle.id,

              sku:
                detalle.sku,

              cantidades:
                valores,

              factor
            }
          }
        )

      await guardarNoManifestadosOficiales()

      const resultado =
        await guardarConteoCosto(
          costo.id,
          numeroConteo,
          detallesParaGuardar
        )

      // ------------------------------------------------------
      // ELIMINAR BORRADOR SOLO DESPUÉS DE GUARDAR BIEN
      // ------------------------------------------------------

      if (claveBorrador) {
        try {
          localStorage.removeItem(
            claveBorrador
          )
          localStorage.removeItem(`${claveBorrador}_no_manifestados`)
        } catch (errorBorrador) {
          console.error(
            'Error eliminando borrador:',
            errorBorrador
          )
        }
      }

      setMensaje(
        `Conteo ${numeroConteo} guardado correctamente.`
      )

      if (onGuardado) {
        onGuardado(
          resultado
        )
      }
    } catch (errorGuardar) {
      console.error(
        'Error guardando conteo admin:',
        errorGuardar
      )

      setError(
        errorGuardar?.message ||
        'No se pudo guardar el conteo.'
      )
    } finally {
      setGuardando(false)
    }
  }


  // ==========================================================
  // FILTRO
  // ==========================================================

  const detallesFiltrados =
    useMemo(
      () => {
        const texto =
          busqueda
            .trim()
            .toLowerCase()

        if (!texto) {
          return detalles
        }

        return detalles.filter(
          detalle =>
            String(
              detalle.sku
            )
              .toLowerCase()
              .includes(texto) ||

            String(
              detalle.descripcion
            )
              .toLowerCase()
              .includes(texto) ||

            String(
              detalle.ubicacion
            )
              .toLowerCase()
              .includes(texto)
        )
      },
      [
        detalles,
        busqueda
      ]
    )


  // ==========================================================
  // RESUMEN
  // ==========================================================

  const resumen =
    useMemo(
      () => {
        let completos = 0
        let pendientes = 0
        let conformes = 0
        let diferencias = 0

        detalles.forEach(
          detalle => {
            const resultado =
              resultados[detalle.id]

            if (resultado) {
              completos++

              if (
                resultado.resultado ===
                'conforme'
              ) {
                conformes++
              } else if (
                resultado.resultado ===
                'diferencia'
              ) {
                diferencias++
              }
            } else {
              pendientes++
            }
          }
        )

        return {
          total:
            detalles.length,

          completos,

          pendientes,

          conformes,

          diferencias
        }
      },
      [
        detalles,
        resultados
      ]
    )


  // ==========================================================
  // CARGANDO
  // ==========================================================

  if (cargando) {
    return (
      <div className="admin-conteo">
        <div className="admin-conteo-cargando">
          <div className="admin-conteo-spinner" />
          <span>Cargando productos...</span>
        </div>
      </div>
    )
  }


  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="admin-conteo">
      <ValidationNotice message={error} onClose={() => setError('')} />

      {/* ======================================================
          CABECERA
      ====================================================== */}

      <header className="admin-conteo-header">

        <div className="admin-conteo-heading">

          <button
            type="button"
            className="admin-conteo-volver"
            onClick={onVolver}
          >
            <span className="admin-conteo-volver-icon">
              ←
            </span>

            Volver
          </button>

          <div className="admin-conteo-title-row">

            <div>
              <span className="admin-conteo-kicker">
                Validación de inventario
              </span>

              <h2>
                Conteo {numeroConteo}
              </h2>

              <p>
                Costo #{costo.numero_costo}
              </p>
            </div>

            <span className="admin-conteo-badge">
              Conteo {numeroConteo}
            </span>

          </div>

        </div>


        <div className="admin-conteo-header-actions">
          <div className={`conexion-indicador ${conexionOnline ? 'conexion-online' : 'conexion-offline'}`} role="status"><span className="conexion-indicador-dot" aria-hidden="true" /><div className="conexion-indicador-info"><strong>{conexionOnline ? 'Conectado' : 'Sin conexión'}</strong><span>{conexionOnline ? 'Listo para guardar' : 'Avance guardado localmente'}</span></div></div>


          <button
            type="button"
            className="admin-conteo-btn-secundario"
            onClick={validarTodo}
            disabled={
              validandoTodo ||
              guardando
            }
          >
            <span className="admin-conteo-btn-icon">
              ✓
            </span>

            {validandoTodo ? <><span className="button-spinner" /> Validando...</> : 'Validar todo'}
          </button>


          <button
            type="button"
            className="admin-conteo-btn-principal"
            onClick={guardar}
            disabled={
              guardando ||
              validandoTodo
            }
          >
            <span className="admin-conteo-btn-icon">
              {guardando ? <span className="button-spinner" /> : '✓'}
            </span>

            {guardando
              ? 'Guardando...'
              : 'Guardar conteo'}
          </button>

        </div>

      </header>


      {/* ======================================================
          ALERTAS
      ====================================================== */}

      <div className="admin-conteo-alertas">

        {borradorRecuperado && (
          <div className="admin-conteo-alerta success">
            <span className="admin-conteo-alerta-icon">
              ✓
            </span>

            <div>
              <strong>
                Avance recuperado
              </strong>

              <span>
                Se recuperó automáticamente el avance que tenías guardado.
              </span>
            </div>
          </div>
        )}


        {error && !esAvisoCantidadesIncompletas(error) && (
          <div className="admin-conteo-alerta error">
            <span className="admin-conteo-alerta-icon">
              !
            </span>

            <div>
              <strong>
                No se pudo completar la operación
              </strong>

              <span>
                {error}
              </span>
            </div>
          </div>
        )}


        {mensaje && !borradorRecuperado && (
          <div className="admin-conteo-alerta success">
            <span className="admin-conteo-alerta-icon">
              ✓
            </span>

            <div>
              <strong>
                Operación completada
              </strong>

              <span>
                {mensaje}
              </span>
            </div>
          </div>
        )}

      </div>


      {/* ======================================================
          RESUMEN
      ====================================================== */}

      <section className="admin-conteo-resumen">

        <div className="admin-conteo-resumen-item total">
          <span className="admin-conteo-resumen-label">
            Líneas
          </span>

          <strong>
            {resumen.total}
          </strong>
        </div>


        <div className="admin-conteo-resumen-item pendiente">
          <span className="admin-conteo-resumen-label">
            Pendientes
          </span>

          <strong>
            {resumen.pendientes}
          </strong>
        </div>


        <div className="admin-conteo-resumen-item conforme">
          <span className="admin-conteo-resumen-label">
            Conformes
          </span>

          <strong>
            {resumen.conformes}
          </strong>
        </div>


        <div className="admin-conteo-resumen-item diferencia">
          <span className="admin-conteo-resumen-label">
            Diferencias
          </span>

          <strong>
            {resumen.diferencias}
          </strong>
        </div>

      </section>


      {/* ======================================================
          HERRAMIENTAS
      ====================================================== */}

      <section className="admin-conteo-toolbar">

        <div className="admin-conteo-search">

          

          <input
            type="text"
            placeholder="Buscar SKU, descripción o ubicación..."
            value={busqueda}
            onChange={
              event =>
                setBusqueda(
                  event.target.value
                )
            }
          />

          {busqueda && (
            <button
              type="button"
              className="admin-conteo-search-clear"
              onClick={() => setBusqueda('')}
              aria-label="Limpiar búsqueda"
            >
              ×
            </button>
          )}

        </div>

        <span className="admin-conteo-resultados">
          {detallesFiltrados.length} de {detalles.length} líneas
        </span>

      </section>


      {/* ======================================================
          TABLA
      ====================================================== */}

      <section className="admin-conteo-tabla-card">

        <div className="admin-conteo-tabla-heading">

          <div>
            <span className="admin-conteo-section-kicker">
              Detalle del conteo
            </span>

            <h3>
              Productos a validar
            </h3>
          </div>

          <span className="admin-conteo-tabla-count">
            {detallesFiltrados.length} líneas
          </span>

        </div>


        <div className="admin-conteo-tabla-wrap">

          <table className="admin-conteo-tabla">

            <thead>
              <tr>
                <th className="col-sku">
                  SKU
                </th>

                <th className="col-descripcion">
                  Descripción
                </th>

                <th className="col-ubicacion">
                  Ubicación
                </th>

                <th className="col-um">
                  UM
                </th>

                <th className="col-fisica">
                  Cantidad física
                </th>

                <th className="col-conteo">
                  Conteo
                </th>

                <th className="col-factor">
                  Factor
                </th>

                <th className="col-final">
                  Final
                </th>

                <th className="col-resultado">
                  Resultado
                </th>

                <th className="col-accion">
                  Acción
                </th>
              </tr>
            </thead>


            <tbody>

              {detallesFiltrados.map(
                detalle => {

                  const lista =
                    cantidades[detalle.id] ||
                    ['']

                  const factor =
                    factores[detalle.id] ??
                    1

                  const calculo =
                    calcularLocal(
                      detalle.id
                    )

                  const resultado =
                    resultados[detalle.id]

                  return (
                    <tr
                      key={detalle.id}
                    >

                      {/* SKU */}

                      <td className="admin-conteo-sku">

                        <strong>
                          {detalle.sku}
                        </strong>

                      </td>


                      {/* DESCRIPCIÓN */}

                      <td className="admin-conteo-descripcion">
                        {detalle.descripcion}
                      </td>


                      {/* UBICACIÓN */}

                      <td>
                        <span className="admin-conteo-ubicacion">
                          {detalle.ubicacion}
                        </span>
                      </td>


                      {/* UM */}

                      <td>
                        <span className="admin-conteo-um">
                          {detalle.um}
                        </span>
                      </td>


                      {/* CANTIDAD FÍSICA */}

                      <td className="admin-conteo-fisica">

                        <span className="admin-conteo-fisica-label">
                          Esperada
                        </span>

                        <strong>
                          {Number(
                            detalle.cantidad_fisica
                          )}
                        </strong>

                      </td>


                      {/* CANTIDADES */}

                      <td>

                        <div className="admin-conteo-cantidades">

                          {lista.map(
                            (
                              cantidad,
                              index
                            ) => (
                              <div
                                className="admin-conteo-cantidad-row"
                                key={
                                  `cantidad-${detalle.id}-${index}`
                                }
                              >

                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className="admin-conteo-cantidad-input"
                                  value={cantidad}
                                  onChange={
                                    event =>
                                      cambiarCantidad(
                                        detalle.id,
                                        index,
                                        event.target.value
                                      )
                                  }
                                  aria-label={`Cantidad ${index + 1} del SKU ${detalle.sku}`}
                                />


                                {lista.length > 1 && (
                                  <button
                                    type="button"
                                    className="admin-conteo-eliminar"
                                    onClick={
                                      () =>
                                        eliminarCantidad(
                                          detalle.id,
                                          index
                                        )
                                    }
                                    title="Eliminar cantidad"
                                    aria-label="Eliminar cantidad"
                                  >
                                    ×
                                  </button>
                                )}

                              </div>
                            )
                          )}


                          <button
                            type="button"
                            className="admin-conteo-agregar"
                            onClick={
                              () =>
                                agregarCantidad(
                                  detalle.id
                                )
                            }
                          >
                            + cantidad
                          </button>

                        </div>

                      </td>


                      {/* FACTOR */}

                      <td>

                        <input
                          type="text"
                          inputMode="decimal"
                          className="admin-conteo-factor"
                          value={factor}
                          onChange={
                            event =>
                              cambiarFactor(
                                detalle.id,
                                event.target.value
                              )
                          }
                          aria-label={`Factor del SKU ${detalle.sku}`}
                        />

                      </td>


                      {/* FINAL */}

                      <td className="admin-conteo-final">

                        {calculo.valido ? (
                          <strong>
                            {calculo.final}
                          </strong>
                        ) : (
                          <span>
                            —
                          </span>
                        )}

                      </td>


                      {/* RESULTADO */}

                      <td>

                        {resultado ? (

                          <span
                            className={
                              resultado.resultado ===
                              'conforme'
                                ? 'admin-conteo-resultado conforme'
                                : 'admin-conteo-resultado diferencia'
                            }
                          >

                            <span className="admin-conteo-resultado-dot" />

                            {resultado.resultado ===
                            'conforme'
                              ? 'CONFORME'
                              : 'DIFERENCIA'}

                          </span>

                        ) : (

                          <span className="admin-conteo-pendiente">
                            Pendiente
                          </span>

                        )}

                      </td>


                      {/* ACCIÓN */}

                      <td>

                        <button
                          type="button"
                          className="admin-conteo-validar"
                          onClick={
                            () =>
                              validarLinea(
                                detalle
                              )
                          }
                          disabled={
                            guardando ||
                            validandoTodo
                          }
                        >
                          ✓ Validar
                        </button>

                      </td>

                    </tr>
                  )
                }
              )}

            </tbody>

          </table>


          {detallesFiltrados.length === 0 && (
            <div className="admin-conteo-vacio">

              <div className="admin-conteo-vacio-icon">
                ⌕
              </div>

              <strong>
                No se encontraron productos
              </strong>

              <span>
                Intenta con otro SKU, descripción o ubicación.
              </span>

            </div>
          )}

        </div>

      </section>

      <section className="admin-no-manifestados" aria-labelledby="admin-no-manifestados-title">
        <div className="admin-no-manifestados-heading">
          <div>
            <span>Registro adicional</span>
            <h2 id="admin-no-manifestados-title">No manifestados</h2>
            <p>Agrega productos encontrados físicamente que no aparecen en el costo. Cada cambio se guarda automáticamente en este equipo y se recupera al volver al conteo.</p>
          </div>
          <strong>{noManifestados.length}</strong>
        </div>

        <div className="admin-no-manifestados-form">
          <label>SKU
            <input value={nuevoNoManifestado.sku} onChange={event => cambiarCampoNuevoNoManifestado('sku', event.target.value)} placeholder="Código SKU" />
          </label>
          <label>Cantidad
            <input type="text" inputMode="decimal" value={nuevoNoManifestado.cantidad} onChange={event => cambiarCampoNuevoNoManifestado('cantidad', event.target.value)} placeholder="0" />
          </label>
          <label>Observación
            <input value={nuevoNoManifestado.observacion} onChange={event => cambiarCampoNuevoNoManifestado('observacion', event.target.value)} placeholder="Opcional" />
          </label>
          <button type="button" onClick={agregarNoManifestado}>+ Agregar SKU</button>
        </div>

        {noManifestados.length > 0 ? (
          <div className="admin-no-manifestados-list">
            {noManifestados.map(item => (
              <div className="admin-no-manifestados-row" key={item.id}>
                <input aria-label="SKU no manifestado" value={item.sku} onChange={event => editarNoManifestado(item.id, 'sku', event.target.value)} />
                <input aria-label="Cantidad no manifestada" type="text" inputMode="decimal" value={item.cantidad} onChange={event => editarNoManifestado(item.id, 'cantidad', event.target.value)} />
                <input aria-label="Observación no manifestada" value={item.observacion || ''} onChange={event => editarNoManifestado(item.id, 'observacion', event.target.value)} placeholder="Observación" />
                <button type="button" onClick={() => {
                  const listaActualizada = noManifestados.filter(actual => actual.id !== item.id)
                  guardarBorradorNoManifestadosLocal(listaActualizada)
                  setNoManifestados(listaActualizada)
                }} aria-label={`Eliminar SKU ${item.sku}`}>×</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="admin-no-manifestados-empty">Aún no agregas productos no manifestados.</p>
        )}
      </section>

    </div>
  )
}


export default ConteoAdmin
