// js/admin.js

// ============================================================
// VARIABLES DE SEGUIMIENTO
// ============================================================

let preciosLastUpdate = null;
let preciosFileName = null;
let reglasLastUpdate = null;
let reglasFileName = null;

// ============================================================
// SECCIÓN 1: PERSISTENCIA
// ============================================================

function loadAllSettings() {
  try {
    const savedDarkMode = localStorage.getItem('tecnobahia_darkmode');
    const savedView = localStorage.getItem('tecnobahia_currentview');
    
    if (savedDarkMode !== null) {
      state.darkMode = savedDarkMode === 'true';
    }
    
    if (savedView !== null && (savedView === 'admin' || savedView === 'report')) {
      state.currentView = savedView;
    }
    
    if (state.darkMode) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
    
    console.log("📦 Cargado desde localStorage - Modo oscuro:", state.darkMode, "Vista:", state.currentView);
    return state.currentView;
  } catch(e) {
    console.error("Error cargando settings:", e);
    return "report";
  }
}

function saveAllSettings() {
  try {
    localStorage.setItem('tecnobahia_darkmode', state.darkMode);
    localStorage.setItem('tecnobahia_currentview', state.currentView);
    console.log("💾 Guardado en localStorage - Modo oscuro:", state.darkMode, "Vista:", state.currentView);
    
    const toggleBtn = document.getElementById('darkModeToggle');
    if (toggleBtn) {
      toggleBtn.textContent = state.darkMode ? '☀️ Modo claro' : '🌙 Modo oscuro';
    }
  } catch(e) {
    console.error("Error guardando settings:", e);
  }
}

async function syncToFirestore() {
  try {
    await firestoreSetDocData("settings", {
      currentView: state.currentView,
      darkMode: state.darkMode === true
    });
  } catch(e) {
    console.warn("No se pudo sincronizar con Firestore:", e);
  }
}

async function loadSettings() {
  // Primero cargar desde localStorage
  const savedDarkMode = localStorage.getItem('tecnobahia_darkmode');
  const savedView = localStorage.getItem('tecnobahia_currentview');
  
  if (savedDarkMode !== null) {
    state.darkMode = savedDarkMode === 'true';
  }
  if (savedView !== null && (savedView === 'admin' || savedView === 'report')) {
    state.currentView = savedView;
  }
  
  if (state.darkMode) {
    document.body.classList.add('dark');
    const toggleBtn = document.getElementById('darkModeToggle');
    if (toggleBtn) toggleBtn.textContent = '☀️ Modo claro';
  } else {
    document.body.classList.remove('dark');
    const toggleBtn = document.getElementById('darkModeToggle');
    if (toggleBtn) toggleBtn.textContent = '🌙 Modo oscuro';
  }
  
  console.log("📦 Modo oscuro cargado:", state.darkMode, "Vista:", state.currentView);
  
  try {
    const data = await firestoreGetDocData("settings");
    if (data.darkMode !== undefined) state.darkMode = data.darkMode === true;
    if (data.currentView) state.currentView = data.currentView;
    
    if (state.darkMode) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
    
    saveAllSettings();
  } catch(err) {
    console.error("Error sincronizando con Firestore:", err);
  }
  
  return state.currentView;
}

async function persistSettings() {
  saveAllSettings();
  await syncToFirestore();
}

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

// ============================================================
// FUNCIONES DE DISPLAY DE ARCHIVOS CARGADOS
// ============================================================

function updatePreciosStatusDisplay(count) {
  const preciosInfo = document.getElementById("preciosInfo");
  if (preciosInfo) {
    if (preciosLastUpdate && preciosFileName) {
      const fechaFormateada = preciosLastUpdate.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      preciosInfo.innerHTML = `<strong>${escapeHtml(preciosFileName)}</strong><br>📅 ${fechaFormateada}<br>📊 ${count} productos cargados`;
      preciosInfo.style.color = "var(--ok)";
    } else if (count > 0) {
      preciosInfo.innerHTML = `<strong>Precios cargados</strong><br>📊 ${count} productos cargados`;
      preciosInfo.style.color = "var(--ok)";
    } else {
      preciosInfo.innerHTML = "No hay precios cargados";
      preciosInfo.style.color = "var(--warning)";
    }
  }
}

