// ============================================================
// ALMACENAMIENTO OFFLINE DE VALIDACIÓN DE COSTOS
// ============================================================

const DB_NAME = "validacion-costos-offline";
const DB_VERSION = 1;

const STORE_AUDITORIAS = "auditorias";
const STORE_PENDIENTES = "pendientes";

// ============================================================
// ABRIR / CREAR BASE DE DATOS
// ============================================================

function abrirDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(
        new Error(
          "No se pudo abrir el almacenamiento local."
        )
      );
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_AUDITORIAS)) {
        const store = db.createObjectStore(
          STORE_AUDITORIAS,
          {
            keyPath: "clave",
          }
        );

        store.createIndex(
          "costoId",
          "costoId",
          {
            unique: false,
          }
        );

        store.createIndex(
          "usuarioId",
          "usuarioId",
          {
            unique: false,
          }
        );
      }

      if (!db.objectStoreNames.contains(STORE_PENDIENTES)) {
        const store = db.createObjectStore(
          STORE_PENDIENTES,
          {
            keyPath: "id",
            autoIncrement: true,
          }
        );

        store.createIndex(
          "costoId",
          "costoId",
          {
            unique: false,
          }
        );

        store.createIndex(
          "usuarioId",
          "usuarioId",
          {
            unique: false,
          }
        );

        store.createIndex(
          "estado",
          "estado",
          {
            unique: false,
          }
        );
      }
    };
  });
}

// ============================================================
// GUARDAR AUDITORÍA LOCAL
// ============================================================

export async function guardarAuditoriaOffline({
  costoId,
  usuarioId,
  numeroCosto,
  numeroConteo,
  detalles,
  noManifestados = [],
}) {
  const db = await abrirDB();

  const clave = `${usuarioId}-${costoId}`;

  const datos = {
    clave,
    costoId,
    usuarioId,
    numeroCosto,
    numeroConteo,
    detalles: detalles || [],
    noManifestados,
    actualizadoEn: new Date().toISOString(),
    estado: "pendiente",
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_AUDITORIAS,
      "readwrite"
    );

    const store =
      transaction.objectStore(
        STORE_AUDITORIAS
      );

    const request = store.put(datos);

    request.onsuccess = () => {
      resolve(datos);
    };

    request.onerror = () => {
      reject(
        new Error(
          "No se pudo guardar la auditoría localmente."
        )
      );
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

// ============================================================
// OBTENER AUDITORÍA LOCAL
// ============================================================

export async function obtenerAuditoriaOffline(
  costoId,
  usuarioId
) {
  const db = await abrirDB();

  const clave = `${usuarioId}-${costoId}`;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_AUDITORIAS,
      "readonly"
    );

    const store =
      transaction.objectStore(
        STORE_AUDITORIAS
      );

    const request = store.get(clave);

    request.onsuccess = () => {
      resolve(
        request.result || null
      );
    };

    request.onerror = () => {
      reject(
        new Error(
          "No se pudo recuperar la auditoría local."
        )
      );
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

// ============================================================
// ELIMINAR AUDITORÍA LOCAL
// ============================================================

export async function eliminarAuditoriaOffline(
  costoId,
  usuarioId
) {
  const db = await abrirDB();

  const clave = `${usuarioId}-${costoId}`;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_AUDITORIAS,
      "readwrite"
    );

    const store =
      transaction.objectStore(
        STORE_AUDITORIAS
      );

    const request =
      store.delete(clave);

    request.onsuccess = () => {
      resolve(true);
    };

    request.onerror = () => {
      reject(
        new Error(
          "No se pudo eliminar la auditoría local."
        )
      );
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

// ============================================================
// REGISTRAR CAMBIO PENDIENTE
// ============================================================

export async function registrarPendienteOffline({
  costoId,
  usuarioId,
  numeroConteo,
  datos,
}) {
  const db = await abrirDB();

  const pendiente = {
    costoId,
    usuarioId,
    numeroConteo,
    datos,
    estado: "pendiente",
    creadoEn: new Date().toISOString(),
    intentos: 0,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_PENDIENTES,
      "readwrite"
    );

    const store =
      transaction.objectStore(
        STORE_PENDIENTES
      );

    const request =
      store.add(pendiente);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(
        new Error(
          "No se pudo registrar el cambio pendiente."
        )
      );
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

// ============================================================
// OBTENER PENDIENTES
// ============================================================

export async function obtenerPendientesOffline({
  costoId = null,
  usuarioId = null,
} = {}) {
  const db = await abrirDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_PENDIENTES,
      "readonly"
    );

    const store =
      transaction.objectStore(
        STORE_PENDIENTES
      );

    const request =
      store.getAll();

    request.onsuccess = () => {
      let datos =
        request.result || [];

      if (costoId !== null) {
        datos = datos.filter(
          (item) =>
            item.costoId === costoId
        );
      }

      if (usuarioId !== null) {
        datos = datos.filter(
          (item) =>
            item.usuarioId === usuarioId
        );
      }

      resolve(datos);
    };

    request.onerror = () => {
      reject(
        new Error(
          "No se pudieron obtener los cambios pendientes."
        )
      );
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

// ============================================================
// ELIMINAR PENDIENTE
// ============================================================

export async function eliminarPendienteOffline(
  pendienteId
) {
  const db = await abrirDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_PENDIENTES,
      "readwrite"
    );

    const store =
      transaction.objectStore(
        STORE_PENDIENTES
      );

    const request =
      store.delete(pendienteId);

    request.onsuccess = () => {
      resolve(true);
    };

    request.onerror = () => {
      reject(
        new Error(
          "No se pudo eliminar el pendiente."
        )
      );
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

// ============================================================
// ACTUALIZAR PENDIENTE
// ============================================================

export async function actualizarPendienteOffline(
  pendienteId,
  cambios = {}
) {
  const db = await abrirDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_PENDIENTES,
      "readwrite"
    );

    const store =
      transaction.objectStore(
        STORE_PENDIENTES
      );

    const request =
      store.get(pendienteId);

    request.onsuccess = () => {
      const pendiente =
        request.result;

      if (!pendiente) {
        reject(
          new Error(
            "No se encontró el pendiente."
          )
        );

        return;
      }

      const actualizado = {
        ...pendiente,
        ...cambios,
      };

      store.put(actualizado);

      resolve(actualizado);
    };

    request.onerror = () => {
      reject(
        new Error(
          "No se pudo actualizar el pendiente."
        )
      );
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

// ============================================================
// CONTAR PENDIENTES
// ============================================================

export async function contarPendientesOffline({
  costoId = null,
  usuarioId = null,
} = {}) {
  const pendientes =
    await obtenerPendientesOffline({
      costoId,
      usuarioId,
    });

  return pendientes.length;
}

// ============================================================
// ESTADO DE CONEXIÓN
// ============================================================

export function estaOnline() {
  return navigator.onLine;
}

// ============================================================
// ESCUCHAR CAMBIO DE CONEXIÓN
// ============================================================

export function escucharConexion({
  alConectar,
  alDesconectar,
} = {}) {
  const handleOnline = () => {
    if (
      typeof alConectar ===
      "function"
    ) {
      alConectar();
    }
  };

  const handleOffline = () => {
    if (
      typeof alDesconectar ===
      "function"
    ) {
      alDesconectar();
    }
  };

  window.addEventListener(
    "online",
    handleOnline
  );

  window.addEventListener(
    "offline",
    handleOffline
  );

  return () => {
    window.removeEventListener(
      "online",
      handleOnline
    );

    window.removeEventListener(
      "offline",
      handleOffline
    );
  };
}