// js/ui.js

// ============================================================
// SECCIÓN 1: RENDERIZADO DE TABLA PRINCIPAL CON PAGINACIÓN
// ============================================================

// Estado de ordenamiento y paginación
if (typeof window.sortState === 'undefined') {
  window.sortState = {
    column: 'Inventario',
    direction: 'desc'
  };
}

// Estado de paginación para el reporte
if (typeof window.reportPageState === 'undefined') {
  window.reportPageState = {
    currentPage: 1,
    pageSize: 10
  };
}

// Estado del filtro de inventario para pedido
if (typeof window.inventoryPedidoFilter === 'undefined') {
  window.inventoryPedidoFilter = {
    includeZero: true,
    includeAtMin: true
  };
}

// Función global para confirmar eliminación
function confirmDeleteProduct(sku, producto) {
  if (confirm(`¿Deseas eliminar "${producto}" (${sku}) de la lista de pedido?`)) {
    state.rows = state.rows.filter(item => item.SKU !== sku);
    if (typeof updateMetrics === "function") updateMetrics(state.rows);
    if (typeof resetReportPagination === "function") resetReportPagination();
    if (typeof applyFilterAndSearch === "function") applyFilterAndSearch();
    if (typeof setStatus === "function") setStatus(`✅ Producto "${producto}" eliminado`, false);
  }
}

// Función para verificar si un producto está en su mínimo
function isProductoEnMinimo(producto) {
  const minimo = producto.Minimo;
  const inventario = producto.Inventario;
  
  if (minimo !== undefined && minimo !== "" && minimo !== null && !isNaN(minimo)) {
    return Number(inventario) === Number(minimo);
  }
  return false;
}

