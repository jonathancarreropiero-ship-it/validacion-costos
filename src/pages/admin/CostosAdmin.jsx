
import { useCallback, useEffect, useState } from 'react'

import { supabase } from '../../supabaseClient'

import {
  habilitarConteo,
  habilitarApoyoConteo,
  reiniciarCosto,
  iniciarCosto
} from '../../services/costos'

import StatusBadge from '../../components/StatusBadge'
import CostListFilters from '../../components/CostListFilters'
import ScrollableTable from '../../components/ScrollableTable'
import { filtrarListaCostos, formatoFechaCosto } from '../../utils/costosFiltros'

import DetalleCosto from './DetalleCosto'
import ValidacionApoyo from '../../components/ValidacionApoyo'
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

function conteoCompletoNoConforme(costo, numero) {
  const resultado = String(costo?.resultado || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  return Number(costo?.numero_ultimo_conteo) === Number(numero) && resultado === 'no_conforme'
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
  const [fechaFiltro, setFechaFiltro] = useState('')
  const [modoFechaFiltro, setModoFechaFiltro] = useState('subido')
  const [estadoFiltro, setEstadoFiltro] = useState('todos')
  const [resultadoFiltro, setResultadoFiltro] = useState('todos')
  const [costoSeleccionado, setCostoSeleccionado] = useState(null)
  const [conteoAdmin, setConteoAdmin] = useState(null)
  const [apoyoEsperando, setApoyoEsperando] = useState(null)
  const [validacionApoyoSeleccionada, setValidacionApoyoSeleccionada] = useState(null)
  const [habilitando, setHabilitando] = useState(null)
  const [reiniciando, setReiniciando] = useState(null)
  const [abriendoConteo, setAbriendoConteo] = useState(null)
  const [restauracionRealizada, setRestauracionRealizada] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [costoPorReiniciar, setCostoPorReiniciar] = useState(null)
  const [costosPorEliminar, setCostosPorEliminar] = useState(null)
  const [costoAcciones, setCostoAcciones] = useState(null)
  const [estadoApoyoAccion, setEstadoApoyoAccion] = useState(null)
  const [eliminandoCostos, setEliminandoCostos] = useState(false)
  const [exportandoCostos, setExportandoCostos] = useState(false)


  function mostrarAviso(mensaje, titulo = null) {
    const texto = String(mensaje)
    const esDenegado = /ya existe.*usuario|usuario.*realizando|ya est[aá] siendo realizado|acceso denegado|ocupado/i.test(texto)
    const esError = esDenegado || /no se pudo|no puedes|error|no autorizado|no tienes permisos|no se puede|debe habilitar/i.test(texto)
    setAviso({ mensaje: texto, titulo, tipo: esDenegado ? 'denegado' : esError ? 'error' : 'success' })
  }

  async function exportarCostosFiltrados() {
    if (!costosFiltrados.length || exportandoCostos) return
    setExportandoCostos(true)
    try {
      const XLSX = await import('xlsx')
      const idsCostos = costosFiltrados.map(costo => Number(costo.id))
      const { data: detalles, error: errorDetalles } = await supabase
        .from('detalle_costos')
        .select('id,costo_id,sku,descripcion,um,ubicacion,cantidad_fisica,factor')
        .in('costo_id', idsCostos)
        .order('id', { ascending: true })
      if (errorDetalles) throw errorDetalles

      const detallesPorId = new Map((detalles || []).map(detalle => [String(detalle.id), detalle]))
      const idsDetalles = [...detallesPorId.keys()]
      let conteos = []
      let items = []
      if (idsDetalles.length) {
        const { data, error } = await supabase
          .from('conteos')
          .select('id,detalle_costo_id,numero_conteo,factor,cantidad_total,cantidad_final,resultado,auditor_id,created_at')
          .in('detalle_costo_id', idsDetalles.map(Number))
          .order('numero_conteo', { ascending: true })
        if (error) throw error
        conteos = data || []
        const idsConteos = conteos.map(conteo => conteo.id)
        if (idsConteos.length) {
          const { data: itemsData, error: errorItems } = await supabase
            .from('conteo_items')
            .select('conteo_id,item_numero,cantidad')
            .in('conteo_id', idsConteos)
            .order('item_numero', { ascending: true })
          if (errorItems) throw errorItems
          items = itemsData || []
        }
      }

      const conteosPorCosto = new Map()
      for (const conteo of conteos) {
        const detalle = detallesPorId.get(String(conteo.detalle_costo_id))
        if (!detalle) continue
        const clave = String(detalle.costo_id)
        const ultimo = conteosPorCosto.get(clave)
        if (!ultimo || Number(conteo.numero_conteo) > ultimo.numero) {
          conteosPorCosto.set(clave, { numero: Number(conteo.numero_conteo), fecha: conteo.created_at })
        } else if (Number(conteo.numero_conteo) === ultimo.numero && conteo.created_at > ultimo.fecha) {
          ultimo.fecha = conteo.created_at
        }
      }
      const ultimosConteos = conteos.filter(conteo => {
        const detalle = detallesPorId.get(String(conteo.detalle_costo_id))
        return detalle && Number(conteo.numero_conteo) === conteosPorCosto.get(String(detalle.costo_id))?.numero
      })
      const itemsPorConteo = new Map()
      for (const item of items) {
        if (!itemsPorConteo.has(String(item.conteo_id))) itemsPorConteo.set(String(item.conteo_id), [])
        itemsPorConteo.get(String(item.conteo_id)).push(item)
      }
      const auditorIds = [...new Set(ultimosConteos.map(conteo => conteo.auditor_id).filter(Boolean).map(String))]
      const correos = new Map()
      await Promise.all(auditorIds.map(async id => {
        const { data, error } = await supabase.rpc('obtener_auditor_email', { p_auditor_id: id })
        if (!error && data) correos.set(id, data)
      }))
      const costosPorId = new Map(costosFiltrados.map(costo => [String(costo.id), costo]))
      const resumen = costosFiltrados.map(costo => ({
        'Número de costo': costo.numero_costo,
        'Último conteo realizado': conteosPorCosto.get(String(costo.id))?.numero ?? 'Sin conteo',
        'Fecha del conteo': formatoFechaCosto(conteosPorCosto.get(String(costo.id))?.fecha),
        'Resultado actual': costo.validado_por_apoyo ? 'Validado por apoyo' : costo.resultado === 'conforme' ? 'Conforme' : costo.resultado ? 'No conforme' : 'Pendiente'
      }))
      const detalleExportacion = ultimosConteos.map(conteo => {
        const detalle = detallesPorId.get(String(conteo.detalle_costo_id))
        const costo = costosPorId.get(String(detalle.costo_id))
        const cantidades = itemsPorConteo.get(String(conteo.id)) || []
        const suma = cantidades.reduce((total, item) => total + Number(item.cantidad || 0), 0)
        const factorPlantilla = Number(detalle.factor) > 0 ? Number(detalle.factor) : 1
        const factorAplicado = Number(conteo.factor) > 0 ? Number(conteo.factor) : factorPlantilla
        return {
          'Número de costo': costo?.numero_costo ?? '',
          'Conteo': Number(conteo.numero_conteo),
          'SKU': detalle.sku,
          'Descripción': detalle.descripcion,
          'UM': detalle.um,
          'Ubicación': detalle.ubicacion,
          'Cantidad física': Number(detalle.cantidad_fisica || 0),
          'Cantidades ingresadas': cantidades.map(item => item.cantidad).join(' + '),
          'Suma de cantidades': Number(conteo.cantidad_total ?? suma),
          'Factor de plantilla': factorPlantilla,
          'Factor aplicado': factorAplicado,
          'Factor modificado': factorPlantilla !== factorAplicado ? 'Sí' : 'No',
          'Resultado final': Number(conteo.cantidad_final || 0),
          'Resultado': conteo.resultado === 'conforme' ? 'Conforme' : conteo.resultado ? 'No conforme' : 'Pendiente',
          'Auditor': correos.get(String(conteo.auditor_id)) || ''
        }
      })
      const libro = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(resumen), 'Costos filtrados')
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(detalleExportacion), 'Último conteo')
      XLSX.writeFile(libro, `costos_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (error) {
      console.error('No se pudieron exportar los costos filtrados:', error)
      mostrarAviso(error?.message || 'No se pudieron exportar los costos.')
    } finally {
      setExportandoCostos(false)
    }
  }

  async function confirmarEliminacionCostos() {
    if (!costosPorEliminar?.length || eliminandoCostos) return
    setEliminandoCostos(true)
    try {
      const { data, error } = await supabase.rpc('eliminar_costos_admin', {
        p_costos_ids: costosPorEliminar.map(costo => Number(costo.id))
      })
      if (error) throw error
      const eliminados = Number(data?.eliminados ?? costosPorEliminar.length)
      setCostosPorEliminar(null)
      mostrarAviso(`Se eliminaron ${eliminados} ${eliminados === 1 ? 'costo' : 'costos'}.`)
      await cargarCostos()
    } catch (error) {
      console.error('No se pudieron eliminar los costos seleccionados:', error)
      mostrarAviso(error?.message || 'No se pudieron eliminar los costos.')
    } finally {
      setEliminandoCostos(false)
    }
  }

  async function solicitarValidacionApoyo(costo) {
    const { error } = await supabase.rpc('solicitar_validacion_apoyo', { p_costo_id: Number(costo.id) })
    if (error) {
      mostrarAviso(error.message || 'No se pudo solicitar la validación por apoyo.')
      return
    }
    mostrarAviso('La validación por apoyo quedó solicitada. Puede tomarla otro administrador o auditor que no haya realizado el Conteo 3.')
    await cargarCostos()
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
      const bloqueosPorCostoPromise = idsCostos.length
        ? (async () => {
            try {
              let { data: bloqueos, error: errorBloqueos } = await supabase.rpc('obtener_bloqueos_costos_admin')
              if (errorBloqueos) {
                // Compatibilidad mientras se agrega la función segura de admin en Supabase.
                const respuestaAnterior = await supabase.rpc('obtener_bloqueos_costos_auditor')
                bloqueos = respuestaAnterior.data
                errorBloqueos = respuestaAnterior.error
              }
              if (errorBloqueos) throw errorBloqueos
              const registros = Array.isArray(bloqueos) ? bloqueos : bloqueos ? [bloqueos] : []
              const idUsuarioDeBloqueo = bloqueo => {
                const actor = bloqueo.usuario ?? bloqueo.auditor ?? bloqueo.owner ?? bloqueo.responsable
                return bloqueo.auditor_id ?? bloqueo.usuario_id ?? bloqueo.user_id ?? bloqueo.owner_id ?? bloqueo.responsable_id ?? bloqueo.bloqueado_por_id ?? bloqueo.bloqueado_por_usuario_id ?? actor?.id ?? (bloqueo.bloqueado_por && !String(bloqueo.bloqueado_por).includes('@') ? bloqueo.bloqueado_por : null)
              }
              const idUsuarioPorCosto = new Map(registros.map(bloqueo => [
                String(bloqueo.costo_id),
                idUsuarioDeBloqueo(bloqueo)
              ]))
              const idsUsuarios = [...new Set([...idUsuarioPorCosto.values()].filter(Boolean).map(String))]
              const correos = new Map()
              await Promise.all(idsUsuarios.map(async id => {
                const { data: correo, error: errorCorreo } = await supabase.rpc('obtener_auditor_email', { p_auditor_id: id })
                if (!errorCorreo && correo) correos.set(id, correo)
              }))
              return new Map(registros.map(bloqueo => {
                const idUsuario = idUsuarioPorCosto.get(String(bloqueo.costo_id))
                const actor = bloqueo.usuario ?? bloqueo.auditor ?? bloqueo.owner ?? bloqueo.responsable
                const nombre = bloqueo.auditor_nombre ?? bloqueo.usuario_nombre ?? bloqueo.user_name ?? bloqueo.owner_name ?? bloqueo.responsable_nombre ?? bloqueo.nombre_completo ?? bloqueo.nombre_usuario ?? bloqueo.nombre ?? actor?.nombre ?? actor?.nombre_completo ?? actor?.full_name ?? actor?.name
                const correo = bloqueo.auditor_email ?? bloqueo.usuario_email ?? bloqueo.user_email ?? bloqueo.owner_email ?? bloqueo.bloqueado_por_email ?? bloqueo.email ?? actor?.email ?? (String(bloqueo.bloqueado_por || '').includes('@') ? bloqueo.bloqueado_por : null) ?? correos.get(String(idUsuario))
                const bloqueado = Boolean(bloqueo.bloqueado_por_mi || bloqueo.bloqueado_por_otro || bloqueo.activo || idUsuario || correo)
                return [String(bloqueo.costo_id), {
                  ...bloqueo,
                  usuario_realizando: nombre || correo || (idUsuario ? `Usuario ${String(idUsuario).slice(0, 8)}` : bloqueado ? 'Usuario activo' : null)
                }]
              }))
            } catch (errorBloqueos) {
              console.warn('No se pudo obtener el usuario que mantiene cada costo:', errorBloqueos)
              return new Map()
            }
          })()
        : Promise.resolve(new Map())

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
          .select('detalle_costo_id, numero_conteo, resultado, created_at, auditor_id')
            .in('detalle_costo_id', idsDetalles)
          if (errorConteos) throw errorConteos

          const resumenesPorConteoCosto = new Map()
          const resumenPorCosto = new Map()
          const conteosRegistradosPorCosto = new Map()
          const usuarioConteoPorCosto = new Map()
          for (const conteo of conteos || []) {
            const costoId = detallePorId.get(String(conteo.detalle_costo_id))
            if (!costoId) continue
            const numero = Number(conteo.numero_conteo)
            if (!conteosRegistradosPorCosto.has(costoId)) conteosRegistradosPorCosto.set(costoId, new Set())
            conteosRegistradosPorCosto.get(costoId).add(numero)
            let resumenesPorNumero = resumenesPorConteoCosto.get(costoId)
            if (!resumenesPorNumero) {
              resumenesPorNumero = new Map()
              resumenesPorConteoCosto.set(costoId, resumenesPorNumero)
            }
            if (!resumenesPorNumero.has(numero)) {
              resumenesPorNumero.set(numero, { numero, lineas: 0, diferencias: 0, resultados: 0, fechaRealizado: null })
            }
            const resumen = resumenesPorNumero.get(numero)
            if (conteo.created_at && (!resumen.fechaRealizado || conteo.created_at > resumen.fechaRealizado)) {
              resumen.fechaRealizado = conteo.created_at
            }
            resumen.lineas += 1
            const resultadoConteo = String(conteo.resultado || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
            if (resultadoConteo === 'diferencia' || resultadoConteo === 'no_conforme') {
              resumen.diferencias += 1
              resumen.resultados += 1
            }
            if (resultadoConteo === 'conforme') resumen.resultados += 1

            const resumenUltimo = resumenPorCosto.get(costoId)
            if (!resumenUltimo || numero > resumenUltimo.numero) {
              resumenPorCosto.set(costoId, resumen)
              usuarioConteoPorCosto.set(costoId, conteo.auditor_id || null)
            }
          }

          for (const costo of costosActualizados) {
            const resumenesPorNumero = resumenesPorConteoCosto.get(String(costo.id))
            const resumen = resumenPorCosto.get(String(costo.id))
            if (!resumenesPorNumero || !resumen) continue
            const lineasEsperadas = resumen.numero === 1
              ? Number(costo.lineas_count)
              : (resumenesPorNumero.get(resumen.numero - 1)?.diferencias ?? 0)
            resumen.completo = resumen.lineas > 0 &&
              resumen.lineas === lineasEsperadas &&
              resumen.resultados === resumen.lineas
          }

          const idsAuditoresConteo = [...new Set([...usuarioConteoPorCosto.values()].filter(Boolean).map(String))]
          const correoPorAuditorConteo = new Map()
          await Promise.all(idsAuditoresConteo.map(async auditorId => {
            try {
              const { data: correo, error: errorCorreo } = await supabase.rpc('obtener_auditor_email', { p_auditor_id: auditorId })
              if (!errorCorreo && correo) correoPorAuditorConteo.set(auditorId, correo)
            } catch {
              // La consulta de identidad es complementaria: no debe bloquear la lista.
            }
          }))

          for (const costo of costosActualizados) {
            const clave = String(costo.id)
            const resumen = resumenPorCosto.get(clave)
            const registrados = conteosRegistradosPorCosto.get(clave)
            costo.conteos_registrados = registrados ? [...registrados] : []
            costo.numero_ultimo_conteo = resumen?.numero ?? null
            costo.fecha_realizado = resumen?.fechaRealizado ?? null
            costo.usuario_conteo_realizado = correoPorAuditorConteo.get(String(usuarioConteoPorCosto.get(clave))) || null
            const resultadoDerivado = resumen?.completo
              ? (resumen.diferencias > 0 ? 'no_conforme' : 'conforme')
              : null
            const resultadoGuardado = resultadosPersistidos.get(clave)
            costo.resultado = resultadoDerivado || (
              registrados?.size > 0 && ['conforme', 'no_conforme'].includes(resultadoGuardado)
                ? resultadoGuardado
                : null
            )

          }
        }
      }

      const bloqueosPorCosto = await bloqueosPorCostoPromise
      try {
        const { data: estadosApoyo } = await supabase.rpc('estados_apoyo_costos')
        const apoyoActual = new Map((estadosApoyo || []).map(item => [String(item.costo_id), item]))
        for (const costo of costosActualizados) {
          const estadoApoyo = apoyoActual.get(String(costo.id))
          costo.apoyoHabilitado = Boolean(estadoApoyo?.apoyo_habilitado && Number(estadoApoyo.numero_conteo) === Number(costo.conteo_habilitado))
        }
      } catch (errorApoyo) {
        console.warn('No se pudo cargar el estado de apoyo:', errorApoyo)
      }
      try {
        const { data: validaciones } = await supabase.rpc('estados_validacion_apoyo_costos')
        const validacionesPorCosto = new Map((validaciones || []).map(item => [String(item.costo_id), item]))
        for (const costo of costosActualizados) {
          const validacion = validacionesPorCosto.get(String(costo.id))
          costo.validado_por_apoyo = validacion?.estado === 'completada'
          costo.validacion_apoyo_pendiente = validacion?.estado === 'solicitada'
          costo.soy_solicitante_apoyo_final = Boolean(validacion?.soy_solicitante)
          costo.soy_validador_apoyo_final = Boolean(validacion?.soy_validador)
          costo.resultado_validacion_apoyo = validacion?.resultado || null
        }
      } catch (errorValidacionApoyo) {
        console.warn('No se pudo cargar el estado de la validación por apoyo:', errorValidacionApoyo)
      }
      try {
        const { data: pendientesNoManifestados, error: errorPendientesNoManifestados } = await supabase.rpc('resumen_no_manifestados_conteo3_pendientes_admin')
        if (errorPendientesNoManifestados) throw errorPendientesNoManifestados
        const porCosto = new Map((pendientesNoManifestados || []).map(item => [String(item.costo_id), Number(item.cantidad_pendiente || 0)]))
        for (const costo of costosActualizados) costo.no_manifestados_pendientes_apoyo = porCosto.get(String(costo.id)) || 0
      } catch (errorPendientesNoManifestados) {
        console.warn('No se pudo consultar la elegibilidad de no manifestados para apoyo:', errorPendientesNoManifestados)
      }
      try {
        const { data: participantes } = await supabase.rpc('participantes_apoyo_admin')
        const idsParticipantes = [...new Set((participantes || [])
          .flatMap(par => [par.usuario_1, par.usuario_2])
          .filter(Boolean)
          .map(String))]
        const correos = new Map()
        await Promise.all(idsParticipantes.map(async id => {
          const { data: correo } = await supabase.rpc('obtener_auditor_email', { p_auditor_id: id })
          if (correo) correos.set(id, correo)
        }))
        const porCosto = new Map((participantes || []).map(par => [String(par.costo_id),
          [par.usuario_1, par.usuario_2].filter(Boolean).map(id => correos.get(String(id)) || `Usuario ${String(id).slice(0, 8)}`)
        ]))
        for (const costo of costosActualizados) costo.usuarios_apoyo = porCosto.get(String(costo.id)) || []
      } catch (errorApoyo) {
        console.warn('No se pudieron cargar los participantes de apoyo:', errorApoyo)
      }
      for (const costo of costosActualizados) {
        const bloqueoActual = bloqueosPorCosto.get(String(costo.id))
        costo.usuario_realizando = bloqueoActual?.usuario_realizando ?? costo.usuario_conteo_realizado ?? null
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
    if (!costoAcciones?.id) return undefined
    let activo = true
    let timer
    const consultar = async () => {
      try {
        const { data, error } = await supabase.rpc('estado_habilitacion_apoyo_admin', {
          p_costo_id: Number(costoAcciones.id)
        })
        if (error) throw error
        if (!activo) return
        setEstadoApoyoAccion({
          costoId: Number(costoAcciones.id),
          numeroConteo: Number(costoAcciones.conteo_habilitado),
          ...data
        })
      } catch (errorEstado) {
        if (!activo) return
        console.error('No se pudo verificar el estado del apoyo para el conteo actual:', errorEstado)
        setEstadoApoyoAccion({
          costoId: Number(costoAcciones.id),
          numeroConteo: Number(costoAcciones.conteo_habilitado),
          puede_habilitar: false,
          motivo: 'no_verificado'
        })
      }
      timer = window.setTimeout(consultar, 4000)
    }
    consultar()
    return () => {
      activo = false
      window.clearTimeout(timer)
    }
  }, [costoAcciones?.id, costoAcciones?.conteo_habilitado])

  useEffect(() => {
    const timer = window.setTimeout(() => cargarCostos(), 0)
    return () => window.clearTimeout(timer)
  }, [cargarCostos])

  useEffect(() => {
    if (!apoyoEsperando) return undefined
    let activo = true
    let timer
    const verificar = async () => {
      try {
        const acceso = await iniciarCosto(apoyoEsperando.costo.id)
        if (!activo) return
        if (!acceso?.apoyo_habilitado) {
          setApoyoEsperando(null)
          mostrarAviso('El apoyo fue cancelado o el costo se reinició. Vuelve a la lista para ingresar nuevamente.')
          await cargarCostos()
          return
        }
        if (!acceso?.esperando_segundo) {
          guardarSesionAdmin(usuarioId, {
            view: 'conteo', costoId: apoyoEsperando.costo.id,
            numeroConteo: apoyoEsperando.numeroConteo, busqueda
          })
          setApoyoEsperando(null)
          setConteoAdmin({ costo: { ...apoyoEsperando.costo, apoyoHabilitado: true }, numeroConteo: apoyoEsperando.numeroConteo })
          return
        }
      } catch (error) {
        if (activo) {
          setApoyoEsperando(null)
          mostrarAviso(error?.message || 'No se pudo continuar el conteo compartido.')
        }
        return
      }
      timer = window.setTimeout(verificar, 2200)
    }
    timer = window.setTimeout(verificar, 2200)
    return () => { activo = false; window.clearTimeout(timer) }
  }, [apoyoEsperando, busqueda, usuarioId, cargarCostos])


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

    if (!costo || costo.estado === 'pendiente' || costo.estado === 'terminado') {
      console.log(
        'El costo ya no tiene una sesión activa para restaurar.'
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
        .then(acceso => {
          if (acceso?.esperando_segundo) {
            setApoyoEsperando({ costo: { ...costo, apoyoHabilitado: true }, numeroConteo })
            return
          }
          setConteoAdmin({ costo: { ...costo, apoyoHabilitado: Boolean(acceso?.apoyo_habilitado) }, numeroConteo })
        })
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
      const acceso = await iniciarCosto(costo.id)

      if (acceso?.esperando_segundo) {
        guardarSesionAdmin(usuarioId, {
          view: 'conteo', costoId: costo.id, numeroConteo, busqueda
        })
        setApoyoEsperando({ costo: { ...costo, apoyoHabilitado: true }, numeroConteo })
        return
      }

      // Guardar la sesión únicamente después de autorizar
      // al administrador.
      guardarSesionAdmin(usuarioId, {
        view: 'conteo',
        costoId: costo.id,
        numeroConteo,
        busqueda
      })

      setConteoAdmin({
        costo: { ...costo, apoyoHabilitado: Boolean(acceso?.apoyo_habilitado) },
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
    setApoyoEsperando(null)

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
    if (!conteoCompletoNoConforme(costo, 1)) {
      mostrarAviso('El Conteo 2 se habilitará cuando todos los usuarios terminen y guarden el Conteo 1.')
      return
    }
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
    if (!conteoCompletoNoConforme(costo, 2)) {
      mostrarAviso('El Conteo 3 se habilitará cuando todos los usuarios terminen y guarden el Conteo 2.')
      return
    }
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

  async function habilitarApoyo(costo) {
    const numeroConteo = Number(costo.conteo_habilitado)
    try {
      setHabilitando(costo.id)
      await habilitarApoyoConteo(costo.id, numeroConteo)
      setCostos(actuales => actuales.map(item => Number(item.id) === Number(costo.id)
        ? { ...item, apoyoHabilitado: true }
        : item))
      mostrarAviso(`Apoyo habilitado para el Conteo ${numeroConteo}. El costo permitirá como máximo dos usuarios.`, 'Apoyo habilitado con éxito')
    } catch (error) {
      const mensaje = String(error?.message || '')
      if (/ya existe.*usuario|usuario.*realizando|ya est[aá] siendo realizado|ocupado/i.test(mensaje)) {
        mostrarAviso('Ya existe un usuario realizando el costo. El apoyo debe habilitarse antes de que alguien ingrese.', 'Acceso denegado')
      } else {
        mostrarAviso(mensaje || 'No se pudo habilitar el apoyo.')
      }
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

  const costosFiltrados = filtrarListaCostos(costos, {
    busqueda,
    fecha: fechaFiltro,
    modoFecha: modoFechaFiltro,
    estado: estadoFiltro,
    resultado: resultadoFiltro
  })
  const filtrosListaActivos = Boolean(busqueda || fechaFiltro || estadoFiltro !== 'todos' || resultadoFiltro !== 'todos')

  function limpiarFiltrosLista() {
    manejarBusqueda('')
    setFechaFiltro('')
    setModoFechaFiltro('subido')
    setEstadoFiltro('todos')
    setResultadoFiltro('todos')
  }


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

  if (apoyoEsperando) {
    return (
      <div className="support-wait-page" role="status" aria-live="polite">
        <div className="support-wait-card">
          <div className="support-wait-orbit"><span /><span /><span /></div>
          <span className="support-wait-kicker">CONTEO COMPARTIDO</span>
          <h1>Esperando al segundo usuario</h1>
          <p>El apoyo está habilitado. Cuando se una la otra persona, cada quien recibirá su bloque de productos.</p>
          <div className="support-wait-cost">Costo {apoyoEsperando.costo.numero_costo} · Conteo {apoyoEsperando.numeroConteo}</div>
          <button type="button" className="support-wait-cancel" onClick={volverDesdeConteo}>Volver a costos</button>
        </div>
      </div>
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

      <header className="costos-admin-header cost-list-section-header">
        <div className="costos-admin-heading cost-list-section-heading">
          <span className="costos-admin-label">
            ADMINISTRACIÓN
          </span>

          <h3>
            Costos registrados
          </h3>

        </div>
      </header>


      <div className="admin-list-actions" aria-label="Acciones de costos filtrados">
        <span className="admin-list-actions-context">{costosFiltrados.length} {costosFiltrados.length === 1 ? 'costo coincide' : 'costos coinciden'} con los filtros</span>
        <div className="admin-list-actions-buttons">
          <button type="button" className="btn btn-sm btn-outline-primary" onClick={exportarCostosFiltrados} disabled={!costosFiltrados.length || exportandoCostos}>{exportandoCostos ? 'Preparando archivo…' : 'Exportar último conteo'}</button>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setCostosPorEliminar([...costosFiltrados])} disabled={!costosFiltrados.length || eliminandoCostos}>Eliminar costos ({costosFiltrados.length})</button>
        </div>
      </div>

      <div className="cost-result-toolbar">
        <CostListFilters
          resultado={resultadoFiltro}
          onResultadoChange={setResultadoFiltro}
          soloResultados
        />
      </div>


      {/* HERRAMIENTAS */}

      <div className="costos-toolbar">
        <CostListFilters
          busqueda={busqueda}
          onBusquedaChange={manejarBusqueda}
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
            {filtrosListaActivos ? '⌕' : '+'}
          </div>

          <h4>
            {filtrosListaActivos
              ? 'No encontramos resultados'
              : 'No existen costos registrados'}
          </h4>

          <p>
            {filtrosListaActivos
              ? 'Intenta buscar utilizando otro número de costo.'
              : 'Cuando registres un nuevo costo aparecerá aquí.'}
          </p>

          {filtrosListaActivos && (
            <button
              className="costos-clear-button"
              type="button"
              onClick={limpiarFiltrosLista}
            >
              Limpiar búsqueda
            </button>
          )}
        </div>
      )}


      {/* TABLA */}

      {!loading && costosFiltrados.length > 0 && (
        <ScrollableTable
          className="costos-table-wrapper"
          tableClassName="costos-table"
          ariaLabel="costos registrados"
        >
            <thead>
              <tr>
                <th>Número</th>
                <th>Subido</th>
                <th>Realizado</th>
                <th>Estado</th>
                <th>Líneas</th>
                <th>Conteo actual</th>
                <th>Resultado</th>
                <th>Usuario realizando</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {costosFiltrados.map(costo => (
                <tr key={costo.id}>

                  {/* NÚMERO */}

                  <td>
                    <div className="costos-number-cell">
                      <div>
                        <strong>{costo.numero_costo}</strong>
                      </div>
                    </div>
                  </td>

                  <td><span className="cost-date-value">{formatoFechaCosto(costo.created_at)}</span></td>
                  <td><span className="cost-date-value">{formatoFechaCosto(costo.fecha_realizado)}</span></td>


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
                    {costo.validado_por_apoyo ? (
                      <span className="resultado-pill validado-apoyo"><span>✓</span>Validado por apoyo</span>
                    ) : costo.resultado ? (
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

                  <td>
                    {costo.estado === 'en_proceso' ? (
                      <span className="cost-owner-value">
                        {costo.usuarios_apoyo?.length > 1
                          ? costo.usuarios_apoyo.join(' · ')
                          : costo.usuario_realizando || costo.usuarios_apoyo?.[0] || '—'}
                      </span>
                    ) : (
                      <span className="cost-date-value">—</span>
                    )}
                  </td>


                  {/* ACCIONES */}
                  <td>
                    <div className="costos-actions">
                      <div className="costos-actions-primary">
                        <button className="costos-view-button" onClick={() => verDetalle(costo)} type="button" disabled={reiniciando === costo.id}>Ver detalle</button>
                        {costo.validacion_apoyo_pendiente && costo.soy_validador_apoyo_final ? (
                          <button className="costos-admin-count-button" onClick={() => setValidacionApoyoSeleccionada(costo)} type="button">
                            Realizar última validación
                          </button>
                        ) : !costo.validado_por_apoyo && [1, 2, 3].includes(Number(costo.conteo_habilitado)) && String(costo.resultado || '').trim().toLowerCase() !== 'conforme' && (
                          <button className="costos-admin-count-button" onClick={() => realizarConteo(costo)} disabled={reiniciando === costo.id || habilitando === costo.id || abriendoConteo === costo.id} type="button">
                            {abriendoConteo === costo.id ? 'Verificando…' : `Realizar conteo ${costo.conteo_habilitado}`}
                          </button>
                        )}
                      </div>
                      <button type="button" className="costos-more-actions-trigger" onClick={() => setCostoAcciones(costo)}>Más acciones</button>
                    </div>
                  </td>

                </tr>
              ))}
            </tbody>
        </ScrollableTable>
      )}

      {aviso && (
        <div className="ui-notice-backdrop" role="presentation" onClick={() => setAviso(null)}>
          <section className="ui-notice" role="alertdialog" aria-modal="true" aria-labelledby="ui-notice-title" onClick={event => event.stopPropagation()}>
            <span className={`ui-notice-icon ui-notice-${aviso.tipo === 'success' ? 'success' : 'error'}`} aria-hidden="true">{aviso.tipo === 'success' ? '✓' : '!'}</span>
            <h2 id="ui-notice-title">{aviso.titulo || (aviso.tipo === 'denegado' ? 'Acceso denegado' : aviso.tipo === 'error' ? 'No se pudo completar' : 'Operación completada')}</h2>
            <p>{aviso.mensaje}</p>
            <button type="button" className="ui-notice-button" onClick={() => { setAviso(null); window.location.reload() }}>Entendido</button>
          </section>
        </div>
      )}
      {costoAcciones && (
        <div className="ui-notice-backdrop admin-actions-backdrop" role="presentation" onClick={() => setCostoAcciones(null)}>
          <section className="admin-cost-actions-modal" role="dialog" aria-modal="true" aria-labelledby="admin-cost-actions-title" onClick={event => event.stopPropagation()}>
            <button type="button" className="admin-cost-actions-close" onClick={() => setCostoAcciones(null)} aria-label="Cerrar acciones">×</button>
            <span className="costos-admin-label">ACCIONES DEL COSTO</span>
            <h2 id="admin-cost-actions-title">Costo {costoAcciones.numero_costo}</h2>
            {(() => {
              const resultadoNormalizado = String(costoAcciones.resultado || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
              const validacionFinalEnCurso = costoAcciones.validacion_apoyo_pendiente || costoAcciones.validado_por_apoyo
              const tercerConteoNoConforme = (Number(costoAcciones.numero_ultimo_conteo) === 3 && resultadoNormalizado === 'no_conforme') || Number(costoAcciones.no_manifestados_pendientes_apoyo || 0) > 0
              const costoListoParaValidacionFinal = costoAcciones.estado === 'terminado' && Number(costoAcciones.conteo_habilitado) === 3
              const conteoActualCompleto = Number(costoAcciones.numero_ultimo_conteo) === Number(costoAcciones.conteo_habilitado) && ['conforme', 'no_conforme'].includes(resultadoNormalizado)
              const estadoApoyoActual = Number(estadoApoyoAccion?.costoId) === Number(costoAcciones.id) && Number(estadoApoyoAccion?.numeroConteo) === Number(costoAcciones.conteo_habilitado)
              const apoyoVerificando = !estadoApoyoActual
              const apoyoPuedeHabilitar = estadoApoyoActual && estadoApoyoAccion?.puede_habilitar === true
              const textoEstadoApoyo = !estadoApoyoActual
                ? 'Verificando…'
                : estadoApoyoAccion.motivo === 'usuario_en_costo'
                  ? 'Usuario dentro del conteo'
                  : estadoApoyoAccion.motivo === 'apoyo_ya_habilitado'
                    ? 'Apoyo habilitado'
                    : estadoApoyoAccion.motivo === 'no_verificado'
                      ? 'No se pudo verificar'
                      : 'Conteo no disponible'
              const mostrarSolicitudApoyo = costoListoParaValidacionFinal && !validacionFinalEnCurso && !costoAcciones.validado_por_apoyo && tercerConteoNoConforme
              const mostrarHabilitarApoyo = [1, 2, 3].includes(Number(costoAcciones.conteo_habilitado)) && !conteoActualCompleto && resultadoNormalizado !== 'conforme' && !tercerConteoNoConforme && !validacionFinalEnCurso
              const mostrarGrupoApoyo = costoAcciones.validacion_apoyo_pendiente || costoAcciones.validado_por_apoyo || mostrarSolicitudApoyo || mostrarHabilitarApoyo
              return mostrarGrupoApoyo && (
                <section className="admin-cost-actions-group">
                  <h3>Apoyo y validación</h3>
                  {costoAcciones.validacion_apoyo_pendiente && costoAcciones.soy_validador_apoyo_final && <button type="button" className="costos-count-button" onClick={() => { const costo = costoAcciones; setCostoAcciones(null); setValidacionApoyoSeleccionada(costo) }}>Realizar última validación</button>}
                  {costoAcciones.validacion_apoyo_pendiente && costoAcciones.soy_solicitante_apoyo_final && !costoAcciones.soy_validador_apoyo_final && <p className="resultado-pendiente">Esperando validación por apoyo</p>}
                  {mostrarSolicitudApoyo && <button type="button" className="costos-count-button" onClick={() => { const costo = costoAcciones; setCostoAcciones(null); solicitarValidacionApoyo(costo) }}>Solicitar apoyo</button>}
                  {costoAcciones.validado_por_apoyo && <span className="resultado-pill validado-apoyo">✓ Validado por apoyo</span>}
                  {mostrarHabilitarApoyo && <button className="costos-count-button" disabled={!apoyoPuedeHabilitar || apoyoVerificando || costoAcciones.apoyoHabilitado || habilitando === costoAcciones.id || reiniciando === costoAcciones.id || abriendoConteo === costoAcciones.id} onClick={() => { const costo = costoAcciones; setCostoAcciones(null); habilitarApoyo(costo) }} type="button">{costoAcciones.apoyoHabilitado ? 'Apoyo habilitado' : apoyoPuedeHabilitar ? 'Habilitar apoyo' : textoEstadoApoyo}</button>}
                </section>
              )
            })()}
            <section className="admin-cost-actions-group">
                <h3>Gestión del conteo</h3>
                {Number(costoAcciones.conteo_habilitado) === 1 && String(costoAcciones.resultado || '').trim().toLowerCase() !== 'conforme' && <button className="costos-count-button" disabled={!conteoCompletoNoConforme(costoAcciones, 1) || habilitando === costoAcciones.id || reiniciando === costoAcciones.id} onClick={() => { const costo = costoAcciones; setCostoAcciones(null); habilitarConteo2(costo) }} type="button">{conteoCompletoNoConforme(costoAcciones, 1) ? 'Habilitar Conteo 2' : 'Esperando que guarden Conteo 1'}</button>}
                {Number(costoAcciones.conteo_habilitado) === 2 && String(costoAcciones.resultado || '').trim().toLowerCase() !== 'conforme' && <button className="costos-count-button" disabled={!conteoCompletoNoConforme(costoAcciones, 2) || habilitando === costoAcciones.id || reiniciando === costoAcciones.id} onClick={() => { const costo = costoAcciones; setCostoAcciones(null); habilitarConteo3(costo) }} type="button">{conteoCompletoNoConforme(costoAcciones, 2) ? 'Habilitar Conteo 3' : 'Esperando que guarden Conteo 2'}</button>}
                <button className="costos-reset-button" disabled={reiniciando === costoAcciones.id || habilitando === costoAcciones.id || abriendoConteo === costoAcciones.id} onClick={() => { const costo = costoAcciones; setCostoAcciones(null); manejarReinicio(costo) }} type="button">Reiniciar costo</button>
            </section>
          </section>
        </div>
      )}
      {costosPorEliminar && (
        <div className="ui-notice-backdrop" role="presentation">
          <section className="ui-notice ui-notice-delete-costs" role="alertdialog" aria-modal="true" aria-labelledby="delete-costs-title">
            <span className="ui-notice-icon ui-notice-danger" aria-hidden="true">!</span>
            <h2 id="delete-costs-title">¿Eliminar {costosPorEliminar.length} {costosPorEliminar.length === 1 ? 'costo' : 'costos'}?</h2>
            <p>Esta acción eliminará los costos seleccionados y sus registros relacionados. Revisa los números antes de confirmar.</p>
            <div className="delete-costs-numbers" aria-label="Números de costos que se eliminarán">
              {costosPorEliminar.map(costo => <span key={costo.id}>{costo.numero_costo}</span>)}
            </div>
            <div className="ui-notice-actions">
              <button type="button" className="ui-notice-secondary" onClick={() => setCostosPorEliminar(null)} disabled={eliminandoCostos}>Cancelar</button>
              <button type="button" className="ui-notice-button ui-notice-danger" onClick={confirmarEliminacionCostos} disabled={eliminandoCostos}>{eliminandoCostos ? 'Eliminando…' : 'Sí, eliminar costos'}</button>
            </div>
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
      {validacionApoyoSeleccionada && (
        <ValidacionApoyo
          costo={validacionApoyoSeleccionada}
          onClose={() => setValidacionApoyoSeleccionada(null)}
          onSaved={async () => {
            await cargarCostos()
            setValidacionApoyoSeleccionada(null)
          }}
        />
      )}
    </section>
  )
}

export default CostosAdmin



