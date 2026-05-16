// js/utils.js

/**
 * Carga la plantilla de Excel por defecto en formato Base64 en el estado global.
 * @returns {boolean} True si se cargó correctamente, False de lo contrario.
 */
function loadDefaultPedidoTemplate() {
  if (state.pedidoTemplateLoaded) return true;
  try {
    state.pedidoTemplateBase64 = DEFAULT_PEDIDO_TEMPLATE_BASE64;
    const wb = getPedidoWorkbook(); // Nota: Asegúrate de que esta función esté definida en tu lógica de Excel
    if (!wb) throw new Error("No se pudo leer la plantilla embebida");
    
    state.pedidoTemplateLoaded = true;
    state.pedidoTemplateName = DEFAULT_PEDIDO_TEMPLATE_NAME;
    updateExportButtonState();
    return true;
  } catch (err) {
    console.error("Error cargando plantilla embebida:", err);
    state.pedidoTemplateBase64 = null;
    state.pedidoTemplateLoaded = false;
    state.pedidoTemplateName = null;
    if (typeof updateExportButtonState === "function") updateExportButtonState();
    setStatus("No se pudo cargar la plantilla PEDIDO embebida.", true);
    return false;
  }
}

/**
 * Normaliza un string: quita espacios, convierte a minúsculas y elimina acentos/diacríticos.
 */
function norm(v) {
  return String(v || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Convierte un valor de texto (incluso con formatos de moneda como '$' o puntos de millares) a tipo numérico.
 */
function toNum(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const cleaned = String(v || "")
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
}

/**
 * Convierte un valor a número, o devuelve null si el campo está vacío.
 */
function toNumOrNull(v) {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = toNum(s);
  return isFinite(n) ? n : null;
}

/**
 * Escapa caracteres HTML especiales para prevenir vulnerabilidades de XSS al renderizar contenido dinámico.
 */
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Formatea un número según la configuración regional es-MX (Máximo 2 decimales).
 */
function fmt(n) {
  return Number(n || 0).toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

/**
 * Despliega una notificación flotante estilo Toast en la pantalla.
 */
function mostrarNotificacion(mensaje, esError = false) {
  const existingToast = document.querySelector('.toast-notification');
  if (existingToast) existingToast.remove();
  
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = mensaje;
  toast.style.backgroundColor = esError ? '#dc2626' : '#10b981';
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

/**
 * Actualiza la barra de estado principal y lanza la notificación correspondiente.
 */
function setStatus(msg, isError = false) {
  const el = document.getElementById("status");
  if (el) {
    el.innerText = msg;
    el.style.color = isError ? "var(--danger)" : "var(--ok)";
  }
  if (!isError && msg) mostrarNotificacion(msg, false);
  else if (isError) mostrarNotificacion(msg, true);
}

/**
 * Mapea de forma inteligente las columnas de un archivo importado basándose en alias lingüísticos habituales.
 */
function getColumnMap(headers) {
  const aliases = {
    sku: ["sku", "codigo", "cod", "id", "clave", "código"],
    producto: ["producto", "descripcion", "nombre", "item", "articulo"],
    inventario: ["inventario", "stock", "existencia", "existencias", "disponible", "on hand"],
    precio: ["precio unitario", "costo unitario", "precio", "price", "unitario", "costo"],
    minimo: ["minimo", "min", "stock minimo", "punto de reorden", "mínimo"],
    maximo: ["maximo", "max", "stock maximo", "tope", "máximo"],
    consumo: ["consumo mensual", "venta mensual", "promedio mensual", "rotacion", "demanda mensual"]
  };
  const mapped = {};
  const hNorm = headers.map(h => ({ raw: h, n: norm(h) }));
  
  Object.keys(aliases).forEach(key => {
    const found = hNorm.find(h => aliases[key].some(a => h.n.includes(a)));
    mapped[key] = found ? found.raw : null;
  });
  return mapped;
}

/**
 * Selecciona la hoja principal de inventario dentro del libro de trabajo de forma automatizada.
 */
function chooseMainSheet(workbook) {
  const preferred = workbook.SheetNames.find(n => {
    const low = n.toLowerCase();
    return low.includes("inventario") || low.includes("stock");
  });
  return preferred || workbook.SheetNames[0];
}

/**
 * Detecta de forma heurística el origen del inventario (Jiquilisco o Usulután) buscando en el nombre del archivo,
 * en los nombres de las pestañas o analizando las primeras 10 filas de datos.
 */
function detectInventoryOrigin(workbook, fileName) {
  const fileLower = String(fileName || "").toLowerCase();
  if (fileLower.includes("jiquilisco")) return "Jiquilisco"; // Corregido typo menor detectado en la entrada
  if (fileLower.includes("usulutan") || fileLower.includes("usulután")) return "Usulután";

  for (const sheetName of workbook.SheetNames) {
    const key = sheetName.toLowerCase();
    if (key.includes("jiquilisco")) return "Jiquilisco";
    if (key.includes("usulutan") || key.includes("usulután")) return "Usulután";
    
    // Análisis interno de celdas de la hoja
    const aoa = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
    for (let i = 0; i < Math.min(10, aoa.length); i++) {
      const row = Array.isArray(aoa[i]) ? aoa[i] : [];
      const joined = norm(row.join(" | "));
      if (joined.includes("jiquilisco")) return "Jiquilisco";
      if (joined.includes("usulutan") || joined.includes("usulután")) return "Usulután";
    }
  }
  return null;
}