// Función para recalcular el total del pedido según el filtro de inventario seleccionado
function recalcularTotalPorFiltroInventario() {
  if (!state.rows || state.rows.length === 0) return 0;
  
  let productosParaPedido = state.rows.filter(r => r.PedidoSugerido > 0);
  
  productosParaPedido = productosParaPedido.filter(r => {
    const inventario = r.Inventario;
    const estaEnMinimo = isProductoEnMinimo(r);
    
    // SI ES MANUAL, SIEMPRE INCLUIR
    if (r._manual === true) return true;
    
    if (window.inventoryPedidoFilter.includeZero && !window.inventoryPedidoFilter.includeAtMin) {
      return inventario === 0;
    }
    if (!window.inventoryPedidoFilter.includeZero && window.inventoryPedidoFilter.includeAtMin) {
      return estaEnMinimo;
    }
    if (window.inventoryPedidoFilter.includeZero && window.inventoryPedidoFilter.includeAtMin) {
      return (inventario === 0 || estaEnMinimo);
    }
    return true;
  });
  
  const subtotalSinIva = productosParaPedido.reduce((acc, r) => {
    return acc + (r.CostoTotal !== null && !isNaN(r.CostoTotal) ? r.CostoTotal : 0);
  }, 0);
  
  const totalConIva = subtotalSinIva * 1.14;
  
  const elCantPedido = document.getElementById("mCantPedido");
  if (elCantPedido) {
    elCantPedido.textContent = "$" + totalConIva.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  
  const elPedido = document.getElementById("mPedido");
  if (elPedido) {
    elPedido.textContent = productosParaPedido.length;
  }
  
  return totalConIva;
}

// Función para cambiar el filtro de inventario desde el select
function setInventoryPedidoFilter(value) {
  if (value === "zero") {
    window.inventoryPedidoFilter.includeZero = true;
    window.inventoryPedidoFilter.includeAtMin = false;
  } else if (value === "atMin") {
    window.inventoryPedidoFilter.includeZero = false;
    window.inventoryPedidoFilter.includeAtMin = true;
  } else if (value === "both") {
    window.inventoryPedidoFilter.includeZero = true;
    window.inventoryPedidoFilter.includeAtMin = true;
  } else if (value === "all") {
    window.inventoryPedidoFilter.includeZero = false;
    window.inventoryPedidoFilter.includeAtMin = false;
  }
  
  const select = document.getElementById("inventoryPedidoSelect");
  if (select) select.value = value;
  
  recalcularTotalPorFiltroInventario();
  
  if (state.activeFilter === "pedido") {
    resetReportPagination();
    applyFilterAndSearch();
  }
  
  let mensaje = "";
  if (value === "zero") mensaje = "🔴 Mostrando solo productos con inventario = 0";
  else if (value === "atMin") mensaje = "🟡 Mostrando solo productos con inventario en su mínimo";
  else if (value === "both") mensaje = "🟠 Mostrando productos con inventario = 0 y en mínimo";
  else mensaje = "📊 Mostrando todos los productos con pedido";
  
  mostrarNotificacion(mensaje, false);
}

// Función para obtener los productos a exportar según el filtro seleccionado
function getProductosParaExportar() {
  if (!state.rows || state.rows.length === 0) return [];
  
  return state.rows.filter(r => {
    if (r.PedidoSugerido <= 0) return false;
    const inventario = r.Inventario;
    const estaEnMinimo = isProductoEnMinimo(r);
    
    // SI ES MANUAL, SIEMPRE INCLUIR
    if (r._manual === true) return true;
    
    if (window.inventoryPedidoFilter.includeZero && !window.inventoryPedidoFilter.includeAtMin) {
      return inventario === 0;
    }
    if (!window.inventoryPedidoFilter.includeZero && window.inventoryPedidoFilter.includeAtMin) {
      return estaEnMinimo;
    }
    if (window.inventoryPedidoFilter.includeZero && window.inventoryPedidoFilter.includeAtMin) {
      return (inventario === 0 || estaEnMinimo);
    }
    return true;
  });
}

function renderTableDynamic(data, filterType) {
  const thead = document.getElementById("tableHeader");
  const tbody = document.getElementById("tableBody");
  if (!thead || !tbody) return;

  const activeFilter = String(filterType || "todos").toLowerCase();

  let columns = [];
  
  if (activeFilter === "pedido" || activeFilter === "pedir") {
    columns = [
      { key: "SKU", label: "SKU", sortable: true },
      { key: "Producto", label: "Producto", sortable: false },
      { key: "Inventario", label: "Inventario", sortable: true },
      { key: "CostoUnitario", label: "Costo unitario", sortable: true },
      { key: "PedidoSugerido", label: "Pedido", sortable: true },
      { key: "CostoTotal", label: "Costo total", sortable: true },
      { key: "Acciones", label: "", sortable: false }
    ];
  } else if (activeFilter === "exceso") {
    columns = [
      { key: "SKU", label: "SKU", sortable: true },
      { key: "Producto", label: "Producto", sortable: false },
      { key: "Inventario", label: "Inventario", sortable: true },
      { key: "CostoUnitario", label: "Costo unitario", sortable: true },
      { key: "CostoTotal", label: "Costo total", sortable: true },
      { key: "Exceso", label: "Exceso", sortable: true },
      { key: "Acciones", label: "", sortable: false }
    ];
  } else if (activeFilter === "ok") {
    columns = [
      { key: "SKU", label: "SKU", sortable: true },
      { key: "Producto", label: "Producto", sortable: false },
      { key: "Inventario", label: "Inventario", sortable: true },
      { key: "CostoUnitario", label: "Costo unitario", sortable: true },
      { key: "CostoTotal", label: "Costo total", sortable: true },
      { key: "Estado", label: "Estado", sortable: false },
      { key: "Acciones", label: "", sortable: false }
    ];
  } else if (activeFilter === "zero") {
    columns = [
      { key: "SKU", label: "SKU", sortable: true },
      { key: "Producto", label: "Producto", sortable: false },
      { key: "Inventario", label: "Inventario", sortable: true },
      { key: "CostoUnitario", label: "Costo unitario", sortable: true },
      { key: "Minimo", label: "Minimo", sortable: true },
      { key: "Maximo", label: "Maximo", sortable: true },
      { key: "PedidoSugerido", label: "Pedido", sortable: true },
      { key: "CostoTotal", label: "Costo total", sortable: true },
      { key: "Acciones", label: "", sortable: false }
    ];
  } else {
    columns = [
      { key: "SKU", label: "SKU", sortable: true },
      { key: "Producto", label: "Producto", sortable: false },
      { key: "Inventario", label: "Inventario", sortable: true },
      { key: "CostoUnitario", label: "Costo unitario", sortable: true },
      { key: "PedidoSugerido", label: "Pedido", sortable: true },
      { key: "CostoTotal", label: "Costo total", sortable: true },
      { key: "Estado", label: "Estado", sortable: false },
      { key: "Acciones", label: "", sortable: false }
    ];
  }

  thead.innerHTML = `<tr>${columns.map(col => {
    let sortIcon = '';
    if (col.sortable) {
      if (window.sortState.column === col.key) {
        sortIcon = window.sortState.direction === 'desc' ? ' 🔽' : ' 🔼';
      } else if (col.key === 'Inventario' && !window.sortState.column) {
        sortIcon = ' 🔽';
      }
      return `<th style="cursor: pointer;" onclick="sortTable('${col.key}')">${col.label}${sortIcon}</th>`;
    }
    return `<th>${col.label}</th>`;
  }).join('')}</tr>`;

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${columns.length}" style="text-align:center; padding:40px;">No hay productos que coincidan con el filtro seleccionado<\/td><\/tr>`;
    document.getElementById("reportPagination")?.remove();
    return;
  }

  let sortedData = [...data];
  if (window.sortState.column) {
    sortedData.sort((a, b) => {
      let valA = a[window.sortState.column];
      let valB = b[window.sortState.column];
      
      if (valA === undefined || valA === null || valA === "") valA = 0;
      if (valB === undefined || valB === null || valB === "") valB = 0;
      
      if (typeof valA === 'number' && typeof valB === 'number') {
        return window.sortState.direction === 'desc' ? valB - valA : valA - valB;
      }
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      if (window.sortState.direction === 'desc') {
        return strB.localeCompare(strA);
      }
      return strA.localeCompare(strB);
    });
  } else {
    sortedData.sort((a, b) => {
      const invA = a.Inventario || 0;
      const invB = b.Inventario || 0;
      return invB - invA;
    });
  }

  const totalItems = sortedData.length;
  const totalPages = Math.ceil(totalItems / window.reportPageState.pageSize);
  const startIndex = (window.reportPageState.currentPage - 1) * window.reportPageState.pageSize;
  const paginatedData = sortedData.slice(startIndex, startIndex + window.reportPageState.pageSize);

  tbody.innerHTML = paginatedData.map(r => {
    let estadoClass = "";
    let estadoTexto = "";
    
    if (r.PedidoSugerido > 0) {
      estadoClass = "tag-danger";
      estadoTexto = "PEDIR";
    } else if (r.Exceso > 0) {
      estadoClass = "tag-warning";
      estadoTexto = "EXCESO";
    } else if (r.Estado === "OK") {
      estadoClass = "tag-ok";
      estadoTexto = "OK";
    } else if (r.Estado === "SIN REGLAS") {
      estadoClass = "";
      estadoTexto = "SIN REGLAS";
    } else {
      estadoTexto = r.Estado || "SIN REGLAS";
    }

    const cells = columns.map(col => {
      let value = r[col.key];
      let className = "";
      let displayValue = "";
      
      if (col.key === "Acciones") {
        return `<td style="text-align: center;">
                  <button type="button" class="btn-delete-row" 
                    style="background:#dc2626; border:none; cursor:pointer; font-size:0.85em; color:white; padding:4px 10px; border-radius:6px;" 
                    onclick="confirmDeleteProduct('${escapeHtml(r.SKU)}', '${escapeHtml(r.Producto)}')">
                    🗑 Eliminar
                  </button>
                  <\/td>`;
      }
      
      if (col.key === "Inventario") {
        const invValue = (value === undefined || value === null || value === "") ? 0 : value;
        const hasMinMax = (r.Minimo && r.Minimo !== "") || (r.Maximo && r.Maximo !== "");
        const estaEnMinimo = isProductoEnMinimo(r);
        const esManual = r._manual === true;
        
        if (invValue === 0 && esManual) {
          displayValue = `<span style="color: var(--warning); font-weight: bold;">0 (manual)</span>`;
        } else if (invValue === 0) {
          displayValue = `<span style="color: var(--danger); font-weight: bold;">0</span>`;
        } else if (estaEnMinimo) {
          displayValue = `<span style="color: var(--warning); font-weight: bold;">${Math.floor(invValue)} (mínimo)</span>`;
        } else {
          displayValue = Math.floor(invValue).toLocaleString("en-US");
        }
        
        if (hasMinMax) {
          displayValue += ` <span class="info-icon" onclick="event.stopPropagation(); showMinMaxInfo('${escapeHtml(r.SKU)}')" title="Ver Minimo y Maximo">i</span>`;
        }
      }
      else if (col.key === "PedidoSugerido" && r.PedidoSugerido > 0) {
        className = "tag-danger";
        displayValue = `<input type="number" class="pedido-sugerido-input" data-sku="${escapeHtml(r.SKU)}" 
          value="${Math.max(0, Number(r.PedidoSugerido))}" min="0" step="1"
          style="width:80px; padding:4px; border:1px solid var(--border); border-radius:6px; text-align: center;" />`;
      } 
      else if (col.key === "CostoUnitario") {
        if (value !== null && value !== "" && !isNaN(value) && value > 0) {
          displayValue = `$${fmt(value)}`;
        } else {
          displayValue = `<span style="color: var(--warning);" title="Precio no definido">Sin precio</span>`;
        }
      }
      else if (col.key === "CostoTotal") {
        if (value !== null && value !== "" && !isNaN(value) && value > 0) {
          displayValue = `$${fmt(value)}`;
        } else {
          displayValue = "-";
        }
      }
      else if (col.key === "Estado") {
        displayValue = estadoTexto;
        className = estadoClass;
      }
      else if (col.key === "Minimo") {
        displayValue = (value && value !== "") ? value : "-";
      }
      else if (col.key === "Maximo") {
        displayValue = (value && value !== "") ? value : "-";
      }
      else if (value === "" || value === undefined || value === null) {
        displayValue = "-";
      }
      else if (typeof value === "number") {
        displayValue = Math.floor(value).toLocaleString("en-US");
      }
      else {
        displayValue = escapeHtml(String(value));
      }

      if (col.key === "Exceso" && r.Exceso > 0) className = "tag-warning";
      if (col.key === "PedidoSugerido" && r.PedidoSugerido > 0) className = "tag-danger";

      const isNumeric = ["Inventario", "CostoUnitario", "PedidoSugerido", "CostoTotal", "Exceso", "Minimo", "Maximo"].includes(col.key);
      const styleAlign = isNumeric ? ' style="text-align: right;"' : '';

      return `<td class="${className}"${styleAlign}>${displayValue}<\/td>`;
    }).join('');

    return `<tr>${cells}<\/tr>`;
  }).join('');

  renderReportPagination(totalPages, totalItems);

  tbody.querySelectorAll('.pedido-sugerido-input').forEach(input => {
    input.removeEventListener('input', handlePedidoSugeridoChange);
    input.addEventListener('input', handlePedidoSugeridoChange);
    
    input.addEventListener('keydown', function(e) {
      e.stopPropagation();
      const allowedKeys = ['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
      if (!allowedKeys.includes(e.key) && !/^[0-9]$/.test(e.key)) {
        e.preventDefault();
      }
    });
  });
}

function renderReportPagination(totalPages, totalItems) {
  const existingPagination = document.getElementById("reportPagination");
  if (existingPagination) existingPagination.remove();
  
  if (totalPages <= 1) return;
  
  const paginationDiv = document.createElement("div");
  paginationDiv.id = "reportPagination";
  paginationDiv.className = "pagination";
  paginationDiv.style.marginTop = "16px";
  paginationDiv.style.display = "flex";
  paginationDiv.style.gap = "8px";
  paginationDiv.style.flexWrap = "wrap";
  paginationDiv.style.alignItems = "center";
  paginationDiv.style.justifyContent = "center";
  
  const currentPage = window.reportPageState.currentPage;
  
  const prevBtn = document.createElement("button");
  prevBtn.textContent = "« Anterior";
  prevBtn.disabled = currentPage <= 1;
  prevBtn.addEventListener("click", () => {
    if (currentPage > 1) {
      window.reportPageState.currentPage--;
      applyFilterAndSearch();
    }
  });
  paginationDiv.appendChild(prevBtn);
  
  const maxButtons = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  
  if (endPage - startPage + 1 < maxButtons) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }
  
  if (startPage > 1) {
    const firstBtn = document.createElement("button");
    firstBtn.textContent = "1";
    firstBtn.addEventListener("click", () => {
      window.reportPageState.currentPage = 1;
      applyFilterAndSearch();
    });
    paginationDiv.appendChild(firstBtn);
    
    if (startPage > 2) {
      const ellipsis = document.createElement("span");
      ellipsis.textContent = "...";
      ellipsis.style.padding = "0 4px";
      paginationDiv.appendChild(ellipsis);
    }
  }
  
  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement("button");
    pageBtn.textContent = i;
    if (i === currentPage) {
      pageBtn.disabled = true;
      pageBtn.style.backgroundColor = "var(--primary)";
      pageBtn.style.color = "white";
    } else {
      pageBtn.addEventListener("click", () => {
        window.reportPageState.currentPage = i;
        applyFilterAndSearch();
      });
    }
    paginationDiv.appendChild(pageBtn);
  }
  
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      const ellipsis = document.createElement("span");
      ellipsis.textContent = "...";
      ellipsis.style.padding = "0 4px";
      paginationDiv.appendChild(ellipsis);
    }
    const lastBtn = document.createElement("button");
    lastBtn.textContent = totalPages;
    lastBtn.addEventListener("click", () => {
      window.reportPageState.currentPage = totalPages;
      applyFilterAndSearch();
    });
    paginationDiv.appendChild(lastBtn);
  }
  
  const nextBtn = document.createElement("button");
  nextBtn.textContent = "Siguiente »";
  nextBtn.disabled = currentPage >= totalPages;
  nextBtn.addEventListener("click", () => {
    if (currentPage < totalPages) {
      window.reportPageState.currentPage++;
      applyFilterAndSearch();
    }
  });
  paginationDiv.appendChild(nextBtn);
  
  const pageInfo = document.createElement("span");
  pageInfo.className = "page-info";
  pageInfo.textContent = `Página ${currentPage} de ${totalPages} — ${totalItems} productos`;
  paginationDiv.appendChild(pageInfo);
  
  const tableContainer = document.querySelector("#resultTable").parentNode;
  tableContainer.appendChild(paginationDiv);
}

