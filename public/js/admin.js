// js/admin.js

/**
 * =========================================================================
 * 🔥 SECCIÓN 1: PERSISTENCIA Y CONEXIÓN CON FIREBASE FIRESTORE
 * =========================================================================
 */

function getFirestoreDocRef(name) {
  if (!window.db || !window.doc) throw new Error("Firestore no está inicializado");
  return window.doc(window.db, "auxiliar-inventario", name);
}

async function firestoreGetDocData(name) {
  if (!window.db || !window.getDoc) return {};
  try {
    const ref = getFirestoreDocRef(name);
    const snap = await window.getDoc(ref);
    return snap.exists() ? snap.data() : {};
  } catch (err) {
    console.error("Error leyendo Firestore:", err);
    return {};
  }
}

async function firestoreSetDocData(name, data) {
  if (!window.db || !window.setDoc) return;
  try {
    const ref = getFirestoreDocRef(name);
    await window.setDoc(ref, data, { merge: true });
  } catch (err) {
    console.error("Error guardando en Firestore:", err);
  }
}

async function loadRules() {
  const data = await firestoreGetDocData("adminRules");
  state.adminRules = data.adminRules || {};
}

async function loadListaCompleta() {
  try {
    const data = await firestoreGetDocData("listaCompleta");
    state.listaCompleta = data.listaCompleta || [];
    state.preciosLookup = data.preciosLookup || {};

    const templateData = await firestoreGetDocData("pedidoTemplate");
    state.pedidoTemplateBase64 = templateData.pedidoTemplateBase64 || null;
    state.pedidoTemplateLoaded = !!state.pedidoTemplateBase64;
    state.pedidoTemplateName = templateData.pedidoTemplateName || null;
  } catch (e) {
    state.listaCompleta = [];
    state.preciosLookup = {};
    state.pedidoTemplateBase64 = null;
    state.pedidoTemplateLoaded = false;
    state.pedidoTemplateName = null;
  }
}

async function saveListaCompleta() {
  try {
    await firestoreSetDocData("listaCompleta", {
      listaCompleta: state.listaCompleta,
      preciosLookup: state.preciosLookup
    });
  } catch (e) {
    console.error("Error guardando precios:", e);
  }
}

async function savePedidoTemplate() {
  try {
    if (state.pedidoTemplateBase64) {
      await firestoreSetDocData("pedidoTemplate", {
        pedidoTemplateBase64: state.pedidoTemplateBase64,
        pedidoTemplateName: state.pedidoTemplateName || null
      });
    }
  } catch (e) {
    console.error("Error guardando plantilla:", e);
  }
}

function getPedidoWorkbook() {
  if (!state.pedidoTemplateBase64) return null;
  try {
    return XLSX.read(state.pedidoTemplateBase64, { type: "base64", cellDates: true });
  } catch (e) {
    console.error("Error leyendo plantilla PEDIDO:", e);
    return null;
  }
}

function updateExportButtonState() {
  const btn = document.getElementById("btnExport");
  const enabled = state.rows && state.rows.length > 0 && state.pedidoTemplateLoaded;
  if (btn) btn.disabled = !enabled;
}

async function persistRules() { 
  await firestoreSetDocData("adminRules", { adminRules: state.adminRules }); 
}

async function loadSettings() {
  const data = await firestoreGetDocData("settings");
  state.currentView = data.currentView || "report";
  state.darkMode = data.darkMode || false;
}

async function persistSettings() {
  await firestoreSetDocData("settings", {
    currentView: state.currentView,
    darkMode: state.darkMode
  });
}

/**
 * =========================================================================
 * 🔐 SECCIÓN 2: AUTENTICACIÓN, ROLES Y SEGURIDAD
 * =========================================================================
 */

/**
 * Consulta el rol del usuario en la colección central "usuarios" de Firestore
 */
async function getUserRole(uid, email) {
  if (!window.db || !window.getDoc) return "usuario";
  try {
    // Buscar primero por el UID único del Auth
    let userRef = window.doc(window.db, "usuarios", uid);
    let userSnap = await window.getDoc(userRef);
    
    // Resguardo secundario: Buscar por string de correo
    if (!userSnap.exists()) {
      userRef = window.doc(window.db, "usuarios", email);
      userSnap = await window.getDoc(userRef);
    }
    
    return userSnap.exists() ? (userSnap.data().rol || "usuario") : "usuario";
  } catch (err) {
    console.error("Error obteniendo rol:", err);
    return "usuario";
  }
}

