// js/engine.js

function parseSheetWithAutoHeader(sheet) {
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (!aoa.length) return [];
  
  console.log("📋 Total filas en el archivo:", aoa.length);
  
  // Tu archivo tiene los encabezados en la FILA 4 (índice 4)
  const headerRowIndex = 4;
  const headerRow = aoa[headerRowIndex] || [];
  
  console.log("📋 Encabezados en fila 4:", headerRow);
  
  // Buscar las columnas específicas
  let skuCol = -1;
  let productCol = -1;
  let inventoryCol = -1;
  
  for (let i = 0; i < headerRow.length; i++) {
    const cell = String(headerRow[i] || "").trim();
    if (cell === "Código") {
      skuCol = i;
      console.log(`✅ Columna "Código" encontrada en índice ${i}`);
    }
    if (cell === "Nombre") {
      productCol = i;
      console.log(`✅ Columna "Nombre" encontrada en índice ${i}`);
    }
    if (cell === "Existencia") {
      inventoryCol = i;
      console.log(`✅ Columna "Existencia" encontrada en índice ${i}`);
    }
  }
  
  // Asignar valores por defecto si no se encontraron
  if (skuCol === -1) skuCol = 0;
  if (productCol === -1) productCol = 2;
  if (inventoryCol === -1) inventoryCol = 12;
  
  const finalMap = {
    SKU: skuCol,
    Producto: productCol,
    Inventario: inventoryCol
  };
  
  state.columnMap = finalMap;
  console.log("📋 Mapa de columnas final:", finalMap);
  
  // Las filas de datos empiezan desde la fila 5 (índice 5)
  const dataRows = aoa.slice(headerRowIndex + 1);
  console.log("📋 Filas de datos encontradas:", dataRows.length);
  
  return dataRows;
}

