// js/app.js

/**
 * Maneja el evento de selección/arrastre de archivos de inventario.
 * Procesa el Workbook, autodetecta el origen y activa la recalculación.
 */
function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  setStatus("Procesando archivo de inventario...");
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
        setStatus("La hoja está vacía.", true); 
        return; 
      }
      
      const headers = Object.keys(json[0]);
      const map = getColumnMap(headers);
      if (!map.sku || !map.inventario) { 
        setStatus("Faltan columnas esenciales: SKU o Inventario/Existencia", true); 
        return; 
      }
      
      state.rawJson = json;
      state.columnMap = map;
      
      // Ejecutar motor de reabastecimiento y refrescar botones de acción
      recalculateRows();
      if (typeof updateExportButtonState === "function") updateExportButtonState();
      
      setStatus(`✅ Inventario cargado. Hoja: "${mainSheet}".${originText} Registros: ${state.rows.length}.`);
    } catch (err) { 
      console.error(err); 
      setStatus("Error al leer el archivo de inventario.", true); 
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
    setStatus("Carga el inventario primero.", true);
    return;
  }
  if (!state.pedidoTemplateLoaded) {
    setStatus("Carga la plantilla PEDIDO antes de exportar.", true);
    return;
  }

  const productsToOrder = state.rows.filter(r => r.PedidoSugerido > 0);
  const wb = getPedidoWorkbook(); // Función de descompresión de plantilla base64
  if (!wb) {
    setStatus("No se pudo leer la plantilla PEDIDO maestra.", true);
    return;
  }

  const pedidoSheetName = wb.SheetNames.includes("PEDIDO") ? "PEDIDO" : wb.SheetNames[0];
  const wsPedido = wb.Sheets[pedidoSheetName];
  if (!wsPedido) {
    setStatus("No se encontró la hoja llamada 'PEDIDO' dentro de la plantilla.", true);
    return;
  }

  // Inyectar metadatos de cabecera en celdas fijas
  const today = new Date();
  wsPedido["D5"] = { t: "d", v: today, z: "dd/mm/yyyy" };
  if (state.inventoryOrigin) {
    wsPedido["D6"] = { t: "s", v: state.inventoryOrigin };
  }

  // Limpieza preventiva del bloque de datos (Estructura de filas 8 a 107 para evitar solapamientos)
  for (let row = 8; row <= 107; row++) {
    ["B", "C", "D", "E", "F", "G"].forEach(col => delete wsPedido[`${col}${row}`]);
  }

  // Inyección estructurada de registros a pedir (Límite físico de 100 ranuras de diseño)
  for (let idx = 0; idx < 100; idx++) {
    const rowNumber = 8 + idx;
    if (idx < productsToOrder.length) {
      const item = productsToOrder[idx];
      
      // Buscar costo de catálogo maestro para blindar la consistencia financiera
      const lookupKey = item.SKU.toUpperCase();
      const precio = state.preciosLookup ? (state.preciosLookup[lookupKey] || 0) : 0;
      
      wsPedido[`B${rowNumber}`] = { t: "n", v: idx + 1 };                        // #Índice
      wsPedido[`C${rowNumber}`] = { t: "s", v: item.SKU };                       // SKU
      wsPedido[`D${rowNumber}`] = { t: "s", v: item.Producto };                  // Descripción
      wsPedido[`E${rowNumber}`] = { t: "n", v: item.PedidoSugerido };            // Cantidad
      wsPedido[`F${rowNumber}`] = { t: "n", v: precio };                         // P. Unitario
      wsPedido[`G${rowNumber}`] = { t: "n", f: `F${rowNumber}*E${rowNumber}` };  // Fórmula de Costo Total
    }
  }

  // Asegurar formato contable en celdas de sumatorias/totales superiores de la plantilla
  if (wsPedido["G3"]) wsPedido["G3"].z = "$#,##0.00";
  if (wsPedido["G4"]) wsPedido["G4"].z = "$#,##0.00";
  if (wsPedido["G5"]) wsPedido["G5"].z = "$#,##0.00";

  // Disparar descarga del archivo procesado hacia el navegador
  const fileDate = today.toISOString().slice(0, 10);
  XLSX.writeFile(wb, `PEDIDO_${fileDate}.xlsx`, { bookType: "xlsx", cellDates: true });
  
  setStatus(`📁 Pedido descargado con éxito. ${productsToOrder.length} productos para pedido` + (productsToOrder.length === 0 ? ", filas en blanco generadas." : "."));
}