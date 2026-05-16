// js/engine.js

/**
 * Escanea dinámicamente las primeras 20 filas para encontrar la cabecera real del Excel.
 * Ignora filas vacías, títulos superiores o logos, y mapea las columnas de datos.
 * @param {Object} sheet - Objeto de la hoja de cálculo de SheetJS.
 * @returns {Array<Object>} Un arreglo de objetos mapeados por el nombre de su columna.
 */
function parseSheetWithAutoHeader(sheet) {
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (!aoa.length) return [];
  
  let headerRowIndex = 0;
  
  // Buscar heurísticamente la fila de cabeceras (máximo fila 20)
  for (let i = 0; i < Math.min(20, aoa.length); i++) {
    const row = Array.isArray(aoa[i]) ? aoa[i] : [];
    const joined = norm(row.join(" | "));
    const looksLikeHeader = (joined.includes("codigo") || joined.includes("sku")) &&
      (joined.includes("existencia") || joined.includes("inventario") || joined.includes("stock"));
    
    if (looksLikeHeader) { 
      headerRowIndex = i; 
      break; 
    }
  }
  
  // Normalizar nombres de cabeceras o asignar genéricos si vienen vacíos
  const headerRow = (aoa[headerRowIndex] || []).map((h, idx) => {
    const clean = String(h || "").trim();
    return clean || `Columna_${idx + 1}`;
  });
  
  const rows = [];
  // Procesar filas de datos hacia abajo
  for (let i = headerRowIndex + 1; i < aoa.length; i++) {
    const dataRow = aoa[i] || [];
    if (!dataRow.length) continue;
    
    const hasContent = dataRow.some(v => String(v || "").trim() !== "");
    if (!hasContent) continue;
    
    const obj = {};
    headerRow.forEach((h, idx) => { 
      obj[h] = dataRow[idx] !== undefined ? dataRow[idx] : ""; 
    });
    rows.push(obj);
  }
  return rows;
}

/**
 * Aplica el motor de reglas (mínimos, máximos, prioridades de bases de datos internas/archivo)
 * para calcular el pedido sugerido, excesos y estado de inventario para una sola fila.
 */
function computeRow(row, map) {
  const sku = String(row[map.sku] || "").trim();
  const productoArchivo = String(row[map.producto] || "").trim();
  const inventario = toNum(row[map.inventario]);
  
  // Prioridad 1: Reglas administrativas centralizadas en Firebase/State
  const adminRule = state.adminRules ? (state.adminRules[sku] || null) : null;
  const adminMin = adminRule ? toNumOrNull(adminRule.minimo) : null;
  const adminMax = adminRule ? toNumOrNull(adminRule.maximo) : null;
  const productoAdmin = adminRule ? String(adminRule.producto || "").trim() : "";
  
  const producto = productoArchivo || productoAdmin;
  
  // Prioridad 2: Buscar reglas locales en el propio archivo cargado si existen
  const tieneMin = map.minimo && row[map.minimo] !== undefined && String(row[map.minimo]).trim() !== "";
  const tieneMax = map.maximo && row[map.maximo] !== undefined && String(row[map.maximo]).trim() !== "";
  const minimoArchivo = tieneMin ? toNum(row[map.minimo]) : 0;
  const maximoArchivo = tieneMax ? toNum(row[map.maximo]) : 0;
  
  // Fusión lógica: Mínimo/Máximo administrativo manda sobre el del archivo
  const minimo = adminMin !== null ? adminMin : minimoArchivo;
  const maximo = adminMax !== null ? adminMax : maximoArchivo;
  const consumoMensual = map.consumo ? toNum(row[map.consumo]) : 0;
  
  // Buscar Costo Unitario en archivo, si no, usar catálogo maestro cruzado en state
  const tienePrecio = map.precio && row[map.precio] !== undefined && String(row[map.precio]).trim() !== "";
  const precioArchivo = tienePrecio ? toNum(row[map.precio]) : null;
  
  const lookupKey = sku.toUpperCase();
  const costoUnitario = precioArchivo !== null ? precioArchivo : (state.preciosLookup ? (state.preciosLookup[lookupKey] || null) : null);
  
  const hasMin = adminMin !== null || tieneMin;
  const hasMax = adminMax !== null || tieneMax;
  
  // 📐 Algoritmo de Reabastecimiento (Fórmula de Pedido Sugerido)
  let pedidoSugerido = 0;
  if (hasMin && inventario <= minimo) {
    if (hasMax && maximo > 0) {
      pedidoSugerido = Math.max(0, Math.ceil(maximo - inventario)); // Llenar hasta el tope (Máximo)
    } else {
      pedidoSugerido = Math.max(0, Math.ceil(minimo - inventario)); // Recuperar stock crítico hasta el Mínimo
    }
  }
  
  const exceso = hasMax ? Math.max(0, Math.ceil(inventario - maximo)) : 0;
  const costoTotal = (costoUnitario !== null ? pedidoSugerido * costoUnitario : "");
  
  // Clasificación de Estados
  let estado = "SIN REGLAS";
  if (hasMin || hasMax) {
    if (pedidoSugerido > 0) estado = "PEDIR";
    else if (exceso > 0) estado = "EXCESO";
    else estado = "OK";
  }
  
  return {
    SKU: sku,
    Producto: producto,
    Inventario: inventario,
    CostoUnitario: costoUnitario !== null ? costoUnitario : "",
    Minimo: hasMin ? minimo : "",
    Maximo: hasMax ? maximo : "",
    ConsumoMensual: consumoMensual,
    PedidoSugerido: pedidoSugerido,
    CostoTotal: costoTotal,
    Exceso: exceso,
    Estado: estado
  };
}

/**
 * Gatillo principal de recalculación. Corre la matriz completa de datos, actualiza las
 * métricas generales y refresca las vistas aplicando filtros activos.
 */
function recalculateRows() {
  if (!state.rawJson || !state.rawJson.length || !state.columnMap) return;
  
  // Procesa y filtra filas sin SKU válido
  state.rows = state.rawJson.map(r => computeRow(r, state.columnMap)).filter(r => r.SKU);
  
  updateMetrics(state.rows);
  
  // Nota: Asegúrate de que applyFilterAndSearch esté definido en tu controlador de renderizado de tablas
  if (typeof applyFilterAndSearch === "function") {
    applyFilterAndSearch();
  }
}

/**
 * Pinta los números clave directos sobre las tarjetas de KPI del Dashboard.
 */
function updateMetrics(rows) {
  const total = rows.length;
  const conPedido = rows.filter(r => r.PedidoSugerido > 0).length;
  const conExceso = rows.filter(r => r.Exceso > 0).length;
  const totalPedido = rows.reduce((acc, r) => acc + r.PedidoSugerido, 0);
  
  // Elementos del DOM (Usa las funciones utils.js sanitizadas/formateadas)
  const elTotal = document.getElementById("mTotal");
  const elPedido = document.getElementById("mPedido");
  const elExceso = document.getElementById("mExceso");
  const elCantPedido = document.getElementById("mCantPedido");
  
  if (elTotal) elTotal.innerText = fmt(total);
  if (elPedido) elPedido.innerHTML = `${fmt(conPedido)} <span style="font-size:11px;">📦</span>`;
  if (elExceso) elExceso.innerHTML = `${fmt(conExceso)} <span style="font-size:11px;">⚠️</span>`;
  if (elCantPedido) elCantPedido.innerText = fmt(totalPedido);
}