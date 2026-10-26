import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import { notificarCambioCosto } from "../../services/sincronizacionCostos";
import ValidationNotice from "../../components/ValidationNotice";
import ReconteoNoManifestados from "../../components/ReconteoNoManifestados";
import "./DetalleCosto.css";

function clasificarDetalleConConteos(detalle, conteos) {
  const conteosDetalle = (conteos || [])
    .filter((conteo) => conteo.detalle_costo_id === detalle.id)
    .sort((a, b) => a.numero_conteo - b.numero_conteo);
  const ultimoConteo = conteosDetalle[conteosDetalle.length - 1];

  const cantidadLogica = Number(detalle.cantidad_fisica ?? 0);
  if (!ultimoConteo) {
    return { tipo: "sin_conteo", diferencia: null, cantidadLogica, cantidadAuditor: null };
  }

  const cantidadAuditor = Number(ultimoConteo.cantidad_final ?? 0);
  const diferencia = cantidadAuditor - cantidadLogica;
  return {
    tipo: diferencia === 0 ? "conforme" : diferencia > 0 ? "sobrante" : "faltante",
    diferencia,
    cantidadLogica,
    cantidadAuditor,
  };
}

function lineaTieneFactorModificado(detalle, conteos) {
  const factorPlantilla = Number(detalle?.factor) > 0 ? Number(detalle.factor) : 1;
  return (conteos || []).some((conteo) => {
    if (conteo.detalle_costo_id !== detalle.id) return false;
    const factorAplicado = Number(conteo.factor) > 0 ? Number(conteo.factor) : factorPlantilla;
    return factorAplicado !== factorPlantilla;
  });
}

function obtenerCambiosFactor(detalles, conteos) {
  return (detalles || []).flatMap((detalle) => {
    const factorPlantilla = Number(detalle?.factor) > 0 ? Number(detalle.factor) : 1;
    const cambios = (conteos || [])
      .filter((conteo) => conteo.detalle_costo_id === detalle.id)
      .sort((a, b) => a.numero_conteo - b.numero_conteo)
      .flatMap((conteo) => {
        const factorAplicado = Number(conteo.factor) > 0 ? Number(conteo.factor) : factorPlantilla;
        return factorAplicado !== factorPlantilla
          ? [{ numeroConteo: conteo.numero_conteo, factorPlantilla, factorAplicado }]
          : [];
      });
    return cambios.length ? [{ id: detalle.id, sku: detalle.sku, cambios }] : [];
  });
}