function resetReportPagination() {
  window.reportPageState.currentPage = 1;
}

function sortTable(columnKey) {
  if (window.sortState.column === columnKey) {
    window.sortState.direction = window.sortState.direction === 'desc' ? 'asc' : 'desc';
  } else {
    window.sortState.column = columnKey;
    window.sortState.direction = 'desc';
  }
  resetReportPagination();
  applyFilterAndSearch();
}

function showMinMaxInfo(sku) {
  const product = state.rows.find(r => r.SKU === sku);
  if (product) {
    const minVal = product.Minimo && product.Minimo !== "" ? product.Minimo : "No definido";
    const maxVal = product.Maximo && product.Maximo !== "" ? product.Maximo : "No definido";
    const precio = product.CostoUnitario ? `$${product.CostoUnitario}` : "No definido";
    
    mostrarNotificacion(
      `${product.SKU}\n${product.Producto}\nMínimo: ${minVal}\nMáximo: ${maxVal}\nPrecio: ${precio}\nInventario: ${product.Inventario}`,
      false
    );
  }
}

function handlePedidoSugeridoChange(event) {
  const input = event.target;
  const sku = input.getAttribute('data-sku');
  if (!sku) return;

  let value = parseInt(input.value, 10);
  if (isNaN(value)) value = 0;
  value = Math.max(0, value);
  
  const row = state.rows.find(r => r.SKU === sku);
  if (!row) return;

  row.PedidoSugerido = value;
  row.CostoTotal = (row.CostoUnitario && row.CostoUnitario !== null && row.CostoUnitario > 0) ? row.PedidoSugerido * row.CostoUnitario : "";

  if (row.PedidoSugerido > 0) {
    row.Estado = 'PEDIR';
  } else if (row.Exceso > 0) {
    row.Estado = 'EXCESO';
  } else if (row.Minimo !== '' || row.Maximo !== '') {
    row.Estado = 'OK';
  } else {
    row.Estado = 'SIN REGLAS';
  }

  updateMetrics(state.rows);
  recalcularTotalPorFiltroInventario();
  applyFilterAndSearch();
}

