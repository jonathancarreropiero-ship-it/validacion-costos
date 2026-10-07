import { useState } from 'react'
import { supabase } from '../supabaseClient'

function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function iniciarSesion(e) {
    e.preventDefault()

    setError('')
    setLoading(true)

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email,
        password
      })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    console.log(
      'Usuario conectado:',
      data.user
    )

    setLoading(false)

    if (onLogin) {
      onLogin(data.user)
    }
  }

  return (
    <main className="login-page">

      {/* =====================================================
          DECORACIÓN DE FONDO
          ===================================================== */}

      <div
        className="login-background-shape shape-one"
        aria-hidden="true"
      />

      <div
        className="login-background-shape shape-two"
        aria-hidden="true"
      />


      {/* =====================================================
          CONTENEDOR PRINCIPAL
          ===================================================== */}

      <div className="login-wrapper">

        <section
          className="login-card"
          aria-labelledby="login-title"
        >

          {/* =================================================
              MARCA
              ================================================= */}

          <header className="login-brand">

            <div
              className="login-logo"
              aria-hidden="true"
            >
              VC
            </div>

            <div className="login-brand-info">

              <span className="login-brand-kicker">
                SISTEMA INTERNO
              </span>

              <h1>
                Validación de Costos
              </h1>

              <p>
                Sistema de control y auditoría
              </p>

            </div>

          </header>


          {/* =================================================
              ENCABEZADO
              ================================================= */}

          <div className="login-heading">

            <span className="login-badge">
              Acceso al sistema
            </span>

          

          

          </div>


          {/* =================================================
              FORMULARIO
              ================================================= */}

          <form
            className="login-form"
            onSubmit={iniciarSesion}
          >

            {/* ===============================================
                CORREO
                =============================================== */}

            <div className="login-field">

              <label htmlFor="email">
                Correo electrónico
              </label>

              <div className="login-input-wrapper">

                <span
                  className="login-input-icon"
                  aria-hidden="true"
                >
                  @
                </span>

                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="correo@empresa.com"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                  required
                  autoComplete="email"
                  disabled={loading}
                />

              </div>

            </div>


            {/* ===============================================
                CONTRASEÑA
                =============================================== */}

            <div className="login-field">

              <label htmlFor="password">
                Contraseña
              </label>

              <div className="login-input-wrapper">

                <span
                  className="login-input-icon"
                  aria-hidden="true"
                >
                  •
                </span>

                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Ingrese su contraseña"
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                  required
                  autoComplete="current-password"
                  disabled={loading}
                />

              </div>

            </div>


            {/* ===============================================
                ERROR
                =============================================== */}

            {error && (
              <div
                className="login-error"
                role="alert"
              >

                <div
                  className="login-error-icon"
                  aria-hidden="true"
                >
                  !
                </div>

                <div className="login-error-content">

                  <strong>
                    No fue posible iniciar sesión
                  </strong>

                  <p>
                    {error}
                  </p>

                </div>

              </div>
            )}


            {/* ===============================================
                BOTÓN
                =============================================== */}

            <button
              className="login-button"
              type="submit"
              disabled={loading}
            >

              {loading ? (
                <>
                  <span
                    className="login-spinner"
                    aria-hidden="true"
                  />

                  <span>
                    Ingresando...
                  </span>
                </>
              ) : (
                <>
                  <span>
                    Iniciar sesión
                  </span>

                  <span
                    className="login-button-arrow"
                    aria-hidden="true"
                  >
                    →
                  </span>
                </>
              )}

            </button>

          </form>


          {/* =================================================
              FOOTER
              ================================================= */}

          <footer className="login-footer">

            <span
              className="login-footer-line"
              aria-hidden="true"
            />

            <span className="login-footer-label">
              Acceso seguro
            </span>

            <span
              className="login-footer-line"
              aria-hidden="true"
            />

          </footer>

          <p className="login-security">
            Sistema interno de validación y auditoría
          </p>

        </section>

      </div>

    </main>
  )
}

export default Login