export default function DetalleCosto({ costo, onVolver }) {
  const [detalles, setDetalles] = useState([]);
  const [conteos, setConteos] = useState([]);
  const [itemsConteo, setItemsConteo] = useState([]);
  const [noManifestados, setNoManifestados] = useState([]);
  const [reconteosNoManifestados, setReconteosNoManifestados] = useState([]);
  const [reconteoSeleccionado, setReconteoSeleccionado] = useState(null);
  const [avisoReconteo, setAvisoReconteo] = useState("");
  const [validacionApoyo, setValidacionApoyo] = useState(null);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [exportando, setExportando] = useState(false);
  const [errorExportacion, setErrorExportacion] = useState("");

  const [filtro, setFiltro] = useState("todos");
  const [modalFactoresAbierto, setModalFactoresAbierto] = useState(false);
  const modalFactoresCostoVisto = useRef(null);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [conteoSeleccionado, setConteoSeleccionado] = useState(null);
  const [detalleSeleccionado, setDetalleSeleccionado] = useState(null);

  const cargarDetalle = useCallback(async () => {
    await Promise.resolve();
    if (!costo?.id) return;
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
            factor,
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
              auditor_id,
              created_at
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

      // Cargar líneas, no manifestados y cantidades en paralelo tras obtener IDs.
      const conteoIds = conteosData.map(conteo => conteo.id);
      const [respuestaItems, respuestaNoManifestados] = await Promise.all([
        conteoIds.length
          ? supabase.from("conteo_items").select("id, conteo_id, item_numero, cantidad").in("conteo_id", conteoIds).order("item_numero", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        supabase.from("no_manifestados").select("id, costo_id, sku, cantidad, observacion, auditor_id").eq("costo_id", costo.id).order("id", { ascending: true })
      ]);

      if (respuestaItems.error) throw respuestaItems.error;
      if (respuestaNoManifestados.error) throw respuestaNoManifestados.error;

      const { data: reconteosNoManifestadosData, error: errorReconteosNoManifestados } = await supabase.rpc(
        "resumen_reconteos_no_manifestados_admin",
        { p_costo_id: Number(costo.id) }
      );
      if (errorReconteosNoManifestados) {
        console.info("El detalle de recuentos de no manifestados aún no está disponible:", errorReconteosNoManifestados.message);
      }
      const { data: validacionApoyoData, error: errorValidacionApoyo } = await supabase.rpc(
        "resumen_validacion_apoyo_admin",
        { p_costo_id: Number(costo.id) }
      );
      if (errorValidacionApoyo) console.info("La validación por apoyo aún no está disponible:", errorValidacionApoyo.message);

      const itemsData = respuestaItems.data || [];
      const noManifestadosData = respuestaNoManifestados.data || [];
      const auditorIds = [...new Set([
        ...conteosData.map(conteo => conteo.auditor_id),
        ...noManifestadosData.map(item => item.auditor_id),
        ...(reconteosNoManifestadosData || []).map(item => item.auditor_id),
        validacionApoyoData?.solicitante_id,
        validacionApoyoData?.validador_id,
        ...(validacionApoyoData?.lineas || []).map(linea => linea.auditor_id),
        ...(validacionApoyoData?.no_manifestados || []).map(linea => linea.auditor_id)
      ].filter(Boolean).map(String))];

      const respuestasAuditores = await Promise.all(auditorIds.map(async auditorId => {
        const { data, error: errorCorreo } = await supabase.rpc(
          "obtener_auditor_email",
          { p_auditor_id: auditorId }
        );
        if (errorCorreo) {
          console.error("Error obteniendo correo del auditor:", auditorId, errorCorreo);
          return [auditorId, "No disponible"];
        }
        return [auditorId, data || "Usuario no encontrado"];
      }));
      const emailPorAuditor = new Map(respuestasAuditores);
      const conteosConAuditor = conteosData.map(conteo => ({
        ...conteo,
        auditor_email: conteo.auditor_id ? emailPorAuditor.get(String(conteo.auditor_id)) : "Sin auditor"
      }));
      const noManifestadosConAuditor = noManifestadosData.map(item => ({
        ...item,
        auditor_email: item.auditor_id ? emailPorAuditor.get(String(item.auditor_id)) : "Sin auditor"
      }));
      const reconteosConAuditor = (reconteosNoManifestadosData || []).map(item => ({
        ...item,
        auditor_email: item.auditor_id ? emailPorAuditor.get(String(item.auditor_id)) : "—"
      }));
      const validacionApoyoConUsuarios = validacionApoyoData ? {
        ...validacionApoyoData,
        solicitante_email: emailPorAuditor.get(String(validacionApoyoData.solicitante_id)) || "—",
        validador_email: emailPorAuditor.get(String(validacionApoyoData.validador_id)) || "—",
        lineas: (validacionApoyoData.lineas || []).map(linea => ({
          ...linea,
          auditor_email: emailPorAuditor.get(String(linea.auditor_id)) || "—"
        })),
        no_manifestados: (validacionApoyoData.no_manifestados || []).map(linea => ({
          ...linea,
          auditor_email: emailPorAuditor.get(String(linea.auditor_id)) || "—"
        }))
      } : null;

      // =====================================================
      // 7. GUARDAR DATOS
      // =====================================================
      setDetalles(detallesData || []);
      setConteos(conteosConAuditor);
      setItemsConteo(itemsData);
      setReconteosNoManifestados(reconteosConAuditor);
      setValidacionApoyo(validacionApoyoConUsuarios);
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
  }, [costo]);

  async function habilitarReconteoNoManifestado(item, numeroConteo) {
    setAvisoReconteo("");
    const { error: errorHabilitar } = await supabase.rpc("habilitar_reconteo_no_manifestado", {
      p_costo_id: Number(costo.id),
      p_sku: String(item.sku || ""),
      p_numero_conteo: Number(numeroConteo)
    });
    if (errorHabilitar) {
      setAvisoReconteo(errorHabilitar.message || "No se pudo habilitar el recuento del SKU.");
      return;
    }
    notificarCambioCosto(costo.id, 'no_manifestados_habilitados')
    await cargarDetalle();
  }

  useEffect(() => {
    const timer = window.setTimeout(() => cargarDetalle(), 0)
    return () => window.clearTimeout(timer)
  }, [cargarDetalle]);

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
  // CLASIFICAR RESULTADO FINAL
  //
  // cantidad lógica = cantidad_fisica
  // cantidad auditor = cantidad_final
  //
  // Ejemplo:
  // 10 lógico / 15 auditor = +5 SOBRANTE
  // 10 lógico /  7 auditor = -3 FALTANTE
  // 10 lógico / 10 auditor = CONFORME
  // =========================================================
  function obtenerClasificacion(detalle) {
    return clasificarDetalleConConteos(detalle, conteos);
  }

  async function exportarCostoExcel() {
    if (exportando) return;
    setExportando(true);
    setErrorExportacion("");
    try {
      const moduloXLSX = await import("@sitelevelai/xlsx-js-style");
      const XLSX = moduloXLSX.default || moduloXLSX;
      const color = {
        navy: "FF173B72",
        blue: "FF2D5EAA",
        pale: "FFEAF1FB",
        paleAlt: "FFF5F8FD",
        border: "FFD4DFEF",
        white: "FFFFFFFF",
        text: "FF1E3150"
      };
      const borderBottom = { style: "thin", color: { rgb: color.border } };
      const styleRange = (sheet, range, styleForCell) => {
        const bounds = XLSX.utils.decode_range(range);
        for (let row = bounds.s.r; row <= bounds.e.r; row += 1) {
          for (let column = bounds.s.c; column <= bounds.e.c; column += 1) {
            const address = XLSX.utils.encode_cell({ r: row, c: column });
            const cell = sheet[address] || { t: "s", v: "" };
            cell.s = typeof styleForCell === "function"
              ? styleForCell(row, column, cell)
              : styleForCell;
            sheet[address] = cell;
          }
        }
      };
      const headerStyle = {
        fill: { patternType: "solid", fgColor: { rgb: color.navy } },
        font: { name: "Aptos", bold: true, color: { rgb: color.white }, sz: 11 },
        alignment: { vertical: "center", horizontal: "center", wrapText: true },
        border: { bottom: { style: "medium", color: { rgb: color.blue } } }
      };
      const titleStyle = {
        fill: { patternType: "solid", fgColor: { rgb: color.navy } },
        font: { name: "Aptos Display", bold: true, color: { rgb: color.white }, sz: 16 },
        alignment: { vertical: "center", horizontal: "left" }
      };
      const bodyStyle = (row, column) => ({
        fill: { patternType: "solid", fgColor: { rgb: row % 2 === 0 ? color.paleAlt : color.white } },
        font: { name: "Aptos", color: { rgb: color.text }, sz: 10, bold: column === 0 },
        alignment: { vertical: "center", horizontal: column === 0 ? "left" : "left", wrapText: true },
        border: { bottom: borderBottom }
      });
      const filas = detalles.map(detalle => {
        const ultimoConteo = obtenerUltimoConteo(detalle.id);
        return {
          sku: detalle.sku || "",
          descripcion: detalle.descripcion || "",
          factor: ultimoConteo?.factor ?? "",
          um: detalle.um || "",
          ubicacion: detalle.ubicacion || "",
          cantidadLogica: detalle.cantidad_fisica ?? "",
          cantidadFisica: ultimoConteo?.cantidad_final ?? "",
          resultado: ultimoConteo?.resultado || ""
        };
      });
      const resultadoCostoNormalizado = String(costo?.resultado || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
      const resultadoCostoTexto = resultadoCostoNormalizado === "conforme"
        ? "CONFORME"
        : ["no_conforme", "diferencia"].includes(resultadoCostoNormalizado)
          ? "NO CONFORME"
          : "PENDIENTE";

      const detalleSheet = XLSX.utils.aoa_to_sheet([
        [`INFORME DE VALIDACIÓN · COSTO ${costo?.numero_costo || ""}`],
        [`Estado: ${textoEstado(costo?.estado)}`, `Resultado: ${resultadoCostoTexto}`],
        [`Líneas: ${filas.length}`, `Fecha de exportación: ${new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(new Date())}`],
        [],
        ["SKU", "Descripción", "Factor", "UM", "Ubicación", "Cantidad lógica", "Cantidad física", "Diferencia", "Resultado"]
      ]);

      filas.forEach((fila, index) => {
        const row = index + 6;
        const cantidadesDisponibles = fila.cantidadLogica !== "" && fila.cantidadFisica !== "";
        const diferenciaInicial = cantidadesDisponibles
          ? Number(fila.cantidadFisica) - Number(fila.cantidadLogica)
          : "";
        const resultadoInicial = !cantidadesDisponibles
          ? "SIN CONTEO"
          : diferenciaInicial === 0
            ? "CONFORME"
            : diferenciaInicial > 0
              ? "SOBRANTE"
              : "FALTANTE";
        XLSX.utils.sheet_add_aoa(detalleSheet, [[
          fila.sku,
          fila.descripcion,
          fila.factor,
          fila.um,
          fila.ubicacion,
          fila.cantidadLogica,
          fila.cantidadFisica,
          null,
          null
        ]], { origin: `A${row}` });
        detalleSheet[`H${row}`] = { t: cantidadesDisponibles ? "n" : "str", v: diferenciaInicial, f: `IF(OR(F${row}="",G${row}=""),"",G${row}-F${row})` };
        detalleSheet[`I${row}`] = { t: "str", v: resultadoInicial, f: `IF(H${row}="","SIN CONTEO",IF(H${row}=0,"CONFORME",IF(H${row}>0,"SOBRANTE","FALTANTE")))` };
      });

      const ultimaFila = filas.length + 5;
      detalleSheet["!ref"] = `A1:I${Math.max(ultimaFila, 5)}`;
      detalleSheet["!autofilter"] = { ref: `A5:I${Math.max(ultimaFila, 5)}` };
      detalleSheet["!cols"] = [
        { wch: 18 }, { wch: 42 }, { wch: 12 }, { wch: 12 },
        { wch: 22 }, { wch: 18 }, { wch: 19 }, { wch: 15 }, { wch: 18 }
      ];
      detalleSheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
      styleRange(detalleSheet, "A1:I1", titleStyle);
      styleRange(detalleSheet, "A2:I3", (row, column) => ({
        fill: { patternType: "solid", fgColor: { rgb: color.pale } },
        font: { name: "Aptos", color: { rgb: column % 2 === 0 ? color.navy : color.text }, bold: column % 2 === 0, sz: 10 },
        alignment: { vertical: "center", wrapText: true },
        border: { bottom: borderBottom }
      }));
      styleRange(detalleSheet, "A5:I5", headerStyle);
      if (filas.length) {
        styleRange(detalleSheet, `A6:I${ultimaFila}`, (row, column, cell) => {
          const style = bodyStyle(row, column);
          style.alignment.horizontal = column >= 5 && column <= 7 ? "right" : "left";
          if (column >= 5 && column <= 7) style.numFmt = "#,##0.00;[Red]-#,##0.00;–";
          if (column === 8 && cell.v) {
            const conforme = cell.v === "CONFORME";
            style.fill = { patternType: "solid", fgColor: { rgb: conforme ? "FFE7F6EE" : cell.v === "SIN CONTEO" ? color.pale : "FFFFEFEC" } };
            style.font = { name: "Aptos", bold: true, color: { rgb: conforme ? "FF14734B" : cell.v === "SIN CONTEO" ? color.text : "FFA33D38" }, sz: 10 };
            style.alignment = { horizontal: "center", vertical: "center" };
          }
          return style;
        });
      }
      detalleSheet["!rows"] = [{ hpt: 30 }, { hpt: 22 }, { hpt: 22 }, { hpt: 8 }, { hpt: 28 }];
      detalleSheet["!views"] = [{ showGridLines: false, state: "frozen", ySplit: 5 }];

      const resumenSheet = XLSX.utils.aoa_to_sheet([
        [`RESUMEN · COSTO ${costo?.numero_costo || ""}`],
        ["Estado", textoEstado(costo?.estado)],
        ["Resultado", resultadoCostoTexto],
        ["Líneas incluidas", filas.length],
        ["Conformes", null],
        ["No conformes", null],
        ["Sin conteo", null],
        ["SKUs no manifestados", noManifestados.length]
      ]);
      const finalRango = Math.max(ultimaFila, 6);
      resumenSheet.B5 = { t: "n", v: filas.filter(fila => fila.cantidadLogica !== "" && fila.cantidadFisica !== "" && Number(fila.cantidadFisica) === Number(fila.cantidadLogica)).length, f: `COUNTIF(Detalle!I6:I${finalRango},"CONFORME")` };
      resumenSheet.B6 = { t: "n", v: filas.filter(fila => fila.cantidadLogica !== "" && fila.cantidadFisica !== "" && Number(fila.cantidadFisica) !== Number(fila.cantidadLogica)).length, f: `COUNTIF(Detalle!I6:I${finalRango},"SOBRANTE")+COUNTIF(Detalle!I6:I${finalRango},"FALTANTE")` };
      resumenSheet.B7 = { t: "n", v: filas.filter(fila => fila.cantidadLogica === "" || fila.cantidadFisica === "").length, f: `COUNTIF(Detalle!I6:I${finalRango},"SIN CONTEO")` };
      resumenSheet["!cols"] = [{ wch: 28 }, { wch: 34 }];
      resumenSheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
      styleRange(resumenSheet, "A1:B1", titleStyle);
      styleRange(resumenSheet, "A2:B8", (row, column) => ({
        fill: { patternType: "solid", fgColor: { rgb: row % 2 === 0 ? color.paleAlt : color.white } },
        font: { name: "Aptos", bold: column === 0 || column === 1, color: { rgb: column === 0 ? color.navy : color.text }, sz: column === 0 ? 10 : 12 },
        alignment: { vertical: "center", horizontal: column === 0 ? "left" : "right", wrapText: true },
        border: { bottom: borderBottom }
      }));
      styleRange(resumenSheet, "B3", {
        fill: { patternType: "solid", fgColor: { rgb: resultadoCostoTexto === "CONFORME" ? "FFE7F6EE" : resultadoCostoTexto === "NO CONFORME" ? "FFFFEFEC" : color.pale } },
        font: { name: "Aptos", bold: true, color: { rgb: resultadoCostoTexto === "CONFORME" ? "FF14734B" : resultadoCostoTexto === "NO CONFORME" ? "FFA33D38" : color.text }, sz: 12 },
        alignment: { horizontal: "right", vertical: "center" },
        border: { bottom: borderBottom }
      });
      resumenSheet["!rows"] = [{ hpt: 34 }, ...Array.from({ length: 7 }, () => ({ hpt: 25 }))];
      resumenSheet["!views"] = [{ showGridLines: false }];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, resumenSheet, "Resumen");
      XLSX.utils.book_append_sheet(workbook, detalleSheet, "Detalle");

      if (noManifestados.length > 0) {
        const ultimoReconteoPorItem = new Map();
        for (const reconteo of reconteosNoManifestados) {
          if (reconteo.cantidad_reconteo == null) continue;
          const id = Number(reconteo.id);
          const numeroConteo = Number(reconteo.numero_conteo);
          const actual = ultimoReconteoPorItem.get(id);
          if (!actual || numeroConteo > actual.numeroConteo) {
            ultimoReconteoPorItem.set(id, { numeroConteo, registros: [reconteo] });
          } else if (numeroConteo === actual.numeroConteo) {
            actual.registros.push(reconteo);
          }
        }
        const filasNoManifestados = noManifestados.flatMap(item => {
          const ultimo = ultimoReconteoPorItem.get(Number(item.id));
          const registros = ultimo?.registros || [null];
          return registros.map(reconteo => [
            item.sku || "",
            reconteo ? `Conteo ${reconteo.numero_conteo}` : "Sin recuento",
            item.cantidad ?? "",
            reconteo?.cantidad_reconteo ?? "Pendiente",
            reconteo?.auditor_email || "—",
            item.observacion || ""
          ]);
        });
        const adicionales = XLSX.utils.aoa_to_sheet([
          [`NO MANIFESTADOS · ÚLTIMO CONTEO · COSTO ${costo?.numero_costo || ""}`],
          [],
          ["SKU", "Conteo más reciente", "Cantidad inicial", "Cantidad último conteo", "Auditor", "Observación"]
        ]);
        XLSX.utils.sheet_add_aoa(adicionales, filasNoManifestados, { origin: "A4" });
        adicionales["!autofilter"] = { ref: `A3:F${filasNoManifestados.length + 3}` };
        adicionales["!cols"] = [{ wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 24 }, { wch: 32 }, { wch: 45 }];
        adicionales["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
        styleRange(adicionales, "A1:F1", titleStyle);
        styleRange(adicionales, "A3:F3", headerStyle);
        if (filasNoManifestados.length) {
          styleRange(adicionales, `A4:F${filasNoManifestados.length + 3}`, (row, column, cell) => {
            const style = bodyStyle(row, column);
            if (column === 1 && cell.v === "Sin recuento") {
              style.font = { name: "Aptos", color: { rgb: "FF8A5A00" }, italic: true, sz: 10 };
            }
            if (column === 2 || column === 3) {
              style.alignment.horizontal = "right";
              style.numFmt = "#,##0.##;[Red]-#,##0.##;–";
            }
            return style;
          });
        }
        adicionales["!rows"] = [{ hpt: 30 }, { hpt: 8 }, { hpt: 28 }];
        adicionales["!views"] = [{ showGridLines: false, state: "frozen", ySplit: 3 }];
        XLSX.utils.book_append_sheet(workbook, adicionales, "No manifestados");
      }

      const nombreSeguro = String(costo?.numero_costo || costo?.id || "costo").replace(/[^\w-]/g, "_");
      XLSX.writeFile(workbook, `Validacion_Costo_${nombreSeguro}.xlsx`);
    } catch (error) {
      console.error("No se pudo exportar el costo:", error);
      setErrorExportacion(error?.message || "No se pudo generar el archivo Excel.");
    } finally {
      setExportando(false);
    }
  }

  // =========================================================
  // FILTRO
  // =========================================================
  const cambiosFactor = useMemo(
    () => obtenerCambiosFactor(detalles, conteos),
    [detalles, conteos]
  );

  useEffect(() => {
    if (!costo?.id || cargando || !detalles.length) return;
    const costoKey = String(costo.id);
    if (modalFactoresCostoVisto.current === costoKey) return;
    modalFactoresCostoVisto.current = costoKey;
    if (cambiosFactor.length) setModalFactoresAbierto(true);
  }, [costo?.id, cargando, detalles.length, cambiosFactor.length]);

  const detallesFiltrados = useMemo(() => {
    return detalles.filter((detalle) => {
      if (filtro === "factor_modificado") {
        return lineaTieneFactorModificado(detalle, conteos);
      }

      const clasificacion = clasificarDetalleConConteos(detalle, conteos);

      if (filtro === "todos") {
        return true;
      }

      if (filtro === "conformes") {
        return (
          clasificacion.tipo ===
          "conforme"
        );
      }

      if (filtro === "sobrantes") {
        return (
          clasificacion.tipo ===
          "sobrante"
        );
      }

      if (filtro === "faltantes") {
        return (
          clasificacion.tipo ===
          "faltante"
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
    let sobrantes = 0;
    let faltantes = 0;

    detalles.forEach((detalle) => {
      const clasificacion = clasificarDetalleConConteos(detalle, conteos);

      if (
        clasificacion.tipo ===
        "sin_conteo"
      ) {
        sinConteo++;
      } else if (
        clasificacion.tipo ===
        "conforme"
      ) {
        conformes++;
      } else if (
        clasificacion.tipo ===
        "sobrante"
      ) {
        sobrantes++;
      } else if (
        clasificacion.tipo ===
        "faltante"
      ) {
        faltantes++;
      }
    });

    return {
      total: detalles.length,
      conformes,
      sobrantes,
      faltantes,
      noConformes:
        sobrantes + faltantes,
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

        <ValidationNotice
          message={error}
          title="No se pudo cargar el detalle"
          onClose={onVolver}
          action={{ label: 'Reintentar', onClick: cargarDetalle }}
        />
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

            <div className="detalle-export-actions">
              <button
                type="button"
                className="detalle-export-button"
                onClick={exportarCostoExcel}
                disabled={exportando}
              >
                {exportando ? "Preparando Excel…" : "Exportar costo a Excel"}
              </button>
            </div>

          </div>

        </div>
      </header>

      {modalFactoresAbierto && (
        <div
          className="factor-change-modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setModalFactoresAbierto(false);
          }}
        >
          <section className="factor-change-modal" role="dialog" aria-modal="true" aria-labelledby="factor-change-modal-title">
            <span className="factor-change-modal-icon" aria-hidden="true">×</span>
            <span className="section-kicker">CAMBIOS DE FACTOR</span>
            <h2 id="factor-change-modal-title">Factores modificados en este costo</h2>
            <p className="factor-change-modal-summary">
              Se modificó el factor de <strong>{cambiosFactor.length}</strong> SKU respecto a la plantilla.
            </p>
            <ul className="factor-change-modal-list">
              {cambiosFactor.map((item) => (
                <li key={item.id}>
                  <strong className="factor-change-sku">{item.sku || 'SKU sin código'}</strong>
                  <div>
                    {item.cambios.map((cambio) => (
                      <span key={`${item.id}-${cambio.numeroConteo}`}>
                        Conteo {cambio.numeroConteo}: plantilla × {cambio.factorPlantilla} <b>→</b> aplicado × {cambio.factorAplicado}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <button type="button" className="factor-change-modal-button" onClick={() => setModalFactoresAbierto(false)}>
              Entendido
            </button>
          </section>
        </div>
      )}

      {errorExportacion && (
        <div className="ui-notice-backdrop" role="presentation">
          <section className="ui-notice" role="alertdialog" aria-modal="true" aria-labelledby="export-error-title">
            <span className="ui-notice-icon ui-notice-error" aria-hidden="true">!</span>
            <h2 id="export-error-title">No se pudo exportar</h2>
            <p>{errorExportacion}</p>
            <button type="button" className="ui-notice-button" onClick={() => { setErrorExportacion(""); window.location.reload() }}>Entendido</button>
          </section>
        </div>
      )}


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
                  Sobrantes
                </span>

                <strong className="texto-sobrante">
                  {resumen.sobrantes}
                </strong>

              </div>

            </div>

            <div className="resumen-item resumen-diferencia">

              <div className="resumen-icon">
                !
              </div>

              <div className="resumen-item-content">

                <span className="resumen-label">
                  Faltantes
                </span>

                <strong className="texto-faltante">
                  {resumen.faltantes}
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

                const existeDiferenciaAnterior =
                  numeroConteo === 1 || conteos.some(conteo =>
                    conteo.numero_conteo === numeroConteo - 1 &&
                    conteo.resultado === 'diferencia'
                  );

                const habilitado =
                  !realizado &&
                  Number(costo?.conteo_habilitado) === numeroConteo &&
                  existeDiferenciaAnterior;

                if (!realizado && !habilitado) return null;

                return (
                  <div
                    className={`auditor-card ${
                      realizado
                        ? "realizado"
                        : "habilitado"
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
                        <span className="auditor-habilitado">
                          <span className="auditor-status-dot" />
                          HABILITADO
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
                            {habilitado ? 'Disponible' : 'Sin auditor'}
                          </strong>

                          <span>
                            {habilitado
                              ? 'Conteo habilitado para las líneas con diferencias.'
                              : 'Esta etapa todavía no registra actividad.'}
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

            {/* TODOS */}
            <button
              type="button"
              className={`filtro-btn filtro-todos${filtro === "todos" ? " activo" : ""}`}
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


            {/* CONFORMES */}
            <button
              type="button"
              className={`filtro-btn filtro-conforme${filtro === "conformes" ? " activo" : ""}`}
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


            {/* SOBRANTES */}
            <button
              type="button"
              className={`filtro-btn filtro-sobrante${filtro === "sobrantes" ? " activo" : ""}`}
              onClick={() =>
                setFiltro("sobrantes")
              }
            >
              <span className="filtro-btn-icon">
                ↑
              </span>

              <span>
                Sobrantes
              </span>

              <span className="filtro-btn-count">
                {resumen.sobrantes}
              </span>
            </button>


            {/* FALTANTES */}
            <button
              type="button"
              className={`filtro-btn filtro-faltante${filtro === "faltantes" ? " activo" : ""}`}
              onClick={() =>
                setFiltro("faltantes")
              }
            >
              <span className="filtro-btn-icon">
                ↓
              </span>

              <span>
                Faltantes
              </span>

              <span className="filtro-btn-count">
                {resumen.faltantes}
              </span>
            </button>

            <button
              type="button"
              className={`filtro-btn filtro-factor-modificado${filtro === "factor_modificado" ? " activo" : ""}`}
              onClick={() => setFiltro("factor_modificado")}
            >
              <span className="filtro-btn-icon">×</span>
              <span>Factor modificado</span>
              <span className="filtro-btn-count">{cambiosFactor.length}</span>
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

        <p className="table-swipe-hint"><span aria-hidden="true">↔</span> Desliza la tabla para ver todas las columnas</p>
        <div className="tabla-wrapper" role="region" aria-label="Detalle de productos, desplazable horizontalmente" tabIndex={0}>

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
                <th>Validación por apoyo</th>
                <th>Resultado final</th>
              </tr>
            </thead>

            <tbody>

              {detallesFiltrados.length === 0 ? (

                <tr>
                  <td
                    colSpan="10"
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

                    const esConteoDiferencia = conteo =>
                      String(conteo?.resultado || '').trim().toLowerCase().replace(/[\s-]+/g, '_') === 'diferencia';
                    const habilitado = Number(costo?.conteo_habilitado);
                    const mostrarConteo1 = Boolean(conteo1) || habilitado === 1;
                    const mostrarConteo2 = Boolean(conteo2) ||
                      (esConteoDiferencia(conteo1) && habilitado === 2);
                    const mostrarConteo3 = Boolean(conteo3) ||
                      (esConteoDiferencia(conteo2) && habilitado === 3);

                    const factorModificado = lineaTieneFactorModificado(detalle, conteos);
                    const lineaApoyo = validacionApoyo?.lineas?.find(linea => Number(linea.detalle_costo_id) === Number(detalle.id));

                    return (
                      <tr
                        key={detalle.id}
                        className={factorModificado ? "fila-factor-modificado" : ""}
                        title={factorModificado ? "El factor aplicado cambió respecto al factor de la plantilla de Excel" : undefined}
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
                          {mostrarConteo1 ? (
                            <CeldaConteo
                              conteo={conteo1}
                              numeroConteo={1}
                              habilitado={!conteo1 && habilitado === 1}
                              detalle={detalle}
                              abrirModal={abrirModal}
                              obtenerItemsConteo={obtenerItemsConteo}
                              textoResultado={textoResultado}
                            />
                          ) : <span className="conteo-no-aplica">—</span>}
                        </td>

                        <td>
                          {mostrarConteo2 ? (
                            <CeldaConteo
                              conteo={conteo2}
                              numeroConteo={2}
                              habilitado={!conteo2 && habilitado === 2}
                              detalle={detalle}
                              abrirModal={abrirModal}
                              obtenerItemsConteo={obtenerItemsConteo}
                              textoResultado={textoResultado}
                            />
                          ) : <span className="conteo-no-aplica">—</span>}
                        </td>

                        <td>
                          {mostrarConteo3 ? (
                            <CeldaConteo
                              conteo={conteo3}
                              numeroConteo={3}
                              habilitado={!conteo3 && habilitado === 3}
                              detalle={detalle}
                              abrirModal={abrirModal}
                              obtenerItemsConteo={obtenerItemsConteo}
                              textoResultado={textoResultado}
                            />
                          ) : <span className="conteo-no-aplica">—</span>}
                        </td>

                        <td>
                          {lineaApoyo ? (
                            <div className={`resultado-final ${lineaApoyo.resultado === "conforme" ? "detalle-resultado-conforme" : "detalle-resultado-faltante"}`}>
                              <span className="resultado-dot" />
                              <strong>{lineaApoyo.resultado === "conforme" ? "CONFORME" : "NO CONFORME"}</strong>
                              <small>{lineaApoyo.cantidad_final} · {lineaApoyo.auditor_email}</small>
                            </div>
                          ) : validacionApoyo?.estado === "solicitada" && esConteoDiferencia(conteo3) ? (
                            <span className="resultado-pendiente">Pendiente</span>
                          ) : <span className="conteo-no-aplica">—</span>}
                        </td>

                        <td>

                          {ultimoConteo ? (() => {

                            const clasificacion =
                              obtenerClasificacion(
                                detalle
                              );

                            if (
                              clasificacion.tipo ===
                              "conforme"
                            ) {
                              return (
                                <div className="resultado-final detalle-resultado-conforme">

                                  <span className="resultado-dot" />

                                  <strong>
                                    CONFORME
                                  </strong>

                                  <small>
                                    Sin diferencia
                                  </small>

                                </div>
                              );
                            }

                            if (
                              clasificacion.tipo ===
                              "sobrante"
                            ) {
                              return (
                                <div className="resultado-final detalle-resultado-sobrante">

                                  <span className="resultado-dot" />

                                  <strong>
                                    SOBRANTE
                                  </strong>

                                  <small>
                                    +
                                    {
                                      clasificacion.diferencia
                                    }{" "}
                                    unidades
                                  </small>

                                </div>
                              );
                            }

                            return (
                              <div className="resultado-final detalle-resultado-faltante">

                                <span className="resultado-dot" />

                                <strong>
                                  FALTANTE
                                </strong>

                                <small>
                                  {
                                    clasificacion.diferencia
                                  }{" "}
                                  unidades
                                </small>

                              </div>
                            );

                          })() : (

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
          <>
          <p className="table-swipe-hint"><span aria-hidden="true">↔</span> Desliza la tabla para ver todas las columnas</p>
          <div className="tabla-wrapper" role="region" aria-label="Productos no manifestados, desplazable horizontalmente" tabIndex={0}>

            <table className="tabla-no-manifestados">

              <thead>
                <tr>
                  <th>#</th>
                  <th>SKU</th>
                  <th>Cantidad</th>
                  <th>Observación</th>
                  <th>Auditor</th>
                  <th>Recuentos</th>
                </tr>
              </thead>

              <tbody>

                {noManifestados.map(
                  (item, index) => {
                    const skuKey = String(item.sku || "").trim().toLowerCase();
                    const habilitadoDos = reconteosNoManifestados.some(reconteo =>
                      String(reconteo.sku || "").trim().toLowerCase() === skuKey && Number(reconteo.numero_conteo) === 2
                    );
                    const habilitadoTres = reconteosNoManifestados.some(reconteo =>
                      String(reconteo.sku || "").trim().toLowerCase() === skuKey && Number(reconteo.numero_conteo) === 3
                    );
                    const etapa = Number(costo?.conteo_habilitado);
                    const resultadosReconteo = reconteosNoManifestados.filter(reconteo => Number(reconteo.id) === Number(item.id));
                    const validacionApoyoNoManifestado = validacionApoyo?.no_manifestados?.find(linea => Number(linea.no_manifestado_id) === Number(item.id));

                    return (
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

                      <td className="no-manifestado-recount-actions">
                        <div className="no-manifestado-recount-cell">
                          {resultadosReconteo.length ? (
                            <div className="no-manifestado-recount-history" aria-label="Historial de recuentos">
                              {[...resultadosReconteo].sort((a, b) => Number(a.numero_conteo) - Number(b.numero_conteo)).map(reconteo => (
                                <article className="no-manifestado-recount-entry" key={`${reconteo.id}-${reconteo.numero_conteo}-${reconteo.auditor_id || "usuario"}`}>
                                  <div className="no-manifestado-recount-main">
                                    <span className="no-manifestado-recount-count">Conteo {reconteo.numero_conteo}</span>
                                    <strong>{reconteo.cantidad_reconteo ?? "Pendiente"}</strong>
                                  </div>
                                  <div className="no-manifestado-recount-user">
                                    <span>Realizado por</span>
                                    <strong title={reconteo.auditor_email || "Sin usuario identificado"}>{reconteo.auditor_email || "Sin usuario identificado"}</strong>
                                  </div>
                                </article>
                              ))}
                            </div>
                          ) : (
                            <span className="no-manifestado-recount-empty">Aún no hay recuentos</span>
                          )}
                          {validacionApoyoNoManifestado && (
                            <div className={`no-manifestado-apoyo-validacion ${validacionApoyoNoManifestado.resultado === 'conforme' ? 'is-ok' : 'is-diff'}`}>
                              <strong>Validación por apoyo · {validacionApoyoNoManifestado.resultado === 'conforme' ? 'Conforme' : 'No conforme'}</strong>
                              <span>Conteo validado: {validacionApoyoNoManifestado.cantidad_validada} · {validacionApoyoNoManifestado.auditor_email}</span>
                            </div>
                          )}
                          <div className="no-manifestado-recount-buttons">
                            {etapa === 2 && !habilitadoDos && (
                              <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => habilitarReconteoNoManifestado(item, 2)}>Habilitar conteo 2</button>
                            )}
                            {etapa === 3 && !habilitadoTres && (
                              <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => habilitarReconteoNoManifestado(item, 3)}>Habilitar conteo 3</button>
                            )}
                            {habilitadoDos && (
                              <button type="button" className="btn btn-sm btn-primary" onClick={() => setReconteoSeleccionado({ numeroConteo: 2, sku: item.sku })}>Continuar conteo 2</button>
                            )}
                            {habilitadoTres && (
                              <button type="button" className="btn btn-sm btn-primary" onClick={() => setReconteoSeleccionado({ numeroConteo: 3, sku: item.sku })}>Continuar conteo 3</button>
                            )}
                          </div>
                          {avisoReconteo && <span className="support-recount-error" role="alert">{avisoReconteo}</span>}
                        </div>
                      </td>

                      </tr>
                    );
                  }
                )}

              </tbody>

            </table>

          </div>
          </>
        )}

      </section>


      {reconteoSeleccionado && (
        <ReconteoNoManifestados
          costoId={costo.id}
          numeroConteo={reconteoSeleccionado.numeroConteo}
          sku={reconteoSeleccionado.sku}
          onClose={() => setReconteoSeleccionado(null)}
          onSaved={cargarDetalle}
        />
      )}

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


              {/* AUDITOR */}
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


              {/* RESUMEN DEL CONTEO */}
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

                  {Number(conteoSeleccionado.factor) !== (Number(detalleSeleccionado.factor) > 0 ? Number(detalleSeleccionado.factor) : 1) && (
                    <div className="modal-factor-cambio">
                      <span>Plantilla: × {Number(detalleSeleccionado.factor) > 0 ? detalleSeleccionado.factor : 1}</span>
                      <span>Aplicado: × {conteoSeleccionado.factor}</span>
                      <em>Modificado</em>
                    </div>
                  )}

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

                <div className={`modal-resumen-item modal-resumen-resultado ${conteoSeleccionado.resultado === "conforme" ? "conforme" : "no-conforme"}`}>

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


              {/* ITEMS */}
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


              {/* FOOTER */}
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
  habilitado = false,
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

          <span className={`conteo-card-estado ${habilitado ? 'habilitado' : 'pendiente'}`}>
            {habilitado ? 'HABILITADO' : 'PENDIENTE'}
          </span>

        </div>

        <div className="conteo-card-separator" />

        <div className={`conteo-card-pendiente ${habilitado ? 'conteo-card-disponible' : ''}`}>

          <span className="conteo-pendiente-icon">
            ○
          </span>

          <div>

            <strong>{habilitado ? 'Disponible' : 'Sin registro'}</strong>

            <span>
              {habilitado
                ? 'Conteo habilitado para esta línea.'
                : 'Este conteo todavía no ha sido realizado.'}
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

      <div className="conteo-cantidad-fisica">
        <span>Cantidad física</span>
        <strong>{conteo.cantidad_final}</strong>
      </div>


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
