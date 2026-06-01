// js/utils.js

function norm(v) {
  return String(v || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

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

function setStatus(msg, isError = false) {
  const el = document.getElementById("status");
  if (el) {
    el.innerText = msg;
    el.style.color = isError ? "var(--danger)" : "var(--ok)";
  }
  if (!isError && msg) mostrarNotificacion(msg, false);
  else if (isError) mostrarNotificacion(msg, true);
}

function chooseMainSheet(workbook) {
  const preferred = workbook.SheetNames.find(n => {
    const low = n.toLowerCase();
    return low.includes("inventario") || low.includes("stock");
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