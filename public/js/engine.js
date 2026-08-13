// js/engine.js

function parseSheetWithAutoHeader(sheet) {
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (!aoa.length) return [];
  
  const rows = aoa.map(r => Array.isArray(r) ? r : [r]);
  console.log("📋 Total filas en el archivo:", rows.length);
  
  let headerRowIndex = 0;
  let headerFound = false;
  let skuCol = -1;
  let productCol = -1;
  let inventoryCol = -1;

  // 1) Buscar fila que contenga exactamente 'codigo' y 'existencia' (coincidencia exacta, no subcadenas)
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i] || [];
    const normalized = row.map(cell => norm(String(cell || "")));
    const hasCodigoExact = normalized.some(cell => cell === 'codigo');
    const hasExistenciaExact = normalized.some(cell => cell === 'existencia');
    if (hasCodigoExact && hasExistenciaExact) {
      headerRowIndex = i;
      headerFound = true;
      const headerRow = row;
      for (let c = 0; c < headerRow.length; c++) {
        const cell = norm(String(headerRow[c] || ""));
        if (skuCol === -1 && cell === 'codigo') {
          skuCol = c;
          console.log(`✅ Columna SKU encontrada en índice ${c}: ${headerRow[c]}`);
        }
        if (productCol === -1 && (cell === 'nombre' || cell === 'producto' || cell === 'descripcion')) {
          productCol = c;
          console.log(`✅ Columna producto encontrada en índice ${c}: ${headerRow[c]}`);
        }
        if (inventoryCol === -1 && cell === 'existencia') {
          inventoryCol = c;
          console.log(`✅ Columna inventario encontrada en índice ${c}: ${headerRow[c]}`);
        }
      }
      break;
    }
  }

  // 2) Si no se encontró la fila de encabezado exacta, usar fila 5 (índice 4) como fallback
  if (!headerFound) {
    const fallbackIndex = 4; // fila 5 (1-based)
    if (rows.length > fallbackIndex) {
      headerRowIndex = fallbackIndex;
      const headerRow = rows[headerRowIndex] || [];
      for (let c = 0; c < headerRow.length; c++) {
        const cell = norm(String(headerRow[c] || ""));
        if (skuCol === -1 && cell === 'codigo') {
          skuCol = c;
          console.log(`⚠️ Fallback: columna SKU encontrada en índice ${c}: ${headerRow[c]}`);
        }
        if (productCol === -1 && (cell === 'nombre' || cell === 'producto' || cell === 'descripcion')) {
          productCol = c;
          console.log(`⚠️ Fallback: columna producto encontrada en índice ${c}: ${headerRow[c]}`);
        }
        if (inventoryCol === -1 && cell === 'existencia') {
          inventoryCol = c;
          console.log(`⚠️ Fallback: columna inventario encontrada en índice ${c}: ${headerRow[c]}`);
        }
      }
      console.log('⚠️ No se detectó encabezado exacto; usando fila 5 como fallback (índice 4)');
    } else {
      console.warn('⚠️ No hay suficientes filas para usar fila 5 como fallback');
    }
  }
  
  // Asignar valores por defecto si no se encontraron
  if (skuCol === -1) skuCol = 0;
  if (productCol === -1) productCol = Math.max(1, skuCol + 1);
  if (inventoryCol === -1) inventoryCol = Math.max(2, Math.max(skuCol, productCol) + 1);
  
  const finalMap = {
    SKU: skuCol,
    Producto: productCol,
    Inventario: inventoryCol
  };
  
  state.columnMap = finalMap;
  console.log("📋 Mapa de columnas final:", finalMap);

  // Si no se detectó un encabezado, no descartamos la primera fila
  const startIndex = headerFound ? headerRowIndex + 1 : 0;
  const dataRows = rows.slice(startIndex).filter(row => Array.isArray(row) && row.some(cell => String(cell || "").trim() !== ""));
  console.log("📋 headerFound:", headerFound, "headerRowIndex:", headerRowIndex, "startIndex:", startIndex);
  console.log("📋 Filas de datos encontradas:", dataRows.length);

  // Mostrar muestra de las primeras filas y cómo se interpretan las columnas
  try {
    const sample = dataRows.slice(0, 5);
    sample.forEach((r, idx) => {
      const sku = r[finalMap.SKU] !== undefined ? String(r[finalMap.SKU]) : "";
      const prod = r[finalMap.Producto] !== undefined ? String(r[finalMap.Producto]) : "";
      const invRaw = r[finalMap.Inventario] !== undefined ? r[finalMap.Inventario] : "";
      const invNum = typeof toNum === 'function' ? toNum(invRaw) : invRaw;
      console.log(`🔎 Fila muestra ${idx}: SKU='${sku}', Producto='${prod}', Inventario(raw)='${invRaw}', Inventario(num)=`, invNum);
    });
  } catch (e) {
    console.warn('🔎 Error mostrando muestra de filas:', e);
  }

  return dataRows;
}