// ============================================================
// SECCIÓN 2: FILTROS Y BÚSQUEDA
// ============================================================

function applyFilterAndSearch() {
  const searchTerm = norm(document.getElementById("searchInput")?.value || "");
  const presFilter = document.getElementById("filterPresentation")?.value || "all";
  
  let filtered = [...state.rows];
  const currentFilter = String(state.activeFilter || "todos").toLowerCase();

  console.log("🔍 Aplicando filtro:", currentFilter);
  console.log("📊 Total rows ANTES de filtrar:", filtered.length);
  console.log("📊 Productos con PedidoSugerido > 0:", filtered.filter(r => r.PedidoSugerido > 0).length);

  if (currentFilter === "pedido" || currentFilter === "pedir") {
    filtered = filtered.filter(r => {
      if (r.PedidoSugerido <= 0) return false;
      
      // SI ES MANUAL, SIEMPRE MOSTRAR
      if (r._manual === true) return true;
      
      const inventario = r.Inventario;
      const estaEnMinimo = isProductoEnMinimo(r);
      
      // Los productos con inventario 0 SIEMPRE se muestran
      if (inventario === 0) return true;
      
      if (window.inventoryPedidoFilter.includeZero && !window.inventoryPedidoFilter.includeAtMin) {
        return inventario === 0;
      }
      if (!window.inventoryPedidoFilter.includeZero && window.inventoryPedidoFilter.includeAtMin) {
        return estaEnMinimo;
      }
      if (window.inventoryPedidoFilter.includeZero && window.inventoryPedidoFilter.includeAtMin) {
        return (inventario === 0 || estaEnMinimo);
      }
      return true;
    });
  } else if (currentFilter === "exceso") {
    filtered = filtered.filter(r => {
      const hasFullRule = (r.Minimo !== "" && r.Minimo !== undefined && r.Minimo !== null) &&
                          (r.Maximo !== "" && r.Maximo !== undefined && r.Maximo !== null);
      return hasFullRule && r.Exceso > 0;
    });
  } else if (currentFilter === "ok") {
    filtered = filtered.filter(r => r.PedidoSugerido === 0 && r.Exceso === 0 && r.Estado !== "SIN REGLAS");
  } else if (currentFilter === "zero") {
    filtered = filtered.filter(r => r.Inventario === 0);
  }

  if (searchTerm) {
    filtered = filtered.filter(r => norm(r.SKU).includes(searchTerm) || norm(r.Producto).includes(searchTerm));
  }

  if (presFilter !== "all") {
    filtered = filtered.filter(r => {
      const skuLower = String(r.SKU || "").toLowerCase().trim();
      if (presFilter === "gal") return skuLower.endsWith("-1");
      if (presFilter === "cub") return skuLower.endsWith("-5");
      if (presFilter === "1/4") return skuLower.endsWith("-1/4");
      if (presFilter === "bot") return skuLower.endsWith("-bot");
      return true;
    });
  }

  console.log("📊 Total rows DESPUÉS de filtrar:", filtered.length);
  
  state.filtered = filtered;
  renderTableDynamic(filtered, currentFilter);

  const filterInfo = document.getElementById("filterInfo");
  if (filterInfo) {
    let filterText = "";
    if (currentFilter === "all" || currentFilter === "todos") filterText = "Mostrando todos los productos";
    else if (currentFilter === "pedido" || currentFilter === "pedir") {
      let tipoFiltro = "";
      if (window.inventoryPedidoFilter.includeZero && !window.inventoryPedidoFilter.includeAtMin) {
        tipoFiltro = " (solo stock = 0)";
      } else if (!window.inventoryPedidoFilter.includeZero && window.inventoryPedidoFilter.includeAtMin) {
        tipoFiltro = " (solo stock en mínimo)";
      } else if (window.inventoryPedidoFilter.includeZero && window.inventoryPedidoFilter.includeAtMin) {
        tipoFiltro = " (stock 0 y en mínimo)";
      } else {
        tipoFiltro = " (todos)";
      }
      filterText = `📦 Productos con pedido${tipoFiltro} (${filtered.length} de ${state.rows.length})`;
    }
    else if (currentFilter === "exceso") filterText = `⚠️ Productos en exceso (${filtered.length} de ${state.rows.length})`;
    else if (currentFilter === "ok") filterText = `✅ Productos dentro del rango (${filtered.length} de ${state.rows.length})`;
    else if (currentFilter === "zero") filterText = `🔴 Productos sin stock (${filtered.length} de ${state.rows.length})`;
    filterInfo.textContent = filterText;
  }
}

