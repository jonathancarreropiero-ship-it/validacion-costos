import { useCallback, useEffect, useRef, useState } from 'react'

import { obtenerConteoAnterior } from '../../services/costos'

import {
  obtenerAuditoriaOffline
} from '../../services/offlineStorage'
import ValidationNotice from '../../components/ValidationNotice'
import CountQuantityEditor from '../../components/CountQuantityEditor'

async function cargarBorradorLocalAuditor({ usuarioId, costoId, detalleId, numeroConteo, clave }) {
  if (!usuarioId || !costoId || !detalleId) return null

  try {
    const guardado = localStorage.getItem(clave)
    if (guardado) {
      const borrador = JSON.parse(guardado)
      if (
        borrador &&
        String(borrador.usuarioId) === String(usuarioId) &&
        Number(borrador.costoId) === Number(costoId) &&
        Number(borrador.detalleId) === Number(detalleId) &&
        Number(borrador.numeroConteo) === Number(numeroConteo) &&
        Array.isArray(borrador.cantidades) &&
        borrador.cantidades.length > 0
      ) return borrador
    }

    const auditoriaOffline = await obtenerAuditoriaOffline({ costoId, usuarioId, numeroConteo })
    const detallesOffline = Array.isArray(auditoriaOffline?.detalles) ? auditoriaOffline.detalles : []
    const detalleOffline = detallesOffline.find(item =>
      String(item.detalleId) === String(detalleId) &&
      Number(item.numeroConteo) === Number(numeroConteo)
    )
    if (!Array.isArray(detalleOffline?.cantidades) || detalleOffline.cantidades.length === 0) return null

    return {
      usuarioId,
      costoId,
      detalleId,
      numeroConteo,
      cantidades: detalleOffline.cantidades,
      factor: detalleOffline.factor ?? '1',
      updatedAt: detalleOffline.actualizadoEn ?? null
    }
  } catch (error) {
    console.error('Error leyendo borrador local:', error)
    return null
  }
}

