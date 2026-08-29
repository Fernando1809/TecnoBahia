// Consolidador Multi-Hoja — TecnoBahia
// - Lee inputs tabulares con SheetJS (xlsx)
// - Manipula la plantilla con ExcelJS (preserva imágenes, merges y estilos)
// - Genera UN solo archivo consolidado que incluye la plantilla llenada como una hoja más

import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

// Una promoción cargada por el usuario: nombre visible + código de categoría.
export type Promocion = { promocion: string; codigo: string };
// Fila genérica leída de un Excel/CSV: cada columna puede tener cualquier tipo de dato.
export type Row = Record<string, unknown>;

// Estado en memoria de una plantilla (CDP o Promociones) ya leída como buffer binario.
export type PlantillaState = {
  buffer: ArrayBuffer;
  nombre: string; // nombre de la hoja origen
  archivoNombre: string;
};

/** Dispara la descarga de un Blob en el navegador simulando un clic en un enlace <a>. */
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

// ============ LECTURA DE INPUTS ============

/**
 * Lee un archivo Excel (.xlsx/.xls) o CSV subido por el usuario y lo convierte
 * en un arreglo de objetos (una fila = un objeto, llaves = encabezados de columna).
 *
 * Usa la librería SheetJS (xlsx) para el parseo. Antes de convertir a objetos,
 * primero lee la hoja "en crudo" (fila por fila, sin encabezados) para detectar
 * en cuál fila empiezan realmente los datos: busca las primeras 15 filas y elige
 * la primera que contenga las palabras "sku", "codigo" o "precio", ya que los
 * archivos exportados suelen traer varias filas de título/metadatos antes de la
 * tabla real. Esa fila se usa luego como encabezado real de la tabla.
 */
