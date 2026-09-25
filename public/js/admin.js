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

async function firestoreGetDocDataStrict(name) {
  if (!window.db || !window.getDoc) throw new Error("Firestore no está inicializado");
  const ref = getFirestoreDocRef(name);
  const snap = await window.getDoc(ref);
  return snap.exists() ? snap.data() : {};
}

async function firestoreSetDocData(name, data, merge = true) {
  if (!window.db || !window.setDoc) return false;
  try {
    const ref = getFirestoreDocRef(name);
    await window.setDoc(ref, data, { merge: merge });
    return true;
  } catch (err) {
    console.error("Error guardando en Firestore:", err);
    return false;
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
      preciosInfo.innerHTML = `<strong>${escapeHtml(preciosFileName)}</strong><br>📅 ${fechaFormateada}<br>📊 ${count} productos cargados (PAD con IVA)`;
      preciosInfo.style.color = "var(--ok)";
    } else if (count > 0) {
      preciosInfo.innerHTML = `<strong>Precios cargados</strong><br>📊 ${count} productos cargados (PAD con IVA)`;
      preciosInfo.style.color = "var(--ok)";
    } else {
      preciosInfo.innerHTML = "No hay precios cargados";
      preciosInfo.style.color = "var(--warning)";
    }
  }
}