function recalculateRows() {
  console.log("🔄 Recalculando filas...");
  
  // GUARDAR PRODUCTOS MANUALES ANTES DE RECALCULAR
  const manualProducts = (state.rows || []).filter(r => r._manual === true);
  console.log("📦 Productos manuales a preservar:", manualProducts.length);
  
  console.log("📊 state.rawJson length:", state.rawJson ? state.rawJson.length : 0);
  console.log("📊 state.listaCompleta length:", state.listaCompleta ? state.listaCompleta.length : 0);
  console.log("📊 state.preciosLookup keys:", Object.keys(state.preciosLookup || {}).length);
  
  const agrupar = {};
  
  if (state.rawJson && state.rawJson.length && state.columnMap) {
    const map = state.columnMap;
    
    for (let i = 0; i < state.rawJson.length; i++) {
      const r = state.rawJson[i];
      if (!r) continue;
      
      // Obtener SKU
      let sku = "";
      if (r[map.SKU] !== undefined && r[map.SKU] !== null && r[map.SKU] !== "") {
        sku = String(r[map.SKU]).trim();
      }
      
      if (!sku || sku === "" || sku === "Código") continue;
      
      // Obtener producto del inventario
      let productoInventario = "";
      if (r[map.Producto] !== undefined && r[map.Producto] !== null && r[map.Producto] !== "") {
        productoInventario = String(r[map.Producto]).trim();
      }
      
      // Obtener inventario
      let inventario = 0;
      if (r[map.Inventario] !== undefined && r[map.Inventario] !== null && r[map.Inventario] !== "") {
        const invVal = String(r[map.Inventario]).trim();
        if (invVal !== "" && !isNaN(Number(invVal))) {
          inventario = Number(invVal);
        }
      }
      
      if (inventario < 0) inventario = 0;
      
      if (!agrupar[sku]) {
        agrupar[sku] = {
          sku: sku,
          producto: productoInventario,
          inventario: 0
        };
      }
      agrupar[sku].inventario += inventario;
    }
  }
  
  console.log("📊 SKUs agrupados (con inventario):", Object.keys(agrupar).length);
  
  // 🔴 NUEVO: Crear mapa de nombres con PRIORIDAD a adminRules
  const nombresMap = {};
  
  // 1. PRIMERO: Nombres desde adminRules (archivo de reglas) - PRIORIDAD MÁXIMA
  if (state.adminRules && Object.keys(state.adminRules).length) {
    for (const sku in state.adminRules) {
      if (state.adminRules[sku].producto && state.adminRules[sku].producto.trim() !== "") {
        nombresMap[sku] = state.adminRules[sku].producto.trim();
      }
    }
    console.log("📊 Nombres cargados desde adminRules (prioridad máxima):", Object.keys(nombresMap).length);
  }
  
  // 2. SEGUNDO: Nombres desde listaCompleta (solo si no existe en adminRules)
  if (state.listaCompleta && state.listaCompleta.length) {
    for (const item of state.listaCompleta) {
      if (item.CODIGO && !nombresMap[item.CODIGO]) {
        nombresMap[item.CODIGO] = item.DESCRIPCION || item.CODIGO;
      }
    }
    console.log("📊 Nombres cargados desde listaCompleta (fallback):", Object.keys(nombresMap).length);
  }
  
  const skusConPrecio = new Set(Object.keys(state.preciosLookup || {}));
  console.log("📊 SKUs con precio:", skusConPrecio.size);
  
  const agruparConPrecio = {};
  Object.keys(agrupar).forEach(sku => {
    if (skusConPrecio.has(sku)) {
      agruparConPrecio[sku] = agrupar[sku];
    } else {
      console.log(`⚠️ SKU sin precio (omitido del reporte): ${sku}`);
    }
  });
  
  // También incluir SKUs con reglas pero sin inventario
  if (state.adminRules && Object.keys(state.adminRules).length > 0) {
    Object.keys(state.adminRules).forEach(sku => {
      const regla = state.adminRules[sku];
      const hasMin = (regla.minimo !== undefined && regla.minimo !== "" && regla.minimo !== null);
      const hasMax = (regla.maximo !== undefined && regla.maximo !== "" && regla.maximo !== null);
      
      if (hasMin && hasMax && skusConPrecio.has(sku)) {
        if (!agruparConPrecio[sku]) {
          let producto = nombresMap[sku] || state.adminRules[sku]?.producto || "";
          agruparConPrecio[sku] = {
            sku: sku,
            producto: producto || "Sin nombre",
            inventario: 0
          };
          console.log(`📦 Producto con reglas y precio sin inventario: ${sku}`);
        }
      }
    });
  }
  
  state.rows = Object.values(agruparConPrecio).map(item => {
    // 🔴 PRIORIDAD: adminRules > listaCompleta > inventario > SKU
    let nombreFinal = "";
    
    // 1. Primero buscar en adminRules (archivo de reglas)
    if (state.adminRules && state.adminRules[item.sku] && state.adminRules[item.sku].producto) {
      nombreFinal = state.adminRules[item.sku].producto.trim();
    }
    
    // 2. Si no tiene nombre en reglas, buscar en nombresMap (listaCompleta)
    if (!nombreFinal && nombresMap[item.sku]) {
      nombreFinal = nombresMap[item.sku];
    }
    
    // 3. Si no tiene nombre, usar el del inventario
    if (!nombreFinal && item.producto) {
      nombreFinal = item.producto;
    }
    
    // 4. Si nada, usar el SKU como nombre
    if (!nombreFinal) {
      nombreFinal = item.sku;
    }
    
    return {
      SKU: item.sku,
      Producto: nombreFinal,
      Inventario: item.inventario,
      CostoUnitario: state.preciosLookup[item.sku] || null,
      Minimo: state.adminRules[item.sku]?.minimo ?? "",
      Maximo: state.adminRules[item.sku]?.maximo ?? "",
      ConsumoMensual: 0,
      PedidoSugerido: 0,
      CostoTotal: null,
      Exceso: 0,
      Estado: "SIN REGLAS"
    };
  }).map(row => {
    // Recalcular valores con las reglas
    const regla = state.adminRules[row.SKU] || {};
    const hasMin = (regla.minimo !== undefined && regla.minimo !== "" && regla.minimo !== null);
    const hasMax = (regla.maximo !== undefined && regla.maximo !== "" && regla.maximo !== null);
    const minimo = hasMin ? Number(regla.minimo) : 0;
    const maximo = hasMax ? Number(regla.maximo) : 0;
    const precioSinIva = row.CostoUnitario;
    const stockActual = row.Inventario;
    
    let pedidoSugerido = 0;
    if (hasMin && hasMax) {
      if (stockActual <= minimo) {
        pedidoSugerido = maximo - stockActual;
        if (pedidoSugerido < 0) pedidoSugerido = 0;
      }
    }
    
    const exceso = (hasMax && stockActual > maximo) ? (stockActual - maximo) : 0;
    
    let costoTotalFinal = null;
    if (precioSinIva !== null && !isNaN(precioSinIva) && precioSinIva > 0) {
      costoTotalFinal = pedidoSugerido * precioSinIva;
    }
    
    let estado = "SIN REGLAS";
    if (hasMin && hasMax) {
      if (pedidoSugerido > 0) estado = "PEDIR";
      else if (exceso > 0) estado = "EXCESO";
      else estado = "OK";
    } else if (hasMin && !hasMax) {
      estado = "SOLO MINIMO";
    } else if (!hasMin && hasMax) {
      estado = "SOLO MAXIMO";
    }
    
    return {
      ...row,
      Minimo: hasMin ? minimo : "",
      Maximo: hasMax ? maximo : "",
      PedidoSugerido: pedidoSugerido,
      CostoTotal: costoTotalFinal,
      Exceso: exceso,
      Estado: estado
    };
  });
  
  console.log("📊 Total rows calculados:", state.rows.length);
  
  // PRESERVAR PRODUCTOS AGREGADOS MANUALMENTE
  if (manualProducts.length > 0) {
    console.log(`📦 Preservando ${manualProducts.length} productos manuales...`);
    manualProducts.forEach(manual => {
      // Buscar si ya existe en rows
      const existingIndex = state.rows.findIndex(r => r.SKU === manual.SKU);
      if (existingIndex !== -1) {
        // Reemplazar el calculado con el manual (FORZAR inventario 0)
        state.rows[existingIndex] = {
          ...state.rows[existingIndex],
          ...manual,
          Inventario: 0, // Siempre 0 para manuales
          _manual: true
        };
        console.log(`🔄 Producto manual preservado: ${manual.SKU}`);
      } else {
        // Agregar si no existe
        state.rows.push(manual);
        console.log(`➕ Producto manual agregado: ${manual.SKU}`);
      }
    });
  }
  
  // Mostrar los primeros 5 productos como ejemplo
  if (state.rows.length > 0) {
    console.log("📋 Ejemplo de productos cargados:");
    for (let i = 0; i < Math.min(5, state.rows.length); i++) {
      const esManual = state.rows[i]._manual === true;
      console.log(`   ${state.rows[i].SKU} - ${state.rows[i].Producto} ${esManual ? '📌 (manual)' : ''}`);
    }
  }
  
  console.log("📊 Total rows final (con manuales):", state.rows.length);
  
  updateMetrics(state.rows);
  
  if (typeof applyFilterAndSearch === "function") {
    applyFilterAndSearch();
  }
  
  if (typeof updateExportButtonState === "function") {
    updateExportButtonState();
    console.log("🔘 Botón actualizado, productos con pedido:", state.rows.filter(r => r.PedidoSugerido > 0).length);
  }
}

