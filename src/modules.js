"use strict";
// Otros módulos del aula (0.8.3): marcar actividades como completadas y progreso del curso, y ventanas propias para
// páginas, libros, URL, glosarios, wikis, bases de datos, talleres, lecciones, SCORM, H5P, encuestas, feedback y videoconferencias.
// Se carga después de activities.js y usa sus utilidades (actDialog, actSection, mqSanitize, browserBtn…) y las de renderer.js.
// El HTML del aula nunca se inserta tal cual: pasa por mqSanitize (documento inerte, solo etiquetas permitidas, imágenes solo del aula).

const MOD_KINDS = new Set(["page", "book", "link", "glossary", "wiki", "data", "workshop", "lesson", "scorm", "h5p", "survey", "feedback", "meeting"]);
const MOD_LABEL = {
  page: "PÁGINA", book: "LIBRO", link: "ENLACE", glossary: "GLOSARIO", wiki: "WIKI", data: "BASE DE DATOS", workshop: "TALLER", lesson: "LECCIÓN",
  scorm: "PAQUETE SCORM", h5p: "H5P", survey: "ENCUESTA", feedback: "FEEDBACK", meeting: "VIDEOCONFERENCIA"
};
const MOD_ICON = { page: "❏", book: "▥", link: "↗", glossary: "✦", wiki: "❖", data: "▦", workshop: "⚑", lesson: "▶", scorm: "▣", h5p: "◈", survey: "☰", feedback: "✱", meeting: "◉" };
const MOD_SUB = {
  page: "Página", book: "Libro", glossary: "Glosario", wiki: "Wiki", data: "Base de datos", workshop: "Taller", lesson: "Lección", scorm: "Paquete SCORM",
  h5p: "Contenido H5P", survey: "Encuesta", feedback: "Feedback"
};

// ------------------------------------------------------------------ completado y progreso
function compPaint(el, m) {
  const manual = m.comp === 1;
  el.classList.toggle("done", !!m.done);
  el.classList.toggle("fail", !!m.fail && !m.done);
  el.textContent = m.done ? "✓" : m.fail ? "✕" : "";
  const title = manual ? (m.done ? "Completada · pulsa para desmarcar" : "Pulsa para marcarla como completada")
    : m.done ? "Completada" : m.fail ? "No superada" : "Se completa sola al cumplir las condiciones";
  el.title = title; el.setAttribute("aria-label", title);
  if (manual) el.setAttribute("aria-pressed", m.done ? "true" : "false");
}

// Casilla de completado: manual (se pulsa) o automática (solo indica el estado).
function compButton(m, cls = "") {
  const manual = m.comp === 1;
  const b = h("button", { class: `comp-btn ${manual ? "" : "auto"} ${cls}`, type: "button", "data-comp": String(m.id), "aria-disabled": manual ? null : "true" });
  compPaint(b, m);
  if (manual) b.addEventListener("click", ev => { ev.stopPropagation(); toggleComplete(m, b); });
  return b;
}

async function toggleComplete(m, btn) {
  const want = !m.done;
  await actBusy(btn, async () => {
    await api("modComplete", state.accountId, m.id, want);
    m.done = want; m.fail = false;
    document.querySelectorAll(`[data-comp="${m.id}"]`).forEach(el => compPaint(el, m));
    notify(want ? "Actividad marcada como completada." : "Marca de completada quitada.");
  });
}