function updateReglasStatusDisplay() {
  const sucursalLabel = document.getElementById("sucursalActivaLabel");
  if (sucursalLabel) sucursalLabel.textContent = state.sucursalActiva || "Jiquilisco";

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

const SUCURSALES = ["Jiquilisco", "Usulután"];

/**
 * Carga desde Firestore las reglas de mínimos/máximos de AMBAS sucursales
 * (cada una vive en su propio documento: adminRules_jiquilisco / adminRules_usulutan)
 * y activa la sucursal correspondiente en state.adminRules.
 */
async function loadRules() {
  try {
    state.adminRulesPorSucursal = state.adminRulesPorSucursal || {};
    state.reglasMeta = state.reglasMeta || {};

    for (const sucursal of SUCURSALES) {
      const slug = slugSucursal(sucursal);
      const data = await firestoreGetDocData(`adminRules_${slug}`);
      if (data.chunked === true) {
        const generation = data.chunkGeneration === "b" ? "b" : "a";
        const chunkCount = Math.max(0, Number(data.chunkCount) || 0);
        const chunks = await Promise.all(Array.from({ length: chunkCount }, (_, index) =>
          firestoreGetDocData(`adminRules_${slug}_${generation}_${index}`)
        ));
        if (chunks.some(chunk => !chunk.adminRules)) {
          throw new Error(`Faltan fragmentos de reglas para ${sucursal}`);
        }
        state.adminRulesPorSucursal[sucursal] = Object.assign({}, ...chunks.map(chunk => chunk.adminRules));
      } else {
        state.adminRulesPorSucursal[sucursal] = data.adminRules || {};
      }

      const metadata = await firestoreGetDocData(`reglasMetadata_${slug}`);
      state.reglasMeta[sucursal] = metadata && metadata.lastUpdate ? metadata : null;

      console.log(`📋 Reglas KOLO cargadas (${sucursal}):`, Object.keys(state.adminRulesPorSucursal[sucursal]).length);
    }

    // Migración: si hay reglas antiguas (una sola bolsa, sin separar por sucursal) y las
    // nuevas todavía están vacías, las movemos a Jiquilisco por defecto para no perder datos.
    const totalNuevas = SUCURSALES.reduce((acc, s) => acc + Object.keys(state.adminRulesPorSucursal[s] || {}).length, 0);
    if (totalNuevas === 0) {
      const legacyData = await firestoreGetDocData("adminRules");
      if (legacyData && legacyData.adminRules && Object.keys(legacyData.adminRules).length > 0) {
        console.warn("⚠️ Migrando reglas antiguas (sin sucursal) a Jiquilisco por defecto");
        state.adminRulesPorSucursal["Jiquilisco"] = legacyData.adminRules;
      }
    }

    activarSucursal(state.sucursalActiva || "Jiquilisco");

    if (typeof applyAdminFilter === "function") {
      applyAdminFilter();
    }
  } catch (e) {
    console.error("Error cargando reglas:", e);
    state.adminRulesPorSucursal = { "Jiquilisco": {}, "Usulután": {} };
    state.adminRules = {};
  }
}

/**
 * Hace que `state.adminRules` apunte (por referencia) al set de reglas de la
 * sucursal indicada, y sincroniza los indicadores visuales (selector, hint de estado).
 */
function activarSucursal(nombre) {
  if (!nombre) return;
  if (!state.adminRulesPorSucursal) state.adminRulesPorSucursal = {};
  if (!state.adminRulesPorSucursal[nombre]) state.adminRulesPorSucursal[nombre] = {};

  state.sucursalActiva = nombre;
  state.adminRules = state.adminRulesPorSucursal[nombre];

  const meta = (state.reglasMeta && state.reglasMeta[nombre]) || null;
  reglasLastUpdate = meta && meta.lastUpdate ? new Date(meta.lastUpdate) : null;
  reglasFileName = meta && meta.fileName ? meta.fileName : (Object.keys(state.adminRules).length > 0 ? "Reglas KOLO existentes" : null);

  console.log(`🏬 Sucursal activa: ${nombre} (${Object.keys(state.adminRules).length} reglas)`);

  updateReglasStatusDisplay();
  updateSucursalSelectorUI();
  updateSucursalUploadUI();
}

/**
 * Sincroniza el <select> de sucursal (panel admin) con state.sucursalActiva,
 * si el elemento existe en el DOM.
 */
function updateSucursalSelectorUI() {
  const select = document.getElementById("sucursalSelector");
  if (select && state.sucursalActiva) {
    select.value = state.sucursalActiva;
  }
}

/**
 * Muestra solo el bloque de carga de archivos correspondiente a la sucursal activa.
 */
function updateSucursalUploadUI() {
  const sucursal = state.sucursalActiva || "Jiquilisco";
  const jiquiliscoRow = document.getElementById("uploadJiquiliscoRow");
  const usulutanRow = document.getElementById("uploadUsulutanRow");

  if (jiquiliscoRow) {
    jiquiliscoRow.style.display = sucursal === "Jiquilisco" ? "flex" : "none";
  }

  if (usulutanRow) {
    usulutanRow.style.display = sucursal === "Usulután" ? "flex" : "none";
  }
}

/**
 * Llamado desde el <select> de sucursal en el panel admin: cambia qué
 * conjunto de reglas se está editando/visualizando.
 */
function onSucursalSelectorChange(nombre) {
  activarSucursal(nombre);
  if (typeof applyAdminFilter === "function") applyAdminFilter();
  setStatus(`📋 Mostrando reglas de: ${nombre}`, false);
}

async function persistRules() {
  const sucursal = state.sucursalActiva || "Jiquilisco";
  const slug = slugSucursal(sucursal);
  const rulesDocName = `adminRules_${slug}`;
  const chunkSize = 250;

  const rulesWithValues = {};
  for (const sku in state.adminRules) {
    const rule = state.adminRules[sku];
    if ((rule.minimo !== "" && rule.minimo !== null && rule.minimo !== undefined) || 
        (rule.maximo !== "" && rule.maximo !== null && rule.maximo !== undefined) ||
        rule.confirmado === true) {
      rulesWithValues[sku] = rule;
    }
  }
  
  console.log(`💾 Guardando ${Object.keys(rulesWithValues).length} SKUs en Firestore (sucursal: ${sucursal})`);
  console.log(`💾 Total SKUs en memoria: ${Object.keys(state.adminRules).length}`);
  
  try {
    const currentManifest = await firestoreGetDocDataStrict(rulesDocName);
    const chunkGeneration = currentManifest.chunked === true && currentManifest.chunkGeneration === "a" ? "b" : "a";
    const entries = Object.entries(rulesWithValues);
    const chunks = [];

    for (let offset = 0; offset < entries.length; offset += chunkSize) {
      chunks.push(Object.fromEntries(entries.slice(offset, offset + chunkSize)));
    }

    const chunkResults = await Promise.all(chunks.map((chunk, index) =>
      firestoreSetDocData(`adminRules_${slug}_${chunkGeneration}_${index}`, { adminRules: chunk }, false)
    ));
    if (chunkResults.some(saved => !saved)) throw new Error("Firestore no confirmó el guardado de todos los fragmentos");

    const manifestSaved = await firestoreSetDocData(rulesDocName, {
      chunked: true,
      chunkGeneration,
      chunkCount: chunks.length,
      totalCount: entries.length
    }, false);
    if (!manifestSaved) throw new Error("Firestore no confirmó el manifiesto de reglas");

    state.adminRulesPorSucursal[sucursal] = state.adminRules;
    console.log(`✅ Reglas guardadas en Firestore (${sucursal}): ${entries.length} SKUs en ${chunks.length} fragmentos`);
    return true;
  } catch (err) {
    console.error("❌ Error guardando en Firestore:", err);
    setStatus(`❌ No se pudieron guardar las reglas de ${sucursal} en Firebase. Revisa tu conexión e inténtalo de nuevo.`, true);
    return false;
  }
}

// ============================================================
// MEMORIA DE PEDIDOS (por sucursal) - Firestore
// ============================================================

/**
 * Carga desde Firestore la memoria del último pedido generado para cada
 * sucursal (solo identificadores de SKU, no el detalle completo).
 */
async function loadPedidoMemoria() {
  state.pedidoMemoriaPorSucursal = state.pedidoMemoriaPorSucursal || {};
  for (const sucursal of SUCURSALES) {
    const slug = slugSucursal(sucursal);
    const data = await firestoreGetDocData(`pedidoMemoria_${slug}`);
    state.pedidoMemoriaPorSucursal[sucursal] = (data && data.skus && data.skus.length) ? data : null;
  }
  console.log("🕘 Memoria de pedidos cargada:", state.pedidoMemoriaPorSucursal);
}

function getPedidoAnteriorSet(sucursal) {
  const memoria = state.pedidoMemoriaPorSucursal && state.pedidoMemoriaPorSucursal[sucursal];
  if (!memoria) return new Map();

  // Retornar Map con SKU -> cantidad para acceso rápido
  const map = new Map();
  if (memoria.cantidades && typeof memoria.cantidades === 'object') {
    // Nueva estructura con cantidades
    Object.entries(memoria.cantidades).forEach(([sku, cantidad]) => {
      if (sku) {
        map.set(String(sku).trim().toUpperCase(), cantidad);
      }
    });
  } else if (Array.isArray(memoria.skus)) {
    // Retrocompatibilidad: si solo tiene array de SKUs, agregar cantidad 0
    memoria.skus.forEach(sku => {
      if (sku) {
        map.set(String(sku).trim().toUpperCase(), 0);
      }
    });
  }
  return map;
}

/**
 * Muestra (vía notificación) qué SKUs se pidieron la última vez para esta
 * sucursal, si existe memoria previa. No bloquea la generación del pedido actual.
 */
function mostrarMemoriaPedidoAnterior(sucursal) {
  const memoria = state.pedidoMemoriaPorSucursal ? state.pedidoMemoriaPorSucursal[sucursal] : null;
  if (!memoria || !memoria.skus || !memoria.skus.length) {
    console.log(`🕘 No hay memoria de pedido anterior para ${sucursal}`);
    return;
  }

  const fecha = memoria.fecha ? new Date(memoria.fecha).toLocaleDateString('es-ES') : "fecha desconocida";
  
  // Crear preview con cantidades si están disponibles
  let preview = "";
  if (memoria.cantidades && typeof memoria.cantidades === 'object') {
    // Nueva estructura con cantidades
    preview = memoria.skus.slice(0, 15).map(sku => {
      const cantidad = memoria.cantidades[sku] || 0;
      return cantidad > 0 ? `${sku} (${cantidad})` : sku;
    }).join(", ");
  } else {
    // Retrocompatibilidad: sin cantidades
    preview = memoria.skus.slice(0, 15).join(", ");
  }
  
  const resto = memoria.skus.length > 15 ? ` y ${memoria.skus.length - 15} más` : "";

  console.log(`🕘 Pedido anterior (${sucursal}, ${fecha}) - ${memoria.skus.length} SKUs:`, memoria.skus);
  mostrarNotificacion(`🕘 Pedido anterior de ${sucursal} (${fecha}): ${memoria.skus.length} productos → ${preview}${resto}`, false);
}

/**
 * Guarda en memoria (state + Firestore) el pedido nuevo o lo acumula al anterior.
 */
async function guardarMemoriaPedidoActual(sucursal, productsToOrder, tipoPedido = "nuevo") {
  const cantidadPorSKU = {};

  if (tipoPedido === "agregado") {
    getPedidoAnteriorSet(sucursal).forEach((cantidad, sku) => {
      cantidadPorSKU[sku] = Number(cantidad) || 0;
    });
  }

  (productsToOrder || []).forEach(p => {
    if (p.SKU) {
      const sku = String(p.SKU).trim().toUpperCase();
      cantidadPorSKU[sku] = (Number(cantidadPorSKU[sku]) || 0) + (Number(p.PedidoSugerido) || 0);
    }
  });

  const skus = Object.keys(cantidadPorSKU);
  const memoria = {
    fecha: new Date().toISOString(),
    skus: skus,
    cantidades: cantidadPorSKU,
    totalItems: skus.length
  };

  try {
    const saved = await firestoreSetDocData(`pedidoMemoria_${slugSucursal(sucursal)}`, memoria, false);
    if (!saved) throw new Error("Firestore no confirmó el guardado de la memoria del pedido");
    if (!state.pedidoMemoriaPorSucursal) state.pedidoMemoriaPorSucursal = {};
    state.pedidoMemoriaPorSucursal[sucursal] = memoria;
    console.log(`💾 Memoria de pedido guardada (${sucursal}, ${tipoPedido}): ${skus.length} SKUs con cantidades`);
    return true;
  } catch (err) {
    console.error("❌ Error guardando memoria de pedido:", err);
    setStatus(`❌ No se pudo guardar el pedido de ${sucursal} en Firebase. No se generó el archivo.`, true);
    return false;
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
    
    const confirmado = state.adminRules[sku]?.confirmado === true;
    
    rows.push({
      SKU: sku,
      Producto: producto || "Sin nombre",
      Minimo: state.adminRules[sku]?.minimo ?? "",
      Maximo: state.adminRules[sku]?.maximo ?? "",
      Confirmado: confirmado
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
  } else if (state.adminActiveFilter === "confirmados") {
    source = source.filter(r => r.Confirmado === true);
  } else if (state.adminActiveFilter === "pendientes") {
    source = source.filter(r => r.Confirmado === false);
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
    else if (state.adminActiveFilter === "confirmados") text = `✅ ${pageRows.length} de ${totalItems} SKUs confirmados`;
    else if (state.adminActiveFilter === "pendientes") text = `⏳ ${pageRows.length} de ${totalItems} SKUs pendientes`;
    filterInfo.textContent = text;
  }
  
  updateReglasStatusDisplay();
}

async function saveRulesFromInputs() {
  if (!state.adminUnlocked) return;
  const inputs = Array.from(document.querySelectorAll("#adminTable tbody input[type='number']"));
  const nextRules = { ...state.adminRules };
  
  inputs.forEach(input => {
    const sku = input.getAttribute("data-sku");
    const role = input.getAttribute("data-role");
    const val = toNumOrNull(input.value);
    
    if (!nextRules[sku]) nextRules[sku] = { minimo: "", maximo: "", producto: "", confirmado: false };
    
    if (val === null) nextRules[sku][role === "min" ? "minimo" : "maximo"] = "";
    else nextRules[sku][role === "min" ? "minimo" : "maximo"] = val;
    
    if (!nextRules[sku].hasOwnProperty('confirmado')) {
      nextRules[sku].confirmado = false;
    }
  });
  
  state.adminRules = nextRules;
  state.adminRulesPorSucursal[state.sucursalActiva || "Jiquilisco"] = nextRules;
  const saved = await persistRules();
  if (!saved) return;
  recalculateRows();
  applyAdminFilter();
  
  reglasLastUpdate = new Date();
  reglasFileName = "Reglas KOLO editadas manualmente";
  updateReglasStatusDisplay();
  
  const sucursal = state.sucursalActiva || "Jiquilisco";
  state.reglasMeta[sucursal] = { lastUpdate: reglasLastUpdate.toISOString(), fileName: reglasFileName, totalCount: Object.keys(state.adminRules).length };
  firestoreSetDocData(`reglasMetadata_${slugSucursal(sucursal)}`, state.reglasMeta[sucursal])
    .catch(e => console.warn("No se pudo guardar metadata de reglas"));
  
  setStatus(`✅ Reglas guardadas correctamente (${sucursal})`, false);
}

async function clearAllRules() {
  if (!state.adminUnlocked) return;
  if (confirm("⚠️ ¿Eliminar SOLO las reglas de mínimos y máximos?\n\nLos SKUs seguirán apareciendo, solo se eliminarán los valores de mínimo y máximo.")) {
    for (const sku in state.adminRules) {
      state.adminRules[sku].minimo = "";
      state.adminRules[sku].maximo = "";
    }
    const saved = await persistRules();
    if (!saved) return;
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
  const skuTrim = newSku.trim().toUpperCase();
  
  if (state.adminRules[skuTrim]) {
    alert(`El SKU "${skuTrim}" ya existe.`);
    return;
  }
  
  let producto = "";
  
  if (state.listaCompleta) {
    const found = state.listaCompleta.find(item => item.CODIGO === skuTrim);
    if (found && found.DESCRIPCION) {
      producto = found.DESCRIPCION;
    }
  }
  
  if (!producto && state.rows) {
    const found = state.rows.find(item => item.SKU === skuTrim);
    if (found && found.Producto) {
      producto = found.Producto;
    }
  }
  
  if (!producto) {
    const nombreIngresado = prompt(
      `No se encontró información del producto "${skuTrim}".\n` +
      `Ingresa el nombre del producto (opcional, presiona Cancelar para usar el SKU como nombre):`
    );
    if (nombreIngresado !== null && nombreIngresado.trim() !== "") {
      producto = nombreIngresado.trim();
    } else if (nombreIngresado === "") {
      producto = skuTrim;
    } else {
      producto = skuTrim;
    }
  }
  
  if (!producto) producto = skuTrim;
  
  let minimo = "";
  let maximo = "";
  const establecerReglas = confirm(
    `¿Deseas establecer valores de mínimo y máximo para "${skuTrim}" ahora?\n` +
    `(Si no, podrás hacerlo más tarde desde la tabla)`
  );
  
  if (establecerReglas) {
    const minInput = prompt(`Ingresa el valor MÍNIMO para "${skuTrim}":`);
    if (minInput !== null && minInput.trim() !== "") {
      const minVal = parseFloat(minInput.trim().replace(/,/g, "."));
      if (!isNaN(minVal) && minVal >= 0) {
        minimo = minVal;
      } else {
        setStatus("⚠️ Valor mínimo inválido, se dejará vacío.", true);
      }
    }
    
    const maxInput = prompt(`Ingresa el valor MÁXIMO para "${skuTrim}":`);
    if (maxInput !== null && maxInput.trim() !== "") {
      const maxVal = parseFloat(maxInput.trim().replace(/,/g, "."));
      if (!isNaN(maxVal) && maxVal >= 0) {
        maximo = maxVal;
      } else {
        setStatus("⚠️ Valor máximo inválido, se dejará vacío.", true);
      }
    }
  }
  
  state.adminRules[skuTrim] = {
    minimo: minimo,
    maximo: maximo,
    producto: producto,
    confirmado: false
  };
  
  persistRules();
  recalculateRows();
  applyAdminFilter();
  
  reglasLastUpdate = new Date();
  reglasFileName = "SKU agregado manualmente";
  updateReglasStatusDisplay();
  
  {
    const sucursal = state.sucursalActiva || "Jiquilisco";
    state.reglasMeta[sucursal] = { lastUpdate: reglasLastUpdate.toISOString(), fileName: reglasFileName, totalCount: Object.keys(state.adminRules).length };
    firestoreSetDocData(`reglasMetadata_${slugSucursal(sucursal)}`, state.reglasMeta[sucursal])
      .catch(e => console.warn("No se pudo guardar metadata de reglas"));
  }
  
  if (!state.listaCompleta.some(item => item.CODIGO === skuTrim)) {
    state.listaCompleta.push({
      CODIGO: skuTrim,
      DESCRIPCION: producto,
      PRECIO_SIN_IVA: state.preciosLookup[skuTrim] || 0
    });
    if (typeof saveListaCompleta === "function") {
      saveListaCompleta();
    }
  }
  
  setStatus(`✅ SKU "${skuTrim}" agregado con nombre "${producto}"${minimo || maximo ? ` (Mín: ${minimo || '-'} / Máx: ${maximo || '-'})` : ''}`, false);
  mostrarNotificacion(`✅ SKU "${skuTrim}" agregado correctamente`, false);
}

// ============================================================
// FUNCIÓN CORREGIDA: IMPORTAR REGLAS - ACTUALIZA NOMBRES
// ============================================================

function parseRulesCsv(text, delimiter) {
  const records = [];
  let cells = [];
  let field = "";
  let quoted = false;
  let trailingDelimiter = false;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field === "") {
      quoted = true;
    } else if (character === delimiter) {
      cells.push(field);
      field = "";
      trailingDelimiter = true;
    } else if (character === "\r" || character === "\n") {
      cells.push(field);
      records.push({ cells, trailingDelimiter });
      cells = [];
      field = "";
      trailingDelimiter = false;
      if (character === "\r" && text[index + 1] === "\n") index++;
    } else {
      field += character;
      trailingDelimiter = false;
    }
  }

  if (field !== "" || cells.length > 0) {
    cells.push(field);
    records.push({ cells, trailingDelimiter });
  }

  return records;
}

function importRulesExcel(sucursal) {
  if (!state.adminUnlocked) {
    alert("Debes iniciar sesión como administrador");
    return;
  }

  sucursal = sucursal || state.sucursalActiva || "Jiquilisco";
  const inputId = sucursal === "Usulután" ? "adminExcelInputUsulutan" : "adminExcelInputJiquilisco";
  const fileInput = document.getElementById(inputId) || document.getElementById("adminExcelInput");
  const file = fileInput.files[0];
  
  if (!file) {
    alert("❌ Por favor selecciona un archivo Excel o CSV primero.");
    return;
  }

  activarSucursal(sucursal);
  
  const reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      let workbook;
      const isCsv = file.name.toLowerCase().endsWith('.csv');
      let rows;
      let csvDelimiter = ",";
      if (isCsv) {
        let text = new TextDecoder("utf-8").decode(new Uint8Array(evt.target.result)).replace(/^\uFEFF/, "");
        const separatorDirective = text.match(/^sep=(.)\r?\n/i);
        if (separatorDirective) {
          csvDelimiter = separatorDirective[1];
          text = text.slice(separatorDirective[0].length);
        }
        rows = parseRulesCsv(text, csvDelimiter);
      } else {
        const data = new Uint8Array(evt.target.result);
        workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      }
      
      if (!rows || rows.length < 2) {
        alert("El archivo no tiene datos");
        fileInput.value = "";
        return;
      }
      
      console.log("📋 Archivo cargado. Total filas:", rows.length);
      
      // DETECCIÓN AUTOMÁTICA DE COLUMNAS
      const headerRow = isCsv ? (rows[0]?.cells || []) : (rows[0] || []);
      console.log("📋 Encabezados encontrados:", headerRow);
      
      let skuCol = -1;
      let prodCol = -1;
      let minCol = -1;
      let maxCol = -1;
      let confirmadoCol = -1;
      
      headerRow.forEach((header, index) => {
        const h = String(header || "").trim().toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        if (h.includes("sku") || h.includes("codigo") || h.includes("cod") || h.includes("item")) {
          if (skuCol === -1) skuCol = index;
          console.log(`✅ Columna SKU encontrada en índice ${index}: "${header}"`);
        }
        if (h.includes("item") || h.includes("producto") || h.includes("descripcion") || h.includes("nombre")) {
          if (prodCol === -1 || h === "item") prodCol = index;
          console.log(`✅ Columna Producto encontrada en índice ${index}: "${header}"`);
        }
        if (h.includes("min") || h.includes("minimo")) {
          if (minCol === -1) minCol = index;
          console.log(`✅ Columna Minimo encontrada en índice ${index}: "${header}"`);
        }
        if (h.includes("max") || h.includes("maximo")) {
          if (maxCol === -1) maxCol = index;
          console.log(`✅ Columna Maximo encontrada en índice ${index}: "${header}"`);
        }
        if (h.includes("actualizo") || h.includes("actualizó") || h.includes("confirmado")) {
          if (confirmadoCol === -1) confirmadoCol = index;
          console.log(`✅ Columna Confirmado encontrada en índice ${index}: "${header}"`);
        }
      });
      
      if (skuCol === -1) { skuCol = 0; console.warn("⚠️ Usando SKU col 0 por defecto"); }
      if (prodCol === -1) { prodCol = 1; console.warn("⚠️ Usando Producto col 1 por defecto"); }
      if (minCol === -1) { minCol = 2; console.warn("⚠️ Usando Minimo col 2 por defecto"); }
      if (maxCol === -1) { maxCol = 3; console.warn("⚠️ Usando Maximo col 3 por defecto"); }
      
      console.log(`📋 Mapa final: SKU=${skuCol}, Producto=${prodCol}, Min=${minCol}, Max=${maxCol}, Confirmado=${confirmadoCol}`);
      
      let importedCount = 0;
      let actualizados = 0;
      let nuevos = 0;
      let errores = [];
      
      for (let i = 1; i < rows.length; i++) {
        let row = isCsv ? rows[i].cells.slice() : rows[i];
        if (isCsv) {
          if (rows[i].trailingDelimiter) row.pop();
          const shiftedColumns = row.length - headerRow.length;
          if (shiftedColumns > 0) {
            const productEnd = minCol + shiftedColumns;
            row[prodCol] = row.slice(prodCol, productEnd).join(csvDelimiter).trim();
            row[minCol] = row[minCol + shiftedColumns];
            row[maxCol] = row[maxCol + shiftedColumns];
            if (confirmadoCol !== -1) {
              row[confirmadoCol] = row[confirmadoCol + shiftedColumns];
            }
          }
        }
        if (!row) continue;
        
        const tieneDatos = row.some(cell => String(cell || "").trim() !== "");
        if (!tieneDatos) continue;
        
        let sku = "";
        if (row[skuCol] !== undefined && row[skuCol] !== null && row[skuCol] !== "") {
          sku = String(row[skuCol]).trim().toUpperCase();
        }
        
        if (!sku) continue;
        
        let producto = "";
        if (row[prodCol] !== undefined && row[prodCol] !== null && row[prodCol] !== "") {
          producto = String(row[prodCol]).trim();
        }
        
        // minimo/maximo: null = "celda vacía en el Excel" -> borrar la regla existente.
        // undefined = "columna no existe o valor no numérico" -> no tocar lo que ya había.
        let minimo = undefined;
        if (row[minCol] !== undefined && row[minCol] !== null) {
          const minRaw = String(row[minCol]).trim();
          if (minRaw === "") {
            minimo = null;
          } else {
            const minVal = minRaw.replace(/,/g, ".");
            if (!isNaN(Number(minVal)) && Number(minVal) >= 0) {
              minimo = Number(minVal);
            }
          }
        }
        
        let maximo = undefined;
        if (row[maxCol] !== undefined && row[maxCol] !== null) {
          const maxRaw = String(row[maxCol]).trim();
          if (maxRaw === "") {
            maximo = null;
          } else {
            const maxVal = maxRaw.replace(/,/g, ".");
            if (!isNaN(Number(maxVal)) && Number(maxVal) >= 0) {
              maximo = Number(maxVal);
            }
          }
        }
        
        let confirmado = null;
        if (confirmadoCol !== -1 && row[confirmadoCol] !== undefined && row[confirmadoCol] !== null && row[confirmadoCol] !== "") {
          const val = String(row[confirmadoCol]).trim().toUpperCase();
          confirmado = (val === "SI" || val === "TRUE" || val === "1" || val === "SÍ");
        }
        
        const existe = state.adminRules[sku] !== undefined && state.adminRules[sku] !== null;
        
        if (existe) {
          if (producto) {
            state.adminRules[sku].producto = producto;
          }
          // minimo === null -> celda vacía en el Excel: la regla se pone en 0.
          // minimo es número -> actualizar. minimo === undefined -> no tocar.
          if (minimo === null) {
            state.adminRules[sku].minimo = 0;
          } else if (minimo !== undefined && !isNaN(minimo)) {
            state.adminRules[sku].minimo = minimo;
          }
          if (maximo === null) {
            state.adminRules[sku].maximo = 0;
          } else if (maximo !== undefined && !isNaN(maximo)) {
            state.adminRules[sku].maximo = maximo;
          }
          if (confirmado !== null) {
            state.adminRules[sku].confirmado = confirmado;
          }
          actualizados++;
        } else {
          state.adminRules[sku] = {
            minimo: (minimo !== undefined && !isNaN(minimo)) ? (minimo === null ? 0 : minimo) : "",
            maximo: (maximo !== undefined && !isNaN(maximo)) ? (maximo === null ? 0 : maximo) : "",
            producto: producto || sku,
            confirmado: confirmado || false
          };
          nuevos++;
        }
        
        importedCount++;
        
        if (importedCount % 1000 === 0) {
          console.log(`📦 Procesados ${importedCount} SKUs...`);
        }
      }
      
      console.log(`✅ Total procesados: ${importedCount} SKUs`);
      console.log(`📊 Nuevos: ${nuevos}, Actualizados: ${actualizados}`);
      
      const saved = await persistRules();
      if (!saved) throw new Error("No se pudieron guardar las reglas en Firebase");
      
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
      
      if (typeof applyAdminFilter === "function") {
        applyAdminFilter();
      }
      
      updateReglasStatusDisplay();
      
      reglasLastUpdate = new Date();
      reglasFileName = file.name;
      
      state.reglasMeta[sucursal] = { lastUpdate: reglasLastUpdate.toISOString(), fileName: file.name, totalCount: Object.keys(state.adminRules).length };
      await firestoreSetDocData(`reglasMetadata_${slugSucursal(sucursal)}`, state.reglasMeta[sucursal])
        .catch(e => console.warn("No se pudo guardar metadata de reglas"));
      
      fileInput.value = "";
      
      let mensaje = `✅ [${sucursal}] Procesados ${importedCount} SKUs.\n📊 Nuevos: ${nuevos}\n🔄 Actualizados: ${actualizados}`;
      if (actualizados > 0) {
        mensaje += `\n📝 Nombres actualizados para ${actualizados} SKUs.`;
      }
      alert(mensaje);
      setStatus(mensaje, false);
      
      if (typeof recalculateRows === "function") {
        recalculateRows();
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

    let templateBase64 = localStorage.getItem('tecnobahia_pedido_template_base64');
    let templateName = localStorage.getItem('tecnobahia_pedido_template_name');
    
    if (!templateBase64) {
      const templateData = await firestoreGetDocData("pedidoTemplate");
      if (templateData && templateData.pedidoTemplateBase64) {
        templateBase64 = templateData.pedidoTemplateBase64;
        templateName = templateData.pedidoTemplateName;
        
        if (templateBase64) {
          localStorage.setItem('tecnobahia_pedido_template_base64', templateBase64);
          localStorage.setItem('tecnobahia_pedido_template_name', templateName);
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
      let workbook;
      const fileNameLower = (file.name || "").toLowerCase();
      if (fileNameLower.endsWith('.csv')) {
        const text = typeof evt.target.result === 'string'
          ? evt.target.result
          : new TextDecoder('utf-8').decode(evt.target.result);
        workbook = XLSX.read(text, { type: 'string' });
      } else {
        const data = new Uint8Array(evt.target.result);
        workbook = XLSX.read(data, { type: 'array' });
      }
      
      let sheetName = workbook.SheetNames[0];
      let headerRowIndex = 0;
      let bestMatch = { sheetName, headerRowIndex, score: -1, type: null };

      const keywordMatches = (cell) => {
        const hNorm = norm(String(cell || ""));
        return {
          isSku: ['codigo', 'sku', 'clave', 'código', 'artículo', 'articulo', 'item'].some(k => hNorm === k),
          isDesc: ['descripcion', 'producto', 'nombre', 'articulo', 'artículo', 'item'].some(k => hNorm === k),
          isUnitarioExact: hNorm === 'costo unitario' || hNorm === 'precio unitario',
          isUnitario: hNorm.includes('unitario') || hNorm.includes('costo unitario') || hNorm.includes('precio unitario') || hNorm === 'costo' || hNorm === 'precio',
          isPadConIva: hNorm.includes('pad') && hNorm.includes('con') && hNorm.includes('iva'),
          isPadSinIva: hNorm.includes('pad') && hNorm.includes('sin') && hNorm.includes('iva')
        };
      };

      const getHeaderRowInfo = (row) => {
        const info = {
          skuCols: [],
          descCols: [],
          unitarioExactCols: [],
          unitarioCols: [],
          padConCols: [],
          padSinCols: []
        };

        row.forEach((cell, idx) => {
          const { isSku, isDesc, isUnitarioExact, isUnitario, isPadConIva, isPadSinIva } = keywordMatches(cell);
          if (isSku) info.skuCols.push(idx);
          if (isDesc) info.descCols.push(idx);
          if (isUnitarioExact) info.unitarioExactCols.push(idx);
          if (isUnitario) info.unitarioCols.push(idx);
          if (isPadConIva) info.padConCols.push(idx);
          if (isPadSinIva) info.padSinCols.push(idx);
        });

        info.hasSku = info.skuCols.length > 0;
        info.hasUnitarioExact = info.unitarioExactCols.length > 0;
        info.hasUnitario = info.unitarioCols.length > 0;
        info.hasPad = info.padConCols.length > 0 || info.padSinCols.length > 0;

        if (info.hasSku && info.hasUnitarioExact) {
          info.type = 'sku-unitario-exact';
          info.score = 300 + info.skuCols.length * 5 + info.unitarioExactCols.length * 10 + info.descCols.length;
        } else if (info.hasSku && info.hasUnitario) {
          info.type = 'sku-unitario';
          info.score = 220 + info.skuCols.length * 5 + info.unitarioCols.length * 5 + info.descCols.length;
        } else if (info.hasSku && info.hasPad) {
          info.type = 'sku-pad';
          info.score = 140 + info.skuCols.length * 5 + (info.padConCols.length + info.padSinCols.length) * 3 + info.descCols.length;
        } else if (info.hasUnitarioExact) {
          info.type = 'unitario-exact';
          info.score = 90 + info.unitarioExactCols.length * 5 + info.descCols.length;
        } else if (info.hasUnitario) {
          info.type = 'unitario';
          info.score = 60 + info.unitarioCols.length * 2 + info.descCols.length;
        } else {
          info.type = 'other';
          info.score = 0;
        }

        return info;
      };

      const headerCandidates = [];
      for (const name of workbook.SheetNames) {
        const sheet = workbook.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        for (let i = 0; i < Math.min(200, rows.length); i++) {
          const row = Array.isArray(rows[i]) ? rows[i] : [];
          if (!row.some(cell => String(cell || "").trim())) continue;
          const info = getHeaderRowInfo(row);
          if (info.score <= 0) continue;
          headerCandidates.push({ sheetName: name, headerRowIndex: i, score: info.score, type: info.type, info });
        }
      }

      headerCandidates.sort((a, b) => b.score - a.score);
      if (headerCandidates.length > 0) {
        bestMatch = headerCandidates[0];
      }

      sheetName = bestMatch.sheetName;
      headerRowIndex = bestMatch.headerRowIndex;
      console.log(`📌 Mejor fila de encabezado: hoja='${sheetName}', fila=${headerRowIndex + 1}, tipo=${bestMatch.type}, puntaje=${bestMatch.score}`);
      const sheet = workbook.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      
      if (!aoa.length) {
        setStatus("No se encontraron datos en el archivo.", true);
        fileInput.value = "";
        return;
      }
      
      const headerRow = (aoa[headerRowIndex] || []).map((h, idx) => String(h || "").trim() || `Col_${idx + 1}`);
      console.log(`📋 Cabecera detectada en hoja '${sheetName}', fila ${headerRowIndex + 1}:`, headerRow);
      console.log(`📋 Cabecera detectada en hoja '${sheetName}', fila ${headerRowIndex + 1}:`, headerRow);
      
      let codigoCol = null;
      let descCol = null;
      let precioColPADConIva = null;
      let precioColPADSinIva = null;
      let precioColUnitario = null;
      
      // Primera pasada: coincidencia EXACTA (evita que "nuevo SKU" o "Codigo de barra"
      // pisen a la columna real "sku"/"codigo")
      headerRow.forEach((header, idx) => {
        const hNorm = norm(header);
        if (hNorm === "sku" || hNorm === "codigo" || hNorm === "clave") codigoCol = idx;
        if (hNorm === "nombre" || hNorm === "descripcion" || hNorm === "producto") descCol = idx;
        if (hNorm === "costo unitario" || hNorm === "precio unitario" || hNorm === "unitario") precioColUnitario = idx;
      });

      // Segunda pasada: respaldo con .includes() SOLO para lo que no se encontró exacto
      headerRow.forEach((header, idx) => {
        const hNorm = norm(header);
        if (codigoCol === null && (hNorm.includes("codigo") || hNorm.includes("sku") || hNorm.includes("clave"))) codigoCol = idx;
        if (descCol === null && (hNorm.includes("descripcion") || hNorm.includes("producto") || hNorm.includes("nombre"))) descCol = idx;
        if (precioColUnitario === null && ((hNorm.includes("costo") && hNorm.includes("unitario")) || (hNorm.includes("precio") && hNorm.includes("unitario")) || hNorm === "unitario")) {
          precioColUnitario = idx;
        }
        if (precioColPADConIva === null && hNorm.includes("pad") && hNorm.includes("con") && hNorm.includes("iva")) precioColPADConIva = idx;
        if (precioColPADSinIva === null && hNorm.includes("pad") && hNorm.includes("sin") && hNorm.includes("iva")) precioColPADSinIva = idx;
      });
      
      console.log(`📌 Columnas detectadas: codigo=${codigoCol}, descripcion=${descCol}, costo unitario=${precioColUnitario}, pad con iva=${precioColPADConIva}, pad sin iva=${precioColPADSinIva}`);
      
      if (codigoCol === null || (precioColUnitario === null && precioColPADConIva === null && precioColPADSinIva === null)) {
        setStatus("❌ No se encontraron las columnas necesarias", true);
        fileInput.value = "";
        return;
      }
      
      const useUnitPrice = precioColUnitario !== null;
      const formatName = useUnitPrice ? 'costo unitario / precio unitario' : 'PAD';
      
      state.listaCompleta = [];
      state.preciosLookup = {};
      let processedCount = 0;
      let errores = [];
      
      for (let i = headerRowIndex + 1; i < aoa.length; i++) {
        const rowArr = aoa[i] || [];
        if (!rowArr.some(v => String(v || "").trim() !== "")) continue;
        
        const codigo = String(rowArr[codigoCol] || "").trim().toUpperCase();
        const descripcion = descCol !== null ? String(rowArr[descCol] || "").trim() : "";
        
        let precioConIva = 0;
        if (useUnitPrice) {
          precioConIva = toNum(rowArr[precioColUnitario]);
        } else if (precioColPADConIva !== null) {
          precioConIva = toNum(rowArr[precioColPADConIva]);
        } else {
          precioConIva = Math.round(toNum(rowArr[precioColPADSinIva]) * 1.14 * 100) / 100;
        }
        
        if (precioConIva > 1140) {
          errores.push(`${codigo}: ${precioConIva} - precio alto`);
        }
        
        if (!codigo) continue;
        
        const item = {
          CODIGO: codigo,
          DESCRIPCION: descripcion,
          PRECIO_CON_IVA: precioConIva
        };
        if (useUnitPrice) item.PRECIO_UNITARIO = precioConIva;
        
        state.listaCompleta.push(item);
        state.preciosLookup[codigo] = precioConIva;
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
      
      let mensaje = `✅ ${processedCount} precios cargados exitosamente (${formatName}).`;
      if (errores.length > 0) {
        mensaje += ` ⚠️ Se detectaron ${errores.length} precios altos. Verifica el listado de precios.`;
      }
      setStatus(mensaje, false);
      updatePreciosStatusDisplay(processedCount);
      
    } catch (err) {
      console.error(err);
      setStatus("Error al cargar precios.", true);
      fileInput.value = "";
    }
  };
  if ((file.name || "").toLowerCase().endsWith('.csv')) {
    reader.readAsText(file, 'UTF-8');
  } else {
    reader.readAsArrayBuffer(file);
  }
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
    
    try {
      const testWorkbook = XLSX.read(arrayBuffer, { type: "array" });
      const hasPedidoSheet = testWorkbook.SheetNames.some(name => 
        name.toLowerCase() === "pedido" || name.toLowerCase().includes("pedido")
      );
      
      if (!hasPedidoSheet) {
        setStatus("❌ La plantilla debe contener una hoja llamada 'PEDIDO'", true);
        fileInput.value = "";
        return;
      }
    } catch (e) {
      setStatus("❌ El archivo no es un Excel válido.", true);
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
    console.log("📄 Tamaño base64:", base64.length);
    
    updateTemplateStatusDisplay();
    
    fileInput.value = "";
    
    setStatus(`✅ Plantilla "${file.name}" subida con éxito.`, false);
    if (typeof updateExportButtonState === "function") {
      updateExportButtonState();
    }
    
    mostrarNotificacion(`✅ Plantilla "${file.name}" cargada correctamente`, false);
    
  } catch (error) {
    console.error("Error al subir plantilla:", error);
    setStatus("❌ Error al procesar el archivo. Verifica que sea un Excel válido.", true);
    fileInput.value = "";
  }
}

function getPedidoWorkbook() {
  if (!state.pedidoTemplateBase64) return null;
  try {
    const binaryString = atob(state.pedidoTemplateBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return XLSX.read(bytes, { 
      type: 'array',
      cellDates: true,
      cellStyles: true
    });
  } catch (e) {
    console.error("Error leyendo plantilla PEDIDO:", e);
    return null;
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
  const hasTemplate = state.pedidoTemplateLoaded === true && state.pedidoTemplateBase64 !== null;
  
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
// SECCIÓN 7: CONFIRMACIÓN DE REGLAS (CHECKBOXES)
// ============================================================

function toggleConfirmacionRegla(sku) {
  if (!state.adminRules[sku]) return;
  
  state.adminRules[sku].confirmado = !state.adminRules[sku].confirmado;
  
  persistRules();
  applyAdminFilter();
  
  const estado = state.adminRules[sku].confirmado ? '✅ confirmado' : '❌ sin confirmar';
  console.log(`📌 SKU ${sku}: ${estado}`);
}

function getConfirmacionStatus(sku) {
  if (!state.adminRules[sku]) return false;
  return state.adminRules[sku].confirmado === true;
}

function marcarTodosConfirmados() {
  if (!state.adminUnlocked) return;
  
  const total = Object.keys(state.adminRules).length;
  if (total === 0) {
    setStatus("⚠️ No hay SKUs para marcar.", true);
    return;
  }
  
  if (!confirm(`¿Marcar todos los ${total} SKUs como CONFIRMADOS?`)) return;
  
  for (const sku in state.adminRules) {
    state.adminRules[sku].confirmado = true;
  }
  
  persistRules();
  applyAdminFilter();
  setStatus(`✅ ${total} SKUs marcados como confirmados`, false);
  mostrarNotificacion(`✅ ${total} SKUs confirmados`, false);
}

function desmarcarTodosConfirmados() {
  if (!state.adminUnlocked) return;
  
  const total = Object.keys(state.adminRules).length;
  if (total === 0) {
    setStatus("⚠️ No hay SKUs para desmarcar.", true);
    return;
  }
  
  if (!confirm(`¿Desmarcar todos los ${total} SKUs como NO CONFIRMADOS?`)) return;
  
  for (const sku in state.adminRules) {
    state.adminRules[sku].confirmado = false;
  }
  
  persistRules();
  applyAdminFilter();
  setStatus(`✅ ${total} SKUs desmarcados`, false);
  mostrarNotificacion(`✅ ${total} SKUs desmarcados`, false);
}

// ============================================================
// FUNCIÓN CORREGIDA: DESCARGAR MIN-MAX CON CONFIRMACIÓN Y NOMBRES
// ============================================================

function downloadMinMaxWithConfirmation() {
  if (!state.adminUnlocked) return;
  
  const skus = Object.keys(state.adminRules);
  
  if (skus.length === 0) {
    setStatus("⚠️ No hay SKUs para exportar.", true);
    return;
  }
  
  try {
    const data = [];
    
    data.push([
      "sku", 
      "item", 
      "minimo", 
      "maximo", 
      "Se actualizó"
    ]);
    
    skus.sort((a, b) => a.localeCompare(b));
    
    for (const sku of skus) {
      const rule = state.adminRules[sku];
      const confirmado = rule.confirmado === true;
      
      data.push([
        sku,
        rule.producto || sku,
        rule.minimo !== "" && rule.minimo !== null && rule.minimo !== undefined ? rule.minimo : "",
        rule.maximo !== "" && rule.maximo !== null && rule.maximo !== undefined ? rule.maximo : "",
        confirmado ? "SI" : "NO"
      ]);
    }
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    ws['!cols'] = [
      { wch: 20 },  // sku
      { wch: 50 },  // item (NOMBRE - más ancho)
      { wch: 12 },  // minimo
      { wch: 12 },  // maximo
      { wch: 15 }   // Se actualizó
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, "MIN_MAX_KOLO");
    
    const today = new Date();
    const fecha = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const nombreArchivo = `min_max_confirmados_${fecha}.xlsx`;
    
    XLSX.writeFile(wb, nombreArchivo);
    
    const confirmados = skus.filter(sku => state.adminRules[sku].confirmado === true).length;
    
    setStatus(`📥 Archivo descargado: ${skus.length} SKUs (${confirmados} confirmados, ${skus.length - confirmados} sin confirmar)`, false);
    mostrarNotificacion(`✅ Archivo generado: ${skus.length} SKUs`, false);
    
  } catch (error) {
    console.error("Error al descargar:", error);
    setStatus("❌ Error al generar el archivo.", true);
  }
}

// ============================================================
// SECCIÓN 8: RENDER ADMIN TABLE (CON PRODUCTO EDITABLE)
// ============================================================

function renderAdminTable(data) {
  const tbody = document.querySelector("#adminTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px;">No hay SKUs registrados</td></tr>';
    return;
  }
  
  data.forEach(r => {
    const tr = document.createElement("tr");
    const nombreProducto = r.Producto && r.Producto !== "" ? r.Producto : "Sin nombre";
    
    const confirmado = getConfirmacionStatus(r.SKU);
    const checked = confirmado ? 'checked' : '';
    
    tr.innerHTML = `
      <td><strong>${escapeHtml(r.SKU)}</strong></td>
      <td>
        <input type="text" 
               class="producto-edit-input" 
               data-sku="${escapeHtml(r.SKU)}" 
               value="${escapeHtml(nombreProducto)}"
               style="width:100%; min-width:200px; padding:4px 8px; border:1px solid var(--border); border-radius:4px; background:var(--bg-secondary); color:var(--text); font-size:13px;"
               placeholder="Ingrese el nombre del producto"
               title="Haz clic para editar el nombre">
      </td>
      <td><input type="number" min="0" step="1" data-role="min" data-sku="${escapeHtml(r.SKU)}" value="${escapeHtml(r.Minimo)}" style="width:80px; padding:4px; border:1px solid var(--border); border-radius:4px; background:var(--bg-secondary); color:var(--text);"></td>
      <td><input type="number" min="0" step="1" data-role="max" data-sku="${escapeHtml(r.SKU)}" value="${escapeHtml(r.Maximo)}" style="width:80px; padding:4px; border:1px solid var(--border); border-radius:4px; background:var(--bg-secondary); color:var(--text);"></td>
      <td style="text-align: center;">
        <input type="checkbox" 
               class="confirm-checkbox" 
               data-sku="${escapeHtml(r.SKU)}" 
               ${checked}
               style="width: 20px; height: 20px; cursor: pointer; accent-color: #22c55e;">
        <span style="font-size: 11px; color: var(--text-secondary); display: block; margin-top: 2px;">
          ${confirmado ? '✅ Confirmado' : '⬜ Pendiente'}
        </span>
      </td>
      <td><button class="btn-secondary" style="background:var(--danger); color:white; padding:4px 10px; cursor:pointer; border:none; border-radius:4px; font-size:13px;" data-delete-sku="${escapeHtml(r.SKU)}">🗑</button></td>
    `;
    tbody.appendChild(tr);
  });

  // Evento: Guardar nombre al perder el foco o presionar Enter
  document.querySelectorAll("#adminTable tbody input[type='number']").forEach(input => {
    input.addEventListener('change', saveRulesFromInputs);
  });

  document.querySelectorAll('.producto-edit-input').forEach(input => {
    input.addEventListener('blur', function(e) {
      guardarNombreProducto(this);
    });
    
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.blur();
      }
      if (e.key === 'Escape') {
        const sku = this.getAttribute('data-sku');
        const nombreOriginal = state.adminRules[sku]?.producto || sku;
        this.value = nombreOriginal;
        this.blur();
      }
    });
    
    input.addEventListener('focus', function(e) {
      this.style.borderColor = 'var(--primary)';
      this.style.boxShadow = '0 0 0 2px rgba(22, 93, 255, 0.2)';
      this.select();
    });
    
    input.addEventListener('blur', function(e) {
      this.style.borderColor = 'var(--border)';
      this.style.boxShadow = 'none';
    });
  });

  // Event listener para checkboxes
  document.querySelectorAll('.confirm-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', function(e) {
      const sku = this.getAttribute('data-sku');
      if (state.adminRules[sku]) {
        state.adminRules[sku].confirmado = this.checked;
        persistRules();
        
        const parentTd = this.closest('td');
        const statusSpan = parentTd.querySelector('span');
        if (statusSpan) {
          statusSpan.textContent = this.checked ? '✅ Confirmado' : '⬜ Pendiente';
        }
        
        console.log(`📌 SKU ${sku}: ${this.checked ? 'CONFIRMADO' : 'SIN CONFIRMAR'}`);
      }
    });
  });

  // Event listener para botones de eliminar
  document.querySelectorAll('[data-delete-sku]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sku = btn.getAttribute('data-delete-sku');
      if (confirm(`Eliminar reglas para el SKU "${sku}"?`)) {
        delete state.adminRules[sku];
        persistRules();
        recalculateRows();
        applyAdminFilter();
        updateReglasStatusDisplay();
        setStatus(`Reglas eliminadas para ${sku}`);
      }
    });
  });
}