function updateMetrics(rows) {
  const total = rows.length;
  
  // Para el contador de "Con pedido" usamos el filtro de inventario si está activo
  let conPedido = 0;
  
  // Si estamos en el filtro de pedido, aplicar el filtro de inventario
  if (state.activeFilter === "pedido" && window.inventoryPedidoFilter) {
    conPedido = rows.filter(r => {
      if (r.PedidoSugerido <= 0) return false;
      
      // SI ES MANUAL, SIEMPRE CONTAR
      if (r._manual === true) return true;
      
      const inventario = r.Inventario;
      
      // Verificar si está en mínimo
      const minimo = r.Minimo;
      const estaEnMinimo = (minimo !== undefined && minimo !== "" && minimo !== null && !isNaN(minimo)) 
                            ? Number(inventario) === Number(minimo) 
                            : false;
      
      if (window.inventoryPedidoFilter.includeZero && inventario === 0) return true;
      if (window.inventoryPedidoFilter.includeAtMin && estaEnMinimo && inventario > 0) return true;
      return false;
    }).length;
  } else {
    conPedido = rows.filter(r => r.PedidoSugerido > 0).length;
  }
  
  const conExceso = rows.filter(r => r.Exceso > 0).length;
  
  const elTotal = document.getElementById("mTotal");
  const elPedido = document.getElementById("mPedido");
  const elExceso = document.getElementById("mExceso");
  
  if (elTotal) elTotal.textContent = total;
  if (elPedido) elPedido.textContent = conPedido;
  if (elExceso) elExceso.textContent = conExceso;
  
  // Llamar a la función que recalcula el total según el filtro
  if (typeof recalcularTotalPorFiltroInventario === "function") {
    recalcularTotalPorFiltroInventario();
  }
}