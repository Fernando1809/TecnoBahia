// js/app.js

// 🚨 SALVAVIDAS: Si por alguna razón tu proyecto no encuentra esta función en otros archivos, 
// este bloque evita que el código se rompa por completo.
if (typeof window.showStatusMessage !== "function") {
  window.showStatusMessage = function(msg, type) {
    const statusEl = document.getElementById("status");
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.style.display = "block";
      statusEl.className = type === "error" ? "error-msg" : "success-msg"; // Ajusta según tus clases CSS
    }
  };
}

if (typeof window.setStatus !== "function") {
  window.setStatus = function(msg) {
    const statusEl = document.getElementById("status");
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.style.display = "block";
    }
  };
}

/**
 * Maneja el evento de selección/arrastre de archivos de inventario.
 * Procesa el Workbook, autodetecta el origen y activa la recalculación.
 */
function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  showStatusMessage("Procesando archivo de inventario...", "info");
  
  const reader = new FileReader();
  
  reader.onload = function(evt) {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const mainSheet = chooseMainSheet(workbook);
      
      // Heurística de detección geográfica (Jiquilisco / Usulután)
      state.inventoryOrigin = detectInventoryOrigin(workbook, file.name);
      const originText = state.inventoryOrigin ? ` Origen: ${state.inventoryOrigin}.` : " Origen: desconocido.";
      
      const json = parseSheetWithAutoHeader(workbook.Sheets[mainSheet]);
      if (!json.length) { 
        showStatusMessage("La hoja está vacía.", "error");
        return; 
      }
      
      const headers = Object.keys(json[0]);
      const map = getColumnMap(headers);
      if (!map.sku || !map.inventario) { 
        showStatusMessage("Faltan columnas esenciales: SKU o Inventario/Existencia", "error");
        return; 
      }
      
      state.rawJson = json;
      state.columnMap = map;
      
      // 🔄 Ejecuta el motor de reabastecimiento nativo de tu proyecto (engine.js)
      if (typeof recalculateRows === "function") {
        recalculateRows();
      }
      
      if (typeof updateExportButtonState === "function") updateExportButtonState();
      
      // Mensaje de éxito final estructurado
      const totalRegistros = state.rows ? state.rows.length : json.length;
      const msgExito = `✅ Inventario cargado. Hoja: "${mainSheet}".${originText} Registros: ${totalRegistros}.`;
      
      showStatusMessage(msgExito, "success");
    } catch (err) { 
      console.error(err); 
      showStatusMessage("Error al leer el archivo de inventario.", "error");
    }
  };
  reader.readAsArrayBuffer(file);
}

/**
 * Exporta los resultados filtrando únicamente productos que requieren reorden (PedidoSugerido > 0).
 * Limpia celdas viejas, escribe metadatos (fecha, origen) y escribe fórmulas evaluables en Excel.
 */
function exportResults() {
  if (!state.rows || !state.rows.length) {
    showStatusMessage("Carga el inventario primero.", "error");
    return;
  }
  if (!state.pedidoTemplateLoaded) {
    showStatusMessage("Carga la plantilla PEDIDO antes de exportar.", "error");
    return;
  }

  const productsToOrder = state.rows.filter(r => r.PedidoSugerido > 0);
  const wb = getPedidoWorkbook(); 
  if (!wb) {
    showStatusMessage("No se pudo leer la plantilla PEDIDO maestra.", "error");
    return;
  }

  const pedidoSheetName = wb.SheetNames.includes("PEDIDO") ? "PEDIDO" : wb.SheetNames[0];
  const wsPedido = wb.Sheets[pedidoSheetName];
  if (!wsPedido) {
    showStatusMessage("No se encontró la hoja llamada 'PEDIDO' dentro de la plantilla.", "error");
    return;
  }

  const today = new Date();
  wsPedido["D5"] = { t: "d", v: today, z: "dd/mm/yyyy" };
  if (state.inventoryOrigin) {
    wsPedido["D6"] = { t: "s", v: state.inventoryOrigin };
  }

  for (let row = 8; row <= 107; row++) {
    ["B", "C", "D", "E", "F", "G"].forEach(col => delete wsPedido[`${col}${row}`]);
  }

  for (let idx = 0; idx < 100; idx++) {
    const rowNumber = 8 + idx;
    if (idx < productsToOrder.length) {
      const item = productsToOrder[idx];
      const lookupKey = item.SKU ? item.SKU.toUpperCase() : "";
      const precio = state.preciosLookup ? (state.preciosLookup[lookupKey] || 0) : 0;
      
      wsPedido[`B${rowNumber}`] = { t: "n", v: idx + 1 };                        
      wsPedido[`C${rowNumber}`] = { t: "s", v: item.SKU || "" };                 
      wsPedido[`D${rowNumber}`] = { t: "s", v: item.Producto || "" };             
      wsPedido[`E${rowNumber}`] = { t: "n", v: item.PedidoSugerido || 0 };       
      wsPedido[`F${rowNumber}`] = { t: "n", v: precio };                         
      wsPedido[`G${rowNumber}`] = { t: "n", f: `F${rowNumber}*E${rowNumber}` };  
    }
  }

  if (wsPedido["G3"]) wsPedido["G3"].z = "$#,##0.00";
  if (wsPedido["G4"]) wsPedido["G4"].z = "$#,##0.00";
  if (wsPedido["G5"]) wsPedido["G5"].z = "$#,##0.00";

  const fileDate = today.toISOString().slice(0, 10);
  XLSX.writeFile(wb, `PEDIDO_${fileDate}.xlsx`, { bookType: "xlsx", cellDates: true });
  
  const msgDescarga = `📁 Pedido descargado con éxito. ${productsToOrder.length} productos para pedido` + (productsToOrder.length === 0 ? ", filas en blanco generadas." : ".");
  showStatusMessage(msgDescarga, "success");
}

/**
 * Cierra la sesión del usuario de forma segura y limpia por completo la interfaz
 * eliminando los mensajes flotantes de carga del inicio de sesión.
 */
function triggerLogout() {
  if (window.auth) {
    window.signOut(window.auth).then(() => {
      if (window.state) { 
        state.rows = []; 
        state.inventoryOrigin = null; 
      }
      
      const tbody = document.getElementById("tableBody"); 
      if (tbody) tbody.innerHTML = "";
      
      // 🧼 LIMPIEZA TOTAL DEL LOGIN: Forzar el vaciado y ocultar el texto verde
      const statusEl = document.getElementById("status");
      if (statusEl) {
        statusEl.textContent = "";
        statusEl.innerHTML = "";
        statusEl.style.display = "none";
      }
      
      const filterInfoEl = document.getElementById("filterInfo");
      if (filterInfoEl) {
        filterInfoEl.textContent = "";
        filterInfoEl.innerHTML = "";
      }

      console.log("Sesión cerrada e interfaz de login purgada con éxito.");
    }).catch((err) => {
      console.error("Error al cerrar sesión:", err);
    });
  }
}