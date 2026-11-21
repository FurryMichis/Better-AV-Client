"use strict";
// Filtro de palabras (0.8.5): «levemente amplio». Tapa con asteriscos insultos, tacos fuertes y términos de odio en español,
// gallego e inglés, también si se escriben con acentos, números por letras (p0ll4), letras repetidas (puuuta) o mayúsculas.
// No es un filtro agresivo: no toca palabras suaves ni interjecciones normales (hostia, joder tampoco en «fastidiar»...), y busca
// palabras enteras para no romper otras (p. ej. «computadora», «Scunthorpe»). Se aplica al MOSTRAR: lo que escribe la gente no se cambia.
// Sirve en la interfaz y en el proceso principal (los avisos del sistema también salen tapados).

// [raíz, sufijos opcionales]. Cada letra de la raíz admite repeticiones (fuuuck).
const WORDS = [
  // español
  ["put", "(?:a|as|o|os|on|ones|ita|itas)"], ["mierd", "(?:a|as|ero|era)"], ["joder", ""], ["jodete", ""], ["jodid", "(?:a|o|as|os)"],
  ["coño", "s?"], ["cabron", "(?:a|es|as|azo|azos)?"], ["gilipoll", "(?:as|a|ez)"], ["capull", "(?:o|os|a|as)"],
  ["imbecil", "(?:es)?"], ["subnormal", "(?:es)?"], ["mongol", "(?:o|a|os|as)"], ["retrasad", "(?:o|a|os|as)"],
  ["maricon", "(?:es|a|as|azo)?"], ["marica", "s?"], ["polla", "s?"], ["follar", ""], ["follo", ""], ["cojones", ""], ["zorra", "s?"],
  ["pendej", "(?:o|a|os|as)"], ["chingar", ""], ["chinga", "(?:te|do|da)?"], ["verga", "s?"], ["hijueputa", "s?"], ["gonorrea", ""],
  ["negrata", "s?"], ["sudaca", "s?"], ["gitano de mierda", ""], ["panchito", "s?"],
  // gallego
  ["carallo", "s?"], ["merd", "(?:a|as)"], ["foder", ""], ["fodete", ""], ["boceta", "s?"], ["cona", "s?"], ["cabrom", "(?:s)?"], ["fillo de put", "(?:a)"],
  // inglés
  ["fuck", "(?:ing|ers?|ed|s|face|head)?"], ["shit", "(?:ty|head|s)?"], ["bitch", "(?:es|y)?"], ["asshole", "s?"], ["bastard", "s?"],
  ["cunt", "s?"], ["dickhead", "s?"], ["whore", "s?"], ["slut", "(?:s|ty)?"], ["motherfuck", "(?:er|ers|ing)"],
  ["nigg", "(?:er|ers|a|as)"], ["fagg", "(?:ot|ots)"], ["retard", "(?:ed|s)?"]
];

const WF_ACCENTS = { á: "a", à: "a", ä: "a", â: "a", é: "e", è: "e", ë: "e", ê: "e", í: "i", ì: "i", ï: "i", î: "i", ó: "o", ò: "o", ö: "o", ô: "o", ú: "u", ù: "u", ü: "u", û: "u" };
const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };

// Misma longitud que el original (así las posiciones coinciden): minúsculas, sin acentos (la ñ se queda) y con números por letras.
function normalize(text) {
  let out = "";
  for (const ch of String(text)) {
    const c = ch.toLowerCase();
    out += WF_ACCENTS[c] || LEET[c] || (c.length === 1 ? c : ch);
  }
  return out;
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stemRe = stem => stem.split("").map(c => (c === " " ? "\\s+" : `${escapeRe(c)}+`)).join("");
const LETTER = "a-zñ0-9";
const RE = new RegExp(`(?<![${LETTER}])(?:${WORDS.map(([stem, suf]) => `${stemRe(stem)}${suf || ""}`).join("|")})(?![${LETTER}])`, "g");

// Devuelve el texto con las palabras filtradas tapadas (*). Si no hay nada, devuelve el mismo texto.
function filterText(text) {
  const s = String(text == null ? "" : text);
  if (!s) return s;
  const norm = normalize(s);
  if (norm.length !== s.length) return s;   // caracteres raros que cambian de longitud: se deja tal cual (nunca se desajusta)
  let out = "", last = 0, hit = false;
  for (const m of norm.matchAll(RE)) {
    hit = true;
    out += s.slice(last, m.index) + s.slice(m.index, m.index + m[0].length).replace(/[^\s]/g, "*");
    last = m.index + m[0].length;
  }
  return hit ? out + s.slice(last) : s;
}
const hasBadWord = text => filterText(text) !== String(text == null ? "" : text);

if (typeof module !== "undefined" && module.exports) module.exports = { filterText, hasBadWord, normalize };
