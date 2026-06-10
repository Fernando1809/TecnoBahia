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
      preciosInfo.innerHTML = `<strong>${escapeHtml(preciosFileName)}</strong><br>📅 ${fechaFormateada}<br>📊 ${count} productos cargados (Precios SIN IVA)`;
      preciosInfo.style.color = "var(--ok)";
    } else if (count > 0) {
      preciosInfo.innerHTML = `<strong>Precios cargados</strong><br>📊 ${count} productos cargados (SIN IVA)`;
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
// SECCIÓN 3: REGLAS DE STOCK (KOLO) - VERSIÓN OPTIMIZADA
// ============================================================

async function loadRules() {
  try {
    // Cargar reglas con valores desde Firestore
    const data = await firestoreGetDocData("adminRules");
    const rulesWithValues = data.adminRules || {};
    
    // Cargar SKUs sin reglas desde localStorage
    let skusSinReglas = {};
    const savedSinReglas = localStorage.getItem('tecnobahia_skus_sin_reglas');
    if (savedSinReglas) {
      try {
        skusSinReglas = JSON.parse(savedSinReglas);
        console.log(`📦 Cargados ${Object.keys(skusSinReglas).length} SKUs sin reglas desde localStorage`);
      } catch(e) {
        console.warn("Error cargando SKUs sin reglas:", e);
      }
    }
    
    // Combinar ambos
    state.adminRules = { ...skusSinReglas, ...rulesWithValues };
    
    console.log("📋 Reglas KOLO cargadas:", Object.keys(state.adminRules).length);
    console.log(`   - Con reglas: ${Object.keys(rulesWithValues).length}`);
    console.log(`   - Sin reglas: ${Object.keys(skusSinReglas).length}`);
    
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
  // Filtrar solo SKUs que tienen reglas (mínimo o máximo definido)
  const rulesWithValues = {};
  for (const sku in state.adminRules) {
    const rule = state.adminRules[sku];
    if ((rule.minimo !== "" && rule.minimo !== null && rule.minimo !== undefined) || 
        (rule.maximo !== "" && rule.maximo !== null && rule.maximo !== undefined)) {
      rulesWithValues[sku] = rule;
    }
  }
  
  console.log(`💾 Guardando ${Object.keys(rulesWithValues).length} SKUs con reglas en Firestore`);
  console.log(`💾 Total SKUs en memoria: ${Object.keys(state.adminRules).length}`);
  
  // Guardar solo los que tienen reglas en Firestore
  try {
    await firestoreSetDocData("adminRules", { adminRules: rulesWithValues });
    console.log("✅ Reglas guardadas en Firestore");
  } catch (err) {
    console.error("❌ Error guardando en Firestore:", err);
  }
  
  // Guardar los SKUs sin reglas en localStorage
  const skusSinReglas = {};
  for (const sku in state.adminRules) {
    const rule = state.adminRules[sku];
    if ((rule.minimo === "" || rule.minimo === null || rule.minimo === undefined) && 
        (rule.maximo === "" || rule.maximo === null || rule.maximo === undefined)) {
      skusSinReglas[sku] = rule;
    }
  }
  
  if (Object.keys(skusSinReglas).length > 0) {
    localStorage.setItem('tecnobahia_skus_sin_reglas', JSON.stringify(skusSinReglas));
    console.log(`💾 ${Object.keys(skusSinReglas).length} SKUs sin reglas guardados en localStorage`);
  } else {
    localStorage.removeItem('tecnobahia_skus_sin_reglas');
  }
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
    if (!hasMin && !hasMax && !nextRules[sku].producto) delete nextRules[sku];
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
  if (confirm("⚠️ ¿Eliminar SOLO las reglas de mínimos y máximos?\n\nLos SKUs seguirán apareciendo, solo se eliminarán los valores de mínimo y máximo.")) {
    for (const sku in state.adminRules) {
      state.adminRules[sku].minimo = "";
      state.adminRules[sku].maximo = "";
    }
    persistRules();
    recalculateRows();
    applyAdminFilter();
    
    reglasLastUpdate = new Date();
    reglasFileName = "Reglas eliminadas";
    updateReglasStatusDisplay();
    
    setStatus("✅ Los valores de mínimo y máximo han sido eliminados", false);
  }
}

function addNewSku() {
  if (!state.adminUnlocked) return;
  const newSku = prompt("Ingrese el nuevo SKU (código):");
  if (!newSku || newSku.trim() === "") return;
  const skuTrim = newSku.trim();
  
  if (state.adminRules[skuTrim]) {
    alert(`El SKU "${skuTrim}" ya existe.`);
    return;
  }
  
  let producto = "";
  if (state.listaCompleta) {
    const found = state.listaCompleta.find(item => item.CODIGO === skuTrim);
    if (found) producto = found.DESCRIPCION;
  }
  
  state.adminRules[skuTrim] = { minimo: "", maximo: "", producto: producto || skuTrim };
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

// ============================================================
// FUNCIÓN CORREGIDA: IMPORTAR REGLAS - NO OMITE NINGÚN SKU
// ============================================================

function importRulesExcel() {
  if (!state.adminUnlocked) {
    alert("Debes iniciar sesión como administrador");
    return;
  }
  
  const fileInput = document.getElementById("adminExcelInput");
  const file = fileInput.files[0];
  
  if (!file) {
    alert("❌ Por favor selecciona un archivo Excel o CSV primero.");
    return;
  }
  
  const reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      let workbook;
      const data = new Uint8Array(evt.target.result);
      workbook = XLSX.read(data, { type: 'array' });
      
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      
      if (!rows || rows.length < 2) {
        alert("El archivo no tiene datos");
        fileInput.value = "";
        return;
      }
      
      console.log("📋 Archivo cargado. Total filas:", rows.length);
      
      // ÍNDICES FIJOS para tu archivo CSV
      // Formato: sku;item;minimo;maximo;notificar
      const skuCol = 0;      // Columna 0 = SKU (código)
      const prodCol = 1;     // Columna 1 = PRODUCTO/ITEM (nombre)
      const minCol = 2;      // Columna 2 = MINIMO
      const maxCol = 3;      // Columna 3 = MAXIMO
      
      console.log(`✅ Usando: SKU col ${skuCol}, Producto col ${prodCol}, Min col ${minCol}, Max col ${maxCol}`);
      
      // Verificar el primer dato real (fila 1)
      const primeraFilaDato = rows[1];
      if (primeraFilaDato) {
        console.log(`📋 Primer SKU: "${primeraFilaDato[skuCol]}"`);
        console.log(`📋 Primer Producto: "${primeraFilaDato[prodCol]}"`);
      }
      
      let importedCount = 0;
      let conReglas = 0;
      let sinReglas = 0;
      
      // LIMPIAR TODO ANTES DE CARGAR
      state.adminRules = {};
      localStorage.removeItem('tecnobahia_skus_sin_reglas');
      
      // Recorrer todas las filas (DESDE LA FILA 1, saltando la fila 0 que son encabezados)
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        
        // Obtener SKU de la primera columna
        let sku = "";
        if (row[skuCol] !== undefined && row[skuCol] !== null && row[skuCol] !== "") {
          sku = String(row[skuCol]).trim();
        }
        
        if (!sku) continue;
        
        // Obtener nombre del producto de la segunda columna
        let producto = "";
        if (row[prodCol] !== undefined && row[prodCol] !== null && row[prodCol] !== "") {
          producto = String(row[prodCol]).trim();
        }
        
        if (!producto) producto = sku;
        
        // Obtener mínimo de la tercera columna
        let minimo = null;
        if (row[minCol] !== undefined && row[minCol] !== null && row[minCol] !== "") {
          const minVal = String(row[minCol]).trim();
          if (minVal !== "" && !isNaN(Number(minVal))) {
            minimo = Number(minVal);
          }
        }
        
        // Obtener máximo de la cuarta columna
        let maximo = null;
        if (row[maxCol] !== undefined && row[maxCol] !== null && row[maxCol] !== "") {
          const maxVal = String(row[maxCol]).trim();
          if (maxVal !== "" && !isNaN(Number(maxVal))) {
            maximo = Number(maxVal);
          }
        }
        
        // AGREGAR SIEMPRE el SKU, tenga o no reglas
        state.adminRules[sku] = {
          minimo: (minimo !== null && !isNaN(minimo)) ? minimo : "",
          maximo: (maximo !== null && !isNaN(maximo)) ? maximo : "",
          producto: producto
        };
        
        importedCount++;
        if (minimo !== null && maximo !== null) {
          conReglas++;
        } else {
          sinReglas++;
        }
        
        // Mostrar progreso cada 1000 SKUs
        if (importedCount % 1000 === 0) {
          console.log(`📦 Procesados ${importedCount} SKUs...`);
        }
      }
      
      console.log(`✅ Total procesados: ${importedCount} SKUs`);
      console.log(`📊 Con reglas: ${conReglas}`);
      console.log(`📭 Sin reglas: ${sinReglas}`);
      
      // Guardar en Firestore (solo los que tienen reglas) y localStorage (los que no)
      await persistRules();
      
      // Refrescar la tabla de admin
      if (typeof applyAdminFilter === "function") {
        applyAdminFilter();
      }
      
      // Actualizar el contador
      updateReglasStatusDisplay();
      
      // Guardar metadata
      reglasLastUpdate = new Date();
      reglasFileName = file.name;
      
      await firestoreSetDocData("reglasMetadata", {
        lastUpdate: reglasLastUpdate.toISOString(),
        fileName: file.name,
        totalCount: Object.keys(state.adminRules).length
      }).catch(e => console.warn("No se pudo guardar metadata de reglas"));
      
      // Limpiar el input
      fileInput.value = "";
      
      // Mostrar resumen
      const mensaje = `✅ Procesados ${importedCount} SKUs.\n📊 Con reglas: ${conReglas}\n📭 Sin reglas: ${sinReglas}`;
      alert(mensaje);
      setStatus(mensaje, false);
      
      // También actualizar listaCompleta para búsqueda
      for (const sku in state.adminRules) {
        if (!state.listaCompleta.some(item => item.CODIGO === sku)) {
          state.listaCompleta.push({
            CODIGO: sku,
            DESCRIPCION: state.adminRules[sku].producto || sku,
            PRECIO_SIN_IVA: state.preciosLookup[sku] || 0
          });
        }
      }
      
      if (typeof saveListaCompleta === "function") {
        await saveListaCompleta();
      }
      
    } catch (err) {
      console.error("Error al procesar el archivo:", err);
      alert("Error al procesar el archivo: " + err.message);
      fileInput.value = "";
    }
  };
  reader.readAsArrayBuffer(file);
}

