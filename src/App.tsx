// App.tsx — Interfaz de usuario del Consolidador Multi-Hoja.
// Es un único componente React (App) que:
//  1) Carga las plantillas (CDP y Promociones) apenas se abre la app.
//  2) Deja que el usuario suba los 3 archivos fuente (Ítems, Órdenes, Productos)
//     y opcionalmente promociones (por .txt o una por una).
//  3) Al presionar "Generar y previsualizar", llama a generarReporte()
//     (toda la lógica pesada vive en src/lib/consolidador.ts) y muestra los
//     indicadores (KPIs) y una vista previa de cada hoja resultante.
//  4) Permite descargar el archivo Excel final.
// Al final del archivo hay varios componentes pequeños reutilizables
// (SectionTitle, Field, FileField, Kpi, DetalleList) que solo dan formato.
import React from "react";
import { useEffect, useRef, useState } from "react";
import {
  descargarBlob,
  generarReporte,
  leerArchivoTabular,
  leerPlantillaDesdeUrl,
  parsearTxtPromos,
  type GenerarResultado,
  type PlantillaState,
  type Promocion,
  type Row,
} from "@/lib/consolidador";
import { plantillaCdp } from "@/assets/plantillaCdp";
import { plantillaProm } from "@/assets/plantillaProm";
import { logoTb } from "@/assets/logoTb";
import { logoSw } from "@/assets/logoSw";


// Mensaje temporal que se muestra arriba del formulario (éxito/error/info).
type Estado = { msg: string; tipo: "success" | "error" | "info" } | null;

