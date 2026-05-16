// js/admin.js

/**
 * =========================================================================
 * 🔥 SECCIÓN 1: PERSISTENCIA Y CONEXIÓN CON FIREBASE FIRESTORE
 * =========================================================================
 */

/**
 * Retorna la referencia del documento dentro de la colección central de Firestore.
 */
function getFirestoreDocRef(name) {
  if (!window.db || !window.doc) throw new Error("Firestore no está inicializado");
  return window.doc(window.db, "auxiliar-inventario", name);
}

/**
 * Trae de forma asíncrona los datos de un documento de Firestore.
 */
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

/**
 * Guarda o combina datos de manera estructurada en un documento de Firestore.
 */
async function firestoreSetDocData(name, data) {
  if (!window.db || !window.setDoc) return;
  try {
    const ref = getFirestoreDocRef(name);
    await window.setDoc(ref, data, { merge: true });
  } catch (err) {
    console.error("Error guardando en Firestore:", err);
  }
}

/**
 * Descarga las reglas de mínimos y máximos asignadas desde Firebase.
 */
async function loadRules() {
  const data = await firestoreGetDocData("adminRules");
  state.adminRules = data.adminRules || {};
}

/**
 * Carga el catálogo maestro completo, indexación de precios lookup y la plantilla base64.
 */
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

/**
 * Persiste la lista maestra de precios y codificaciones en la nube.
 */
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

/**
 * Sube o guarda la plantilla de Excel maestra del pedido en formato Base64.
 */
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

/**
 * Parsea la plantilla de pedido base64 activa hacia un libro de SheetJS usable.
 */
function getPedidoWorkbook() {
  if (!state.pedidoTemplateBase64) return null;
  try {
    return XLSX.read(state.pedidoTemplateBase64, { type: "base64", cellDates: true });
  } catch (e) {
    console.error("Error leyendo plantilla PEDIDO:", e);
    return null;
  }
}

/**
 * Cambia la disponibilidad física del botón de descarga según las dependencias cargadas.
 */
function updateExportButtonState() {
  const btn = document.getElementById("btnExport");
  const enabled = state.rows && state.rows.length > 0 && state.pedidoTemplateLoaded;
  if (btn) btn.disabled = !enabled;
}

/**
 * Sincroniza las reglas de mínimos y máximos actuales con Firestore.
 */
async function persistRules() { 
  await firestoreSetDocData("adminRules", { adminRules: state.adminRules }); 
}

/**
 * Trae las preferencias de entorno del usuario (Vistas y modo oscuro).
 */
async function loadSettings() {
  const data = await firestoreGetDocData("settings");
  state.currentView = data.currentView || "report";
  state.darkMode = data.darkMode || false;
}

/**
 * Sincroniza configuraciones estéticas con la nube.
 */
async function persistSettings() {
  await firestoreSetDocData("settings", {
    currentView: state.currentView,
    darkMode: state.darkMode
  });
}

/**
 * =========================================================================
 * 🔐 SECCIÓN 2: AUTENTICACIÓN Y SEGURIDAD (FIREBASE AUTH)
 * =========================================================================
 */

/**
 * Valida credenciales contra Firebase Authentication para dar paso al panel.
 */
async function unlockAdminPanel() {
  const email = document.getElementById('usuarioEmail').value;
  const pass = document.getElementById('usuarioPass').value;

  if (!email || !pass) {
    setStatus("❌ Ingresa correo y contraseña.", true);
    return;
  }

  try {
    await window.signInWithEmailAndPassword(window.auth, email, pass);
    state.adminUnlocked = true;
    updateAdminLockUI();
    applyAdminFilter();
    setStatus("🔓 Panel de administrador desbloqueado.");
    document.getElementById('usuarioEmail').value = "";
    document.getElementById('usuarioPass').value = "";
  } catch (error) {
    setStatus("❌ Usuario o contraseña inválidos.", true);
    console.error(error.code);
  }
}

/**
 * Desconecta la sesión activa de Firebase Auth.
 */
async function logoutAdmin() {
  try {
    await window.signOut(window.auth);
    state.adminUnlocked = false;
    updateAdminLockUI();
    setStatus("🚪 Sesión cerrada correctamente.");
  } catch (error) {
    setStatus("❌ Error al cerrar sesión.", true);
    console.error(error);
  }
}

/**
 * =========================================================================
 * ⚙️ SECCIÓN 3: CONTROLADOR DE REGLAS DE CONTROL DE STOCK
 * =========================================================================
 */

