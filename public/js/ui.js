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
// includeZero: true/false - incluir productos con inventario = 0
// includeAtMin: true/false - incluir productos con inventario = minimo definido
if (typeof window.inventoryPedidoFilter === 'undefined') {
  window.inventoryPedidoFilter = {
    includeZero: true,
    includeAtMin: true
  };
}

// Función global para confirmar eliminación (SOLO POR CLIC)
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
  
  // Solo considerar si tiene mínimo definido y es un número válido
  if (minimo !== undefined && minimo !== "" && minimo !== null && !isNaN(minimo)) {
    return Number(inventario) === Number(minimo);
  }
  return false;
}

// Función para recalcular el total del pedido según el filtro de inventario seleccionado
function recalcularTotalPorFiltroInventario() {
  if (!state.rows || state.rows.length === 0) return 0;
  
  // Filtrar productos según selección del usuario
  let productosParaPedido = state.rows.filter(r => r.PedidoSugerido > 0);
  
  // Aplicar filtro por nivel de inventario
  productosParaPedido = productosParaPedido.filter(r => {
    const inventario = r.Inventario;
    
    // Incluir inventario = 0
    if (window.inventoryPedidoFilter.includeZero && inventario === 0) return true;
    
    // Incluir productos en mínimo (inventario === minimo definido)
    if (window.inventoryPedidoFilter.includeAtMin && isProductoEnMinimo(r)) return true;
    
    return false;
  });
  
  // Calcular total sin IVA
  const subtotalSinIva = productosParaPedido.reduce((acc, r) => {
    return acc + (r.CostoTotal !== null && !isNaN(r.CostoTotal) ? r.CostoTotal : 0);
  }, 0);
  
  // Calcular total con IVA
  const totalConIva = subtotalSinIva * 1.14;
  
  // Actualizar el indicador de total
  const elCantPedido = document.getElementById("mCantPedido");
  if (elCantPedido) {
    elCantPedido.textContent = "$" + totalConIva.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  
  // Actualizar contador de productos con pedido según filtro
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
  }
  
  // Recalcular el total mostrado
  recalcularTotalPorFiltroInventario();
  
  // Mostrar notificación
  let mensaje = "";
  if (value === "zero") mensaje = "🔴 Mostrando solo productos con inventario = 0";
  else if (value === "atMin") mensaje = "🟡 Mostrando solo productos con inventario en su mínimo";
  else mensaje = "🟠 Mostrando productos con inventario = 0 y en mínimo";
  
  mostrarNotificacion(mensaje, false);
}

// Función para obtener los productos a exportar según el filtro seleccionado
function getProductosParaExportar() {
  if (!state.rows || state.rows.length === 0) return [];
  
  return state.rows.filter(r => {
    if (r.PedidoSugerido <= 0) return false;
    const inventario = r.Inventario;
    
    if (window.inventoryPedidoFilter.includeZero && inventario === 0) return true;
    if (window.inventoryPedidoFilter.includeAtMin && isProductoEnMinimo(r)) return true;
    
    return false;
  });
}

