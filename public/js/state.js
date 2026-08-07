// js/state.js

const state = {
  rows: [],
  filtered: [],
  rawJson: [],
  columnMap: null,
  adminRules: {},
  // Reglas de mínimos/máximos separadas por sucursal (Jiquilisco / Usulután)
  adminRulesPorSucursal: { "Jiquilisco": {}, "Usulután": {} },
  sucursalActiva: null,
  // Metadata (fecha/nombre de archivo) del último import de reglas, por sucursal
  reglasMeta: { "Jiquilisco": {}, "Usulután": {} },
  // Memoria del último pedido generado, por sucursal (solo identificadores/SKUs)
  pedidoMemoriaPorSucursal: { "Jiquilisco": null, "Usulután": null },
  adminUnlocked: false,
  userRole: null,
  activeFilter: "all",
  adminActiveFilter: "all",
  adminPage: 1,
  adminPageSize: 10,
  listaCompleta: [],
  preciosLookup: {},
  pedidoTemplateBase64: null,
  pedidoTemplateLoaded: false,
  pedidoTemplateName: null,
  inventoryOrigin: null,
  inventoryLoaded: false,
  currentView: "report",
  darkMode: false,
  bulkSelection: {
    selectedSKUs: []
  }
};

window.firebaseReady = window.firebaseReady || new Promise(resolve => { 
  window.__resolveFirebaseReady = resolve; 
});
