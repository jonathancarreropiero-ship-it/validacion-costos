import { useEffect, useMemo, useRef, useState } from 'react'

import {
  obtenerDetallesCostoAdmin,
  obtenerConteoAnterior,
  guardarConteoCosto,
  obtenerEstadoConteoCompartido,
  obtenerResumenConteoCompartido,
  renovarBloqueoCosto
} from '../../services/costos'

import { supabase } from '../../supabaseClient'
import { estaOnline, escucharConexion } from '../../services/offlineStorage'
import ValidationNotice from '../../components/ValidationNotice'
import CountQuantityEditor from '../../components/CountQuantityEditor'
import ScrollableTable from '../../components/ScrollableTable'




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
  const [noManifestados, setNoManifestados] = useState([])
  const [nuevoNoManifestado, setNuevoNoManifestado] = useState({ sku: '', cantidad: '', observacion: '' })
  const [busqueda, setBusqueda] = useState('')

  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [apoyoGuardadoPendiente, setApoyoGuardadoPendiente] = useState(false)
  const [apoyoConteoCompletado, setApoyoConteoCompletado] = useState(false)
  const [resumenApoyo, setResumenApoyo] = useState(null)

  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  const [usuarioId, setUsuarioId] = useState(usuarioIdInicial || null)
  const [borradorRecuperado, setBorradorRecuperado] = useState(false)
  const [conexionOnline, setConexionOnline] = useState(estaOnline())
  const onVolverRef = useRef(onVolver)

  useEffect(() => {
    onVolverRef.current = onVolver
  }, [onVolver])


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

  useEffect(() => {
    if (!costo?.id || !conexionOnline || apoyoGuardadoPendiente) return undefined
    let activo = true
    const renovar = async () => {
      try {
        await renovarBloqueoCosto(costo.id)
      } catch (errorRenovacion) {
        const mensajeError = String(errorRenovacion?.message || '')
        if (costo.apoyoHabilitado && /no tienes el bloqueo de este costo/i.test(mensajeError)) {
          console.warn('Tu sesión compartida sigue activa; Supabase aún responde con la validación del bloqueo individual.')
          return
        }
        if (!activo) return
        console.error('No se pudo renovar el acceso al conteo:', errorRenovacion)
        if (/no eres responsable|no eres participante|no autorizado|no está disponible|no tienes el bloqueo|está terminado/i.test(mensajeError)) {
          setError('El costo fue reiniciado o tu acceso dejó de estar vigente. Volviendo a la lista de costos.')
          onVolver()
        } else {
          setError(mensajeError || 'No se pudo verificar tu acceso al conteo.')
        }
      }
    }
    renovar()
    const intervalo = window.setInterval(renovar, 8 * 1000)
    return () => {
      activo = false
      window.clearInterval(intervalo)
    }
  }, [costo?.id, costo?.apoyoHabilitado, conexionOnline, apoyoGuardadoPendiente, onVolver])

  useEffect(() => {
    if (!apoyoGuardadoPendiente || apoyoConteoCompletado) return undefined
    let activo = true
    let timer
    const consultar = async () => {
      try {
        const estado = await obtenerEstadoConteoCompartido(costo.id, numeroConteo)
        if (!activo) return
        if (estado?.completado) {
          const resumen = await obtenerResumenConteoCompartido(costo.id, numeroConteo)
          if (!activo) return
          setResumenApoyo({
            conteo: numeroConteo,
            resultado: estado.resultado === 'conforme' ? 'conforme' : 'no_conforme',
            resultadoTexto: estado.resultado === 'conforme' ? 'CONFORME' : 'NO CONFORME',
            lineasConformes: resumen.lineasConformes,
            lineasDiferencia: resumen.lineasDiferencia
          })
          setApoyoConteoCompletado(true)
          return
        }
      } catch (estadoError) {
        console.error('No se pudo consultar el estado del conteo compartido:', estadoError)
        if (/no hay un conteo compartido activo|no existe.*sesión|no está disponible/i.test(String(estadoError?.message || ''))) {
          if (activo) onVolverRef.current?.()
          return
        }
      }
      timer = window.setTimeout(consultar, 2500)
    }
    timer = window.setTimeout(consultar, 2500)
    return () => { activo = false; window.clearTimeout(timer) }
  }, [apoyoGuardadoPendiente, apoyoConteoCompletado, costo?.id, numeroConteo])

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
        const claveAvisoBorrador = 'conteo-admin-omitir-aviso-borrador'
        const omitirAvisoBorrador = sessionStorage.getItem(claveAvisoBorrador) === '1'
        sessionStorage.removeItem(claveAvisoBorrador)

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
          let factor = Number(detalle.factor) > 0 ? Number(detalle.factor) : 1

          // --------------------------------------------------
          // CONTEO 1
          // --------------------------------------------------

          if (Number(numeroConteo) === 1) {
            valores = ['']
            factor = Number(detalle.factor) > 0 ? Number(detalle.factor) : 1
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

                if (!omitirAvisoBorrador) setBorradorRecuperado(true)

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
              if (!omitirAvisoBorrador) setBorradorRecuperado(true)
            }
            if (borradorAdicional?.nuevoNoManifestado) {
              setNuevoNoManifestado({
                sku: String(borradorAdicional.nuevoNoManifestado.sku || ''),
                cantidad: String(borradorAdicional.nuevoNoManifestado.cantidad || ''),
                observacion: String(borradorAdicional.nuevoNoManifestado.observacion || '')
              })
              if (!omitirAvisoBorrador) setBorradorRecuperado(true)
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
  // VALIDAR TODO
  // ==========================================================

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

      if (detalles.length === 0 && !costo.apoyoHabilitado) {
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

      if (resultado?.esperando_segundo) {
        setApoyoGuardadoPendiente(true)
        return
      }

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

      if (resultado?.apoyo_habilitado) {
        let resumen = null
        try {
          resumen = await obtenerResumenConteoCompartido(costo.id, numeroConteo)
        } catch (errorResumen) {
          console.error('No se pudo cargar el resumen compartido persistido:', errorResumen)
        }
        setResumenApoyo({
          conteo: numeroConteo,
          resultado: resultado.resultado,
          resultadoTexto: resultado.resultado === 'conforme' ? 'CONFORME' : 'NO CONFORME',
          lineasConformes: resumen?.lineasConformes ?? resultado.lineasConformes ?? null,
          lineasDiferencia: resumen?.lineasDiferencia ?? resultado.lineasDiferencia ?? null
        })
        setApoyoConteoCompletado(true)
        setApoyoGuardadoPendiente(true)
        return
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

  function guardarBorrador() {
    if (!claveBorrador) {
      setError('No se pudo identificar este conteo para guardar el borrador.')
      return
    }

    try {
      localStorage.setItem(claveBorrador, JSON.stringify({
        cantidades,
        factores,
        noManifestados,
        nuevoNoManifestado,
        busqueda,
        detalles,
        actualizadoEn: new Date().toISOString()
      }))
      if (!guardarBorradorNoManifestadosLocal()) return
      setError('')
      setBorradorRecuperado(false)
      setMensaje('El borrador se guardó en este equipo.')
    } catch (errorBorrador) {
      console.error('Error guardando borrador admin:', errorBorrador)
      setError('No se pudo guardar el borrador en este equipo. Revisa el espacio disponible del navegador.')
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

  const resumen = {
    total: detalles.length,
    pendientes: detalles.length
  }


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

  if (apoyoGuardadoPendiente) {
    return (
      <div className="support-wait-page" role="status" aria-live="polite">
        {apoyoConteoCompletado && resumenApoyo ? (
          <div className="shared-count-result-modal" role="dialog" aria-modal="true" aria-labelledby="shared-count-result-title">
            <span className={`shared-count-result-icon ${resumenApoyo.resultado === 'conforme' ? 'is-ok' : 'is-diff'}`} aria-hidden="true">{resumenApoyo.resultado === 'conforme' ? '✓' : '!'}</span>
            <h1 id="shared-count-result-title">Conteo {numeroConteo} registrado</h1>
            <p className={resumenApoyo.resultado === 'conforme' ? 'is-ok-text' : 'is-diff-text'}>{resumenApoyo.resultadoTexto}</p>
            <div className="shared-count-result-totals">
              <span>Líneas conformes <strong>{resumenApoyo.lineasConformes ?? '—'}</strong></span>
              <span>Líneas no conformes <strong>{resumenApoyo.lineasDiferencia ?? '—'}</strong></span>
            </div>
            <button type="button" className="support-wait-cancel" onClick={() => { onVolver?.(); window.location.reload() }}>Entendido, continuar</button>
          </div>
        ) : (
          <div className="support-wait-card">
            <div className="support-wait-orbit"><span /><span /><span /></div>
            <span className="support-wait-kicker">CONTEO COMPARTIDO</span>
            <h1>Tu bloque quedó guardado</h1>
            <p>Espera mientras la otra persona termina su bloque. El resultado se calculará cuando ambos hayan guardado.</p>
            <div className="support-wait-cost">Costo {costo.numero_costo} · Conteo {numeroConteo}</div>
          </div>
        )}
      </div>
    )
  }


  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="admin-conteo">
      <ValidationNotice
        message={error || (borradorRecuperado ? 'Se recuperó automáticamente el avance que tenías guardado.' : mensaje)}
        title={error ? undefined : borradorRecuperado ? 'Avance recuperado' : undefined}
        type={error ? 'error' : 'success'}
        onClose={() => {
          if (!error && borradorRecuperado) sessionStorage.setItem('conteo-admin-omitir-aviso-borrador', '1')
          if (error) setError('')
          else { setMensaje(''); setBorradorRecuperado(false) }
        }}
      />

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
            <span className="admin-conteo-kicker">Validación de Costos</span>
            <h2>Conteo {numeroConteo}</h2>
            <p>Costo {costo.numero_costo}</p>
          </div>

        </div>


        <div className="admin-conteo-header-actions">
          <div className={`conexion-indicador ${conexionOnline ? 'conexion-online' : 'conexion-offline'}`} role="status">
            <span className="conexion-indicador-dot" aria-hidden="true" />
            <div className="conexion-indicador-info">
              <strong>{conexionOnline ? 'Conectado' : 'Sin conexión'}</strong>
              <span>{conexionOnline ? 'Listo para guardar' : 'Avance guardado localmente'}</span>
            </div>
          </div>

        </div>

      </header>


      {/* ======================================================
          ALERTAS
      ====================================================== */}

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


      </section>


      {/* ======================================================
          HERRAMIENTAS
      ====================================================== */}

      <section className="admin-conteo-toolbar">

        <div className="admin-conteo-search">
          <svg className="count-search-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none">
            <circle cx="10.8" cy="10.8" r="6.8" />
            <path d="m16 16 4.2 4.2" />
          </svg>

          <input
            type="text"
            className="count-search-input"
            placeholder="Buscar SKU, descripción o ubicación"
            aria-label="Buscar producto por SKU, descripción o ubicación"
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

          <ScrollableTable
            className="admin-conteo-table-viewport"
            tableClassName="admin-conteo-tabla"
            ariaLabel="detalle del conteo del administrador"
          >

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

                  return (
                    <tr
                      key={detalle.id}
                      className={Number(factor) !== (Number(detalle.factor) > 0 ? Number(detalle.factor) : 1) ? 'fila-factor-modificado' : ''}
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
                        <strong>{Number(detalle.cantidad_fisica)}</strong>
                      </td>


                      {/* CANTIDADES */}

                      <td>
                        <CountQuantityEditor
                          cantidades={lista}
                          onCambiar={(index, valor) => cambiarCantidad(detalle.id, index, valor)}
                          onAgregar={() => agregarCantidad(detalle.id)}
                          onEliminar={index => eliminarCantidad(detalle.id, index)}
                          disabled={guardando}
                          etiqueta="Cantidad"
                        />
                      </td>


                      {/* FACTOR */}

                      <td>

                        <input
                          type="text"
                          inputMode="decimal"
                          className={`admin-conteo-factor ${Number(factor) !== (Number(detalle.factor) > 0 ? Number(detalle.factor) : 1) ? 'factor-modified' : ''}`}
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
                        <span className="admin-conteo-factor-origin">
                          {Number(factor) !== (Number(detalle.factor) > 0 ? Number(detalle.factor) : 1)
                            ? `Modificado · Plantilla: × ${Number(detalle.factor) > 0 ? detalle.factor : 1}`
                            : ''}
                        </span>

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




                    </tr>
                  )
                }
              )}

            </tbody>

          </ScrollableTable>


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
            <p>Registra aquí los productos encontrados que no están en el costo.</p>
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

      <section className="auditor-save-section admin-conteo-save-section" aria-label="Guardar avance del conteo">
        <div className="auditor-save-actions">
          <button
            type="button"
            className="btn-guardar-borrador"
            onClick={guardarBorrador}
            disabled={guardando || cargando}
          >
            <span aria-hidden="true">⬇</span>
            Guardar borrador
          </button>
          <button
            type="button"
            className="btn-guardar-costo"
            onClick={guardar}
            disabled={guardando || cargando || !conexionOnline}
          >
            {guardando ? <><span className="button-spinner" /> Guardando...</> : <><span aria-hidden="true">✓</span> Guardar Conteo {numeroConteo}</>}
          </button>
        </div>
      </section>

    </div>
  )
}


export default ConteoAdmin
