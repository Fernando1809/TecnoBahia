# 💰 Guía de Integración - Archivo de Precios

## 📋 Información del Archivo

**Archivo**: `precios.xlsm`  
**Ubicación**: `C:\Users\tecno\Downloads\`  
**Tamaño**: ~685 KB  
**Última actualización**: 29/04/2026

---

## 📊 Estructura del Archivo

### Hoja: "lista completa"

| Columna | Nombre | Ejemplo | Descripción |
|---------|--------|---------|-------------|
| A | Linea | Arquitectonico | Línea de productos |
| B | CODIGOS | A24W451-1 | **[CLAVE]** Código único del producto |
| C | LN / PE / NUEVO | LN | Estado: Línea / Promoción / Nuevo |
| D | DESCRIPCION DEL PRODUCTO | LOXON XP MATE BASE EXTRA WHITE | Nombre del producto |
| E | **PAD SIN IVA ABRIL 2026** | 25.50 | **[PRECIO USADO]** Precio sin IVA |
| F | PAD CON IVA ABRIL 2026 | 29.07 | Precio con IVA 14% |
| G | PSM SIN IVA ABRIL 2026 | 23.10 | Precio Sherwin Mas sin IVA |
| H | PSM CON IVA ABRIL 2026 | 26.33 | Precio Sherwin Mas con IVA |

**Total de productos**: 2,473 códigos  
**Rango**: Filas 3 a 2475 (fila 2 = encabezados)

---

## 🔄 Flujo de Integración

### Paso 1: Panel Admin - Desbloquear
```
1. Contraseña: TecnoBahia2026+
2. Haz clic en "🔓 Desbloquear"
```

### Paso 2: Cargar Precios
```
1. En Panel Admin, sección "💰 Cargar PRECIOS"
2. Selecciona: precios.xlsm
3. Haz clic en "💰 Cargar PRECIOS (archivo precios.xlsm)"
4. ✅ Sistema detecta automáticamente las columnas
   - CODIGOS (columna B)
   - PAD SIN IVA ABRIL 2026 (columna E)
5. 📊 Mensaje: "✅ Precios cargados correctamente. 2,473 productos..."
```

### Paso 3: Verificar Carga
```
Los precios se guardan en el navegador (localStorage):
- auxiliar-inventario-lista-completa (2,473 registros)
- auxiliar-inventario-precios-lookup (índice rápido)
```

### Paso 4: Usar en Pedidos
```
1. En la sección principal, carga tu inventario
2. Al generar PEDIDO:
   - Busca automáticamente el código en los precios cargados
   - Si encuentra coincidencia → usa precio de precios.xlsm
   - Si no encuentra → VLOOKUP a LISTA_COMPLETA interna
3. Calcula subtotal con precios actualizados
```

---

## 🔍 Validación de Datos

### Ejemplo de Lectura Correcta

```
Código: A24W451-1
Descripción: LOXON XP MATE BASE EXTRA WHITE
Precio PAD SIN IVA: $25.50  ← Este valor se usa
Precio CON IVA: $29.07

En el sistema se captura:
{
  "CODIGO": "A24W451-1",
  "DESCRIPCION": "LOXON XP MATE BASE EXTRA WHITE",
  "PRECIO": 25.50  ← Para el pedido
}
```

---

## 📈 Ejemplo de Pedido Generado

```
SOLICITUD DE PEDIDO SHERWIN WILLIAMS

DISTRIBUIDOR:        INVERSIONES TECNO BAHIA
REALIZADO POR:       MARIA JOSE OSEGUEDA
FECHA:               2026-04-29

ITEM | CODIGO     | DESCRIPCIÓN              | CANT | COSTO UNIT | IMPORTE
-----|-----------|--------------------------|------|-----------|----------
  1  | A24W451-1 | LOXON XP MATE BASE WHITE |  5   |   $25.50  |  $127.50  ← Precio de precios.xlsm
  2  | A24W451-5 | LOXON XP MATE BASE WHITE | 10   |   $28.00  |  $280.00
  3  | A24W453-1 | LOXON XP MATE BASE DEEP  |  3   |   $26.25  |   $78.75

SUB-TOTAL:  $486.25
IVA (14%):  $ 68.07
TOTAL:      $554.32
```

---

## 🔐 Datos Guardados en el Sistema

### localStorage (en el navegador)

**Clave**: `auxiliar-inventario-precios-lookup`
```json
{
  "A24W451-1": 25.50,
  "A24W451-5": 28.00,
  "A24W453-1": 26.25,
  ...
  [2,473 productos]
}
```

**Clave**: `auxiliar-inventario-lista-completa`
```json
[
  {
    "CODIGO": "A24W451-1",
    "DESCRIPCION": "LOXON XP MATE BASE EXTRA WHITE",
    "PRECIO": 25.50
  },
  ...
]
```

---

## 📅 Actualización de Precios (Mensual)

### Cuándo cambien los precios en Sherwin:

1. **Descarga nuevo precios.xlsm** de Sherwin Williams
2. **Panel Admin → 💰 Cargar PRECIOS**
3. **Selecciona archivo actualizado**
4. ✅ **Listo**. Todos los pedidos futuros usan nuevos precios

**Nota importante**: 
- No necesitas borrar nada
- No afecta los mínimos/máximos establecidos
- Solo se actualizan los precios

---

## ⚠️ Troubleshooting

### ❌ "No se encontraron columnas CODIGOS y PAD SIN IVA"

**Causa**: Archivo tiene estructura diferente

**Solución**:
1. Verifica que el archivo tenga hoja "lista completa"
2. Busca columnas con "CODIGO" en fila 2
3. Busca columna con "PAD SIN IVA" en fila 2
4. Si las encuentra, pero con nombre diferente, actualiza la búsqueda

### ❌ "El archivo de precios está vacío"

**Causa**: Archivo sin datos

**Solución**:
1. Abre el Excel en tu computadora
2. Verifica que tenga datos en la hoja "lista completa"
3. Descárgalo nuevamente desde Sherwin

### ❌ Precios no aparecen en los pedidos

**Causa**: Códigos no coinciden exactamente

**Solución**:
1. Verifica mayúsculas/minúsculas en los códigos
2. Verifica espacios en blanco al inicio/final
3. Descarga el archivo nuevamente y prueba

### ❌ "No se encontraron productos con datos válidos"

**Causa**: Archivo procesado pero sin precios

**Solución**:
1. Verifica que la columna "PAD SIN IVA ABRIL 2026" tenga valores numéricos
2. Si tiene fórmulas, el Excel debe evaluarlas primero
3. Abre y guarda el archivo en Excel: Archivo > Guardar Como > Excel

---

## 💡 Tips & Recomendaciones

1. **Guarda respaldo**: Copia precios.xlsm antes de actualizar
2. **Verifica exactitud**: Compara 5-10 códigos al cargar por primera vez
3. **Frecuencia**: Carga nuevos precios mensualmente o cuando Sherwin los actualice
4. **Sincronización**: Mantén los mínimos/máximos hasta que haya cambios reales en inventario

---

**Versión**: 1.0  
**Fecha**: 29/04/2026  
**Sistema**: Auxiliar de Inventario y Pedidos v2.0
