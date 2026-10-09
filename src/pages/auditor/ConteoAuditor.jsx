import { useEffect, useState } from 'react'

import {
  obtenerConteoAnterior,
  validarConteo
} from '../../services/costos'

import {
  obtenerAuditoriaOffline
} from '../../services/offlineStorage'

function ConteoAuditor({
  detalle,
  numeroConteo,
  costoId,
  usuarioId,
  onRegistrado,
  onCambio
}) {

  const [cantidades, setCantidades] = useState([''])
  const [factor, setFactor] = useState('1')
  const [resultado, setResultado] = useState(null)
  const [cantidadTotal, setCantidadTotal] = useState(null)
  const [cantidadFinal, setCantidadFinal] = useState(null)
  const [loadingAnterior, setLoadingAnterior] = useState(false)
  const [validando, setValidando] = useState(false)
  const [error, setError] = useState('')
  const [borradorGuardado, setBorradorGuardado] = useState(false)

  // ==========================================================
  // CLAVE DEL BORRADOR
  // ==========================================================

  const obtenerClaveBorrador = () => {

    return `validacion-costos-usuario-${usuarioId}-costo-${costoId}-detalle-${detalle.id}-conteo-${numeroConteo}`

  }

  // ==========================================================
  // INFORMAR CAMBIO AL DASHBOARD
  // ==========================================================

  const informarCambio = (
    nuevasCantidades,
    nuevoFactor
  ) => {

    if (!onCambio) {
      return
    }

    onCambio({
      detalleId: detalle.id,
      numeroConteo,
      cantidades: nuevasCantidades,
      factor: nuevoFactor
    })

  }

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

  const cargarBorradorLocal = async () => {

    if (!usuarioId || !costoId || !detalle?.id) {
      return null
    }

    try {

      // ======================================================
      // 1. PRIMERO BUSCAR EN LOCALSTORAGE
      // ======================================================

      const clave =
        obtenerClaveBorrador()

      const guardado =
        localStorage.getItem(clave)

      if (guardado) {

        const borrador =
          JSON.parse(guardado)

        if (
          borrador &&
          String(borrador.usuarioId) === String(usuarioId) &&
          Number(borrador.costoId) === Number(costoId) &&
          Number(borrador.detalleId) === Number(detalle.id) &&
          Number(borrador.numeroConteo) === Number(numeroConteo)
        ) {

          if (
            Array.isArray(borrador.cantidades) &&
            borrador.cantidades.length > 0
          ) {

            return borrador

          }

        }

      }

      // ======================================================
      // 2. SI NO EXISTE, BUSCAR EN INDEXEDDB
      // ======================================================

      const auditoriaOffline =
        await obtenerAuditoriaOffline({
          costoId,
          usuarioId,
          numeroConteo
        })

      if (!auditoriaOffline) {
        return null
      }

      const detallesOffline =
        Array.isArray(
          auditoriaOffline.detalles
        )
          ? auditoriaOffline.detalles
          : []

      const detalleOffline =
        detallesOffline.find(
          item =>
            String(item.detalleId) ===
              String(detalle.id) &&
            Number(item.numeroConteo) ===
              Number(numeroConteo)
        )

      if (!detalleOffline) {
        return null
      }

      if (
        !Array.isArray(
          detalleOffline.cantidades
        ) ||
        detalleOffline.cantidades.length === 0
      ) {
        return null
      }

      return {

        usuarioId,

        costoId,

        detalleId: detalle.id,

        numeroConteo,

        cantidades:
          detalleOffline.cantidades,

        factor:
          detalleOffline.factor ??
          '1',

        updatedAt:
          detalleOffline.actualizadoEn ??
          null

      }

    } catch (err) {

      console.error(
        'Error leyendo borrador local:',
        err
      )

      return null

    }

  }

  // ==========================================================
  // CARGAR CONTEO
  // ==========================================================

  useEffect(() => {

    let activo = true

    async function cargarConteo() {

      setError('')
      setResultado(null)
      setCantidadTotal(null)
      setCantidadFinal(null)
      setBorradorGuardado(false)

      // ------------------------------------------------------
      // 1. BUSCAR BORRADOR LOCAL
      // ------------------------------------------------------

      const borrador =
        await cargarBorradorLocal()

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

        setFactor('1')

        informarCambio(
          [''],
          1
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

          setFactor('1')

          informarCambio(
            [''],
            1
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
    numeroConteo,
    costoId,
    usuarioId
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

    setResultado(null)

    setCantidadTotal(null)

    setCantidadFinal(null)

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

    setResultado(null)

    setCantidadTotal(null)

    setCantidadFinal(null)

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

    setResultado(null)

    setCantidadTotal(null)

    setCantidadFinal(null)

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

    setResultado(null)

    setCantidadTotal(null)

    setCantidadFinal(null)

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
  // VALIDAR
  // ==========================================================

  const validarConteoActual = async () => {

    setError('')

    const cantidadesNumericas =
      cantidades.map(
        valor => Number(valor)
      )

    if (
      cantidades.some(
        valor =>
          valor === '' ||
          valor === null ||
          valor === undefined
      )
    ) {

      setError(
        'Completa todas las cantidades antes de validar.'
      )

      return

    }

    if (
      cantidadesNumericas.some(
        cantidad =>
          Number.isNaN(cantidad) ||
          cantidad < 0
      )
    ) {

      setError(
        'Las cantidades deben ser números válidos.'
      )

      return

    }

    const factorNumerico =
      Number(factor)

    if (
      Number.isNaN(factorNumerico) ||
      factorNumerico <= 0
    ) {

      setError(
        'El factor debe ser mayor que 0.'
      )

      return

    }

    try {

      setValidando(true)

      const respuesta =
        await validarConteo(
          detalle.id,
          cantidadesNumericas,
          factorNumerico
        )

      setCantidadTotal(
        respuesta.cantidadTotal
      )

      setCantidadFinal(
        respuesta.cantidadFinal
      )

      setResultado(
        respuesta.resultado
      )

      if (onRegistrado) {

        onRegistrado({

          detalleId: detalle.id,

          numeroConteo,

          cantidades:
            cantidadesNumericas,

          factor:
            factorNumerico,

          cantidadTotal:
            respuesta.cantidadTotal,

          cantidadFinal:
            respuesta.cantidadFinal,

          resultado:
            respuesta.resultado

        })

      }

      await guardarBorradorLocal(

        cantidadesNumericas.map(
          cantidad =>
            String(cantidad)
        ),

        String(factorNumerico)

      )

    } catch (err) {

      console.error(err)

      setError(
        err?.message ||
        'No se pudo validar el conteo.'
      )

      setResultado(null)

      setCantidadTotal(null)

      setCantidadFinal(null)

    } finally {

      setValidando(false)

    }

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

      {/* CANTIDADES */}

      <div className="conteo-inline-group">

        <div className="conteo-inline-label">

          Cantidades

        </div>

        <div className="conteo-inline-cantidades">

          {cantidades.map(

            (cantidad, index) => (

              <div

                className="conteo-cantidad-item"

                key={`cantidad-${index}`}

              >

                <input

                  type="text"

                  inputMode="decimal"

                  value={cantidad}

                  onChange={e =>

                    cambiarCantidad(

                      index,

                      e.target.value

                    )

                  }

                  placeholder="Cantidad"

                  className="conteo-input"

                  disabled={validando}

                  aria-label={`Cantidad ${index + 1}`}

                />

                {cantidades.length > 1 && (

                  <button

                    type="button"

                    className="btn-eliminar-cantidad"

                    onClick={() =>

                      eliminarCantidad(index)

                    }

                    title="Eliminar cantidad"

                    aria-label={`Eliminar cantidad ${index + 1}`}

                    disabled={validando}

                  >

                    ×

                  </button>

                )}

              </div>

            )

          )}

          <button

            type="button"

            className="btn-agregar-cantidad"

            onClick={agregarCantidad}

            disabled={validando}

            title="Agregar otra cantidad"

            aria-label="Agregar otra cantidad"

          >

            <span>+</span>

          </button>

        </div>

      </div>

      {/* FACTOR */}

      <div className="conteo-inline-factor">

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

      </div>

      {/* VALIDAR */}

      <button

        type="button"

        className="btn-validar-sku"

        onClick={validarConteoActual}

        disabled={validando}

      >

        {validando ? (

          <>

            <span className="btn-validar-spinner" />

            Validando...

          </>

        ) : (

          <>

            <span className="btn-validar-icon">

              ✓

            </span>

            Validar

          </>

        )}

      </button>

      {/* RESULTADO */}

      {resultado && (

        <span

          className={

            resultado === 'conforme'

              ? 'resultado-badge conforme'

              : 'resultado-badge diferencia'

          }

        >

          <span className="resultado-badge-dot" />

          {resultado === 'conforme'

            ? 'CONFORME'

            : 'DIFERENCIA'}

        </span>

      )}

      {/* CANTIDAD FINAL */}

      {resultado &&

        cantidadFinal !== null && (

          <div

            className="conteo-final-info"

            style={{

              display: 'flex',

              alignItems: 'center',

              justifyContent: 'space-between',

              background: '#f1f5f9',

              border: '1px solid #e2e8f0',

              borderRadius: '6px',

              padding: '8px 12px',

              marginTop: '4px'

            }}

          >

            <span

              className="conteo-final-label"

              style={{

                fontSize: '11px',

                fontWeight: '750',

                color: '#64748b',

                textTransform: 'uppercase'

              }}

            >

              Cantidad Final

            </span>

            <strong

              style={{

                fontSize: '15px',

                color: '#0f172a',

                fontWeight: '800'

              }}

            >

              {cantidadFinal}

            </strong>

          </div>

        )}

      {/* ERROR */}

      {error && (

        <div className="conteo-inline-error">

          <span className="conteo-inline-error-icon">

            !

          </span>

          <span>

            {error}

          </span>

        </div>

      )}

    </div>

  )

}

export default ConteoAuditor