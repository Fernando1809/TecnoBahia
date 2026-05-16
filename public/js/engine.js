// js/engine.js
/**
 * Escanea dinámicamente las primeras 20 filas para encontrar la cabecera real del Excel.
 * Sincronizado para identificar "Código", "Nombre" y "Existencia" con sus mayúsculas y tildes exactas.
 * @param {Object} sheet - Objeto de la hoja de cálculo de SheetJS.
 * @returns {Array<Object>} Un arreglo de objetos mapeados por el nombre de su columna.
 */
function parseSheetWithAutoHeader(sheet) {
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (!aoa.length) return [];
  
  let headerRowIndex = -1;
  
  // Escanear las filas superiores para encontrar el renglón de las columnas
  for (let i = 0; i < Math.min(20, aoa.length); i++) {
    const row = Array.isArray(aoa[i]) ? aoa[i] : [];
    const joined = row.join(" | ");
    
    // Coincidencia exacta con la estructura de tu archivo de Tecno Bahía
    const hasSKU = joined.includes("Código") || joined.includes("codigo") || joined.includes("SKU");
    const hasInventario = joined.includes("Existencia") || joined.includes("existencia") || joined.includes("Inventario");
    
    if (hasSKU && hasInventario) { 
      headerRowIndex = i; 
      break; 
    }
  }
  
  // Salvavidas estricto para tu reporte: si no se detectó por texto, forzar fila índice 4
  if (headerRowIndex === -1) {
    headerRowIndex = aoa.length > 4 ? 4 : 0;
  }
  
  const headerRow = aoa[headerRowIndex] || [];
  const finalMap = {};
  
  headerRow.forEach((colName, idx) => {
    const nameStr = String(colName || "").trim();
    
    if (nameStr === "Código" || nameStr === "codigo" || nameStr === "SKU") {
      finalMap.SKU = idx;
    } else if (nameStr === "Nombre" || nameStr.includes("descripcion") || nameStr === "Producto") {
      finalMap.Producto = idx;
    } else if (nameStr === "Existencia" || nameStr === "inventario" || nameStr === "Cantidad") {
      finalMap.Inventario = idx;
    } else if (nameStr.includes("Costo") || nameStr.includes("precio") || nameStr.includes("Consumo")) {
      finalMap.ConsumoMensual = idx;
    }
  });
  
  // Garantizar asignación de seguridad de índices por descarte
  if (finalMap.SKU === undefined) finalMap.SKU = 0; 
  if (finalMap.Producto === undefined) finalMap.Producto = 2; // Columna 2 es "Nombre" en tu archivo
  if (finalMap.Inventario === undefined) finalMap.Inventario = 12; // Columna 12 es "Existencia" en tu archivo
  if (finalMap.ConsumoMensual === undefined) finalMap.ConsumoMensual = -1;
  
  state.columnMap = finalMap;
  return aoa.slice(headerRowIndex + 1);
}
/**
 * Calcula el estado de una fila consolidada con reglas de administración y precios base.
 */
function computeRow(sku, producto, inventario, map) {
  // Cargar reglas de límites
  const regla = state.adminRules[sku] || {};
  const hasMin = (regla.minimo !== undefined && regla.minimo !== "");
  const hasMax = (regla.maximo !== undefined && regla.maximo !== "");
  
  const minimo = hasMin ? Number(regla.minimo) : 0;
  const maximo = hasMax ? Number(regla.maximo) : 0;

  // Búsqueda en el maestro de precios
  const precioCatalogoMaster = state.preciosLookup[sku] !== undefined ? state.preciosLookup[sku] : null;

  // Cálculo del pedido sugerido
  let pedidoSugerido = 0;
  if (hasMin && hasMax) {
    if (inventario < minimo) {
      pedidoSugerido = maximo - inventario;
      if (pedidoSugerido < 0) pedidoSugerido = 0;
    }
  }

  const exceso = (hasMax && inventario > maximo) ? (inventario - maximo) : 0;

  let costoUnitarioFinal = null;
  let costoTotalFinal = null;

  if (precioCatalogoMaster !== null && !isNaN(precioCatalogoMaster) && precioCatalogoMaster > 0) {
    costoUnitarioFinal = Number(precioCatalogoMaster);
    costoTotalFinal = pedidoSugerido * costoUnitarioFinal;
  } else {
    costoUnitarioFinal = null;
    costoTotalFinal = null;
  }

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
    CostoUnitario: costoUnitarioFinal, 
    Minimo: hasMin ? minimo : "",
    Maximo: hasMax ? maximo : "",
    ConsumoMensual: 0,
    PedidoSugerido: pedidoSugerido,
    CostoTotal: costoTotalFinal,       
    Exceso: exceso,
    Estado: estado
  };
}

/**
 * Agrupa y consolida las existencias de SKUs duplicados antes de procesarlos.
 * Evita que la interfaz colapse o se quede en blanco.
 */
function recalculateRows() {
  if (!state.rawJson || !state.rawJson.length || !state.columnMap) return;
  
  const map = state.columnMap;
  const agrupar = {};

  // Primer paso: Consolidar duplicados sumando las existencias
  state.rawJson.forEach(r => {
    const sku = String(r[map.SKU] || '').trim();
    if (!sku || sku === "Código" || sku.includes("---")) return; // Ignorar basura o cabeceras repetidas

    const producto = String(r[map.Producto] || '').trim();
    const inventario = toNumOrNull(r[map.Inventario]) || 0;

    if (!agrupar[sku]) {
      agrupar[sku] = {
        sku: sku,
        producto: producto,
        inventario: 0
      };
    }
    agrupar[sku].inventario += inventario;
  });

  // Segundo paso: Calcular las reglas sobre los datos ya limpios y unificados
  state.rows = Object.values(agrupar).map(item => {
    return computeRow(item.sku, item.producto, item.inventario, map);
  });
  
  updateMetrics(state.rows);
  
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
  
  const totalPedido = rows.reduce((acc, r) => {
    return acc + (r.CostoTotal !== null && !isNaN(r.CostoTotal) ? r.CostoTotal : 0);
  }, 0);
  
  const elTotal = document.getElementById("mTotal");
  const elPedido = document.getElementById("mPedido");
  const elExceso = document.getElementById("mExceso");
  const elCantPedido = document.getElementById("mCantPedido");
  
  if (elTotal) elTotal.textContent = total;
  if (elPedido) elPedido.textContent = conPedido;
  if (elExceso) elExceso.textContent = conExceso;
  
  if (elCantPedido) {
    elCantPedido.textContent = "$" + totalPedido.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
}