// ============================================================
// SECCIÓN 3: MODAL PARA AGREGAR PRODUCTO (VERSIÓN CORREGIDA)
// ============================================================

let selectedProductForOrder = null;

async function asegurarAdminRulesCargado() {
  if (state.adminRules && Object.keys(state.adminRules).length > 0) {
    console.log("✅ adminRules ya cargado:", Object.keys(state.adminRules).length);
    return true;
  }
  
  console.log("🔄 adminRules vacío, intentando cargar...");
  
  if (typeof loadRules === "function") {
    try {
      await loadRules();
    } catch(e) {
      console.error("Error cargando rules:", e);
    }
  }
  
  const savedSinReglas = localStorage.getItem('tecnobahia_skus_sin_reglas');
  if (savedSinReglas) {
    try {
      const skusSinReglas = JSON.parse(savedSinReglas);
      if (!state.adminRules) state.adminRules = {};
      Object.assign(state.adminRules, skusSinReglas);
    } catch(e) {}
  }
  
  return Object.keys(state.adminRules || {}).length > 0;
}

function openAddProductModal() {
  const modal = document.getElementById("modalAddProduct");
  const searchInput = document.getElementById("searchProductInput");
  const resultsDiv = document.getElementById("searchResults");
  const cantidadInput = document.getElementById("manualPedidoCantidad");
  const confirmBtn = document.getElementById("btnConfirmAddProduct");
  
  if (!modal) return;
  
  if (searchInput) searchInput.value = "";
  if (resultsDiv) {
    resultsDiv.innerHTML = '<div style="padding: 20px; text-align: center;">🔄 Cargando productos...</div>';
    resultsDiv.style.display = "block";
  }
  if (cantidadInput) cantidadInput.value = "1";
  selectedProductForOrder = null;
  if (confirmBtn) confirmBtn.disabled = true;
  
  modal.style.display = "flex";
  
  asegurarAdminRulesCargado().then(() => {
    const allResults = searchProductsInListaCompleta("");
    renderSearchResults(allResults);
    searchInput?.focus();
  });
}

function closeAddProductModal() {
  const modal = document.getElementById("modalAddProduct");
  if (modal) modal.style.display = "none";
  selectedProductForOrder = null;
}