/**
 * Construye la fuente de datos mezclando los SKUs del inventario cargado y las reglas de Firebase.
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

/**
 * Procesa filtros de texto y reglas sobre la lista de control, calculando la paginación activa.
 */
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
    if (state.adminActiveFilter === "all") text = `Mostrando ${pageRows.length} de ${totalItems} SKUs (Filtro: todos)`;
    else if (state.adminActiveFilter === "conRegla") text = `✅ Mostrando ${pageRows.length} de ${totalItems} SKUs con reglas definidas`;
    else if (state.adminActiveFilter === "sinRegla") text = `📭 Mostrando ${pageRows.length} de ${totalItems} SKUs sin reglas`;
    filterInfo.textContent = text;
  }
}

/**
 * Lee los inputs numéricos modificados en la tabla HTML de administración y actualiza las reglas.
 */
function saveRulesFromInputs() {
  if (!state.adminUnlocked) { setStatus("Debes desbloquear el panel.", true); return; }
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
  setStatus("✅ Reglas guardadas correctamente.");
}

/**
 * Limpia por completo la colección de reglas en memoria y en Firestore.
 */
function clearAllRules() {
  if (!state.adminUnlocked) { setStatus("Debes desbloquear el panel.", true); return; }
  if (confirm("¿Eliminar TODAS las reglas de mínimos y máximos?")) {
    state.adminRules = {};
    persistRules();
    recalculateRows();
    applyAdminFilter();
    setStatus("🧹 Todas las reglas fueron eliminadas.");
  }
}

/**
 * Registra un nuevo código SKU en el árbol de reglas administrativas independientes.
 */
function addNewSku() {
  if (!state.adminUnlocked) { setStatus("Debes desbloquear el panel.", true); return; }
  const newSku = prompt("Ingrese el nuevo SKU (código):");
  if (!newSku || newSku.trim() === "") return;
  const skuTrim = newSku.trim();
  
  if (state.adminRules[skuTrim]) {
    setStatus(`❌ El SKU "${skuTrim}" ya existe en las reglas.`, true);
    return;
  }
  const existingInInventory = state.rows?.some(r => r.SKU === skuTrim);
  if (existingInInventory) {
    setStatus(`⚠️ El SKU "${skuTrim}" ya existe en el inventario. Puedes editar sus reglas.`);
  }
  
  state.adminRules[skuTrim] = { minimo: "", maximo: "", producto: "" };
  persistRules();
  recalculateRows();
  applyAdminFilter();
  setStatus(`✅ SKU "${skuTrim}" agregado correctamente.`);
}

/**
 * Parsea un archivo Excel externo para importar masivamente mínimos y máximos.
 */
function importRulesExcel() {
  if (!state.adminUnlocked) { setStatus("Debes desbloquear el panel.", true); return; }
  const file = document.getElementById("adminExcelInput").files[0];
  if (!file) { setStatus("Selecciona un archivo Excel.", true); return; }
  
  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      
      if (!aoa.length) { setStatus("El Excel está vacío.", true); return; }
      
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
      if (!map.sku) { setStatus("No se encontró columna SKU en el archivo.", true); return; }
      
      let importedCount = 0;
      const skusImported = new Set();
      
      for (let i = headerRowIndex + 1; i < aoa.length; i++) {
        const rowArr = aoa[i] || [];
        const hasContent = rowArr.some(v => String(v || "").trim() !== "");
        if (!hasContent) continue;
        
        const row = {};
        header.forEach((name, idx) => { row[name] = rowArr[idx] !== undefined ? rowArr[idx] : ""; });
        
        const sku = String(row[map.sku] || "").trim();
        if (!sku) continue;
        if (skusImported.has(sku)) continue;
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
      setStatus(`✅ ¡Importación exitosa! Se configuraron ${importedCount} reglas sin duplicados.`);
      document.getElementById("adminExcelInput").value = "";
    } catch (err) { 
      console.error(err); 
      setStatus("Error al importar el Excel.", true); 
    }
  };
  reader.readAsArrayBuffer(file);
}

/**
 * =========================================================================
 * 📈 SECCIÓN 4: INGESTA DE PRECIOS DEL CATÁLOGO MAESTRO (CON IVA)
 * =========================================================================
 */

/**
 * Parsea un archivo Excel de precios maestros (listaCompleta), extrae códigos, descripciones 
 * y calcula automáticamente el precio PAD con IVA (13%), guardando todo de forma persistente en Firestore.
 */
