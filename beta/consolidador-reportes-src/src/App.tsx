import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  analizarVigenciaPromos,
  calcularPeriodoDesdeVentas,
  descargarBlob,
  detectarOrdenesCreadas,
  detectarTipoTabla,
  generarReporte,
  leerArchivoTabular,
  leerPlantillaDesdeUrl,
  parsearTxtPromos,
  validarCodigosCliente,
  type CodigoCDPInvalido,
  type CodigoCliente,
  type GenerarResultado,
  type Indicadores,
  type OrdenCreada,
  type PlantillaState,
  type PriceOffPendiente,
  type Promocion,
  type VigenciaPromocion,
  type ResumenItem,
  type Row,
} from "@/lib/consolidador";
import { plantillaCdp } from "@/assets/plantillaCdp";
import { plantillaProm } from "@/assets/plantillaProm";
import { logoTb } from "@/assets/logoTb";
import { logoSw } from "@/assets/logoSw";


// Alterna entre modo claro y oscuro agregando/quitando la clase `dark`
// en <html>; la preferencia se guarda en el navegador.
function BotonTema() {
  const [oscuro, setOscuro] = useState(false);
  useEffect(() => {
    const guardado = localStorage.getItem("tema");
    const inicial =
      guardado === "dark" ||
      (guardado === null && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setOscuro(inicial);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", oscuro);
    localStorage.setItem("tema", oscuro ? "dark" : "light");
  }, [oscuro]);
  return (
    <button
      type="button"
      onClick={() => setOscuro((v) => !v)}
      aria-label={oscuro ? "Activar modo claro" : "Activar modo oscuro"}
      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
    >
      {oscuro ? "Modo claro" : "Modo oscuro"}
    </button>
  );
}


type Estado = { msg: string; tipo: "success" | "error" | "info" } | null;

export default function App({ onSignOut }: { onSignOut: () => void }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<Row[]>([]);
  const [ordenes, setOrdenes] = useState<Row[]>([]);
  const [productos, setProductos] = useState<Row[]>([]);
  const [plantilla, setPlantilla] = useState<PlantillaState | null>(null);
  const [plantilla2, setPlantilla2] = useState<PlantillaState | null>(null);
  const [plantillasError, setPlantillasError] = useState(false);
  const [promos, setPromos] = useState<Promocion[]>([]);
  const [nombrePromo, setNombrePromo] = useState("");
  const [codigoPromo, setCodigoPromo] = useState("");
  // Revisión obligatoria de clientes antes de generar
  const [revisionNoCDP, setRevisionNoCDP] = useState<CodigoCliente[] | null>(null);
  const [cdpInvalidos, setCdpInvalidos] = useState<CodigoCDPInvalido[] | null>(null);
  // Órdenes en estado "creada": bloquean la generación hasta confirmarlas en KOLO
  const [ordenesCreadas, setOrdenesCreadas] = useState<OrdenCreada[] | null>(null);

  const [estado, setEstado] = useState<Estado>(null);
  const [generando, setGenerando] = useState(false);
  const [resultado, setResultado] = useState<GenerarResultado | null>(null);
  // KPI cuyo detalle se muestra en pop up (null = ninguno abierto)
  const [kpiAbierto, setKpiAbierto] = useState<string | null>(null);
  // Pop-up de vigencia de promociones (activas / vencidas según la fecha de hoy)
  const [verVigencia, setVerVigencia] = useState(false);
  const [ofertasPendientes, setOfertasPendientes] = useState<PriceOffPendiente[] | null>(null);

  const refArchivos = useRef<HTMLInputElement>(null);
  // Nombre del archivo reconocido para cada tabla (solo informativo)
  const [detectados, setDetectados] = useState<Record<string, string>>({});
  const refTxt = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuAbierto) return;
    const cerrarAlHacerClicFuera = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuAbierto(false);
    };
    const cerrarConEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuAbierto(false);
    };
    document.addEventListener("mousedown", cerrarAlHacerClicFuera);
    document.addEventListener("keydown", cerrarConEscape);
    return () => {
      document.removeEventListener("mousedown", cerrarAlHacerClicFuera);
      document.removeEventListener("keydown", cerrarConEscape);
    };
  }, [menuAbierto]);

  // Plantillas integradas: el usuario no las sube.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [p1, p2] = await Promise.all([
          leerPlantillaDesdeUrl(plantillaCdp, "plantilla-cdp.xlsx"),
          leerPlantillaDesdeUrl(plantillaProm, "plantilla-promociones.xlsx"),
        ]);
        if (!vivo) return;
        setPlantilla(p1);
        setPlantilla2(p2);
      } catch (e) {
        console.error(e);
        if (vivo) setPlantillasError(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const msg = (texto: string, tipo: "success" | "error" | "info") => {
    setEstado({ msg: texto, tipo });
    window.setTimeout(() => setEstado(null), 5000);
  };

  const cargar = async (
    file: File | undefined,
    setter: (rows: Row[]) => void,
    label: string,
  ) => {
    if (!file) return;
    try {
      const rows = await leerArchivoTabular(file);
      if (!rows.length) {
        msg(`${label}: el archivo se leyó pero no se encontraron filas de datos`, "error");
        return;
      }
      setter(rows);
      msg(`${label} cargado (${rows.length} filas)`, "success");
    } catch (e) {
      console.error(`Error leyendo ${label}:`, e);
      msg(`Error en ${label}: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  };

  // Carga en un solo campo: lee cada archivo, detecta a qué tabla corresponde
  // por sus encabezados y lo asigna automáticamente.
  const cargarArchivos = async (lista: FileList | null) => {
    if (!lista || !lista.length) return;
    const asignados: string[] = [];
    const desconocidos: string[] = [];
    for (const file of Array.from(lista)) {
      try {
        const rows = await leerArchivoTabular(file);
        if (!rows.length) {
          desconocidos.push(file.name);
          continue;
        }
        const tipo = detectarTipoTabla(rows);
        if (tipo === "items") {
          setItems(rows);
          setDetectados((d) => ({ ...d, items: file.name }));
          asignados.push(`Ítems DTE (${file.name})`);
        } else if (tipo === "ordenes") {
          setOrdenes(rows);
          setDetectados((d) => ({ ...d, ordenes: file.name }));
          asignados.push(`Órdenes (${file.name})`);
        } else if (tipo === "productos") {
          setProductos(rows);
          setDetectados((d) => ({ ...d, productos: file.name }));
          asignados.push(`Productos (${file.name})`);
        } else {
          desconocidos.push(file.name);
        }
      } catch (e) {
        console.error(`Error leyendo ${file.name}:`, e);
        desconocidos.push(file.name);
      }
    }
    if (desconocidos.length) {
      msg(
        `No se reconoció: ${desconocidos.join(", ")}. Verifique que sea el archivo correcto.`,
        "error",
      );
    } else if (asignados.length) {
      msg(`Reconocido: ${asignados.join(" · ")}`, "success");
    }
  };

  const cargarTxt = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const lista = parsearTxtPromos(String(ev.target?.result ?? ""));
        setPromos(lista);
        msg(`${lista.length} promociones cargadas`, "success");
      } catch {
        msg("Error en TXT", "error");
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const agregarPromo = () => {
    const n = nombrePromo.trim();
    const c = codigoPromo.trim();
    if (!n || !c) {
      msg("Complete nombre y código", "error");
      return;
    }
    setPromos((prev) => [...prev, { promocion: n, codigo: c }]);
    setNombrePromo("");
    setCodigoPromo("");
    msg("Promoción añadida", "success");
  };

  const limpiar = () => {
    setItems([]);
    setOrdenes([]);
    setProductos([]);
    setPromos([]);
    setDetectados({});
    setResultado(null);
    [refArchivos, refTxt].forEach((r) => {
      if (r.current) r.current.value = "";
    });
    msg("Todo limpiado", "success");
  };

  // Periodo automático: se toma de la tabla de ventas (Ítems DTE)
  const periodo = useMemo(() => calcularPeriodoDesdeVentas(items), [items]);

  const generar = () => {
    if (!items.length || !ordenes.length || !productos.length) {
      msg("Faltan archivos obligatorios", "error");
      return;
    }
    if (!plantilla) {
      msg("Las plantillas aún no terminan de cargar", "error");
      return;
    }
    if (!periodo.desde || !periodo.hasta) {
      msg("No se pudo determinar el periodo: la tabla de ventas no tiene fechas válidas", "error");
      return;
    }
    // Bloqueo obligatorio: no se puede avanzar con órdenes en estado "creada".
    const creadas = detectarOrdenesCreadas(ordenes);
    if (creadas.length) {
      setOrdenesCreadas(creadas);
      return;
    }
    // Validación obligatoria de códigos de cliente antes de generar
    const val = validarCodigosCliente(ordenes);
    if (val.cdpInvalidos.length) {
      setCdpInvalidos(val.cdpInvalidos);
      return;
    }
    setRevisionNoCDP(val.clientesNoCDP);
  };

  const ejecutarGeneracion = (priceOffDecisiones?: Record<string, boolean>) => {
    if (!plantilla) return;
    setRevisionNoCDP(null);
    setOfertasPendientes(null);
    setGenerando(true);
    (async () => {
      try {
        const r = await generarReporte({
          itemsData: items,
          ordenesData: ordenes,
          productosData: productos,
          promociones: promos,
          plantilla,
          plantilla2,
          descargar: false,
          priceOffDecisiones,
        });
        setResultado(r);
        // Productos en OFERTA sin código de promoción: preguntar al usuario.
        if (r.priceOffPendientes.length) {
          setOfertasPendientes(r.priceOffPendientes);
          return;
        }
        // Mostrar automáticamente la vigencia de las promociones al terminar
        // la generación (sin que el usuario tenga que pulsar el botón).
        if (promos.length > 0) setVerVigencia(true);
        msg(
          `Reporte generado: ${r.totalFiltrados} registros en plantilla y ${r.hojas.length} hojas.`,
          "success",
        );
      } catch (e) {
        console.error(e);
        msg("Error: " + (e instanceof Error ? e.message : String(e)), "error");
      } finally {
        setGenerando(false);
      }
    })();
  };


  const descargar = () => {
    if (!resultado) return;
    descargarBlob(resultado.blob, resultado.archivoNombre);
    msg(`${resultado.archivoNombre} descargado`, "success");
  };

  const puedeGenerar = Boolean(items.length && ordenes.length && productos.length && plantilla);
  const ind = resultado?.indicadores;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-5">
          <div className="flex items-center gap-4">
            <img
              src={logoTb}
              alt="Tecno Bahía, agroservicio y ferretería"
              className="h-9 w-auto rounded"
            />
            <div className="min-w-0">
              <h1 className="text-xs font-medium leading-tight sm:text-sm">
                Auxiliar de reportes<br className="sm:hidden" /> Sherwin Williams - Tecno Bahía
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="report-menu" ref={menuRef}>
              <button
                type="button"
                className="report-menu-button"
                aria-label="Abrir menú principal"
                aria-haspopup="menu"
                aria-expanded={menuAbierto}
                onClick={() => setMenuAbierto((abierto) => !abierto)}
              >
                <strong aria-hidden="true">☰</strong>
              </button>
              {menuAbierto && (
                <div className="report-menu-dropdown" role="menu">
                  <a
                    href="../index.html#modulos"
                    role="menuitem"
                    onClick={() => setMenuAbierto(false)}
                  >
                    🏠 Seleccionar auxiliar
                  </a>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuAbierto(false);
                      onSignOut();
                    }}
                  >
                    🚪 Cerrar sesión
                  </button>
                </div>
              )}
            </div>
            <BotonTema />
            <img src={logoSw} alt="Sherwin Williams" className="h-8 w-auto rounded" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-12 px-6 py-10">
        {/* Periodo del reporte: entre los indicadores y la tabla resumen */}
        <section>
          <SectionTitle>Periodo del reporte</SectionTitle>
          <div className="rounded-lg border border-border px-4 py-3 text-xs text-muted-foreground">
            {periodo.desde && periodo.hasta ? (
              <>
                Detectado automáticamente de la tabla de ventas:{" "}
                <span className="text-foreground">{fechaLegible(periodo.desde)}</span> al{" "}
                <span className="text-foreground">{fechaLegible(periodo.hasta)}</span>.
              </>
            ) : (
              "Cargue Ítems DTE para detectar el periodo automáticamente."
            )}
          </div>
        </section>

        {/* Indicadores clave: agrupados en columnas; el detalle se abre en pop up */}
        <section>
          <SectionTitle>Indicadores clave</SectionTitle>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <KpiGrupo titulo="Órdenes">
              <Kpi
                label="Total de registros de órdenes"
                value={ind?.totalOrdenesCargadas}
                onClick={() => setKpiAbierto("ordenes-total")}
              />
              <Kpi
                label="Órdenes confirmadas"
                value={ind?.totalOrdenesConfirmadas}
                onClick={() => setKpiAbierto("ordenes-confirmadas")}
              />
              <Kpi
                label="Órdenes no confirmadas"
                value={ind?.totalOrdenesNoConfirmadas}
                onClick={() => setKpiAbierto("ordenes-no-confirmadas")}
              />
              <Kpi
                label="Órdenes pendientes de actualizar en KOLO"
                value={ind?.totalOrdenesCreadas}
                onClick={() => setKpiAbierto("ordenes-creadas")}
              />
            </KpiGrupo>

            <KpiGrupo titulo="Ítems vendidos">
              <Kpi
                label="Total de registros de ítems"
                value={ind?.totalItemsCargados}
                onClick={() => setKpiAbierto("items-total")}
              />
              <Kpi
                label="Ítems confirmados"
                value={ind?.totalItemsConfirmados}
                onClick={() => setKpiAbierto("items-confirmados")}
              />
              <Kpi
                label="Ítems no confirmados"
                value={ind?.totalItemsNoConfirmados}
                onClick={() => setKpiAbierto("items-no-confirmados")}
              />
            </KpiGrupo>

            <KpiGrupo titulo="Clientela">
              <Kpi
                label="Total de clientes diferentes"
                value={ind?.totalClientesUnicos}
                onClick={() => setKpiAbierto("clientes-todos")}
              />
              <Kpi
                label="Clientes CDP"
                value={ind?.totalClientesCDP}
                onClick={() => setKpiAbierto("clientes-cdp")}
              />
              <Kpi
                label="Clientes no CDP"
                value={ind?.totalClientesNoCDP}
                onClick={() => setKpiAbierto("clientes-nocdp")}
              />
            </KpiGrupo>

            <KpiGrupo titulo="Reporte Desc. CDP">
              <Kpi
                label="Ítems confirmados para CDP"
                value={ind?.totalItemsConfirmadosCDP}
                onClick={() => setKpiAbierto("items-confirmados-cdp")}
              />
              <Kpi
                label="Ítems con Desc. CDP"
                value={ind?.totalItemsDescuentoCDP}
                onClick={() => setKpiAbierto("descuentos-cdp")}
              />
            </KpiGrupo>

            <KpiGrupo titulo="Reporte Prom">
              <Kpi
                label="Total de promociones registradas"
                value={ind?.totalPromocionesRegistradas}
                onClick={() => setKpiAbierto("promociones")}
              />
              <Kpi
                label="Promociones validadas"
                value={ind?.totalItemsConPromocion}
                onClick={() => setKpiAbierto("promociones-validas")}
              />
              <Kpi
                label="Promociones inválidas"
                value={ind?.totalItemsPromocionErroneos}
                onClick={() => setKpiAbierto("promociones-invalidas")}
              />
            </KpiGrupo>
          </div>
          {!resultado && (
            <p className="mt-3 text-xs text-muted-foreground">
              Los indicadores se calculan al generar el reporte. Luego puede dar clic en cada uno
              para ver su detalle.
            </p>
          )}
        </section>

        {/* Promociones: se muestra más ancho para ver la lista completa sin scroll */}
        <section className="xl:-mx-24">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle>Promociones</SectionTitle>
            <button
              type="button"
              disabled={promos.length === 0}
              onClick={() => setVerVigencia(true)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              Ver promociones activas
            </button>
          </div>

          <div className="rounded-lg border border-border p-4">
            <p className="text-xs font-medium">Carga masiva desde .TXT</p>
            <p className="mb-2 text-xs text-muted-foreground">Formato: Nombre,Código</p>
            <input
              ref={refTxt}
              type="file"
              accept=".txt"
              onChange={(e) => cargarTxt(e.target.files?.[0])}
              className={fileInputCls}
            />
          </div>

          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-[2]">
              <Field label="Nombre de promoción">
                <input
                  className={inputCls}
                  placeholder="CTN 16/03-31/05/2026"
                  value={nombrePromo}
                  onChange={(e) => setNombrePromo(e.target.value)}
                />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Código de categoría">
                <input
                  className={inputCls}
                  placeholder="38906"
                  value={codigoPromo}
                  onChange={(e) => setCodigoPromo(e.target.value)}
                />
              </Field>
            </div>
            <button
              onClick={agregarPromo}
              className="h-9 rounded-md border border-border px-4 text-sm font-medium transition hover:bg-muted"
            >
              Añadir
            </button>
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="w-4/5 border-b border-border px-4 py-2.5 text-left font-medium">
                    Nombre de promoción
                  </th>
                  <th className="border-b border-border px-4 py-2.5 text-left font-medium">
                    Código
                  </th>
                </tr>
              </thead>
              <tbody>
                {promos.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-4 text-xs text-muted-foreground">
                      Sin promociones aún
                    </td>
                  </tr>
                ) : (
                  promos.map((p, i) => (
                    <tr key={i}>
                      <td className="border-b border-border/60 px-4 py-2.5 last:border-0">
                        {p.promocion}
                      </td>
                      <td className="whitespace-nowrap border-b border-border/60 px-4 py-2.5 text-muted-foreground last:border-0">
                        {p.codigo}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <SectionTitle>Archivos fuente</SectionTitle>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium">Archivos de trabajo</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Suba juntos los tres archivos (ítems DTE, órdenes y maestro de productos). Se
              reconocen automáticamente.
            </p>
            <input
              ref={refArchivos}
              type="file"
              multiple
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                void cargarArchivos(e.target.files);
                e.target.value = "";
              }}
              className={fileInputCls}
            />
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
              <EstadoArchivo
                titulo="Ítems DTE"
                nombre={detectados["items"]}
                filas={items.length}
              />
              <EstadoArchivo
                titulo="Órdenes"
                nombre={detectados["ordenes"]}
                filas={ordenes.length}
              />
              <EstadoArchivo
                titulo="Maestro de productos"
                nombre={detectados["productos"]}
                filas={productos.length}
              />
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-border px-4 py-3 text-xs text-muted-foreground">
            {plantillasError ? (
              <span className="text-destructive">
                No se pudieron cargar las plantillas integradas. Recargue la página.
              </span>
            ) : plantilla && plantilla2 ? (
              <>
                Plantillas integradas listas:{" "}
                <span className="text-foreground">Reporte CDP</span> y{" "}
                <span className="text-foreground">Reporte Promociones</span>. No requieren carga
                manual.
              </>
            ) : (
              "Cargando plantillas integradas…"
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3 sm:flex-row">
          <button
            disabled={!puedeGenerar || generando}
            onClick={generar}
            className="flex-1 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {generando ? "Generando…" : "Generar y previsualizar"}
          </button>
          <button
            onClick={limpiar}
            className="rounded-md border border-border px-5 py-2.5 text-sm font-medium transition hover:bg-muted"
          >
            Limpiar
          </button>
        </section>

        {/* Tabla madre: todo el detalle procesado */}
        {resultado && (
          <section>
            <SectionTitle>Tabla madre del reporte</SectionTitle>
            <TablaResumen filas={resultado.resumen} />
          </section>
        )}

        {/* Exportar reporte */}
        {resultado && (
          <section>
            <SectionTitle>Exportar reporte</SectionTitle>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Se exportan únicamente las hojas{" "}
                <span className="text-foreground">Reporte CDP</span> y{" "}
                <span className="text-foreground">Reporte_Prom</span>.
              </p>
              <button
                onClick={descargar}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                Exportar
              </button>
            </div>
          </section>
        )}

        {estado && (
          <div
            className={
              "rounded-md border px-4 py-3 text-sm " +
              (estado.tipo === "error"
                ? "border-destructive/40 text-destructive"
                : "border-border text-muted-foreground")
            }
          >
            {estado.msg}
          </div>
        )}

      </div>

      <footer className="mx-auto max-w-5xl px-6 pb-6 pt-2 text-center text-xs text-muted-foreground">
        Developed by <strong className="font-semibold text-foreground">FG</strong>
      </footer>

      {verVigencia && (
        <ModalVigencia promos={promos} onCerrar={() => setVerVigencia(false)} />
      )}

      {kpiAbierto && ind && (
        <ModalKpi id={kpiAbierto} ind={ind} onCerrar={() => setKpiAbierto(null)} />
      )}

      {ordenesCreadas && (
        <ModalOrdenesCreadas
          filas={ordenesCreadas}
          onCerrar={() => setOrdenesCreadas(null)}
        />
      )}

      {cdpInvalidos && (
        <ModalCdpInvalidos
          filas={cdpInvalidos}
          onCerrar={() => setCdpInvalidos(null)}
        />
      )}

      {ofertasPendientes && (
        <ModalOfertas
          filas={ofertasPendientes}
          onConfirmar={(incluidas) => {
            const dec: Record<string, boolean> = {};
            for (const f of ofertasPendientes) dec[f.clave] = incluidas.has(f.clave);
            ejecutarGeneracion(dec);
          }}
        />
      )}

      {revisionNoCDP && (
        <ModalRevisionClientes
          clientes={revisionNoCDP}
          onAceptar={() => ejecutarGeneracion()}
          onCorregir={() => {
            setRevisionNoCDP(null);
            msg("Corrija el Excel de órdenes y vuelva a cargarlo", "info");
          }}
        />
      )}
    </main>
  );
}

// Pop-up de vigencia: lee el rango de fechas incluido en el nombre de cada
// promoción y lo compara con la fecha de hoy para saber cuáles siguen activas.
function ModalVigencia({
  promos,
  onCerrar,
}: {
  promos: Promocion[];
  onCerrar: () => void;
}) {
  const [filtros, setFiltros] = useState<Set<VigenciaPromocion["estado"]>>(new Set());
  const lista = useMemo(() => analizarVigenciaPromos(promos), [promos]);
  const cuenta = (e: VigenciaPromocion["estado"]) => lista.filter((p) => p.estado === e).length;
  const visibles = filtros.size === 0 ? lista : lista.filter((p) => filtros.has(p.estado));
  const etiqueta: Record<VigenciaPromocion["estado"], string> = {
    activa: "Activa",
    vencida: "Vencida",
    proxima: "Por iniciar",
    "sin-fecha": "Sin fecha en el nombre",
  };
  const color: Record<VigenciaPromocion["estado"], string> = {
    activa: "text-emerald-600 dark:text-emerald-400",
    vencida: "text-destructive",
    proxima: "text-amber-600 dark:text-amber-400",
    "sin-fecha": "text-muted-foreground",
  };
  const hoy = new Date();
  const opciones: Array<{ id: VigenciaPromocion["estado"]; texto: string }> = [
    { id: "activa", texto: `Activas (${cuenta("activa")})` },
    { id: "vencida", texto: `Vencidas (${cuenta("vencida")})` },
    { id: "proxima", texto: `Por iniciar (${cuenta("proxima")})` },
    { id: "sin-fecha", texto: `Sin fecha (${cuenta("sin-fecha")})` },
  ];
  return (
    <Overlay>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">Vigencia de promociones</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Fechas tomadas del nombre de la promoción, comparadas con hoy{" "}
            {hoy.toLocaleDateString("es-SV")}.
          </p>
        </div>
        <button
          onClick={onCerrar}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
        >
          Cerrar
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        {opciones.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={filtros.has(o.id)}
              onChange={() => setFiltros((actuales) => {
                const siguientes = new Set(actuales);
                if (siguientes.has(o.id)) siguientes.delete(o.id);
                else siguientes.add(o.id);
                return siguientes;
              })}
              className="h-3.5 w-3.5 accent-foreground"
            />
            {o.texto}
          </label>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">Sin promociones en esta categoría.</p>
      ) : (
        <div className="mt-3 max-h-80 overflow-auto rounded-md border border-border">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                {["Promoción", "Código", "Desde", "Hasta", "Estado", "Días restantes"].map((h) => (
                  <th key={h} className="border-b border-border px-2 py-1.5 text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((p, i) => (
                <tr key={i}>
                  <td className="border-b border-border/60 px-2 py-1.5">{p.promocion}</td>
                  <td className="border-b border-border/60 px-2 py-1.5">{p.codigo}</td>
                  <td className="whitespace-nowrap border-b border-border/60 px-2 py-1.5">
                    {p.desde || "—"}
                  </td>
                  <td className="whitespace-nowrap border-b border-border/60 px-2 py-1.5">
                    {p.hasta || "—"}
                  </td>
                  <td
                    className={
                      "whitespace-nowrap border-b border-border/60 px-2 py-1.5 font-medium " +
                      color[p.estado]
                    }
                  >
                    {etiqueta[p.estado]}
                  </td>
                  <td className="whitespace-nowrap border-b border-border/60 px-2 py-1.5 tabular-nums">
                    {p.diasRestantes === null
                      ? "—"
                      : p.diasRestantes >= 0
                        ? `${p.diasRestantes} días`
                        : `venció hace ${Math.abs(p.diasRestantes)} días`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Overlay>
  );
}


// Convierte "YYYY-MM-DD" a "DD/MM/YYYY" para mostrarlo en pantalla.
function fechaLegible(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Pop-up bloqueante: hay códigos CDP que no respetan la estructura
// CDP + (CON|MAD|MET) + (ORO|PLATA|PLATINO) + número, todo junto.
// Pop-up bloqueante: hay órdenes en estado "creada" que deben confirmarse en
// KOLO antes de poder generar el reporte.
function ModalOrdenesCreadas({
  filas,
  onCerrar,
}: {
  filas: OrdenCreada[];
  onCerrar: () => void;
}) {
  return (
    <Overlay>
      <h2 className="text-sm font-medium text-destructive">
        Hay órdenes sin confirmar ni anular
      </h2>
      <p className="mt-2 text-xs text-muted-foreground">
        Estas órdenes tienen un estado distinto de CONFIRMADA o ANULADA. Favor actualizar en KOLO y
        volver a subir el Excel.
      </p>
      <Tabla
        columnas={["Fecha", "Código de generación", "Código de cliente", "Cliente", "Estado"]}
        filas={filas.map((f) => [f.fecha, f.codigo, f.cliente, f.nombre, f.estado])}
        vacio="Sin registros."
      />
      <div className="mt-4 flex justify-end">
        <button
          onClick={onCerrar}
          className="rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background"
        >
          Entendido, las confirmaré en KOLO
        </button>
      </div>
    </Overlay>
  );
}

// Pop-up: productos en OFERTA (colores seleccionados) cuyo documento no trae
// el código de la promoción. El usuario decide cuáles incluir; a los incluidos
// se les asigna automáticamente el código que les corresponde.
function ModalOfertas({
  filas,
  onConfirmar,
}: {
  filas: PriceOffPendiente[];
  onConfirmar: (incluidas: Set<string>) => void;
}) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(filas.map((f) => f.clave)));
  const alternar = (c: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });
  return (
    <Overlay>
      <h2 className="text-sm font-medium">¿Desea incluir estos productos en oferta en el reporte?</h2>
      <p className="mt-2 text-xs text-muted-foreground">
        Estos productos son color seleccionado / price off, pero en su factura o CCF no se registró
        el código de la promoción. Si los incluye, se les asignará automáticamente el código indicado.
      </p>
      <div className="mt-4 max-h-72 overflow-auto rounded-md border border-border">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {["Incluir", "Documento", "Fecha", "Cliente", "SKU", "Producto", "Cant.", "Código a asignar"].map((h) => (
                <th key={h} className="border-b border-border px-2 py-1.5 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave}>
                <td className="border-b border-border/60 px-2 py-1.5">
                  <input type="checkbox" checked={sel.has(f.clave)} onChange={() => alternar(f.clave)} />
                </td>
                <td className="border-b border-border/60 px-2 py-1.5">{f.documento}</td>
                <td className="border-b border-border/60 px-2 py-1.5">{f.fecha}</td>
                <td className="border-b border-border/60 px-2 py-1.5">{f.cliente}</td>
                <td className="border-b border-border/60 px-2 py-1.5">{f.sku}</td>
                <td className="border-b border-border/60 px-2 py-1.5">{f.producto}</td>
                <td className="border-b border-border/60 px-2 py-1.5 tabular-nums">{f.cantidad}</td>
                <td className="border-b border-border/60 px-2 py-1.5 font-medium">{f.codigo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={() => onConfirmar(new Set())}
          className="rounded-md border border-border px-4 py-2 text-xs font-medium"
        >
          No incluir ninguno
        </button>
        <button
          onClick={() => onConfirmar(sel)}
          className="rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background"
        >
          Sí, incluir seleccionados ({sel.size})
        </button>
      </div>
    </Overlay>
  );
}

function ModalCdpInvalidos({
  filas,
  onCerrar,
}: {
  filas: CodigoCDPInvalido[];
  onCerrar: () => void;
}) {
  return (
    <Overlay>
      <h2 className="text-sm font-medium text-destructive">
        Códigos CDP con estructura incorrecta
      </h2>
      <p className="mt-2 text-xs text-muted-foreground">
        Estos clientes no cumplen la estructura obligatoria (CDP + CON/MAD/MET +
        ORO/PLATA/PLATINO + número, todo junto). Favor subirlos a KOLO, corregir el Excel de
        órdenes y volver a cargar los archivos.
      </p>
      <div className="mt-4 max-h-72 overflow-auto rounded-md border border-border">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {["Código", "Veces", "Problema"].map((h) => (
                <th key={h} className="border-b border-border px-2 py-1.5 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.codigo}>
                <td className="border-b border-border/60 px-2 py-1.5">{f.codigo}</td>
                <td className="border-b border-border/60 px-2 py-1.5 tabular-nums">{f.cantidad}</td>
                <td className="border-b border-border/60 px-2 py-1.5">{f.motivo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          onClick={onCerrar}
          className="rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background"
        >
          Entendido, corregiré el Excel
        </button>
      </div>
    </Overlay>
  );
}

// Pop-up de revisión obligatoria: obliga a recorrer toda la lista de clientes
// que NO son CDP antes de habilitar el botón de conformidad.
function ModalRevisionClientes({
  clientes,
  onAceptar,
  onCorregir,
}: {
  clientes: CodigoCliente[];
  onAceptar: () => void;
  onCorregir: () => void;
}) {
  const [revisado, setRevisado] = useState(clientes.length === 0);
  // Si la lista cabe completa en pantalla no hay nada que desplazar:
  // se considera revisada de inmediato.
  const medirRef = (el: HTMLDivElement | null) => {
    if (el && el.scrollHeight <= el.clientHeight + 8) setRevisado(true);
  };
  return (
    <Overlay>
      <h2 className="text-sm font-medium">¿Está de acuerdo que estos clientes NO son CDP?</h2>
      <p className="mt-2 text-xs text-muted-foreground">
        Revise la lista completa antes de continuar; así puede detectar códigos mal escritos.
      </p>
      <div
        ref={medirRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setRevisado(true);
        }}
        className="mt-4 max-h-72 overflow-auto rounded-md border border-border"
      >
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {["Código de cliente", "Órdenes"].map((h) => (
                <th key={h} className="border-b border-border px-2 py-1.5 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clientes.length === 0 ? (
              <tr>
                <td className="px-2 py-2 text-muted-foreground" colSpan={2}>
                  Todos los clientes tienen código CDP válido.
                </td>
              </tr>
            ) : (
              clientes.map((c) => (
                <tr key={c.codigo}>
                  <td className="border-b border-border/60 px-2 py-1.5">{c.codigo}</td>
                  <td className="border-b border-border/60 px-2 py-1.5 tabular-nums">
                    {c.cantidad}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!revisado && (
        <p className="mt-2 text-xs text-muted-foreground">
          Desplácese hasta el final de la lista para habilitar la confirmación.
        </p>
      )}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          onClick={onCorregir}
          className="rounded-md border border-border px-4 py-2 text-xs font-medium"
        >
          No, déjame corregir el Excel y KOLO
        </button>
        <button
          onClick={onAceptar}
          disabled={!revisado}
          className="rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background disabled:opacity-40"
        >
          Sí, estoy de acuerdo
        </button>
      </div>
    </Overlay>
  );
}

// Pop up con el detalle del indicador en el que se dio clic.
function ModalKpi({
  id,
  ind,
  onCerrar,
}: {
  id: string;
  ind: Indicadores;
  onCerrar: () => void;
}) {
  const clientes = ind.detalleCodigosClienteUnicos;
  // Listados que alimentan los pop-ups de órdenes e ítems.
  const filasOrdenes = (l: typeof ind.listaOrdenes) =>
    l.map((o) => [
      o.documento,
      o.fecha,
      o.cliente,
      o.nombreCliente,
      o.estado || (o.confirmada ? "Confirmada" : "—"),
    ]);
  // En las órdenes creadas se muestra el CÓDIGO de la orden en KOLO,
  // no el número de documento.
  const filasOrdenesCreadas = (l: typeof ind.listaOrdenes) =>
    l.map((o) => [
      o.fecha,
      o.codigo,
      o.cliente,
      o.nombreCliente,
      o.estado || (o.creada ? "Creada" : "—"),
    ]);
  const filasItems = (l: typeof ind.listaItems) =>
    l.map((i) => [i.sku, i.nombre, i.documento, i.fecha, i.cantidad.toLocaleString("es-SV")]);
  const colOrdenes = [
    "N.º de documento",
    "Fecha",
    "Código de cliente",
    "Nombre de cliente",
    "Estado",
  ];
  const colOrdenesCreadas = [
    "Fecha",
    "Código de generación",
    "Código de cliente",
    "Cliente",
    "Estado",
  ];
  const colItems = ["SKU", "Nombre de ítem", "N.º de documento", "Fecha", "Cantidad"];

  const conf: Record<string, { titulo: string; valor: number; cuerpo: React.ReactNode }> = {
    "ordenes-total": {
      titulo: "Total de registros de órdenes",
      valor: ind.totalOrdenesCargadas,
      cuerpo: <Tabla columnas={colOrdenes} filas={filasOrdenes(ind.listaOrdenes)} vacio="Sin órdenes." />,
    },
    "ordenes-confirmadas": {
      titulo: "Órdenes confirmadas",
      valor: ind.totalOrdenesConfirmadas,
      cuerpo: (
        <Tabla
          columnas={colOrdenes}
          filas={filasOrdenes(ind.listaOrdenes.filter((o) => o.confirmada))}
          vacio="Sin registros."
        />
      ),
    },
    "ordenes-no-confirmadas": {
      titulo: "Órdenes no confirmadas",
      valor: ind.totalOrdenesNoConfirmadas,
      cuerpo: (
        <Tabla
          columnas={colOrdenes}
          filas={filasOrdenes(ind.listaOrdenes.filter((o) => !o.confirmada))}
          vacio="Sin registros."
        />
      ),
    },
    "ordenes-creadas": {
      titulo: "Órdenes pendientes de actualizar en KOLO",
      valor: ind.totalOrdenesCreadas,
      cuerpo: (
        <Tabla
          columnas={colOrdenesCreadas}
          filas={filasOrdenesCreadas(ind.listaOrdenes.filter((o) => o.creada))}
          vacio="Sin registros."
        />
      ),
    },
    "items-total": {
      titulo: "Total de registros de ítems",
      valor: ind.totalItemsCargados,
      cuerpo: <Tabla columnas={colItems} filas={filasItems(ind.listaItems)} vacio="Sin ítems." />,
    },
    "items-confirmados": {
      titulo: "Ítems confirmados",
      valor: ind.totalItemsConfirmados,
      cuerpo: (
        <Tabla
          columnas={colItems}
          filas={filasItems(ind.listaItems.filter((i) => i.confirmado))}
          vacio="Sin registros."
        />
      ),
    },
    "items-no-confirmados": {
      titulo: "Ítems no confirmados",
      valor: ind.totalItemsNoConfirmados,
      cuerpo: (
        <Tabla
          columnas={colItems}
          filas={filasItems(ind.listaItems.filter((i) => !i.confirmado))}
          vacio="Sin registros."
        />
      ),
    },
    "items-confirmados-cdp": {
      titulo: "Ítems confirmados para CDP",
      valor: ind.totalItemsConfirmadosCDP,
      cuerpo: (
        <Tabla
          columnas={["N.º de documento", "Fecha", "Cliente", "Producto", "Cantidad"]}
          filas={ind.detalleItemsConfirmadosCDP.map((d) => [
            d.documento,
            d.fecha,
            d.cliente,
            d.producto,
            d.cantidad.toLocaleString("es-SV"),
          ])}
          vacio="Sin ítems confirmados vendidos a clientes CDP."
        />
      ),
    },
    "clientes-todos": {
      titulo: "Total de clientes diferentes",
      valor: ind.totalClientesUnicos,
      cuerpo: <TablaClientes clientes={clientes} />,
    },
    "clientes-cdp": {
      titulo: "Clientes CDP",
      valor: ind.totalClientesCDP,
      cuerpo: <TablaClientes clientes={clientes.filter((c) => c.esCDP)} />,
    },
    "clientes-nocdp": {
      titulo: "Clientes no CDP",
      valor: ind.totalClientesNoCDP,
      cuerpo: <TablaClientes clientes={clientes.filter((c) => !c.esCDP)} />,
    },
    promociones: {
      titulo: "Total de promociones registradas",
      valor: ind.totalPromocionesRegistradas,
      cuerpo: (
        <div className="space-y-5">
          <Resumen
            filas={[
              ["Promociones validadas", ind.totalItemsConPromocion],
              ["Promociones inválidas", ind.totalItemsPromocionErroneos],
              ["Total registradas", ind.totalPromocionesRegistradas],
            ]}
          />
          <div>
            <h3 className="mb-2 text-xs font-medium">
              Promociones validadas ({ind.totalItemsConPromocion})
            </h3>
            <Tabla
          columnas={["Código", "Promoción", "Categoría", "Ítems"]}
          filas={ind.detallePromocionesAplicadas.map((p) => [
            p.codigo,
            p.nombre,
            p.categoria,
            p.cantidad.toLocaleString("es-SV"),
          ])}
          vacio="Sin promociones aplicadas"
        />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium">
              Promociones inválidas ({ind.totalItemsPromocionErroneos})
            </h3>
            <Tabla
          columnas={["Documento", "SKU", "Ítem", "Cantidad", "Motivo"]}
          filas={ind.detallePromocionesErroneas.map((p) => [
            p.documento,
            p.sku,
            p.item,
            String(p.cantidad),
            p.motivo,
          ])}
          vacio="Todas las promociones se pudieron resolver correctamente."
        />
          </div>
        </div>
      ),
    },
    "promociones-validas": {
      titulo: "Promociones validadas",
      valor: ind.totalItemsConPromocion,
      cuerpo: <Tabla
          columnas={["Código", "Promoción", "Categoría", "Ítems"]}
          filas={ind.detallePromocionesAplicadas.map((p) => [
            p.codigo,
            p.nombre,
            p.categoria,
            p.cantidad.toLocaleString("es-SV"),
          ])}
          vacio="Sin promociones aplicadas"
        />,
    },
    "promociones-invalidas": {
      titulo: "Promociones inválidas",
      valor: ind.totalItemsPromocionErroneos,
      cuerpo: <Tabla
          columnas={["Documento", "SKU", "Ítem", "Cantidad", "Motivo"]}
          filas={ind.detallePromocionesErroneas.map((p) => [
            p.documento,
            p.sku,
            p.item,
            String(p.cantidad),
            p.motivo,
          ])}
          vacio="Todas las promociones se pudieron resolver correctamente."
        />,
    },
    "descuentos-cdp": {
      titulo: "Ítems con Desc. CDP",
      valor: ind.totalItemsDescuentoCDP,
      cuerpo: (
        <Tabla
          columnas={["N.º de documento", "Fecha", "Cliente", "Producto", "Cantidad"]}
          filas={ind.detalleDescuentosCDP.map((d) => [
            d.documento,
            d.fecha,
            d.cliente,
            d.producto,
            d.cantidad.toLocaleString("es-SV"),
          ])}
          vacio="Sin ítems con descuento CDP."
        />
      ),
    },
  };

  const info = conf[id];
  if (!info) return null;
  return (
    <Overlay>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">{info.titulo}</h2>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {info.valor.toLocaleString("es-SV")}
          </p>
        </div>
        <button
          onClick={onCerrar}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
        >
          Cerrar
        </button>
      </div>
      <div className="mt-4">{info.cuerpo}</div>
    </Overlay>
  );
}

function Resumen({ filas }: { filas: [string, number][] }) {
  return (
    <dl className="divide-y divide-border rounded-md border border-border text-xs">
      {filas.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between px-3 py-2">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="tabular-nums">{v.toLocaleString("es-SV")}</dd>
        </div>
      ))}
    </dl>
  );
}

function Tabla({
  columnas,
  filas,
  vacio,
}: {
  columnas: string[];
  filas: string[][];
  vacio: string;
}) {
  // Búsqueda libre + filtros por valor (casillas) en cada columna, al estilo
  // del autofiltro de Excel: se listan los valores distintos de la columna y
  // el usuario marca los que quiere ver.
  const [q, setQ] = useState("");
  const [seleccion, setSeleccion] = useState<Record<number, Set<string>>>({});
  const [abierta, setAbierta] = useState<number | null>(null);

  // Valores distintos por columna (sólo se ofrece filtro si son pocos)
  const valoresPorColumna = useMemo(() => {
    return columnas.map((_, i) => {
      const set = new Set<string>();
      for (const f of filas) set.add(String(f[i] ?? ""));
      return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
    });
  }, [columnas, filas]);

  if (!filas.length) return <p className="text-xs text-muted-foreground">{vacio}</p>;

  const term = q.trim().toLowerCase();
  const visibles = filas.filter((f) => {
    for (const clave of Object.keys(seleccion)) {
      const i = Number(clave);
      const sel = seleccion[i];
      if (sel && sel.size > 0 && !sel.has(String(f[i] ?? ""))) return false;
    }
    if (!term) return true;
    return f.some((c) => String(c ?? "").toLowerCase().includes(term));
  });

  const alternar = (col: number, valor: string) =>
    setSeleccion((actual) => {
      const copia = { ...actual };
      const set = new Set(copia[col] ?? []);
      if (set.has(valor)) set.delete(valor);
      else set.add(valor);
      copia[col] = set;
      return copia;
    });

  const hayFiltros = Object.values(seleccion).some((s) => s.size > 0);

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar en toda la tabla…"
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-foreground/40"
        />
        {hayFiltros && (
          <button
            type="button"
            onClick={() => setSeleccion({})}
            className="whitespace-nowrap rounded-md border border-border px-2 py-1 text-[11px]"
          >
            Limpiar filtros
          </button>
        )}
        <span className="whitespace-nowrap text-[11px] text-muted-foreground tabular-nums">
          {visibles.length} de {filas.length}
        </span>
      </div>
      <div className="max-h-72 overflow-auto rounded-md border border-border">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              {columnas.map((c, i) => {
                const valores = valoresPorColumna[i];
                const filtrable = valores.length > 1 && valores.length <= 40;
                const activos = seleccion[i]?.size ?? 0;
                return (
                  <th
                    key={c}
                    className="relative border-b border-border px-2 py-1.5 text-left font-medium"
                  >
                    <div className="flex items-center gap-1">
                      <span>{c}</span>
                      {filtrable && (
                        <button
                          type="button"
                          onClick={() => setAbierta(abierta === i ? null : i)}
                          className={
                            "rounded px-1 text-[10px] leading-4 " +
                            (activos ? "bg-foreground text-background" : "text-muted-foreground")
                          }
                          title={`Filtrar ${c}`}
                        >
                          ▾{activos ? ` ${activos}` : ""}
                        </button>
                      )}
                    </div>
                    {filtrable && abierta === i && (
                      <div className="absolute left-0 top-full z-20 mt-1 max-h-56 w-56 overflow-auto rounded-md border border-border bg-background p-2 shadow-lg">
                        {valores.map((v) => (
                          <label
                            key={v}
                            className="flex items-center gap-2 py-0.5 text-[11px] font-normal"
                          >
                            <input
                              type="checkbox"
                              checked={seleccion[i]?.has(v) ?? false}
                              onChange={() => alternar(i, v)}
                              className="h-3.5 w-3.5 accent-foreground"
                            />
                            <span className="truncate">{v || "(vacío)"}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibles.map((f, i) => (
              <tr key={i}>
                {f.map((c, j) => (
                  <td key={j} className="border-b border-border/60 px-2 py-1.5">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Tabla de clientela: código, nombre y cantidad de órdenes
function TablaClientes({ clientes }: { clientes: CodigoCliente[] }) {
  return (
    <Tabla
      columnas={["Código de cliente", "Nombre", "Órdenes"]}
      filas={clientes.map((c) => [c.codigo, c.nombre || "—", c.cantidad.toLocaleString("es-SV")])}
      vacio="Sin clientes en esta categoría"
    />
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-background p-5 shadow-lg">
        {children}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";
const fileInputCls =
  "w-full text-xs file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium";


function SectionTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={
        "mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground " + className
      }
    >
      {children}
    </h2>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function EstadoArchivo({
  titulo,
  nombre,
  filas,
}: {
  titulo: string;
  nombre?: string;
  filas: number;
}) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="font-medium text-foreground">{titulo}</p>
      <p className="mt-0.5 truncate text-muted-foreground">
        {filas ? `${nombre ?? "Cargado"} — ${filas} filas` : "Pendiente"}
      </p>
    </div>
  );
}

// Columna de indicadores (Órdenes, Ítems vendidos, Clientela, Aspectos del reporte)
function KpiGrupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

// Cada indicador es un botón: al dar clic se abre su detalle en pop up
function Kpi({
  label,
  value,
  onClick,
}: {
  label: string;
  value?: number;
  onClick?: () => void;
}) {
  const activo = typeof value === "number" && Boolean(onClick);
  return (
    <button
      type="button"
      onClick={activo ? onClick : undefined}
      disabled={!activo}
      className={
        "w-full p-4 text-left transition " +
        (activo ? "hover:bg-muted" : "cursor-default opacity-80")
      }
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {typeof value === "number" ? value.toLocaleString("es-SV") : "—"}
      </div>
    </button>
  );
}

function DetalleList({
  titulo,
  vacio,
  items,
  filtroCDP = false,
}: {
  titulo: string;
  vacio: string;
  items: { clave: string; nombre?: string; cantidad: number; esCDP?: boolean }[];
  filtroCDP?: boolean;
}) {
  const [soloCDP, setSoloCDP] = useState(false);
  const visibles =
    filtroCDP && soloCDP
      ? items.filter((i) => i.esCDP ?? i.clave.toUpperCase().includes("CDP"))
      : items;
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{titulo}</h3>
        {filtroCDP && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={soloCDP}
              onChange={(e) => setSoloCDP(e.target.checked)}
              className="h-3.5 w-3.5 accent-foreground"
            />
            Solo CDP
          </label>
        )}
      </div>
      {visibles.length === 0 ? (
        <p className="text-xs text-muted-foreground">{vacio}</p>
      ) : (

        <div className="max-h-60 overflow-auto">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="border-b border-border px-2 py-1.5 text-left font-medium">Código</th>
                {items.some((i) => i.nombre) && (
                  <th className="border-b border-border px-2 py-1.5 text-left font-medium">Nombre</th>
                )}
                <th className="border-b border-border px-2 py-1.5 text-right font-medium">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((item, i) => (
                <tr key={i}>
                  <td className="border-b border-border/60 px-2 py-1.5">{item.clave}</td>
                  {items.some((i) => i.nombre) && (
                    <td className="border-b border-border/60 px-2 py-1.5">{item.nombre || "—"}</td>
                  )}
                  <td className="border-b border-border/60 px-2 py-1.5 text-right tabular-nums">
                    {item.cantidad.toLocaleString("es-SV")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Tabla resumen del reporte: una fila por ítem vendido confirmado.
function TablaResumen({ filas }: { filas: ResumenItem[] }) {
  const [busqueda, setBusqueda] = useState("");
  // Filtro por tipo de fila: todo / solo lo que entra al reporte /
  // solo descuentos CDP / solo promociones.
  const [filtro, setFiltro] = useState<"todo" | "reporte" | "cdp" | "promo">("todo");
  const [limite, setLimite] = useState(300);
  const q = busqueda.trim().toLowerCase();
  const filtradas = filas.filter((f) => {
    if (filtro === "reporte" && !f.enReporte) return false;
    if (filtro === "cdp" && !f.descuentoCDP) return false;
    if (filtro === "promo" && !f.enReportePromo) return false;
    if (!q) return true;
    return (
      f.dte.toLowerCase().includes(q) ||
      f.codigoCliente.toLowerCase().includes(q) ||
      f.nombreCliente.toLowerCase().includes(q) ||
      f.sku.toLowerCase().includes(q) ||
      f.nombreItem.toLowerCase().includes(q)
    );
  });
  const visibles = filtradas.slice(0, limite);
  const sn = (v: boolean) => (v ? "Sí" : "No");
  const totalCdp = filas.filter((f) => f.descuentoCDP).length;
  const totalPromo = filas.filter((f) => f.enReportePromo).length;
  const cols = [
    "Número de DTE",
    "Tipo de documento",
    "Fecha",
    "Código de Cliente",
    "Tipo CDP",
    "Número de CDP",
    "Nombre de Cliente",
    "SKU",
    "Nombre de ítem",
    "Cantidad",
    "Precio",
    "Producto con descuento CDP",
    "Promoción",
    "Promoción coincide con Promocional",
    "Color seleccionado",
    "Está en reporte a generar",
  ];
  const opciones: Array<{ id: typeof filtro; texto: string }> = [
    { id: "todo", texto: `Todo (${filas.length})` },
    { id: "reporte", texto: `En el reporte (${filas.filter((f) => f.enReporte).length})` },
    { id: "cdp", texto: `Descuentos CDP (${totalCdp})` },
    { id: "promo", texto: `Promociones (${totalPromo})` },
  ];
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setLimite(300);
          }}
          placeholder="Buscar por DTE, cliente, SKU o ítem"
          className="w-72 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
        <div className="flex flex-wrap gap-1">
          {opciones.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                setFiltro(o.id);
                setLimite(300);
              }}
              className={
                "rounded-md border px-2.5 py-1 text-xs transition-colors " +
                (filtro === o.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted")
              }
            >
              {o.texto}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          Mostrando {visibles.length} de {filtradas.length} ítems.
        </span>
        {filtradas.length > visibles.length && (
          <button
            type="button"
            onClick={() => setLimite((n) => n + 500)}
            className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
          >
            Mostrar más
          </button>
        )}
      </div>
      <div className="max-h-[28rem] overflow-auto rounded-lg border border-border">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {cols.map((c) => (
                <th
                  key={c}
                  className="whitespace-nowrap border-b border-border px-3 py-2 text-left font-medium"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((f, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-1.5">{f.dte}</td>
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-1.5">{f.tipoDocumento}</td>
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-1.5">{f.fecha}</td>
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-1.5">{f.codigoCliente}</td>
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-1.5">{f.tipoCDP}</td>
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-1.5">{f.numeroCDP}</td>
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-1.5">{f.nombreCliente}</td>
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-1.5">{f.sku}</td>
                <td className="border-b border-border/60 px-3 py-1.5">{f.nombreItem}</td>
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-1.5 text-right">{f.cantidad}</td>
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-1.5 text-right">{f.precio}</td>
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-1.5">{sn(f.descuentoCDP)}</td>
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-1.5">{sn(f.promocion)}</td>
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-1.5">{sn(f.promocionCoincide)}</td>
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-1.5">{sn(f.colorSeleccionado)}</td>
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-1.5">{sn(f.enReporte)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