export default function App() {
  // --- Datos cargados por el usuario (ya convertidos a filas) ---
  const [items, setItems] = useState<Row[]>([]);
  const [ordenes, setOrdenes] = useState<Row[]>([]);
  const [productos, setProductos] = useState<Row[]>([]);
  // --- Plantillas Excel incrustadas en la app (CDP y Promociones) ---
  const [plantilla, setPlantilla] = useState<PlantillaState | null>(null);
  const [plantilla2, setPlantilla2] = useState<PlantillaState | null>(null);
  const [plantillasError, setPlantillasError] = useState(false);
  // --- Promociones ingresadas manualmente o por archivo .txt ---
  const [promos, setPromos] = useState<Promocion[]>([]);
  const [nombrePromo, setNombrePromo] = useState("");
  const [codigoPromo, setCodigoPromo] = useState("");
  // --- Rango de fechas del reporte ---
  const [periodoDesde, setPeriodoDesde] = useState("");
  const [periodoHasta, setPeriodoHasta] = useState("");
  // --- Estado de la interfaz: mensajes, spinner de generación, resultado y pestaña activa ---
  const [estado, setEstado] = useState<Estado>(null);
  const [generando, setGenerando] = useState(false);
  const [resultado, setResultado] = useState<GenerarResultado | null>(null);
  const [hojaActiva, setHojaActiva] = useState(0);

  // Referencias a los <input type="file"> para poder vaciarlos manualmente
  // (limpiar el nombre de archivo mostrado) después de leer o al reiniciar.
  const refItems = useRef<HTMLInputElement>(null);
  const refOrdenes = useRef<HTMLInputElement>(null);
  const refProductos = useRef<HTMLInputElement>(null);
  const refTxt = useRef<HTMLInputElement>(null);

  // Al montar el componente, carga las dos plantillas que vienen incrustadas
  // en la app (como base64 en src/assets) — el usuario no tiene que subirlas.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [p1, p2] = await Promise.all([
          leerPlantillaDesdeUrl(plantillaCdp, "reporte_cdp.xlsx"),
          leerPlantillaDesdeUrl(plantillaProm, "reporte_promociones.xlsx"),
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

  /** Muestra un mensaje temporal (5 segundos) arriba del formulario. */
  const msg = (texto: string, tipo: "success" | "error" | "info") => {
    setEstado({ msg: texto, tipo });
    window.setTimeout(() => setEstado(null), 5000);
  };

  /** Lee un archivo (Ítems, Órdenes o Productos) y lo guarda en su estado correspondiente. */
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

  /** Lee un archivo .txt de carga masiva de promociones y reemplaza la lista actual. */
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

  /** Agrega una promoción individual desde los campos de nombre/código del formulario. */
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

  /** Reinicia todo el formulario: borra archivos cargados, promociones y el resultado generado. */
  const limpiar = () => {
    setItems([]);
    setOrdenes([]);
    setProductos([]);
    setPromos([]);
    setResultado(null);
    setHojaActiva(0);
    [refItems, refOrdenes, refProductos, refTxt].forEach((r) => {
      if (r.current) r.current.value = "";
    });
    msg("Todo limpiado", "success");
  };

  /**
   * Valida que estén los datos mínimos y llama a generarReporte() (la lógica
   * pesada de src/lib/consolidador.ts) para construir el Excel consolidado.
   * Se pide "descargar: false" porque aquí solo se quiere previsualizar; la
   * descarga real ocurre después, al presionar el botón "Descargar".
   */
  const generar = () => {
    if (!items.length || !ordenes.length || !productos.length) {
      msg("Faltan archivos obligatorios", "error");
      return;
    }
    if (!plantilla) {
      msg("Las plantillas aún no terminan de cargar", "error");
      return;
    }
    if (!periodoDesde || !periodoHasta) {
      msg("Seleccione el rango de fechas del reporte", "error");
      return;
    }
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
          periodoDesde,
          periodoHasta,
          descargar: false,
        });
        setResultado(r);
        setHojaActiva(0);
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
            <div className="hidden h-8 w-px bg-border sm:block" />
            <div className="hidden sm:block">
              <h1 className="text-sm font-medium tracking-tight">Consolidador Multi-Hoja</h1>
              <p className="text-xs text-muted-foreground">
                Procesamiento local, sin subir datos a servidores
              </p>
            </div>
          </div>
          <img src={logoSw} alt="Sherwin Williams" className="h-8 w-auto rounded" />
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-12 px-6 py-10">
        {/* Indicadores clave arriba */}
        <section>
          <SectionTitle>Indicadores clave</SectionTitle>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-3">
            <Kpi label="Órdenes cargadas" value={resultado?.indicadores.totalOrdenesCargadas} />
            <Kpi label="Ítems cargados" value={resultado?.indicadores.totalItemsCargados} />
            <Kpi
              label="Órdenes confirmadas"
              value={resultado?.indicadores.totalOrdenesConfirmadas}
            />
            <Kpi
              label="Órdenes no confirmadas"
              value={resultado?.indicadores.totalOrdenesNoConfirmadas}
            />
            <Kpi label="Ítems confirmados" value={resultado?.indicadores.totalItemsConfirmados} />
            <Kpi label="Ítems no confirmados" value={resultado?.indicadores.totalItemsNoConfirmados} />
            <Kpi
              label="Ítems con descuento CDP en reporte"
              value={resultado?.indicadores.totalItemsDescuentoCDP}
            />
            <Kpi
              label="Ítems con promociones"
              value={resultado?.indicadores.totalItemsConPromocion}
            />
            <Kpi
              label="Ítems con promociones erróneas"
              value={resultado?.indicadores.totalItemsPromocionErroneos}
            />
            <Kpi
              label="CDP con descuento distinto a su categoría"
              value={resultado?.indicadores.totalCdpDescuentoDistintoCategoria}
            />
          </div>
          {!resultado && (
            <p className="mt-3 text-xs text-muted-foreground">
              Los indicadores se calculan al generar el reporte.
            </p>
          )}
        </section>

        {resultado && (
          <section>
            <SectionTitle>Detalles</SectionTitle>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <DetalleList
                titulo="Promociones aplicadas"
                vacio="Sin promociones aplicadas"
                items={resultado.indicadores.detallePromocionesAplicadas.map((p) => ({
                  clave: p.codigo,
                  nombre: p.nombre,
                  cantidad: p.cantidad,
                }))}
              />
              <DetalleList
                titulo="Códigos de cliente únicos"
                vacio="Sin códigos de cliente"
                items={resultado.indicadores.detalleCodigosClienteUnicos.map((c) => ({
                  clave: c.codigo,
                  cantidad: c.cantidad,
                  esCDP: c.esCDP,
                }))}
                filtroCDP
              />
            </div>
            <div className="mt-6 rounded-lg border border-border p-4">
              <h3 className="mb-3 text-sm font-medium">
                CDP con descuento distinto a su categoría
              </h3>
              {resultado.indicadores.detalleCdpDescuentoAtipico.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Todos los descuentos CDP coinciden con el precio de su categoría.
                </p>
              ) : (
                <div className="max-h-60 overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        {["Documento", "Código CDP", "Tipo", "SKU", "Aplicado", "Esperado"].map(
                          (h) => (
                            <th
                              key={h}
                              className="border-b border-border px-2 py-1.5 text-left font-medium"
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.indicadores.detalleCdpDescuentoAtipico.map((d, i) => (
                        <tr key={i}>
                          <td className="border-b border-border/60 px-2 py-1.5">{d.documento}</td>
                          <td className="border-b border-border/60 px-2 py-1.5">{d.codigoCDP}</td>
                          <td className="border-b border-border/60 px-2 py-1.5">{d.tipoCDP}</td>
                          <td className="border-b border-border/60 px-2 py-1.5">{d.sku}</td>
                          <td className="border-b border-border/60 px-2 py-1.5 tabular-nums">
                            {d.precioAplicado.toFixed(2)}
                          </td>
                          <td className="border-b border-border/60 px-2 py-1.5 tabular-nums">
                            {d.precioEsperado.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-6 rounded-lg border border-border p-4">
              <h3 className="mb-3 text-sm font-medium">Ítems con promociones erróneas</h3>
              {resultado.indicadores.detalleItemsPromocionErroneos.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No hay ítems con promociones erróneas.
                </p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Estos ítems tienen un SKU en categoría de promoción, pero en su
                    documento no se encontró el artículo que la promoción exige
                    entregar junto con él (código de promoción mal ingresado o
                    artículo faltante en la venta). Revise el documento en el
                    archivo de Ítems DTE.
                  </p>
                  <div className="max-h-60 overflow-auto">
                    <table className="min-w-full text-xs">
                      <thead className="sticky top-0 bg-muted">
                        <tr>
                          {["Documento", "Fecha", "SKU", "Ítem", "Cantidad"].map((h) => (
                            <th
                              key={h}
                              className="border-b border-border px-2 py-1.5 text-left font-medium"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {resultado.indicadores.detalleItemsPromocionErroneos.map((d, i) => (
                          <tr key={i}>
                            <td className="border-b border-border/60 px-2 py-1.5">{d.documento}</td>
                            <td className="border-b border-border/60 px-2 py-1.5">{d.fecha}</td>
                            <td className="border-b border-border/60 px-2 py-1.5">{d.sku}</td>
                            <td className="border-b border-border/60 px-2 py-1.5">{d.item}</td>
                            <td className="border-b border-border/60 px-2 py-1.5 text-right tabular-nums">
                              {d.cantidad.toLocaleString("es-SV")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </section>
        )}


        <section>
          <SectionTitle>Archivos fuente</SectionTitle>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <FileField
              label="Ítems DTE"
              hint="Detalle de ventas"
              accept=".xlsx,.xls,.csv"
              inputRef={refItems}
              onChange={(f) => cargar(f, setItems, "Ítems DTE")}
              count={items.length}
            />
            <FileField
              label="Órdenes"
              hint="Ventas globales"
              accept=".xlsx,.xls,.csv"
              inputRef={refOrdenes}
              onChange={(f) => cargar(f, setOrdenes, "Órdenes")}
              count={ordenes.length}
            />
            <FileField
              label="Maestro de productos"
              hint="Catálogo de SKUs"
              accept=".xlsx,.xls,.csv"
              inputRef={refProductos}
              onChange={(f) => cargar(f, setProductos, "Productos")}
              count={productos.length}
            />
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

        <section>
          <SectionTitle>Periodo del reporte</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Desde">
              <input
                type="date"
                value={periodoDesde}
                onChange={(e) => setPeriodoDesde(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Hasta">
              <input
                type="date"
                value={periodoHasta}
                onChange={(e) => setPeriodoHasta(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
        </section>

        <section>
          <SectionTitle>Promociones</SectionTitle>

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

          <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-3 text-sm">
            {promos.length === 0 && (
              <li className="text-xs text-muted-foreground">Sin promociones aún</li>
            )}
            {promos.map((p, i) => (
              <li key={i} className="flex justify-between gap-3 border-b border-border/60 pb-1 last:border-0">
                <span>{p.promocion}</span>
                <span className="text-muted-foreground">{p.codigo}</span>
              </li>
            ))}
          </ul>
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

        {resultado && (
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <SectionTitle className="mb-0">Vista previa</SectionTitle>
              <button
                onClick={descargar}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                Descargar {resultado.archivoNombre}
              </button>
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {resultado.hojas.map((h, i) => (
                <button
                  key={h.nombre}
                  onClick={() => setHojaActiva(i)}
                  className={
                    "rounded-md border px-3 py-1 text-xs font-medium transition " +
                    (i === hojaActiva
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-muted")
                  }
                >
                  {h.nombre}
                </button>
              ))}
            </div>

            {resultado.hojas[hojaActiva] && (
              <>
                <p className="mb-2 text-xs text-muted-foreground">
                  Mostrando {resultado.hojas[hojaActiva].filas.length} de{" "}
                  {resultado.hojas[hojaActiva].totalFilas} filas.
                </p>
                <div className="max-h-[28rem] overflow-auto rounded-lg border border-border">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        {resultado.hojas[hojaActiva].headers.map((h, i) => (
                          <th
                            key={i}
                            className="whitespace-nowrap border-b border-border px-3 py-2 text-left font-medium"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.hojas[hojaActiva].filas.map((fila, ri) => (
                        <tr key={ri}>
                          {fila.map((c, ci) => (
                            <td
                              key={ci}
                              className="whitespace-nowrap border-b border-border/60 px-3 py-1.5"
                            >
                              {String(c)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        <p className="border-t border-border pt-6 text-center text-xs text-muted-foreground">
          Procesamiento 100% en su navegador — ningún archivo sale de su equipo.
        </p>
      </div>
    </main>
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

function FileField({
  label,
  hint,
  accept,
  onChange,
  inputRef,
  count,
}: {
  label: string;
  hint?: string;
  accept: string;
  onChange: (f: File | undefined) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  count?: number;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-sm font-medium">{label}</p>
      {hint && <p className="mb-3 text-xs text-muted-foreground">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0];
          onChange(f);
          e.target.value = "";
        }}
        className={fileInputCls}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        {count ? `${count} filas cargadas` : "Sin archivo"}
      </p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value?: number }) {
  return (
    <div className="bg-background p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {typeof value === "number" ? value.toLocaleString("es-SV") : "—"}
      </div>
    </div>
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
