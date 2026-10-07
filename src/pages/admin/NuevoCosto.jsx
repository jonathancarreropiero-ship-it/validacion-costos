import { useState } from 'react'
import { leerExcel } from '../../utils/excel'
import { crearCosto } from '../../services/costos'

function NuevoCosto({ onGuardado, onCancelar }) {
  const [numeroCosto, setNumeroCosto] = useState('')
  const [archivo, setArchivo] = useState(null)
  const [datos, setDatos] = useState([])

  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function seleccionarArchivo(e) {
    const file = e.target.files[0]

    if (!file) {
      return
    }

    setArchivo(file)
    setDatos([])
    setError('')
    setMensaje('')

    try {
      const resultado = await leerExcel(file)

      if (!resultado || resultado.length === 0) {
        setError('El archivo Excel no contiene registros.')
        return
      }

      setDatos(resultado)
    } catch (error) {
      console.error(error)
      setError('No se pudo leer el archivo Excel.')
    }
  }

  async function guardarCosto() {
    setError('')
    setMensaje('')

    if (!numeroCosto.trim()) {
      setError('Debes ingresar el número de costo.')
      return
    }

    if (datos.length === 0) {
      setError('Debes seleccionar un archivo Excel.')
      return
    }

    try {
      setGuardando(true)

      const resultado = await crearCosto(
        numeroCosto,
        datos
      )

      setMensaje(
        `Costo ${resultado.numero_costo} guardado correctamente.`
      )

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

  return (
    <section className="nuevo-costo">

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

          {/* NÚMERO DE COSTO */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label htmlFor="numero-costo" style={{ fontWeight: 600, fontSize: '13px', color: '#334155' }}>
              Número de costo
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: '12px', color: '#64748b', fontWeight: 600 }}>#</span>
              <input
                id="numero-costo"
                type="text"
                value={numeroCosto}
                onChange={(e) => setNumeroCosto(e.target.value)}
                placeholder="Ejemplo: 9192"
                disabled={guardando}
                style={{ paddingLeft: '32px' }}
              />
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
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#15803d' }}>Listo</span>
        </div>
      )}

      {/* MENSAJE DE ERROR */}
      {error && (
        <div style={{ padding: '14px 18px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#b91c1c', display: 'flex', gap: '10px' }}>
          <strong>Error:</strong> <span>{error}</span>
        </div>
      )}

      {/* MENSAJE DE ÉXITO */}
      {mensaje && (
        <div style={{ padding: '14px 18px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', color: '#15803d', display: 'flex', gap: '10px' }}>
          <strong>Éxito:</strong> <span>{mensaje}</span>
        </div>
      )}

      {/* VISTA PREVIA */}
      {datos.length > 0 && (
        <div className="admin-conteo-tabla-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ background: '#eff6ff', color: '#1e40af', width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                02
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>Vista previa del Excel</h3>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Verifica los datos antes de registrar el costo.</p>
              </div>
            </div>
            <span style={{ fontSize: '13px', background: '#f1f5f9', padding: '6px 12px', borderRadius: '6px', fontWeight: 600 }}>
              Líneas encontradas: <strong>{datos.length}</strong>
            </span>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Descripción</th>
                  <th>Cantidad</th>
                  <th>UM</th>
                  <th>Ubicación</th>
                </tr>
              </thead>
              <tbody>
                {datos.slice(0, 10).map((fila, index) => (
                  <tr key={index}>
                    <td><strong>{fila.SKU ?? fila.sku ?? fila.Sku ?? ''}</strong></td>
                    <td>{fila.Descripción ?? fila.Descripcion ?? fila.descripcion ?? ''}</td>
                    <td>{fila.Cantidad ?? fila.cantidad ?? ''}</td>
                    <td>{fila.UM ?? fila.Um ?? fila.um ?? ''}</td>
                    <td>{fila.Ubicación ?? fila.Ubicacion ?? fila.ubicacion ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {datos.length > 10 && (
            <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', margin: 0 }}>
              Mostrando las primeras 10 líneas de <strong>{datos.length}</strong> registros.
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
            <button type="button" className="btn-secondary" onClick={onCancelar} disabled={guardando}>
              Cancelar
            </button>
            <button type="button" className="btn-primary" onClick={guardarCosto} disabled={guardando}>
              {guardando ? 'Guardando...' : '✓ Guardar costo'}
            </button>
          </div>

        </div>
      )}

    </section>
  )
}

export default NuevoCosto