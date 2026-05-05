# 📋 SISTEMA DE PEDIDOS - GUÍA DE USO ACTUALIZADA

## 🎯 Cambios Principales

El sistema ahora funciona con **dos archivos separados**:

### 1. **LISTA_COMPLETA** (Gestión de Precios)
- Contiene **todos los productos** con sus precios actualizados
- **Solo el Admin** la sube en el panel
- Se actualiza cuando los precios cambian
- Almacenada en el sistema (localStorage)

### 2. **PEDIDO** (Documento de Solicitud)
- Contiene **solo los productos a pedir**
- Se descarga automáticamente cuando hay productos bajo mínimo
- Los precios se traen automáticamente de LISTA_COMPLETA

---

## 📊 FLUJO DE TRABAJO

```
┌─────────────────────┐
│   LISTA_COMPLETA    │  ← Admin sube aquí (precios)
│  (Sherwin Williams) │
└──────────┬──────────┘
           │
      ↓ (Lookup automático)
           │
┌──────────────────────┐
│ Panel Análisis       │  ← Carga inventario actual
│ Calcula: Mín/Máx    │  ← Detecta qué pedir
└──────────┬───────────┘
           │
      ↓ (Genera hoja PEDIDO)
           │
┌──────────────────────┐
│    PEDIDO.xlsx       │  ← Descarga solo lo necesario
│  (con precios)       │     con precios actualizados
└──────────────────────┘
```

---

## 🔧 PANEL ADMIN - NUEVAS FUNCIONES

### 1️⃣ Desbloquear Panel
1. Ingresa contraseña: `TecnoBahia2026+`
2. Haz clic en **🔓 Desbloquear**

### 2️⃣ Cargar LISTA_COMPLETA (Precios)
1. Descarga el Excel original de Sherwin Williams
2. En el panel admin, haz clic en **📊 Cargar LISTA_COMPLETA**
3. Selecciona el archivo
4. El sistema detecta automáticamente:
   - Columna: **CODIGOS**
   - Columna: **PAD SIN IVA ABRIL 2026** (precios)
5. ✅ Se guardan los ~2400 precios

### 3️⃣ Editar Mínimos y Máximos
1. Usa **📂 Importar reglas** o edita manualmente en la tabla
2. Define para cada producto:
   - **Mínimo**: Stock donde hay que pedir
   - **Máximo**: Stock máximo permitido
3. Haz clic en **💾 Guardar reglas**

### 4️⃣ Agregar Nuevos SKUs
1. Clic en **➕ Agregar nuevo SKU**
2. Ingresa el código
3. Edita sus mínimos/máximos
4. Haz clic en **💾 Guardar reglas**

---

## 📥 FLUJO PRINCIPAL - Análisis de Inventario

### Paso 1: Carga el Inventario
1. En la sección principal, selecciona tu archivo de inventario actual
2. El sistema automáticamente:
   - Detecta columnas (SKU, Producto, Stock, etc.)
   - Carga mínimos/máximos guardados
   - Calcula qué hay que pedir

### Paso 2: Revisa Indicadores
- 📦 **Con pedido sugerido**: Productos bajo mínimo
- ⚠️ **Con exceso**: Productos sobre máximo
- ✅ **OK**: Dentro del rango

### Paso 3: Filtra Resultados
- 📊 **Todos**: Todo el inventario
- 🛒 **En mínimo**: Solo los que hay que pedir
- ⚠️ **En exceso**: Productos con stock alto
- ✅ **OK**: Productos en rango normal

### Paso 4: Descarga Pedido
1. Haz clic en **📎 Descargar resultado**
2. Se genera `PEDIDO_YYYY-MM-DD.xlsx` con:
   - ✅ Hoja **PEDIDO**: Artículos a solicitar con precios actualizados
   - 📋 Hoja **LISTA_COMPLETA**: Todos los precios (referencia)
   - 📊 Hoja **Resultado_General**: Análisis completo
   - ⚠️ Hoja **Excesos_Inventario**: Productos con stock alto

---

## 📱 ESTRUCTURA DEL ARCHIVO DESCARGADO

### 🔴 Hoja: PEDIDO
```
SOLICITUD DE PEDIDO SHERWIN WILLIAMS

DISTRIBUIDOR:         INVERSIONES TECNO BAHIA    SUB-TOTAL: $X.XX
REALIZADO POR:        MARIA JOSE OSEGUEDA        IVA (14%):  $X.XX
FECHA:                2026-04-29                 TOTAL:      $X.XX

ITEM  | CODIGO    | DESCRIPCIÓN              | CANTIDAD | COSTO UNITARIO | IMPORTE
------|-----------|--------------------------|----------|----------------|----------
  1   | A24W451-1 | LOXON XP MATE BASE WHITE |   10     |    $25.00      |  $250.00
  2   | A24W451-5 | LOXON XP MATE BASE WHITE |    5     |    $30.00      |  $150.00
  ...
```

### 📊 Hoja: LISTA_COMPLETA
Todos los productos Sherwin Williams con sus precios (para referencia)

### 📋 Hoja: Resultado_General
Análisis completo del inventario con mínimos, máximos, sugerencias, etc.

### ⚠️ Hoja: Excesos_Inventario
Productos con inventario superior al máximo establecido

---

## 🔐 SEGURIDAD Y DATOS

### Datos Guardados (en tu navegador)
- ✅ Mínimos y máximos por SKU
- ✅ LISTA_COMPLETA con precios
- ✅ Configuración de filtros

### Datos No Guardados
- ❌ Contraseña (solo en memoria)
- ❌ Inventario actual (se procesa, no se almacena)

### Recuperar Datos Guardados
Si pierdes los datos o cambias navegador:
1. Usa un respaldo del archivo Excel de reglas
2. En Admin, importa con **📂 Importar reglas**

---

## ⚙️ ACTUALIZACIONES DE PRECIOS

### Mensualmente (o cuando cambien precios)
1. Obtén la LISTA_COMPLETA actualizada de Sherwin Williams
2. En Panel Admin > **📊 Cargar LISTA_COMPLETA**
3. Selecciona el archivo nuevo
4. ✅ Los precios se actualizan automáticamente

**Nota**: No necesitas cambiar nada más. Todos los pedidos futuros usarán los nuevos precios.

---

## 🆘 TROUBLESHOOTING

### ❌ "No se encontró columna CODIGO"
- Verifica que el Excel tenga una columna con "CODIGO" o "CODIGOS"
- Intenta con la LISTA_COMPLETA original de Sherwin

### ❌ "No se encontró precio PAD SIN IVA"
- El archivo debe tener una columna con los precios
- Busca algo como "PAD SIN IVA", "PRECIO", "COSTO", etc.

### ❌ Precios no aparecen en PEDIDO
- Revisa que los códigos en el inventario coincidan exactamente con LISTA_COMPLETA
- Verifica mayúsculas/minúsculas

### ❌ ¿Olvidé la contraseña?
- Contraseña: `TecnoBahia2026+`
- Si necesitas cambiarla, edita el archivo HTML

---

## 📞 CONTACTO / SOPORTE

Para dudas o reportar problemas, consulta con Tecno Bahía.

---

**Versión**: 2.0 - Actualizada 29/04/2026  
**Sistema**: Auxiliar de Inventario y Pedidos  
**Empresa**: Inversiones Tecno Bahía
