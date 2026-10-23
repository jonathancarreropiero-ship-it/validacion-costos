
import { useEffect, useState } from 'react'

import { obtenerCostosAuditor } from '../../services/costos'
import CostListFilters from '../../components/CostListFilters'
import ScrollableTable from '../../components/ScrollableTable'
import ReconteoNoManifestados from '../../components/ReconteoNoManifestados'
import ValidacionApoyo from '../../components/ValidacionApoyo'
import { supabase } from '../../supabaseClient'
import { filtrarListaCostos, formatoFechaCosto } from '../../utils/costosFiltros'

function AuditorCostos({
  costos: costosProp = [],
  onSeleccionar,
  onActualizar
}) {
  const [costosCargados, setCostosCargados] = useState([])
  const costosBase = costosProp.length > 0 ? costosProp : costosCargados
  const [reconteosDisponibles, setReconteosDisponibles] = useState(null)
  const [estadosValidacionApoyo, setEstadosValidacionApoyo] = useState(null)
  const costosBaseConValidacion = estadosValidacionApoyo
    ? costosBase.map(costo => {
        const validacion = estadosValidacionApoyo.get(Number(costo.id))
        return {
          ...costo,
          validacion_apoyo_pendiente: validacion?.estado === 'solicitada',
          validado_por_apoyo: validacion?.estado === 'completada',
          soy_solicitante_apoyo_final: Boolean(validacion?.soy_solicitante),
          soy_validador_apoyo_final: Boolean(validacion?.soy_validador),
          resultado_validacion_apoyo: validacion?.resultado || null
        }
      })
    : costosBase
  const costos = reconteosDisponibles
    ? costosBaseConValidacion.map(costo => ({
        ...costo,
        reconteo_no_manifestado_habilitado: reconteosDisponibles.has(`${costo.id}:${costo.conteo_habilitado}`)
          ? Number(costo.conteo_habilitado)
          : null
      }))
    : costosBaseConValidacion
  const hayReconteosDisponibles = costos.some(costo => costo.reconteo_no_manifestado_habilitado)

  const [loading, setLoading] = useState(
    costosProp.length === 0
  )

  const [busqueda, setBusqueda] = useState('')
  const [fechaFiltro, setFechaFiltro] = useState('')
  const [modoFechaFiltro, setModoFechaFiltro] = useState('subido')
  const [estadoFiltro, setEstadoFiltro] = useState('todos')
  const [resultadoFiltro, setResultadoFiltro] = useState('todos')
  const [alerta, setAlerta] = useState(null)
  const [reconteoNoManifestadoSeleccionado, setReconteoNoManifestadoSeleccionado] = useState(null)
  const [validacionApoyoSeleccionada, setValidacionApoyoSeleccionada] = useState(null)

  // El admin puede solicitar apoyo desde otra sesión. Actualiza el estado de
  // esta acción en vivo sin volver a descargar todo el catálogo de costos.
  useEffect(() => {
    let activo = true
    let consultando = false
    const actualizarEstados = async () => {
      if (!navigator.onLine || consultando) return
      consultando = true
      const { data, error } = await supabase.rpc('estados_validacion_apoyo_costos')
      consultando = false
      if (activo && !error && Array.isArray(data)) {
        setEstadosValidacionApoyo(new Map(data.map(estado => [Number(estado.costo_id), estado])))
      }
    }
    actualizarEstados()
    const intervalo = window.setInterval(actualizarEstados, 5000)
    return () => {
      activo = false
      window.clearInterval(intervalo)
    }
  }, [])

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

  // El reconteo se cierra para los dos participantes al primer guardado.
  // Consulta solo el estado de disponibilidad para actualizar el botón en vivo.
  useEffect(() => {
    if (!hayReconteosDisponibles) return undefined
    let activo = true
    let timer
    const consultar = async () => {
      const { data, error } = await supabase.rpc('reconteos_no_manifestados_disponibles_auditor')
      if (!activo) return
      if (!error) {
        setReconteosDisponibles(new Set((data || []).map(item => `${item.costo_id}:${item.numero_conteo}`)))
      }
      timer = window.setTimeout(consultar, 5000)
    }
    consultar()
    return () => {
      activo = false
      window.clearTimeout(timer)
    }
  }, [hayReconteosDisponibles])

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

  async function actualizarCostos() {
    if (typeof onActualizar === 'function') await onActualizar()
    else await cargarCostos()
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

  const costosFiltrados = filtrarListaCostos(costos, {
    busqueda,
    fecha: fechaFiltro,
    modoFecha: modoFechaFiltro,
    estado: estadoFiltro,
    resultado: resultadoFiltro
  })
  const filtrosListaActivos = Boolean(busqueda || fechaFiltro || estadoFiltro !== 'todos' || resultadoFiltro !== 'todos')

  function limpiarFiltrosLista() {
    setBusqueda('')
    setFechaFiltro('')
    setModoFechaFiltro('subido')
    setEstadoFiltro('todos')
    setResultadoFiltro('todos')
  }

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
      className="auditor-costos cost-list-page"
    >
      {/* CABECERA PRINCIPAL */}

      <div
        className="auditor-costos-header cost-list-section-header"
      >
        <div className="auditor-costos-heading cost-list-section-heading">
          <span className="auditor-costos-kicker cost-list-section-kicker">
            AUDITORÍA
          </span>

          <h2>
            Costos disponibles
          </h2>

        </div>

      </div>

      <div className="cost-result-toolbar">
        <CostListFilters
          resultado={resultadoFiltro}
          onResultadoChange={setResultadoFiltro}
          soloResultados
        />
      </div>

      {/* BUSCADOR */}

      <div className="auditor-costos-toolbar">
        <CostListFilters
          busqueda={busqueda}
          onBusquedaChange={setBusqueda}
          fecha={fechaFiltro}
          onFechaChange={setFechaFiltro}
          modoFecha={modoFechaFiltro}
          onModoFechaChange={setModoFechaFiltro}
          estado={estadoFiltro}
          resultado={resultadoFiltro}
          onResultadoChange={setResultadoFiltro}
          onLimpiar={limpiarFiltrosLista}
          ocultarResultados
        />

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
            {filtrosListaActivos ? '⌕' : '□'}
          </div>

          <h3>
            {filtrosListaActivos
              ? 'No se encontró ningún costo'
              : 'No hay costos registrados'}
          </h3>

          <p>
            {filtrosListaActivos
              ? 'Ajusta la fecha, el estado o el número de costo.'
              : 'Cuando exista un costo disponible aparecerá aquí.'}
          </p>

          {filtrosListaActivos && (
            <button
              type="button"
              className="auditor-empty-clear"
              onClick={limpiarFiltrosLista}
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

          <ScrollableTable
            className="auditor-costos-table-wrapper"
            tableClassName="auditor-costos-table"
            ariaLabel="costos del auditor"
          >
              <thead>
                <tr>
                  <th className="col-costo">Costo</th>
                  <th className="col-date">Subido</th>
                  <th className="col-date">Realizado</th>
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
                    Boolean(costo.bloqueado_por_otro) && !costo.apoyo_habilitado

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
                          <strong>
                            {costo.numero_costo}
                          </strong>
                        </div>
                      </td>

                      <td><span className="cost-date-value">{formatoFechaCosto(costo.created_at)}</span></td>
                      <td><span className="cost-date-value">{formatoFechaCosto(costo.fecha_realizado)}</span></td>

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
                              : costo.apoyo_habilitado
                                ? 'Apoyo habilitado'
                              : ocupadoPorOtro
                                ? 'En proceso por otro usuario'
                                : propio
                                  ? 'Continuar mi conteo'
                                  : obtenerEstadoTexto(costo)}
                        </span>
                      </td>

                      {/* RESULTADO */}

                      <td>
                        {costo.validado_por_apoyo ? (
                          <span className="resultado-pill validado-apoyo"><span>✓</span>VALIDADO POR APOYO</span>
                        ) : resultado === 'conforme' ? (
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
                            Pendiente
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
                        <div className="d-flex flex-column align-items-start gap-2">
                        {costo.validacion_apoyo_pendiente && costo.soy_validador_apoyo_final && (
                          <button type="button" className="btn btn-sm btn-primary" onClick={() => setValidacionApoyoSeleccionada(costo)}>
                            Realizar última validación
                          </button>
                        )}
                        {costo.validacion_apoyo_pendiente && costo.soy_solicitante_apoyo_final && !costo.soy_validador_apoyo_final && (
                          <span className="resultado-pendiente">Esperando validación por apoyo</span>
                        )}
                        {costo.validado_por_apoyo && (
                          <span className="resultado-badge conforme"><span className="resultado-badge-dot" />Validado por apoyo</span>
                        )}
                        <button
                          type="button"
                          className={
                            bloqueado
                              ? 'btn-costo bloqueado'
                              : ocupadoPorOtro
                                ? 'btn-costo ocupado'
                                : 'btn-costo'
                          }
                          disabled={bloqueado || (costo.apoyo_habilitado && !costo.soy_participante_apoyo && costo.usuarios_apoyo_unidos >= 2)}
                          onClick={() => seleccionarCosto(costo)}
                        >
                          {!bloqueado && (
                            <span className="btn-costo-icon">
                              {ocupadoPorOtro
                                ? '↗'
                                : propio
                                  ? '↻'
                                  : '→'}
                            </span>
                          )}

                          {terminado
                            ? obtenerTextoAccion(costo)
                            : esperandoSiguienteConteo
                              ? 'Conteo ya registrado'
                                : costo.apoyo_habilitado && !costo.soy_participante_apoyo && costo.usuarios_apoyo_unidos >= 2
                                  ? 'Apoyo completo'
                              : ocupadoPorOtro
                                ? 'Intentar acceso'
                                : propio
                                  ? `Continuar Conteo ${numeroConteo}`
                                  : obtenerTextoAccion(costo)}
                        </button>
                        {costo.reconteo_no_manifestado_habilitado && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => setReconteoNoManifestadoSeleccionado({
                              costoId: costo.id,
                              numeroConteo: costo.reconteo_no_manifestado_habilitado
                            })}
                          >
                            Continuar no manifestados · Conteo {costo.reconteo_no_manifestado_habilitado}
                          </button>
                        )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
          </ScrollableTable>
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
              onClick={() => { setAlerta(null); window.location.reload() }}
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

      {reconteoNoManifestadoSeleccionado && (
        <ReconteoNoManifestados
          costoId={reconteoNoManifestadoSeleccionado.costoId}
          numeroConteo={reconteoNoManifestadoSeleccionado.numeroConteo}
          onClose={() => setReconteoNoManifestadoSeleccionado(null)}
          onSaved={actualizarCostos}
        />
      )}
      {validacionApoyoSeleccionada && (
        <ValidacionApoyo
          costo={validacionApoyoSeleccionada}
          onClose={() => setValidacionApoyoSeleccionada(null)}
          onSaved={async resultado => {
            setCostosCargados(actuales => actuales.map(costo => Number(costo.id) === Number(validacionApoyoSeleccionada.id)
              ? { ...costo, validado_por_apoyo: true, resultado: resultado?.resultado === 'conforme' ? 'conforme' : 'no_conforme' }
              : costo))
            await actualizarCostos()
          }}
        />
      )}
    </section>
  )
}

export default AuditorCostos