// ============================================================
// SECCIÓN 4: PRECIOS
// ============================================================

async function clearAllPrices() {
  if (!state.adminUnlocked) return;
  if (confirm("⚠️ ¿ELIMINAR TODOS LOS PRECIOS GUARDADOS? Esta acción no se puede deshacer. Luego deberás volver a subir el archivo de precios.")) {
    state.listaCompleta = [];
    state.preciosLookup = {};
    preciosLastUpdate = null;
    preciosFileName = null;
    
    await firestoreSetDocData("listaCompleta", {
      listaCompleta: [],
      preciosLookup: {},
      lastUpdate: new Date().toISOString(),
      fileName: "Precios eliminados",
      totalCount: 0
    });
    
    updatePreciosStatusDisplay(0);
    recalculateRows();
    setStatus("✅ Todos los precios han sido eliminados. Ahora puedes subir el archivo nuevamente.", false);
  }
}

async function loadListaCompleta() {
  try {
    const data = await firestoreGetDocData("listaCompleta");
    state.listaCompleta = data.listaCompleta || [];
    state.preciosLookup = data.preciosLookup || {};
    
    const muestra = Object.values(state.preciosLookup).slice(0, 5);
    const preciosAltos = muestra.some(p => p > 100);
    if (preciosAltos && state.listaCompleta.length > 0) {
      console.warn("⚠️ Se detectaron precios altos - posiblemente contienen IVA. Sugerimos limpiar y recargar.");
      const preciosInfo = document.getElementById("preciosInfo");
      if (preciosInfo) {
        preciosInfo.innerHTML = `<strong>⚠️ ATENCIÓN</strong><br>Los precios cargados podrían tener IVA incluido.<br>Usa el botón "Limpiar precios" y vuelve a subir el archivo.`;
        preciosInfo.style.color = "var(--danger)";
      }
    }
    
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
      let errores = [];
      
      for (let i = headerRowIndex + 1; i < aoa.length; i++) {
        const rowArr = aoa[i] || [];
        if (!rowArr.some(v => String(v || "").trim() !== "")) continue;
        
        const codigo = String(rowArr[codigoCol] || "").trim().toUpperCase();
        const descripcion = descCol !== null ? String(rowArr[descCol] || "").trim() : "";
        
        let precioSinIva = toNum(rowArr[precioColPAD]);
        
        if (precioSinIva > 1000) {
          errores.push(`${codigo}: ${precioSinIva} - posible IVA incluido`);
        }
        
        if (!codigo) continue;
        
        const item = {
          CODIGO: codigo,
          DESCRIPCION: descripcion,
          PRECIO_SIN_IVA: precioSinIva
        };
        
        state.listaCompleta.push(item);
        state.preciosLookup[codigo] = precioSinIva;
        processedCount++;
      }
      
      if (errores.length > 0) {
        console.warn("⚠️ Precios sospechosamente altos:", errores.slice(0, 5));
      }
      
      preciosLastUpdate = new Date();
      preciosFileName = file.name;
      
      await saveListaCompleta();

      if (state.rows && state.rows.length > 0) {
        recalculateRows();
        if (typeof applyFilterAndSearch === "function") applyFilterAndSearch();
      }

      applyAdminFilter();
      
      fileInput.value = "";
      
      let mensaje = `✅ ${processedCount} precios cargados exitosamente (PAD sin IVA).`;
      if (errores.length > 0) {
        mensaje += ` ⚠️ Se detectaron ${errores.length} precios altos. Verifica que el archivo contenga PAD sin IVA.`;
      }
      setStatus(mensaje, false);
      updatePreciosStatusDisplay(processedCount);
      
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

// ============================================================
// DESCARGA DE PLANTILLA KOLO PARA MÍNIMOS Y MÁXIMOS
// ============================================================

function downloadKOLOTemplate() {
  const templateData = [
    { SKU: "A24W451-1", Minimo: 10, Maximo: 50 },
    { SKU: "A24W451-5", Minimo: 5, Maximo: 25 },
    { SKU: "A24W453-1", Minimo: 8, Maximo: 40 },
    { SKU: "A24W453-5", Minimo: 4, Maximo: 20 },
    { SKU: "A24T454-1", Minimo: 6, Maximo: 30 }
  ];
  
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(templateData);
  ws['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }];
  
  const instrucciones = [
    ["INSTRUCCIONES PARA CARGA MASIVA EN KOLO"],
    [""],
    ["1. Complete los campos SKU, Minimo y Maximo para cada producto"],
    ["2. El SKU debe coincidir exactamente con el código de su producto en KOLO"],
    ["3. Minimo: Stock mínimo antes de generar pedido"],
    ["4. Maximo: Stock máximo deseado (se sugiere pedir hasta alcanzar este nivel)"],
    ["5. Guarde el archivo y súbalo en KOLO en la sección de carga masiva"],
    [""],
    ["FECHA DE DESCARGA:", new Date().toLocaleString('es-ES')]
  ];
  
  const wsInstrucciones = XLSX.utils.aoa_to_sheet(instrucciones);
  wsInstrucciones['!cols'] = [{ wch: 60 }];
  
  XLSX.utils.book_append_sheet(wb, ws, "MIN_MAX_KOLO");
  XLSX.utils.book_append_sheet(wb, wsInstrucciones, "INSTRUCCIONES");
  
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `plantilla_kolo_min_max_${fecha}.xlsx`);
  
  if (typeof setStatus === "function") {
    setStatus("📥 Plantilla KOLO descargada. Completa los campos y súbela en KOLO.", false);
  }
}

// ============================================================
// FUNCIÓN PARA ELIMINAR TODOS LOS ITEMS (SKUs)
// ============================================================

async function clearAllItems() {
  if (!state.adminUnlocked) return;
  
  const confirmed = confirm("⚠️ ¡ADVERTENCIA! ⚠️\n\nEsta acción ELIMINARÁ TODOS los SKUs del sistema.\n\nSe eliminarán:\n- Todos los SKUs (con o sin reglas)\n- Todas las reglas de mínimos y máximos\n\nEsta acción NO se puede deshacer.\n\n¿Estás SEGURO?");
  
  if (!confirmed) return;
  
  try {
    setStatus("🗑️ Eliminando todos los SKUs...", false);
    
    state.adminRules = {};
    localStorage.removeItem('tecnobahia_skus_sin_reglas');
    
    state.listaCompleta = [];
    state.preciosLookup = {};
    
    await persistRules();
    
    await firestoreSetDocData("reglasMetadata", {
      lastUpdate: new Date().toISOString(),
      fileName: "Todos los SKUs eliminados",
      totalCount: 0
    }).catch(e => console.warn("No se pudo guardar metadata de reglas"));
    
    if (typeof saveListaCompleta === "function") {
      await saveListaCompleta();
    }
    
    recalculateRows();
    applyAdminFilter();
    
    reglasLastUpdate = new Date();
    reglasFileName = "Todos los SKUs eliminados";
    updateReglasStatusDisplay();
    
    if (typeof applyFilterAndSearch === "function") {
      applyFilterAndSearch();
    }
    
    setStatus("✅ Todos los SKUs han sido eliminados del sistema", false);
    mostrarNotificacion("✅ Se eliminaron todos los SKUs del sistema", false);
    
  } catch (error) {
    console.error("Error al eliminar items:", error);
    setStatus("❌ Error al eliminar los SKUs", true);
  }
}