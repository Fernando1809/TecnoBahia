// js/app.js

function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  setStatus("Procesando archivo de inventario...", false);
  
  const reader = new FileReader();
  
  reader.onload = function(evt) {
    try {
      let workbook;
      const fileName = file.name.toLowerCase();
      
      if (fileName.endsWith('.csv')) {
        const text = new TextDecoder("utf-8").decode(new Uint8Array(evt.target.result));
        workbook = XLSX.read(text, { type: 'string' });
      } else {
        const data = new Uint8Array(evt.target.result);
        workbook = XLSX.read(data, { type: 'array' });
      }
      
      const sheetName = chooseMainSheet(workbook);
      const sheet = workbook.Sheets[sheetName];
      
      state.rawJson = parseSheetWithAutoHeader(sheet);
      
      if (!state.rawJson || state.rawJson.length === 0) {
        setStatus("No se encontraron filas de datos.", true);
        return;
      }
      
      state.inventoryOrigin = detectInventoryOrigin(workbook, file.name);
      
      recalculateRows();

      if (typeof autoSwitchToPedidoFilter === "function") {
        autoSwitchToPedidoFilter();
      }

      if (typeof updateExportButtonState === "function") {
        updateExportButtonState();
      }
      
      setStatus(`✅ Inventario cargado con éxito.`, false);
      
      // 🔥 LIMPIAR EL INPUT para poder cargar el mismo archivo nuevamente
      document.getElementById("fileInput").value = "";
      
    } catch (err) {
      console.error("Error crítico:", err);
      setStatus("Error al procesar el archivo.", true);
      // También limpiar en caso de error
      document.getElementById("fileInput").value = "";
    }
  };
  
  reader.readAsArrayBuffer(file);
}
function exportResults() {
  if (!state.rows || !state.rows.length) {
    setStatus("Carga el inventario primero.", true);
    return;
  }
  if (!state.pedidoTemplateLoaded) {
    setStatus("⚠️ No hay plantilla de pedido cargada.", true);
    return;
  }

  const productsToOrder = state.rows.filter(r => r.PedidoSugerido > 0);
  
  if (productsToOrder.length === 0) {
    setStatus("⚠️ No hay productos que requieran pedido.", true);
    return;
  }
  
  const wb = getPedidoWorkbook(); 
  if (!wb) {
    setStatus("No se pudo leer la plantilla PEDIDO.", true);
    return;
  }

  let pedidoSheetName = wb.SheetNames.find(name => 
    name.toLowerCase() === "pedido" || name.toLowerCase().includes("pedido")
  );
  if (!pedidoSheetName) pedidoSheetName = wb.SheetNames[0];
  
  const wsPedido = wb.Sheets[pedidoSheetName];
  if (!wsPedido) {
    setStatus("No se encontró una hoja válida en la plantilla.", true);
    return;
  }

  const today = new Date();
  
  // Formatear fecha para el Excel
  wsPedido["D5"] = { t: "d", v: today, z: "dd/mm/yyyy" };
  
  if (state.inventoryOrigin) {
    wsPedido["D6"] = { t: "s", v: state.inventoryOrigin };
  }

  // Limpiar filas anteriores
  for (let row = 8; row <= 107; row++) {
    ["B", "C", "D", "E", "F", "G"].forEach(col => delete wsPedido[`${col}${row}`]);
  }

  // Variables para calcular totales
  let subtotal = 0;
  let iva = 0;
  let total = 0;

  // Llenar con productos a pedir
  for (let idx = 0; idx < productsToOrder.length; idx++) {
    const rowNumber = 8 + idx;
    const item = productsToOrder[idx];
    const lookupKey = item.SKU ? item.SKU.toUpperCase() : "";
    const precio = state.preciosLookup ? (state.preciosLookup[lookupKey] || 0) : 0;
    const importe = item.PedidoSugerido * precio;
    
    subtotal += importe;
    
    wsPedido[`B${rowNumber}`] = { t: "n", v: idx + 1 };                        
    wsPedido[`C${rowNumber}`] = { t: "s", v: item.SKU || "" };                 
    wsPedido[`D${rowNumber}`] = { t: "s", v: item.Producto || "" };             
    wsPedido[`E${rowNumber}`] = { t: "n", v: item.PedidoSugerido || 0 };       
    wsPedido[`F${rowNumber}`] = { t: "n", v: precio };                         
    wsPedido[`G${rowNumber}`] = { t: "n", v: importe };  // Valor calculado, no fórmula
  }
  
  // Calcular IVA (13%) y total
  iva = subtotal * 0.13;
  total = subtotal + iva;
  
  // Escribir totales como valores (no fórmulas)
  if (wsPedido["G3"]) wsPedido["G3"] = { t: "n", v: subtotal };
  if (wsPedido["G4"]) wsPedido["G4"] = { t: "n", v: iva };
  if (wsPedido["G5"]) wsPedido["G5"] = { t: "n", v: total };
  
  // Formato de moneda para los totales
  if (wsPedido["G3"]) wsPedido["G3"].z = "$#,##0.00";
  if (wsPedido["G4"]) wsPedido["G4"].z = "$#,##0.00";
  if (wsPedido["G5"]) wsPedido["G5"].z = "$#,##0.00";

  // Crear nombre del archivo
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  const fechaFormateada = `${day}-${month}-${year}`;
  let sucursal = state.inventoryOrigin || "Sucursal";
  sucursal = sucursal.replace(/[\\/:*?"<>|]/g, '');
  const nombreArchivo = `${fechaFormateada} - Tecno Bahia - ${sucursal}.xlsx`;
  
  console.log("📄 Generando archivo:", nombreArchivo);
  console.log("💰 Subtotal:", subtotal, "IVA:", iva, "TOTAL:", total);
  
  XLSX.writeFile(wb, nombreArchivo, { bookType: "xlsx", cellDates: true });
  
  setStatus(`📁 Pedido descargado: ${productsToOrder.length} productos. Total: $${total.toFixed(2)}`, false);
}