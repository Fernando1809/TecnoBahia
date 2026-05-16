// js/ui.js

/**
 * =========================================================================
 * 📊 SECCIÓN 1: RENDERIZADO DEL REPORTE DE INVENTARIO Y CONTROL DE INPUTS
 * =========================================================================
 */

/**
 * Renderiza la tabla de datos de forma dinámica adaptando las columnas visibles,
 * añadiendo inputs interactivos para modificar pedidos en caliente y aplicando estilos por clase.
 */
function renderTableDynamic(data, filterType) {
  const thead = document.getElementById("tableHeader");
  const tbody = document.getElementById("tableBody");
  if (!thead || !tbody) return;

  let columns = [];
  if (filterType === "pedido") {
    columns = [
      { key: "SKU", label: "SKU" },
      { key: "Producto", label: "Producto" },
      { key: "Inventario", label: "Inventario" },
      { key: "CostoUnitario", label: "Costo unitario" },
      { key: "PedidoSugerido", label: "Pedido" },
      { key: "CostoTotal", label: "Costo total" }
    ];
  } else if (filterType === "exceso") {
    columns = [
      { key: "SKU", label: "SKU" },
      { key: "Producto", label: "Producto" },
      { key: "Inventario", label: "Inventario" },
      { key: "CostoUnitario", label: "Costo unitario" },
      { key: "CostoTotal", label: "Costo total" },
      { key: "Exceso", label: "Exceso" }
    ];
  } else if (filterType === "ok") {
    columns = [
      { key: "SKU", label: "SKU" },
      { key: "Producto", label: "Producto" },
      { key: "Inventario", label: "Inventario" },
      { key: "CostoUnitario", label: "Costo unitario" },
      { key: "CostoTotal", label: "Costo total" },
      { key: "Estado", label: "Estado" }
    ];
  } else {
    columns = [
      { key: "SKU", label: "SKU" },
      { key: "Producto", label: "Producto" },
      { key: "Inventario", label: "Inventario" },
      { key: "CostoUnitario", label: "Costo unitario" },
      { key: "PedidoSugerido", label: "Pedido" },
      { key: "CostoTotal", label: "Costo total" },
      { key: "Estado", label: "Estado" }
    ];
  }

  thead.innerHTML = '<tr>' + columns.map(col => `<th>${col.label}</th>`).join('') + '</tr>';

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${columns.length}" style="text-align:center; padding:40px;">📭 No hay productos que coincidan con el filtro seleccionado</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(r => {
    let estadoClass = "";
    if (r.PedidoSugerido > 0) estadoClass = "tag-danger";
    else if (r.Exceso > 0) estadoClass = "tag-warning";
    else if (r.Estado === "OK") estadoClass = "tag-ok";

    const cells = columns.map(col => {
      let value = r[col.key];
      let className = "";
      let displayValue = "";

      if (col.key === "PedidoSugerido" && r.PedidoSugerido > 0) {
        className = "tag-danger";
        displayValue = `<input type="number" class="pedido-sugerido-input" data-sku="${escapeHtml(r.SKU)}" value="${Math.max(0, Number(r.PedidoSugerido))}" min="0" style="width:90px; padding:4px; border:1px solid var(--border); border-radius:6px; text-align: right;" />`;
      } else if (value === "" || value === undefined || value === null) {
        displayValue = "-";
      } else if (col.key === "CostoUnitario" || col.key === "CostoTotal") {
        displayValue = value !== "" ? `$${fmt(value)}` : "-";
      } else if (typeof value === "number") {
        displayValue = fmt(value);
      } else {
        displayValue = escapeHtml(String(value));
      }

      if (col.key === "Exceso" && r.Exceso > 0) className = "tag-warning";
      if (col.key === "Estado") className = estadoClass;

      const isNumeric = ["Inventario", "CostoUnitario", "PedidoSugerido", "CostoTotal", "Exceso"].includes(col.key);
      const styleAlign = isNumeric ? ' style="text-align: right;"' : '';

      return `<td class="${className}"${styleAlign}>${displayValue}</td>`;
    }).join('');

    return `<tr>${cells}</tr>`;
  }).join('');

  tbody.querySelectorAll('.pedido-sugerido-input').forEach(input => {
    input.addEventListener('input', handlePedidoSugeridoChange);
  });
}

function handlePedidoSugeridoChange(event) {
  const input = event.target;
  const sku = input.getAttribute('data-sku');
  if (!sku) return;

  const value = toNum(input.value);
  const row = state.rows.find(r => r.SKU === sku);
  if (!row) return;

  row.PedidoSugerido = Math.max(0, Math.ceil(value));
  row.CostoTotal = row.CostoUnitario !== '' ? row.PedidoSugerido * row.CostoUnitario : "";

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
  applyFilterAndSearch();
}

