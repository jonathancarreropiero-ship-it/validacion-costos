import { useEffect, useState } from 'react'

import { supabase } from '../../supabaseClient'

import CostosAdmin from './CostosAdmin'
import NuevoCosto from './NuevoCosto'


// ==========================================================
// SESIÓN DEL ADMINISTRADOR
// ==========================================================

function obtenerClaveSesionAdmin(usuarioId) {
  return `validacion-costos-admin-${usuarioId}-sesion`
}


function cargarSesionAdmin(usuarioId) {
  if (!usuarioId) {
    return null
  }

  try {
    const clave =
      obtenerClaveSesionAdmin(usuarioId)

    const guardado =
      localStorage.getItem(clave)

    if (!guardado) {
      return null
    }

    const sesion =
      JSON.parse(guardado)

    if (
      !sesion ||
      String(sesion.usuarioId) !==
        String(usuarioId)
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


function guardarSesionAdmin(
  usuarioId,
  datos
) {
  if (!usuarioId) {
    return
  }

  try {
    const clave =
      obtenerClaveSesionAdmin(usuarioId)

    localStorage.setItem(
      clave,
      JSON.stringify({
        usuarioId,
        ...datos,
        updatedAt:
          new Date().toISOString()
      })
    )

  } catch (error) {
    console.error(
      'No se pudo guardar la sesión del administrador:',
      error
    )
  }
}


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

function AdminDashboard({ user }) {

  const [
    vista,
    setVista
  ] = useState('costos')

  const [
    restauracionRealizada,
    setRestauracionRealizada
  ] = useState(false)


  // ========================================================
  // RESTAURAR VISTA PRINCIPAL
  // ========================================================

  useEffect(() => {

    if (
      !user?.id ||
      restauracionRealizada
    ) {
      return
    }

    const sesion =
      cargarSesionAdmin(
        user.id
      )


    // ------------------------------------------------------
    // NUEVO COSTO
    // ------------------------------------------------------

    if (
      sesion?.vista ===
      'nuevo'
    ) {

      setVista(
        'nuevo'
      )

    } else {

      // ----------------------------------------------------
      // COSTOS
      // ----------------------------------------------------

      setVista(
        'costos'
      )
    }


    setRestauracionRealizada(
      true
    )

  }, [
    user,
    restauracionRealizada
  ])


  // ========================================================
  // GUARDAR VISTA PRINCIPAL
  // ========================================================

  useEffect(() => {

    if (
      !user?.id ||
      !restauracionRealizada
    ) {
      return
    }

    const sesion =
      cargarSesionAdmin(
        user.id
      )


    // ------------------------------------------------------
    // IMPORTANTE
    //
    // Si CostosAdmin ya guardó una navegación interna:
    //
    // view = detalle
    // view = conteo
    //
    // NO debemos sobreescribirla con:
    //
    // vista = costos
    // ------------------------------------------------------

    if (
      sesion?.view === 'detalle' ||
      sesion?.view === 'conteo'
    ) {
      return
    }


    guardarSesionAdmin(
      user.id,
      {
        vista
      }
    )

  }, [
    user,
    vista,
    restauracionRealizada
  ])


  // ========================================================
  // CERRAR SESIÓN
  // ========================================================

  async function cerrarSesion() {

    limpiarSesionAdmin(
      user?.id
    )

    await supabase.auth.signOut()

  }


  // ========================================================
  // NUEVO COSTO
  // ========================================================

  function irNuevoCosto() {

    setVista(
      'nuevo'
    )

    guardarSesionAdmin(
      user.id,
      {
        vista: 'nuevo'
      }
    )

  }


  // ========================================================
  // COSTO GUARDADO
  // ========================================================

  function costoGuardado() {

    setVista(
      'costos'
    )

    guardarSesionAdmin(
      user.id,
      {
        vista: 'costos',
        view: 'lista'
      }
    )

  }


  // ========================================================
  // VOLVER A COSTOS
  // ========================================================

  function volverCostos() {

    setVista(
      'costos'
    )

    guardarSesionAdmin(
      user.id,
      {
        vista: 'costos',
        view: 'lista'
      }
    )

  }


  // ========================================================
  // INTERFAZ
  // ========================================================

  return (
    <div className="admin-dashboard">

      {/* ==================================================
          HEADER PRINCIPAL
          ================================================== */}

      <header className="admin-dashboard-header">

        <div className="admin-dashboard-brand">

          <div className="admin-dashboard-brand-mark">
            VC
          </div>

          <div className="admin-dashboard-brand-info">

            <span className="admin-dashboard-kicker">
              VALIDACIÓN
            </span>

            <h1>
              Validación de Costos
            </h1>

          </div>

        </div>


        <div className="admin-dashboard-user">

          <div className="admin-dashboard-user-info">

            <span className="admin-dashboard-user-role">
              Administrador
            </span>

            <span className="admin-dashboard-user-email">
              {user.email}
            </span>

          </div>

          <div className="admin-dashboard-user-avatar">
            {user.email?.charAt(0)?.toUpperCase() || 'A'}
          </div>

          <button
            type="button"
            className="admin-dashboard-logout"
            onClick={cerrarSesion}
            aria-label="Cerrar sesión"
          >
            <span aria-hidden="true">
              ↪
            </span>

            <span>
              Cerrar sesión
            </span>
          </button>

        </div>

      </header>


      {/* ==================================================
          CONTENIDO PRINCIPAL
          ================================================== */}

      <main className="admin-dashboard-main">

        {vista === 'costos' && (
          <>

            <section className="admin-dashboard-page-heading">

              <div className="admin-dashboard-heading-content">

                <span className="admin-dashboard-section-kicker">
                  PANEL DE CONTROL
                </span>

                <h2>
                  Dashboard Administrador
                </h2>

                <p>
                  Gestiona los costos registrados y supervisa
                  los procesos de validación.
                </p>

              </div>


              <button
                type="button"
                className="admin-dashboard-primary-button"
                onClick={irNuevoCosto}
              >
                <span
                  className="admin-dashboard-button-icon"
                  aria-hidden="true"
                >
                  +
                </span>

                <span>
                  Nuevo costo
                </span>
              </button>

            </section>


            <section className="admin-dashboard-content">

              <CostosAdmin
                usuarioId={
                  user.id
                }
              />

            </section>

          </>
        )}


        {vista === 'nuevo' && (

          <section className="admin-dashboard-content admin-dashboard-content-new">

            <NuevoCosto
              onGuardado={
                costoGuardado
              }
              onCancelar={
                volverCostos
              }
            />

          </section>

        )}

      </main>


      {/* ==================================================
          FOOTER
          ================================================== */}

      <footer className="admin-dashboard-footer">

        <span>
          Validación de Costos
        </span>

        <span>
          Panel de administración
        </span>

      </footer>

    </div>
  )
}

export default AdminDashboard