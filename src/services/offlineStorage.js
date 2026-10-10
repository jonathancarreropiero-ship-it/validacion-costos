// ============================================================
// ALMACENAMIENTO OFFLINE DE VALIDACIÓN DE COSTOS
// ============================================================

const DB_NAME = 'validacion-costos-offline'
const DB_VERSION = 3

const STORE_AUDITORIAS = 'auditorias'
const STORE_PENDIENTES = 'pendientes'
const STORE_COSTOS = 'costos'
const STORE_DETALLES = 'detalles'

// ============================================================
// ABRIR BASE DE DATOS
// ============================================================

function abrirDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(request.error)
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onupgradeneeded = event => {
      const db = event.target.result

      // --------------------------------------------------------
      // AUDITORIAS
      // --------------------------------------------------------

      if (!db.objectStoreNames.contains(STORE_AUDITORIAS)) {
        const store = db.createObjectStore(
          STORE_AUDITORIAS,
          {
            keyPath: 'id',
            autoIncrement: true
          }
        )

        store.createIndex(
          'costoId',
          'costoId',
          { unique: false }
        )

        store.createIndex(
          'usuarioId',
          'usuarioId',
          { unique: false }
        )

        store.createIndex(
          'numeroConteo',
          'numeroConteo',
          { unique: false }
        )

        store.createIndex(
          'costoUsuarioConteo',
          [
            'costoId',
            'usuarioId',
            'numeroConteo'
          ],
          { unique: false }
        )
      }

      // --------------------------------------------------------
      // PENDIENTES
      // --------------------------------------------------------

      if (!db.objectStoreNames.contains(STORE_PENDIENTES)) {
        const store = db.createObjectStore(
          STORE_PENDIENTES,
          {
            keyPath: 'id',
            autoIncrement: true
          }
        )

        store.createIndex(
          'usuarioId',
          'usuarioId',
          { unique: false }
        )

        store.createIndex(
          'estado',
          'estado',
          { unique: false }
        )

        store.createIndex(
          'costoId',
          'costoId',
          { unique: false }
        )
      }

      // --------------------------------------------------------
      // COSTOS
      // --------------------------------------------------------

      if (!db.objectStoreNames.contains(STORE_COSTOS)) {
        const store = db.createObjectStore(
          STORE_COSTOS,
          {
            keyPath: 'id'
          }
        )

        store.createIndex(
          'usuarioId',
          'usuarioId',
          { unique: false }
        )
      }

      // --------------------------------------------------------
      // DETALLES
      // --------------------------------------------------------

      if (!db.objectStoreNames.contains(STORE_DETALLES)) {
        const store = db.createObjectStore(
          STORE_DETALLES,
          {
            keyPath: 'id'
          }
        )

        store.createIndex(
          'costoId',
          'costoId',
          { unique: false }
        )
      }
    }
  })
}

// ============================================================
// UTILIDAD ONLINE / OFFLINE
// ============================================================

export function estaOnline() {
  return navigator.onLine
}

// ============================================================
// ESCUCHAR CAMBIO DE CONEXIÓN
// ============================================================

export function escucharConexion({
  alConectar,
  alDesconectar
} = {}) {

  const manejarOnline = () => {
    if (typeof alConectar === 'function') {
      alConectar()
    }
  }

  const manejarOffline = () => {
    if (typeof alDesconectar === 'function') {
      alDesconectar()
    }
  }

  window.addEventListener(
    'online',
    manejarOnline
  )

  window.addEventListener(
    'offline',
    manejarOffline
  )

  return () => {
    window.removeEventListener(
      'online',
      manejarOnline
    )

    window.removeEventListener(
      'offline',
      manejarOffline
    )
  }
}

// ============================================================
// PENDIENTES OFFLINE
// ============================================================

