# Consolidador Multi-Hoja — versión local

Programa 100% local: no necesita internet, servidor ni cuentas. Las plantillas
(Reporte CDP y Reporte Promociones) y los logos ya vienen integrados.

## Uso inmediato (sin instalar nada)

1. Abra la carpeta `dist/`.
2. Doble clic en `index.html` (se abre en Chrome/Edge/Firefox).
3. Cargue los tres archivos fuente (Ítems DTE, Órdenes, Maestro de productos),
   elija el periodo, agregue promociones y pulse **Generar y previsualizar**.
4. Revise indicadores y hojas en pantalla y pulse **Descargar** para el Excel.

Puede copiar solo `dist/index.html` a cualquier PC o memoria USB: es un único
archivo autocontenido con toda la aplicación.

## Modificar el código

Requiere Node.js 20+.

```bash
npm install
npm run dev     # desarrollo en http://localhost:5173
npm run build   # regenera dist/index.html autocontenido
```

Estructura:

- `src/App.tsx` — interfaz (carga de archivos, indicadores, vista previa).
- `src/lib/consolidador.ts` — toda la lógica: lectura de Excel/CSV, filtros,
  fórmulas de `todos_skus` y `v_i_confirmadas`, llenado de plantillas CDP y
  Promociones, indicadores clave.
- `src/assets/*.ts` — plantillas y logos incrustados en base64.
- `scripts/inline.mjs` — genera el `index.html` de un solo archivo.

## Notas

- Todo el procesamiento ocurre en el navegador; ningún archivo se envía a
  ningún servidor.
- Los archivos de Excel generados conservan el formato original de las
  plantillas (imágenes, estilos, celdas combinadas).


## IMPORTANTE
Para usarlo sin servidor: abre **ABRIR-ESTO.html** (doble clic). El archivo `index.dev.html` solo sirve con `npm run dev`.