function updateReglasStatusDisplay() {
  const reglasInfo = document.getElementById("reglasInfo");
  if (reglasInfo) {
    const reglasCountTotal = Object.keys(state.adminRules).length;
    if (reglasLastUpdate && reglasFileName && reglasCountTotal > 0) {
      const fechaFormateada = reglasLastUpdate.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      reglasInfo.innerHTML = `<strong>${escapeHtml(reglasFileName)}</strong><br>📅 ${fechaFormateada}<br>📊 ${reglasCountTotal} SKUs con reglas`;
      reglasInfo.style.color = "var(--ok)";
    } else if (reglasCountTotal > 0) {
      reglasInfo.innerHTML = `<strong>Reglas KOLO cargadas</strong><br>📊 ${reglasCountTotal} SKUs con reglas`;
      reglasInfo.style.color = "var(--ok)";
    } else {
      reglasInfo.innerHTML = "No hay reglas cargadas";
      reglasInfo.style.color = "var(--warning)";
    }
  }
}

// ============================================================
// SECCIÓN 2: AUTENTICACIÓN
// ============================================================

async function getUserRole(uid, email) {
  if (!window.db || !window.getDoc) return "usuario";
  try {
    let userRef = window.doc(window.db, "usuarios", uid);
    let userSnap = await window.getDoc(userRef);
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

function renderNavigationMenu(rol) {
  const dropdown = document.getElementById("cornerDropdown");
  const menuBtn = document.getElementById("cornerMenuBtn");
  
  if (!dropdown || !menuBtn) return;

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
    
    document.getElementById("navToAdmin")?.addEventListener("click", () => {
      state.currentView = "admin";
      persistSettings();
      showView("admin");
    });
    document.getElementById("navToReport")?.addEventListener("click", () => {
      state.currentView = "report";
      persistSettings();
      showView("report");
    });
  } else {
    dropdown.innerHTML = `
      <button type="button" id="btnLogout" role="menuitem" style="color: var(--danger);">🚪 Cerrar sesión</button>
    `;
  }

  document.getElementById("btnLogout")?.addEventListener("click", logoutAdmin);
}

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

// ============================================================
// SECCIÓN 3: REGLAS DE STOCK (KOLO)
// ============================================================

async function loadRules() {
  try {
    const data = await firestoreGetDocData("adminRules");
    state.adminRules = data.adminRules || {};
    console.log("📋 Reglas KOLO cargadas desde Firestore:", Object.keys(state.adminRules).length);
    
    const metadata = await firestoreGetDocData("reglasMetadata");
    if (metadata && metadata.lastUpdate) {
      reglasLastUpdate = new Date(metadata.lastUpdate);
      reglasFileName = metadata.fileName || "Reglas KOLO cargadas";
    } else if (Object.keys(state.adminRules).length > 0) {
      reglasLastUpdate = new Date();
      reglasFileName = "Reglas KOLO existentes";
    }
    
    updateReglasStatusDisplay();
    
    if (typeof applyAdminFilter === "function") {
      applyAdminFilter();
    }
  } catch (e) {
    console.error("Error cargando reglas:", e);
    state.adminRules = {};
  }
}

async function persistRules() { 
  await firestoreSetDocData("adminRules", { adminRules: state.adminRules }); 
}

function buildAdminSourceRows() {
  const allSKUs = new Set();
  
  if (state.rows && state.rows.length) {
    state.rows.forEach(r => {
      if (r.SKU && r.SKU.trim() !== "") {
        allSKUs.add(r.SKU);
      }
    });
  }
  
  if (state.adminRules && Object.keys(state.adminRules).length > 0) {
    Object.keys(state.adminRules).forEach(sku => {
      if (sku && sku.trim() !== "") {
        allSKUs.add(sku);
      }
    });
  }
  
  const rows = [];
  allSKUs.forEach(sku => {
    let producto = "";
    
    if (state.rows && state.rows.length) {
      const found = state.rows.find(r => r.SKU === sku);
      if (found && found.Producto) {
        producto = found.Producto;
      }
    }
    
    if (!producto && state.adminRules[sku] && state.adminRules[sku].producto) {
      producto = state.adminRules[sku].producto;
    }
    
    if (!producto && state.listaCompleta && state.listaCompleta.length) {
      const foundInPrecios = state.listaCompleta.find(item => item.CODIGO === sku);
      if (foundInPrecios && foundInPrecios.DESCRIPCION) {
        producto = foundInPrecios.DESCRIPCION;
      }
    }
    
    rows.push({
      SKU: sku,
      Producto: producto || "Sin nombre",
      Minimo: state.adminRules[sku]?.minimo ?? "",
      Maximo: state.adminRules[sku]?.maximo ?? ""
    });
  });
  
  return rows.sort((a, b) => norm(a.SKU).localeCompare(norm(b.SKU)));
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
  
  updateReglasStatusDisplay();
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
  
  reglasLastUpdate = new Date();
  reglasFileName = "Reglas KOLO editadas manualmente";
  updateReglasStatusDisplay();
  
  firestoreSetDocData("reglasMetadata", {
    lastUpdate: reglasLastUpdate.toISOString(),
    fileName: "Reglas KOLO editadas manualmente",
    totalCount: Object.keys(state.adminRules).length
  }).catch(e => console.warn("No se pudo guardar metadata de reglas"));
  
  setStatus("✅ Reglas guardadas correctamente", false);
}

function clearAllRules() {
  if (!state.adminUnlocked) return;
  if (confirm("¿Eliminar TODAS las reglas de mínimos y máximos?")) {
    state.adminRules = {};
    persistRules();
    recalculateRows();
    applyAdminFilter();
    
    reglasLastUpdate = null;
    reglasFileName = null;
    updateReglasStatusDisplay();
    
    setStatus("✅ Todas las reglas han sido eliminadas", false);
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
  
  let producto = "";
  if (state.listaCompleta) {
    const found = state.listaCompleta.find(item => item.CODIGO === skuTrim);
    if (found) producto = found.DESCRIPCION;
  }
  
  state.adminRules[skuTrim] = { minimo: "", maximo: "", producto: producto };
  persistRules();
  recalculateRows();
  applyAdminFilter();
  
  reglasLastUpdate = new Date();
  reglasFileName = "SKU agregado manualmente";
  updateReglasStatusDisplay();
  
  firestoreSetDocData("reglasMetadata", {
    lastUpdate: reglasLastUpdate.toISOString(),
    fileName: "SKU agregado manualmente",
    totalCount: Object.keys(state.adminRules).length
  }).catch(e => console.warn("No se pudo guardar metadata de reglas"));
  
  setStatus(`✅ SKU "${skuTrim}" agregado.`, false);
}

function importRulesExcel() {
  if (!state.adminUnlocked) return;
  const fileInput = document.getElementById("adminExcelInput");
  const file = fileInput.files[0];
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
      let skuIdx = -1, minIdx = -1, maxIdx = -1, prodIdx = -1;

      for (let i = 0; i < Math.min(20, aoa.length); i++) {
        const row = Array.isArray(aoa[i]) ? aoa[i] : [];
        const joined = norm(row.join(" | "));
        if ((joined.includes("sku") || joined.includes("codigo")) && (joined.includes("min") || joined.includes("max"))) {
          headerRowIndex = i; 
          row.forEach((cell, idx) => {
            const cNorm = norm(String(cell || ""));
            if (cNorm.includes("sku") || cNorm.includes("codigo")) skuIdx = idx;
            if (cNorm.includes("min")) minIdx = idx;
            if (cNorm.includes("max")) maxIdx = idx;
            if (cNorm.includes("producto") || cNorm.includes("descripcion")) prodIdx = idx;
          });
          break;
        }
      }
      
      if (skuIdx === -1) {
        alert("No se encontró la columna SKU o Código en el archivo.");
        fileInput.value = "";
        return;
      }
      
      let importedCount = 0;
      
      for (let i = headerRowIndex + 1; i < aoa.length; i++) {
        const rowArr = aoa[i] || [];
        if (!rowArr.some(v => String(v || "").trim() !== "")) continue;
        
        const sku = String(rowArr[skuIdx] || "").trim();
        if (!sku) continue;
        
        const minimo = minIdx !== -1 ? toNumOrNull(rowArr[minIdx]) : null;
        const maximo = maxIdx !== -1 ? toNumOrNull(rowArr[maxIdx]) : null;
        let producto = prodIdx !== -1 ? String(rowArr[prodIdx] || "").trim() : "";
        
        if (!producto && state.listaCompleta) {
          const found = state.listaCompleta.find(item => item.CODIGO === sku);
          if (found) producto = found.DESCRIPCION;
        }
        
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
      
      reglasLastUpdate = new Date();
      reglasFileName = file.name;
      updateReglasStatusDisplay();
      
      firestoreSetDocData("reglasMetadata", {
        lastUpdate: reglasLastUpdate.toISOString(),
        fileName: file.name,
        totalCount: importedCount
      }).catch(e => console.warn("No se pudo guardar metadata de reglas"));
      
      // 🔥 LIMPIAR INPUT
      fileInput.value = "";
      
      alert(`Se importaron con éxito ${importedCount} reglas de inventario.`);
      setStatus(`✅ Reglas importadas: ${importedCount} SKUs`, false);
    } catch (err) { 
      console.error("Error al procesar el archivo Excel de reglas:", err); 
      setStatus("❌ Error al importar reglas", true);
      fileInput.value = "";
    }
  };
  reader.readAsArrayBuffer(file);
}

// ============================================================
// SECCIÓN 4: PRECIOS
// ============================================================

async function loadListaCompleta() {
  try {
    const data = await firestoreGetDocData("listaCompleta");
    state.listaCompleta = data.listaCompleta || [];
    state.preciosLookup = data.preciosLookup || {};
    
    if (data.lastUpdate) {
      preciosLastUpdate = new Date(data.lastUpdate);
      preciosFileName = data.fileName || "Precios cargados";
      updatePreciosStatusDisplay(state.listaCompleta.length);
    } else if (state.listaCompleta.length > 0) {
      preciosLastUpdate = new Date();
      preciosFileName = "Precios existentes";
      updatePreciosStatusDisplay(state.listaCompleta.length);
    }

    let templateDate = localStorage.getItem('tecnobahia_pedido_template_date');
    let templateBase64 = localStorage.getItem('tecnobahia_pedido_template_base64');
    let templateName = localStorage.getItem('tecnobahia_pedido_template_name');
    
    if (!templateBase64) {
      const templateData = await firestoreGetDocData("pedidoTemplate");
      if (templateData && templateData.pedidoTemplateBase64) {
        templateBase64 = templateData.pedidoTemplateBase64;
        templateName = templateData.pedidoTemplateName;
        templateDate = templateData.uploadedAt;
        
        if (templateBase64) {
          localStorage.setItem('tecnobahia_pedido_template_base64', templateBase64);
          localStorage.setItem('tecnobahia_pedido_template_name', templateName);
          if (templateDate) localStorage.setItem('tecnobahia_pedido_template_date', templateDate);
        }
      }
    }
    
    if (templateBase64 && templateName) {
      state.pedidoTemplateBase64 = templateBase64;
      state.pedidoTemplateLoaded = true;
      state.pedidoTemplateName = templateName;
      console.log("📄 Plantilla cargada:", templateName);
    }
    
    if (typeof updateTemplateStatusDisplay === "function") {
      updateTemplateStatusDisplay();
    }
    
    updateReglasStatusDisplay();
  } catch (e) {
    console.error("Error en loadListaCompleta:", e);
    state.listaCompleta = [];
    state.preciosLookup = {};
  }
}

async function saveListaCompleta() {
  try {
    await firestoreSetDocData("listaCompleta", {
      listaCompleta: state.listaCompleta,
      preciosLookup: state.preciosLookup,
      lastUpdate: preciosLastUpdate ? preciosLastUpdate.toISOString() : new Date().toISOString(),
      fileName: preciosFileName || "Precios cargados",
      totalCount: state.listaCompleta.length
    });
    console.log("✅ Precios y metadata guardados en Firestore");
  } catch (e) {
    console.error("Error guardando precios:", e);
  }
}

async function importListaCompleta() {
  if (!state.adminUnlocked) return;
  const fileInput = document.getElementById("listaCompletaInput");
  const file = fileInput.files[0];
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
      
      if (!aoa.length) {
        setStatus("No se encontraron datos en el archivo.", true);
        fileInput.value = "";
        return;
      }
      
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
      
      if (codigoCol === null || precioColPAD === null) {
        setStatus("❌ No se encontraron las columnas necesarias", true);
        fileInput.value = "";
        return;
      }
      
      state.listaCompleta = [];
      state.preciosLookup = {};
      let processedCount = 0;
      
      for (let i = headerRowIndex + 1; i < aoa.length; i++) {
        const rowArr = aoa[i] || [];
        if (!rowArr.some(v => String(v || "").trim() !== "")) continue;
        
        const codigo = String(rowArr[codigoCol] || "").trim().toUpperCase();
        const descripcion = descCol !== null ? String(rowArr[descCol] || "").trim() : "";
        
        const precioSinIva = toNum(rowArr[precioColPAD]);
        const precioConIva = precioSinIva * 1.13;
        
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
      
      preciosLastUpdate = new Date();
      preciosFileName = file.name;
      
      await saveListaCompleta();

      if (state.rows && state.rows.length > 0) {
        recalculateRows();
        if (typeof applyFilterAndSearch === "function") applyFilterAndSearch();
      }

      applyAdminFilter();
      
      // 🔥 LIMPIAR INPUT
      fileInput.value = "";
      
      setStatus(`✅ ${processedCount} precios cargados exitosamente.`, false);
    } catch (err) {
      console.error(err);
      setStatus("Error al cargar precios.", true);
      fileInput.value = "";
    }
  };
  reader.readAsArrayBuffer(file);
}

