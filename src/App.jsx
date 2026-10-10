import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

import Login from './pages/Login'
import AdminDashboard from './pages/admin/AdminDashboard'
import AuditorDashboard from './pages/auditor/AuditorDashboard'

import { obtenerRolUsuario } from './services/auth'


// ==========================================================
// COMPONENTE
// ==========================================================

function App() {

  const [
    session,
    setSession
  ] = useState(null)

  const [
    role,
    setRole
  ] = useState(null)

  const [
    loading,
    setLoading
  ] = useState(true)

  const [
    roleLoading,
    setRoleLoading
  ] = useState(false)

  const comprobarSesion = useCallback(async () => {
    try {
      const {
        data: { session: sessionActual },
        error
      } = await supabase.auth.getSession()

      if (error) {
        console.error('Error obteniendo sesión:', error)
        setSession(null)
        return
      }

      setSession(sessionActual)
    } catch (error) {
      console.error('Error comprobando sesión:', error)
      setSession(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const cargarRol = useCallback(async () => {
    try {
      setRoleLoading(true)
      console.log('Buscando rol del usuario...')

      const rolUsuario = await obtenerRolUsuario()
      console.log('Rol encontrado:', rolUsuario)
      setRole(rolUsuario)
    } catch (error) {
      console.error('Error obteniendo rol:', error)
      setRole(null)
    } finally {
      setRoleLoading(false)
    }
  }, [])


  // ========================================================
  // SESIÓN DE SUPABASE
  // ========================================================

  useEffect(() => {
    const timer = window.setTimeout(comprobarSesion, 0)

    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange(
      (_event, sessionActual) => {

        console.log(
          'Cambio de autenticación:',
          _event
        )

        setSession(
          sessionActual
        )

        if (!sessionActual) {
          setRole(null)
          setRoleLoading(false)
        }
      }
    )

    return () => {
      window.clearTimeout(timer)
      subscription.unsubscribe()
    }

  }, [comprobarSesion])


  // ========================================================
  // CARGAR ROL
  // ========================================================

  useEffect(() => {

    if (!session) return

    const timer = window.setTimeout(cargarRol, 0)
    return () => window.clearTimeout(timer)

  }, [session, cargarRol])


  // ========================================================
  // CERRAR SESIÓN
  // ========================================================

  async function cerrarSesion() {

    try {

      await supabase.auth.signOut()

      setSession(null)
      setRole(null)

    } catch (error) {

      console.error(
        'Error cerrando sesión:',
        error
      )

    }
  }


  // =========================================================
  // CARGANDO APLICACIÓN
  // =========================================================

  if (loading) {

    return (
      <main className="app-loading-screen">

        <section
          className="app-loading-card"
          aria-live="polite"
        >

          <div
            className="app-loading-logo"
            aria-hidden="true"
          >
            VC
          </div>

          <div
            className="app-spinner"
            aria-hidden="true"
          />

          <div className="app-loading-content">

            <span className="app-loading-kicker">
              VALIDACIÓN DE COSTOS
            </span>

            <h1>
              Cargando aplicación
            </h1>

            <p>
              Estamos preparando el sistema...
            </p>

          </div>

        </section>

      </main>
    )
  }


  // =========================================================
  // SIN SESIÓN
  // =========================================================

  if (!session) {
    return <Login />
  }


  // =========================================================
  // VERIFICANDO ROL
  // =========================================================

  if (roleLoading) {

    return (
      <main className="app-loading-screen">

        <section
          className="app-loading-card app-loading-permissions"
          aria-live="polite"
        >

          <div
            className="app-loading-logo"
            aria-hidden="true"
          >
            VC
          </div>

          <div
            className="app-spinner"
            aria-hidden="true"
          />

          <div className="app-loading-content">

            <span className="app-loading-kicker">
              SEGURIDAD
            </span>

            <h1>
              Verificando permisos
            </h1>

            <p>
              Estamos verificando el rol de tu usuario...
            </p>

          </div>

        </section>

      </main>
    )
  }


  // =========================================================
  // ADMINISTRADOR
  // =========================================================

  if (role === 'admin') {

    return (
      <AdminDashboard
        user={session.user}
      />
    )
  }


  // =========================================================
  // AUDITOR
  // =========================================================

  if (role === 'auditor') {

    return (
      <AuditorDashboard
        user={session.user}
      />
    )
  }


  // =========================================================
  // USUARIO SIN ROL
  // =========================================================

  return (
    <main className="app-loading-screen">

      <section
        className="no-role-card"
        aria-labelledby="no-role-title"
      >

        <div
          className="no-role-icon"
          aria-hidden="true"
        >
          !
        </div>

        <div className="no-role-heading">

          <span className="no-role-kicker">
            ACCESO RESTRINGIDO
          </span>

          <h1 id="no-role-title">
            Usuario sin rol asignado
          </h1>

          <p>
            El usuario inició sesión correctamente,
            pero todavía no tiene un rol asignado
            dentro del sistema.
          </p>

        </div>


        <div className="no-role-user">

          <span>
            Usuario conectado
          </span>

          <strong>
            {session.user.email}
          </strong>

        </div>


        <button
          type="button"
          className="logout-button"
          onClick={cerrarSesion}
        >
          <span aria-hidden="true">
            ↪
          </span>

          <span>
            Cerrar sesión
          </span>
        </button>

      </section>

    </main>
  )
}

export default App