/**
 * Renderiza el menú de hamburguesa sin textos fijos adaptándolo al rol activo
 */
function renderNavigationMenu(rol) {
  const dropdown = document.getElementById("cornerDropdown");
  const menuBtn = document.getElementById("cornerMenuBtn");
  
  if (!dropdown || !menuBtn) return;

  // Si no hay sesión válida, esconder el icono de hamburguesa ☰
  if (!rol) {
    menuBtn.style.display = "none";
    dropdown.innerHTML = "";
    return;
  }

  menuBtn.style.display = "block"; 
  dropdown.innerHTML = ""; 

  if (rol === "admin") {
    dropdown.innerHTML = `
      <button type="button" id="navToAdmin" role="menuitem">⚙️ Panel Admin</button>
      <button type="button" id="navToReport" role="menuitem">📊 Reporte Inventario</button>
      <hr style="border: none; border-top: 1px solid var(--border); margin: 6px 0;">
      <button type="button" id="btnLogout" role="menuitem" style="color: var(--danger);">🚪 Cerrar sesión</button>
    `;
    
    document.getElementById("navToAdmin")?.addEventListener("click", () => showView("admin"));
    document.getElementById("navToReport")?.addEventListener("click", () => showView("report"));
  } else {
    // Operario normal: Solo puede ver reporte de inventario y no cambia de vista
    dropdown.innerHTML = `
      <button type="button" id="btnLogout" role="menuitem" style="color: var(--danger);">🚪 Cerrar sesión</button>
    `;
  }

  document.getElementById("btnLogout")?.addEventListener("click", logoutAdmin);
}

/**
 * Valida el formulario de entrada global del sistema
 */
async function unlockAdminPanel() {
  const email = document.getElementById('usuarioEmail').value.trim();
  const pass = document.getElementById('usuarioPass').value;
  const statusDiv = document.getElementById('status');

  if (!email || !pass) {
    if (statusDiv) statusDiv.textContent = "❌ Ingresa correo y contraseña.";
    return;
  }

  try {
    if (statusDiv) statusDiv.textContent = "Verificando accesos...";
    const userCredential = await window.signInWithEmailAndPassword(window.auth, email, pass);
    const user = userCredential.user;
    
    const rol = await getUserRole(user.uid, user.email);
    state.userRole = rol;
    state.adminUnlocked = (rol === "admin");

    renderNavigationMenu(rol);
    
    if (rol === "admin") {
      showView("admin"); 
    } else {
      showView("report"); 
    }

    document.getElementById('usuarioEmail').value = "";
    document.getElementById('usuarioPass').value = "";
    if (statusDiv) statusDiv.textContent = "";
  } catch (error) {
    if (statusDiv) statusDiv.textContent = "❌ Credenciales incorrectas.";
    console.error(error);
  }
}

/**
 * Cierre de sesión seguro y reset de interfaces
 */
async function logoutAdmin() {
  try {
    await window.signOut(window.auth);
    state.adminUnlocked = false;
    state.userRole = null;
    
    renderNavigationMenu(null);
    showView("login");
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
  }
}

/**
 * =========================================================================
 * ⚙️ SECCIÓN 3: CONTROLADOR DE REGLAS DE CONTROL DE STOCK
 * =========================================================================
 */

function buildAdminSourceRows() {
  const allSKUs = new Set();
  if (state.rows && state.rows.length) {
    state.rows.forEach(r => allSKUs.add(r.SKU));
  }
  Object.keys(state.adminRules).forEach(sku => allSKUs.add(sku));
  
  const rows = [];
  allSKUs.forEach(sku => {
    const producto = state.rows?.find(r => r.SKU === sku)?.Producto || state.adminRules[sku]?.producto || "";
    rows.push({
      SKU: sku,
      Producto: producto,
      Minimo: state.adminRules[sku]?.minimo ?? "",
      Maximo: state.adminRules[sku]?.maximo ?? ""
    });
  });
  return rows.sort((a,b) => norm(a.SKU).localeCompare(norm(b.SKU)));
}