async function importListaCompleta() {
  if (!state.adminUnlocked) { 
    setStatus("Debes desbloquear el panel.", true); 
    return; 
  }
  
  const file = document.getElementById("listaCompletaInput").files[0];
  if (!file) { 
    setStatus("Selecciona el archivo de precios (precios.xlsm o similar).", true); 
    return; 
  }
  
  setStatus("Procesando archivo maestro de precios...");
  const reader = new FileReader();
  
  reader.onload = async function(evt) {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      
      // Buscar la hoja "lista completa" o similar mediante normalización de texto
      let sheetName = workbook.SheetNames.find(n => norm(n).includes("lista"));
      if (!sheetName) sheetName = workbook.SheetNames[0];
      
      const sheet = workbook.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      
      if (!aoa.length) { 
        setStatus("El archivo de precios está vacío.", true); 
        return; 
      }
      
      // Detectar fila de encabezados (buscar heurística de "CODIGOS", "PAD", "PSM")
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(20, aoa.length); i++) {
        const row = Array.isArray(aoa[i]) ? aoa[i] : [];
        const joined = norm(row.join(" | "));
        if (joined.includes("codigo") && (joined.includes("pad") || joined.includes("psm"))) {
          headerRowIndex = i;
          break;
        }
      }
      
      const headerRow = (aoa[headerRowIndex] || []).map((h, idx) => {
        const clean = String(h || "").trim();
        return clean || `Col_${idx + 1}`;
      });
      
      // Detectar columnas clave de la matriz de precios
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
        setStatus("No se encontraron columnas indispensables: CODIGOS y PAD SIN IVA. Verifica el formato.", true);
        return;
      }
      
      // Inicializar y vaciar estructuras temporales de catálogo
      state.listaCompleta = [];
      state.preciosLookup = {};
      let processedCount = 0;
      
      // Mapear filas de datos hacia el estado local
      for (let i = headerRowIndex + 1; i < aoa.length; i++) {
        const rowArr = aoa[i] || [];
        const hasContent = rowArr.some(v => String(v || "").trim() !== "");
        if (!hasContent) continue;
        
        const codigo = String(rowArr[codigoCol] || "").trim().toUpperCase();
        const descripcion = descCol !== null ? String(rowArr[descCol] || "").trim() : "";
        
        // 🧮 MATEMÁTICA: Tomar el valor base de la columna "PAD SIN IVA" y sumarle el 13% de IVA
        const precioSinIva = toNum(rowArr[precioColPAD]);
        const precioConIva = precioSinIva * 1.13; 
        
        if (!codigo) continue;
        
        const item = {
          CODIGO: codigo,
          DESCRIPCION: descripcion,
          PRECIO: precioConIva // Costo real definitivo guardado en la base de datos
        };
        
        state.listaCompleta.push(item);
        state.preciosLookup[codigo] = precioConIva;
        processedCount++;
      }
      
      if (processedCount === 0) {
        setStatus("No se encontraron productos con datos válidos en el catálogo.", true);
        return;
      }

      // 💾 PERSISTENCIA: Guardar catálogo en Firebase de inmediato
      await saveListaCompleta();

      // Forzar recálculo dinámico en el reporte en pantalla si ya hay datos cargados
      if (state.rows && state.rows.length > 0) {
        recalculateRows();
        if (typeof applyFilterAndSearch === "function") applyFilterAndSearch();
      }

      applyAdminFilter();
      setStatus(`✅ Precios cargados correctamente. ${processedCount} productos con costos actualizados (PAD c/IVA 13%).`);
      
      // Limpiar el valor del input file del DOM
      document.getElementById("listaCompletaInput").value = "";

    } catch (err) {
      console.error(err);
      setStatus("Error al cargar el archivo de precios. Verifica que sea un Excel válido.", true);
    }
  };
  
  reader.readAsArrayBuffer(file);
}

/**
 * =========================================================================
 * 🌙 SECCIÓN 5: CONFIGURACIONES DE ENTORNO (MODO OSCURO)
 * =========================================================================
 */

/**
 * Inicializa el estado estético de la aplicación basándose en las preferencias
 * guardadas en el state y configura el interruptor (toggle) en caliente.
 */
function initDarkMode() {
  const toggleBtn = document.getElementById('darkModeToggle');
  
  // Sincronizar el estado visual de la app con el DOM
  if (state.darkMode) {
    document.body.classList.add('dark');
    if (toggleBtn) toggleBtn.innerHTML = '☀️ Modo claro';
  } else {
    document.body.classList.remove('dark');
    if (toggleBtn) toggleBtn.innerHTML = '🌙 Modo oscuro';
  }
  
  // Agregar el evento de escucha si el botón existe en el DOM activo
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      state.darkMode = document.body.classList.contains('dark');
      
      // Sincroniza la preferencia en Firebase Firestore automáticamente
      persistSettings();
      
      toggleBtn.innerHTML = state.darkMode ? '☀️ Modo claro' : '🌙 Modo oscuro';
    });
  }
}