// ============================================================
// SECCIÓN 5: MODO OSCURO
// ============================================================

function initDarkMode() {
  console.log("🎨 Inicializando modo oscuro...");
  
  const toggleBtn = document.getElementById('darkModeToggle');
  if (!toggleBtn) {
    console.error("❌ Botón darkModeToggle no encontrado");
    return;
  }
  
  if (state.darkMode) {
    document.body.classList.add('dark');
    toggleBtn.textContent = '☀️ Modo claro';
  } else {
    document.body.classList.remove('dark');
    toggleBtn.textContent = '🌙 Modo oscuro';
  }
  
  function updateChipsStyle() {
    const chips = document.querySelectorAll('.filter-chip, .admin-filter-chip');
    chips.forEach(chip => {
      chip.style.transform = 'scale(1)';
      setTimeout(() => { chip.style.transform = ''; }, 10);
    });
  }
  
  const newBtn = toggleBtn.cloneNode(true);
  toggleBtn.parentNode.replaceChild(newBtn, toggleBtn);
  
  newBtn.addEventListener('click', async () => {
    console.log("🖱️ Click en botón de modo oscuro");
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    state.darkMode = isDark;
    newBtn.textContent = isDark ? '☀️ Modo claro' : '🌙 Modo oscuro';
    
    updateChipsStyle();
    
    console.log("💾 Guardando modo oscuro =", isDark);
    await persistSettings();
    console.log("✅ Modo oscuro guardado exitosamente");
  });
  
  updateChipsStyle();
  
  console.log("✅ Modo oscuro inicializado con valor:", state.darkMode);
}

