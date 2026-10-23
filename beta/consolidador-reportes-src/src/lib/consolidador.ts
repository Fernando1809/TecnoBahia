// ============================================================================
// Consolidador Multi-Hoja — TecnoBahia
// ----------------------------------------------------------------------------
// ARCHIVO PRINCIPAL DE LA LÓGICA DE FÓRMULAS Y REPORTES.
// Todo el proceso del consolidado vive aquí, en este orden:
//
//   A) LECTURA DE INPUTS (funciones leerArchivoTabular / leerPlantilla /
//      leerPlantillaDesdeUrl / parsearTxtPromos)
//      - Lee los 3 archivos que sube el usuario (ítems, órdenes, productos)
//        con SheetJS (xlsx) y las 3 plantillas embebidas con ExcelJS.
//      - parsearTxtPromos convierte el texto "Nombre, Código" de promociones
//        a objetos { promocion, codigo }.
//
//   B) HELPERS DE NEGOCIO
//      - extraerTipoCDP: de un código tipo "CDPCARPORO..." obtiene
//        "CARPINTERO ORO" / "CONTRATISTA PLATA", etc. (columna "tipo de cdp").
//      - extraerDesdePrimerUno: extrae el N° de club (desde el primer "1").
//      - crearFecha: arma "fecha completa" YYYY-MM-DD a partir de Año/Mes/Día.
//      - formatearPeriodo: "01 DE ENERO 2026 AL 31 DE ENERO 2026".
//
//   C) generarReporte(params) — EL PROCESO COMPLETO:
//      1. Órdenes confirmadas (Estado = "confirmada").
//      2. VALIDACIÓN CDP (órdenes cuyo código de cliente contiene "CDP").
//      3. todos_skus (maestro de productos) + flag tieneCDP.
//      4. CDP_SKUS (solo productos cuyo precio contiene ":").
//      5. v_i_confirmadas (ítems de órdenes confirmadas + columnas calculadas).
//      6. Datos filtrados para la PLANTILLA CDP (Precio≠0, tiene CDP, ItemCDP=1).
//      7. Llenar plantilla CDP (ExcelJS: preserva imágenes, merges y estilos).
//      8. Agregar hojas de análisis (INFO, VENTAS_*, v_i_confirmadas con
//         FÓRMULAS VIVAS de Excel, todos_skus, CDP_SKUS, ORDENES_CONFIRMADAS)
//         y mover la plantilla CDP llenada al final del workbook.
//      8c. Si hay plantilla 2 (Promociones): replicar en JS las fórmulas
//          (DocPromo / Coincidencia_Doc / price_off), copiar sus hojas al
//          final y llenar su primera hoja con los datos filtrados.
//      9. Escribir UN SOLO archivo .xlsx consolidado.
//      10. Construir vista previa de todas las hojas + los 12 KPIs.
// ============================================================================

import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

export type Promocion = { promocion: string; codigo: string };
export type Row = Record<string, unknown>;

export type PlantillaState = {
  buffer: ArrayBuffer;
  nombre: string; // nombre de la hoja origen
  archivoNombre: string;
};

export function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============ DETECCIÓN AUTOMÁTICA DEL TIPO DE ARCHIVO ============
// El usuario sube los archivos en un solo campo; aquí decidimos si cada tabla
// es el detalle de ítems (DTE), el listado de órdenes o el maestro de productos
// comparando sus encabezados con las columnas típicas de cada una.

export type TipoTabla = "items" | "ordenes" | "productos";

const normEnc = (s: string) =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

export function detectarTipoTabla(rows: Row[]): TipoTabla | null {
  if (!rows.length) return null;
  const encabezados = new Set(Object.keys(rows[0]).map(normEnc));
  const tiene = (...nombres: string[]) => nombres.some((n) => encabezados.has(normEnc(n)));

  let items = 0;
  let ordenes = 0;
  let productos = 0;

  // Ítems DTE: una fila por producto vendido dentro de un documento.
  if (tiene("Número de", "Numero de", "Número de control")) items += 3;
  if (tiene("Item", "Nombre de item")) items += 2;
  if (tiene("Cantidad")) items += 2;
  if (tiene("Anulada")) items += 2;

  // Órdenes: una fila por venta, con estado y datos del cliente.
  if (tiene("Estado")) ordenes += 3;
  if (tiene("Encargado")) ordenes += 2;
  if (tiene("Codigo cliente", "Código cliente")) ordenes += 2;
  if (tiene("Numero de factura", "Número de factura")) ordenes += 2;
  if (tiene("Creado")) ordenes += 1;

  // Maestro de productos: catálogo de SKUs con categorías y precios.
  if (tiene("categorias", "Categorías", "Categorias")) productos += 3;
  if (tiene("sku", "SKU") && !tiene("Cantidad")) productos += 2;
  if (tiene("nombre") && tiene("precio") && !tiene("Estado")) productos += 2;

  const puntajes: [TipoTabla, number][] = [
    ["items", items],
    ["ordenes", ordenes],
    ["productos", productos],
  ];
  puntajes.sort((a, b) => b[1] - a[1]);
  if (puntajes[0][1] < 3 || puntajes[0][1] === puntajes[1][1]) return null;
  return puntajes[0][0];
}

// ============ LECTURA DE INPUTS ============


