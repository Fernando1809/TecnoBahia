// js/state.js

const state = {
  rows: [],
  filtered: [],
  rawJson: [],
  columnMap: null,
  adminRules: {},
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
  currentView: "report",
  darkMode: false
};

window.firebaseReady = window.firebaseReady || new Promise(resolve => { 
  window.__resolveFirebaseReady = resolve; 
});