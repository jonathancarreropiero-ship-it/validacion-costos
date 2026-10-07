import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import "./DetalleCosto.css";

export default function DetalleCosto({ costo, onVolver }) {
  const [detalles, setDetalles] = useState([]);
  const [conteos, setConteos] = useState([]);
  const [itemsConteo, setItemsConteo] = useState([]);
  const [noManifestados, setNoManifestados] = useState([]);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [filtro, setFiltro] = useState("todos");

  const [modalAbierto, setModalAbierto] = useState(false);
  const [conteoSeleccionado, setConteoSeleccionado] = useState(null);
  const [detalleSeleccionado, setDetalleSeleccionado] = useState(null);

  useEffect(() => {
    if (!costo?.id) return;

    cargarDetalle();
  }, [costo?.id]);

  async function cargarDetalle() {
    try {
      setCargando(true);
      setError("");

      // =====================================================
      // 1. OBTENER DETALLES DEL COSTO
      // =====================================================
      const { data: detallesData, error: detallesError } =
        await supabase
          .from("detalle_costos")
          .select(`
            id,
            costo_id,
            sku,
            descripcion,
            um,
            ubicacion,
            cantidad_fisica
          `)
          .eq("costo_id", costo.id)
          .order("id", { ascending: true });

      if (detallesError) {
        throw detallesError;
      }

      // =====================================================
      // 2. OBTENER TODOS LOS CONTEOS
      // =====================================================
      const detalleIds = (detallesData || []).map(
        (detalle) => detalle.id
      );

      let conteosData = [];

      if (detalleIds.length > 0) {
        const { data, error: conteosError } =
          await supabase
            .from("conteos")
            .select(`
              id,
              detalle_costo_id,
              numero_conteo,
              factor,
              cantidad_total,
              cantidad_final,
              resultado,
              auditor_id
            `)
            .in("detalle_costo_id", detalleIds)
            .order("numero_conteo", {
              ascending: true,
            });

        if (conteosError) {
          throw conteosError;
        }

        conteosData = data || [];
      }

      // =====================================================
      // 3. OBTENER AUDITOR DE CADA CONTEO
      // =====================================================
      const conteosConAuditor = await Promise.all(
        conteosData.map(async (conteo) => {
          if (!conteo.auditor_id) {
            return {
              ...conteo,
              auditor_email: "Sin auditor",
            };
          }

          const { data: email, error: emailError } =
            await supabase.rpc(
              "obtener_auditor_email",
              {
                p_auditor_id: conteo.auditor_id,
              }
            );

          if (emailError) {
            console.error(
              "Error obteniendo correo del auditor:",
              conteo.auditor_id,
              emailError
            );

            return {
              ...conteo,
              auditor_email: "No disponible",
            };
          }

          return {
            ...conteo,
            auditor_email:
              email || "Usuario no encontrado",
          };
        })
      );

      // =====================================================
      // 4. OBTENER TODOS LOS ITEMS DE LOS CONTEOS
      // =====================================================
      const conteoIds = conteosConAuditor.map(
        (conteo) => conteo.id
      );

      let itemsData = [];

      if (conteoIds.length > 0) {
        const { data, error: itemsError } =
          await supabase
            .from("conteo_items")
            .select(`
              id,
              conteo_id,
              item_numero,
              cantidad
            `)
            .in("conteo_id", conteoIds)
            .order("item_numero", {
              ascending: true,
            });

        if (itemsError) {
          throw itemsError;
        }

        itemsData = data || [];
      }

      // =====================================================
      // 5. OBTENER SKUS NO MANIFESTADOS
      // =====================================================
      const {
        data: noManifestadosData,
        error: noManifestadosError,
      } = await supabase
        .from("no_manifestados")
        .select(`
          id,
          costo_id,
          sku,
          cantidad,
          observacion,
          auditor_id
        `)
        .eq("costo_id", costo.id)
        .order("id", { ascending: true });

      if (noManifestadosError) {
        throw noManifestadosError;
      }

      // =====================================================
      // 6. OBTENER CORREO DEL AUDITOR
      // =====================================================
      const noManifestadosConAuditor =
        await Promise.all(
          (noManifestadosData || []).map(
            async (item) => {
              if (!item.auditor_id) {
                return {
                  ...item,
                  auditor_email: "Sin auditor",
                };
              }

              const { data: email, error: emailError } =
                await supabase.rpc(
                  "obtener_auditor_email",
                  {
                    p_auditor_id: item.auditor_id,
                  }
                );

              if (emailError) {
                console.error(
                  "Error obteniendo correo del auditor:",
                  item.auditor_id,
                  emailError
                );

                return {
                  ...item,
                  auditor_email: "No disponible",
                };
              }

              return {
                ...item,
                auditor_email:
                  email || "Usuario no encontrado",
              };
            }
          )
        );

      // =====================================================
      // 7. GUARDAR DATOS
      // =====================================================
      setDetalles(detallesData || []);
      setConteos(conteosConAuditor);
      setItemsConteo(itemsData);
      setNoManifestados(
        noManifestadosConAuditor
      );
    } catch (err) {
      console.error(
        "Error cargando detalle del costo:",
        err
      );

      setError(
        err?.message ||
          "Ocurrió un error al cargar los detalles del costo."
      );
    } finally {
      setCargando(false);
    }
  }

  // =========================================================
  // OBTENER LOS CONTEOS DE UN PRODUCTO
  // =========================================================
  function obtenerConteosDetalle(detalleId) {
    return conteos
      .filter(
        (conteo) =>
          conteo.detalle_costo_id === detalleId
      )
      .sort(
        (a, b) =>
          a.numero_conteo -
          b.numero_conteo
      );
  }

  // =========================================================
  // OBTENER UN CONTEO ESPECÍFICO
  // =========================================================
  function obtenerConteo(
    detalleId,
    numeroConteo
  ) {
    return (
      conteos.find(
        (conteo) =>
          conteo.detalle_costo_id === detalleId &&
          conteo.numero_conteo === numeroConteo
      ) || null
    );
  }

  // =========================================================
  // OBTENER ITEMS DE UN CONTEO
  // =========================================================
  function obtenerItemsConteo(conteoId) {
    return itemsConteo
      .filter(
        (item) =>
          item.conteo_id === conteoId
      )
      .sort(
        (a, b) =>
          a.item_numero -
          b.item_numero
      );
  }

  // =========================================================
  // OBTENER ÚLTIMO CONTEO
  // =========================================================
  function obtenerUltimoConteo(detalleId) {
    const conteosDetalle =
      obtenerConteosDetalle(detalleId);

    if (conteosDetalle.length === 0) {
      return null;
    }

    return conteosDetalle[
      conteosDetalle.length - 1
    ];
  }

  // =========================================================
  // FILTRO
  // =========================================================
  const detallesFiltrados = useMemo(() => {
    return detalles.filter((detalle) => {
      const ultimoConteo =
        obtenerUltimoConteo(detalle.id);

      if (filtro === "todos") {
        return true;
      }

      if (filtro === "conformes") {
        return (
          ultimoConteo?.resultado ===
          "conforme"
        );
      }

      if (filtro === "no_conformes") {
        return (
          ultimoConteo?.resultado ===
          "diferencia"
        );
      }

      return true;
    });
  }, [detalles, conteos, filtro]);

  // =========================================================
  // RESUMEN
  // =========================================================
  const resumen = useMemo(() => {
    let sinConteo = 0;
    let conformes = 0;
    let noConformes = 0;

    detalles.forEach((detalle) => {
      const ultimoConteo =
        obtenerUltimoConteo(detalle.id);

      if (!ultimoConteo) {
        sinConteo++;
      } else if (
        ultimoConteo.resultado ===
        "conforme"
      ) {
        conformes++;
      } else if (
        ultimoConteo.resultado ===
        "diferencia"
      ) {
        noConformes++;
      }
    });

    return {
      total: detalles.length,
      conformes,
      noConformes,
      sinConteo,
    };
  }, [detalles, conteos]);

  // =========================================================
  // ABRIR MODAL
  // =========================================================
  function abrirModal(detalle, conteo) {
    setDetalleSeleccionado(detalle);
    setConteoSeleccionado(conteo);
    setModalAbierto(true);
  }

  // =========================================================
  // CERRAR MODAL
  // =========================================================
  function cerrarModal() {
    setModalAbierto(false);
    setDetalleSeleccionado(null);
    setConteoSeleccionado(null);
  }

  // =========================================================
  // RESULTADO
  // =========================================================
  function textoResultado(resultado) {
    if (resultado === "conforme") {
      return "CONFORME";
    }

    if (resultado === "diferencia") {
      return "NO CONFORME";
    }

    return "—";
  }

  function claseResultado(resultado) {
    if (resultado === "conforme") {
      return "resultado conforme";
    }

    if (resultado === "diferencia") {
      return "resultado diferencia";
    }

    return "resultado vacio";
  }

  // =========================================================
  // ESTADO DEL COSTO
  // =========================================================
  function textoEstado(estado) {
    if (estado === "terminado") {
      return "TERMINADO";
    }

    if (estado === "en_proceso") {
      return "EN PROCESO";
    }

    return "PENDIENTE";
  }

  function claseEstado(estado) {
    if (estado === "terminado") {
      return "estado-costo estado-terminado";
    }

    if (estado === "en_proceso") {
      return "estado-costo estado-proceso";
    }

    return "estado-costo estado-pendiente";
  }

  // =========================================================
  // CARGANDO
  // =========================================================
  if (cargando) {
    return (
      <div className="detalle-costo-container">

        <div className="detalle-cargando">

          <div className="spinner"></div>

          <div>
            <span className="section-kicker">
              VALIDACIÓN DE COSTOS
            </span>

            <p>
              Cargando detalles del costo...
            </p>
          </div>

        </div>

      </div>
    );
  }

  // =========================================================
  // ERROR
  // =========================================================
  if (error) {
    return (
      <div className="detalle-costo-container">

        <button
          className="btn-volver"
          onClick={onVolver}
          type="button"
        >
          <span>←</span>
          Volver a costos
        </button>

        <div className="detalle-error">

          <div className="detalle-error-icon">
            !
          </div>

          <div>
            <span className="section-kicker">
              ERROR DE CARGA
            </span>

            <strong>
              No se pudo cargar el detalle
            </strong>

            <p>{error}</p>

            <button
              onClick={cargarDetalle}
              className="btn-reintentar"
              type="button"
            >
              Reintentar
            </button>
          </div>

        </div>

      </div>
    );
  }

  return (
    <div className="detalle-costo-container">

      {/* =====================================================
          CABECERA PRINCIPAL
      ====================================================== */}
      <header className="detalle-header">

        <div className="detalle-heading-content">

          <button
            className="btn-volver"
            onClick={onVolver}
            type="button"
          >
            <span>←</span>
            Volver a costos
          </button>

          <div className="detalle-heading-row">

            <div className="detalle-title-block">

              <span className="detalle-kicker">
                GESTIÓN DE COSTO
              </span>

              <div className="detalle-title-line">

                <h1>
                  Detalle del costo
                </h1>

                <span
                  className={claseEstado(
                    costo?.estado
                  )}
                >
                  <span className="estado-dot" />
                  {textoEstado(
                    costo?.estado
                  )}
                </span>

                {costo?.resultado && (
                  <span
                    className={
                      costo.resultado ===
                      "conforme"
                        ? "estado-costo estado-resultado-conforme"
                        : "estado-costo estado-diferencia"
                    }
                  >
                    <span className="estado-dot" />

                    {costo.resultado ===
                    "conforme"
                      ? "CONFORME"
                      : "NO CONFORME"}
                  </span>
                )}

              </div>

              <p className="detalle-subtitle">
                Consulta el resultado de los
                conteos, auditores y líneas
                auditadas.
              </p>

            </div>

            <div className="costo-info">

              <span className="costo-numero-label">
                N.º COSTO
              </span>

              <strong className="costo-numero">
                {costo?.numero_costo || "—"}
              </strong>

              <span className="costo-info-linea">
                {resumen.total}{" "}
                {resumen.total === 1
                  ? "línea registrada"
                  : "líneas registradas"}
              </span>

            </div>

          </div>

        </div>

      </header>


      {/* =====================================================
          PANEL GENERAL
      ====================================================== */}
      <section className="detalle-overview-grid">

        {/* ===================================================
            RESUMEN
        ==================================================== */}
        <div className="detalle-resumen-panel">

          <div className="detalle-panel-header">

            <div>
              <span className="section-kicker">
                RESUMEN
              </span>

              <h2>
                Estado del costo
              </h2>

              <p>
                Indicadores generales de las
                líneas auditadas.
              </p>
            </div>

            <div className="detalle-panel-icon resumen-panel-icon">
              ✓
            </div>

          </div>

          <div className="resumen-grid">

            <div className="resumen-item resumen-total">

              <div className="resumen-icon">
                #
              </div>

              <div className="resumen-item-content">

                <span className="resumen-label">
                  Total líneas
                </span>

                <strong>
                  {resumen.total}
                </strong>

              </div>

            </div>

            <div className="resumen-item resumen-conforme">

              <div className="resumen-icon">
                ✓
              </div>

              <div className="resumen-item-content">

                <span className="resumen-label">
                  Conformes
                </span>

                <strong className="texto-conforme">
                  {resumen.conformes}
                </strong>

              </div>

            </div>

            <div className="resumen-item resumen-diferencia">

              <div className="resumen-icon">
                !
              </div>

              <div className="resumen-item-content">

                <span className="resumen-label">
                  No conformes
                </span>

                <strong className="texto-diferencia">
                  {resumen.noConformes}
                </strong>

              </div>

            </div>

            <div className="resumen-item resumen-sin-conteo">

              <div className="resumen-icon">
                ○
              </div>

              <div className="resumen-item-content">

                <span className="resumen-label">
                  Sin conteo
                </span>

                <strong>
                  {resumen.sinConteo}
                </strong>

              </div>

            </div>

          </div>

        </div>


        {/* ===================================================
            AUDITORES
        ==================================================== */}
        <div className="detalle-auditores-panel">

          <div className="detalle-panel-header">

            <div>
              <span className="section-kicker">
                SEGUIMIENTO
              </span>

              <h2>
                Auditorías
              </h2>

              <p>
                Estado de cada etapa de conteo.
              </p>
            </div>

            <div className="detalle-panel-icon auditor-panel-icon">
              👤
            </div>

          </div>

          <div className="auditores-grid">

            {[1, 2, 3].map(
              (numeroConteo) => {

                const conteosDelNumero =
                  conteos.filter(
                    (conteo) =>
                      conteo.numero_conteo ===
                      numeroConteo
                  );

                const auditores = [
                  ...new Map(
                    conteosDelNumero
                      .filter(
                        (conteo) =>
                          conteo.auditor_email
                      )
                      .map((conteo) => [
                        conteo.auditor_id,
                        conteo.auditor_email,
                      ])
                  ).values(),
                ];

                const realizado =
                  conteosDelNumero.length > 0;

                return (
                  <div
                    className={`auditor-card ${
                      realizado
                        ? "realizado"
                        : "pendiente"
                    }`}
                    key={numeroConteo}
                  >

                    <div className="auditor-card-header">

                      <div className="auditor-count-title">

                        <span className="auditor-count-number">
                          {numeroConteo}
                        </span>

                        <div>

                          <span className="auditor-count-label">
                            ETAPA
                          </span>

                          <strong>
                            Conteo {numeroConteo}
                          </strong>

                        </div>

                      </div>

                      {realizado ? (
                        <span className="auditor-realizado">
                          <span className="auditor-status-dot" />
                          REALIZADO
                        </span>
                      ) : (
                        <span className="auditor-pendiente">
                          <span className="auditor-status-dot" />
                          PENDIENTE
                        </span>
                      )}

                    </div>

                    <div className="auditor-card-separator" />

                    {auditores.length === 0 ? (

                      <div className="auditor-sin-datos">

                        <span className="auditor-sin-datos-icon">
                          ○
                        </span>

                        <div>
                          <strong>
                            Sin auditor
                          </strong>

                          <span>
                            Esta etapa todavía no registra actividad.
                          </span>
                        </div>

                      </div>

                    ) : (

                      <div className="auditor-lista">

                        <span className="auditor-lista-label">
                          AUDITORES
                        </span>

                        {auditores.map(
                          (
                            auditor,
                            index
                          ) => (

                            <div
                              className="auditor-item"
                              key={`${numeroConteo}-${index}`}
                            >

                              <span className="auditor-punto">
                                ●
                              </span>

                              <span>
                                {auditor}
                              </span>

                            </div>

                          )
                        )}

                      </div>

                    )}

                  </div>
                );
              }
            )}

          </div>

        </div>

      </section>


      {/* =====================================================
          SEPARADOR VISUAL
      ====================================================== */}
      <div className="detalle-section-divider">
        <span />
      </div>


      {/* =====================================================
          FILTROS / HERRAMIENTAS
      ====================================================== */}
      <section className="filtros-container">

        <div className="filtro-heading">

          <div>

            <span className="section-kicker">
              HERRAMIENTAS
            </span>

            <span className="filtro-titulo">
              Filtrar líneas
            </span>

            <span className="filtro-subtitulo">
              Consulta rápidamente los productos
              según su resultado.
            </span>

          </div>

          <div className="filtros-buttons">

            <button
              type="button"
              className={
                filtro === "todos"
                  ? "filtro-btn activo"
                  : "filtro-btn"
              }
              onClick={() =>
                setFiltro("todos")
              }
            >
              <span className="filtro-btn-icon">
                ≡
              </span>

              <span>
                Todos
              </span>

              <span className="filtro-btn-count">
                {resumen.total}
              </span>

            </button>

            <button
              type="button"
              className={
                filtro === "conformes"
                  ? "filtro-btn activo filtro-conforme"
                  : "filtro-btn"
              }
              onClick={() =>
                setFiltro("conformes")
              }
            >
              <span className="filtro-btn-icon">
                ✓
              </span>

              <span>
                Conformes
              </span>

              <span className="filtro-btn-count">
                {resumen.conformes}
              </span>

            </button>

            <button
              type="button"
              className={
                filtro === "no_conformes"
                  ? "filtro-btn activo filtro-diferencia"
                  : "filtro-btn"
              }
              onClick={() =>
                setFiltro("no_conformes")
              }
            >
              <span className="filtro-btn-icon">
                !
              </span>

              <span>
                No conformes
              </span>

              <span className="filtro-btn-count">
                {resumen.noConformes}
              </span>

            </button>

          </div>

        </div>

      </section>


      {/* =====================================================
          TABLA PRINCIPAL
      ====================================================== */}
      <section className="detalle-tabla-section">

        <div className="detalle-tabla-heading">

          <div>

            <span className="section-kicker">
              DETALLE DE PRODUCTOS
            </span>

            <h2>
              Líneas del costo
            </h2>

            <p>
              Consulta individual de productos y
              resultados de cada conteo.
            </p>

          </div>

          <div className="detalle-tabla-heading-tools">

            <span className="detalle-tabla-total">
              {detallesFiltrados.length}{" "}
              {detallesFiltrados.length === 1
                ? "línea"
                : "líneas"}
            </span>

          </div>

        </div>

        <div className="tabla-wrapper">

          <table className="tabla-detalle">

            <thead>
              <tr>
                <th>SKU</th>
                <th>Descripción</th>
                <th>Ubicación</th>
                <th>UM</th>
                <th>Cantidad lógica</th>
                <th>Conteo 1</th>
                <th>Conteo 2</th>
                <th>Conteo 3</th>
                <th>Resultado final</th>
              </tr>
            </thead>

            <tbody>

              {detallesFiltrados.length === 0 ? (

                <tr>
                  <td
                    colSpan="9"
                    className="tabla-vacia"
                  >

                    <div className="tabla-vacia-icon">
                      —
                    </div>

                    <strong>
                      No existen productos
                    </strong>

                    <span>
                      No hay líneas para el
                      filtro seleccionado.
                    </span>

                  </td>
                </tr>

              ) : (

                detallesFiltrados.map(
                  (detalle) => {

                    const conteo1 =
                      obtenerConteo(
                        detalle.id,
                        1
                      );

                    const conteo2 =
                      obtenerConteo(
                        detalle.id,
                        2
                      );

                    const conteo3 =
                      obtenerConteo(
                        detalle.id,
                        3
                      );

                    const ultimoConteo =
                      obtenerUltimoConteo(
                        detalle.id
                      );

                    return (
                      <tr
                        key={detalle.id}
                      >

                        <td className="sku-cell">
                          <span>
                            {detalle.sku}
                          </span>
                        </td>

                        <td className="descripcion-cell">
                          {detalle.descripcion ||
                            "—"}
                        </td>

                        <td>
                          <span className="ubicacion-detalle">
                            {detalle.ubicacion ||
                              "—"}
                          </span>
                        </td>

                        <td>
                          <span className="um-detalle">
                            {detalle.um || "—"}
                          </span>
                        </td>

                        <td className="cantidad-logica">
                          {detalle.cantidad_fisica ??
                            "—"}
                        </td>

                        <td>
                          <CeldaConteo
                            conteo={conteo1}
                            numeroConteo={1}
                            detalle={detalle}
                            abrirModal={
                              abrirModal
                            }
                            obtenerItemsConteo={
                              obtenerItemsConteo
                            }
                            textoResultado={
                              textoResultado
                            }
                            claseResultado={
                              claseResultado
                            }
                          />
                        </td>

                        <td>
                          <CeldaConteo
                            conteo={conteo2}
                            numeroConteo={2}
                            detalle={detalle}
                            abrirModal={
                              abrirModal
                            }
                            obtenerItemsConteo={
                              obtenerItemsConteo
                            }
                            textoResultado={
                              textoResultado
                            }
                            claseResultado={
                              claseResultado
                            }
                          />
                        </td>

                        <td>
                          <CeldaConteo
                            conteo={conteo3}
                            numeroConteo={3}
                            detalle={detalle}
                            abrirModal={
                              abrirModal
                            }
                            obtenerItemsConteo={
                              obtenerItemsConteo
                            }
                            textoResultado={
                              textoResultado
                            }
                            claseResultado={
                              claseResultado
                            }
                          />
                        </td>

                        <td>

                          {ultimoConteo ? (

                            <span
                              className={claseResultado(
                                ultimoConteo.resultado
                              )}
                            >

                              <span className="resultado-dot" />

                              {textoResultado(
                                ultimoConteo.resultado
                              )}

                            </span>

                          ) : (

                            <span className="resultado vacio">
                              SIN CONTEO
                            </span>

                          )}

                        </td>

                      </tr>
                    );
                  }
                )
              )}

            </tbody>

          </table>

        </div>

      </section>


      {/* =====================================================
          SEPARADOR VISUAL
      ====================================================== */}
      <div className="detalle-section-divider">
        <span />
      </div>


      {/* =====================================================
          SKUS NO MANIFESTADOS
      ====================================================== */}
      <section className="no-manifestados-section">

        <div className="no-manifestados-header">

          <div>

            <span className="section-kicker">
              REGISTROS ADICIONALES
            </span>

            <h2>
              SKUs no manifestados
            </h2>

            <p>
              Productos encontrados por los
              auditores que no estaban incluidos
              en el manifiesto original.
            </p>

          </div>

          <div className="no-manifestados-total">

            <span>
              TOTAL
            </span>

            <strong>
              {noManifestados.length}
            </strong>

          </div>

        </div>

        {noManifestados.length === 0 ? (

          <div className="no-manifestados-vacio">

            <span className="no-manifestados-vacio-icon">
              ✓
            </span>

            <div>

              <strong>
                Sin registros adicionales
              </strong>

              <span>
                No se registraron SKUs no
                manifestados para este costo.
              </span>

            </div>

          </div>

        ) : (

          <div className="tabla-wrapper">

            <table className="tabla-no-manifestados">

              <thead>
                <tr>
                  <th>#</th>
                  <th>SKU</th>
                  <th>Cantidad</th>
                  <th>Observación</th>
                  <th>Auditor</th>
                </tr>
              </thead>

              <tbody>

                {noManifestados.map(
                  (item, index) => (

                    <tr key={item.id}>

                      <td className="numero-no-manifestado">
                        {index + 1}
                      </td>

                      <td className="sku-no-manifestado">
                        {item.sku || "—"}
                      </td>

                      <td className="cantidad-no-manifestado">
                        {item.cantidad ?? "—"}
                      </td>

                      <td className="observacion-no-manifestado">
                        {item.observacion ||
                          "Sin observación"}
                      </td>

                      <td className="auditor-no-manifestado">
                        {item.auditor_email ||
                          "—"}
                      </td>

                    </tr>
                  )
                )}

              </tbody>

            </table>

          </div>
        )}

      </section>


      {/* =====================================================
          MODAL DETALLE DEL CONTEO
      ====================================================== */}
      {modalAbierto &&
        conteoSeleccionado &&
        detalleSeleccionado && (

          <div
            className="modal-overlay"
            onClick={cerrarModal}
          >

            <div
              className="modal-conteo"
              onClick={(e) =>
                e.stopPropagation()
              }
            >

              {/* =============================================
                  HEADER DEL MODAL
              ============================================== */}
              <div className="modal-header">

                <div>

                  <span className="modal-kicker">
                    HISTORIAL DE CONTEO
                  </span>

                  <h2>
                    Detalle del Conteo{" "}
                    {conteoSeleccionado.numero_conteo}
                  </h2>

                  <div className="modal-producto">

                    <span>
                      SKU
                    </span>

                    <strong>
                      {detalleSeleccionado.sku}
                    </strong>

                  </div>

                  <p>
                    {detalleSeleccionado.descripcion}
                  </p>

                </div>

                <button
                  type="button"
                  className="modal-cerrar"
                  onClick={cerrarModal}
                  aria-label="Cerrar"
                >
                  ×
                </button>

              </div>


              {/* =============================================
                  AUDITOR
              ============================================== */}
              <div className="modal-auditor">

                <div className="modal-auditor-icon">
                  👤
                </div>

                <div>

                  <span className="modal-auditor-label">
                    AUDITOR RESPONSABLE
                  </span>

                  <strong>
                    {conteoSeleccionado.auditor_email ||
                      "Auditor no disponible"}
                  </strong>

                </div>

              </div>


              {/* =============================================
                  RESUMEN DEL CONTEO
              ============================================== */}
              <div className="modal-resumen">

                <div className="modal-resumen-item">

                  <span>
                    Total
                  </span>

                  <strong>
                    {
                      conteoSeleccionado.cantidad_total
                    }
                  </strong>

                </div>

                <div className="modal-resumen-item">

                  <span>
                    Factor
                  </span>

                  <strong>
                    {
                      conteoSeleccionado.factor
                    }
                  </strong>

                </div>

                <div className="modal-resumen-item modal-resumen-final">

                  <span>
                    Final
                  </span>

                  <strong>
                    {
                      conteoSeleccionado.cantidad_final
                    }
                  </strong>

                </div>

                <div className="modal-resumen-item">

                  <span>
                    Resultado
                  </span>

                  <strong
                    className={
                      conteoSeleccionado.resultado ===
                      "conforme"
                        ? "texto-conforme"
                        : "texto-diferencia"
                    }
                  >
                    {textoResultado(
                      conteoSeleccionado.resultado
                    )}
                  </strong>

                </div>

              </div>


              {/* =============================================
                  ITEMS
              ============================================== */}
              <div className="items-conteo">

                <div className="items-conteo-heading">

                  <div>

                    <span className="section-kicker">
                      DETALLE
                    </span>

                    <h3>
                      Cantidades ingresadas
                    </h3>

                  </div>

                  <span className="items-count">

                    {
                      obtenerItemsConteo(
                        conteoSeleccionado.id
                      ).length
                    }{" "}
                    {obtenerItemsConteo(
                      conteoSeleccionado.id
                    ).length === 1
                      ? "ítem"
                      : "ítems"}

                  </span>

                </div>

                {obtenerItemsConteo(
                  conteoSeleccionado.id
                ).length === 0 ? (

                  <div className="sin-items">
                    No se encontraron cantidades
                    individuales.
                  </div>

                ) : (

                  <div className="items-grid">

                    {obtenerItemsConteo(
                      conteoSeleccionado.id
                    ).map((item) => (

                      <div
                        className="item-cantidad"
                        key={item.id}
                      >

                        <span>
                          Ítem {item.item_numero}
                        </span>

                        <strong>
                          {item.cantidad}
                        </strong>

                      </div>

                    ))}

                  </div>

                )}

              </div>


              {/* =============================================
                  FOOTER
              ============================================== */}
              <div className="modal-footer">

                <button
                  type="button"
                  className="btn-cerrar-modal"
                  onClick={cerrarModal}
                >
                  Cerrar
                </button>

              </div>

            </div>

          </div>
        )}

    </div>
  );
}


