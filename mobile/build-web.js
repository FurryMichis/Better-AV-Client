"use strict";
// Genera mobile/www (la web que empaqueta Capacitor) a partir de ../src SIN modificar la app de escritorio:
//  · copia la interfaz (index.html, CSS, renderer.js, imágenes y sonido),
//  · envuelve como módulos los archivos de ../src que no dependen de Electron (moodle, settings, sync, ai, safefile, changelog…),
//  · añade el puente Android (web/mobile-bridge.js) y los plugins de Capacitor (esbuild → nx-plugins.js).
const fs = require("node:fs");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "src");
const WEB = path.join(__dirname, "web");
const OUT = path.join(__dirname, "www");
const version = require("../package.json").version;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });

const copy = (from, to) => fs.copyFileSync(from, path.join(OUT, to));
for (const f of ["styles.css", "instance.css", "renderer.js"]) copy(path.join(SRC, f), f);
for (const f of ["logo.png", "cat.jpg", "notification.mp3"]) copy(path.join(SRC, "assets", f), path.join("assets", f));
copy(path.join(WEB, "mobile.css"), "mobile.css");

// ---- index.html
let html = fs.readFileSync(path.join(SRC, "index.html"), "utf8");
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; " +
  "connect-src 'self' https://*.supabase.co https://api.github.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";
const before = html;
html = html
  .replace(/<meta http-equiv="Content-Security-Policy"[\s\S]*?>/, `<meta http-equiv="Content-Security-Policy" content="${CSP}">`)
  .replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">')
  .replace('<link rel="stylesheet" href="instance.css">', '<link rel="stylesheet" href="instance.css">\n  <link rel="stylesheet" href="mobile.css">')
  .replace('<script src="renderer.js"></script>',
    '<script src="nx-plugins.js"></script>\n  <script src="nx-modules.js"></script>\n  <script src="mobile-bridge.js"></script>\n  <script src="renderer.js"></script>');
for (const needle of ["mobile.css", "nx-plugins.js", "Content-Security-Policy", "viewport-fit=cover"]) {
  if (!html.includes(needle)) throw new Error(`No se pudo adaptar index.html (falta ${needle}). ¿Cambió su estructura?`);
}
if (html === before) throw new Error("index.html no se modificó.");
fs.writeFileSync(path.join(OUT, "index.html"), html);

// ---- módulos CommonJS envueltos (se cargan con el cargador de mobile-bridge.js)
const MODULES = [
  ["moodle", path.join(SRC, "moodle.js")],
  ["settings", path.join(SRC, "lib", "settings.js")],
  ["ai", path.join(SRC, "lib", "ai.js")],
  ["sync", path.join(SRC, "lib", "sync.js")],
  ["safefile", path.join(SRC, "lib", "safefile.js")],
  ["changelog", path.join(SRC, "lib", "changelog.js")],
  ["cloud-config", path.join(SRC, "lib", "cloud-config.js")],
  ["cloud", path.join(WEB, "cloud-web.js")]
];
let mods = "\"use strict\";\nwindow.__nxDefs = window.__nxDefs || {};\n";
for (const [name, file] of MODULES) {
  mods += `window.__nxDefs[${JSON.stringify(name)}] = function (module, exports, require) {\n${fs.readFileSync(file, "utf8")}\n};\n`;
}
fs.writeFileSync(path.join(OUT, "nx-modules.js"), mods);

// ---- puente
fs.writeFileSync(path.join(OUT, "mobile-bridge.js"), fs.readFileSync(path.join(WEB, "mobile-bridge.js"), "utf8").replace("__NX_VERSION__", version));

// ---- plugins de Capacitor (necesita node_modules: npm install)
require("esbuild").buildSync({
  entryPoints: [path.join(WEB, "plugins-entry.js")],
  bundle: true, format: "iife", minify: true, target: "chrome90",
  outfile: path.join(OUT, "nx-plugins.js"),
  absWorkingDir: __dirname
});

console.log(`www listo (v${version}): ${fs.readdirSync(OUT).join(", ")}`);