function searchProductsInListaCompleta(searchTerm) {
  const term = searchTerm ? searchTerm.toLowerCase().trim() : "";
  const resultsMap = new Map();
  
  if (state.adminRules && Object.keys(state.adminRules).length > 0) {
    Object.keys(state.adminRules).forEach(sku => {
      const skuLower = sku.toLowerCase();
      const producto = (state.adminRules[sku].producto || "").toLowerCase();
      
      const matches = !term || skuLower.includes(term) || producto.includes(term);
      
      if (matches && !resultsMap.has(sku)) {
        const precio = (state.preciosLookup && state.preciosLookup[sku]) ? state.preciosLookup[sku] : 0;
        resultsMap.set(sku, {
          SKU: sku,
          Producto: state.adminRules[sku].producto || sku,
          Precio: precio,
          source: "reglas"
        });
      }
    });
  }
  
  if (state.rows && state.rows.length > 0) {
    state.rows.forEach(row => {
      const skuLower = (row.SKU || "").toLowerCase();
      const producto = (row.Producto || "").toLowerCase();
      
      const matches = !term || skuLower.includes(term) || producto.includes(term);
      
      if (matches && !resultsMap.has(row.SKU)) {
        resultsMap.set(row.SKU, {
          SKU: row.SKU,
          Producto: row.Producto || row.SKU,
          Precio: row.CostoUnitario || 0,
          source: "inventario"
        });
      }
    });
  }
  
  const results = Array.from(resultsMap.values());
  results.sort((a, b) => a.SKU.localeCompare(b.SKU));
  
  return results;
}

function renderSearchResults(results) {
  const resultsDiv = document.getElementById("searchResults");
  if (!resultsDiv) return;
  
  if (!results.length) {
    resultsDiv.innerHTML = '<div style="padding: 20px; text-align: center;">No se encontraron productos</div>';
    resultsDiv.style.display = "block";
    return;
  }
  
  resultsDiv.innerHTML = results.map(item => {
    const precioMostrar = item.Precio > 0 ? `$${fmt(item.Precio)}` : '<span style="color: var(--warning);">Sin precio</span>';
    const sourceIcon = item.source === "precios" ? "💰" : (item.source === "reglas" ? "📋" : "📦");
    return `
      <div class="search-result-item" data-sku="${escapeHtml(item.SKU)}" data-name="${escapeHtml(item.Producto)}" data-price="${item.Precio}">
        <div class="search-result-sku"><strong>${escapeHtml(item.SKU)}</strong> <span style="font-size: 10px;">${sourceIcon}</span></div>
        <div class="search-result-name">${escapeHtml(item.Producto)}</div>
        <div class="search-result-price">${precioMostrar}</div>
      </div>
    `;
  }).join('');
  
  resultsDiv.querySelectorAll('.search-result-item').forEach(el => {
    el.addEventListener('click', () => {
      resultsDiv.querySelectorAll('.search-result-item').forEach(r => r.classList.remove('selected'));
      el.classList.add('selected');
      
      selectedProductForOrder = {
        SKU: el.getAttribute('data-sku'),
        Producto: el.getAttribute('data-name'),
        CostoUnitario: parseFloat(el.getAttribute('data-price')) || 0
      };
      
      const confirmBtn = document.getElementById("btnConfirmAddProduct");
      if (confirmBtn) confirmBtn.disabled = false;
    });
  });
  
  resultsDiv.style.display = "block";
}

