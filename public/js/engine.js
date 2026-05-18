// js/engine.js

function parseSheetWithAutoHeader(sheet) {
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (!aoa.length) return [];
  
  let headerRowIndex = -1;
  
  for (let i = 0; i < Math.min(20, aoa.length); i++) {
    const row = Array.isArray(aoa[i]) ? aoa[i] : [];
    const joined = row.join(" | ");
    
    const hasSKU = joined.includes("Código") || joined.includes("codigo") || joined.includes("SKU");
    const hasInventario = joined.includes("Existencia") || joined.includes("existencia") || joined.includes("Inventario");
    
    if (hasSKU && hasInventario) { 
      headerRowIndex = i; 
      break; 
    }
  }
  
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
  
  if (finalMap.SKU === undefined) finalMap.SKU = 0; 
  if (finalMap.Producto === undefined) finalMap.Producto = 2;
  if (finalMap.Inventario === undefined) finalMap.Inventario = 12;
  if (finalMap.ConsumoMensual === undefined) finalMap.ConsumoMensual = -1;
  
  state.columnMap = finalMap;
  return aoa.slice(headerRowIndex + 1);
}

function computeRow(sku, producto, inventario, map) {
  // Obtener reglas de admin
  const regla = state.adminRules[sku] || {};
  const hasMin = (regla.minimo !== undefined && regla.minimo !== "" && regla.minimo !== null);
  const hasMax = (regla.maximo !== undefined && regla.maximo !== "" && regla.maximo !== null);
  
  const minimo = hasMin ? Number(regla.minimo) : 0;
  const maximo = hasMax ? Number(regla.maximo) : 0;

  // Buscar precio en catálogo
  const precioCatalogoMaster = state.preciosLookup[sku] !== undefined ? state.preciosLookup[sku] : null;

  // Asegurar que inventario sea número
  const stockActual = (inventario === undefined || inventario === null || inventario === "") ? 0 : Number(inventario);

  // Calcular pedido sugerido
  let pedidoSugerido = 0;
  
  if (hasMin && hasMax) {
    // Si tiene reglas completas
    if (stockActual < minimo) {
      pedidoSugerido = maximo - stockActual;
      if (pedidoSugerido < 0) pedidoSugerido = 0;
    }
  } else if (hasMin && !hasMax) {
    // Solo tiene mínimo
    if (stockActual < minimo) {
      pedidoSugerido = minimo - stockActual;
    }
  } else if (!hasMin && !hasMax && stockActual === 0) {
    // Si no tiene reglas pero está en 0, sugerir pedido de 1
    pedidoSugerido = 1;
  }

  const exceso = (hasMax && stockActual > maximo) ? (stockActual - maximo) : 0;

  // Costos
  let costoUnitarioFinal = null;
  let costoTotalFinal = null;

  if (precioCatalogoMaster !== null && !isNaN(precioCatalogoMaster) && precioCatalogoMaster > 0) {
    costoUnitarioFinal = Number(precioCatalogoMaster);
    costoTotalFinal = pedidoSugerido * costoUnitarioFinal;
  }

  // Determinar estado
  let estado = "SIN REGLAS";
  if (hasMin || hasMax) {
    if (pedidoSugerido > 0) estado = "PEDIR";
    else if (exceso > 0) estado = "EXCESO";
    else estado = "OK";
  } else if (stockActual === 0 && pedidoSugerido > 0) {
    estado = "PEDIR";
  }

  return {
    SKU: sku,
    Producto: producto,
    Inventario: stockActual,
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
function recalculateRows() {
  if (!state.rawJson || !state.rawJson.length || !state.columnMap) return;
  
  const map = state.columnMap;
  const agrupar = {};

  state.rawJson.forEach(r => {
    const sku = String(r[map.SKU] || '').trim();
    if (!sku || sku === "Código" || sku.includes("---")) return;

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

  state.rows = Object.values(agrupar).map(item => {
    return computeRow(item.sku, item.producto, item.inventario, map);
  });
  
  updateMetrics(state.rows);
  
  if (typeof applyFilterAndSearch === "function") {
    applyFilterAndSearch();
  }
  
  // 🔥 Actualizar botón de exportación después de recalcular
  if (typeof updateExportButtonState === "function") {
    updateExportButtonState();
    console.log("🔘 Botón actualizado después de recalculateRows, productos con pedido:", state.rows.filter(r => r.PedidoSugerido > 0).length);
  }
}

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