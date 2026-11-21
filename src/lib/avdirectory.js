"use strict";
// Directorio de plataformas Moodle de otras comunidades (0.8.5). Sin Electron: se puede probar con Node.
// Sirve para que el buscador de aulas (avsearch.js) no se quede solo en Galicia: si lo escrito menciona una comunidad,
// una provincia o el nombre de la plataforma («Aules», «Àgora»…), se añaden candidatos de esa plataforma.
// IMPORTANTE: estas direcciones son candidatas, no verdades. avsearch.js comprueba cada una contra el aula real
// (login/token.php) y descarta las que no responden como un Moodle, así que una dirección desfasada no se llega a mostrar.
// Cuando no se conoce una dirección fija, la plataforma solo aporta una pista para pegar el enlace a mano.

const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const ANDALUCIA_PROVINCES = ["almeria", "cadiz", "cordoba", "granada", "huelva", "jaen", "malaga", "sevilla"];

// words: palabras (sin tildes, en minúsculas) que activan la plataforma. fixed: direcciones que no dependen del centro.
// perCenter(ctx): direcciones que se deducen del nombre del centro. hint: qué hacer si no se puede encontrar sola.
const PLATFORMS = [
  {
    id: "galicia", name: "Aula Virtual de la Xunta", region: "Galicia",
    words: ["galicia", "galiza", "xunta", "a coruna", "coruna", "lugo", "ourense", "pontevedra", "vigo", "ferrol", "edu xunta"],
    hint: "Abre el aula de tu centro en el navegador y pega aquí su dirección completa (suele empezar por https://centros.edu.xunta.gal/)."
  },
  {
    id: "andalucia", name: "Moodle Centros (Andalucía)", region: "Andalucía",
    words: ["andalucia", "junta de andalucia", "moodle centros", ...ANDALUCIA_PROVINCES],
    fixed: ctx => {
      const hit = ANDALUCIA_PROVINCES.filter(p => ctx.tokens.has(p));
      return (hit.length ? hit : ANDALUCIA_PROVINCES).map(p => `https://educacionadistancia.juntadeandalucia.es/centros/${p}`);
    },
    hint: "Moodle Centros se organiza por provincias: abre el aula de tu centro en el navegador y pega aquí su dirección completa."
  },
  {
    id: "valencia", name: "Aules (Comunitat Valenciana)", region: "Comunitat Valenciana",
    words: ["comunitat valenciana", "comunidad valenciana", "valencia", "alicante", "alacant", "castellon", "castello", "aules", "gva", "conselleria"],
    fixed: () => ["https://aules.edu.gva.es/eso", "https://aules.edu.gva.es/fp", "https://aules.edu.gva.es/semipresencial"],
    hint: "Aules tiene un aula por etapa (ESO, FP…): abre la tuya en el navegador y pega aquí su dirección completa."
  },
  {
    id: "catalunya", name: "Àgora / Moodle (Catalunya)", region: "Catalunya",
    words: ["cataluna", "catalunya", "barcelona", "girona", "gerona", "tarragona", "lleida", "lerida", "agora", "xtec", "educacio digital"],
    perCenter: ctx => [
      `https://agora.xtec.cat/${ctx.flat}/moodle`,
      `https://agora.xtec.cat/${ctx.slug}/moodle`,
      ctx.flatNoPrefix && `https://agora.xtec.cat/${ctx.flatNoPrefix}/moodle`,
      `https://educaciodigital.cat/${ctx.flat}/moodle`
    ],
    hint: "En Àgora cada centro tiene su Moodle (suele ser https://agora.xtec.cat/<centro>/moodle). Abre el tuyo en el navegador y pega aquí la dirección."
  },
  {
    id: "aragon", name: "AulaRagón (Aragón)", region: "Aragón",
    words: ["aragon", "zaragoza", "huesca", "teruel", "aularagon", "catedu"],
    fixed: () => ["https://aularagon.catedu.es"],
    hint: "Abre el aula de tu centro en el navegador y pega aquí su dirección completa."
  },
  { id: "madrid", name: "Aula Virtual de EducaMadrid", region: "Comunidad de Madrid", words: ["madrid", "educamadrid", "educa madrid"],
    hint: "Cada centro de Madrid tiene su propia aula: ábrela en el navegador y pega aquí su dirección completa (suele empezar por https://aulavirtual.educa.madrid.org/)." },
  { id: "canarias", name: "EVAGD (Canarias)", region: "Canarias", words: ["canarias", "evagd", "tenerife", "las palmas", "gran canaria", "lanzarote", "fuerteventura", "la palma", "la gomera", "el hierro"],
    hint: "Abre tu aula de EVAGD en el navegador y pega aquí su dirección completa." },
  { id: "castillayleon", name: "Aula Virtual Educacyl (Castilla y León)", region: "Castilla y León", words: ["castilla y leon", "educacyl", "valladolid", "burgos", "leon", "salamanca", "zamora", "palencia", "segovia", "avila", "soria"],
    hint: "Abre el aula de tu centro en el navegador y pega aquí su dirección completa." },
  { id: "extremadura", name: "Aulas virtuales de Educarex (Extremadura)", region: "Extremadura", words: ["extremadura", "educarex", "badajoz", "caceres", "merida"],
    hint: "Abre tu aula en el navegador y pega aquí su dirección completa." },
  { id: "murcia", name: "Aulas virtuales (Región de Murcia)", region: "Región de Murcia", words: ["murcia", "region de murcia", "cartagena", "lorca", "educarm"],
    hint: "Abre tu aula en el navegador y pega aquí su dirección completa." },
  { id: "asturias", name: "Aulas virtuales (Asturias)", region: "Asturias", words: ["asturias", "educastur", "oviedo", "gijon", "aviles"],
    hint: "Abre tu aula en el navegador y pega aquí su dirección completa." },
  { id: "cantabria", name: "Aulas virtuales (Cantabria)", region: "Cantabria", words: ["cantabria", "santander", "educantabria", "torrelavega"],
    hint: "Abre tu aula en el navegador y pega aquí su dirección completa." }
];

