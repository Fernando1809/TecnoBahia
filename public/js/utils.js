// js/utils.js

function norm(v) {
  return String(v || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeSku(v) {
  return String(v ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^0-9A-Z]/g, "");
}

function toNum(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v || "").trim();
  if (s === "") return 0;
  // Eliminar símbolos de moneda y espacios
  s = s.replace(/\$/g, "").replace(/\s/g, "");
  // Si contiene tanto punto como coma, asumimos formato: punto = miles, coma = decimales
  if (s.indexOf('.') !== -1 && s.indexOf(',') !== -1) {
    s = s.replace(/\./g, '').replace(/,/g, '.');
  } else if (s.indexOf(',') !== -1) {
    // Solo coma -> convertir coma decimal a punto
    s = s.replace(/,/g, '.');
  }
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function toNumOrNull(v) {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = toNum(s);
  return isFinite(n) ? n : null;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fmt(n) {
  return Number(n || 0).toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

function mostrarPopupAuxiliar(mensaje, opciones = {}) {
  const tipo = opciones.tipo || "notificacion";
  const esInteractivo = tipo === "confirmacion" || tipo === "entrada";

  return new Promise(resolve => {
    const existingPopup = document.querySelector(".aux-popup-overlay");
    if (existingPopup && existingPopup.cerrarPopup) existingPopup.cerrarPopup(null);

    const overlay = document.createElement("div");
    overlay.className = "aux-popup-overlay";
    overlay.setAttribute("role", "presentation");

    const dialog = document.createElement("section");
    dialog.className = `aux-popup-card${opciones.esError ? " is-error" : ""}`;
    dialog.setAttribute("role", esInteractivo || tipo === "alerta" ? "alertdialog" : "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", opciones.titulo || "Auxiliar de pedidos");

    const header = document.createElement("div");
    header.className = "card-header aux-popup-header";
    header.textContent = opciones.titulo || (opciones.esError ? "Atención" : "Auxiliar de pedidos");

    const body = document.createElement("div");
    body.className = "card-body aux-popup-body";

    const title = document.createElement("h4");
    title.className = "card-title aux-popup-title";
    title.textContent = opciones.esError ? "Revisa este mensaje" : "Mensaje";

    const text = document.createElement("p");
    text.className = "card-text aux-popup-text";
    text.textContent = String(mensaje ?? "");
    body.append(title, text);
    if (Array.isArray(opciones.items) && opciones.items.length > 0) {
      const itemList = document.createElement("ul");
      itemList.className = "aux-popup-item-list";
      opciones.items.forEach(item => {
        const listItem = document.createElement("li");
        const sku = document.createElement("strong");
        sku.textContent = item.SKU;
        const name = document.createElement("span");
        name.textContent = ` - ${item.Producto}`;
        listItem.append(sku, name);
        itemList.appendChild(listItem);
      });
      body.appendChild(itemList);
    }

    let input = null;
    if (tipo === "entrada") {
      input = document.createElement("input");
      input.className = "aux-popup-input";
      input.type = opciones.tipoEntrada || "text";
      input.value = opciones.valorInicial ?? "";
      input.placeholder = opciones.placeholder || "";
      input.setAttribute("aria-label", opciones.etiquetaEntrada || "Dato");
      body.appendChild(input);
    }

    const actions = document.createElement("div");
    actions.className = "aux-popup-actions";
    dialog.append(header, body, actions);
    overlay.appendChild(dialog);

    let closed = false;
    const close = value => {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", handleKeydown);
      overlay.remove();
      resolve(value);
    };
    overlay.cerrarPopup = close;

    const primaryButton = document.createElement("button");
    primaryButton.type = "button";
    primaryButton.className = "btn-solid theme-primary aux-popup-button";
    primaryButton.textContent = opciones.aceptarTexto || (tipo === "confirmacion" ? "Confirmar" : "Aceptar");
    primaryButton.addEventListener("click", () => {
      close(tipo === "confirmacion" ? true : tipo === "entrada" ? input.value : undefined);
    });
    actions.appendChild(primaryButton);

    if (esInteractivo) {
      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "btn-secondary aux-popup-button";
      cancelButton.textContent = opciones.cancelarTexto || "Cancelar";
      cancelButton.addEventListener("click", () => close(tipo === "confirmacion" ? false : null));
      actions.insertBefore(cancelButton, primaryButton);
    }

    function handleKeydown(event) {
      if (event.key === "Escape") {
        close(tipo === "confirmacion" ? false : null);
      } else if (event.key === "Enter" && tipo === "entrada" && document.activeElement === input) {
        event.preventDefault();
        close(input.value);
      }
    }

    overlay.addEventListener("click", event => {
      if (event.target === overlay) close(tipo === "confirmacion" ? false : null);
    });
    document.addEventListener("keydown", handleKeydown);
    document.body.appendChild(overlay);
    (input || primaryButton).focus();
  });
}

function mostrarNotificacion(mensaje, esError = false) {
  return mostrarPopupAuxiliar(mensaje, { tipo: "notificacion", esError });
}

function mostrarAlerta(mensaje, opciones = {}) {
  return mostrarPopupAuxiliar(mensaje, { ...opciones, tipo: "alerta", titulo: opciones.titulo || "Aviso" });
}

function mostrarConfirmacion(mensaje) {
  return mostrarPopupAuxiliar(mensaje, { tipo: "confirmacion", titulo: "Confirmación" });
}

function solicitarEntrada(mensaje, opciones = {}) {
  return mostrarPopupAuxiliar(mensaje, { ...opciones, tipo: "entrada", titulo: opciones.titulo || "Ingresar dato" });
}

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
 * Convierte el nombre de una sucursal (Jiquilisco / Usulután) en un slug
 * seguro para usarlo como parte de un ID de documento en Firestore.
 */
function slugSucursal(nombre) {
  const n = norm(nombre || "");
  if (n.includes("jiquilisco")) return "jiquilisco";
  if (n.includes("usulutan")) return "usulutan";
  return "general";
}

function chooseMainSheet(workbook) {
  // Prefer sheet names that likely contain the inventory/lista
  const candidates = ["inventario", "stock", "lista", "lista_completa", "lista completa", "existencia", "disponible", "saldo"];
  const preferred = workbook.SheetNames.find(n => {
    const low = n.toLowerCase();
    return candidates.some(c => low.includes(c));
  });
  return preferred || workbook.SheetNames[0];
}

function detectInventoryOrigin(workbook, fileName) {
  const fileLower = String(fileName || "").toLowerCase();
  if (fileLower.includes("jiquilisco")) return "Jiquilisco";
  if (fileLower.includes("usulutan") || fileLower.includes("usulután")) return "Usulután";

  for (const sheetName of workbook.SheetNames) {
    const key = sheetName.toLowerCase();
    if (key.includes("jiquilisco")) return "Jiquilisco";
    if (key.includes("usulutan") || key.includes("usulután")) return "Usulután";
    
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

/**
 * Formatea una fecha a string DD-MM-YYYY
 */
function formatDateToFileName(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

/**
 * Limpia un string para usarlo en nombre de archivo
 */
function sanitizeFileName(str) {
  return String(str || "").replace(/[\\/:*?"<>|]/g, '').trim();
}