// ============================================================
// FUNCIÓN AUXILIAR: Guardar nombre del producto
// ============================================================

function guardarNombreProducto(input) {
  const sku = input.getAttribute('data-sku');
  const nuevoNombre = input.value.trim();
  
  if (!nuevoNombre) {
    mostrarNotificacion("⚠️ El nombre no puede estar vacío", true);
    const nombreActual = state.adminRules[sku]?.producto || sku;
    input.value = nombreActual;
    return;
  }
  
  const nombreActual = state.adminRules[sku]?.producto || sku;
  if (nuevoNombre === nombreActual) return;
  
  if (state.adminRules[sku]) {
    state.adminRules[sku].producto = nuevoNombre;
  } else {
    state.adminRules[sku] = {
      minimo: "",
      maximo: "",
      producto: nuevoNombre,
      confirmado: false
    };
  }
  
  if (typeof persistRules === "function") {
    persistRules();
  }
  
  if (typeof recalculateRows === "function") {
    recalculateRows();
  }
  
  if (typeof applyAdminFilter === "function") {
    applyAdminFilter();
  }
  
  console.log(`📝 Nombre actualizado para SKU ${sku}: "${nuevoNombre}"`);
  mostrarNotificacion(`✅ Nombre actualizado: "${nuevoNombre}"`, false);
}