// FUNCIÓN CORREGIDA - AHORA SÍ AGREGA LOS PRODUCTOS CON PRECIO Y FORZA INVENTARIO A 0
function addProductToPedido() {
  if (!selectedProductForOrder) {
    setStatus("Selecciona un producto primero.", true);
    return;
  }
  
  const cantidadInput = document.getElementById("manualPedidoCantidad");
  const cantidad = parseInt(cantidadInput?.value, 10);
  if (isNaN(cantidad) || cantidad < 1) {
    setStatus("Ingresa una cantidad válida (mínimo 1).", true);
    return;
  }
  
  const sku = selectedProductForOrder.SKU;
  let precio = selectedProductForOrder.CostoUnitario;
  const producto = selectedProductForOrder.Producto;
  
  // SI EL PRECIO ES 0 O NULO, PEDIR AL USUARIO QUE INGRESE UN PRECIO
  if (!precio || precio === 0) {
    const precioIngresado = prompt(`El producto "${sku}" no tiene precio definido.\nIngresa el precio unitario SIN IVA:`);
    if (precioIngresado === null) {
      setStatus("Operación cancelada", true);
      return;
    }
    precio = parseFloat(precioIngresado);
    if (isNaN(precio) || precio <= 0) {
      setStatus("Precio inválido. Debe ser un número mayor a 0.", true);
      return;
    }
  }
  
  console.log("📦 Agregando producto manual:", { sku, precio, producto, cantidad });
  
  // 1. Agregar a listaCompleta con el precio
  if (!state.listaCompleta) state.listaCompleta = [];
  const existingInLista = state.listaCompleta.find(item => item.CODIGO === sku);
  if (!existingInLista) {
    state.listaCompleta.push({
      CODIGO: sku,
      DESCRIPCION: producto,
      PRECIO_SIN_IVA: precio
    });
    if (!state.preciosLookup) state.preciosLookup = {};
    state.preciosLookup[sku] = precio;
    if (typeof saveListaCompleta === "function") saveListaCompleta();
  } else {
    existingInLista.PRECIO_SIN_IVA = precio;
    state.preciosLookup[sku] = precio;
    if (typeof saveListaCompleta === "function") saveListaCompleta();
  }
  
  // 2. Agregar a adminRules
  if (!state.adminRules) state.adminRules = {};
  if (!state.adminRules[sku]) {
    state.adminRules[sku] = {
      minimo: 0,
      maximo: cantidad,
      producto: producto
    };
    if (typeof persistRules === "function") persistRules();
  } else {
    if (!state.adminRules[sku].producto) state.adminRules[sku].producto = producto;
    if (cantidad > state.adminRules[sku].maximo) {
      state.adminRules[sku].maximo = cantidad;
    }
    if (typeof persistRules === "function") persistRules();
  }
  
  // 3. Agregar o actualizar en state.rows MANUALMENTE (FORZANDO INVENTARIO A 0)
  if (!state.rows) state.rows = [];
  
  const existingRow = state.rows.find(r => r.SKU === sku);
  
  if (existingRow) {
    // ACTUALIZAR existente - FORZAR inventario a 0 y pedido a cantidad
    existingRow.PedidoSugerido = cantidad;
    existingRow.CostoTotal = precio * cantidad;
    existingRow.Estado = "PEDIR";
    existingRow.CostoUnitario = precio;
    existingRow.Inventario = 0; // FORZAR INVENTARIO A 0
    existingRow.Minimo = state.adminRules[sku]?.minimo ?? 0;
    existingRow.Maximo = state.adminRules[sku]?.maximo ?? cantidad;
    if (!existingRow.Producto || existingRow.Producto === "Sin nombre") {
      existingRow.Producto = producto;
    }
    existingRow._manual = true; // Marcar como agregado manualmente
    console.log("✏️ Producto actualizado (FORZADO inventario 0):", existingRow);
  } else {
    // AGREGAR NUEVO - FORZAR inventario a 0
    const newRow = {
      SKU: sku,
      Producto: producto,
      Inventario: 0, // FORZAR INVENTARIO A 0
      CostoUnitario: precio,
      Minimo: state.adminRules[sku]?.minimo ?? 0,
      Maximo: state.adminRules[sku]?.maximo ?? cantidad,
      ConsumoMensual: 0,
      PedidoSugerido: cantidad,
      CostoTotal: precio * cantidad,
      Exceso: 0,
      Estado: "PEDIR",
      _manual: true // Marcar como agregado manualmente
    };
    state.rows.push(newRow);
    console.log("➕ Nuevo producto agregado (FORZADO inventario 0):", newRow);
  }
  
  console.log("📊 Total products en state.rows:", state.rows.length);
  console.log("📊 Productos con PedidoSugerido > 0:", state.rows.filter(r => r.PedidoSugerido > 0).length);
  
  // 4. NO LLAMAR A recalculateRows() - SOLO ACTUALIZAR LA TABLA
  
  // 5. Cambiar al filtro de pedido
  state.activeFilter = "pedido";
  const chips = document.querySelectorAll(".filter-chip");
  chips.forEach(chip => {
    if (chip.getAttribute("data-filter") === "pedido") {
      chip.classList.add("active");
    } else {
      chip.classList.remove("active");
    }
  });
  
  // 6. Resetear paginación
  resetReportPagination();
  
  // 7. Actualizar métricas
  if (typeof updateMetrics === "function") updateMetrics(state.rows);
  
  // 8. Recalcular total
  recalcularTotalPorFiltroInventario();
  
  // 9. APLICAR FILTROS DIRECTAMENTE
  applyFilterAndSearch();
  
  // 10. Cerrar modal
  closeAddProductModal();
  
  // 11. Actualizar botón de exportación
  if (typeof updateExportButtonState === "function") updateExportButtonState();
  
  setStatus(`✅ Producto agregado al pedido: ${sku} - ${cantidad} unidades a $${precio} c/u`, false);
  mostrarNotificacion(`✅ "${producto}" agregado al pedido (${cantidad} unidades a $${precio})`, false);
}

function initManualProductModal() {
  const addBtn = document.getElementById("btnAddProductToOrder");
  const closeBtn = document.getElementById("btnCloseModal");
  const confirmBtn = document.getElementById("btnConfirmAddProduct");
  const searchInput = document.getElementById("searchProductInput");
  const modal = document.getElementById("modalAddProduct");
  
  if (!addBtn) {
    console.warn("⚠️ Botón btnAddProductToOrder no encontrado");
    return;
  }
  
  addBtn.addEventListener("click", openAddProductModal);
  if (closeBtn) closeBtn.addEventListener("click", closeAddProductModal);
  if (confirmBtn) confirmBtn.addEventListener("click", addProductToPedido);
  
  let searchTimeout;
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const results = searchProductsInListaCompleta(e.target.value);
        renderSearchResults(results);
      }, 300);
    });
  }
  
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeAddProductModal();
    });
  }
  
  const cantidadInput = document.getElementById("manualPedidoCantidad");
  if (cantidadInput) {
    cantidadInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && confirmBtn && !confirmBtn.disabled) addProductToPedido();
    });
  }
}

// ============================================================
// SECCIÓN 4: ADMINISTRACIÓN
// ============================================================