function applyFilterAndSearch() {
  const searchTerm = norm(document.getElementById("searchInput")?.value || "");
  let filtered = [...state.rows];

  if (state.activeFilter === "pedido") {
    filtered = filtered.filter(r => r.PedidoSugerido > 0);
  } else if (state.activeFilter === "exceso") {
    filtered = filtered.filter(r => r.Exceso > 0);
  } else if (state.activeFilter === "ok") {
    filtered = filtered.filter(r => r.PedidoSugerido === 0 && r.Exceso === 0 && r.Estado !== "SIN REGLAS");
  }

  if (searchTerm) {
    filtered = filtered.filter(r => norm(r.SKU).includes(searchTerm) || norm(r.Producto).includes(searchTerm));
  }

  state.filtered = filtered;
  renderTableDynamic(filtered, state.activeFilter || "todos");

  const filterInfo = document.getElementById("filterInfo");
  if (filterInfo) {
    let filterText = "";
    if (state.activeFilter === "all" || state.activeFilter === "todos") filterText = "Mostrando todos los productos";
    else if (state.activeFilter === "pedido") filterText = `📦 Mostrando productos con pedido (${filtered.length} de ${state.rows.length})`;
    else if (state.activeFilter === "exceso") filterText = `⚠️ Mostrando productos en exceso (${filtered.length} de ${state.rows.length})`;
    else if (state.activeFilter === "ok") filterText = `✅ Mostrando productos dentro del rango óptimo (${filtered.length} de ${state.rows.length})`;
    filterInfo.textContent = filterText;
  }
}

/**
 * =========================================================================
 * 🔒 SECCIÓN 2: INTERFAZ DE USUARIO DEL MÓDULO ADMINISTRATIVO (ADMIN UI)
 * =========================================================================
 */

/**
 * Modifica la visibilidad de las capas del panel de administración según el estado del candado.
 */
function updateAdminLockUI() {
  const lockDiv = document.querySelector(".admin-lock");
  const content = document.getElementById("adminContent");
  const statusSpan = document.getElementById("adminLockStatus");
  
  if (lockDiv) lockDiv.classList.toggle("hidden", state.adminUnlocked);
  if (content) content.classList.toggle("hidden", !state.adminUnlocked);
  
  if (statusSpan) {
    statusSpan.textContent = state.adminUnlocked ? "✅ Panel desbloqueado" : "🔒 Panel bloqueado";
    statusSpan.style.color = state.adminUnlocked ? "var(--ok)" : "var(--muted)";
  }
}

/**
 * Renderiza el cuerpo de la tabla del panel de control de administración.
 */
function renderAdminTable(data) {
  const tbody = document.querySelector("#adminTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">📭 No hay SKUs registrados</td></tr>';
    return;
  }
  
  data.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.SKU)}</td>
      <td>${escapeHtml(r.Producto)}</td>
      <td><input type="number" min="0" step="1" data-role="min" data-sku="${escapeHtml(r.SKU)}" value="${escapeHtml(r.Minimo)}" style="width:90px;"></td>
      <td><input type="number" min="0" step="1" data-role="max" data-sku="${escapeHtml(r.SKU)}" value="${escapeHtml(r.Maximo)}" style="width:90px;"></td>
      <td><button class="btn-secondary" style="background:var(--danger); color:white; padding:4px 8px;" data-delete-sku="${escapeHtml(r.SKU)}">🗑️</button></td>
    `;
    tbody.appendChild(tr);
  });

  // Escuchas para los botones individuales de eliminación de reglas
  document.querySelectorAll('[data-delete-sku]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sku = btn.getAttribute('data-delete-sku');
      if (confirm(`¿Eliminar reglas para el SKU "${sku}"?`)) {
        delete state.adminRules[sku];
        persistRules();
        recalculateRows();
        applyAdminFilter();
        setStatus(`✅ Reglas eliminadas para ${sku}`);
      }
    });
  });
}

/**
 * Construye e inyecta los elementos del paginador del área administrativa.
 */
function renderAdminPagination(currentPage, totalPages, totalItems) {
  const paginationEl = document.getElementById('adminPagination');
  if (!paginationEl) return;
  paginationEl.innerHTML = '';
  
  if (totalPages <= 1) {
    paginationEl.textContent = totalItems ? `Página ${currentPage} de ${totalPages} — ${totalItems} SKUs` : '';
    return;
  }

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.textContent = '« Anterior';
  prevBtn.disabled = currentPage <= 1;
  prevBtn.addEventListener('click', () => {
    state.adminPage = Math.max(1, state.adminPage - 1);
    applyAdminFilter();
  });

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
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
    btn.type = 'button';
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