function renderTableDynamic(data, filterType) {
  const thead = document.getElementById("tableHeader");
  const tbody = document.getElementById("tableBody");
  if (!thead || !tbody) return;

  const activeFilter = String(filterType || "todos").toLowerCase();

  // Definir columnas según el filtro
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

  // Generar encabezados con eventos de ordenamiento
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
    tbody.innerHTML = `<tr><td colspan="${columns.length}" style="text-align:center; padding:40px;">No hay productos que coincidan con el filtro seleccionado</td></tr>`;
    document.getElementById("reportPagination")?.remove();
    return;
  }

  // Aplicar ordenamiento
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
    // Orden por defecto: Inventario de mayor a menor
    sortedData.sort((a, b) => {
      const invA = a.Inventario || 0;
      const invB = b.Inventario || 0;
      return invB - invA;
    });
  }

  // Paginación
  const totalItems = sortedData.length;
  const totalPages = Math.ceil(totalItems / window.reportPageState.pageSize);
  const startIndex = (window.reportPageState.currentPage - 1) * window.reportPageState.pageSize;
  const paginatedData = sortedData.slice(startIndex, startIndex + window.reportPageState.pageSize);

  // Renderizar filas
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
                  </td>`;
      }
      
      if (col.key === "Inventario") {
        const invValue = (value === undefined || value === null || value === "") ? 0 : value;
        const hasMinMax = (r.Minimo && r.Minimo !== "") || (r.Maximo && r.Maximo !== "");
        const estaEnMinimo = isProductoEnMinimo(r);
        
        if (invValue === 0) {
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
          displayValue = `<span style="color: var(--warning);" title="Precio no definido">No definido</span>`;
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

      return `<td class="${className}"${styleAlign}>${displayValue}</td>`;
    }).join('');

    return `<tr>${cells}</tr>`;
  }).join('');

  // Agregar paginación
  renderReportPagination(totalPages, totalItems);

  // Event listeners SOLO para inputs de pedido
  tbody.querySelectorAll('.pedido-sugerido-input').forEach(input => {
    input.removeEventListener('input', handlePedidoSugeridoChange);
    input.addEventListener('input', handlePedidoSugeridoChange);
    
    // Prevenir propagación de eventos de teclado
    input.addEventListener('keydown', function(e) {
      e.stopPropagation();
      // Permitir solo teclas numéricas y de control
      const allowedKeys = ['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
      if (!allowedKeys.includes(e.key) && !/^[0-9]$/.test(e.key)) {
        e.preventDefault();
      }
    });
  });
}

// Función para renderizar paginación del reporte
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

// Resetear paginación cuando cambia el filtro
function resetReportPagination() {
  window.reportPageState.currentPage = 1;
}

// Función para ordenar la tabla
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

// Función para mostrar tooltip con Min y Max
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
  // Recalcular el total según el filtro de inventario actual
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

  // FILTROS EXISTENTES
  if (currentFilter === "pedido" || currentFilter === "pedir") {
    filtered = filtered.filter(r => {
      const hasFullRule = (r.Minimo !== "" && r.Minimo !== undefined && r.Minimo !== null) &&
                          (r.Maximo !== "" && r.Maximo !== undefined && r.Maximo !== null);
      const hasPrice = (r.CostoUnitario !== null && r.CostoUnitario !== undefined && r.CostoUnitario > 0);
      return hasFullRule && hasPrice && r.PedidoSugerido > 0;
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

  state.filtered = filtered;
  renderTableDynamic(filtered, currentFilter);

  const filterInfo = document.getElementById("filterInfo");
  if (filterInfo) {
    let filterText = "";
    if (currentFilter === "all" || currentFilter === "todos") filterText = "Mostrando todos los productos";
    else if (currentFilter === "pedido" || currentFilter === "pedir") filterText = `📦 Productos con pedido (${filtered.length} de ${state.rows.length})`;
    else if (currentFilter === "exceso") filterText = `⚠️ Productos en exceso (${filtered.length} de ${state.rows.length})`;
    else if (currentFilter === "ok") filterText = `✅ Productos dentro del rango (${filtered.length} de ${state.rows.length})`;
    else if (currentFilter === "zero") filterText = `🔴 Productos sin stock (${filtered.length} de ${state.rows.length})`;
    filterInfo.textContent = filterText;
  }
}

// ============================================================
// SECCIÓN 3: MODAL PARA AGREGAR PRODUCTO
// ============================================================

let selectedProductForOrder = null;

function openAddProductModal() {
  const modal = document.getElementById("modalAddProduct");
  const searchInput = document.getElementById("searchProductInput");
  const resultsDiv = document.getElementById("searchResults");
  const cantidadInput = document.getElementById("manualPedidoCantidad");
  const confirmBtn = document.getElementById("btnConfirmAddProduct");
  
  if (!modal) return;
  
  if (searchInput) searchInput.value = "";
  if (resultsDiv) {
    resultsDiv.innerHTML = "";
    resultsDiv.style.display = "none";
  }
  if (cantidadInput) cantidadInput.value = "1";
  selectedProductForOrder = null;
  if (confirmBtn) confirmBtn.disabled = true;
  
  modal.style.display = "flex";
  setTimeout(() => searchInput?.focus(), 100);
}

function closeAddProductModal() {
  const modal = document.getElementById("modalAddProduct");
  if (modal) modal.style.display = "none";
  selectedProductForOrder = null;
}

function searchProductsInListaCompleta(searchTerm) {
  if (!searchTerm || searchTerm.length < 2) return [];
  
  const term = searchTerm.toLowerCase().trim();
  const results = state.listaCompleta.filter(item => {
    const codigo = (item.CODIGO || "").toLowerCase();
    const descripcion = (item.DESCRIPCION || "").toLowerCase();
    return codigo.includes(term) || descripcion.includes(term);
  });
  
  return results.slice(0, 20);
}

function renderSearchResults(results) {
  const resultsDiv = document.getElementById("searchResults");
  if (!resultsDiv) return;
  
  if (!results.length) {
    resultsDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted);">No se encontraron productos</div>';
    resultsDiv.style.display = "block";
    return;
  }
  
  resultsDiv.innerHTML = results.map(item => `
    <div class="search-result-item" data-sku="${escapeHtml(item.CODIGO)}" data-name="${escapeHtml(item.DESCRIPCION)}" data-price="${item.PRECIO_SIN_IVA}">
      <div class="search-result-sku">${escapeHtml(item.CODIGO)}</div>
      <div class="search-result-name">${escapeHtml(item.DESCRIPCION)}</div>
      <div class="search-result-price">$${fmt(item.PRECIO_SIN_IVA)}</div>
    </div>
  `).join('');
  
  resultsDiv.querySelectorAll('.search-result-item').forEach(el => {
    el.addEventListener('click', () => {
      resultsDiv.querySelectorAll('.search-result-item').forEach(r => r.classList.remove('selected'));
      el.classList.add('selected');
      
      selectedProductForOrder = {
        SKU: el.getAttribute('data-sku'),
        Producto: el.getAttribute('data-name'),
        CostoUnitario: parseFloat(el.getAttribute('data-price'))
      };
      
      const confirmBtn = document.getElementById("btnConfirmAddProduct");
      if (confirmBtn) confirmBtn.disabled = false;
    });
  });
  
  resultsDiv.style.display = "block";
}

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
  const precio = selectedProductForOrder.CostoUnitario;
  const producto = selectedProductForOrder.Producto;
  
  const existingRow = state.rows.find(r => r.SKU === sku);
  
  if (existingRow) {
    existingRow.PedidoSugerido = cantidad;
    existingRow.CostoTotal = precio * cantidad;
    existingRow.Estado = "PEDIR";
    setStatus(`Actualizado: ${sku} - ${cantidad} unidades`, false);
  } else {
    const newRow = {
      SKU: sku,
      Producto: producto,
      Inventario: 0,
      CostoUnitario: precio,
      Minimo: "",
      Maximo: "",
      ConsumoMensual: 0,
      PedidoSugerido: cantidad,
      CostoTotal: precio * cantidad,
      Exceso: 0,
      Estado: "PEDIR"
    };
    state.rows.push(newRow);
    setStatus(`Agregado: ${sku} - ${cantidad} unidades`, false);
  }
  
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
  updateMetrics(state.rows);
  recalcularTotalPorFiltroInventario();
  applyFilterAndSearch();
  closeAddProductModal();
  if (typeof updateExportButtonState === "function") updateExportButtonState();
}

function initManualProductModal() {
  const addBtn = document.getElementById("btnAddProductToOrder");
  const closeBtn = document.getElementById("btnCloseModal");
  const confirmBtn = document.getElementById("btnConfirmAddProduct");
  const searchInput = document.getElementById("searchProductInput");
  const modal = document.getElementById("modalAddProduct");
  
  if (!addBtn) return;
  
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
// SECCIÓN 4: ADMINISTRACIÓN (TABLA DE REGLAS)
// ============================================================

function renderAdminTable(data) {
  const tbody = document.querySelector("#adminTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">No hay SKUs registrados</td></tr>';
    return;
  }
  
  data.forEach(r => {
    const tr = document.createElement("tr");
    const nombreProducto = r.Producto && r.Producto !== "" ? r.Producto : "Sin nombre";
    tr.innerHTML = `
        <td>${escapeHtml(r.SKU)}</td>
        <td>${escapeHtml(nombreProducto)}</td>
        <td><input type="number" min="0" step="1" data-role="min" data-sku="${escapeHtml(r.SKU)}" value="${escapeHtml(r.Minimo)}" style="width:90px;"></td>
        <td><input type="number" min="0" step="1" data-role="max" data-sku="${escapeHtml(r.SKU)}" value="${escapeHtml(r.Maximo)}" style="width:90px;"></td>
        <td><button class="btn-secondary" style="background:var(--danger); color:white; padding:4px 8px;" data-delete-sku="${escapeHtml(r.SKU)}">🗑</button></td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('[data-delete-sku]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sku = btn.getAttribute('data-delete-sku');
      if (confirm(`Eliminar reglas para el SKU "${sku}"?`)) {
        delete state.adminRules[sku];
        persistRules();
        recalculateRows();
        applyAdminFilter();
        updateReglasStatusDisplay();
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
    applyAdminFilter();
  });

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Siguiente »';
  nextBtn.disabled = currentPage >= totalPages;
  nextBtn.addEventListener('click', () => {
    state.adminPage = Math.min(totalPages, state.adminPage + 1);
    applyAdminFilter();
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
        applyAdminFilter();
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
// SECCIÓN 5: INICIALIZACIÓN Y AUTO CAMBIO A FILTRO PEDIDO
// ============================================================

function autoSwitchToPedidoFilter() {
  console.log("🔄 autoSwitchToPedidoFilter ejecutándose...");
  console.log("📊 state.rows length:", state.rows ? state.rows.length : 0);
  
  if (!state.rows || state.rows.length === 0) {
    console.log("⚠️ No hay datos para cambiar filtro");
    mostrarNotificacion("⚠️ Carga primero un archivo de inventario", true);
    return;
  }
  
  // Contar cuántos productos tienen pedido (con reglas completas y precio)
  const productosConPedido = state.rows.filter(r => {
    const hasFullRule = (r.Minimo !== "" && r.Minimo !== undefined && r.Minimo !== null) &&
                        (r.Maximo !== "" && r.Maximo !== undefined && r.Maximo !== null);
    const hasPrice = (r.CostoUnitario !== null && r.CostoUnitario !== undefined && r.CostoUnitario > 0);
    return hasFullRule && hasPrice && r.PedidoSugerido > 0;
  }).length;
  
  console.log(`📦 Productos con pedido: ${productosConPedido}`);
  
  // Cambiar el filtro activo a "pedido"
  state.activeFilter = "pedido";
  console.log("✅ state.activeFilter cambiado a:", state.activeFilter);
  
  // Actualizar los chips visualmente
  const chips = document.querySelectorAll(".filter-chip");
  console.log("🔘 Chips encontrados:", chips.length);
  
  let chipPedidoEncontrado = false;
  chips.forEach(chip => {
    const filterValue = chip.getAttribute("data-filter");
    if (filterValue === "pedido") {
      chip.classList.add("active");
      chipPedidoEncontrado = true;
      console.log("✅ Chip 'pedido' activado");
    } else {
      chip.classList.remove("active");
    }
  });
  
  if (!chipPedidoEncontrado) {
    console.warn("⚠️ No se encontró el chip con data-filter='pedido'");
  }
  
  // Resetear paginación y aplicar filtro
  if (typeof resetReportPagination === "function") {
    resetReportPagination();
    console.log("✅ Paginación reseteada");
  } else {
    console.warn("⚠️ resetReportPagination no encontrada");
    if (window.reportPageState) window.reportPageState.currentPage = 1;
  }
  
  if (typeof applyFilterAndSearch === "function") {
    applyFilterAndSearch();
    console.log("✅ Filtro aplicado");
  } else {
    console.error("❌ applyFilterAndSearch no encontrada");
  }
  
  // Recalcular total según filtro de inventario
  recalcularTotalPorFiltroInventario();
  
  // Mostrar notificación
  if (productosConPedido === 0) {
    mostrarNotificacion("📊 No hay productos que requieran pedido en este momento.\nVerifica que tengas precios cargados y reglas definidas.", true);
  } else {
    mostrarNotificacion(`📊 Filtro cambiado a "PEDIDO". ${productosConPedido} productos requieren pedido.`, false);
  }
  
  console.log("🎯 autoSwitchToPedidoFilter completado");
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