function renderAdminTable(data) {
  const tbody = document.querySelector("#adminTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">No hay SKUs registrados<\/td><\/tr>';
    return;
  }
  
  data.forEach(r => {
    const tr = document.createElement("tr");
    const nombreProducto = r.Producto && r.Producto !== "" ? r.Producto : "Sin nombre";
    tr.innerHTML = `
        <td>${escapeHtml(r.SKU)}<\/td>
        <td>${escapeHtml(nombreProducto)}<\/td>
        <td><input type="number" min="0" step="1" data-role="min" data-sku="${escapeHtml(r.SKU)}" value="${escapeHtml(r.Minimo)}" style="width:90px;"><\/td>
        <td><input type="number" min="0" step="1" data-role="max" data-sku="${escapeHtml(r.SKU)}" value="${escapeHtml(r.Maximo)}" style="width:90px;"><\/td>
        <td><button class="btn-secondary" style="background:var(--danger); color:white; padding:4px 8px;" data-delete-sku="${escapeHtml(r.SKU)}">🗑<\/button><\/td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('[data-delete-sku]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sku = btn.getAttribute('data-delete-sku');
      if (confirm(`Eliminar reglas para el SKU "${sku}"?`)) {
        delete state.adminRules[sku];
        if (typeof persistRules === "function") persistRules();
        if (typeof recalculateRows === "function") recalculateRows();
        if (typeof applyAdminFilter === "function") applyAdminFilter();
        if (typeof updateReglasStatusDisplay === "function") updateReglasStatusDisplay();
        setStatus(`Reglas eliminadas para ${sku}`);
      }
    });
  });
}

function renderAdminPagination(currentPage, totalPages, totalItems) {
  const paginationEl = document.getElementById('adminPagination');
  if (!paginationEl) return;
  paginationEl.innerHTML = '';
  
  if (totalPages <= 1) {
    paginationEl.textContent = totalItems ? `Página ${currentPage} de ${totalPages} — ${totalItems} SKUs` : '';
    return;
  }

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '« Anterior';
  prevBtn.disabled = currentPage <= 1;
  prevBtn.addEventListener('click', () => {
    state.adminPage = Math.max(1, state.adminPage - 1);
    if (typeof applyAdminFilter === "function") applyAdminFilter();
  });

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Siguiente »';
  nextBtn.disabled = currentPage >= totalPages;
  nextBtn.addEventListener('click', () => {
    state.adminPage = Math.min(totalPages, state.adminPage + 1);
    if (typeof applyAdminFilter === "function") applyAdminFilter();
  });

  const pageInfo = document.createElement('span');
  pageInfo.className = 'page-info';
  pageInfo.textContent = `Página ${currentPage} de ${totalPages} — ${totalItems} SKUs`;

  function createPageButton(page) {
    const btn = document.createElement('button');
    btn.textContent = page;
    btn.disabled = page === currentPage;
    if (page !== currentPage) {
      btn.addEventListener('click', () => {
        state.adminPage = page;
        if (typeof applyAdminFilter === "function") applyAdminFilter();
      });
    }
    return btn;
  }

  paginationEl.appendChild(prevBtn);
  if (currentPage > 2) paginationEl.appendChild(createPageButton(1));
  if (currentPage > 3) {
    const ellipsis = document.createElement('span');
    ellipsis.textContent = '...';
    ellipsis.style.padding = '0 6px';
    paginationEl.appendChild(ellipsis);
  }
  for (let page = Math.max(1, currentPage - 1); page <= Math.min(totalPages, currentPage + 1); page++) {
    paginationEl.appendChild(createPageButton(page));
  }
  if (currentPage < totalPages - 2) {
    const ellipsis = document.createElement('span');
    ellipsis.textContent = '...';
    ellipsis.style.padding = '0 6px';
    paginationEl.appendChild(ellipsis);
  }
  if (currentPage < totalPages) paginationEl.appendChild(createPageButton(totalPages));
  paginationEl.appendChild(nextBtn);
  paginationEl.appendChild(pageInfo);
}

// ============================================================
// SECCIÓN 5: INICIALIZACIÓN
// ============================================================

function autoSwitchToPedidoFilter() {
  if (!state.rows || state.rows.length === 0) {
    mostrarNotificacion("⚠️ Carga primero un archivo de inventario", true);
    return;
  }
  
  const productosConPedido = state.rows.filter(r => r.PedidoSugerido > 0).length;
  
  state.activeFilter = "pedido";
  
  const chips = document.querySelectorAll(".filter-chip");
  chips.forEach(chip => {
    if (chip.getAttribute("data-filter") === "pedido") {
      chip.classList.add("active");
    } else {
      chip.classList.remove("active");
    }
  });
  
  resetReportPagination();
  applyFilterAndSearch();
  recalcularTotalPorFiltroInventario();
  
  if (productosConPedido === 0) {
    mostrarNotificacion("📊 No hay productos que requieran pedido. Usa el botón '+' para agregar manualmente.", true);
  } else {
    mostrarNotificacion(`📊 Filtro cambiado a "PEDIDO". ${productosConPedido} productos requieren pedido.`, false);
  }
}

function initPresentationFilter() {
  const searchInput = document.getElementById("searchInput");
  if (!searchInput) return;

  let presSelect = document.getElementById("filterPresentation");
  if (!presSelect) {
    presSelect = document.createElement("select");
    presSelect.id = "filterPresentation";
    presSelect.style.cssText = `
      width: auto;
      height: 38px;
      padding: 6px 12px;
      border-radius: 8px;
      vertical-align: middle;
      margin-left: 10px;
      cursor: pointer;
    `;
    
    presSelect.innerHTML = `
      <option value="all">Presentación: Todas</option>
      <option value="gal">Galón (Gal)</option>
      <option value="cub">Cubeta (Cub)</option>
      <option value="1/4">1/4 de Galón (1/4)</option>
      <option value="bot">Botella (Bot)</option>
    `;

    searchInput.parentNode.insertBefore(presSelect, searchInput.nextSibling);
    searchInput.oninput = function() { 
      resetReportPagination();
      applyFilterAndSearch(); 
    };
    presSelect.onchange = function() { 
      resetReportPagination();
      applyFilterAndSearch(); 
    };
  }
  
  function updateSelectStyle() {
    const isDark = document.body.classList.contains('dark');
    if (isDark) {
      presSelect.style.backgroundColor = '#1f2937';
      presSelect.style.color = '#eef2ff';
      presSelect.style.borderColor = '#2d3748';
      presSelect.style.border = '1px solid #2d3748';
    } else {
      presSelect.style.backgroundColor = '#ffffff';
      presSelect.style.color = '#15233b';
      presSelect.style.borderColor = '#d8e0ef';
      presSelect.style.border = '1px solid #d8e0ef';
    }
  }
  
  updateSelectStyle();
  
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.attributeName === 'class') {
        updateSelectStyle();
      }
    });
  });
  observer.observe(document.body, { attributes: true });
}

// Inicialización
setTimeout(initPresentationFilter, 400);