function ConteoAuditor({
  detalle,
  numeroConteo,
  costoId,
  usuarioId,
  validando = false,
  onCambio
}) {

  const [cantidades, setCantidades] = useState([''])
  const [factor, setFactor] = useState('1')
  const [loadingAnterior, setLoadingAnterior] = useState(false)
  const [error, setError] = useState('')
  const [borradorGuardado, setBorradorGuardado] = useState(false)
  const onCambioRef = useRef(onCambio)

  useEffect(() => {
    onCambioRef.current = onCambio
  }, [onCambio])

  // ==========================================================
  // CLAVE DEL BORRADOR
  // ==========================================================

  const obtenerClaveBorrador = useCallback(() => {

    return `validacion-costos-usuario-${usuarioId}-costo-${costoId}-detalle-${detalle.id}-conteo-${numeroConteo}`

  }, [usuarioId, costoId, detalle.id, numeroConteo])

  // ==========================================================
  // INFORMAR CAMBIO AL DASHBOARD
  // ==========================================================

  const informarCambio = useCallback((
    nuevasCantidades,
    nuevoFactor
  ) => {

    if (!onCambioRef.current) {
      return
    }

    onCambioRef.current({
      detalleId: detalle.id,
      numeroConteo,
      cantidades: nuevasCantidades,
      factor: nuevoFactor
    })

  }, [detalle.id, numeroConteo])

  // ==========================================================
  // GUARDAR BORRADOR LOCAL
  // ==========================================================

  const guardarBorradorLocal = async (
    nuevasCantidades,
    nuevoFactor
  ) => {

    if (!usuarioId || !costoId || !detalle?.id) {
      return
    }

    try {

      // ------------------------------------------------------
      // 1. GUARDAR EN LOCALSTORAGE
      // ------------------------------------------------------

      const clave =
        obtenerClaveBorrador()

      const borrador = {
        usuarioId,
        costoId,
        detalleId: detalle.id,
        numeroConteo,
        cantidades: nuevasCantidades,
        factor: nuevoFactor,
        updatedAt: new Date().toISOString()
      }

      localStorage.setItem(
        clave,
        JSON.stringify(borrador)
      )

      // ------------------------------------------------------
      // IMPORTANTE:
      // No usamos guardarDetalleAuditoriaOffline porque
      // esa función no existe en offlineStorage.js.
      //
      // El detalle se conserva en localStorage y el
      // snapshot completo de la auditoría se maneja desde
      // AuditorDashboard.
      // ------------------------------------------------------

      setBorradorGuardado(true)

    } catch (err) {

      console.error(
        'No se pudo guardar el borrador local:',
        err
      )

    }

  }

  // ==========================================================
  // CARGAR BORRADOR LOCAL
  // ==========================================================

  // ==========================================================
  // CARGAR CONTEO
  // ==========================================================

  useEffect(() => {

    let activo = true

    async function cargarConteo() {

      setError('')
      setBorradorGuardado(false)

      // ------------------------------------------------------
      // 1. BUSCAR BORRADOR LOCAL
      // ------------------------------------------------------

      const borrador = await cargarBorradorLocalAuditor({
        usuarioId,
        costoId,
        detalleId: detalle.id,
        numeroConteo,
        clave: obtenerClaveBorrador()
      })

      if (borrador) {

        if (!activo) {
          return
        }

        const cantidadesGuardadas =
          borrador.cantidades.map(
            cantidad =>
              String(cantidad ?? '')
          )

        const factorGuardado =
          borrador.factor !== null &&
          borrador.factor !== undefined
            ? String(borrador.factor)
            : '1'

        setCantidades(
          cantidadesGuardadas
        )

        setFactor(
          factorGuardado
        )

        setBorradorGuardado(true)

        informarCambio(
          cantidadesGuardadas,
          Number(factorGuardado)
        )

        return

      }

      // ------------------------------------------------------
      // 2. CONTEO 1
      // ------------------------------------------------------

      if (Number(numeroConteo) === 1) {

        setCantidades([''])

        setFactor(String(Number(detalle.factor) > 0 ? detalle.factor : 1))

        informarCambio(
          [''],
          Number(detalle.factor) > 0 ? Number(detalle.factor) : 1
        )

        return

      }

      // ------------------------------------------------------
      // 3. CONTEO 2 / 3
      // ------------------------------------------------------

      try {

        setLoadingAnterior(true)

        const anterior =
          await obtenerConteoAnterior(
            detalle.id,
            numeroConteo
          )

        if (!activo) {
          return
        }

        if (anterior) {

          const cantidadesAnteriores =
            Array.isArray(anterior.cantidades) &&
            anterior.cantidades.length > 0
              ? anterior.cantidades.map(
                  cantidad =>
                    String(cantidad ?? '')
                )
              : ['']

          const factorAnterior =
            anterior.factor !== null &&
            anterior.factor !== undefined
              ? String(anterior.factor)
              : '1'

          setCantidades(
            cantidadesAnteriores
          )

          setFactor(
            factorAnterior
          )

          informarCambio(
            cantidadesAnteriores,
            Number(factorAnterior)
          )

        } else {

          setCantidades([''])

          setFactor(String(Number(detalle.factor) > 0 ? detalle.factor : 1))

          informarCambio(
            [''],
            Number(detalle.factor) > 0 ? Number(detalle.factor) : 1
          )

        }

      } catch (err) {

        if (!activo) {
          return
        }

        console.error(err)

        setError(
          err?.message ||
          'No se pudo cargar el conteo anterior.'
        )

      } finally {

        if (activo) {
          setLoadingAnterior(false)
        }

      }

    }

    cargarConteo()

    return () => {

      activo = false

    }

  }, [
    detalle.id,
    detalle.factor,
    numeroConteo,
    costoId,
    usuarioId,
    informarCambio,
    obtenerClaveBorrador
  ])

  // ==========================================================
  // VALIDAR FORMATO NUMÉRICO
  // ==========================================================

  
const esNumeroPermitido = valor => {
  return /^\d*\.?\d*$/.test(valor)
}

  // ==========================================================
  // EDITAR CANTIDAD
  // ==========================================================

  const cambiarCantidad = (
    index,
    valor
  ) => {

    if (!esNumeroPermitido(valor)) {
      return
    }

    const nuevas = [...cantidades]

    nuevas[index] = valor

    setCantidades(nuevas)

    setError('')

    informarCambio(
      nuevas,
      Number(factor)
    )

    guardarBorradorLocal(
      nuevas,
      factor
    )

  }

  // ==========================================================
  // EDITAR FACTOR
  // ==========================================================

  const cambiarFactor = valor => {

    if (!esNumeroPermitido(valor)) {
      return
    }

    setFactor(valor)

    setError('')

    informarCambio(
      cantidades,
      Number(valor)
    )

    guardarBorradorLocal(
      cantidades,
      valor
    )

  }

  // ==========================================================
  // AGREGAR CANTIDAD
  // ==========================================================

  const agregarCantidad = () => {

    const nuevas = [
      ...cantidades,
      ''
    ]

    setCantidades(nuevas)

    setError('')

    informarCambio(
      nuevas,
      Number(factor)
    )

    guardarBorradorLocal(
      nuevas,
      factor
    )

  }

  // ==========================================================
  // ELIMINAR CANTIDAD
  // ==========================================================

  const eliminarCantidad = index => {

    if (cantidades.length === 1) {
      return
    }

    const nuevas =
      cantidades.filter(
        (_, i) => i !== index
      )

    setCantidades(nuevas)

    setError('')

    informarCambio(
      nuevas,
      Number(factor)
    )

    guardarBorradorLocal(
      nuevas,
      factor
    )

  }

  // ==========================================================
  // LOADING
  // ==========================================================

  if (loadingAnterior) {

    return (

      <div className="conteo-inline-loading">

        <span className="conteo-inline-loading-spinner">

          ⟳

        </span>

        <span>

          Cargando conteo anterior...

        </span>

      </div>

    )

  }

  // ==========================================================
  // RENDER
  // ==========================================================

  return (

    <div className="conteo-inline">
      <ValidationNotice message={error} onClose={() => setError('')} />

      {/* INDICADOR DE BORRADOR */}

      {borradorGuardado && (

        <div className="borrador-local-indicador">

          <span className="borrador-local-icon">

            ✓

          </span>

          <span>

            Guardado localmente

          </span>

        </div>

      )}

      <div className="conteo-inline-editors">
        <div className="conteo-inline-group">
          <div className="conteo-inline-label">Cantidad física</div>
          <CountQuantityEditor
            cantidades={cantidades}
            onCambiar={cambiarCantidad}
            onAgregar={agregarCantidad}
            onEliminar={eliminarCantidad}
            disabled={validando}
            etiqueta="Cantidad"
          />
        </div>

      {/* FACTOR */}

      <div className={`conteo-inline-factor ${Number(factor) !== (Number(detalle.factor) > 0 ? Number(detalle.factor) : 1) ? 'factor-modified' : ''}`}>

        <label htmlFor={`factor-${detalle.id}`}>

          Factor

        </label>

        <input

          id={`factor-${detalle.id}`}

          type="text"

          inputMode="decimal"

          value={factor}

          onChange={e =>

            cambiarFactor(

              e.target.value

            )

          }

          className="conteo-factor-input"

          disabled={validando}

        />

        <span className="conteo-factor-origin">
          {Number(factor) !== (Number(detalle.factor) > 0 ? Number(detalle.factor) : 1)
            ? `Modificado · Plantilla: × ${Number(detalle.factor) > 0 ? detalle.factor : 1}`
            : ''}
        </span>

      </div>
      </div>

      {/* ERROR */}

    </div>

  )

}

export default ConteoAuditor