function recalculateRows() {
  console.log("🔄 Recalculando filas...");

  if (!state.inventoryLoaded) {
    console.log("⏭️ Recalculo omitido: aún no se cargó un archivo de inventario.");
    state.rows = [];
    state.filtered = [];
    state.activeFilter = "all";

    const chips = document.querySelectorAll(".filter-chip");
    chips.forEach(chip => {
      chip.classList.toggle("active", chip.getAttribute("data-filter") === "all");
    });

    if (typeof applyFilterAndSearch === "function") {
      applyFilterAndSearch();
    }
    if (typeof updateMetrics === "function") {
      updateMetrics([]);
    }
    if (typeof updateExportButtonState === "function") {
      updateExportButtonState();
    }
    return;
  }

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

      const skuKey = normalizeSku(sku);

      // Obtener producto del inventario
      let productoInventario = "";
      if (r[map.Producto] !== undefined && r[map.Producto] !== null && r[map.Producto] !== "") {
        productoInventario = String(r[map.Producto]).trim();
      }

      // Obtener inventario
      let inventario = 0;
      if (r[map.Inventario] !== undefined && r[map.Inventario] !== null && r[map.Inventario] !== "") {
        const invVal = String(r[map.Inventario]).trim();
        if (invVal !== "") {
          const numericValue = toNum(invVal);
          if (!isNaN(numericValue)) {
            inventario = numericValue;
          }
        }
      }

      if (inventario < 0) inventario = 0;

      if (!agrupar[skuKey]) {
        agrupar[skuKey] = {
          sku: sku.toUpperCase(),
          skuKey: skuKey,
          producto: productoInventario,
          inventario: 0
        };
      }
      agrupar[skuKey].inventario += inventario;
    }
  }

  console.log("📊 SKUs agrupados (con inventario):", Object.keys(agrupar).length);

  const reglasIndex = {};
  if (state.adminRules && Object.keys(state.adminRules).length) {
    Object.keys(state.adminRules).forEach(rawSku => {
      const key = normalizeSku(rawSku);
      reglasIndex[key] = state.adminRules[rawSku];
    });
  }

  const preciosIndex = {};
  Object.keys(state.preciosLookup || {}).forEach(rawSku => {
    const key = normalizeSku(rawSku);
    preciosIndex[key] = state.preciosLookup[rawSku];
  });

  // 🔴 NUEVO: Crear mapa de nombres con PRIORIDAD a adminRules
  const nombresMap = {};

  // 1. PRIMERO: Nombres desde adminRules (archivo de reglas) - PRIORIDAD MÁXIMA
  if (state.adminRules && Object.keys(state.adminRules).length) {
    for (const sku in state.adminRules) {
      const skuKey = normalizeSku(sku);
      if (state.adminRules[sku].producto && state.adminRules[sku].producto.trim() !== "") {
        nombresMap[skuKey] = state.adminRules[sku].producto.trim();
      }
    }
    console.log("📊 Nombres cargados desde adminRules (prioridad máxima):", Object.keys(nombresMap).length);
  }

  // 2. SEGUNDO: Nombres desde listaCompleta (solo si no existe en adminRules)
  if (state.listaCompleta && state.listaCompleta.length) {
    for (const item of state.listaCompleta) {
      const skuKey = normalizeSku(item.CODIGO);
      if (item.CODIGO && !nombresMap[skuKey]) {
        nombresMap[skuKey] = item.DESCRIPCION || item.CODIGO;
      }
    }
    console.log("📊 Nombres cargados desde listaCompleta (fallback):", Object.keys(nombresMap).length);
  }

  const skusConPrecio = new Set(Object.keys(state.preciosLookup || {}));
  console.log("📊 SKUs con precio:", skusConPrecio.size);
  const tieneReglaCompleta = (regla) => {
    const minimo = Number(regla?.minimo);
    const maximo = Number(regla?.maximo);
    const hasMin = regla && regla.minimo !== undefined && regla.minimo !== "" && regla.minimo !== null && Number.isFinite(minimo) && minimo >= 0;
    const hasMax = regla && regla.maximo !== undefined && regla.maximo !== "" && regla.maximo !== null && Number.isFinite(maximo) && maximo > 0;
    return hasMin && hasMax;
  };

  // Incluir todos los SKUs del inventario, independientemente de si tienen reglas
  const agruparConPrecio = {};
  Object.keys(agrupar).forEach(skuKey => {
    agruparConPrecio[skuKey] = agrupar[skuKey];
  });

  // También incluir SKUs con reglas completas pero sin inventario
  if (state.adminRules && Object.keys(state.adminRules).length > 0) {
    Object.keys(state.adminRules).forEach(sku => {
      const skuKey = normalizeSku(sku);
      const regla = state.adminRules[sku] || {};
      const hasMin = regla && regla.minimo !== undefined && regla.minimo !== "" && regla.minimo !== null && Number.isFinite(Number(regla.minimo));
      const hasMax = regla && regla.maximo !== undefined && regla.maximo !== "" && regla.maximo !== null && Number.isFinite(Number(regla.maximo));
      const hasAnyRule = hasMin || hasMax;

      if (hasAnyRule) {
        if (!agruparConPrecio[skuKey]) {
          let producto = nombresMap[skuKey] || state.adminRules[sku]?.producto || "";
          agruparConPrecio[skuKey] = {
            sku: sku.toUpperCase(),
            skuKey: skuKey,
            producto: producto || "Sin nombre",
            inventario: 0
          };
          console.log(`📦 Producto con regla min/max (sin inventario) incluido: ${sku}`);
        }
      }
    });
  }

  state.rows = Object.values(agruparConPrecio).map(item => {
    // 🔴 PRIORIDAD: adminRules > listaCompleta > inventario > SKU
    let nombreFinal = "";
    const itemKey = normalizeSku(item.skuKey || item.sku);

    const reglaItem = reglasIndex[itemKey] || {};
    if (reglaItem.producto) {
      nombreFinal = reglaItem.producto.trim();
    }

    if (!nombreFinal && nombresMap[itemKey]) {
      nombreFinal = nombresMap[itemKey];
    }

    if (!nombreFinal && item.producto) {
      nombreFinal = item.producto;
    }

    if (!nombreFinal) {
      nombreFinal = item.sku;
    }

    const precioConIva = preciosIndex[itemKey] ?? state.preciosLookup[item.sku] ?? state.preciosLookup[item.skuKey] ?? null;

    return {
      SKU: item.sku,
      Producto: nombreFinal,
      Inventario: item.inventario,
      CostoUnitario: precioConIva,
      Minimo: reglaItem.minimo ?? "",
      Maximo: reglaItem.maximo ?? "",
      ConsumoMensual: 0,
      PedidoSugerido: null,
      CostoTotal: null,
      Exceso: 0,
      Estado: "SIN REGLAS"
    };
  }).map(row => {
    const rowKey = normalizeSku(row.SKU);
    const regla = reglasIndex[rowKey] || state.adminRules?.[row.SKU] || state.adminRules?.[rowKey] || {};
    const minimoVal = toNumOrNull(regla.minimo);
    const maximoVal = toNumOrNull(regla.maximo);
    const precioConIva = row.CostoUnitario !== undefined ? row.CostoUnitario : null;
    const stockActual = Number(row.Inventario) || 0;

    // ==================== CÁLCULO DE PEDIDO SUGERIDO ====================
    // Regla de negocio: solo se sugiere pedido cuando el SKU está controlado por mínimo y máximo,
    // la existencia real está en o por debajo del mínimo, y el pedido es > 0.
    // Si no hay máximo definido o la diferencia no genera pedido, se devuelve null.
    let pedidoSugerido = null;
    if (maximoVal !== null && minimoVal !== null) {
      if (stockActual <= minimoVal) {
        const candidatePedido = maximoVal - stockActual;
        if (candidatePedido > 0) {
          pedidoSugerido = candidatePedido;
        }
      }
    }

    const exceso = (maximoVal !== null && stockActual > maximoVal) ? (stockActual - maximoVal) : 0;

    let costoTotalFinal = null;
    if (pedidoSugerido !== null && precioConIva !== null && !isNaN(precioConIva)) {
      costoTotalFinal = pedidoSugerido * precioConIva;
    }

    let estado = "SIN REGLAS";
    const hasRule = (minimoVal !== null || maximoVal !== null);
    if (hasRule) {
      if (pedidoSugerido !== null && pedidoSugerido > 0) {
        estado = "PEDIR";
      } else if (exceso > 0) {
        estado = "EXCESO";
      } else {
        estado = "OK";
      }
    }

    return {
      ...row,
      Minimo: minimoVal !== null ? minimoVal : "",
      Maximo: maximoVal !== null ? maximoVal : "",
      PedidoSugerido: pedidoSugerido,
      CostoTotal: costoTotalFinal,
      Exceso: exceso,
      Estado: estado
    };
  });
  console.log(`🔁 agruparConPrecio contiene ${Object.keys(agruparConPrecio).length} SKUs (incluyendo SKUs sin reglas)`);

  console.log("📊 Total rows calculados:", state.rows.length);
  // Debug: contadores rápidos para entender discrepancias
  try {
    const countPedido = state.rows.filter(r => r.PedidoSugerido > 0).length;
    const countWithRule = state.rows.filter(r => (r.Minimo !== '' && r.Minimo !== undefined) || (r.Maximo !== '' && r.Maximo !== undefined)).length;
    console.log(`🐞 Debug - rows with PedidoSugerido>0: ${countPedido}, rows with Min/Max: ${countWithRule}`);
    const samplePedido = state.rows.filter(r => r.PedidoSugerido > 0).slice(0, 20).map(r => r.SKU + (r.Minimo !== '' || r.Maximo !== '' ? ' (rule)' : '')).join(', ');
    if (samplePedido) console.log(`🐞 Debug - sample SKUs with pedido: ${samplePedido}`);
  } catch (e) {
    console.warn('🐞 Debug logging failed:', e);
  }

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
      
      const inventario = r.Inventario;
      
      // Verificar si está en mínimo o por debajo de él
      const minimo = r.Minimo;
      const estaEnMinimo = (minimo !== undefined && minimo !== "" && minimo !== null && !isNaN(minimo)) 
                            ? Number(inventario) <= Number(minimo) 
                            : false;
      
      if (!window.inventoryPedidoFilter.includeZero && !window.inventoryPedidoFilter.includeAtMin) return true;
      if (window.inventoryPedidoFilter.includeZero && window.inventoryPedidoFilter.includeAtMin) return true;
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