function applyAdminFilter() {
  if (!state.adminUnlocked) return;
  const searchTerm = norm(document.getElementById("adminSearchInput")?.value || "");
  let source = buildAdminSourceRows();
  
  if (state.adminActiveFilter === "conRegla") {
    source = source.filter(r => r.Minimo !== "" || r.Maximo !== "");
  } else if (state.adminActiveFilter === "sinRegla") {
    source = source.filter(r => r.Minimo === "" && r.Maximo === "");
  }
  
  if (searchTerm) {
    source = source.filter(r => norm(r.SKU).includes(searchTerm) || norm(r.Producto).includes(searchTerm));
  }

  const totalItems = source.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / state.adminPageSize));
  state.adminPage = Math.min(Math.max(1, state.adminPage), totalPages);
  const startIndex = (state.adminPage - 1) * state.adminPageSize;
  const pageRows = source.slice(startIndex, startIndex + state.adminPageSize);

  renderAdminTable(pageRows);
  renderAdminPagination(state.adminPage, totalPages, totalItems);

  const filterInfo = document.getElementById("adminFilterInfo");
  if (filterInfo) {
    let text = "";
    if (state.adminActiveFilter === "all") text = `Mostrando ${pageRows.length} de ${totalItems} SKUs`;
    else if (state.adminActiveFilter === "conRegla") text = `✅ ${pageRows.length} de ${totalItems} SKUs con reglas`;
    else if (state.adminActiveFilter === "sinRegla") text = `📭 ${pageRows.length} de ${totalItems} SKUs sin reglas`;
    filterInfo.textContent = text;
  }
}

function saveRulesFromInputs() {
  if (!state.adminUnlocked) return;
  const inputs = Array.from(document.querySelectorAll("#adminTable tbody input"));
  const nextRules = { ...state.adminRules };
  
  inputs.forEach(input => {
    const sku = input.getAttribute("data-sku");
    const role = input.getAttribute("data-role");
    const val = toNumOrNull(input.value);
    
    if (!nextRules[sku]) nextRules[sku] = { minimo: "", maximo: "", producto: "" };
    
    if (val === null) nextRules[sku][role === "min" ? "minimo" : "maximo"] = "";
    else nextRules[sku][role === "min" ? "minimo" : "maximo"] = val;
    
    const hasMin = String(nextRules[sku].minimo).trim() !== "";
    const hasMax = String(nextRules[sku].maximo).trim() !== "";
    if (!hasMin && !hasMax) delete nextRules[sku];
  });
  
  state.adminRules = nextRules;
  persistRules();
  recalculateRows();
  applyAdminFilter();
}

function clearAllRules() {
  if (!state.adminUnlocked) return;
  if (confirm("¿Eliminar TODAS las reglas de mínimos y máximos?")) {
    state.adminRules = {};
    persistRules();
    recalculateRows();
    applyAdminFilter();
  }
}

function addNewSku() {
  if (!state.adminUnlocked) return;
  const newSku = prompt("Ingrese el nuevo SKU (código):");
  if (!newSku || newSku.trim() === "") return;
  const skuTrim = newSku.trim();
  
  if (state.adminRules[skuTrim]) {
    alert(`El SKU "${skuTrim}" ya tiene reglas creadas.`);
    return;
  }
  
  state.adminRules[skuTrim] = { minimo: "", maximo: "", producto: "" };
  persistRules();
  recalculateRows();
  applyAdminFilter();
}

function importRulesExcel() {
  if (!state.adminUnlocked) return;
  const file = document.getElementById("adminExcelInput").files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      
      if (!aoa.length) return;
      
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(20, aoa.length); i++) {
        const row = Array.isArray(aoa[i]) ? aoa[i] : [];
        const joined = norm(row.join(" | "));
        if ((joined.includes("sku") || joined.includes("codigo")) && (joined.includes("min") || joined.includes("max"))) {
          headerRowIndex = i; 
          break;
        }
      }
      
      const header = (aoa[headerRowIndex] || []).map((h, idx) => String(h || "").trim() || `Col_${idx}`);
      const map = getColumnMap(header);
      if (!map.sku) return;
      
      let importedCount = 0;
      const skusImported = new Set();
      
      for (let i = headerRowIndex + 1; i < aoa.length; i++) {
        const rowArr = aoa[i] || [];
        if (!rowArr.some(v => String(v || "").trim() !== "")) continue;
        
        const row = {};
        header.forEach((name, idx) => { row[name] = rowArr[idx] !== undefined ? rowArr[idx] : ""; });
        
        const sku = String(row[map.sku] || "").trim();
        if (!sku || skusImported.has(sku)) continue;
        skusImported.add(sku);
        
        const minimo = map.minimo ? toNumOrNull(row[map.minimo]) : null;
        const maximo = map.maximo ? toNumOrNull(row[map.maximo]) : null;
        const producto = map.producto ? String(row[map.producto] || "").trim() : "";
        
        if (minimo === null && maximo === null && !producto) continue;
        
        state.adminRules[sku] = {
          minimo: minimo === null ? "" : minimo,
          maximo: maximo === null ? "" : maximo,
          producto: producto || state.adminRules[sku]?.producto || ""
        };
        importedCount++;
      }
      
      persistRules();
      recalculateRows();
      applyAdminFilter();
      document.getElementById("adminExcelInput").value = "";
    } catch (err) { 
      console.error(err); 
    }
  };
  reader.readAsArrayBuffer(file);
}