// =============================================================
// COMPONENTE: CELDA DE CONTEO
// =============================================================
function CeldaConteo({
  conteo,
  numeroConteo,
  detalle,
  abrirModal,
  obtenerItemsConteo,
  textoResultado,
}) {
  // ===========================================================
  // CONTEO NO REALIZADO
  // ===========================================================
  if (!conteo) {
    return (
      <div
        className={`celda-conteo celda-vacia conteo-${numeroConteo}`}
      >

        <div className="conteo-card-header">

          <div className="conteo-card-identidad">

            <span className="conteo-card-numero">
              {numeroConteo}
            </span>

            <div>

              <span className="conteo-card-kicker">
                CONTEO
              </span>

              <strong>
                Conteo {numeroConteo}
              </strong>

            </div>

          </div>

          <span className="conteo-card-estado pendiente">
            PENDIENTE
          </span>

        </div>

        <div className="conteo-card-separator" />

        <div className="conteo-card-pendiente">

          <span className="conteo-pendiente-icon">
            ○
          </span>

          <div>

            <strong>
              Sin registro
            </strong>

            <span>
              Este conteo todavía no ha sido realizado.
            </span>

          </div>

        </div>

      </div>
    );
  }

  const items =
    obtenerItemsConteo(conteo.id);

  const esConforme =
    conteo.resultado === "conforme";

  const esDiferencia =
    conteo.resultado === "diferencia";

  return (
    <div
      className={`celda-conteo conteo-realizado conteo-${numeroConteo} ${
        esConforme
          ? "conteo-conforme"
          : esDiferencia
            ? "conteo-diferencia"
            : ""
      }`}
    >

      {/* =====================================================
          CABECERA
      ====================================================== */}
      <div className="conteo-card-header">

        <div className="conteo-card-identidad">

          <span className="conteo-card-numero">
            {numeroConteo}
          </span>

          <div>

            <span className="conteo-card-kicker">
              CONTEO
            </span>

            <strong>
              Conteo {numeroConteo}
            </strong>

          </div>

        </div>

        <span
          className={`conteo-card-estado ${
            esConforme
              ? "conforme"
              : esDiferencia
                ? "diferencia"
                : "pendiente"
          }`}
        >

          <span className="conteo-estado-dot" />

          {textoResultado(
            conteo.resultado
          )}

        </span>

      </div>


      {/* =====================================================
          SEPARADOR
      ====================================================== */}
      <div className="conteo-card-separator" />


      {/* =====================================================
          MÉTRICAS PRINCIPALES
      ====================================================== */}
      <div className="conteo-card-metricas">

        <div className="conteo-metrica">

          <span>
            TOTAL
          </span>

          <strong>
            {conteo.cantidad_total}
          </strong>

        </div>

        <div className="conteo-metrica conteo-metrica-final">

          <span>
            CANTIDAD FINAL
          </span>

          <strong className="conteo-final-valor">
            {conteo.cantidad_final}
          </strong>

        </div>

      </div>


      {/* =====================================================
          INFORMACIÓN SECUNDARIA
      ====================================================== */}
      <div className="conteo-card-meta">

        <div className="conteo-meta-item">

          <span>
            FACTOR
          </span>

          <strong>
            × {conteo.factor}
          </strong>

        </div>

        <div className="conteo-meta-item">

          <span>
            CANTIDADES
          </span>

          <strong>
            {items.length}
          </strong>

        </div>

      </div>


      {/* =====================================================
          AUDITOR
      ====================================================== */}
      <div className="conteo-card-auditor">

        <span className="conteo-auditor-icon">
          ●
        </span>

        <div>

          <span>
            AUDITOR
          </span>

          <strong
            title={
              conteo.auditor_email ||
              "No disponible"
            }
          >
            {conteo.auditor_email ||
              "No disponible"}
          </strong>

        </div>

      </div>


      {/* =====================================================
          ACCIÓN
      ====================================================== */}
      <button
        type="button"
        className="btn-ver-detalles"
        onClick={() =>
          abrirModal(
            detalle,
            conteo
          )
        }
      >

        <span>
          Ver detalles del conteo
        </span>

        <span className="btn-ver-detalles-arrow">
          →
        </span>

      </button>

    </div>
  );
}