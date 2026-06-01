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

      setTimeout(function() {
        console.log("🔄 Ejecutando cambio automático a filtro PEDIDO...");
        
        if (typeof autoSwitchToPedidoFilter === "function") {
          console.log("✅ Usando autoSwitchToPedidoFilter");
          autoSwitchToPedidoFilter();
        } else {
          console.warn("⚠️ autoSwitchToPedidoFilter no encontrada, usando método manual mejorado");
          
          if (!state.rows || state.rows.length === 0) {
            console.log("⚠️ No hay datos para cambiar filtro");
            return;
          }
          
          state.activeFilter = "pedido";
          console.log("state.activeFilter =", state.activeFilter);
          
          const chips = document.querySelectorAll(".filter-chip");
          let pedidoChip = null;
          chips.forEach(chip => {
            if (chip.getAttribute("data-filter") === "pedido") {
              chip.classList.add("active");
              pedidoChip = chip;
            } else {
              chip.classList.remove("active");
            }
          });
          
          if (!pedidoChip) {
            console.warn("No se encontró chip con data-filter='pedido'");
          }
          
          if (typeof resetReportPagination === "function") {
            resetReportPagination();
          } else if (window.reportPageState) {
            window.reportPageState.currentPage = 1;
          }
          
          if (typeof applyFilterAndSearch === "function") {
            applyFilterAndSearch();
          }
          
          const productosConPedido = state.rows.filter(r => {
            const hasFullRule = (r.Minimo !== "" && r.Minimo !== undefined && r.Minimo !== null) &&
                                (r.Maximo !== "" && r.Maximo !== undefined && r.Maximo !== null);
            const hasPrice = (r.CostoUnitario !== null && r.CostoUnitario !== undefined && r.CostoUnitario > 0);
            return hasFullRule && hasPrice && r.PedidoSugerido > 0;
          }).length;
          
          if (productosConPedido === 0) {
            mostrarNotificacion("📊 No hay productos que requieran pedido.\nVerifica precios y reglas.", true);
          } else {
            mostrarNotificacion(`📊 Filtro cambiado a "PEDIDO". ${productosConPedido} productos requieren pedido.`, false);
          }
          
          console.log("✅ Método manual completado");
        }
      }, 300);
      
      if (typeof updateExportButtonState === "function") {
        updateExportButtonState();
      }
      
      setStatus(`✅ Inventario cargado con éxito.`, false);
      
      document.getElementById("fileInput").value = "";
      
    } catch (err) {
      console.error("Error crítico:", err);
      setStatus("Error al procesar el archivo.", true);
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

  // Usar la función que respeta el filtro de inventario seleccionado
  const productsToOrder = getProductosParaExportar();
  
  if (productsToOrder.length === 0) {
    let mensaje = "";
    if (window.inventoryPedidoFilter.includeZero && !window.inventoryPedidoFilter.includeAtMin) {
      mensaje = "⚠️ No hay productos con inventario = 0 que requieran pedido.";
    } else if (!window.inventoryPedidoFilter.includeZero && window.inventoryPedidoFilter.includeAtMin) {
      mensaje = "⚠️ No hay productos con inventario en su mínimo que requieran pedido.";
    } else {
      mensaje = "⚠️ No hay productos que requieran pedido según el filtro seleccionado.";
    }
    setStatus(mensaje, true);
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
  
  wsPedido["D5"] = { t: "d", v: today, z: "dd/mm/yyyy" };
  
  if (state.inventoryOrigin) {
    wsPedido["D6"] = { t: "s", v: state.inventoryOrigin };
  }

  // Limpiar filas anteriores
  for (let row = 8; row <= 107; row++) {
    ["B", "C", "D", "E", "F", "G"].forEach(col => delete wsPedido[`${col}${row}`]);
  }

  let subtotalSinIva = 0;

  // Llenar productos
  for (let idx = 0; idx < productsToOrder.length; idx++) {
    const rowNumber = 8 + idx;
    const item = productsToOrder[idx];
    const lookupKey = item.SKU ? item.SKU.toUpperCase() : "";
    let precioSinIva = state.preciosLookup ? (state.preciosLookup[lookupKey] || 0) : 0;
    // Redondear a 2 decimales para evitar 134.4022
    precioSinIva = Math.round(precioSinIva * 100) / 100;
    const importeSinIva = Math.round((item.PedidoSugerido * precioSinIva) * 100) / 100;
    
    subtotalSinIva += importeSinIva;
    
    wsPedido[`B${rowNumber}`] = { t: "n", v: idx + 1 };
    wsPedido[`C${rowNumber}`] = { t: "s", v: item.SKU || "" };
    wsPedido[`D${rowNumber}`] = { t: "s", v: item.Producto || "" };
    wsPedido[`E${rowNumber}`] = { t: "n", v: item.PedidoSugerido || 0 };
    wsPedido[`F${rowNumber}`] = { t: "n", v: precioSinIva };
    wsPedido[`G${rowNumber}`] = { t: "n", v: importeSinIva };
    
    // Aplicar formato moneda a las celdas de precio y subtotal
    wsPedido[`F${rowNumber}`].z = "$#,##0.00";
    wsPedido[`G${rowNumber}`].z = "$#,##0.00";
  }
  
  subtotalSinIva = Math.round(subtotalSinIva * 100) / 100;
  const iva = Math.round(subtotalSinIva * 0.14 * 100) / 100;
  const totalConIva = Math.round((subtotalSinIva + iva) * 100) / 100;
  
  wsPedido["G3"] = { t: "n", v: subtotalSinIva, z: "$#,##0.00" };
  wsPedido["G4"] = { t: "n", v: iva, z: "$#,##0.00" };
  wsPedido["G5"] = { t: "n", v: totalConIva, z: "$#,##0.00" };

  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  const fechaFormateada = `${day}-${month}-${year}`;
  let sucursal = state.inventoryOrigin || "Sucursal";
  sucursal = sucursal.replace(/[\\/:*?"<>|]/g, '');
  
  // Indicar en el nombre qué filtro se usó
  let filtroTexto = "";
  if (window.inventoryPedidoFilter.includeZero && window.inventoryPedidoFilter.includeAtMin) {
    filtroTexto = " (stock 0 y en mínimo)";
  } else if (window.inventoryPedidoFilter.includeZero && !window.inventoryPedidoFilter.includeAtMin) {
    filtroTexto = " (solo stock 0)";
  } else if (!window.inventoryPedidoFilter.includeZero && window.inventoryPedidoFilter.includeAtMin) {
    filtroTexto = " (solo stock en mínimo)";
  }
  
  const nombreArchivo = `${fechaFormateada} - Tecno Bahia - ${sucursal}${filtroTexto}.xlsx`;
  
  console.log("📄 Generando archivo:", nombreArchivo);
  console.log("💰 Subtotal sin IVA:", subtotalSinIva, "IVA:", iva, "TOTAL CON IVA:", totalConIva);
  console.log("📦 Productos incluidos:", productsToOrder.length);
  console.log("🎯 Filtro aplicado - includeZero:", window.inventoryPedidoFilter.includeZero, "includeAtMin:", window.inventoryPedidoFilter.includeAtMin);
  
  XLSX.writeFile(wb, nombreArchivo, { bookType: "xlsx", cellDates: true });
  
  let filtroDescripcion = "";
  if (window.inventoryPedidoFilter.includeZero && window.inventoryPedidoFilter.includeAtMin) {
    filtroDescripcion = "inventario 0 y en mínimo";
  } else if (window.inventoryPedidoFilter.includeZero && !window.inventoryPedidoFilter.includeAtMin) {
    filtroDescripcion = "inventario = 0";
  } else {
    filtroDescripcion = "inventario en mínimo";
  }
  
  setStatus(`📁 Pedido descargado: ${productsToOrder.length} productos (${filtroDescripcion}). Total con IVA: $${totalConIva.toFixed(2)}`, false);
}