"use strict";
// Mini renderizador de Markdown para los textos legales (títulos #, párrafos, listas «-» y «1.», **negrita**, *cursiva*, `código`, [enlaces](url)).
// Seguro por diseño: solo crea nodos con textContent, nunca usa innerHTML, así que un .md con HTML o scripts no puede inyectar nada.
const NXMarkdown = (() => {
  const el = (tag, text) => { const n = document.createElement(tag); if (text != null) n.textContent = text; return n; };

  // Texto en línea → nodos. Los enlaces se muestran como texto con la dirección entre paréntesis (no son clicables).
  function inline(parent, text) {
    const re = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.append(text.slice(last, m.index));
      if (m[1] != null) parent.append(el("strong", m[1]));
      else if (m[2] != null) parent.append(el("em", m[2]));
      else if (m[3] != null) parent.append(el("code", m[3]));
      else parent.append(`${m[4]} (${m[5]})`);
      last = re.lastIndex;
    }
    if (last < text.length) parent.append(text.slice(last));
  }

  function render(md) {
    const root = document.createDocumentFragment();
    let para = [], list = null;
    const flushPara = () => { if (para.length) { const p = el("p"); inline(p, para.join(" ")); root.append(p); para = []; } };
    const flushList = () => { if (list) { root.append(list); list = null; } };
    for (const raw of String(md || "").replace(/\r/g, "").split("\n")) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) { flushPara(); flushList(); continue; }
      if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) {
        flushPara(); flushList();
        const h = el("h" + Math.min(4, m[1].length + 1)); inline(h, m[2]); root.append(h); continue;
      }
      if ((m = /^\s*(?:[-*]\s+|(\d+)[.)]\s+)(.*)$/.exec(line))) {
        flushPara();
        const tag = m[1] ? "ol" : "ul";
        if (!list || list.tagName.toLowerCase() !== tag) { flushList(); list = el(tag); }
        const li = el("li"); inline(li, m[2]); list.append(li); continue;
      }
      flushList(); para.push(line.trim());
    }
    flushPara(); flushList();
    return root;
  }
  return { render };
})();