// ============================================================
// SECCIÓN 6: PLANTILLA DE PEDIDO
// ============================================================

async function uploadPedidoTemplate() {
  if (!state.adminUnlocked) {
    setStatus("⚠️ No tienes permisos de administrador.", true);
    return;
  }
  
  const fileInput = document.getElementById("pedidoTemplateInput");
  const file = fileInput.files[0];
  
  if (!file) {
    setStatus("❌ Por favor selecciona un archivo Excel primero.", true);
    return;
  }
  
  const validExtensions = ['.xlsx', '.xls', '.xlsm'];
  const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  if (!validExtensions.includes(fileExt)) {
    setStatus("❌ El archivo debe ser de tipo Excel (.xlsx, .xls, .xlsm)", true);
    fileInput.value = "";
    return;
  }
  
  setStatus("📤 Subiendo plantilla de pedido...", false);
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const hasPedidoSheet = workbook.SheetNames.some(name => 
      name.toLowerCase() === "pedido" || name.toLowerCase().includes("pedido")
    );
    
    if (!hasPedidoSheet) {
      setStatus("❌ La plantilla debe contener una hoja llamada 'PEDIDO'", true);
      fileInput.value = "";
      return;
    }
    
    const base64 = await arrayBufferToBase64(arrayBuffer);
    
    state.pedidoTemplateBase64 = base64;
    state.pedidoTemplateLoaded = true;
    state.pedidoTemplateName = file.name;
    
    const now = new Date();
    localStorage.setItem('tecnobahia_pedido_template_base64', base64);
    localStorage.setItem('tecnobahia_pedido_template_name', file.name);
    localStorage.setItem('tecnobahia_pedido_template_date', now.toISOString());
    
    await firestoreSetDocData("pedidoTemplate", {
      pedidoTemplateBase64: base64,
      pedidoTemplateName: file.name,
      uploadedAt: now.toISOString()
    }).catch(e => console.warn("No se pudo guardar en Firestore:", e));
    
    console.log("✅ Plantilla guardada en localStorage");
    
    updateTemplateStatusDisplay();
    
    // 🔥 LIMPIAR INPUT
    fileInput.value = "";
    
    setStatus(`✅ Plantilla "${file.name}" subida con éxito.`, false);
    updateExportButtonState();
    
  } catch (error) {
    console.error("Error al subir plantilla:", error);
    setStatus("❌ Error al procesar el archivo. Verifica que sea un Excel válido.", true);
    fileInput.value = "";
  }
}