// Trozos del nombre del centro que se usan para deducir direcciones (mismo criterio que avsearch.js).
function contextFor(q, slug, tokenSource = q) {
  const s = slug(q);
  const noPrefix = s.replace(/^(ies|ceip|cpi|cifp|ei|eoi|cee|cpr|ceo|conservatorio|escola|colegio)-(de-|do-|da-)?/, "");
  const prefix = (s.match(/^(ies|ceip|cpi|cifp|cpr|ceo)\b/) || [])[1] || "";
  const flat = s.replace(/-/g, "");
  const flatNoPrefix = prefix && noPrefix && noPrefix !== s ? `${prefix}${noPrefix.replace(/-/g, "")}` : "";
  return { slug: s, flat, noPrefix, flatNoPrefix, tokens: new Set(norm(tokenSource).split(" ").filter(Boolean)) };
}

// Plataformas mencionadas en lo escrito (por comunidad, provincia o nombre de la plataforma).
function matchPlatforms(q) {
  const n = ` ${norm(q)} `;
  return PLATFORMS.filter(p => p.words.some(w => n.includes(` ${w} `)));
}

// Lo escrito sin las palabras de comunidad/provincia («IES Dr Puigvert Barcelona» → «ies dr puigvert»): el nombre del centro
// no suele llevar la comunidad, así que las direcciones deducidas del nombre se prueban también sin ella.
function stripRegionWords(q) {
  let n = ` ${norm(q)} `;
  for (const p of matchPlatforms(q)) for (const w of p.words) for (let i = 0; i < 2; i++) n = n.split(` ${w} `).join(" ");
  return n.trim();
}

// Direcciones candidatas de las plataformas mencionadas: [{ url, platform }]. Sin duplicados.
function platformCandidates(q, slug) {
  const stripped = stripRegionWords(q);
  const names = [q, ...(stripped && stripped !== norm(q) ? [stripped] : [])];
  const out = [], seen = new Set();
  for (const p of matchPlatforms(q)) {
    for (const name of names) {
      const ctx = contextFor(name, slug, q);
      const urls = [...(p.fixed ? p.fixed(ctx) : []), ...(ctx.slug.length >= 3 && p.perCenter ? p.perCenter(ctx) : [])];
      for (const u of urls) if (u && !seen.has(u)) { seen.add(u); out.push({ url: u, platform: p.name }); }
    }
  }
  return out;
}

module.exports = { PLATFORMS, norm, contextFor, matchPlatforms, stripRegionWords, platformCandidates };