/**
 * =========================================================================
 * 📈 SECCIÓN 4: INGESTA DE PRECIOS DEL CATÁLOGO MAESTRO (CON IVA)
 * =========================================================================
 */

async function importListaCompleta() {
  if (!state.adminUnlocked) return;
  const file = document.getElementById("listaCompletaInput").files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      
      let sheetName = workbook.SheetNames.find(n => norm(n).includes("lista"));
      if (!sheetName) sheetName = workbook.SheetNames[0];
      
      const sheet = workbook.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      
      if (!aoa.length) return;
      
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(20, aoa.length); i++) {
        const row = Array.isArray(aoa[i]) ? aoa[i] : [];
        const joined = norm(row.join(" | "));
        if (joined.includes("codigo") && (joined.includes("pad") || joined.includes("psm"))) {
          headerRowIndex = i;
          break;
        }
      }
      
      const headerRow = (aoa[headerRowIndex] || []).map((h, idx) => String(h || "").trim() || `Col_${idx + 1}`);
      
      let codigoCol = null;
      let descCol = null;
      let precioColPAD = null;
      
      headerRow.forEach((header, idx) => {
        const hNorm = norm(header);
        if (hNorm.includes("codigo")) codigoCol = idx;
        if (hNorm.includes("descripcion") || hNorm.includes("producto")) descCol = idx;
        if (hNorm.includes("pad") && hNorm.includes("sin")) precioColPAD = idx;
      });
      
      if (codigoCol === null || precioColPAD === null) return;
      
      state.listaCompleta = [];
      state.preciosLookup = {};
      let processedCount = 0;
      
      for (let i = headerRowIndex + 1; i < aoa.length; i++) {
        const rowArr = aoa[i] || [];
        if (!rowArr.some(v => String(v || "").trim() !== "")) continue;
        
        const codigo = String(rowArr[codigoCol] || "").trim().toUpperCase();
        const descripcion = descCol !== null ? String(rowArr[descCol] || "").trim() : "";
        
        const precioSinIva = toNum(rowArr[precioColPAD]);
        const precioConIva = precioSinIva * 1.13; // Aplicación del 13% de IVA
        
        if (!codigo) continue;
        
        const item = {
          CODIGO: codigo,
          DESCRIPCION: descripcion,
          PRECIO: precioConIva
        };
        
        state.listaCompleta.push(item);
        state.preciosLookup[codigo] = precioConIva;
        processedCount++;
      }
      
      await saveListaCompleta();

      if (state.rows && state.rows.length > 0) {
        recalculateRows();
        if (typeof applyFilterAndSearch === "function") applyFilterAndSearch();
      }

      applyAdminFilter();
      document.getElementById("listaCompletaInput").value = "";
    } catch (err) {
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

/**
 * =========================================================================
 * 🌙 SECCIÓN 5: CONFIGURACIONES DE ENTORNO (MODO OSCURO)
 * =========================================================================
 */

function initDarkMode() {
  const toggleBtn = document.getElementById('darkModeToggle');
  
  if (state.darkMode) {
    document.body.classList.add('dark');
    if (toggleBtn) toggleBtn.innerHTML = '☀️ Modo claro';
  } else {
    document.body.classList.remove('dark');
    if (toggleBtn) toggleBtn.innerHTML = '🌙 Modo oscuro';
  }
  
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      state.darkMode = document.body.classList.contains('dark');
      persistSettings();
      toggleBtn.innerHTML = state.darkMode ? '☀️ Modo claro' : '🌙 Modo oscuro';
    });
  }
}