export function leerArchivoTabular(file: File): Promise<Row[]> {
  return new Promise((resolve, reject) => {
    const esCSV = file.name.toLowerCase().endsWith(".csv");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        // CSV se lee como texto plano; Excel se lee como bytes binarios (ArrayBuffer).
        const wb = esCSV
          ? XLSX.read(result as string, { type: "string" })
          : XLSX.read(new Uint8Array(result as ArrayBuffer), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]]; // solo se usa la primera hoja del archivo
        // Lectura "cruda": cada fila como arreglo de celdas, sin asumir encabezados aún.
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
        // Búsqueda de la fila real de encabezados dentro de las primeras 15 filas.
        let start = 0;
        for (let i = 0; i < Math.min(rows.length, 15); i++) {
          const text = (rows[i] as unknown[]).join(",").toLowerCase();
          if (text.includes("sku") || text.includes("codigo") || text.includes("precio")) {
            start = i;
            break;
          }
        }
        // Segunda pasada: ahora sí convierte a objetos, usando "start" como fila de encabezado.
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

/**
 * Lee un archivo de plantilla Excel subido manualmente por el usuario y devuelve
 * su contenido binario (buffer) más el nombre de su primera hoja. Se usa ExcelJS
 * (no SheetJS) porque más adelante se necesita preservar imágenes, celdas
 * combinadas y estilos al escribir sobre la plantilla — algo que SheetJS no
 * soporta bien. NOTA: en la app actual las plantillas vienen incrustadas
 * (ver leerPlantillaDesdeUrl) y esta función queda como utilidad para carga manual.
 */
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


/**
 * Convierte el contenido de un archivo .txt de carga masiva de promociones
 * (formato "Nombre,Código" por línea) en un arreglo de objetos Promocion.
 * Ignora líneas vacías o mal formadas (que no tengan al menos nombre y código).
 */
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

// ============ HELPERS DE NEGOCIO ============

/**
 * A partir de un código de cliente CDP (ej. "CDPCON-ORO123", "CDPCARPPLATA"),
 * extrae una etiqueta legible del "tipo de tarjeta": rol (Contratista/Carpintero)
 * + nivel (Oro/Plata/Platino). Devuelve "" si el código no empieza con "CDP".
 * Pasos:
 *  1) Ubica el primer dígito del código para separar la parte "de texto" del
 *     número de tarjeta.
 *  2) Determina el rol según si el texto contiene "CON" (Contratista) o no
 *     (Carpintero, valor por defecto).
 *  3) Limpia palabras clave (CDP, CON, CARP, MAD, etc.) para intentar aislar
 *     el nivel; si queda vacío, busca directamente ORO/PLATA/PLATINO en el texto.
 */
function extraerTipoCDP(codigo: unknown): string {
  if (!codigo) return "";
  const str = String(codigo);
  if (str.substring(0, 3) !== "CDP") return "";
  let primerNumero = -1;
  for (let i = 0; i < str.length; i++) {
    if (str[i] >= "0" && str[i] <= "9") {
      primerNumero = i;
      break;
    }
  }
  const textoLimpio = primerNumero !== -1 ? str.substring(0, primerNumero) : str;
  const rol = textoLimpio.toUpperCase().includes("CON") ? "CONTRATISTA " : "CARPINTERO ";
  let nivel = textoLimpio.replace(/CDP|CON|CARP|MAD|CARPINTERO|CONTRATISTA|MADERA/gi, "").trim();
  if (!nivel) {
    const up = str.toUpperCase();
    if (up.includes("ORO")) nivel = "ORO";
    else if (up.includes("PLATA")) nivel = "PLATA";
    else if (up.includes("PLATINO")) nivel = "PLATINO";
    else nivel = "";
  }
  return (rol + nivel).trim();
}

/**
 * Del código CDP, recorta todo lo anterior al primer dígito "1" que aparece
 * en el texto (usado para obtener el número de tarjeta/club del cliente,
 * que en estos códigos suele empezar en "1"). Si no hay ningún "1", devuelve
 * un texto de aviso en vez de una cadena vacía, para que sea visible en el reporte.
 */
function extraerDesdePrimerUno(texto: unknown): string {
  if (!texto) return "No empezo con 1";
  const str = String(texto);
  const pos = str.indexOf("1");
  if (pos === -1) return "No empezo con 1";
  return str.substring(pos);
}

/**
 * Arma una fecha "YYYY-MM-DD" a partir de año/mes/día sueltos (como vienen en
 * el archivo de Ítems DTE, en columnas separadas). Valida que la fecha sea
 * real (por ejemplo, rechaza 31 de febrero) reconstruyéndola con el objeto
 * Date y comparando que los componentes coincidan; si no es válida, retorna "".
 */
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

/**
 * Convierte un rango de fechas ISO ("YYYY-MM-DD") en el texto que se imprime
 * en la plantilla, con el formato "DD DE MES AAAA AL DD DE MES AAAA".
 * Ejemplo: "2026-03-16" y "2026-05-31" -> "16 DE MARZO 2026 AL 31 DE MAYO 2026".
 */
function formatearPeriodo(desde: string, hasta: string): string {
  // desde / hasta = "YYYY-MM-DD"
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
    if (!y || !m || !d) return iso;
    return `${String(d).padStart(2, "0")} DE ${MESES_ES[m - 1]} ${y}`;
  };
  return `${fmt(desde)} AL ${fmt(hasta)}`;
}

// ============ GENERACIÓN ============

export type GenerarParams = {
  itemsData: Row[];
  ordenesData: Row[];
  productosData: Row[];
  promociones: Promocion[];
  plantilla: PlantillaState;
  plantilla2?: PlantillaState | null;
  periodoDesde: string; // YYYY-MM-DD
  periodoHasta: string; // YYYY-MM-DD
  descargar?: boolean; // si false, solo devuelve el blob y la vista previa
};

export type HojaPreview = {
  nombre: string;
  headers: string[];
  filas: (string | number)[][];
  totalFilas: number;
};

export type DetallePromocion = { codigo: string; nombre: string; cantidad: number };
export type CodigoCliente = { codigo: string; cantidad: number; esCDP: boolean };
export type CdpDescuentoAtipico = {
  documento: string;
  codigoCDP: string;
  tipoCDP: string;
  sku: string;
  precioAplicado: number;
  precioEsperado: number;
};
// Detalle de un ítem marcado como "promoción errónea": su SKU pertenece a una
// categoría en promoción, pero en su mismo documento (factura) nunca se
// encontró el otro artículo que la promoción exige entregar junto con él
// (p. ej. falta el artículo de regalo, o el código de la promoción no coincide
// con lo realmente vendido). Sirve para que el usuario ubique manualmente el
// documento y decida si corregirlo.
export type ItemPromocionErroneo = {
  documento: string;
  sku: string;
  item: string;
  cantidad: number;
  fecha: string;
};

export type Indicadores = {
  totalOrdenesCargadas: number;
  totalItemsCargados: number;
  totalOrdenesConfirmadas: number;
  totalOrdenesNoConfirmadas: number;
  totalItemsConfirmados: number;
  totalItemsNoConfirmados: number;
  detallePromocionesAplicadas: DetallePromocion[];
  detalleCodigosClienteUnicos: CodigoCliente[];
  totalItemsDescuentoCDP: number;
  totalItemsConPromocion: number;
  totalItemsPromocionErroneos: number;
  detalleItemsPromocionErroneos: ItemPromocionErroneo[];
  totalCdpDescuentoDistintoCategoria: number;
  detalleCdpDescuentoAtipico: CdpDescuentoAtipico[];
};


export type GenerarResultado = {
  totalFiltrados: number;
  archivoNombre: string;
  blob: Blob;
  hojas: HojaPreview[];
  indicadores: Indicadores;
};

/**
 * Función principal del programa: toma los tres archivos fuente (Ítems DTE,
 * Órdenes y Maestro de productos), las promociones ingresadas y las dos
 * plantillas (Reporte CDP y Reporte Promociones), y produce UN solo archivo
 * Excel consolidado que contiene:
 *   - La plantilla "Reporte CDP" ya llenada con los ítems que corresponden.
 *   - La plantilla "Reporte Promociones" ya llenada (si se proveyó plantilla2).
 *   - Varias hojas de apoyo con los datos crudos y los cálculos intermedios
 *     (v_i_confirmadas, todos_skus, CDP_SKUS, etc.), útiles para auditar el
 *     resultado o para que las fórmulas vivas de Excel sigan funcionando
 *     si alguien reabre el archivo y cambia algo a mano.
 * También calcula los indicadores (KPIs) que se muestran en pantalla y arma
 * una vista previa (primeras filas) de cada hoja para mostrarla en la interfaz
 * antes de descargar el archivo.
 *
 * El flujo general (ver los pasos numerados 1-10 en los comentarios de abajo):
 *  1. Filtra las órdenes en estado "confirmada".
 *  2. Detecta cuáles de esas órdenes son de clientes CDP.
 *  3-4. Arma catálogos de SKUs (todos y solo los que tienen precio CDP).
 *  5. Cruza los ítems de venta con las órdenes confirmadas y los códigos CDP
 *     para armar "v_i_confirmadas" (la tabla intermedia central del proceso).
 *  6. Filtra de ahí los registros que realmente van en el Reporte CDP.
 *  7. Abre la plantilla CDP con ExcelJS y la llena fila por fila.
 *  8. Agrega las hojas de análisis/auditoría al mismo libro, incluyendo las
 *     fórmulas "vivas" de Excel que replican el cálculo manual original.
 *  9. Genera el archivo final (Blob) para descarga.
 *  10. Arma una vista previa (primeras 200 filas) de cada hoja para la interfaz.
 */
export async function generarReporte(p: GenerarParams): Promise<GenerarResultado> {

  const {
    itemsData,
    ordenesData,
    productosData,
    promociones,
    plantilla,
    plantilla2,
    periodoDesde,
    periodoHasta,
    descargar = true,
  } = p;


  // 1. ÓRDENES CONFIRMADAS
  // Solo interesan las órdenes cuyo estado sea exactamente "confirmada"
  // (comparación insensible a mayúsculas/espacios).
  const ordenesConfirmadas = ordenesData.filter((r) => {
    const estado = String(r["Estado"] ?? r["estado"] ?? "").toLowerCase().trim();
    return estado === "confirmada";
  });

  // 2. VALIDACIÓN CDP
  // De las órdenes confirmadas, se separan las que pertenecen a clientes CDP
  // (su código de cliente contiene el texto "CDP"). Con eso se arma una tabla
  // de referencia número de factura -> código CDP, para poder "pegarle" ese
  // código a cada ítem de venta más adelante (paso 5).
  const ordenesCDP = ordenesConfirmadas.filter((r) => {
    const codCliente = String(r["Codigo clie"] ?? r["Codigo cliente"] ?? "").toUpperCase();
    return codCliente.includes("CDP");
  });
  const validacionCDPData = ordenesCDP.map((r) => ({
    "Numero de factura": r["Numero de factura"] ?? r["Número de factura"] ?? "",
    "Codigo CDP": String(r["Codigo clie"] ?? r["Codigo cliente"] ?? "").toUpperCase(),
    "Codigo Cliente": r["Codigo clie"] ?? r["Codigo cliente"] ?? "",
  }));

  /** Busca el código CDP asociado a un número de factura (búsqueda lineal). */
  const buscarCodigoCDP = (numeroFactura: unknown): string => {
    if (!validacionCDPData.length) return "";
    for (const v of validacionCDPData) {
      if (String(v["Numero de factura"] ?? "") === String(numeroFactura)) {
        return String(v["Codigo CDP"] ?? "");
      }
    }
    return "";
  };

  /**
   * Un SKU "tiene precio CDP" cuando, en el Maestro de productos, su columna
   * de precio contiene el carácter ":" — ahí es donde van codificados los
   * pares "CODIGO_CDP:precio" (ver preciosCDPporSku más abajo).
   */
  const tienePrecioConDosPuntos = (sku: string): boolean =>
    productosData.some((prod) => {
      const skuP = String(prod["sku"] ?? prod["SKU"] ?? "").trim();
      const precioP = String(prod["precio"] ?? prod["Precio"] ?? "");
      return skuP === sku && precioP.includes(":");
    });

  // 3. TODOS SKUS  (las 4 últimas columnas se llenan como fórmulas vivas más abajo)
  // Copia limpia del Maestro de productos con solo los campos que interesan.
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
  // Marca cada SKU con "Si tiene" / "No tiene" precio CDP, para poder filtrar
  // en el siguiente paso.
  const todosSkusConFlag = todosSkus.map((x) => ({
    ...x,
    _tieneCDP: x.precio.includes(":") ? "Si tiene" : "No tiene",
  }));

  // 4. CDP SKUS
  // Subconjunto de todosSkus: solo los productos que sí tienen precio CDP.
  // Se guarda como hoja aparte para revisión rápida del catálogo CDP.
  const cdpSkus = todosSkusConFlag
    .filter((x) => x._tieneCDP === "Si tiene")
    .map((x) => ({
      sku: x.sku,
      nombre: x.nombre,
      precio: x.precio,
      categorias: x.categorias,
      "Tiene CDP": x._tieneCDP,
    }));

  // 5. VI CONFIRMADAS ("ventas de ítems confirmadas")
  // Esta es la tabla central del proceso: recorre cada ítem de venta (Ítems DTE)
  // que no esté anulado, le busca su código CDP (paso 2) según el número de
  // factura, calcula si el ítem cuenta como "Item CDP" (el SKU tiene precio
  // CDP Y la orden trae un código CDP válido), arma la fecha completa a partir
  // de año/mes/día, y extrae el "tipo de tarjeta" (rol+nivel) del código CDP.
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
  // De todos los ítems confirmados, solo van al Reporte CDP los que: tienen
  // precio distinto de cero, sí tienen código CDP asociado, y están marcados
  // como "Item CDP" (según la regla del paso 5).
  const datosFiltrados = viConfirmadas.filter(
    (r) => r["Precio"] !== 0 && r["Codigo CDP"] !== "" && r["Item CDP"] === 1,
  );

  // 7. ABRIR PLANTILLA CON EXCELJS (preserva imágenes, merges, estilos)
  // A partir de aquí se trabaja con ExcelJS en vez de SheetJS, porque se
  // necesita escribir sobre un archivo .xlsx existente sin destruir su diseño
  // (logos, celdas combinadas, formato de columnas, etc.).
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(plantilla.buffer);
  const wsPlantilla = wb.getWorksheet(plantilla.nombre) ?? wb.worksheets[0];

  // 7a. Periodo en B4
  if (periodoDesde && periodoHasta) {
    wsPlantilla.getCell("B4").value = formatearPeriodo(periodoDesde, periodoHasta);
  }

  // 7b. Detectar fila de encabezados y mapear columnas
  // Por defecto: encabezados en fila 6, datos desde fila 7 (caso del template oficial).
  // Se intenta detectar automáticamente por si la plantilla cambia de estructura.
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

  // Lee los textos de encabezado de esa fila para poder ubicar cada columna
  // por su nombre (en vez de asumir un número de columna fijo), ya que el
  // orden exacto de columnas puede variar entre versiones de la plantilla.
  const enc: string[] = [];
  const headerRow = wsPlantilla.getRow(filaEncabezado);
  for (let c = 1; c <= wsPlantilla.columnCount; c++) {
    enc.push(String(headerRow.getCell(c).value ?? "").toUpperCase().trim());
  }
  /** Busca la columna (1-based) cuyo encabezado cumple "pred"; si no la encuentra, usa "fallback". */
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

  // 7c. Limpiar cualquier dato de una ejecución anterior de la plantilla,
  // dejando intactos los estilos, imágenes y celdas combinadas (solo se
  // borra el VALOR de cada celda, nunca su formato).
  const filaInicioDatos = filaEncabezado + 1;
  for (let r = filaInicioDatos; r <= wsPlantilla.rowCount; r++) {
    const row = wsPlantilla.getRow(r);
    row.eachCell({ includeEmpty: false }, (cell) => {
      cell.value = null;
    });
  }

  // 7d. Llenar datos: una fila por cada registro de datosFiltrados, columna
  // por columna según las posiciones detectadas arriba.
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

  // 8. AGREGAR LAS HOJAS DE ANÁLISIS AL MISMO WORKBOOK
  // Estas hojas no son para imprimir: sirven de respaldo/auditoría y para que
  // las fórmulas de Excel (COUNTIFS, VLOOKUP, FILTER, etc.) que se escriben más
  // abajo tengan de dónde leer, tal como en el proceso manual original.
  /** Crea una hoja nueva a partir de un arreglo de objetos: primera fila = encabezados (llaves del primer objeto). */
  const addJsonSheet = (name: string, rows: Row[]) => {
    // Si ya existe (raro: misma plantilla con esos nombres), renombrar
    let finalName = name.substring(0, 31); // Excel limita los nombres de hoja a 31 caracteres
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

  // Hoja INFO: lista simple de promociones ingresadas por el usuario (nombre +
  // código). La fórmula "TIENE PROMOCION" de la hoja todos_skus busca sus
  // códigos aquí, en el rango Info!$B$6:$B$9 en adelante.
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

  // Copias íntegras de los archivos fuente, sin procesar, para trazabilidad.
  addJsonSheet("VENTAS_ORDENES", ordenesData);
  addJsonSheet("VENTAS_ITEMS", itemsData);
  addJsonSheet("VALIDACION_CDP", validacionCDPData as unknown as Row[]);

  // v_i_confirmadas: base (columnas A-O, ya calculadas en JS más arriba) +
  // 8 columnas adicionales (P-W) que se escriben como FÓRMULAS DE EXCEL en
  // vez de valores fijos, para que el archivo siga siendo "vivo": si alguien
  // agrega una promoción o corrige un dato a mano y presiona recalcular,
  // estas columnas se actualizan solas. Distribución de columnas:
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
    // A partir de aquí, cada celda recibe un objeto { formula: "..." } en vez
    // de un valor directo: ExcelJS lo interpreta como una fórmula de Excel
    // real, que el usuario verá y podrá recalcular al abrir el archivo.
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

  // TODOS_SKUS: catálogo completo de productos (base A-D) + 4 columnas con
  // fórmulas vivas (E-H) que calculan, para cada SKU: si tiene precio CDP,
  // si su categoría está en la lista de promociones vigentes, y — para las
  // promociones de categorías especiales 34367/34368/34369 — un código de
  // "price off" fijo según el sufijo del SKU (-1 o -5).
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
    // E: ¿tiene precio CDP? -> busca ":" en la columna de precio (mismo criterio que tienePrecioConDosPuntos en JS).
    fila.getCell(5).value = {
      formula: `IF(IFERROR(FIND(":",C${r}),"No tiene")="No tiene","No tiene","Si tiene")`,
    };
    // F: TIENE PROMOCION -> compara la primera categoría del producto (antes
    // del primer ":") contra la lista de códigos de promoción en la hoja INFO.
    fila.getCell(6).value = {
      formula: `COUNTIF(INFO!$B$6:$B$${5 + Math.max(promociones.length, 4)},"="&LEFT(TRIM(todos_skus!D${r}),FIND(":",TRIM(todos_skus!D${r})&":")-1))>0`,
    };
    // G: Inicio_sku -> extrae el contenido entre el último "(" y el primer
    // "-" (o el ")" si no hay guion) del nombre del producto. Ese fragmento
    // es el prefijo que se usa para emparejar SKUs de la misma promoción
    // (ver "sku_promocion" más abajo, replicado también en JS).
    fila.getCell(7).value = {
      formula:
        `IFERROR(LEFT(MID(B${r},FIND("@",SUBSTITUTE(B${r},"(","@",LEN(B${r})-LEN(SUBSTITUTE(B${r},"(",""))))+1,` +
        `FIND("@",SUBSTITUTE(B${r},")","@",LEN(B${r})-LEN(SUBSTITUTE(B${r},")",""))))-FIND("@",SUBSTITUTE(B${r},"(","@",LEN(B${r})-LEN(SUBSTITUTE(B${r},"(",""))))-1),` +
        `FIND("-",MID(B${r},FIND("@",SUBSTITUTE(B${r},"(","@",LEN(B${r})-LEN(SUBSTITUTE(B${r},"(",""))))+1,` +
        `FIND("@",SUBSTITUTE(B${r},")","@",LEN(B${r})-LEN(SUBSTITUTE(B${r},")",""))))-FIND("@",SUBSTITUTE(B${r},"(","@",LEN(B${r})-LEN(SUBSTITUTE(B${r},"(",""))))-1)&"-")-1),"")`,
    };
    // H: priceoff_sku -> para las tres categorías especiales (34367/34368/
    // 34369), asigna un código fijo "P2x-25X" según si el SKU termina en
    // "-1" o "-5". Es una regla de negocio fija, no una búsqueda dinámica.
    fila.getCell(8).value = {
      formula:
        `IF(ISNUMBER(SEARCH("34368",D${r})),IF(RIGHT(A${r},2)="-1","P25-255",IF(RIGHT(A${r},2)="-5","P25-256","")),` +
        `IF(ISNUMBER(SEARCH("34369",D${r})),IF(RIGHT(A${r},2)="-1","P25-257",IF(RIGHT(A${r},2)="-5","P25-258","")),` +
        `IF(ISNUMBER(SEARCH("34367",D${r})),IF(RIGHT(A${r},2)="-1","P25-259",IF(RIGHT(A${r},2)="-5","P25-260","")),"")))`,
    };
    fila.commit();
  }

  addJsonSheet("ORDENES_CONFIRMADAS", ordenesConfirmadas);

  // 8b. Mover la plantilla CDP (ya llenada en el paso 7) al final del workbook,
  // para que en el archivo final aparezca después de las hojas de auditoría.
  wb.worksheets.forEach((ws, idx) => {
    (ws as unknown as { orderNo: number }).orderNo =
      ws === wsPlantilla ? wb.worksheets.length : idx;
  });

  // 8c. PLANTILLA 2 (Reporte de Promociones) — solo se procesa si el usuario
  // proveyó esta plantilla. A diferencia del Reporte CDP (que se llena con un
  // filtro simple), aquí hay que reproducir en JavaScript la misma lógica que
  // las fórmulas de Excel del proceso manual usan para decidir qué venta
  // corresponde a qué promoción, porque el resultado depende de cruces entre
  // varias hojas (todos_skus + v_i_confirmadas) que conviene resolver una sola
  // vez en código antes de escribir las filas finales.
  const hojasPlantilla2: string[] = [];
  let detallePromocionesAplicadas: DetallePromocion[] = [];
  let totalItemsConPromocion = 0;
  let totalItemsPromocionErroneos = 0;
  let detalleItemsPromocionErroneos: ItemPromocionErroneo[] = [];


  if (plantilla2) {
    // --- Replicar en JS las fórmulas de todos_skus y v_i_confirmadas para filtrar ---
    // Paso A: por cada producto, ¿su categoría corresponde a una promoción
    // activa? y ¿cuál es su "Inicio_sku" (el prefijo que identifica variantes
    // del mismo producto en promoción)?
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
      return { ...t, tienePromo, inicioSku };
    });


    // Paso B: ¿cada ítem vendido corresponde a un SKU en promoción? y ¿en qué
    // documentos (facturas) apareció al menos un ítem en promoción?
    const itemPromoPorIdx: boolean[] = viConfirmadas.map((v) => {
      const sku = String(v["SKU"] ?? "").trim();
      return todosEnriq.some((t) => t.sku === sku && t.tienePromo);
    });
    const docConItemPromo = new Set<string>();
    viConfirmadas.forEach((v, i) => {
      if (itemPromoPorIdx[i]) docConItemPromo.add(String(v["Número de"] ?? ""));
    });

    // Paso C: para cada ítem en un documento con promoción, lista de SKUs de
    // productos en promoción cuyo prefijo (Inicio_sku) coincide con el SKU vendido.
    const skuPromList: string[][] = viConfirmadas.map((v) => {
      const doc = String(v["Número de"] ?? "");
      if (!docConItemPromo.has(doc)) return [];
      const sku = String(v["SKU"] ?? "");
      return todosEnriq
        .filter((t) => t.tienePromo && t.inicioSku !== "" && sku.startsWith(t.inicioSku))
        .map((t) => t.sku);
    });

    // Paso D: para cada ítem candidato, busca dentro del MISMO documento
    // (misma factura) otro ítem cuyo SKU coincida con alguno de los SKUs
    // "de promoción" encontrados en el paso C. Si lo encuentra, ese es el
    // "SKU coincidente" que identifica cuál promoción aplicar a esta venta.
    const filasParaPlantilla: Array<{ vi: Row; skuCoinc: string }> = [];
    for (let i = 0; i < viConfirmadas.length; i++) {
      const v = viConfirmadas[i];
      const doc = String(v["Número de"] ?? "");
      if (!docConItemPromo.has(doc)) continue;
      const lista = skuPromList[i];
      if (!lista.length) continue;
      let skuCoinc = "";
      for (let j = 0; j < viConfirmadas.length; j++) {
        const v2 = viConfirmadas[j];
        if (String(v2["Número de"] ?? "") !== doc) continue;
        const sku2 = String(v2["SKU"] ?? "");
        if (lista.includes(sku2)) {
          skuCoinc = sku2;
          break;
        }
      }
      if (!skuCoinc) continue;
      filasParaPlantilla.push({ vi: v, skuCoinc });
    }

    const nombrePorSku = new Map<string, string>();
    for (const t of todosSkus) nombrePorSku.set(t.sku, t.nombre);

    // Paso E: réplica en JS de la fórmula de la columna H (priceoff_sku) de
    // la hoja todos_skus — mismo mapeo fijo de categoría+sufijo -> código.
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
    const registrosP2: Array<{ vi: Row; codigoIdentificador: string; nombrePromo: string }> = [];

    for (const { vi, skuCoinc } of filasParaPlantilla) {
      const codigo = String(skuCoinc ?? "");
      if (!codigo.trim()) continue;
      registrosP2.push({
        vi,
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
        nombrePromo: `${String(promocionElegida["Item"] ?? "")}(${prefijoTalla}-TALLA)`,
      });
    }

    // 3) Además de lo anterior, cualquier ítem cuyo SKU tenga un código
    // "price off" (categorías especiales 34367/34368/34369) también se agrega
    // como registro de promoción, sin importar si ya coincidió por el filtro normal.
    for (const vi of viConfirmadas) {
      const sku = String(vi["SKU"] ?? "").trim();
      if (!priceoffPorSku.has(sku)) continue; // equivale a #N/D en BUSCARV
      const priceOff = String(priceoffPorSku.get(sku) ?? "").trim();
      if (!priceOff) continue;
      registrosP2.push({
        vi,
        codigoIdentificador: priceOff,
        // El reporte manual conserva el nombre real del producto, no un literal
        nombrePromo: String(vi["Item"] ?? nombrePorSku.get(sku) ?? ""),
      });
    }

    // Detalle de promociones aplicadas (agrupado por código identificador)
    const promoCount = new Map<string, { nombre: string; cantidad: number }>();
    for (const r of registrosP2) {
      const cod = String(r.codigoIdentificador ?? "").trim();
      if (!cod) continue;
      const prev = promoCount.get(cod);
      if (prev) {
        prev.cantidad += 1;
      } else {
        promoCount.set(cod, { nombre: String(r.nombrePromo ?? "").trim(), cantidad: 1 });
      }
    }
    detallePromocionesAplicadas = Array.from(promoCount.entries())
      .map(([codigo, { nombre, cantidad }]) => ({ codigo, nombre, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad);

    // KPI 10: ítems de promoción efectivamente colocados en el reporte de promociones
    totalItemsConPromocion = registrosP2.length;
    // KPI 11: ítems marcados como promoción cuyo documento nunca se pudo resolver
    // (promoción ingresada erróneamente: falta el artículo o el código no coincide)
    const docsResueltos = new Set(
      registrosP2.map((r) => String(r.vi["Número de"] ?? "")),
    );
    totalItemsPromocionErroneos = viConfirmadas.filter(
      (v, i) => itemPromoPorIdx[i] && !docsResueltos.has(String(v["Número de"] ?? "")),
    ).length;
    // Detalle de esos mismos ítems, para que el usuario pueda ubicarlos:
    // documento (factura), SKU vendido, descripción del artículo, cantidad y
    // fecha. Ordenados por documento para agrupar visualmente los que
    // pertenecen a la misma factura.
    detalleItemsPromocionErroneos = viConfirmadas
      .filter((v, i) => itemPromoPorIdx[i] && !docsResueltos.has(String(v["Número de"] ?? "")))
      .map((v) => ({
        documento: String(v["Número de"] ?? ""),
        sku: String(v["SKU"] ?? ""),
        item: String(v["Item"] ?? nombrePorSku.get(String(v["SKU"] ?? "")) ?? ""),
        cantidad: Number(v["Cantidad"]) || 0,
        fecha: String(v["fecha completa"] ?? ""),
      }))
      .sort((a, b) => a.documento.localeCompare(b.documento));
    // También se agrega como hoja del Excel final, para poder filtrar/revisar
    // los documentos afectados sin depender solo de la vista previa en pantalla.
    addJsonSheet("ITEMS_PROMO_ERRONEOS", detalleItemsPromocionErroneos as unknown as Row[]);



    const sucursal = "SUCURSAL: USULUTAN Y JIQUILISCO";
    const nombrePromos =
      "NOMBRE DE PROMOCIONES: " + promociones.map((p) => p.promocion).join(", ");
    const periodoTxt =
      periodoDesde && periodoHasta
        ? "PERIODO " + formatearPeriodo(periodoDesde, periodoHasta)
        : "PERIODO";

    // --- Copiar las hojas de plantilla 2 al workbook ---
    // Se copia celda por celda (valor, estilo, ancho de columna, celdas
    // combinadas) desde el archivo de plantilla2 hacia el workbook final,
    // porque ExcelJS no tiene una función nativa de "copiar hoja entre libros".
    // Las fórmulas originales de la plantilla2 se reemplazan por su último
    // resultado calculado (no se copian como fórmulas) para evitar que
    // queden rotas al cambiar de contexto.
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

    // --- Llenar la primera hoja de plantilla 2 con los registros calculados arriba ---
    if (primeraHojaP2) {
      const wsP2 = primeraHojaP2;

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






  // 9. ESCRIBIR EL ÚNICO ARCHIVO
  // Serializa todo el workbook (todas las hojas creadas/copiadas arriba) a un
  // solo archivo .xlsx en memoria (Blob), listo para descargar en el navegador.
  const fecha = new Date().toISOString().slice(0, 10);
  const archivoNombre = `Consolidado_TecnoBahia_${fecha}.xlsx`;
  const out = await wb.xlsx.writeBuffer();
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  if (descargar) descargarBlob(blob, archivoNombre);

  // 10. VISTA PREVIA DE TODAS LAS HOJAS
  // Convierte cada hoja del workbook final a un formato simple (encabezados +
  // filas de texto/número) para mostrarlo en la tabla de vista previa de la
  // interfaz, sin tener que regenerar el archivo. Limitado a 200 filas por
  // hoja y 40 columnas para no sobrecargar la pantalla.
  /** Convierte el valor "crudo" de una celda de ExcelJS (que puede ser fórmula, fecha, texto enriquecido, etc.) a texto/número simple. */
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

  // A partir de aquí se calculan los indicadores (KPIs) que se muestran en
  // pantalla, reutilizando las tablas ya armadas más arriba.
  const ordenesConfirmadasSet = new Set(
    ordenesConfirmadas.map((o) =>
      String(o["Numero de factura"] ?? o["Número de factura"] ?? "").trim(),
    ),
  );
  const totalItemsConfirmados = itemsData.filter((it) => {
    const anulada = String(it["Anulada"] ?? "NO").toUpperCase().trim();
    if (anulada === "SI") return false;
    const doc = String(it["Número de"] ?? it["Número de control"] ?? "").trim();
    return ordenesConfirmadasSet.has(doc);
  }).length;
  const totalItemsNoConfirmados = itemsData.length - totalItemsConfirmados;

  // Detalle de códigos de cliente únicos (para detectar posibles errores de escritura)
  const clienteCount = new Map<string, number>();
  for (const o of ordenesData) {
    const cod = String(o["Codigo clie"] ?? o["Codigo cliente"] ?? "").trim().toUpperCase();
    if (!cod) continue;
    clienteCount.set(cod, (clienteCount.get(cod) ?? 0) + 1);
  }
  const detalleCodigosClienteUnicos = Array.from(clienteCount.entries())
    .map(([codigo, cantidad]) => ({ codigo, cantidad, esCDP: codigo.includes("CDP") }))
    .sort((a, b) => b.cantidad - a.cantidad);

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

  return {
    totalFiltrados: datosFiltrados.length,
    archivoNombre,
    blob,
    hojas,
    indicadores: {
      totalOrdenesCargadas: ordenesData.length,
      totalItemsCargados: itemsData.length,
      totalOrdenesConfirmadas: ordenesConfirmadas.length,
      totalOrdenesNoConfirmadas: ordenesData.length - ordenesConfirmadas.length,
      totalItemsConfirmados,
      totalItemsNoConfirmados,
      detallePromocionesAplicadas,
      detalleCodigosClienteUnicos,
      totalItemsDescuentoCDP: datosFiltrados.length,
      totalItemsConPromocion,
      totalItemsPromocionErroneos,
      detalleItemsPromocionErroneos,
      totalCdpDescuentoDistintoCategoria: detalleCdpDescuentoAtipico.length,
      detalleCdpDescuentoAtipico,
    },
  };


}