function courseProgress(c) {
  let done = 0, total = 0;
  for (const s of c.sections || []) for (const m of s.modules) if (m.comp) { total++; if (m.done) done++; }
  const pct = total ? Math.round(done * 100 / total) : (typeof c.progress === "number" ? Math.round(c.progress) : null);
  return { done, total, pct };
}
function progressBar(pct) {
  const fill = h("span");
  fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  return h("div", { class: "progress-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct) }, fill);
}
function progressCard(c) {
  const p = courseProgress(c);
  if (p.pct == null) return null;
  return h("div", { class: "progress-card" },
    h("div", { class: "progress-head" }, h("b", { text: "Tu progreso en el curso" }),
      h("span", { class: "muted", text: p.total ? `${p.done} de ${p.total} actividades completadas · ${p.pct} %` : `${p.pct} %` })),
    progressBar(p.pct));
}
function sectionProgressChip(s) {
  const tracked = s.modules.filter(m => m.comp);
  if (!tracked.length) return null;
  const done = tracked.filter(m => m.done).length;
  return chip(`${done}/${tracked.length} ✓`, done === tracked.length ? "ok" : "");
}

// Las actividades que se completan solas pueden haber cambiado al verlas: se vuelve a pedir el estado del curso.
async function refreshCompletion(course) {
  try {
    const map = await api("modCompletion", state.accountId, course.id);
    let changed = false;
    for (const s of course.sections || []) for (const m of s.modules) {
      const c = map[m.id]; if (!c || !m.comp) continue;
      if (m.done !== c.done || m.fail !== c.fail) { m.done = c.done; m.fail = c.fail; changed = true; }
    }
    if (changed) document.querySelectorAll("[data-comp]").forEach(el => {
      const mod = (course.sections || []).flatMap(s => s.modules).find(x => String(x.id) === el.dataset.comp);
      if (mod) compPaint(el, mod);
    });
  } catch { /* el aula puede no dar el estado: se queda como estaba */ }
}

function completionBox(m) {
  if (!m.comp) return null;
  const box = h("div", { class: "act-sec mod-comp" }, h("h3", { text: "Completado" }));
  if (m.comp === 1) {
    const b = compButton(m, "big");
    box.append(h("label", { class: "mod-comp-row" }, b, h("span", { text: "Marcar esta actividad como completada" })));
  } else {
    box.append(h("div", { class: "mod-comp-row" }, compButton(m, "big"),
      h("span", { text: m.done ? "Completada" : m.fail ? "No superada" : "Se completa sola al cumplir las condiciones" })));
    if (m.compDetails && m.compDetails.length) box.append(h("ul", { class: "mod-comp-rules" },
      m.compDetails.map(d => h("li", { class: d.done ? "done" : "", text: `${d.done ? "✓" : "○"} ${d.text}` }))));
  }
  return box;
}

// ------------------------------------------------------------------ ayudas
const modRich = (html, base) => { const box = h("div", { class: "act-text mod-rich" }); box.append(mqSanitize(html, { readonly: true, base })); return box; };
const hasText = html => !!plainText(html);
const hasEmbedded = html => /<(iframe|video|audio|object|embed)\b/i.test(String(html || ""));
const modPrimary = (text, fn) => h("button", { class: "primary", type: "button", text, onclick: e => actBusy(e.currentTarget, async () => { await fn(); }) });
const dateRows = pairs => pairs.filter(([, v]) => v).map(([k, v]) => h("div", { class: "info-row" }, h("span", { class: "muted", text: k }), h("b", { text: fmtDate(v) })));
const infoGrid = rows => rows.length ? h("div", { class: "info-grid" }, rows) : null;
const webHint = (m, text, label) => h("div", { class: "act-sec" }, h("div", { class: "form-hint", text }),
  h("div", { class: "dialog-actions left" }, h("button", { class: "primary", type: "button", text: label || "Abrir en el navegador", onclick: () => openModuleUrl(m) })));
const minutes = n => n >= 60 ? `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ""}` : `${n} min`;

// ------------------------------------------------------------------ ventana de un módulo
async function openModuleView(m, course) {
  const ctl = actDialog(`${MOD_LABEL[m.kind] || "ACTIVIDAD"} · ${course.shortname || course.fullname}`, m.name);
  ctl.dlg.classList.add("wide");
  const body = ctl.body;
  ctl.onClose = () => { if (m.comp === 2) refreshCompletion(course); };
  body.append(h("div", { class: "muted pad", text: "Cargando…" }));
  const foot = (...extra) => h("div", { class: "dialog-actions" }, ...extra, h("button", { class: "secondary", type: "button", text: "Cerrar", onclick: () => ctl.tryClose() }));
  let info;
  try { info = await api("modInfo", state.accountId, m.modname, course.id, m.id, m.instance || 0, m.linkUrl || ""); }
  catch (e) { clear(body).append(actErr(e.message), foot(browserBtn(m))); return; }
  clear(body);
  try {
    const extra = await MOD_VIEWS[m.kind](body, info, m, course, ctl);
    body.append(...[completionBox(m), foot(extra === false || m.kind === "link" ? null : browserBtn(m))].filter(Boolean));
  } catch (e) { body.append(actErr(e.message), foot(browserBtn(m))); }
}

const introBlock = info => (hasText(info.intro) ? modRich(info.intro) : null);

const MOD_VIEWS = {
  // ---------------------------------------------------------------- página
  page(body, info, m) {
    if (introBlock(info)) body.append(introBlock(info));
    body.append(hasText(info.content) || /<img\b/i.test(info.content) ? modRich(info.content) : h("div", { class: "muted pad", text: "La página está vacía." }));
    if (hasEmbedded(info.content)) body.append(h("div", { class: "form-hint" }, "Esta página incluye contenido incrustado (vídeo, audio u otro) que no se puede mostrar aquí. Ábrela en el navegador para verlo."));
    if (info.modified) body.append(h("small", { class: "muted", text: `Última modificación: ${fmtDate(info.modified)}` }));
  },

  // ---------------------------------------------------------------- URL
  link(body, info, m, course, ctl) {
    const url = info.url || m.linkUrl || "";
    if (introBlock(info)) body.append(introBlock(info));
    let host = ""; try { host = new URL(url).host; } catch { /* dirección no válida */ }
    if (!host) { body.append(actErr("El aula no ha dado una dirección válida para este enlace.")); return false; }
    body.append(actSection("Dirección", h("div", { class: "mod-link" }, h("b", { text: host }), h("div", { class: "muted mod-link-url", text: url.slice(0, 300) }))));
    body.append(h("div", { class: "form-hint", text: "Se abrirá en tu navegador. Comprueba que te fías de la dirección antes de poner ningún dato." }));
    const copy = h("button", { class: "secondary", type: "button", text: "Copiar enlace", onclick: async () => {
      try { await navigator.clipboard.writeText(url); notify("Enlace copiado."); } catch { notify("No se pudo copiar el enlace."); }
    } });
    body.append(h("div", { class: "dialog-actions left" },
      modPrimary("Abrir en el navegador", () => api("openExternal", url)), copy));
  },

  // ---------------------------------------------------------------- libro
  book(body, info, m, course, ctl) {
    if (introBlock(info)) body.append(introBlock(info));
    const chapters = info.chapters || [];
    if (!chapters.length) { body.append(h("div", { class: "form-hint", text: "El aula no da los capítulos de este libro a la app." })); return; }
    const toc = h("nav", { class: "mod-toc", "aria-label": "Capítulos" });
    const page = h("div", { class: "mod-book-page" });
    let current = -1, token = 0;
    const buttons = chapters.map((ch, i) => {
      const b = h("button", { class: `mod-toc-item l${ch.level}`, type: "button", text: ch.title, onclick: () => open(i) });
      toc.append(b); return b;
    });
    async function open(i) {
      if (i < 0 || i >= chapters.length) return;
      current = i; const my = ++token;
      buttons.forEach((b, k) => b.classList.toggle("on", k === i));
      clear(page).append(h("div", { class: "muted pad", text: "Cargando capítulo…" }));
      try {
        const r = await api("modBookChapter", state.accountId, course.id, m.id, chapters[i].id, info.id);
        if (my !== token) return;
        clear(page).append(h("h3", { class: "mod-chap-title", text: chapters[i].title }), modRich(r.html, r.base));
        if (hasEmbedded(r.html)) page.append(h("div", { class: "form-hint", text: "Este capítulo tiene contenido incrustado que no se puede mostrar aquí. Ábrelo en el navegador." }));
      } catch (e) { if (my === token) clear(page).append(actErr(e.message)); }
      page.append(h("div", { class: "mod-chap-nav" },
        h("button", { class: "secondary small", type: "button", text: "← Anterior", disabled: i === 0 ? "" : null, onclick: () => open(i - 1) }),
        h("span", { class: "muted", text: `Capítulo ${i + 1} de ${chapters.length}` }),
        h("button", { class: "secondary small", type: "button", text: "Siguiente →", disabled: i === chapters.length - 1 ? "" : null, onclick: () => open(i + 1) })));
      buttons[i].scrollIntoView({ block: "nearest" });
      body.querySelector(".mod-book")?.scrollIntoView({ block: "nearest" });
    }
    body.append(h("div", { class: "mod-book" }, toc, page));
    open(0);
  },

  // ---------------------------------------------------------------- glosario
  glossary(body, info, m, course) {
    if (introBlock(info)) body.append(introBlock(info));
    const q = h("input", { type: "search", placeholder: "Buscar un concepto…", "aria-label": "Buscar en el glosario", maxlength: "100" });
    const letter = h("select", { "aria-label": "Letra" }, h("option", { value: "ALL", text: "Todas" }),
      ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(l => h("option", { value: l, text: l })), h("option", { value: "SPECIAL", text: "Especiales" }));
    const list = h("div", { class: "mod-entries" });
    const more = h("button", { class: "secondary small", type: "button", text: "Cargar más", hidden: "" });
    const count = h("small", { class: "muted" });
    let from = 0, token = 0;
    async function load(reset) {
      if (reset) { from = 0; clear(list).append(h("div", { class: "muted pad", text: "Cargando…" })); more.hidden = true; }
      const my = ++token;
      try {
        const r = await api("modGlossaryEntries", state.accountId, info.id, { query: q.value.trim(), letter: letter.value, from });
        if (my !== token) return;
        if (reset) clear(list);
        for (const e of r.entries) list.append(h("article", { class: "mod-entry" },
          h("h4", { text: e.concept || "(sin concepto)" }), modRich(e.definition),
          h("div", { class: "mod-entry-meta" }, e.author ? h("span", { class: "muted", text: e.author }) : null, e.time ? h("span", { class: "muted", text: fmtDate(e.time) }) : null, !e.approved ? chip("Pendiente de aprobar", "warn") : null),
          e.files && e.files.length ? actFiles(e.files) : null));
        from += r.entries.length;
        if (!list.children.length) list.append(h("div", { class: "muted pad", text: "No hay entradas con ese filtro." }));
        count.textContent = r.total ? `${Math.min(from, r.total)} de ${r.total} entradas` : "";
        more.hidden = !(r.entries.length && from < r.total);
      } catch (e) { if (my === token) { clear(list).append(actErr(e.message)); more.hidden = true; } }
    }
    let timer = null;
    q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => load(true), 400); });
    q.addEventListener("keydown", e => { if (e.key === "Enter") { clearTimeout(timer); load(true); } });
    letter.addEventListener("change", () => { q.value = ""; load(true); });
    more.addEventListener("click", () => actBusy(more, () => load(false)));
    body.append(h("div", { class: "mod-search" }, q, letter), count, list, h("div", { class: "dialog-actions center" }, more),
      h("div", { class: "form-hint", text: "Para añadir o editar entradas, abre el glosario en el navegador." }));
    load(true);
  },

  // ---------------------------------------------------------------- wiki (lectura)
  wiki(body, info, m, course) {
    if (introBlock(info)) body.append(introBlock(info));
    const subs = info.subwikis || [];
    const pick = subs.length > 1 ? h("select", { "aria-label": "Wiki" }, subs.map((s, i) => h("option", { value: String(i), text: s.groupid ? `Wiki del grupo ${i + 1}` : s.userid ? `Wiki personal ${i + 1}` : `Wiki ${i + 1}` }))) : null;
    const list = h("nav", { class: "mod-toc", "aria-label": "Páginas" });
    const page = h("div", { class: "mod-book-page" }, h("div", { class: "muted pad", text: "Elige una página." }));
    let token = 0;
    async function showPage(p, btn) {
      const my = ++token;
      list.querySelectorAll(".mod-toc-item").forEach(b => b.classList.toggle("on", b === btn));
      clear(page).append(h("div", { class: "muted pad", text: "Cargando página…" }));
      try {
        const r = await api("modWikiPage", state.accountId, p.id);
        if (my !== token) return;
        clear(page).append(h("h3", { class: "mod-chap-title", text: r.title }), r.html ? modRich(r.html) : h("div", { class: "muted pad", text: "Página vacía." }));
      } catch (e) { if (my === token) clear(page).append(actErr(e.message)); }
    }
    async function loadPages() {
      clear(list).append(h("div", { class: "muted pad", text: "Cargando…" }));
      try {
        const pages = await api("modWikiPages", state.accountId, info.id, subs[pick ? Number(pick.value) : 0] || {});
        clear(list);
        if (!pages.length) { list.append(h("div", { class: "muted pad", text: "Esta wiki todavía no tiene páginas." })); clear(page); return; }
        let first = null;
        for (const p of pages) {
          const b = h("button", { class: "mod-toc-item l0", type: "button", text: p.title, onclick: () => showPage(p, b) });
          list.append(b);
          if (!first || p.title === info.firstPage) first = [p, b];
        }
        showPage(first[0], first[1]);
      } catch (e) { clear(list).append(actErr(e.message)); }
    }
    if (pick) { pick.addEventListener("change", loadPages); body.append(pick); }
    body.append(h("div", { class: "mod-book" }, list, page), h("div", { class: "form-hint", text: "En la app solo se lee la wiki. Para editar páginas, ábrela en el navegador." }));
    loadPages();
  },

  // ---------------------------------------------------------------- base de datos (lectura)
  data(body, info, m) {
    if (introBlock(info)) body.append(introBlock(info));
    const names = new Map((info.fields || []).map(f => [f.id, f.name]));
    const list = h("div", { class: "mod-entries" });
    const more = h("button", { class: "secondary small", type: "button", text: "Cargar más", hidden: "" });
    const count = h("small", { class: "muted" });
    let page = 0, shown = 0;
    async function load() {
      if (!shown) clear(list).append(h("div", { class: "muted pad", text: "Cargando entradas…" }));
      try {
        const r = await api("modDataEntries", state.accountId, info.id, page);
        if (!shown) clear(list);
        for (const e of r.entries) list.append(h("article", { class: "mod-entry" },
          ...e.contents.map(c => h("div", { class: "mod-field" }, h("b", { text: names.get(c.field) || "Campo" }), h("span", { text: c.text }))),
          h("div", { class: "mod-entry-meta" }, e.author ? h("span", { class: "muted", text: e.author }) : null, e.time ? h("span", { class: "muted", text: fmtDate(e.time) }) : null, !e.approved ? chip("Pendiente de aprobar", "warn") : null)));
        shown += r.entries.length; page++;
        if (!shown) list.append(h("div", { class: "muted pad", text: "Todavía no hay entradas." }));
        count.textContent = r.total ? `${Math.min(shown, r.total)} de ${r.total} entradas` : "";
        more.hidden = !(r.entries.length && shown < r.total);
      } catch (e) { clear(list).append(actErr(e.message)); more.hidden = true; }
    }
    more.addEventListener("click", () => actBusy(more, load));
    body.append(count, list, h("div", { class: "dialog-actions center" }, more),
      h("div", { class: "form-hint", text: "Para añadir, editar o buscar entradas con filtros, abre la base de datos en el navegador." }));
    load();
  },

  // ---------------------------------------------------------------- taller
  workshop(body, info, m) {
    body.append(h("div", { class: "act-chips" }, info.phase ? chip(info.phase, "warn") : null));
    if (introBlock(info)) body.append(introBlock(info));
    const rows = infoGrid(dateRows([["Entregas desde", info.submissionStart], ["Entregas hasta", info.submissionEnd], ["Evaluaciones desde", info.assessmentStart], ["Evaluaciones hasta", info.assessmentEnd]]));
    if (rows) body.append(rows);
    if (hasText(info.instructAuthors)) body.append(actSection("Instrucciones para la entrega", modRich(info.instructAuthors)));
    if (hasText(info.instructReviewers)) body.append(actSection("Instrucciones para evaluar", modRich(info.instructReviewers)));
    if (info.grades) {
      const g = info.grades, f = v => (v == null ? "—" : Number(v).toFixed(2).replace(/\.?0+$/, ""));
      body.append(actSection("Tus calificaciones", h("div", { class: "info-grid" },
        h("div", { class: "info-row" }, h("span", { class: "muted", text: "Por tu entrega" }), h("b", { text: `${f(g.submission)} / ${f(g.submissionMax)}` })),
        h("div", { class: "info-row" }, h("span", { class: "muted", text: "Por tus evaluaciones" }), h("b", { text: `${f(g.assessment)} / ${f(g.assessmentMax)}` })))));
    }
    body.append(webHint(m, "Enviar tu trabajo y evaluar a tus compañeros se hace en el navegador.", "Ir al taller"));
    return false;
  },

  // ---------------------------------------------------------------- lección
  lesson(body, info, m) {
    if (introBlock(info)) body.append(introBlock(info));
    const chips = h("div", { class: "act-chips" },
      info.timeLimit ? chip(`Tiempo: ${minutes(Math.round(info.timeLimit / 60))}`) : null,
      info.maxAttempts ? chip(`Máx. ${info.maxAttempts} intento${info.maxAttempts === 1 ? "" : "s"}`) : null,
      info.retake ? chip("Se puede repetir", "ok") : null);
    if (chips.children.length) body.append(chips);
    const rows = infoGrid(dateRows([["Disponible desde", info.available], ["Fecha límite", info.deadline]]));
    if (rows) body.append(rows);
    if (info.blocked && info.blocked.length) body.append(actSection("Ahora mismo no puedes entrar", h("ul", { class: "mod-comp-rules" }, info.blocked.map(t => h("li", { text: t })))));
    body.append(webHint(m, "Las lecciones se hacen en el navegador (tienen páginas, saltos y preguntas que dependen de tus respuestas).", "Hacer la lección"));
    return false;
  },

  // ---------------------------------------------------------------- SCORM
  scorm(body, info, m) {
    if (introBlock(info)) body.append(introBlock(info));
    const chips = h("div", { class: "act-chips" },
      info.attempts != null ? chip(`Intentos hechos: ${info.attempts}`) : null,
      info.maxAttempts ? chip(`Máx. ${info.maxAttempts}`) : chip("Intentos sin límite"));
    body.append(chips);
    const rows = infoGrid(dateRows([["Se abre", info.opens], ["Se cierra", info.closes]]));
    if (rows) body.append(rows);
    body.append(webHint(m, "Los paquetes SCORM se reproducen en el navegador.", "Abrir el paquete"));
    return false;
  },

  // ---------------------------------------------------------------- H5P
  h5p(body, info, m) {
    if (introBlock(info)) body.append(introBlock(info));
    const at = info.attempts || [];
    if (at.length) body.append(actSection("Tus intentos", h("div", { class: "item-list" }, at.slice().reverse().map(t => h("div", { class: "item static" },
      h("span", { class: "item-main" }, h("b", { text: `Intento ${t.n}` }), h("span", { class: "muted", text: [t.time ? fmtDate(t.time) : "", t.duration ? `${t.duration} s` : ""].filter(Boolean).join(" · ") })),
      t.score != null && t.max ? h("span", { class: "grade", text: `${t.score} / ${t.max}` }) : null,
      t.success === true ? chip("Superado", "ok") : t.success === false ? chip("No superado", "bad") : t.done ? chip("Completado", "ok") : null)))));
    else body.append(h("div", { class: "muted pad", text: "Todavía no has hecho ningún intento." }));
    body.append(webHint(m, "El contenido H5P se reproduce en el navegador.", "Abrir el contenido"));
    return false;
  },

  // ---------------------------------------------------------------- encuesta
  survey(body, info, m) {
    if (introBlock(info)) body.append(introBlock(info));
    const rows = infoGrid(dateRows([["Se abre", info.opens], ["Se cierra", info.closes]]));
    if (rows) body.append(rows);
    body.append(webHint(m, "Las encuestas se contestan en el navegador.", "Contestar la encuesta"));
    return false;
  },

  // ---------------------------------------------------------------- feedback
  feedback(body, info, m) {
    if (introBlock(info)) body.append(introBlock(info));
    if (info.note) body.append(h("div", { class: "form-hint", text: info.note }));
    const rows = infoGrid(dateRows([["Se abre", info.opens], ["Se cierra", info.closes]]));
    if (rows) body.append(rows);
    body.append(webHint(m, "El feedback se responde en el navegador.", "Responder el feedback"));
    return false;
  },

  // ---------------------------------------------------------------- videoconferencias (BigBlueButton y Zoom)
  meeting(body, info, m, course) {
    const zoom = info.provider === "zoom";
    if (introBlock(info)) body.append(introBlock(info));
    const live = info.live;
    if (live) body.append(h("div", { class: "act-chips" },
      live.running ? chip(`En directo · ${live.participants} persona${live.participants === 1 ? "" : "s"}`, "ok") : live.closed ? chip("Sala cerrada", "bad") : chip("Sala sin empezar", "warn"),
      live.isModerator ? chip("Eres moderador") : null));
    if (live && live.message) body.append(h("div", { class: "muted", text: live.message }));
    const rows = infoGrid(dateRows([["Empieza", info.opens || info.start], ["Termina", info.closes]]));
    if (rows) body.append(rows);
    if (zoom && info.duration) body.append(h("div", { class: "muted", text: `Duración prevista: ${minutes(info.duration)}` }));
    if (zoom && info.passwordNeeded) body.append(h("div", { class: "form-hint", text: "Esta reunión tiene contraseña: te la pedirá Zoom al entrar." }));
    if (info.welcome && hasText(info.welcome)) body.append(actSection("Mensaje de bienvenida", modRich(info.welcome)));
    const err = h("div", { class: "form-error", hidden: "" });
    const join = modPrimary(zoom ? "Unirse a la reunión" : "Unirse a la sala", async () => {
      err.hidden = true;
      try { await api("modMeetingJoin", state.accountId, m.modname, course.id, m.id, m.instance || info.id || 0); notify("Se abre en tu navegador."); }
      catch (e) { err.textContent = `${e.message} Prueba a abrirla en el navegador.`; err.hidden = false; }
    });
    if (live && (live.closed || live.canJoin === false)) join.disabled = true;
    body.append(h("div", { class: "dialog-actions left" }, join), err,
      h("div", { class: "form-hint", text: "La videoconferencia se abre en tu navegador, con tu sesión del aula." }));
  }
};
