"use strict";
// Política de privacidad y términos: se leen de los .md del repositorio de GitHub (PRIVACY.md y TERMS.md).
// Si no hay conexión se usa la última copia descargada y, si tampoco existe, la copia incluida en la app (src/legal/).
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const RAW = "https://raw.githubusercontent.com/FurryMichis/Better-AV-Client/main/";
const DOCS = { privacy: "PRIVACY.md", terms: "TERMS.md" };
const MAX = 200 * 1024; // un .md legal no pasa de unos KB; se descarta lo desproporcionado
const cacheFile = () => path.join(app.getPath("userData"), "legal-cache.json");

const bundled = name => { try { return fs.readFileSync(path.join(__dirname, "..", "legal", name), "utf8"); } catch { return ""; } };
function readCache() {
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile(), "utf8"));
    return c && typeof c.privacy === "string" && typeof c.terms === "string" ? c : null;
  } catch { return null; }
}
function writeCache(c) {
  try { fs.mkdirSync(path.dirname(cacheFile()), { recursive: true }); fs.writeFileSync(cacheFile(), JSON.stringify(c)); } catch { /* sin caché */ }
}
const valid = t => typeof t === "string" && t.trim().length > 40 && t.length <= MAX;

async function fetchDoc(name) {
  const res = await fetch(RAW + name, { signal: AbortSignal.timeout(8000), headers: { "Cache-Control": "no-cache" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!valid(text)) throw new Error("documento no válido");
  return text;
}

// → { privacy, terms, source: "github" | "cache" | "bundled" }
async function get() {
  try {
    const [privacy, terms] = await Promise.all([fetchDoc(DOCS.privacy), fetchDoc(DOCS.terms)]);
    writeCache({ privacy, terms, at: new Date().toISOString() });
    return { privacy, terms, source: "github" };
  } catch { /* sin conexión o GitHub no responde */ }
  const c = readCache();
  if (c && valid(c.privacy) && valid(c.terms)) return { privacy: c.privacy, terms: c.terms, source: "cache" };
  return { privacy: bundled(DOCS.privacy), terms: bundled(DOCS.terms), source: "bundled" };
}

module.exports = { get, URLS: { privacy: RAW + DOCS.privacy, terms: RAW + DOCS.terms } };
