"use strict";
// Buscador de aulas virtuales (0.8.5): escribes el nombre de tu centro (o parte de su dirección) y la app encuentra el aula
// y comprueba que se puede conectar, sin abrir el navegador. Sin Electron: se puede probar con Node.
// Cómo busca, por este orden:
//   1) Si lo escrito ya es una dirección (https://… o un dominio), se prueba tal cual.
//   2) Se adivinan direcciones del estilo de la Xunta: https://centros.edu.xunta.gal/<nombre-del-centro>/aulavirtual
//   3) Se consulta un buscador web (DuckDuckGo, sin cuenta) y se miran los resultados que parecen aulas Moodle.
// Cada candidato se comprueba contra el aula (login/token.php): solo se ofrecen los que responden como un Moodle.
// Otras comunidades (0.8.5): si lo escrito menciona una comunidad, una provincia o una plataforma («Madrid», «Aules», «Àgora»…),
// avdirectory.js aporta además las direcciones de esa plataforma (se prueban antes que las de la Xunta) y, si no se encuentra
// nada verificable, una pista para pegar el enlace a mano. Moodle es el mismo en todas partes: el resto de la app no cambia.

const { normalizeUrl } = require("../moodle");
const directory = require("./avdirectory");

const UA = "Mozilla/5.0 (BetterAVClient)";
const XUNTA = "https://centros.edu.xunta.gal";
const XUNTA_NAME = "Aula Virtual de la Xunta";
const MAX_CANDIDATES = 20;

const slug = s => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ñ/g, "n").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// No se prueban direcciones internas (localhost, IP, redes privadas): solo sitios públicos por https.
function publicHttps(u) {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:" || x.username || x.password) return false;
    const host = x.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return false;
    return true;
  } catch { return false; }
}

// Plan de candidatos, por este orden: dirección escrita → plataformas de otras comunidades mencionadas → estilo Xunta → MoodleCloud.
// Cada elemento es { url, platform? } (platform = nombre de la plataforma del directorio, si viene de ahí).
function candidatePlan(q) {
  const out = [];
  const raw = String(q || "").trim();
  if (/^https?:\/\//i.test(raw) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(raw)) out.push({ url: /^https?:\/\//i.test(raw) ? raw : `https://${raw}` });
  out.push(...directory.platformCandidates(raw, slug));
  const stripped = directory.stripRegionWords(raw);
  const names = [raw, ...(stripped && stripped !== directory.norm(raw) ? [stripped] : [])];   // con y sin la comunidad escrita
  for (const name of names) {
    const s = slug(name);
    if (!s || s.length < 3) continue;
    out.push({ url: `${XUNTA}/${s}/aulavirtual`, platform: XUNTA_NAME });
    const noPrefix = s.replace(/^(ies|ceip|cpi|cifp|ei|eoi|cee|cpr|ceo|conservatorio|escola|colegio)-(de-|do-|da-)?/, "");
    if (noPrefix && noPrefix !== s) out.push({ url: `${XUNTA}/${noPrefix}/aulavirtual`, platform: XUNTA_NAME });
    const pre = (s.match(/^(ies|ceip|cpi|cifp|cpr|ceo)\b/) || [])[1];
    if (pre && noPrefix) out.push({ url: `${XUNTA}/${pre}${noPrefix.replace(/-/g, "")}/aulavirtual`, platform: XUNTA_NAME });
    const flat = s.replace(/-/g, "");
    if (flat.length >= 4 && flat.length <= 40) out.push({ url: `https://${flat}.moodlecloud.com` });   // MoodleCloud: https://<nombre>.moodlecloud.com
  }
  return out;
}

const candidatesFromQuery = q => candidatePlan(q).map(c => c.url);

// Direcciones que salen en los resultados de DuckDuckGo (html.duckduckgo.com).
async function webCandidates(q, fetchImpl) {
  const query = `${String(q).slice(0, 100)} aula virtual moodle`;
  const res = await fetchImpl(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("buscador");
  const html = (await res.text()).slice(0, 400000);
  const urls = [];
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    let href = m[1].replace(/&amp;/g, "&");
    const dd = /[?&]uddg=([^&]+)/.exec(href);
    if (dd) { try { href = decodeURIComponent(dd[1]); } catch { continue; } }
    if (!/^https:\/\//i.test(href)) continue;
    if (/duckduckgo\.com/i.test(href)) continue;
    urls.push(href);
  }
  return urls;
}

// ¿Responde como un Moodle? compatible = el servicio móvil está activo (lo que necesita la app).
async function probe(base, fetchImpl) {
  const body = new URLSearchParams({ username: "x", password: "x", service: "moodle_mobile_app" });
  let res;
  try {
    res = await fetchImpl(`${base}/login/token.php`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA }, body: body.toString(), redirect: "manual", signal: AbortSignal.timeout(7000) });
  } catch { return null; }
  if (!res.ok) return null;
  let j;
  try { j = JSON.parse(await res.text()); } catch { return null; }
  if (!j || typeof j !== "object" || !(j.error || j.errorcode || j.token)) return null;
  const off = ["enablewsdescription", "servicenotavailable", "usernotallowed"].includes(j.errorcode);
  let name = "";
  try {
    const p = await fetchImpl(`${base}/login/index.php`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(7000) });
    const t = /<title>([^<]{1,200})<\/title>/i.exec((await p.text()).slice(0, 60000));
    if (t) name = t[1].replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").replace(/^(Entrar|Acceder|Log in|Login|Iniciar sesión)\s*[:|\-–]\s*/i, "").trim().slice(0, 100);
  } catch { /* sin nombre: se enseña la dirección */ }
  return { url: base, name, compatible: !off, note: off ? "El aula tiene desactivado el acceso desde aplicaciones." : "" };
}

async function search(query, { fetchImpl = (...a) => fetch(...a) } = {}) {
  const q = String(query || "").trim().slice(0, 120);
  if (q.length < 3) throw new Error("Escribe al menos 3 letras del nombre de tu centro.");
  const seen = new Set(), list = [], platformOf = new Map();
  const add = (u, platform) => {
    let base;
    try { base = normalizeUrl(u); } catch { return; }
    const key = base.toLowerCase();
    if (!publicHttps(base) || seen.has(key)) return;
    seen.add(key); list.push(base);
    if (platform) platformOf.set(key, platform);
  };
  candidatePlan(q).forEach(c => add(c.url, c.platform));
  let webFailed = false;
  try { (await webCandidates(q, fetchImpl)).forEach(u => add(u)); } catch { webFailed = true; }
  const probed = await Promise.all(list.slice(0, MAX_CANDIDATES).map(b => probe(b, fetchImpl)));
  const found = probed.filter(Boolean).map(r => {
    const platform = platformOf.get(r.url.toLowerCase());
    return platform ? { ...r, platform } : r;
  });
  found.sort((a, b) => Number(b.compatible) - Number(a.compatible));
  // Pistas: plataformas mencionadas de las que no se ha podido verificar ningún aula (hay que pegar el enlace a mano).
  const verified = new Set(found.map(r => r.platform).filter(Boolean));
  const hints = directory.matchPlatforms(q).filter(p => !verified.has(p.name)).map(p => ({ platform: p.name, region: p.region, text: p.hint }));
  return { results: found, hints, webFailed };
}

module.exports = { search, slug, candidatesFromQuery, candidatePlan, publicHttps, probe, webCandidates };
