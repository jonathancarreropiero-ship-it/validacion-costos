import { useState } from 'react'
import { leerExcel } from '../../utils/excel'
import { crearCosto } from '../../services/costos'
import ValidationNotice from '../../components/ValidationNotice'

function NuevoCosto({ onGuardado, onCancelar }) {
  const [archivo, setArchivo] = useState(null)
  const [costosExcel, setCostosExcel] = useState([])
  const [costosGuardados, setCostosGuardados] = useState([])

  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function seleccionarArchivo(e) {
    const file = e.target.files[0]

    if (!file) {
      return
    }

    setArchivo(file)
    setCostosExcel([])
    setCostosGuardados([])
    setError('')
    setMensaje('')

    try {
      const resultado = await leerExcel(file)

      if (!resultado?.costos?.length) {
        setError('No se encontraron costos con productos en el archivo Excel.')
        return
      }

      setCostosExcel(resultado.costos)
    } catch (error) {
      console.error(error)
      setError(error.message || 'No se pudo leer el archivo Excel.')
    }
  }

  async function guardarCosto() {
    setError('')
    setMensaje('')

    if (costosExcel.length === 0) {
      setError('Debes seleccionar un archivo Excel.')
      return
    }

    try {
      setGuardando(true)

      const numerosGuardados = new Set(costosGuardados)
      const pendientes = costosExcel.filter(costo => !numerosGuardados.has(costo.numeroCosto))
      if (pendientes.length === 0) {
        setError('Todos los costos de este archivo ya se guardaron.')
        return
      }

      for (const costo of pendientes) {
        try {
          await crearCosto(costo.numeroCosto, costo.filas)
          numerosGuardados.add(costo.numeroCosto)
          setCostosGuardados(Array.from(numerosGuardados))
        } catch (error) {
          const cantidadGuardados = numerosGuardados.size
          if (cantidadGuardados > 0) {
            setMensaje(`Se guardaron ${cantidadGuardados} de ${costosExcel.length} costos. ${Array.from(numerosGuardados).join(', ')}`)
          }
          setError(`No se pudo guardar el costo ${costo.numeroCosto}: ${error.message || 'Error al registrar sus productos.'} Los costos restantes siguen pendientes.`)
          return
        }
      }

      setMensaje(`Se guardaron correctamente ${costosExcel.length} costos: ${costosExcel.map(costo => costo.numeroCosto).join(', ')}.`)

      setTimeout(() => {
        if (onGuardado) {
          onGuardado()
        }
      }, 800)
    } catch (error) {
      console.error('Error guardando costo:', error)

      setError(
        error.message ||
        'No se pudo guardar el costo.'
      )
    } finally {
      setGuardando(false)
    }
  }

  const cantidadLineas = costosExcel.reduce((total, costo) => total + costo.filas.length, 0)
  const filasVistaPrevia = costosExcel.flatMap(costo => costo.filas.map(fila => ({
    ...fila,
    numeroCosto: costo.numeroCosto
  })))

  return (
    <section className="nuevo-costo">
      <ValidationNotice message={error} onClose={() => setError('')} />
      <ValidationNotice message={mensaje} type="success" onClose={() => setMensaje('')} />

      {/* ======================================
          ENCABEZADO
      ====================================== */}

      <header className="nuevo-costo-header">

        <div className="nuevo-costo-heading">

          <span className="nuevo-costo-kicker">
            ADMINISTRACIÓN
          </span>

          <h2 className="nuevo-costo-title">
            Nuevo costo
          </h2>

          <p className="nuevo-costo-description">
            Registra un nuevo costo cargando el archivo
            Excel recibido de recepción.
          </p>

        </div>

        <button
          type="button"
          className="btn-secondary"
          onClick={onCancelar}
          disabled={guardando}
        >
          <span>←</span>
          <span>Volver a costos</span>
        </button>

      </header>

      {/* ======================================
          INFORMACIÓN DEL COSTO
      ====================================== */}

      <div className="admin-conteo-tabla-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: '#eff6ff', color: '#1e40af', width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
            01
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>Información del costo</h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Ingresa los datos principales del proceso.</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>

          {/* NÚMERO DE COSTO LEÍDO DEL CAMPO FICHA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label htmlFor="numero-costo-detectado" style={{ fontWeight: 600, fontSize: '13px', color: '#334155' }}>
              Número de costo detectado
            </label>
            <div id="numero-costo-detectado" className="nuevo-costo-numero-detectado" aria-live="polite">
              {costosExcel.length === 0 ? (
                <strong>Se detectará al cargar el Excel</strong>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {costosExcel.map(costo => (
                    <span key={costo.numeroCosto} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '8px', background: '#eaf1fc', color: '#234675' }}>
                      <strong>{costo.numeroCosto}</strong>
                      <span>{costo.filas.length} líneas</span>
                      {costosGuardados.includes(costo.numeroCosto) && <span aria-label="Guardado">✓</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ARCHIVO EXCEL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label htmlFor="archivo-excel" style={{ fontWeight: 600, fontSize: '13px', color: '#334155' }}>
              Archivo Excel
            </label>
            <input
              id="archivo-excel"
              type="file"
              accept=".xlsx,.xls"
              onChange={seleccionarArchivo}
              disabled={guardando}
              style={{ padding: '6px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer' }}
            />
          </div>

        </div>

      </div>

      {/* ARCHIVO SELECCIONADO */}
      {archivo && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ background: '#15803d', color: '#fff', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>✓</span>
            <div>
              <span style={{ fontSize: '12px', color: '#15803d', display: 'block', fontWeight: 600 }}>Archivo seleccionado</span>
              <strong style={{ fontSize: '14px', color: '#0f172a' }}>{archivo.name}</strong>
            </div>
          </div>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: costosExcel.length ? '#15803d' : '#64748b' }}>
            {costosExcel.length ? `${costosExcel.length} ${costosExcel.length === 1 ? 'costo' : 'costos'}` : 'Pendiente de validar'}
          </span>
        </div>
      )}

      {/* VISTA PREVIA */}
      {costosExcel.length > 0 && (
        <div className="admin-conteo-tabla-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ background: '#eff6ff', color: '#1e40af', width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                02
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>Vista previa del Excel</h3>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Verifica la agrupación por costo y sus productos antes de registrarlos.</p>
              </div>
            </div>
            <span style={{ fontSize: '13px', background: '#f1f5f9', padding: '6px 12px', borderRadius: '6px', fontWeight: 600 }}>
              <strong>{costosExcel.length}</strong> {costosExcel.length === 1 ? 'costo' : 'costos'} · <strong>{cantidadLineas}</strong> líneas
            </span>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <table>
              <thead>
                <tr>
                  <th>Costo</th>
                  <th>SKU</th>
                  <th>Descripción</th>
                  <th>Cantidad</th>
                  <th>UM</th>
                  <th>Ubicación</th>
                  <th>Factor</th>
                </tr>
              </thead>
              <tbody>
                {filasVistaPrevia.slice(0, 10).map((fila, index) => (
                  <tr key={`${fila.numeroCosto}-${fila.SKU}-${index}`}>
                    <td><strong>{fila.numeroCosto}</strong></td>
                    <td><strong>{fila.SKU ?? fila.sku ?? fila.Sku ?? ''}</strong></td>
                    <td>{fila.Descripción ?? fila.Descripcion ?? fila.descripcion ?? ''}</td>
                    <td>{fila.Cantidad ?? fila.cantidad ?? ''}</td>
                    <td>{fila.UM ?? fila.Um ?? fila.um ?? ''}</td>
                    <td>{fila.Ubicación ?? fila.Ubicacion ?? fila.ubicacion ?? ''}</td>
                    <td>{fila.Factor ?? fila.factor ?? '1'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {cantidadLineas > 10 && (
            <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', margin: 0 }}>
              Mostrando las primeras 10 líneas de <strong>{cantidadLineas}</strong> registros distribuidos en <strong>{costosExcel.length}</strong> costos.
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
            <button type="button" className="btn-secondary" onClick={onCancelar} disabled={guardando}>
              Cancelar
            </button>
            <button type="button" className="btn-primary" onClick={guardarCosto} disabled={guardando || costosGuardados.length === costosExcel.length}>
              {guardando ? 'Guardando...' : `✓ Guardar ${costosExcel.length === 1 ? 'costo' : `${costosExcel.length} costos`}`}
            </button>
          </div>

        </div>
      )}

    </section>
  )
}

export default NuevoCosto