function renderAdminPagination(currentPage, totalPages, totalItems) {
  const paginationEl = document.getElementById('adminPagination');
  if (!paginationEl) return;
  paginationEl.innerHTML = '';
  
  if (totalPages <= 1) {
    paginationEl.textContent = totalItems ? `Página ${currentPage} de ${totalPages} — ${totalItems} SKUs` : '';
    return;
  }

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '« Anterior';
  prevBtn.disabled = currentPage <= 1;
  prevBtn.addEventListener('click', () => {
    state.adminPage = Math.max(1, state.adminPage - 1);
    if (typeof applyAdminFilter === "function") applyAdminFilter();
  });

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Siguiente »';
  nextBtn.disabled = currentPage >= totalPages;
  nextBtn.addEventListener('click', () => {
    state.adminPage = Math.min(totalPages, state.adminPage + 1);
    if (typeof applyAdminFilter === "function") applyAdminFilter();
  });

  const pageInfo = document.createElement('span');
  pageInfo.className = 'page-info';
  pageInfo.textContent = `Página ${currentPage} de ${totalPages} — ${totalItems} SKUs`;

  function createPageButton(page) {
    const btn = document.createElement('button');
    btn.textContent = page;
    btn.disabled = page === currentPage;
    if (page !== currentPage) {
      btn.addEventListener('click', () => {
        state.adminPage = page;
        if (typeof applyAdminFilter === "function") applyAdminFilter();
      });
    }
    return btn;
  }

  paginationEl.appendChild(prevBtn);
  if (currentPage > 2) paginationEl.appendChild(createPageButton(1));
  if (currentPage > 3) {
    const ellipsis = document.createElement('span');
    ellipsis.textContent = '...';
    ellipsis.style.padding = '0 6px';
    paginationEl.appendChild(ellipsis);
  }
  for (let page = Math.max(1, currentPage - 1); page <= Math.min(totalPages, currentPage + 1); page++) {
    paginationEl.appendChild(createPageButton(page));
  }
  if (currentPage < totalPages - 2) {
    const ellipsis = document.createElement('span');
    ellipsis.textContent = '...';
    ellipsis.style.padding = '0 6px';
    paginationEl.appendChild(ellipsis);
  }
  if (currentPage < totalPages) paginationEl.appendChild(createPageButton(totalPages));
  paginationEl.appendChild(nextBtn);
  paginationEl.appendChild(pageInfo);
}