export function leerArchivoTabular(file: File): Promise<Row[]> {
  return new Promise((resolve, reject) => {
    const esCSV = file.name.toLowerCase().endsWith(".csv");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        const wb = esCSV
          ? XLSX.read(result as string, { type: "string" })
          : XLSX.read(new Uint8Array(result as ArrayBuffer), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
        let start = 0;
        for (let i = 0; i < Math.min(rows.length, 15); i++) {
          const text = (rows[i] as unknown[]).join(",").toLowerCase();
          if (text.includes("sku") || text.includes("codigo") || text.includes("precio")) {
            start = i;
            break;
          }
        }
        resolve(XLSX.utils.sheet_to_json<Row>(ws, { range: start, defval: "" }));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    if (esCSV) reader.readAsText(file, "UTF-8");
    else reader.readAsArrayBuffer(file);
  });
}

export function leerPlantilla(file: File): Promise<PlantillaState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        // Sólo para descubrir el nombre de la primera hoja
        const wbPeek = new ExcelJS.Workbook();
        await wbPeek.xlsx.load(buffer);
        const first = wbPeek.worksheets[0];
        resolve({
          buffer,
          nombre: first?.name ?? "Reporte CDP",
          archivoNombre: file.name,
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/** Carga una plantilla incluida en la app (no la sube el usuario). */
export async function leerPlantillaDesdeUrl(
  url: string,
  archivoNombre: string,
): Promise<PlantillaState> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar la plantilla ${archivoNombre}`);
  const buffer = await res.arrayBuffer();
  const wbPeek = new ExcelJS.Workbook();
  await wbPeek.xlsx.load(buffer);
  const first = wbPeek.worksheets[0];
  return { buffer, nombre: first?.name ?? "Reporte CDP", archivoNombre };
}


export function parsearTxtPromos(texto: string): Promocion[] {
  const out: Promocion[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.trim();
    if (!l) continue;
    const partes = l.split(",");
    if (partes.length >= 2) {
      const nombre = partes[0].trim();
      const codigo = partes[1].trim();
      if (nombre && codigo) out.push({ promocion: nombre, codigo });
    }
  }
  return out;
}

// ============ VIGENCIA DE PROMOCIONES ============
// El nombre de la categoría de promoción suele llevar el rango de fechas,
// por ejemplo "CTN 16/03-31/05/2026" o "PROMO 01/09/2026 al 30/09/2026".
// Aquí extraemos ese rango y lo comparamos con la fecha actual.

export type EstadoPromocion = "activa" | "vencida" | "proxima" | "sin-fecha";

export type VigenciaPromocion = {
  promocion: string;
  codigo: string;
  desde: string; // dd/mm/aaaa ("" si no se pudo leer)
  hasta: string;
  estado: EstadoPromocion;
  diasRestantes: number | null; // días hasta que termine (negativo si ya venció)
};

const RANGO_FECHAS =
  /(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\s*(?:-|–|—|\bal\b|\bhasta\b|\ba\b)\s*(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?/i;

function normalizarAnio(a: string | undefined, fallback: number): number {
  if (!a) return fallback;
  const n = Number(a);
  if (a.length <= 2) return 2000 + n;
  return n;
}

const soloFecha = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fmt = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

/** Analiza el nombre de cada promoción y determina si sigue vigente hoy. */
export function analizarVigenciaPromos(
  promos: Promocion[],
  hoy: Date = new Date(),
): VigenciaPromocion[] {
  const hoy0 = soloFecha(hoy);
  return promos.map((p) => {
    const m = RANGO_FECHAS.exec(String(p.promocion));
    if (!m) {
      return {
        promocion: p.promocion,
        codigo: p.codigo,
        desde: "",
        hasta: "",
        estado: "sin-fecha" as EstadoPromocion,
        diasRestantes: null,
      };
    }
    const [, d1, m1, y1, d2, m2, y2] = m;
    // Si a una de las dos fechas le falta el año, se toma el de la otra.
    const anioFin = normalizarAnio(y2 ?? y1, hoy0.getFullYear());
    const anioIni = normalizarAnio(y1 ?? y2, anioFin);
    const desde = new Date(anioIni, Number(m1) - 1, Number(d1));
    const hasta = new Date(anioFin, Number(m2) - 1, Number(d2));
    const dias = Math.round((hasta.getTime() - hoy0.getTime()) / 86400000);
    const estado: EstadoPromocion =
      hoy0 < desde ? "proxima" : hoy0 > hasta ? "vencida" : "activa";
    return {
      promocion: p.promocion,
      codigo: p.codigo,
      desde: fmt(desde),
      hasta: fmt(hasta),
      estado,
      diasRestantes: dias,
    };
  });
}

// ============ HELPERS DE NEGOCIO ============

function extraerTipoCDP(codigo: unknown): string {
  if (!codigo) return "";
  const str = String(codigo).trim().toUpperCase();
  if (!str.startsWith("CDP")) return "";

  // Quitamos el prefijo CDP y analizamos lo que sigue.
  let resto = str.replace(/^CDP/, "").trim();

  // Determinamos el rol según el prefijo inmediato.
  let rol = "";
  if (resto.startsWith("CON") || resto.startsWith("CONTRATISTA")) {
    rol = "CONTRATISTA";
    resto = resto.replace(/^CONTRATISTA|^CON/, "").trim();
  } else if (resto.startsWith("MET") || resto.startsWith("METALMECANICO")) {
    rol = "METALMECANICO";
    resto = resto.replace(/^METALMECANICO|^MET/, "").trim();
  } else {
    // Cualquier otro prefijo (MAD, CARP, CARPINTERO, MADERA, etc.) es carpintero.
    rol = "CARPINTERO";
    resto = resto.replace(/^(CARPINTERO|MADERA|CARP|MAD)/, "").trim();
  }

  // El nivel siempre se extrae del texto restante (ORO, PLATA, PLATINO).
  let nivel = "";
  if (resto.includes("PLATINO")) nivel = "PLATINO";
  else if (resto.includes("PLATA")) nivel = "PLATA";
  else if (resto.includes("ORO")) nivel = "ORO";

  return nivel ? `${rol} ${nivel}`.trim() : rol;
}

function extraerDesdePrimerUno(texto: unknown): string {
  if (!texto) return "No empezo con 1";
  const str = String(texto);
  const pos = str.indexOf("1");
  if (pos === -1) return "No empezo con 1";
  return str.substring(pos);
}

function crearFecha(a: unknown, m: unknown, d: unknown): string {
  const anio = parseInt(String(a), 10);
  const mes = parseInt(String(m), 10);
  const dia = parseInt(String(d), 10);
  if (isNaN(anio) || isNaN(mes) || isNaN(dia)) return "";
  const fecha = new Date(anio, mes - 1, dia);
  if (
    fecha.getFullYear() === anio &&
    fecha.getMonth() === mes - 1 &&
    fecha.getDate() === dia
  ) {
    const yy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, "0");
    const dd = String(fecha.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }
  return "";
}

const MESES_ES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

function formatearPeriodo(desde: string, hasta: string): string {
  // desde / hasta = "YYYY-MM-DD"
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
    if (!y || !m || !d) return iso;
    return `${String(d).padStart(2, "0")} DE ${MESES_ES[m - 1]} ${y}`;
  };
  return `${fmt(desde)} AL ${fmt(hasta)}`;
}

// ============ PERIODO AUTOMÁTICO (según la tabla de ventas) ============
// El periodo del reporte NO se elige a mano: se deduce de las fechas de la
// tabla de ventas (Ítems DTE). Se toma la fecha más antigua y la más reciente.
export function calcularPeriodoDesdeVentas(itemsData: Row[]): {
  desde: string;
  hasta: string;
} {
  let desde = "";
  let hasta = "";
  for (const row of itemsData) {
    const iso = crearFecha(row["Año"], row["Mes"], row["Día"]);
    if (!iso) continue;
    if (!desde || iso < desde) desde = iso;
    if (!hasta || iso > hasta) hasta = iso;
  }
  return { desde, hasta };
}

// ============ VALIDACIÓN DE CÓDIGOS DE CLIENTE / CDP ============
// Estructura válida obligatoria de un código CDP (todo junto, sin espacios):
//   CDP + (CON | MAD | MET) + (ORO | PLATA | PLATINO) + número de cliente
//   ejemplo: CDPCONORO1040012149
export const CDP_REGEX = /^CDP(CON|MAD|MET)(ORO|PLATA|PLATINO)\d+$/;

export type CodigoCDPInvalido = { codigo: string; cantidad: number; motivo: string };
export type ValidacionClientes = {
  clientesNoCDP: CodigoCliente[];
  cdpInvalidos: CodigoCDPInvalido[];
};

function motivoCodigoCDPInvalido(codigo: string): string | null {
  const bruto = codigo.toUpperCase();
  if (CDP_REGEX.test(bruto)) return null;
  const limpio = bruto.replace(/\s+/g, "");
  const tieneEspacios = limpio !== bruto;
  if (!/^CDP/.test(limpio)) return "No inicia con el prefijo CDP";
  const resto = limpio.slice(3);
  const tipo = /^(CON|MAD|MET)/.exec(resto);
  if (!tipo) return "Falta el tipo de CDP (CON, MAD o MET)";
  const resto2 = resto.slice(tipo[0].length);
  const nivel = /^(ORO|PLATINO|PLATA)/.exec(resto2);
  if (!nivel) return "Este cliente no tiene tipo de tarjeta (ORO, PLATA o PLATINO)";
  const numero = resto2.slice(nivel[0].length);
  if (!/^\d+$/.test(numero)) return "El número de cliente no es válido";
  if (tieneEspacios) return "El código lleva espacios; debe ir todo junto";
  return "Estructura de código no válida";
}

export function validarCodigosCliente(ordenesData: Row[]): ValidacionClientes {
  const conteo = new Map<string, number>();
  for (const o of ordenesData) {
    const cod = String(o["Codigo clie"] ?? o["Codigo cliente"] ?? "").trim().toUpperCase();
    if (!cod) continue;
    conteo.set(cod, (conteo.get(cod) ?? 0) + 1);
  }
  const clientesNoCDP: CodigoCliente[] = [];
  const cdpInvalidos: CodigoCDPInvalido[] = [];
  for (const [codigo, cantidad] of conteo) {
    if (codigo.replace(/\s+/g, "").startsWith("CDP")) {
      const motivo = motivoCodigoCDPInvalido(codigo);
      if (motivo) cdpInvalidos.push({ codigo, cantidad, motivo });
    } else {
      clientesNoCDP.push({ codigo, cantidad, esCDP: false });
    }
  }
  clientesNoCDP.sort((a, b) => b.cantidad - a.cantidad);
  cdpInvalidos.sort((a, b) => b.cantidad - a.cantidad);
  return { clientesNoCDP, cdpInvalidos };
}

// ============ GENERACIÓN ============

export type GenerarParams = {
  itemsData: Row[];
  ordenesData: Row[];
  productosData: Row[];
  promociones: Promocion[];
  plantilla: PlantillaState;
  plantilla2?: PlantillaState | null;
  periodoDesde?: string; // YYYY-MM-DD (opcional: se deduce de las ventas)
  periodoHasta?: string; // YYYY-MM-DD (opcional: se deduce de las ventas)
  descargar?: boolean; // si false, solo devuelve el blob y la vista previa
  // Respuesta del usuario por producto en OFERTA sin código (clave → incluir)
  priceOffDecisiones?: Record<string, boolean>;
};


export type HojaPreview = {
  nombre: string;
  headers: string[];
  filas: (string | number)[][];
  totalFilas: number;
};

// categoria: nombre de la categoría/promoción de KOLO a la que pertenece el ítem
export type DetallePromocion = {
  codigo: string;
  nombre: string;
  cantidad: number;
  categoria: string;
};
// nombre: razón social / nombre del cliente tal como viene en el Excel de órdenes
export type CodigoCliente = { codigo: string; cantidad: number; esCDP: boolean; nombre?: string };
export type CdpDescuentoAtipico = {
  documento: string;
  codigoCDP: string;
  tipoCDP: string;
  sku: string;
  precioAplicado: number;
  precioEsperado: number;
};
export type PromocionErronea = {
  documento: string;
  sku: string;
  item: string;
  cantidad: number;
  motivo: string;
};
export type DetalleDescuentoCDP = {
  documento: string;
  fecha: string;
  cliente: string;
  producto: string;
  cantidad: number;
};

// Registros de apoyo para los pop-ups de KPI (solo pantalla).
export type ItemRegistro = {
  documento: string;
  fecha: string;
  sku: string;
  nombre: string;
  cantidad: number;
  confirmado: boolean;
};
export type OrdenRegistro = {
  // Código de la orden en KOLO (columna "Código" de VENTA_ORDENES)
  codigo: string;
  documento: string;
  fecha: string;
  cliente: string;
  nombreCliente: string;
  estado: string;
  confirmada: boolean;
  creada: boolean;
};

export type Indicadores = {
  listaItems: ItemRegistro[];
  listaOrdenes: OrdenRegistro[];
  totalOrdenesCargadas: number;
  totalItemsCargados: number;
  totalOrdenesConfirmadas: number;
  totalOrdenesNoConfirmadas: number;
  // Órdenes en estado "creada": aún no se confirman en KOLO
  totalOrdenesCreadas: number;
  totalItemsConfirmados: number;
  totalItemsNoConfirmados: number;
  // Clientela: clientes distintos, cuántos son CDP y cuántos no
  totalClientesUnicos: number;
  totalClientesCDP: number;
  totalClientesNoCDP: number;
  detallePromocionesAplicadas: DetallePromocion[];
  detalleCodigosClienteUnicos: CodigoCliente[];
  // Ítems vendidos en órdenes confirmadas de clientes CDP, tengan o no descuento.
  totalItemsConfirmadosCDP: number;
  detalleItemsConfirmadosCDP: DetalleDescuentoCDP[];
  totalItemsDescuentoCDP: number;
  detalleDescuentosCDP: DetalleDescuentoCDP[];
  totalItemsConPromocion: number;
  totalItemsPromocionErroneos: number;
  // Total general de promociones registradas = válidas + inválidas
  totalPromocionesRegistradas: number;
  detallePromocionesErroneas: PromocionErronea[];
  totalCdpDescuentoDistintoCategoria: number;
  detalleCdpDescuentoAtipico: CdpDescuentoAtipico[];
};

// ============ ÓRDENES PENDIENTES DE ACTUALIZAR EN KOLO ============
// Sólo hay dos estados finales válidos: CONFIRMADA y ANULADA. Cualquier otro
// estado (creada, en proceso, etc.) significa que la orden aún no está cerrada
// en KOLO: no entra al reporte y debe atenderse antes de continuar.
export type OrdenCreada = {
  // Código de generación de la orden en KOLO (columna "Código").
  codigo: string;
  cliente: string;
  nombre: string;
  fecha: string;
  // Estado tal como viene en el Excel (para poder filtrarlo en el pop-up)
  estado: string;
};

// Fecha legible (dd/mm/aaaa) a partir de cualquier columna de fecha disponible.
function fechaDeFila(row: Row): string {
  const directa = row["Fecha"] ?? row["fecha"] ?? row["fecha completa"] ?? row["Fecha de creacion"];
  if (directa instanceof Date) {
    const d = directa;
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  const s = String(directa ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  if (s) return s;
  const armada = crearFecha(row["Año"], row["Mes"], row["Día"]);
  if (armada) {
    const [y, m, d] = armada.split("-");
    return `${d}/${m}/${y}`;
  }
  return "";
}

export function detectarOrdenesCreadas(ordenesData: Row[]): OrdenCreada[] {
  const lista: OrdenCreada[] = [];
  for (const o of ordenesData) {
    const original = String(o["Estado"] ?? o["estado"] ?? "").trim();
    const estado = original
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (!estado) continue;
    // Estados finales aceptados: confirmada/confirmado y anulada/anulado
    if (estado.startsWith("confirmad") || estado.startsWith("anulad")) continue;
    lista.push({
      codigo: String(o["Código"] ?? o["Codigo"] ?? o["codigo"] ?? "").trim(),
      cliente: String(o["Codigo clie"] ?? o["Codigo cliente"] ?? "").trim().toUpperCase(),
      nombre: nombreClienteDeFila(o),
      fecha: fechaDeFila(o),
      estado: original,
    });
  }
  return lista;
}

// Búsqueda difusa del nombre del cliente dentro de una fila de órdenes.
function nombreClienteDeFila(row: Row): string {
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  for (const k of Object.keys(row)) {
    const h = norm(k);
    const esNombre =
      (h.includes("nombre") && !h.includes("codigo")) || h.includes("razon") || h === "cliente";
    if (!esNombre) continue;
    if (h.includes("item") || h.includes("producto") || h.includes("sku")) continue;
    const v = String(row[k] ?? "").trim();
    if (v) return v;
  }
  return "";
}


// Fila de la TABLA RESUMEN que se muestra en la pantalla (no afecta al Excel).
export type ResumenItem = {
  dte: string;
  tipoDocumento: string;
  fecha: string;
  codigoCliente: string;
  tipoCDP: string;
  numeroCDP: string;
  nombreCliente: string;
  sku: string;
  nombreItem: string;
  cantidad: number;
  precio: number;
  descuentoCDP: boolean;
  promocion: boolean;
  promocionCoincide: boolean;
  colorSeleccionado: boolean;
  enReporte: boolean;
  // La fila forma parte del reporte de promociones (coherente con el KPI)
  enReportePromo: boolean;
};

// Producto en OFERTA (color seleccionado) cuyo documento no trae el código de
// la promoción: requiere confirmación del usuario para entrar al reporte.
export type PriceOffPendiente = {
  clave: string;
  documento: string;
  fecha: string;
  cliente: string;
  sku: string;
  producto: string;
  cantidad: number;
  codigo: string; // código de promoción que se le asignará
};

export type GenerarResultado = {
  totalFiltrados: number;
  archivoNombre: string;
  blob: Blob;
  hojas: HojaPreview[];
  resumen: ResumenItem[];
  indicadores: Indicadores;
  priceOffPendientes: PriceOffPendiente[];
};


export async function generarReporte(p: GenerarParams): Promise<GenerarResultado> {

  const {
    itemsData,
    ordenesData,
    productosData,
    promociones,
    plantilla,
    plantilla2,
    descargar = true,
  } = p;

  // El periodo se deduce siempre de la tabla de ventas (fecha más antigua a
  // fecha más reciente). Los parámetros manuales quedan solo como respaldo.
  const periodoAuto = calcularPeriodoDesdeVentas(itemsData);
  const periodoDesde = periodoAuto.desde || p.periodoDesde || "";
  const periodoHasta = periodoAuto.hasta || p.periodoHasta || "";



  // 1. ÓRDENES CONFIRMADAS
  const ordenesConfirmadas = ordenesData.filter((r) => {
    const estado = String(r["Estado"] ?? r["estado"] ?? "").toLowerCase().trim();
    return estado === "confirmada";
  });

  // 2. VALIDACIÓN CDP
  const ordenesCDP = ordenesConfirmadas.filter((r) => {
    const codCliente = String(r["Codigo clie"] ?? r["Codigo cliente"] ?? "").toUpperCase();
    return codCliente.includes("CDP");
  });
  const validacionCDPData = ordenesCDP.map((r) => ({
    "Numero de factura": r["Numero de factura"] ?? r["Número de factura"] ?? "",
    "Codigo CDP": String(r["Codigo clie"] ?? r["Codigo cliente"] ?? "").toUpperCase(),
    "Codigo Cliente": r["Codigo clie"] ?? r["Codigo cliente"] ?? "",
  }));

  const buscarCodigoCDP = (numeroFactura: unknown): string => {
    if (!validacionCDPData.length) return "";
    for (const v of validacionCDPData) {
      if (String(v["Numero de factura"] ?? "") === String(numeroFactura)) {
        return String(v["Codigo CDP"] ?? "");
      }
    }
    return "";
  };

  const tienePrecioConDosPuntos = (sku: string): boolean =>
    productosData.some((prod) => {
      const skuP = String(prod["sku"] ?? prod["SKU"] ?? "").trim();
      const precioP = String(prod["precio"] ?? prod["Precio"] ?? "");
      return skuP === sku && precioP.includes(":");
    });

  // 3. TODOS SKUS  (las 4 últimas columnas se llenan como fórmulas vivas más abajo)
  const todosSkus = productosData.map((prod) => {
    const sku = String(prod["sku"] ?? prod["SKU"] ?? "").trim();
    const precio = String(prod["precio"] ?? prod["Precio"] ?? "");
    const categoria = String(prod["categorias"] ?? prod["Categorías"] ?? "").trim();
    const nombre = String(prod["nombre"] ?? prod["Nombre"] ?? "");
    return {
      sku,
      nombre,
      precio,
      categorias: categoria,
    };
  });

  // 3b. CDP SKUS necesita el flag — lo calculamos aquí en JS aparte
  const todosSkusConFlag = todosSkus.map((x) => ({
    ...x,
    _tieneCDP: x.precio.includes(":") ? "Si tiene" : "No tiene",
  }));

  // 4. CDP SKUS
  const cdpSkus = todosSkusConFlag
    .filter((x) => x._tieneCDP === "Si tiene")
    .map((x) => ({
      sku: x.sku,
      nombre: x.nombre,
      precio: x.precio,
      categorias: x.categorias,
      "Tiene CDP": x._tieneCDP,
    }));

  // 5. VI CONFIRMADAS
  const viConfirmadas: Row[] = [];
  for (const row of itemsData) {
    const anulada = String(row["Anulada"] ?? "NO").toUpperCase().trim();
    if (anulada === "SI") continue;
    const numFactura = row["Número de"] ?? row["Número de control"] ?? "";
    const codigoCDP = buscarCodigoCDP(numFactura);
    const sku = String(row["SKU"] ?? row["sku"] ?? "").trim();
    const tienePrecioCDP = tienePrecioConDosPuntos(sku);
    const itemCDP = tienePrecioCDP && codigoCDP && codigoCDP !== "" ? 1 : 0;
    const precio = Number(row["Precio"]) || 0;
    viConfirmadas.push({
      "Número de": numFactura,
      Tipo: row["Tipo"] ?? "",
      Año: row["Año"] ?? "",
      Mes: row["Mes"] ?? "",
      Día: row["Día"] ?? "",
      "fecha completa": crearFecha(row["Año"], row["Mes"], row["Día"]),
      Nombre: row["Nombre"] ?? "",
      SKU: sku,
      Item: row["Item"] ?? "",
      Cantidad: Number(row["Cantidad"]) || 0,
      Precio: precio,
      "Codigo CDP": codigoCDP,
      "Item CDP": itemCDP,
      codigo: extraerDesdePrimerUno(codigoCDP),
      "tipo de cdp": extraerTipoCDP(codigoCDP),
    });
  }

  // 6. DATOS FILTRADOS (para la plantilla)
  const datosFiltrados = viConfirmadas.filter(
    (r) => r["Precio"] !== 0 && r["Codigo CDP"] !== "" && r["Item CDP"] === 1,
  );

  // 7. ABRIR PLANTILLA CON EXCELJS (preserva imágenes, merges, estilos)
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(plantilla.buffer);
  const wsPlantilla = wb.getWorksheet(plantilla.nombre) ?? wb.worksheets[0];

  // 7a. Periodo en B4
  if (periodoDesde && periodoHasta) {
    wsPlantilla.getCell("B4").value = formatearPeriodo(periodoDesde, periodoHasta);
  }

  // 7b. Detectar fila de encabezados y mapear columnas
  // Por defecto: encabezados en fila 6, datos desde fila 7 (caso del template oficial)
  let filaEncabezado = 6;
  const findHeaderRow = () => {
    for (let r = 1; r <= Math.min(15, wsPlantilla.rowCount); r++) {
      const row = wsPlantilla.getRow(r);
      const txt = (row.values as unknown[])
        .map((v) => String(v ?? "").toUpperCase())
        .join("|");
      if (txt.includes("FECHA") && (txt.includes("CODIGO") || txt.includes("CÓDIGO"))) {
        filaEncabezado = r;
        return;
      }
    }
  };
  findHeaderRow();

  const enc: string[] = [];
  const headerRow = wsPlantilla.getRow(filaEncabezado);
  for (let c = 1; c <= wsPlantilla.columnCount; c++) {
    enc.push(String(headerRow.getCell(c).value ?? "").toUpperCase().trim());
  }
  const find = (pred: (h: string) => boolean, fallback: number) => {
    const i = enc.findIndex(pred);
    return i === -1 ? fallback : i + 1; // 1-based
  };
  const colFECHA = find((h) => h.includes("FECHA"), 1);
  const colNUMERO_CLUB = find(
    (h) => h.includes("N° CLUB") || (h.includes("CLUB") && h.includes("PINTOR")),
    2,
  );
  const colNOMBRE_CLUB = find((h) => h.includes("NOMBRE") && h.includes("CLUB"), 3);
  const colDOCUMENTO = find((h) => h.includes("DOCUMENTO"), 4);
  const colCODIGO = find((h) => h === "CODIGO" || h.includes("CÓDIGO") || h === "SKU", 5);
  const colCANTIDAD = find((h) => h.includes("CANTIDAD") || h === "QTY", 6);
  const colTIPO_TARJETA = find(
    (h) => h.includes("TIPO DE TARJETA") || h.includes("TIPO TARJETA") || h.includes("TIPOCDP"),
    7,
  );

  // 7c. Clonar estilo de la primera fila de datos (filaEncabezado+1) si existe, y limpiar filas previas de datos
  const filaInicioDatos = filaEncabezado + 1;
  // Limpiar contenido de filas viejas (sin tocar imágenes/headers/merges)
  for (let r = filaInicioDatos; r <= wsPlantilla.rowCount; r++) {
    const row = wsPlantilla.getRow(r);
    row.eachCell({ includeEmpty: false }, (cell) => {
      cell.value = null;
    });
  }

  // 7d. Llenar datos
  for (let i = 0; i < datosFiltrados.length; i++) {
    const row = datosFiltrados[i];
    const r = filaInicioDatos + i;
    const target = wsPlantilla.getRow(r);
    target.getCell(colFECHA).value = String(row["fecha completa"] ?? "");
    target.getCell(colNUMERO_CLUB).value = String(row["codigo"] ?? "");
    target.getCell(colNOMBRE_CLUB).value = String(row["Nombre"] ?? "");
    target.getCell(colDOCUMENTO).value = String(row["Número de"] ?? "");
    target.getCell(colCODIGO).value = String(row["SKU"] ?? "");
    target.getCell(colCANTIDAD).value = Number(row["Cantidad"]) || 0;
    target.getCell(colTIPO_TARJETA).value = String(row["tipo de cdp"] ?? "");
    target.commit();
  }

  // 8. AGREGAR LAS 8 HOJAS DE ANÁLISIS AL MISMO WORKBOOK
  const addJsonSheet = (name: string, rows: Row[]) => {
    // Si ya existe (raro: misma plantilla con esos nombres), renombrar
    let finalName = name.substring(0, 31);
    let n = 1;
    while (wb.getWorksheet(finalName)) {
      finalName = (name + "_" + ++n).substring(0, 31);
    }
    const ws = wb.addWorksheet(finalName);
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    ws.addRow(headers);
    for (const r of rows) {
      ws.addRow(headers.map((h) => r[h] as ExcelJS.CellValue));
    }
    ws.getRow(1).font = { bold: true };
  };

  // INFO: la fórmula TIENE PROMOCION espera los códigos en Info!$B$6:$B$9
  const wsInfo = wb.addWorksheet("INFO");
  wsInfo.getRow(1).values = ["Promociones", "Códigos de promoción"];
  wsInfo.getRow(1).font = { bold: true };
  wsInfo.getRow(5).values = ["Promoción", "Código"];
  wsInfo.getRow(5).font = { bold: true };
  for (let i = 0; i < promociones.length; i++) {
    const r = wsInfo.getRow(6 + i);
    r.getCell(1).value = promociones[i].promocion;
    r.getCell(2).value = promociones[i].codigo;
    r.commit();
  }

  addJsonSheet("VENTAS_ORDENES", ordenesData);
  addJsonSheet("VENTAS_ITEMS", itemsData);
  addJsonSheet("VALIDACION_CDP", validacionCDPData as unknown as Row[]);
  // v_i_confirmadas: base + 8 columnas con fórmulas vivas
  // A=Número de B=Tipo C=Año D=Mes E=Día F=fecha completa G=Nombre H=SKU
  // I=Item J=Cantidad K=Precio L=Codigo CDP M=Item CDP N=codigo O=tipo de cdp
  // P=ItemPromo Q=DocPromo R=sku_promocion S=Coincidencia_Doc
  // T=sku_promocion_COINCIDENTE U=Nombre_prom_coincidente V=price_off W=Esta en Reporte
  const wsVI = wb.addWorksheet("v_i_confirmadas");
  const viHeaders = [
    "Número de", "Tipo", "Año", "Mes", "Día", "fecha completa", "Nombre", "SKU",
    "Item", "Cantidad", "Precio", "Codigo CDP", "Item CDP", "codigo", "tipo de cdp",
    "ItemPromo", "DocPromo", "sku_promocion", "Coincidencia_Doc",
    "sku_promocion_COINCIDENTE", "Nombre_prom_coincidente", "price_off", "Esta en Reporte",
  ];
  wsVI.addRow(viHeaders);
  wsVI.getRow(1).font = { bold: true };
  
  for (let i = 0; i < viConfirmadas.length; i++) {
    const r = i + 2;
    const v = viConfirmadas[i];
    const fila = wsVI.getRow(r);
    fila.getCell(1).value = v["Número de"] as ExcelJS.CellValue;
    fila.getCell(2).value = v["Tipo"] as ExcelJS.CellValue;
    fila.getCell(3).value = v["Año"] as ExcelJS.CellValue;
    fila.getCell(4).value = v["Mes"] as ExcelJS.CellValue;
    fila.getCell(5).value = v["Día"] as ExcelJS.CellValue;
    fila.getCell(6).value = v["fecha completa"] as ExcelJS.CellValue;
    fila.getCell(7).value = v["Nombre"] as ExcelJS.CellValue;
    fila.getCell(8).value = v["SKU"] as ExcelJS.CellValue;
    fila.getCell(9).value = v["Item"] as ExcelJS.CellValue;
    fila.getCell(10).value = v["Cantidad"] as ExcelJS.CellValue;
    fila.getCell(11).value = v["Precio"] as ExcelJS.CellValue;
    fila.getCell(12).value = v["Codigo CDP"] as ExcelJS.CellValue;
    fila.getCell(13).value = v["Item CDP"] as ExcelJS.CellValue;
    fila.getCell(14).value = v["codigo"] as ExcelJS.CellValue;
    fila.getCell(15).value = v["tipo de cdp"] as ExcelJS.CellValue;
    // P: ItemPromo  -> ¿el SKU H está en todos_skus y con TIENE PROMOCION = VERDADERO?
    fila.getCell(16).value = {
      formula: `COUNTIFS(todos_skus!A:A,H${r},todos_skus!F:F,TRUE)>0`,
    };
    // Q: DocPromo  -> ¿alguna fila del mismo documento tiene ItemPromo = VERDADERO?
    fila.getCell(17).value = {
      formula: `COUNTIFS($A:$A,A${r},$P:$P,TRUE)>0`,
    };
    // R: sku_promocion -> lista de prefijos coincidentes desde todos_skus
    fila.getCell(18).value = {
      formula:
        `IF(Q${r}=TRUE,IFERROR(TEXTJOIN(";",TRUE,FILTER(todos_skus!$A:$A,` +
        `(todos_skus!$F:$F=TRUE)*(todos_skus!$G:$G<>"")*(LEFT(H${r},LEN(todos_skus!$G:$G))=todos_skus!$G:$G))),""),"")`,
    };
    // S: Coincidencia_Doc (rango auto-detectado con COUNTA, no fijo a 7500)
    const rngA = `$A$2:INDEX($A:$A,COUNTA($A:$A))`;
    const rngH = `$H$2:INDEX($H:$H,COUNTA($A:$A))`;
    fila.getCell(19).value = {
      formula:
        `IF(R${r}="",FALSE,SUMPRODUCT((${rngA}=A${r})*` +
        `ISNUMBER(SEARCH(";"&${rngH}&";",";"&R${r}&";")))>0)`,
    };
    // T: sku_promocion_COINCIDENTE
    fila.getCell(20).value = {
      formula:
        `IF(R${r}="","",IFERROR(INDEX(${rngH},` +
        `MATCH(1,(${rngA}=$A${r})*` +
        `ISNUMBER(SEARCH(";"&${rngH}&";",";"&R${r}&";")),0)),""))`,
    };

    // U: Nombre_prom_coincidente
    fila.getCell(21).value = {
      formula: `VLOOKUP(T${r},todos_skus!A:B,2,FALSE)`,
    };
    // V: price_off
    fila.getCell(22).value = {
      formula: `VLOOKUP(H${r},todos_skus!A:H,8,FALSE)`,
    };
    // W: Esta en Reporte (se rellenará luego si existe plantilla2)
    fila.getCell(23).value = 0;
    fila.commit();
  }
  addJsonSheet("CDP_SKUS", cdpSkus as unknown as Row[]);

  // TODOS_SKUS: base + 4 columnas con fórmulas vivas
  // Columnas: A=sku  B=nombre  C=precio  D=categorias  E=tiene cdp?  F=TIENE PROMOCION  G=Inicio_sku  H=priceoff_sku
  const wsTodos = wb.addWorksheet("todos_skus");
  wsTodos.addRow([
    "sku",
    "nombre",
    "precio",
    "categorias",
    "tiene cdp?",
    "TIENE PROMOCION",
    "Inicio_sku",
    "priceoff_sku",
  ]);
  wsTodos.getRow(1).font = { bold: true };
  for (let i = 0; i < todosSkus.length; i++) {
    const r = i + 2; // fila Excel (1-based, salta encabezado)
    const fila = wsTodos.getRow(r);
    const t = todosSkus[i];
    fila.getCell(1).value = t.sku;
    fila.getCell(2).value = t.nombre;
    fila.getCell(3).value = t.precio;
    fila.getCell(4).value = t.categorias;
    fila.getCell(5).value = {
      formula: `IF(IFERROR(FIND(":",C${r}),"No tiene")="No tiene","No tiene","Si tiene")`,
    };
    fila.getCell(6).value = {
      formula: `COUNTIF(INFO!$B$6:$B$${5 + Math.max(promociones.length, 4)},"="&LEFT(TRIM(todos_skus!D${r}),FIND(":",TRIM(todos_skus!D${r})&":")-1))>0`,
    };
    fila.getCell(7).value = {
      formula:
        `IFERROR(LEFT(MID(B${r},FIND("@",SUBSTITUTE(B${r},"(","@",LEN(B${r})-LEN(SUBSTITUTE(B${r},"(",""))))+1,` +
        `FIND("@",SUBSTITUTE(B${r},")","@",LEN(B${r})-LEN(SUBSTITUTE(B${r},")",""))))-FIND("@",SUBSTITUTE(B${r},"(","@",LEN(B${r})-LEN(SUBSTITUTE(B${r},"(",""))))-1),` +
        `FIND("-",MID(B${r},FIND("@",SUBSTITUTE(B${r},"(","@",LEN(B${r})-LEN(SUBSTITUTE(B${r},"(",""))))+1,` +
        `FIND("@",SUBSTITUTE(B${r},")","@",LEN(B${r})-LEN(SUBSTITUTE(B${r},")",""))))-FIND("@",SUBSTITUTE(B${r},"(","@",LEN(B${r})-LEN(SUBSTITUTE(B${r},"(",""))))-1)&"-")-1),"")`,
    };
    fila.getCell(8).value = {
      formula:
        `IF(ISNUMBER(SEARCH("34368",D${r})),IF(RIGHT(A${r},2)="-1","P25-255",IF(RIGHT(A${r},2)="-5","P25-256","")),` +
        `IF(ISNUMBER(SEARCH("34369",D${r})),IF(RIGHT(A${r},2)="-1","P25-257",IF(RIGHT(A${r},2)="-5","P25-258","")),` +
        `IF(ISNUMBER(SEARCH("34367",D${r})),IF(RIGHT(A${r},2)="-1","P25-259",IF(RIGHT(A${r},2)="-5","P25-260","")),"")))`,
    };
    fila.commit();
  }

  addJsonSheet("ORDENES_CONFIRMADAS", ordenesConfirmadas);

  // 8b. Mover la plantilla 1 llenada al final del workbook
  wb.worksheets.forEach((ws, idx) => {
    (ws as unknown as { orderNo: number }).orderNo =
      ws === wsPlantilla ? wb.worksheets.length : idx;
  });

  // 8c. Si se subió la PLANTILLA 2 (Promociones), copiar sus hojas al final del consolidado
  //     y llenar la PRIMERA hoja con las filas de v_i_confirmadas que tengan
  //     DocPromo = VERDADERO y Coincidencia_Doc = VERDADERO (calculados aquí en JS).
  const hojasPlantilla2: string[] = [];
  // Hoja final del reporte de promociones (se conserva en el archivo exportado)
  let wsProm: ExcelJS.Worksheet | null = null;
  let detallePromocionesAplicadas: DetallePromocion[] = [];
  let totalItemsConPromocion = 0;
  let totalItemsPromocionErroneos = 0;
  let detallePromocionesErroneas: PromocionErronea[] = [];
  // Productos en OFERTA sin código de promoción en su documento: se le
  // pregunta al usuario si desea incluirlos.
  const priceOffPendientes: PriceOffPendiente[] = [];

  // --- Marcado de filas para la TABLA RESUMEN que se muestra en pantalla ---
  // Se usan referencias a los objetos de viConfirmadas (identidad), de modo que
  // el resumen refleje exactamente lo que el proceso calculó, sin recalcular nada.
  const setItemPromo = new Set<Row>(); // el SKU pertenece a una promoción
  const setCoincidePromo = new Set<Row>(); // la promoción coincide con el promocional
  const setColorSeleccionado = new Set<Row>(); // tiene price_off (color/presentación elegida)
  const setEnReportePromo = new Set<Row>(); // la fila entra en la plantilla de promociones
  // Cuántas veces entra cada fila (documento|SKU) en el reporte de promociones.
  // Sirve para que el conteo de la tabla resumen coincida exactamente con el KPI
  // "Promociones válidas" aunque una misma fila genere varios registros.
  const conteoPromoPorClave = new Map<string, number>();




  if (plantilla2) {
    // --- Replicar en JS las fórmulas de todos_skus y v_i_confirmadas para filtrar ---
    const codigosPromoSet = new Set(
      promociones.map((p) => String(p.codigo).trim()).filter(Boolean),
    );
    const todosEnriq = todosSkus.map((t) => {
      const primeraCat = String(t.categorias).split(":")[0].trim();
      const tienePromo = primeraCat !== "" && codigosPromoSet.has(primeraCat);
      // Inicio_sku: contenido del ÚLTIMO paréntesis, cortado en el primer "-" si existe
      let inicioSku = "";
      const nombre = String(t.nombre);
      const lastParen = nombre.lastIndexOf("(");
      if (lastParen !== -1) {
        const closeParen = nombre.indexOf(")", lastParen);
        const dash = nombre.indexOf("-", lastParen);
        let end = -1;
        if (dash !== -1 && (closeParen === -1 || dash < closeParen)) end = dash;
        else if (closeParen !== -1) end = closeParen;
        // OJO: NO se hace .trim() — Excel tampoco lo hace, y los espacios
        // (ej. "630531 " o " S") son los que evitan coincidencias falsas.
        if (end !== -1) inicioSku = nombre.substring(lastParen + 1, end);
      }
      // LÓGICA 3x2: si el último paréntesis trae una "/" (ej. "(A5/B7)") la
      // promoción admite CUALQUIERA de los prefijos indicados. En ese caso el
      // artículo regalado es el que viene con precio 0, igual que en price_off.
      const iniciosSku = inicioSku.includes("/")
        ? inicioSku.split("/").filter((p) => p !== "")
        : inicioSku !== ""
          ? [inicioSku]
          : [];
      const prefijosMultiples = inicioSku.includes("/");
      return { ...t, tienePromo, inicioSku, iniciosSku, prefijosMultiples };
    });


    const itemPromoPorIdx: boolean[] = viConfirmadas.map((v) => {
      const sku = String(v["SKU"] ?? "").trim();
      return todosEnriq.some((t) => t.sku === sku && t.tienePromo);
    });
    const docConItemPromo = new Set<string>();
    viConfirmadas.forEach((v, i) => {
      if (itemPromoPorIdx[i]) docConItemPromo.add(String(v["Número de"] ?? ""));
    });

    // sku_promocion (lista) por fila
    // exigePrecioCero: la fila sólo puede ser el artículo de la promoción si su
    // precio es 0 (promociones con varios prefijos posibles, tipo 3x2).
    const exigePrecioCero: boolean[] = [];
    const skuPromList: string[][] = viConfirmadas.map((v, idx) => {
      const doc = String(v["Número de"] ?? "");
      if (!docConItemPromo.has(doc)) {
        exigePrecioCero[idx] = false;
        return [];
      }
      const sku = String(v["SKU"] ?? "");
      const coincidencias = todosEnriq.filter(
        (t) => t.tienePromo && t.iniciosSku.some((p) => sku.startsWith(p)),
      );
      exigePrecioCero[idx] =
        coincidencias.length > 0 && coincidencias.every((t) => t.prefijosMultiples);
      return coincidencias.map((t) => t.sku);
    });

    const nombrePorSku = new Map<string, string>();
    for (const t of todosSkus) nombrePorSku.set(t.sku, t.nombre);

    // PRICE OFF: el producto en oferta se vende a precio especial y NO lleva
    // artículo regalado. Se reconoce por la palabra "OFERTA" en el nombre del
    // producto (de la línea de venta o del maestro). Estas filas nunca se
    // marcan como promoción mal ingresada: el artículo de la promoción es el
    // mismo ítem vendido.
    const esPriceOff = (nombre: string) => nombre.toUpperCase().includes("OFERTA");
    const esFilaPriceOff = (v: Row) =>
      esPriceOff(String(v["Item"] ?? "")) ||
      esPriceOff(nombrePorSku.get(String(v["SKU"] ?? "").trim()) ?? "");

    // Coincidencia_Doc + sku_promocion_COINCIDENTE
    //
    // OJO: un mismo documento puede traer VARIAS promociones distintas que
    // comparten el mismo Inicio_sku (ej. P26-191 "CUB AQUALOCK 8000" y
    // P26-192 "CUB AQUALOCK BLOQUEADOR DE AGUA", ambas con prefijo "A5").
    // Antes se tomaba SIEMPRE la primera coincidencia del documento, así que
    // la segunda promoción nunca aparecía en el reporte. Ahora se elige la
    // promoción con este orden de preferencia:
    //   1) la promoción cuyo nombre menciona explícitamente el SKU entregado
    //      y que todavía no se ha usado en ese documento,
    //   2) la promoción que menciona el SKU entregado (aunque ya se usara),
    //   3) cualquier promoción del documento aún sin usar,
    //   4) la primera coincidencia (comportamiento anterior).
    // NUEVA REGLA (sin duplicados): se recorre cada LÍNEA PROMOCIONAL del
    // documento y a cada una se le asigna UN SOLO artículo entregado.
    // Antes cada artículo que empezaba con el prefijo (ej. A5WSA10-5 cubeta y
    // A5WSA10-1 galón) generaba su propia fila, duplicando la promoción.
    // Preferencia para elegir el artículo de la promoción:
    //   1) su SKU aparece escrito en el nombre de la promoción,
    //   2) coincide con la presentación indicada (GALON → "-1", CUBETA → "-5"),
    //   3) precio 0 (regalo) y luego el de menor precio.
    // Si la promoción no encuentra artículo, queda como mal ingresada y NO
    // entra al reporte (ni en pantalla ni en el Excel).
    // CANTIDAD DE PROMOCIONALES POR PROMOCIÓN:
    //   - Si el nombre de la promoción trae un número justo después de
    //     "GRATIS" o del precio "+$XX.XX" (ej. "GRATIS 2 GALONES"), cada
    //     promoción entrega ese número de promocionales (2 en adelante).
    //   - Si no trae número, cada promoción entrega 1 promocional.
    // La CANTIDAD de la línea promocional = veces que se dio la promoción.
    // Unidades a tomar del artículo = promocionales × veces. Si el cliente
    // compró más unidades de ese mismo producto, las demás NO se tocan.
    // OJO: si el número va seguido de una unidad de medida (ej. "GRATIS 28 ONZ
    // BS MASILLA") es el tamaño del producto, no la cantidad → cuenta como 1.
    const promocionalesPorPromo = (nombre: string): number => {
      const m = nombre.match(
        /(?:GRATIS|\+\s*\$\s*\d+(?:[.,]\d+)?)\s*:?\s*(?<![\d.,])(\d{1,2})(?![\d.,\/-])(?!\s*(?:ONZ|OZ|ML|LTS?|KG|GRS?|LBS?|PULG|PLG|MM|CM|MTS?|CC|GAL)\b)/i,
      );
      const n = m ? Number(m[1]) : 1;
      return n >= 2 ? n : 1;
    };
    // Palabras del producto que exige la promoción (vacío = sin condición o monto).
    const tokensNombre = (t: string) =>
      t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
        .split(/[^A-Z0-9]+/).filter((w) => w.length >= 2);
    const condicionDeCompra = (nombre: string): string[] => {
      const i = nombre.indexOf(":");
      if (i < 0) return [];
      const antes = nombre.slice(0, i).trim();
      if (antes.includes("$")) return []; // monto en compras: no se toca
      return tokensNombre(antes.replace(/^\d+\s*/, ""));
    };
    // Cada palabra de la condición debe aparecer en el nombre del ítem
    // (se aceptan abreviaturas: CUB ↔ CUBETA, GAL ↔ GALON).
    const nombreCumple = (item: string, condicion: string[]) => {
      const pal = tokensNombre(item);
      return condicion.every((c) => pal.some((w) => w.startsWith(c) || c.startsWith(w)));
    };
    const sinCondicion = new Set<string>();
    const faltaCantidad = new Set<string>();
    const filasParaPlantilla: Array<{ vi: Row; skuCoinc: string; veces: number }> = [];
    const enriqPorSku = new Map<string, (typeof todosEnriq)[number]>();
    for (const t of todosEnriq) if (t.tienePromo) enriqPorSku.set(t.sku, t);
    // Unidades disponibles por línea de artículo (se descuentan al asignar).
    const restante = viConfirmadas.map((v) => Number(v["Cantidad"]) || 0);
    for (let p = 0; p < viConfirmadas.length; p++) {
      if (!itemPromoPorIdx[p]) continue;
      const promoRow = viConfirmadas[p];
      // PRICE OFF: no busca artículo regalado; la fila se resuelve más abajo
      // con su propio código de price off (o su categoría promocional).
      if (esFilaPriceOff(promoRow)) continue;
      const doc = String(promoRow["Número de"] ?? "");
      const skuPromo = String(promoRow["SKU"] ?? "").trim();
      const t = enriqPorSku.get(skuPromo);
      if (!t || !t.iniciosSku.length) continue;
      const nombre = `${String(promoRow["Item"] ?? "")} ${nombrePorSku.get(skuPromo) ?? ""}`.toUpperCase();
      const presentacion = nombre.includes("GALON") ? "-1" : nombre.includes("CUBETA") ? "-5" : "";
      const veces = Math.max(1, Number(promoRow["Cantidad"]) || 1);
      const necesarias = promocionalesPorPromo(nombre) * veces;
      const per = promocionalesPorPromo(nombre);
      const condicion = condicionDeCompra(String(promoRow["Item"] ?? nombrePorSku.get(skuPromo) ?? ""));
      // Candidatos: líneas del mismo documento que pueden ser el promocional.
      // Un producto en OFERTA cuya categoría es un price off también puede ser
      // el regalo de OTRA promoción del documento (ej. 3x2 con color
      // seleccionado): es un producto, no una línea de código de promoción.
      const candidatos: Array<{ j: number; puntaje: number; precio: number }> = [];
      for (let j = 0; j < viConfirmadas.length; j++) {
        if (j === p || restante[j] <= 0) continue;
        const v = viConfirmadas[j];
        if (itemPromoPorIdx[j] && !esFilaPriceOff(v)) continue;
        if (String(v["Número de"] ?? "") !== doc) continue;
        const sku = String(v["SKU"] ?? "").trim();
        if (!t.iniciosSku.some((pre) => sku.startsWith(pre))) continue;
        const precio = Number(v["Precio"]) || 0;
        if (t.prefijosMultiples && precio !== 0) continue;
        let puntaje = 0;
        if (sku && nombre.includes(sku.toUpperCase())) puntaje += 1000;
        if (presentacion && sku.endsWith(presentacion)) puntaje += 100;
        if (precio === 0) puntaje += 10;
        if (restante[j] >= necesarias) puntaje += 5;
        puntaje -= precio / 100000;
        candidatos.push({ j, puntaje, precio });
      }
      // Mismo orden de preferencia de siempre (el primero con mayor puntaje).
      candidatos.sort((a, b) => b.puntaje - a.puntaje || a.j - b.j);
      // Sin artículo promocional en el documento → promoción inválida.
      if (!candidatos.length) continue;
      const mejor = candidatos[0].j;
      // Asignación: { línea, veces que esa línea cubre }.
      let asignaciones: Array<{ j: number; veces: number }> = [];
      if (restante[mejor] >= necesarias) {
        asignaciones = [{ j: mejor, veces }];
      } else {
        // La promoción se dio varias veces y los promocionales vienen en
        // VARIAS líneas (ej. 2 galones de colores distintos para "P26-187"
        // ×2, o 1 Colonial + 2 Peninsular para "3x2" ×3). Se reparten las
        // veces entre las líneas, cada promoción completa en una sola línea.
        // No se usan como regalo las líneas que son el producto que exige la
        // compra (salvo que vengan a precio 0).
        let faltan = veces;
        for (const c of candidatos) {
          if (faltan <= 0) break;
          const v = viConfirmadas[c.j];
          if (
            condicion.length &&
            c.precio !== 0 &&
            nombreCumple(String(v["Item"] ?? nombrePorSku.get(String(v["SKU"] ?? "").trim()) ?? ""), condicion)
          )
            continue;
          const k = Math.min(Math.floor(restante[c.j] / per), faltan);
          if (k <= 0) continue;
          asignaciones.push({ j: c.j, veces: k });
          faltan -= k;
        }
        // Si la promoción pide N promocionales (en número, ej. "GRATIS 2
        // LIJAS"), deben venir N por cada vez que se dio; si no alcanzan, la
        // promoción es inválida. Las medidas como 1/4, 1/8, 1.1 o 28 ONZ y los
        // números en letras ("DOS") cuentan como 1.
        if (faltan > 0) {
          faltaCantidad.add(`${doc}|${skuPromo}`);
          continue;
        }
      }
      // CONDICIÓN DE COMPRA: el texto antes de ":" en el nombre de la promoción
      // es el producto que el cliente debe comprar (ej. "1 CUB EXCELLO LATEX").
      // Si ese producto no está en la factura/CCF → promoción inválida.
      // Si la condición es un monto ("$XX.XX" en compras) no se valida.
      if (condicion.length) {
        const cumple = viConfirmadas.some((v, j) => {
          if (j === p || itemPromoPorIdx[j]) return false;
          if (String(v["Número de"] ?? "") !== doc) return false;
          const a = asignaciones.find((x) => x.j === j);
          if (a && (Number(v["Cantidad"]) || 0) <= a.veces * per) return false;
          return nombreCumple(String(v["Item"] ?? nombrePorSku.get(String(v["SKU"] ?? "").trim()) ?? ""), condicion);
        });
        if (!cumple) {
          sinCondicion.add(`${doc}|${skuPromo}`);
          continue;
        }
      }
      for (const a of asignaciones) {
        restante[a.j] -= a.veces * per;
        filasParaPlantilla.push({
          // En el reporte la cantidad es el número de PROMOCIONES dadas (veces),
          // no la cantidad de promocionales (ej. 2 lijas validadas = 1).
          vi: { ...viConfirmadas[a.j], Cantidad: a.veces },
          skuCoinc: skuPromo,
          veces: a.veces,
        });
      }
    }

    // priceoff_sku por SKU (replica de la fórmula de la columna H de todos_skus)
    const priceoffPorSku = new Map<string, string>();
    for (const t of todosSkus) {
      const cats = String(t.categorias);
      const sku = String(t.sku);
      const last2 = sku.slice(-2);
      let v = "";
      if (cats.includes("34368")) v = last2 === "-1" ? "P25-255" : last2 === "-5" ? "P25-256" : "";
      else if (cats.includes("34369")) v = last2 === "-1" ? "P25-257" : last2 === "-5" ? "P25-258" : "";
      else if (cats.includes("34367")) v = last2 === "-1" ? "P25-259" : last2 === "-5" ? "P25-260" : "";
      priceoffPorSku.set(sku, v);
    }

    // Registros para plantilla 2, en el mismo orden del proceso manual:
    // 1) DocPromo=VERDADERO y Coincidencia_Doc=VERDADERO.
    // 2) price_off no vacío y distinto de #N/D.
    // `veces` = cuántas veces se dio la promoción (para los KPI).
    const registrosP2: Array<{ vi: Row; codigoIdentificador: string; nombrePromo: string; veces: number }> = [];

    for (const { vi, skuCoinc, veces } of filasParaPlantilla) {
      const codigo = String(skuCoinc ?? "");
      if (!codigo.trim()) continue;
      registrosP2.push({
        vi,
        veces,
        codigoIdentificador: codigo,
        nombrePromo: nombrePorSku.get(codigo) ?? "",
      });
    }

    // Promociones con variantes de talla. En estos casos Inicio_sku queda vacío
    // porque el nombre contiene varios códigos (M, L, XL, S-M, L-XL), así que
    // el filtro normal DocPromo + Coincidencia_Doc no puede resolver un solo SKU.
    // El proceso manual agrega una fila por documento: toma la última promoción
    // de talla del documento y el primer artículo entregado que coincida con
    // cualquiera de los códigos de talla anunciados.
    const variantesPorDocumento = new Map<
      string,
      Array<{ vi: Row; codigos: string[] }>
    >();
    viConfirmadas.forEach((vi, i) => {
      if (!itemPromoPorIdx[i]) return;
      const item = String(vi["Item"] ?? "");
      const codigos = Array.from(
        item.matchAll(/(?:S-M|L-XL|M|L|XL)\s*:\s*([A-Z0-9/-]+)/gi),
        (m) => m[1],
      );
      if (codigos.length < 2) return;
      const doc = String(vi["Número de"] ?? "");
      const existentes = variantesPorDocumento.get(doc) ?? [];
      existentes.push({ vi, codigos });
      variantesPorDocumento.set(doc, existentes);
    });

    for (const [doc, variantes] of variantesPorDocumento) {
      // Si el documento ya fue resuelto por el filtro normal, no agregar otra
      // fila: el proceso manual usa esta regla solo para los documentos que
      // quedaron fuera por no poder calcular Inicio_sku.
      if (registrosP2.some((r) => String(r.vi["Número de"] ?? "") === doc)) continue;
      const codigosPosibles = new Set(variantes.flatMap((v) => v.codigos));
      const articuloEntregado = viConfirmadas.find(
        (vi) =>
          String(vi["Número de"] ?? "") === doc &&
          codigosPosibles.has(String(vi["SKU"] ?? "")),
      );
      if (!articuloEntregado) continue;

      const promocionElegida = variantes[variantes.length - 1].vi;
      const skuEntregado = String(articuloEntregado["SKU"] ?? "");
      const prefijoTalla = skuEntregado.slice(0, 4);
      registrosP2.push({
        vi: {
          ...promocionElegida,
          SKU: skuEntregado,
          Cantidad: promocionElegida["Cantidad"] ?? articuloEntregado["Cantidad"],
        },
        codigoIdentificador: String(promocionElegida["SKU"] ?? ""),
        veces: Math.max(1, Number(promocionElegida["Cantidad"]) || 1),
        nombrePromo: `${String(promocionElegida["Item"] ?? "")}(${prefijoTalla}-TALLA)`,
      });
    }

    // PRICE OFF / COLORES SELECCIONADOS
    // Regla: una promoción se aplica bien cuando en la MISMA factura o CCF se
    // registró primero el código de la promoción (línea cuyo SKU o categoría
    // es el código que viene en INFO) y luego el producto promocional.
    //   a) Si el documento trae el código del price off → entra al reporte.
    //   b) Si el documento trae el código de OTRA promoción → se respeta esa
    //      promoción (la resuelve la lógica normal) y NO se toma como price off.
    //   c) Si no trae ningún código pero el producto dice "OFERTA" → se le
    //      pregunta al usuario; si acepta, se le asigna el código que le
    //      corresponde automáticamente.
    const primeraCatPorSku = new Map<string, string>();
    for (const t of todosEnriq)
      primeraCatPorSku.set(t.sku, String(t.categorias).split(":")[0].trim());
    // Códigos de promoción presentes en cada documento (SKU y categoría de las
    // líneas promocionales que NO son el propio producto en oferta).
    const codigosEnDoc = new Map<string, Set<string>>();
    const otraPromoEnDoc = new Set<string>();
    viConfirmadas.forEach((v, i) => {
      const doc = String(v["Número de"] ?? "");
      const sku = String(v["SKU"] ?? "").trim();
      const set = codigosEnDoc.get(doc) ?? new Set<string>();
      set.add(sku);
      if (itemPromoPorIdx[i] && !esFilaPriceOff(v)) {
        set.add(primeraCatPorSku.get(sku) ?? "");
        otraPromoEnDoc.add(doc);
      }
      codigosEnDoc.set(doc, set);
    });
    const decisiones = p.priceOffDecisiones ?? {};
    viConfirmadas.forEach((vi, idx) => {
      const sku = String(vi["SKU"] ?? "").trim();
      const doc = String(vi["Número de"] ?? "");
      const priceOff = priceoffPorSku.get(sku) ?? "";
      const esOferta = esFilaPriceOff(vi);
      if (!priceOff && !esOferta) return; // equivale a #N/D en BUSCARV
      const codigo =
        priceOff || (itemPromoPorIdx[idx] ? primeraCatPorSku.get(sku) ?? "" : "");
      if (!codigo) return;
      const codigos = codigosEnDoc.get(doc) ?? new Set<string>();
      let incluir = codigos.has(codigo);
      if (!incluir) {
        if (otraPromoEnDoc.has(doc) || !esOferta) return; // regla b)
        const clave = `${doc}|${sku}|${idx}`;
        if (decisiones[clave] === undefined) {
          priceOffPendientes.push({
            clave,
            documento: doc,
            fecha: fechaDeFila(vi),
            cliente: String(vi["codigo"] ?? vi["Nombre"] ?? ""),
            sku,
            producto: String(vi["Item"] ?? nombrePorSku.get(sku) ?? ""),
            cantidad: Number(vi["Cantidad"]) || 0,
            codigo,
          });
          return;
        }
        incluir = decisiones[clave];
      }
      if (!incluir) return;
      registrosP2.push({
        vi,
        codigoIdentificador: codigo,
        veces: Math.max(1, Number(vi["Cantidad"]) || 1),
        // El reporte manual conserva el nombre real del producto, no un literal
        nombrePromo: String(vi["Item"] ?? nombrePorSku.get(sku) ?? ""),
      });
    });

    // Marcado de filas para la tabla resumen en pantalla (no altera el reporte).
    // Algunos registros de promociones (variantes de talla) se construyen como
    // COPIA de la fila original, por lo que la comparación por identidad las
    // dejaba fuera del resumen. Se marca por clave documento+SKU para que las
    // filas de promociones aparezcan igual que las de CDP.
    const claveFila = (r: Row) =>
      `${String(r["Número de"] ?? "").trim()}|${String(r["SKU"] ?? "").trim()}`;
    const clavesEnReportePromo = new Set(registrosP2.map((r) => claveFila(r.vi)));
    viConfirmadas.forEach((v, i) => {
      if (itemPromoPorIdx[i]) setItemPromo.add(v);
      const sk = String(v["SKU"] ?? "").trim();
      if (String(priceoffPorSku.get(sk) ?? "").trim()) setColorSeleccionado.add(v);
      if (clavesEnReportePromo.has(claveFila(v))) {
        setEnReportePromo.add(v);
        setItemPromo.add(v); // el ítem forma parte de una promoción del reporte
      }
    });
    // Las filas asignadas son copias (con la cantidad tomada), se marca por clave.
    const clavesCoinc = new Set(filasParaPlantilla.map((f) => claveFila(f.vi)));
    viConfirmadas.forEach((v) => {
      if (clavesCoinc.has(claveFila(v))) setCoincidePromo.add(v);
    });
    for (const r of registrosP2) setEnReportePromo.add(r.vi);
    for (const r of registrosP2) {
      const k = claveFila(r.vi);
      conteoPromoPorClave.set(k, (conteoPromoPorClave.get(k) ?? 0) + 1);
    }

    // Detalle de promociones aplicadas (agrupado por código identificador)

    // Categoría de KOLO a la que pertenece cada código de promoción.
    const nombrePromoPorCodigo = new Map<string, string>();
    for (const p of promociones) {
      nombrePromoPorCodigo.set(String(p.codigo).trim(), String(p.promocion).trim());
    }
    const categoriasPorSku = new Map<string, string>();
    for (const t of todosSkus) categoriasPorSku.set(String(t.sku), String(t.categorias));
    const categoriaDe = (codigo: string): string => {
      const directa = nombrePromoPorCodigo.get(codigo);
      if (directa) return directa;
      const cats = categoriasPorSku.get(codigo) ?? "";
      for (const c of cats.split(":").map((x) => x.trim())) {
        const nombre = nombrePromoPorCodigo.get(c);
        if (nombre) return nombre;
      }
      return cats.split(":")[0]?.trim() || "—";
    };

    const promoCount = new Map<string, { nombre: string; cantidad: number }>();
    for (const r of registrosP2) {
      const cod = String(r.codigoIdentificador ?? "").trim();
      if (!cod) continue;
      const prev = promoCount.get(cod);
      // Cantidad = suma de las veces que se dio la promoción (no filas).
      if (prev) {
        prev.cantidad += r.veces;
      } else {
        promoCount.set(cod, { nombre: String(r.nombrePromo ?? "").trim(), cantidad: r.veces });
      }
    }
    detallePromocionesAplicadas = Array.from(promoCount.entries())
      .map(([codigo, { nombre, cantidad }]) => ({
        codigo,
        nombre,
        cantidad,
        categoria: categoriaDe(codigo),
      }))
      .sort((a, b) => b.cantidad - a.cantidad);

    // KPI 10: ítems de promoción efectivamente colocados en el reporte de promociones
    totalItemsConPromocion = registrosP2.reduce((a, r) => a + r.veces, 0);
    // KPI 11: ítems marcados como promoción cuyo documento nunca se pudo resolver
    // (promoción ingresada erróneamente: falta el artículo o el código no coincide)
    const docsResueltos = new Set(
      registrosP2.map((r) => String(r.vi["Número de"] ?? "")),
    );
    const promosResueltas = new Set(
      filasParaPlantilla.map((f) => `${String(f.vi["Número de"] ?? "")}|${f.skuCoinc}`),
    );
    // PRICE OFF por nombre de promoción: "PRICE OFF GAL PENINSULAR LATEX COLORES
    // SELECCIONADOS" → producto = "GAL PENINSULAR LATEX". Se cumple si en el
    // mismo documento hay un ítem cuyo nombre empieza con esas palabras (en orden)
    // y termina con la palabra OFERTA.
    const priceOffCumplido = (v: Row): boolean => {
      const skuPromo = String(v["SKU"] ?? "").trim();
      const nom = `${String(v["Item"] ?? "")} | ${nombrePorSku.get(skuPromo) ?? ""}`.toUpperCase();
      const m = nom.match(/PRICE\s*-?\s*OFF\s+([^|]+)/);
      if (!m) return false;
      const prod = tokensNombre(m[1].replace(/COLORES?\s+SELECCIONADOS?.*/, ""));
      if (!prod.length) return false;
      const doc = String(v["Número de"] ?? "");
      return viConfirmadas.some((o) => {
        if (o === v || String(o["Número de"] ?? "") !== doc) return false;
        const sk = String(o["SKU"] ?? "").trim();
        // a) El maestro ya vincula ese SKU con este código de price off.
        if (String(priceoffPorSku.get(sk) ?? "").trim() === skuPromo) return true;
        // b) Nombre del ítem (factura o maestro) con OFERTA y que empieza
        //    con el producto que nombra la promoción.
        const nombres = [String(o["Item"] ?? ""), nombrePorSku.get(sk) ?? ""];
        return nombres.some((n) => {
          const it = n.toUpperCase();
          if (!/OFERTA/.test(it)) return false;
          const pal = tokensNombre(it);
          return prod.every((c, k) => pal[k] !== undefined && (pal[k].startsWith(c) || c.startsWith(pal[k])));
        });
      });
    };
    detallePromocionesErroneas = viConfirmadas
      .map((v, i) => ({ v, i }))
      .filter(
        ({ v, i }) =>
          // PRICE OFF: nunca es promoción mal ingresada.
          !esFilaPriceOff(v) &&
          // Promoción "PRICE OFF <producto> ...": válida si el documento trae
          // un ítem que empieza con <producto> y termina con OFERTA.
          !priceOffCumplido(v) &&
          ((itemPromoPorIdx[i] &&
          !promosResueltas.has(`${String(v["Número de"] ?? "")}|${String(v["SKU"] ?? "").trim()}`) &&
          !docsResueltos.has(String(v["Número de"] ?? ""))) ||
          (itemPromoPorIdx[i] && docsResueltos.has(String(v["Número de"] ?? "")) &&
            !promosResueltas.has(`${String(v["Número de"] ?? "")}|${String(v["SKU"] ?? "").trim()}`) &&
            !registrosP2.some((r) => r.vi === v))),
      )
      .map(({ v, i }) => {
        const doc = String(v["Número de"] ?? "");
        const lista = skuPromList[i] ?? [];
        const motivo = /PRICE\s*-?\s*OFF/i.test(String(v["Item"] ?? ""))
          ? "En el documento no hay un ítem en OFERTA del producto que indica el price off"
          : faltaCantidad.has(`${doc}|${String(v["SKU"] ?? "").trim()}`)
          ? "El promocional no viene en la cantidad que indica la promoción"
          : sinCondicion.has(`${doc}|${String(v["SKU"] ?? "").trim()}`)
          ? "En el documento no está el producto que exige la promoción"
          : !docConItemPromo.has(doc)
          ? "No se encontró el artículo de la promoción en el documento"
          : lista.length === 0
            ? "Ningún SKU coincide con el inicio de la promoción (posible error de escritura)"
            : "El artículo esperado de la promoción no está en el documento";
        return {
          documento: doc,
          sku: String(v["SKU"] ?? ""),
          item: String(v["Item"] ?? ""),
          cantidad: Number(v["Cantidad"]) || 0,
          motivo,
        };
      });
    totalItemsPromocionErroneos = detallePromocionesErroneas.reduce((a, d) => a + Math.max(1, d.cantidad), 0);



    const sucursal = "SUCURSAL: USULUTAN Y JIQUILISCO";
    const nombrePromos =
      "NOMBRE DE PROMOCIONES: " + promociones.map((p) => p.promocion).join(", ");
    const periodoTxt =
      periodoDesde && periodoHasta
        ? "PERIODO " + formatearPeriodo(periodoDesde, periodoHasta)
        : "PERIODO";

    // --- Copiar las hojas de plantilla 2 al workbook ---
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(plantilla2.buffer);
    let primeraHojaP2: ExcelJS.Worksheet | null = null;
    for (const wsOrig of wb2.worksheets) {
      let nombre = ("P2_" + wsOrig.name).substring(0, 31);
      let n = 1;
      while (wb.getWorksheet(nombre)) {
        nombre = ("P2_" + wsOrig.name + "_" + ++n).substring(0, 31);
      }
      const wsNew = wb.addWorksheet(nombre);
      wsOrig.eachRow({ includeEmpty: true }, (row, rIdx) => {
        const target = wsNew.getRow(rIdx);
        if (row.height) target.height = row.height;
        row.eachCell({ includeEmpty: true }, (cell, cIdx) => {
          const tc = target.getCell(cIdx);
          const v = cell.value as unknown;
          if (v && typeof v === "object" && "formula" in (v as Record<string, unknown>)) {
            const fr = (v as { result?: unknown }).result;
            tc.value = (fr ?? null) as ExcelJS.CellValue;
          } else {
            tc.value = v as ExcelJS.CellValue;
          }
          try {
            if (cell.style) tc.style = JSON.parse(JSON.stringify(cell.style));
          } catch {
            /* ignore */
          }
        });
        target.commit();
      });
      wsOrig.columns?.forEach((col, i) => {
        if (col?.width) wsNew.getColumn(i + 1).width = col.width;
      });
      // Copiar celdas combinadas — sin esto Excel pide recuperación
      const merges = (wsOrig as unknown as { model?: { merges?: string[] } }).model?.merges;
      if (merges && Array.isArray(merges)) {
        for (const m of merges) {
          try {
            wsNew.mergeCells(m);
          } catch {
            /* ignore */
          }
        }
      }
      hojasPlantilla2.push(nombre);
      if (!primeraHojaP2) primeraHojaP2 = wsNew;
    }

    // --- Llenar la primera hoja de plantilla 2 ---
    if (primeraHojaP2) {
      const wsP2 = primeraHojaP2;
      wsProm = wsP2;

      // Localizar fila de encabezados (FECHA, TIPO DE DOCUMENTO, ...)
      let filaEnc = 5;
      for (let r = 1; r <= Math.min(20, wsP2.rowCount); r++) {
        const row = wsP2.getRow(r);
        const txt = (row.values as unknown[])
          .map((v) => String(v ?? "").toUpperCase())
          .join("|");
        if (txt.includes("FECHA") && txt.includes("DOCUMENTO") && txt.includes("CANTIDAD")) {
          filaEnc = r;
          break;
        }
      }

      // Escribir metadatos en columna A (una sola vez)
      wsP2.getCell("A1").value = sucursal;
      wsP2.getCell("A2").value = nombrePromos;
      wsP2.getCell("A3").value = periodoTxt;

      const headers: string[] = [];
      const hRow = wsP2.getRow(filaEnc);
      for (let c = 1; c <= wsP2.columnCount; c++) {
        headers.push(String(hRow.getCell(c).value ?? "").toUpperCase().trim());
      }
      const findP2 = (pred: (h: string) => boolean, fb: number) => {
        const i = headers.findIndex(pred);
        return i === -1 ? fb : i + 1;
      };
      const c2_FECHA = findP2((h) => h === "FECHA" || h.startsWith("FECHA"), 1);
      const c2_TIPO = findP2((h) => h.includes("TIPO") && h.includes("DOCUMENTO"), 2);
      const c2_NDOC = findP2(
        (h) =>
          (h.includes("N°") || h.includes("Nº") || h.includes("N\u00b0") || h.startsWith("N ")) &&
          h.includes("DOCUMENTO"),
        3,
      );
      const c2_CODID = findP2((h) => h.includes("IDENTIFICADOR"), 4);
      const c2_SKU = findP2((h) => h.includes("CODIGO") && h.includes("SKU"), 5);
      const c2_NOMPROM = findP2(
        (h) => h.includes("NOMBRE") && h.includes("PROMOCION") && !h.includes("PROMOCIONES"),
        6,
      );
      const c2_CANT = findP2((h) => h.includes("CANTIDAD"), 7);

      // Limpiar filas de datos previas
      for (let r = filaEnc + 1; r <= wsP2.rowCount; r++) {
        const row = wsP2.getRow(r);
        row.eachCell({ includeEmpty: false }, (cell) => {
          cell.value = null;
        });
      }

      for (let i = 0; i < registrosP2.length; i++) {
        const { vi, codigoIdentificador, nombrePromo } = registrosP2[i];
        const r = filaEnc + 1 + i;
        const t = wsP2.getRow(r);
        const fVal = vi["fecha completa"];
        const celdaFecha = t.getCell(c2_FECHA);
        if (typeof fVal === "string" && /^\d{4}-\d{2}-\d{2}/.test(fVal)) {
          const [aa, mm, dd] = fVal.slice(0, 10).split("-").map(Number);
          // Fecha UTC para evitar que ExcelJS desplace la hora según la zona
          // del navegador (el manual guarda las fechas exactamente a medianoche).
          celdaFecha.value = new Date(Date.UTC(aa, mm - 1, dd));
          celdaFecha.numFmt = "dd/mm/yyyy";
        } else {
          celdaFecha.value = (fVal ?? null) as ExcelJS.CellValue;
        }
        t.getCell(c2_TIPO).value = String(vi["Tipo"] ?? "");
        t.getCell(c2_NDOC).value = String(vi["Número de"] ?? "");
        t.getCell(c2_CODID).value = codigoIdentificador;
        t.getCell(c2_SKU).value = String(vi["SKU"] ?? "");
        t.getCell(c2_NOMPROM).value = nombrePromo;
        t.getCell(c2_CANT).value = Number(vi["Cantidad"]) || 0;
        t.commit();
      }
    }
  }

  // 9. DEJAR SOLO LAS DOS PLANTILLAS LLENAS Y ESCRIBIR EL ARCHIVO
  // Las hojas de trabajo (VENTAS_*, v_i_confirmadas, todos_skus, INFO, copias de
  // la plantilla 2) solo sirven para el cálculo: se eliminan antes de exportar.
  wsPlantilla.name = "Reporte CDP";
  if (wsProm) wsProm.name = "Reporte_Prom";
  for (const ws of [...wb.worksheets]) {
    if (ws !== wsPlantilla && ws !== wsProm) wb.removeWorksheet(ws.id);
  }

  // Nombre del archivo: conserva los nombres de las promociones, pero elimina
  // de cada nombre su rango de vigencia. El rango final corresponde al reporte.
  const guion = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}-${m}-${y}`;
  };
  // Nombre del archivo: fechas tomadas de la detección automática del periodo.
  const rangoTxt =
    periodoDesde && periodoHasta
      ? ` del ${guion(periodoDesde)} al ${guion(periodoHasta)}`
      : "";
  const archivoNombre =
    `Reporte de Promociones y Descuentos CDP${rangoTxt}.xlsx`.replace(
      /[\\/:*?"<>|]/g,
      "-",
    );
  const out = await wb.xlsx.writeBuffer();
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  if (descargar) descargarBlob(blob, archivoNombre);

  // 10. VISTA PREVIA DE TODAS LAS HOJAS
  const cellToText = (v: unknown): string | number => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number" || typeof v === "string") return v;
    if (v instanceof Date) {
      return `${String(v.getUTCDate()).padStart(2, "0")}/${String(v.getUTCMonth() + 1).padStart(2, "0")}/${v.getUTCFullYear()}`;
    }
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellToText(o.result);
    if ("formula" in o) return `=${String(o.formula)}`;
    if ("richText" in o)
      return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return String(o.text);
    return String(v);
  };

  const MAX_FILAS = 200;
  const hojas: HojaPreview[] = wb.worksheets.map((ws) => {
    const maxCol = Math.min(ws.columnCount || 1, 40);
    const leerFila = (r: number): (string | number)[] => {
      const row = ws.getRow(r);
      const arr: (string | number)[] = [];
      for (let c = 1; c <= maxCol; c++) arr.push(cellToText(row.getCell(c).value));
      return arr;
    };
    // detectar primera fila con contenido como encabezado
    let filaEnc = 1;
    for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
      if (leerFila(r).some((v) => String(v).trim() !== "")) {
        filaEnc = r;
        break;
      }
    }
    const headers = leerFila(filaEnc).map((h, i) => (String(h).trim() || `Col ${i + 1}`));
    const filas: (string | number)[][] = [];
    for (let r = filaEnc + 1; r <= ws.rowCount && filas.length < MAX_FILAS; r++) {
      const f = leerFila(r);
      if (f.every((v) => String(v).trim() === "")) continue;
      filas.push(f);
    }
    return {
      nombre: ws.name,
      headers,
      filas,
      totalFilas: Math.max(ws.rowCount - filaEnc, 0),
    };
  });

  const ordenesConfirmadasSet = new Set(
    ordenesConfirmadas.map((o) =>
      String(o["Numero de factura"] ?? o["Número de factura"] ?? "").trim(),
    ),
  );
  // LISTADOS DE APOYO PARA LOS KPI (solo pantalla, no afectan el Excel)
  // Cada ítem se marca como confirmado si su documento pertenece a una orden
  // confirmada y la fila no está anulada.
  const listaItems: ItemRegistro[] = itemsData.map((it) => {
    const anulada = String(it["Anulada"] ?? "NO").toUpperCase().trim();
    const doc = String(it["Número de"] ?? it["Número de control"] ?? "").trim();
    const confirmado = anulada !== "SI" && ordenesConfirmadasSet.has(doc);
    return {
      documento: doc,
      fecha: fechaDeFila(it),
      sku: String(it["SKU"] ?? it["Sku"] ?? it["sku"] ?? "").trim(),
      nombre: String(it["Item"] ?? it["Nombre de item"] ?? it["Descripcion"] ?? "").trim(),
      cantidad: Number(it["Cantidad"] ?? 0) || 0,
      confirmado,
    };
  });
  const totalItemsConfirmados = listaItems.filter((i) => i.confirmado).length;
  const totalItemsNoConfirmados = listaItems.length - totalItemsConfirmados;

  // Listado de órdenes con su estado (confirmada, creada o cualquier otro).
  const listaOrdenes: OrdenRegistro[] = ordenesData.map((o) => {
    const estado = String(o["Estado"] ?? o["estado"] ?? "").trim();
    const e = estado.toLowerCase();
    return {
      codigo: String(o["Código"] ?? o["Codigo"] ?? o["codigo"] ?? "").trim(),
      documento: String(o["Numero de factura"] ?? o["Número de factura"] ?? "").trim(),
      fecha: fechaDeFila(o),
      cliente: String(o["Codigo clie"] ?? o["Codigo cliente"] ?? "").trim(),
      nombreCliente: nombreClienteDeFila(o),
      estado,
      confirmada: e === "confirmada",
      // Pendiente: cualquier estado que no sea confirmada ni anulada
      creada:
        e !== "" &&
        !e.normalize("NFD").replace(/[\u0300-\u036f]/g, "").startsWith("confirmad") &&
        !e.normalize("NFD").replace(/[\u0300-\u036f]/g, "").startsWith("anulad"),
    };
  });
  const totalOrdenesCreadas = listaOrdenes.filter((o) => o.creada).length;

  // Detalle de códigos de cliente únicos (para detectar posibles errores de escritura).
  // Se guarda además el nombre del cliente tal como aparece en el Excel de órdenes.
  const clienteCount = new Map<string, number>();
  const clienteNombre = new Map<string, string>();

  // Los encabezados del Excel de órdenes vienen truncados o con variantes
  // ("Nombre clie", "NOMBRE DEL CLIENTE", "Razón social"...). Por eso se busca
  // la columna de forma difusa: se normaliza (sin acentos, minúsculas) y se
  // toma la primera que hable de "nombre"/"razon" y no sea el propio código.
  const normHeader = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const buscarCodigoCliente = (row: Row): string => {
    for (const k of Object.keys(row)) {
      const h = normHeader(k);
      if (h.includes("codigo") && (h.includes("clie") || h.includes("cdp"))) {
        const v = String(row[k] ?? "").trim();
        if (v) return v.toUpperCase();
      }
    }
    return "";
  };

  const buscarNombreCliente = (row: Row): string => {
    for (const k of Object.keys(row)) {
      const h = normHeader(k);
      const esNombre =
        (h.includes("nombre") && !h.includes("codigo")) ||
        h.includes("razon") ||
        h === "cliente" ||
        h === "clie";
      if (!esNombre) continue;
      // Evitar columnas de producto/ítem
      if (h.includes("item") || h.includes("producto") || h.includes("sku")) continue;
      const v = String(row[k] ?? "").trim();
      if (v) return v;
    }
    return "";
  };

  const registrarCliente = (row: Row, contar: boolean) => {
    const cod = buscarCodigoCliente(row);
    if (!cod) return;
    if (contar) clienteCount.set(cod, (clienteCount.get(cod) ?? 0) + 1);
    if (!clienteNombre.get(cod)) {
      const nom = buscarNombreCliente(row);
      if (nom) clienteNombre.set(cod, nom);
    }
  };

  for (const o of ordenesData) registrarCliente(o, true);
  // Respaldo: si el nombre no está en órdenes, se busca en la tabla de ventas.
  for (const it of itemsData) registrarCliente(it, false);
  const detalleCodigosClienteUnicos: CodigoCliente[] = Array.from(clienteCount.entries())
    .map(([codigo, cantidad]) => ({
      codigo,
      cantidad,
      esCDP: codigo.replace(/\s+/g, "").startsWith("CDP"),
      nombre: clienteNombre.get(codigo) ?? "",
    }))
    .sort((a, b) => b.cantidad - a.cantidad);
  const totalClientesCDP = detalleCodigosClienteUnicos.filter((c) => c.esCDP).length;

  // KPI 12: CDP con un descuento distinto al de su categoría.
  // El maestro de productos guarda los precios CDP dentro de la columna "precio"
  // como pares "CODIGO_CDP:precio" separados por , ; | o salto de línea.
  const preciosCDPporSku = new Map<string, Map<string, number>>();
  for (const prod of productosData) {
    const sku = String(prod["sku"] ?? prod["SKU"] ?? "").trim();
    const precioRaw = String(prod["precio"] ?? prod["Precio"] ?? "");
    if (!sku || !precioRaw.includes(":")) continue;
    const mapa = new Map<string, number>();
    for (const token of precioRaw.split(/[,;|\n\r]+/)) {
      const idx = token.indexOf(":");
      if (idx === -1) continue;
      const clave = token.slice(0, idx).trim();
      const valor = parseFloat(token.slice(idx + 1).replace(/[^0-9.,-]/g, "").replace(",", "."));
      if (!clave || isNaN(valor)) continue;
      const tipo = extraerTipoCDP(clave);
      if (tipo) mapa.set(tipo, valor);
    }
    if (mapa.size) preciosCDPporSku.set(sku, mapa);
  }

  const detalleCdpDescuentoAtipico: CdpDescuentoAtipico[] = [];
  for (const r of datosFiltrados) {
    const sku = String(r["SKU"] ?? "").trim();
    const tipo = String(r["tipo de cdp"] ?? "").trim();
    const mapa = preciosCDPporSku.get(sku);
    if (!tipo || !mapa || !mapa.has(tipo)) continue;
    const esperado = mapa.get(tipo) as number;
    const aplicado = Number(r["Precio"]) || 0;
    if (Math.abs(aplicado - esperado) > 0.01) {
      detalleCdpDescuentoAtipico.push({
        documento: String(r["Número de"] ?? ""),
        codigoCDP: String(r["Codigo CDP"] ?? ""),
        tipoCDP: tipo,
        sku,
        precioAplicado: aplicado,
        precioEsperado: esperado,
      });
    }
  }

  // ============ TABLA RESUMEN PARA PANTALLA ============
  // Una fila por ítem vendido confirmado, con los datos relevantes del reporte.
  // No interviene en la generación del Excel: solo resume lo ya calculado.
  const clientePorDoc = new Map<string, { codigo: string; nombre: string }>();
  for (const o of ordenesData) {
    const doc = String(o["Numero de factura"] ?? o["Número de factura"] ?? "").trim();
    if (!doc) continue;
    clientePorDoc.set(doc, {
      codigo: buscarCodigoCliente(o),
      nombre: buscarNombreCliente(o),
    });
  }
  const setDatosFiltrados = new Set<Row>(datosFiltrados);
  const fechaTxt = (v: unknown): string => {
    const s = String(v ?? "");
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
  };


  const resumen: ResumenItem[] = viConfirmadas.map((v) => {
    const doc = String(v["Número de"] ?? "").trim();
    const cli = clientePorDoc.get(doc);
    return {
      dte: doc,
      tipoDocumento: String(v["Tipo"] ?? ""),
      fecha: fechaTxt(v["fecha completa"]),
      codigoCliente: cli?.codigo || String(v["Codigo CDP"] ?? ""),
      tipoCDP: String(v["tipo de cdp"] ?? ""),
      numeroCDP: String(v["codigo"] ?? ""),
      nombreCliente: cli?.nombre || String(v["Nombre"] ?? ""),
      sku: String(v["SKU"] ?? ""),
      nombreItem: String(v["Item"] ?? ""),
      cantidad: Number(v["Cantidad"]) || 0,
      precio: Number(v["Precio"]) || 0,
      descuentoCDP: setDatosFiltrados.has(v),
      promocion: setItemPromo.has(v),
      promocionCoincide: setCoincidePromo.has(v),
      colorSeleccionado: setColorSeleccionado.has(v),
      enReporte: setDatosFiltrados.has(v) || setEnReportePromo.has(v),
      enReportePromo: setEnReportePromo.has(v),
    };
  });

  // Coherencia con el KPI "Promociones válidas": si una misma fila
  // (documento + SKU) generó varios registros en el reporte de promociones,
  // se agregan las filas faltantes para que el conteo cuadre exactamente.
  const yaContadas = new Map<string, number>();
  for (const f of resumen) {
    if (!f.enReportePromo) continue;
    const k = `${f.dte}|${f.sku}`;
    yaContadas.set(k, (yaContadas.get(k) ?? 0) + 1);
  }
  for (const [k, esperadas] of conteoPromoPorClave) {
    const faltan = esperadas - (yaContadas.get(k) ?? 0);
    if (faltan <= 0) continue;
    const base = resumen.find((f) => `${f.dte}|${f.sku}` === k && f.enReportePromo);
    if (!base) continue;
    for (let i = 0; i < faltan; i++) resumen.push({ ...base });
  }

  const detalleFilaCDP = (r: Row): DetalleDescuentoCDP => {
    const documento = String(r["Número de"] ?? "").trim();
    const cliente = clientePorDoc.get(documento);
    const codigo = cliente?.codigo || String(r["Codigo CDP"] ?? "").trim();
    const nombre = cliente?.nombre || String(r["Nombre"] ?? "").trim();
    const sku = String(r["SKU"] ?? "").trim();
    const item = String(r["Item"] ?? "").trim();
    return {
      documento,
      fecha: fechaTxt(r["fecha completa"]),
      cliente: [codigo, nombre].filter(Boolean).join(" — "),
      producto: [sku, item].filter(Boolean).join(" — "),
      cantidad: Number(r["Cantidad"]) || 0,
    };
  };
  // Todos los ítems confirmados vendidos a clientes CDP, aunque el producto no
  // tenga precio CDP. El segundo listado conserva únicamente los descuentos.
  const itemsConfirmadosCDP = viConfirmadas.filter(
    (r) => String(r["Codigo CDP"] ?? "").trim() !== "",
  );
  const detalleItemsConfirmadosCDP = itemsConfirmadosCDP.map(detalleFilaCDP);
  const detalleDescuentosCDP = datosFiltrados.map(detalleFilaCDP);

  return {
    totalFiltrados: datosFiltrados.length,
    priceOffPendientes,
    archivoNombre,
    resumen,

    blob,
    hojas,
    indicadores: {
      listaItems,
      listaOrdenes,
      totalOrdenesCargadas: ordenesData.length,
      totalItemsCargados: itemsData.length,
      totalOrdenesConfirmadas: ordenesConfirmadas.length,
      totalOrdenesNoConfirmadas: ordenesData.length - ordenesConfirmadas.length,
      totalOrdenesCreadas,
      totalItemsConfirmados,
      totalItemsNoConfirmados,
      totalClientesUnicos: detalleCodigosClienteUnicos.length,
      totalClientesCDP,
      totalClientesNoCDP: detalleCodigosClienteUnicos.length - totalClientesCDP,
      detallePromocionesAplicadas,
      detalleCodigosClienteUnicos,
      totalItemsConfirmadosCDP: itemsConfirmadosCDP.length,
      detalleItemsConfirmadosCDP,
      totalItemsDescuentoCDP: datosFiltrados.length,
      detalleDescuentosCDP,
      totalItemsConPromocion,
      totalItemsPromocionErroneos,
      totalPromocionesRegistradas: totalItemsConPromocion + totalItemsPromocionErroneos,
      detallePromocionesErroneas,
      totalCdpDescuentoDistintoCategoria: detalleCdpDescuentoAtipico.length,
      detalleCdpDescuentoAtipico,
    },
  };


}