async function downloadCurrentTemplate() {
  if (!state.pedidoTemplateBase64) {
    setStatus("❌ No hay una plantilla de pedido cargada.", true);
    return;
  }
  
  try {
    const binaryString = atob(state.pedidoTemplateBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = state.pedidoTemplateName || "plantilla_pedido.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setStatus(`📥 Descargando plantilla "${state.pedidoTemplateName}"...`, false);
  } catch (error) {
    console.error("Error al descargar plantilla:", error);
    setStatus("❌ Error al descargar la plantilla.", true);
  }
}

function updateTemplateStatusDisplay() {
  const templateNameDisplay = document.getElementById("templateNameDisplay");
  if (templateNameDisplay) {
    if (state.pedidoTemplateLoaded && state.pedidoTemplateName) {
      const savedDate = localStorage.getItem('tecnobahia_pedido_template_date');
      let fechaTexto = "";
      if (savedDate) {
        try {
          const fecha = new Date(savedDate);
          if (!isNaN(fecha.getTime())) {
            fechaTexto = `<br>📅 ${fecha.toLocaleString('es-ES', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}`;
          }
        } catch(e) {
          console.warn("Error al parsear fecha de plantilla");
        }
      }
      templateNameDisplay.innerHTML = `✅ Plantilla actual: <strong>${escapeHtml(state.pedidoTemplateName)}</strong>${fechaTexto}`;
      templateNameDisplay.style.color = "var(--ok)";
    } else {
      templateNameDisplay.innerHTML = `⚠️ No hay plantilla cargada. Sube una plantilla para poder generar pedidos.`;
      templateNameDisplay.style.color = "var(--warning)";
    }
  }
}

function updateExportButtonState() {
  const btn = document.getElementById("btnExport");
  if (!btn) return;
  
  const hasData = state.rows && state.rows.length > 0;
  const hasTemplate = state.pedidoTemplateLoaded === true;
  
  btn.disabled = !(hasData && hasTemplate);
  
  if (!hasTemplate) {
    btn.title = "Primero sube una plantilla en el Panel Admin";
    btn.style.opacity = "0.5";
  } else if (!hasData) {
    btn.title = "Primero carga un archivo de inventario";
    btn.style.opacity = "0.5";
  } else {
    btn.title = "Descargar pedido";
    btn.style.opacity = "1";
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

function arrayBufferToBase64(buffer) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([buffer]);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}