// ============================================================
// FUNCIÓN PARA ELIMINAR TODOS LOS ITEMS (SKUs)
// ============================================================

async function clearAllItems() {
  if (!state.adminUnlocked) return;

  const sucursal = state.sucursalActiva || "Jiquilisco";
  const confirmed = confirm(`⚠️ ¡ADVERTENCIA! ⚠️\n\nEsta acción ELIMINARÁ TODOS los SKUs de la sucursal "${sucursal}".\n\nSe eliminarán (solo para ${sucursal}):\n- Todos los SKUs (con o sin reglas)\n- Todas las reglas de mínimos y máximos\n- Todos los estados de confirmación\n\nLa otra sucursal no se ve afectada. Esta acción NO se puede deshacer.\n\n¿Estás SEGURO?`);
  
  if (!confirmed) return;
  
  try {
    setStatus(`🗑️ Eliminando todos los SKUs de ${sucursal}...`, false);
    
    state.adminRulesPorSucursal[sucursal] = {};
    state.adminRules = state.adminRulesPorSucursal[sucursal];
    
    await persistRules();
    
    state.reglasMeta[sucursal] = { lastUpdate: new Date().toISOString(), fileName: "Todos los SKUs eliminados", totalCount: 0 };
    await firestoreSetDocData(`reglasMetadata_${slugSucursal(sucursal)}`, state.reglasMeta[sucursal])
      .catch(e => console.warn("No se pudo guardar metadata de reglas"));
    
    recalculateRows();
    applyAdminFilter();
    
    reglasLastUpdate = new Date();
    reglasFileName = "Todos los SKUs eliminados";
    updateReglasStatusDisplay();
    
    if (typeof applyFilterAndSearch === "function") {
      applyFilterAndSearch();
    }
    
    setStatus(`✅ Todos los SKUs de ${sucursal} han sido eliminados`, false);
    mostrarNotificacion(`✅ Se eliminaron todos los SKUs de ${sucursal}`, false);
    
  } catch (error) {
    console.error("Error al eliminar items:", error);
    setStatus("❌ Error al eliminar los SKUs", true);
  }
}

// ============================================================
// FUNCIÓN PARA LIMPIAR LA PLANTILLA
// ============================================================

function clearPedidoTemplate() {
  if (!state.adminUnlocked) return;
  if (confirm("⚠️ ¿Eliminar la plantilla de pedido actual?")) {
    state.pedidoTemplateBase64 = null;
    state.pedidoTemplateLoaded = false;
    state.pedidoTemplateName = null;
    
    localStorage.removeItem('tecnobahia_pedido_template_base64');
    localStorage.removeItem('tecnobahia_pedido_template_name');
    localStorage.removeItem('tecnobahia_pedido_template_date');
    
    firestoreSetDocData("pedidoTemplate", {
      pedidoTemplateBase64: null,
      pedidoTemplateName: null,
      uploadedAt: null
    }).catch(e => console.warn("No se pudo limpiar en Firestore:", e));
    
    updateTemplateStatusDisplay();
    if (typeof updateExportButtonState === "function") {
      updateExportButtonState();
    }
    setStatus("✅ Plantilla eliminada", false);
  }
}