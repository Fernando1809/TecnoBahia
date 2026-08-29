// Convierte dist/ en un único index.html autocontenido que funciona con doble clic (file://)
import fs from "node:fs";
import path from "node:path";

const dist = path.resolve("dist");
let html = fs.readFileSync(path.join(dist, "index.html"), "utf8");

const js = fs.readFileSync(path.join(dist, "app.js"), "utf8");
const cssPath = path.join(dist, "app.css");
const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";

html = html
  .replace(/<script[^>]*src="[^"]*app\.js"[^>]*><\/script>/, "")
  .replace(/<link[^>]*app\.css"[^>]*>/, "");

html = html
  .replace("</head>", `<style>${css}</style>\n</head>`)
  .replace("</body>", `<script>${js}</script>\n</body>`);

fs.writeFileSync(path.join(dist, "index.html"), html);
fs.rmSync(path.join(dist, "app.js"), { force: true });
fs.rmSync(cssPath, { force: true });

const kb = (fs.statSync(path.join(dist, "index.html")).size / 1024).toFixed(0);
console.log(`dist/index.html listo (${kb} KB) — se puede abrir directamente en el navegador.`);