export async function registrarPendienteOffline({
  costoId,
  usuarioId,
  numeroConteo,
  datos,
  noManifestados = [],
  tipo = 'guardar_conteo'
}) {

  const db = await abrirDB()

  return new Promise((resolve, reject) => {

    const transaction = db.transaction(
      STORE_PENDIENTES,
      'readwrite'
    )

    const store =
      transaction.objectStore(
        STORE_PENDIENTES
      )

    const pendiente = {
      costoId,
      usuarioId,
      numeroConteo,
      tipo,
      datos,
      noManifestados,

      estado: 'pendiente',

      intentos: 0,

      error: null,

      creadoEn:
        new Date().toISOString(),

      ultimoIntentoEn: null
    }

    const request =
      store.add(pendiente)

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

// ============================================================
// OBTENER PENDIENTES
// ============================================================

export async function obtenerPendientesOffline({
  usuarioId = null,
  estado = null
} = {}) {

  const db = await abrirDB()

  return new Promise((resolve, reject) => {

    const transaction = db.transaction(
      STORE_PENDIENTES,
      'readonly'
    )

    const store =
      transaction.objectStore(
        STORE_PENDIENTES
      )

    const request =
      store.getAll()

    request.onsuccess = () => {

      let resultados =
        request.result || []

      if (usuarioId !== null) {
        resultados =
          resultados.filter(
            item =>
              item.usuarioId === usuarioId
          )
      }

      if (estado !== null) {
        resultados =
          resultados.filter(
            item =>
              item.estado === estado
          )
      }

      resultados.sort(
        (a, b) =>
          new Date(a.creadoEn) -
          new Date(b.creadoEn)
      )

      resolve(resultados)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

// ============================================================
// CONTAR PENDIENTES
// ============================================================

export async function contarPendientesOffline({
  usuarioId = null,
  estado = null
} = {}) {

  const pendientes =
    await obtenerPendientesOffline({
      usuarioId,
      estado
    })

  return pendientes.length
}

// ============================================================
// ACTUALIZAR PENDIENTE
// ============================================================

export async function actualizarPendienteOffline(
  id,
  cambios = {}
) {

  const db = await abrirDB()

  return new Promise((resolve, reject) => {

    const transaction = db.transaction(
      STORE_PENDIENTES,
      'readwrite'
    )

    const store =
      transaction.objectStore(
        STORE_PENDIENTES
      )

    const obtener =
      store.get(id)

    obtener.onsuccess = () => {

      const pendiente =
        obtener.result

      if (!pendiente) {
        reject(
          new Error(
            `No existe el pendiente ${id}.`
          )
        )

        return
      }

      const actualizado = {
        ...pendiente,
        ...cambios
      }

      const request =
        store.put(actualizado)

      request.onsuccess = () => {
        resolve(actualizado)
      }

      request.onerror = () => {
        reject(request.error)
      }
    }

    obtener.onerror = () => {
      reject(obtener.error)
    }
  })
}

// ============================================================
// ELIMINAR PENDIENTE
// ============================================================

export async function eliminarPendienteOffline(
  id
) {

  const db = await abrirDB()

  return new Promise((resolve, reject) => {

    const transaction = db.transaction(
      STORE_PENDIENTES,
      'readwrite'
    )

    const store =
      transaction.objectStore(
        STORE_PENDIENTES
      )

    const request =
      store.delete(id)

    request.onsuccess = () => {
      resolve(true)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

// ============================================================
// GUARDAR COSTOS OFFLINE
// ============================================================

export async function guardarCostosOffline({
  usuarioId,
  costos = []
}) {

  const db = await abrirDB()

  return new Promise((resolve, reject) => {

    const transaction = db.transaction(
      STORE_COSTOS,
      'readwrite'
    )

    const store =
      transaction.objectStore(
        STORE_COSTOS
      )

    costos.forEach(costo => {

      store.put({
        ...costo,
        usuarioId
      })

    })

    transaction.oncomplete = () => {
      resolve(true)
    }

    transaction.onerror = () => {
      reject(transaction.error)
    }
  })
}

// ============================================================
// OBTENER COSTOS OFFLINE
// ============================================================

export async function obtenerCostosOffline({
  usuarioId
}) {

  const db = await abrirDB()

  return new Promise((resolve, reject) => {

    const transaction = db.transaction(
      STORE_COSTOS,
      'readonly'
    )

    const store =
      transaction.objectStore(
        STORE_COSTOS
      )

    const request =
      store.getAll()

    request.onsuccess = () => {

      const resultados =
        (request.result || [])
          .filter(
            item =>
              item.usuarioId === usuarioId
          )

      resolve(resultados)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

// ============================================================
// GUARDAR DETALLES OFFLINE
// ============================================================

export async function guardarDetallesOffline({
  costoId,
  detalles = []
}) {

  const db = await abrirDB()

  return new Promise((resolve, reject) => {

    const transaction = db.transaction(
      STORE_DETALLES,
      'readwrite'
    )

    const store =
      transaction.objectStore(
        STORE_DETALLES
      )

    detalles.forEach(detalle => {

      store.put({
        ...detalle,
        costoId
      })

    })

    transaction.oncomplete = () => {
      resolve(true)
    }

    transaction.onerror = () => {
      reject(transaction.error)
    }
  })
}

// ============================================================
// OBTENER DETALLES OFFLINE
// ============================================================

export async function obtenerDetallesOffline({
  costoId
}) {

  const db = await abrirDB()

  return new Promise((resolve, reject) => {

    const transaction = db.transaction(
      STORE_DETALLES,
      'readonly'
    )

    const store =
      transaction.objectStore(
        STORE_DETALLES
      )

    const request =
      store.getAll()

    request.onsuccess = () => {

      const resultados =
        (request.result || [])
          .filter(
            item =>
              item.costoId === costoId
          )

      resolve(resultados)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

// ============================================================
// GUARDAR AUDITORÍA OFFLINE
// ============================================================

export async function guardarAuditoriaOffline({
  costoId,
  usuarioId,
  numeroCosto,
  numeroConteo,
  detalles = [],
  noManifestados = []
}) {

  const db = await abrirDB()

  return new Promise((resolve, reject) => {

    const transaction = db.transaction(
      STORE_AUDITORIAS,
      'readwrite'
    )

    const store =
      transaction.objectStore(
        STORE_AUDITORIAS
      )

    const registro = {
      costoId,
      usuarioId,
      numeroCosto,
      numeroConteo,

      detalles,

      noManifestados,

      guardadoEn:
        new Date().toISOString()
    }

    const request =
      store.add(registro)

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

// ============================================================
// OBTENER AUDITORÍA OFFLINE
// ============================================================

export async function obtenerAuditoriaOffline({
  costoId,
  usuarioId,
  numeroConteo
}) {

  const db = await abrirDB()

  return new Promise((resolve, reject) => {

    const transaction = db.transaction(
      STORE_AUDITORIAS,
      'readonly'
    )

    const store =
      transaction.objectStore(
        STORE_AUDITORIAS
      )

    const request =
      store.getAll()

    request.onsuccess = () => {

      const resultados =
        (request.result || [])
          .filter(item =>
            item.costoId === costoId &&
            item.usuarioId === usuarioId &&
            Number(item.numeroConteo) ===
              Number(numeroConteo)
          )

      if (!resultados.length) {
        resolve(null)
        return
      }

      resultados.sort(
        (a, b) =>
          new Date(b.guardadoEn) -
          new Date(a.guardadoEn)
      )

      resolve(
        resultados[0]
      )
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

// ============================================================
// ELIMINAR AUDITORÍA OFFLINE
// ============================================================

export async function eliminarAuditoriaOffline({
  costoId,
  usuarioId,
  numeroConteo
}) {

  const db = await abrirDB()

  return new Promise((resolve, reject) => {

    const transaction = db.transaction(
      STORE_AUDITORIAS,
      'readwrite'
    )

    const store =
      transaction.objectStore(
        STORE_AUDITORIAS
      )

    const request =
      store.getAll()

    request.onsuccess = () => {

      const registros =
        (request.result || [])
          .filter(item =>
            item.costoId === costoId &&
            item.usuarioId === usuarioId &&
            Number(item.numeroConteo) ===
              Number(numeroConteo)
          )

      registros.forEach(
        registro => {
          store.delete(
            registro.id
          )
        }
      )
    }

    transaction.oncomplete = () => {
      resolve(true)
    }

    transaction.onerror = () => {
      reject(transaction.error)
    }
  })
}

// ============================================================
// LIMPIAR SESIÓN ACTUAL
// ============================================================

export async function limpiarSesionActual(
  usuarioId
) {

  const db = await abrirDB()

  return new Promise((resolve, reject) => {

    const transaction = db.transaction(
      [
        STORE_AUDITORIAS,
        STORE_COSTOS,
        STORE_DETALLES
      ],
      'readwrite'
    )

    const auditorias =
      transaction.objectStore(
        STORE_AUDITORIAS
      )

    const costos =
      transaction.objectStore(
        STORE_COSTOS
      )

    auditorias.getAll().onsuccess = event => {

      const registros =
        event.target.result || []

      registros
        .filter(
          item =>
            item.usuarioId === usuarioId
        )
        .forEach(
          item =>
            auditorias.delete(
              item.id
            )
        )
    }

    costos.getAll().onsuccess = event => {

      const registros =
        event.target.result || []

      registros
        .filter(
          item =>
            item.usuarioId === usuarioId
        )
        .forEach(
          item =>
            costos.delete(
              item.id
            )
        )
    }

    transaction.oncomplete = () => {
      resolve(true)
    }

    transaction.onerror = () => {
      reject(transaction.error)
    }
  })
}
