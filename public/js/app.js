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
        const sampleFirstRow = (sheet && sheet['!ref']) ? XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })[0] : null;
        const samplePreview = sampleFirstRow ? sampleFirstRow.slice(0,5).join(' | ') : '';
        setStatus(`No se encontraron filas de datos en la hoja "${sheetName}". Primera fila: ${samplePreview}`, true);
        console.warn("Depuración: hoja elegida:", sheetName, "primeras celdas:", sampleFirstRow);
        return;
      }
      
      state.inventoryOrigin = detectInventoryOrigin(workbook, file.name);
      state.inventoryLoaded = true;
      state.excludedSKUs = []; // nuevo inventario cargado: limpiar purgas de la sesión anterior

      // ✅ Detectar la sucursal (Jiquilisco/Usulután) y activar su archivo de reglas min/max
      if (state.inventoryOrigin && typeof activarSucursal === "function") {
        activarSucursal(state.inventoryOrigin);
        console.log(`🏬 Reglas min/máx activadas automáticamente para: ${state.inventoryOrigin}`);
      } else if (!state.inventoryOrigin) {
        console.warn("⚠️ No se detectó la sucursal del inventario; se mantienen las reglas actualmente activas:", state.sucursalActiva);
        mostrarNotificacion(`⚠️ No se detectó la sucursal del archivo. Usando reglas de: ${state.sucursalActiva || "N/D"}`, true);
      }
      
      // ✅ IMPORTANTE: Recalcular las filas después de cargar el inventario
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
          
          const productosConPedido = state.rows.filter(r => r.PedidoSugerido > 0).length;
          
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
      mensaje = "⚠️ No hay productos con inventario menor al máximo.";
    }
    setStatus(mensaje, true);
    return;
  }
  
  const sucursalPedido = state.inventoryOrigin || state.sucursalActiva || "General";
  if (typeof mostrarMemoriaPedidoAnterior === "function") {
    mostrarMemoriaPedidoAnterior(sucursalPedido);
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

  let totalPedido = 0;

  // Llenar productos
  for (let idx = 0; idx < productsToOrder.length; idx++) {
    const rowNumber = 8 + idx;
    const item = productsToOrder[idx];
    const lookupKey = item.SKU ? item.SKU.toUpperCase() : "";
    let precioConIva = state.preciosLookup ? (state.preciosLookup[lookupKey] || item.CostoUnitario || 0) : (item.CostoUnitario || 0);
    // Redondear a 2 decimales para evitar 134.4022
    precioConIva = Math.round(precioConIva * 100) / 100;
    const importeConIva = Math.round((item.PedidoSugerido * precioConIva) * 100) / 100;
    
    totalPedido += importeConIva;
    
    wsPedido[`B${rowNumber}`] = { t: "n", v: idx + 1 };
    wsPedido[`C${rowNumber}`] = { t: "s", v: item.SKU || "" };
    wsPedido[`D${rowNumber}`] = { t: "s", v: item.Producto || "" };
    wsPedido[`E${rowNumber}`] = { t: "n", v: item.PedidoSugerido || 0 };
    wsPedido[`F${rowNumber}`] = { t: "n", v: precioConIva };
    wsPedido[`G${rowNumber}`] = { t: "n", v: importeConIva };
    
    // Aplicar formato moneda a las celdas de precio y subtotal
    wsPedido[`F${rowNumber}`].z = "$#,##0.00";
    wsPedido[`G${rowNumber}`].z = "$#,##0.00";
  }
  
  totalPedido = Math.round(totalPedido * 100) / 100;
  
  wsPedido["G3"] = { t: "n", v: totalPedido, z: "$#,##0.00" };
  wsPedido["G4"] = { t: "n", v: 0, z: "$#,##0.00" };
  wsPedido["G5"] = { t: "n", v: totalPedido, z: "$#,##0.00" };

  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  const fechaFormateada = `${day}-${month}-${year}`;
  let sucursal = state.inventoryOrigin || "Sucursal";
  sucursal = sucursal.replace(/[\\/:*?"<>|]/g, '');
  
  // Indicar en el nombre qué filtro se usó
  let filtroTexto = "";
  if (window.inventoryPedidoFilter.includeZero && window.inventoryPedidoFilter.includeAtMin) {
    filtroTexto = " (faltantes al maximo)";
  } else if (window.inventoryPedidoFilter.includeZero && !window.inventoryPedidoFilter.includeAtMin) {
    filtroTexto = " (solo stock 0)";
  } else if (!window.inventoryPedidoFilter.includeZero && window.inventoryPedidoFilter.includeAtMin) {
    filtroTexto = " (solo stock en mínimo)";
  }
  
  const nombreArchivo = `${fechaFormateada} - Tecno Bahia - ${sucursal}${filtroTexto}.xlsx`;
  
  console.log("📄 Generando archivo:", nombreArchivo);
  console.log("💰 Total pedido:", totalPedido);
  console.log("📦 Productos incluidos:", productsToOrder.length);
  console.log("🎯 Filtro aplicado - includeZero:", window.inventoryPedidoFilter.includeZero, "includeAtMin:", window.inventoryPedidoFilter.includeAtMin);
  
  XLSX.writeFile(wb, nombreArchivo, { bookType: "xlsx", cellDates: true });

  // Preguntar al usuario si desea guardar este pedido en la memoria (para
  // compararlo con el próximo). Se guarda EXACTAMENTE productsToOrder, que es
  // la misma lista que se acaba de escribir en el Excel (ya refleja las
  // cantidades editadas y los productos quitados de la tabla).
  const deseaGuardar = confirm(
    `¿Deseas guardar este pedido en la memoria de ${sucursalPedido}?\n\n` +
    `Se guardarán los ${productsToOrder.length} productos que quedaron en la tabla al momento de descargar.`
  );

  if (deseaGuardar) {
    if (typeof guardarMemoriaPedidoActual === "function") {
      guardarMemoriaPedidoActual(sucursalPedido, productsToOrder);
    }

    if (typeof loadPedidoMemoria === "function") {
      loadPedidoMemoria().catch(err => console.warn("No se pudo refrescar el historial de pedidos:", err));
    }
  } else {
    console.log("🕘 Usuario decidió NO guardar este pedido en la memoria.");
  }
  
  let filtroDescripcion = "";
  if (window.inventoryPedidoFilter.includeZero && window.inventoryPedidoFilter.includeAtMin) {
    filtroDescripcion = "inventario menor al máximo";
  } else if (window.inventoryPedidoFilter.includeZero && !window.inventoryPedidoFilter.includeAtMin) {
    filtroDescripcion = "inventario = 0";
  } else {
    filtroDescripcion = "inventario en mínimo";
  }
  
  setStatus(`📁 Pedido descargado: ${productsToOrder.length} productos (${filtroDescripcion}). Total: $${totalPedido.toFixed(2)}`, false);
}