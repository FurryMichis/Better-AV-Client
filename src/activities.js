"use strict";
// Tareas (entregas), cuestionarios y foros: ventanas de la interfaz.
// Se carga después de renderer.js y usa sus utilidades (h, api, notify, chip, avatar, fmtDate, state…).

const ACT_ICON = { task: "✎", quiz: "☑", forum: "❝" };
const ACT_UNSUPPORTED = new Set(["ddwtos", "ddimageortext", "ddmarker", "ordering", "stack", "proforma", "coderunner", "ddmatch"]);

function openActivity(m, course) {
  if (!course) return;
  if (m.kind === "task") return openAssignment(m, course);
  if (m.kind === "quiz") return openQuiz(m, course);
  if (m.kind === "forum") return openForum(m, course);
  if (typeof MOD_KINDS !== "undefined" && MOD_KINDS.has(m.kind)) return openModuleView(m, course);   // modules.js (0.8.3)
}

// ------------------------------------------------------------------ ventana base
function actDialog(eyebrow, title) {
  const ctl = { onClose: null, guard: null };
  const dlg = h("dialog", { class: "act-dialog" });
  ctl.tryClose = async () => { if (ctl.guard && !(await ctl.guard())) return; dlg.close(); };
  ctl.body = h("div", { class: "act-body" });
  dlg.append(h("div", { class: "act-wrap" },
    h("div", { class: "dialog-head" }, h("div", {}, h("div", { class: "eyebrow", text: eyebrow }), h("h2", { text: title })),
      h("button", { class: "close", type: "button", "aria-label": "Cerrar", text: "×", onclick: () => ctl.tryClose() })),
    ctl.body));
  dlg.addEventListener("cancel", e => { e.preventDefault(); ctl.tryClose(); });
  dlg.addEventListener("close", () => { try { ctl.onClose && ctl.onClose(); } finally { dlg.remove(); } });
  document.body.append(dlg); dlg.showModal();
  ctl.dlg = dlg;
  return ctl;
}

const actSection = (title, ...kids) => h("div", { class: "act-sec" }, h("h3", { text: title }), ...kids);
const actText = text => h("div", { class: "act-text", text });
const actErr = text => h("div", { class: "form-error", text });
const browserBtn = m => h("button", { class: "secondary small", type: "button", text: "Abrir en el navegador", onclick: () => openModuleUrl(m) });
const actFileRow = (name, meta, onOpen, onRemove) => h("div", { class: "act-file" },
  h("button", { class: "act-file-name", type: "button", disabled: onOpen ? null : "", onclick: onOpen || null }, h("span", { text: "▤" }), h("b", { text: name }), meta && h("small", { class: "muted", text: meta })),
  onRemove && h("button", { class: "close", type: "button", title: "Quitar", "aria-label": `Quitar ${name}`, text: "×", onclick: onRemove }));
const actFiles = files => files.length ? h("div", { class: "act-files" }, files.map(f => actFileRow(f.filename, fmtSize(f.filesize), () => openDoc({ fileurl: f.fileurl, filename: f.filename, timemodified: f.timemodified })))) : null;

async function actBusy(btn, fn) {
  btn.disabled = true;
  try { return await fn(); }
  catch (e) { notify(e.message); }
  finally { btn.disabled = false; }
}

const textToHtmlR = t => String(t).replace(/\r\n?/g, "\n").trim().split(/\n{2,}/)
  .map(p => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`).join("");

// ------------------------------------------------------------------ tareas
async function openAssignment(m, course) {
  const ctl = actDialog(`TAREA · ${course.shortname || course.fullname}`, m.name);
  let dirty = false;
  ctl.onClose = () => { if (dirty) setIView(state.view); };

  async function load() {
    clear(ctl.body).append(h("div", { class: "muted pad", text: "Cargando…" }));
    let info;
    try { info = await api("assignInfo", state.accountId, course.id, m.id); }
    catch (e) { clear(ctl.body).append(actErr(e.message), browserBtn(m)); return; }
    const status = info.status === "submitted" ? "submitted" : info.status === "draft" ? "draft" : "pending";
    const real = (course.sections || []).flatMap(s => s.modules).find(x => x.id === m.id) || m; // la lista de tareas trabaja con copias
    if (status !== real.status) { real.status = status; m.status = status; dirty = true; }
    paint(info);
  }

  async function changed(msg) { dirty = true; if (msg) notify(msg); await load(); }

  function paint(info) {
    const sub = info.submission;
    const overdue = info.due && info.due * 1000 < Date.now() && info.status !== "submitted";
    clear(ctl.body);
    ctl.body.append(h("div", { class: "act-chips" },
      info.status === "submitted" ? chip("Entregada", "ok") : info.status === "draft" ? chip("Borrador (sin enviar)", "warn") : overdue ? chip("Vencida", "bad") : chip("Sin entregar", "warn"),
      info.graded && chip("Calificada", "ok"),
      info.due ? h("span", { class: "muted", text: `Entrega: ${fmtDate(info.due)}` }) : h("span", { class: "muted", text: "Sin fecha límite" }),
      info.extension ? h("span", { class: "muted", text: `· Prórroga hasta ${fmtDate(info.extension)}` }) : null));
    if (info.intro) ctl.body.append(actText(info.intro));
    const att = actFiles(info.attachments); if (att) ctl.body.append(actSection("Archivos de la tarea", att));

    if (info.canEdit) ctl.body.append(editForm(info));
    else {
      const view = [];
      if (!info.fileEnabled && !info.textEnabled) view.push(h("div", { class: "form-hint", text: "Esta tarea no se entrega en línea (o la entrega se hace de otra forma). Mira las instrucciones del profesor." }));
      else if (info.locked) view.push(h("div", { class: "form-hint", text: "La entrega está bloqueada: no se puede modificar." }));
      else if (info.status === "submitted" && info.drafts) view.push(h("div", { class: "form-hint", text: "Tu entrega ya está enviada. Si necesitas cambiarla, pídeselo al profesor." }));
      else view.push(h("div", { class: "form-hint", text: "El aula no te deja modificar esta entrega ahora (plazo cerrado o sin permiso)." }));
      if (sub && sub.text) view.push(actText(sub.text));
      if (sub && sub.files.length) view.push(actFiles(sub.files));
      ctl.body.append(actSection("Tu entrega", ...view));
    }

    if (info.grade || info.feedbackText || info.feedbackFiles.length) {
      ctl.body.append(actSection("Corrección del profesor",
        info.grade ? h("div", { class: "act-grade" }, h("span", { class: "muted", text: "Calificación" }), h("b", { text: info.grade })) : null,
        info.gradedAt ? h("div", { class: "muted", text: `Calificada: ${fmtDate(info.gradedAt)}` }) : null,
        info.feedbackText ? actText(info.feedbackText) : null,
        actFiles(info.feedbackFiles)));
    }
    if (sub && sub.id) { const box = h("div"); ctl.body.append(box); commentsInto(box, info); }
    ctl.body.append(h("div", { class: "dialog-actions" }, browserBtn(m), h("button", { class: "secondary", type: "button", text: "Cerrar", onclick: () => ctl.tryClose() })));
  }

  function editForm(info) {
    const sub = info.submission;
    const origText = sub ? sub.text : "";
    let keep = sub ? sub.files.slice() : [];
    const picks = [];
    const ta = info.textEnabled ? h("textarea", { rows: "7", maxlength: "50000", placeholder: "Escribe aquí tu entrega…" }) : null;
    if (ta) ta.value = origText;
    const filesBox = h("div", { class: "act-files" });
    const addBtn = info.fileEnabled ? h("button", { class: "secondary small", type: "button", text: "＋ Añadir archivos", onclick: () => actBusy(addBtn, async () => {
      const got = await api("pickFiles");
      for (const f of got) {
        if (keep.length + picks.length >= info.maxFiles) { notify(`Máximo ${info.maxFiles} archivo${info.maxFiles === 1 ? "" : "s"}.`); break; }
        if (info.maxBytes > 0 && f.size > info.maxBytes) { notify(`«${f.name}» pesa más de lo permitido (${fmtSize(info.maxBytes)}).`); continue; }
        picks.push(f);
      }
      drawFiles();
    }) }) : null;
    function drawFiles() {
      clear(filesBox);
      for (const f of keep) filesBox.append(actFileRow(f.filename, fmtSize(f.filesize), () => openDoc({ fileurl: f.fileurl, filename: f.filename, timemodified: f.timemodified }), () => { keep = keep.filter(x => x !== f); drawFiles(); }));
      for (const f of picks) filesBox.append(actFileRow(f.name, `${fmtSize(f.size)} · nuevo`, null, () => { picks.splice(picks.indexOf(f), 1); drawFiles(); }));
      if (!keep.length && !picks.length) filesBox.append(h("div", { class: "muted", text: "Sin archivos." }));
      if (addBtn) addBtn.disabled = keep.length + picks.length >= info.maxFiles;
    }
    drawFiles();

    const saveBtn = h("button", { class: "primary", type: "button", text: info.drafts ? "Guardar borrador" : "Guardar entrega" });
    const submitBtn = h("button", { class: "primary", type: "button", text: "Enviar para calificar" });
    const delBtn = h("button", { class: "secondary danger", type: "button", text: "Borrar entrega" });
    const accept = h("input", { type: "checkbox" });
    const acceptRow = info.needStatement && info.drafts ? h("label", { class: "act-check" }, accept, h("span", { text: "Confirmo que esta entrega es obra mía (declaración de entrega del aula)." })) : null;

    saveBtn.onclick = () => actBusy(saveBtn, async () => {
      const textChanged = !!ta && ta.value.trim() !== origText.trim();
      const filesChanged = info.fileEnabled && (picks.length > 0 || keep.length !== (sub ? sub.files.length : 0));
      if (!textChanged && !filesChanged) { notify(sub ? "No has cambiado nada." : "Escribe algo o añade un archivo antes de guardar."); return; }
      await api("assignSave", state.accountId, info.assignId, {
        text: textChanged ? ta.value : null,
        keep: filesChanged ? keep.map(f => f.fileurl) : null,
        picks: picks.map(p => p.token)
      });
      await changed(info.drafts ? "Borrador guardado. Falta enviarlo para calificar." : "Entrega guardada.");
    });
    submitBtn.onclick = () => actBusy(submitBtn, async () => {
      if (acceptRow && !accept.checked) { notify("Marca la declaración de entrega para poder enviar."); return; }
      if (!confirm("¿Enviar la tarea para calificar? Después puede que no puedas cambiarla.")) return;
      await api("assignSubmit", state.accountId, info.assignId, accept.checked || !acceptRow);
      await changed("Tarea enviada.");
    });
    delBtn.onclick = () => actBusy(delBtn, async () => {
      if (!confirm("¿Borrar tu entrega? Se quitarán el texto y los archivos.")) return;
      await api("assignRemove", state.accountId, info.assignId);
      await changed("Entrega borrada.");
    });

    const showSubmit = info.drafts && sub && sub.status === "draft";
    return actSection("Tu entrega",
      ta && h("label", { class: "act-field" }, "Texto", ta),
      info.fileEnabled && h("div", { class: "act-field" }, h("div", { class: "act-label", text: "Archivos" }), filesBox, addBtn,
        h("div", { class: "muted", text: `Máximo ${info.maxFiles} archivo${info.maxFiles === 1 ? "" : "s"}${info.maxBytes ? `, ${fmtSize(info.maxBytes)} cada uno` : ""}.` })),
      sub && sub.time ? h("div", { class: "muted", text: `Última modificación: ${fmtDate(sub.time)}` }) : null,
      showSubmit && acceptRow,
      h("div", { class: "act-btns" }, saveBtn, showSubmit && submitBtn, sub && (sub.text || sub.files.length) ? delBtn : null));
  }

  async function commentsInto(box, info) {
    const sub = info.submission;
    let data;
    try { data = await api("assignComments", state.accountId, m.id, sub.id); }
    catch { return; } // comentarios desactivados en esta aula: no se muestra el apartado
    const list = h("div", { class: "act-comments" });
    for (const k of data.comments) {
      list.append(h("div", { class: "act-comment" + (k.mine ? " mine" : "") }, avatar(k.pic, k.name, "sm"),
        h("div", {}, h("div", { class: "act-c-head" }, h("b", { text: k.name }), h("span", { class: "muted", text: fmtDate(k.time) })), actText(k.text))));
    }
    if (!data.comments.length) list.append(h("div", { class: "muted", text: "Sin comentarios." }));
    box.append(actSection("Comentarios de la entrega", list));
    if (data.canPost) {
      const input = h("textarea", { rows: "2", maxlength: "2000", placeholder: "Escribe un comentario…" });
      const send = h("button", { class: "secondary small", type: "button", text: "Comentar", onclick: () => actBusy(send, async () => {
        if (!input.value.trim()) return;
        await api("assignComment", state.accountId, m.id, sub.id, input.value);
        clear(box); await commentsInto(box, info);
      }) });
      box.append(h("div", { class: "act-compose" }, input, send));
    }
  }

  load();
}

// ------------------------------------------------------------------ HTML de preguntas (saneado)
// El HTML de las preguntas lo escribe el profesorado: se lee en un documento inerte y solo se copian
// etiquetas y atributos permitidos. Nada de scripts, estilos, marcos ni controladores de eventos.
const MQ_TAGS = new Set("p div span br b strong i em u sub sup small big ul ol li table thead tbody tfoot tr td th caption pre code blockquote h1 h2 h3 h4 h5 h6 hr label a img input select option optgroup textarea fieldset legend".split(" "));
const MQ_DROP = new Set("script style iframe object embed noscript template svg math audio video source link meta button canvas applet base frame frameset head title".split(" "));
const MQ_SKIP_CLASS = /(^|\s)(questionflag|editquestion|im-controls|submitbtns|history|comment)(\s|$)/;
const MQ_INPUT_TYPES = new Set(["radio", "checkbox", "text", "number", "hidden"]);
const MQ_NAME = /^[\w:.\-]{1,120}$/;
const MQ_ID = /^[\w:.\-]{1,100}$/;

function htmlToPlainR(s) {
  const doc = new DOMParser().parseFromString(String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n"), "text/html");
  return doc.body.textContent.replace(/\n{3,}/g, "\n\n").trim();
}

function mqSanitize(html, { readonly = false, base = "" } = {}) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html"); // documento inerte: no ejecuta nada
  const frag = document.createDocumentFragment();
  const site = new URL(state.data.site.url);
  const abs = u => { try { return new URL(u, base || site.origin + "/"); } catch { return null; } };   // base: dirección de la página (capítulos de libro con rutas relativas)
  const openLink = href => {
    const u = abs(href);
    if (!u || (u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password) return;
    if (u.host === site.host && u.pathname.includes("/pluginfile.php/")) {
      openDoc({ fileurl: u.toString(), filename: decodeURIComponent(u.pathname.split("/").pop() || "archivo"), timemodified: 0 });
    } else api("openExternal", u.toString()).catch(e => notify(e.message));
  };
  const clampNum = (v, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };

  function make(tag, n) {
    const el = document.createElement(tag);
    const cls = (n.getAttribute("class") || "").split(/\s+/).filter(c => /^[\w-]{1,40}$/.test(c)).map(c => "mq-" + c).join(" ");
    if (cls) el.className = cls;
    const id = n.getAttribute("id"); if (id && MQ_ID.test(id)) el.id = "mq_" + id;
    if (tag === "label") { const f = n.getAttribute("for"); if (f && MQ_ID.test(f)) el.setAttribute("for", "mq_" + f); }
    else if (tag === "input") {
      const type = (n.getAttribute("type") || "text").toLowerCase();
      const name = n.getAttribute("name") || "";
      if (!MQ_INPUT_TYPES.has(type) || !MQ_NAME.test(name)) return null;
      el.type = type; el.setAttribute("name", name);
      el.value = String(n.getAttribute("value") == null ? "" : n.getAttribute("value")).slice(0, 2000);
      if (n.hasAttribute("checked")) el.checked = true;
      if (n.hasAttribute("disabled") || readonly) el.disabled = true;
      if (n.hasAttribute("readonly")) el.readOnly = true;
      const sz = clampNum(n.getAttribute("size"), 1, 80); if (sz) el.size = sz;
      const ml = clampNum(n.getAttribute("maxlength"), 1, 2000); if (ml) el.maxLength = ml;
    } else if (tag === "select") {
      const name = n.getAttribute("name") || ""; if (!MQ_NAME.test(name)) return null;
      el.setAttribute("name", name);
      if (n.hasAttribute("disabled") || readonly) el.disabled = true;
    } else if (tag === "option") {
      el.setAttribute("value", String(n.getAttribute("value") == null ? "" : n.getAttribute("value")).slice(0, 500));
      if (n.hasAttribute("selected")) el.selected = true;
    } else if (tag === "textarea") {
      const name = n.getAttribute("name") || ""; if (!MQ_NAME.test(name)) return null;
      el.setAttribute("name", name);
      el.rows = clampNum(n.getAttribute("rows"), 2, 30) || 8;
      const raw = n.textContent || "";
      el.value = /<\/?[a-z][^>]*>/i.test(raw) ? htmlToPlainR(raw) : raw;
      if (n.hasAttribute("disabled") || readonly) el.disabled = true;
    } else if (tag === "a") {
      const href = n.getAttribute("href") || "";
      el.setAttribute("role", "link"); el.tabIndex = 0;
      el.addEventListener("click", ev => { ev.preventDefault(); openLink(href); });
      el.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); openLink(href); } });
    } else if (tag === "img") {
      const u = abs(n.getAttribute("src") || "");
      if (!u || u.host !== site.host || (u.protocol !== "https:" && u.protocol !== "http:")) return null; // solo imágenes del propio aula
      el.alt = String(n.getAttribute("alt") || "").slice(0, 200);
      api("image", state.accountId, u.toString()).then(d => { el.src = d; }).catch(() => { el.alt = el.alt || "[imagen no disponible]"; });
    } else if (tag === "td" || tag === "th") {
      const cs = clampNum(n.getAttribute("colspan"), 1, 20); if (cs) el.colSpan = cs;
      const rs = clampNum(n.getAttribute("rowspan"), 1, 20); if (rs) el.rowSpan = rs;
    }
    return el;
  }
  function walk(src, out) {
    for (const n of src.childNodes) {
      if (n.nodeType === 3) { out.append(document.createTextNode(n.nodeValue)); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      if (MQ_DROP.has(tag) || MQ_SKIP_CLASS.test(n.getAttribute("class") || "")) continue;
      if (!MQ_TAGS.has(tag)) { walk(n, out); continue; }   // etiqueta desconocida: se conserva el texto de dentro
      const el = make(tag, n);
      if (!el) continue;
      if (tag !== "textarea" && tag !== "input" && tag !== "img") walk(n, el);
      out.append(el);
    }
  }
  walk(doc.body, frag);
  return frag;
}

// Respuestas escritas en una zona saneada → [{ name, value }] como las espera el aula.
function mqCollect(root) {
  const out = new Map();
  root.querySelectorAll("input,select,textarea").forEach(el => {
    const name = el.getAttribute("name");
    if (!name || el.disabled) return;
    const type = el.type;
    if (type === "radio") { if (el.checked) out.set(name, el.value); }
    else if (type === "checkbox") { if (el.checked) out.set(name, el.value || "1"); }
    else if (el.tagName === "TEXTAREA") {
      const fmt = root.querySelector(`input[type=hidden][name="${CSS.escape(name + "format")}"]`);
      out.set(name, fmt && fmt.value === "1" ? (el.value.trim() ? textToHtmlR(el.value) : "") : el.value);
    } else out.set(name, el.value);
  });
  return [...out].map(([name, value]) => ({ name, value }));
}

function questionBlock(q, { readonly = false } = {}) {
  const box = h("section", { class: "act-q" + (q.blocked ? " blocked" : "") });
  box.append(mqSanitize(q.html, { readonly }));
  if (!readonly && ACT_UNSUPPORTED.has(q.type)) box.append(h("div", { class: "form-hint", text: "Este tipo de pregunta (arrastrar y soltar u otro especial) no se puede contestar aquí. Ábrela en el navegador." }));
  else if (!readonly && box.querySelector("input[name$='_attachments']")) box.append(h("div", { class: "form-hint", text: "Esta pregunta pide archivos adjuntos: añádelos desde el navegador." }));
  if (!readonly && !box.querySelector("input:not([type=hidden]),select,textarea") && q.type !== "description" && !box.querySelector(".mq-informationitem"))
    box.append(h("div", { class: "form-hint", text: "No se pudo mostrar esta pregunta aquí. Si no es solo informativa, ábrela en el navegador." }));
  return box;
}

// ------------------------------------------------------------------ cuestionarios
async function openQuiz(m, course) {
  const ctl = actDialog(`CUESTIONARIO · ${course.shortname || course.fullname}`, m.name);
  let dirty = false, session = null, timer = null;
  const stopTimer = () => { clearInterval(timer); timer = null; };
  ctl.onClose = () => { stopTimer(); if (dirty) setIView(state.view); };
  ctl.guard = async () => {
    if (!session) return true;
    if (!confirm("Tienes un intento en curso. Se guardarán tus respuestas y podrás continuar después (el tiempo sigue corriendo). ¿Salir?")) return false;
    await session.save();
    return true;
  };
  const gradeText = (g, max) => g == null ? "—" : `${Number(g).toFixed(2).replace(/\.?0+$/, "")} / ${Number(max).toFixed(2).replace(/\.?0+$/, "")}`;
  const STATE = { inprogress: "En curso", finished: "Finalizado", overdue: "Fuera de plazo", abandoned: "Abandonado" };

  async function showInfo() {
    session = null; stopTimer();
    clear(ctl.body).append(h("div", { class: "muted pad", text: "Cargando…" }));
    let info;
    try { info = await api("quizInfo", state.accountId, course.id, m.id); }
    catch (e) { clear(ctl.body).append(actErr(e.message), browserBtn(m)); return; }
    clear(ctl.body);
    ctl.body.append(h("div", { class: "act-chips" },
      info.timeLimit ? chip(`Tiempo: ${Math.round(info.timeLimit / 60)} min`, "warn") : null,
      chip(info.maxAttempts ? `Intentos: ${info.attempts.length}/${info.maxAttempts}` : `Intentos: ${info.attempts.length} (sin límite)`),
      info.best != null ? chip(`Mejor nota: ${gradeText(info.best, info.maxGrade)}`, "ok") : null,
      info.timeClose ? h("span", { class: "muted", text: `Cierra: ${fmtDate(info.timeClose)}` }) : null));
    if (info.intro) ctl.body.append(actText(info.intro));
    if (info.rules.length) ctl.body.append(h("div", { class: "form-hint", text: info.rules.join(" · ") }));

    const hist = h("div", { class: "item-list act-attempts" });
    if (!info.attempts.length) hist.append(h("div", { class: "muted pad", text: "Todavía no has hecho ningún intento." }));
    for (const a of info.attempts) {
      hist.append(h("div", { class: "item static" },
        h("span", { class: "item-main" }, h("b", { text: `Intento ${a.number}` }),
          h("span", { class: "muted", text: [STATE[a.state] || a.state, a.start ? `Empezado ${fmtDate(a.start)}` : "", a.finish ? `Enviado ${fmtDate(a.finish)}` : ""].filter(Boolean).join(" · ") })),
        a.state === "finished" ? h("b", { text: gradeText(a.grade, info.maxGrade) }) : null,
        a.state === "finished" ? h("button", { class: "secondary small", type: "button", text: "Revisar", onclick: e => actBusy(e.currentTarget, () => showReview(info, a)) }) : null,
        a.state === "inprogress" ? h("button", { class: "primary small", type: "button", text: "Continuar", onclick: e => actBusy(e.currentTarget, () => runAttempt(info, a.id, pass.value, a.currentPage)) }) : null));
    }
    ctl.body.append(actSection("Tus intentos", hist));

    const pass = h("input", { type: "password", placeholder: "Contraseña del cuestionario", autocomplete: "off", maxlength: "200" });
    const running = info.attempts.find(a => a.state === "inprogress");
    const startBtn = h("button", { class: "primary", type: "button", text: "Empezar un intento nuevo", onclick: () => actBusy(startBtn, async () => {
      if (info.needsPassword && !pass.value) { notify("Escribe la contraseña del cuestionario."); return; }
      if (info.timeLimit && !confirm(`Este cuestionario tiene un límite de ${Math.round(info.timeLimit / 60)} minutos. El tiempo empieza al comenzar. ¿Empezar ahora?`)) return;
      const id = await api("quizStart", state.accountId, info.quizId, pass.value);
      dirty = true;
      await runAttempt(info, id, pass.value, 0);
    }) });
    if (info.unsupported) ctl.body.append(h("div", { class: "form-hint", text: "Este cuestionario usa una restricción especial (por ejemplo navegador seguro). Si no se abre desde aquí, hazlo en el navegador." }));
    if (info.reasons.length) ctl.body.append(h("div", { class: "form-hint", text: info.reasons.join(" · ") }));
    const actions = h("div", { class: "act-btns" });
    if (!running && info.canAttempt && !info.reasons.length) { if (info.needsPassword) actions.append(pass); actions.append(startBtn); }
    else if (running && info.needsPassword) actions.append(pass);
    actions.append(browserBtn(m));
    ctl.body.append(actions);
  }

  // ---- hacer el intento
  async function runAttempt(info, attemptId, pass, startPage) {
    let cur, offset = 0, form;
    const collect = () => (form ? mqCollect(form) : []);
    session = { save: async () => { try { await api("quizSave", state.accountId, attemptId, collect(), pass); } catch { /* se guardará al volver */ } } };

    async function goto(p) {
      cur = await api("quizPage", state.accountId, attemptId, p, pass);
      offset = cur.serverNow * 1000 - Date.now();
      draw();
    }
    const saveAndGo = async p => { await api("quizProcess", state.accountId, attemptId, collect(), { finish: false, password: pass }); await goto(p); };

    function endTime() {
      if (!info.timeLimit) return 0;
      let end = cur.attempt.start + info.timeLimit;
      if (info.timeClose) end = Math.min(end, info.timeClose);
      return end;
    }
    async function finishNow(timeup) {
      try { await api("quizProcess", state.accountId, attemptId, timeup ? collect() : [], { finish: true, timeup, password: pass }); }
      catch (e) { notify(e.message); if (!timeup) return; }
      dirty = true; notify(timeup ? "Se acabó el tiempo: tu intento se ha enviado." : "Intento enviado.");
      await showInfo();
    }

    function draw() {
      stopTimer();
      clear(ctl.body);
      const timerEl = h("b", { class: "act-timer" });
      ctl.body.append(h("div", { class: "act-qhead" }, h("b", { text: `Página ${cur.page + 1} de ${cur.attempt.pages}` }), endTime() ? timerEl : null));
      for (const msg of cur.messages) ctl.body.append(h("div", { class: "form-hint", text: msg }));
      form = h("div", { class: "act-questions" });
      for (const q of cur.questions) form.append(questionBlock(q));
      ctl.body.append(form);
      const last = cur.nextPage === -1;
      const busyNav = (btn, fn) => actBusy(btn, fn);
      const prev = h("button", { class: "secondary", type: "button", text: "← Anterior", onclick: e => busyNav(e.currentTarget, () => saveAndGo(cur.page - 1)) });
      const next = h("button", { class: "primary", type: "button", text: last ? "Terminar intento…" : "Siguiente →", onclick: e => busyNav(e.currentTarget, async () => {
        if (!last) return saveAndGo(cur.nextPage);
        await api("quizProcess", state.accountId, attemptId, collect(), { finish: false, password: pass });
        await showSummary();
      }) });
      const exit = h("button", { class: "secondary", type: "button", text: "Guardar y salir", onclick: e => busyNav(e.currentTarget, async () => {
        await api("quizProcess", state.accountId, attemptId, collect(), { finish: false, password: pass });
        dirty = true; await showInfo();
      }) });
      ctl.body.append(h("div", { class: "dialog-actions act-nav" }, exit, cur.page > 0 && !info.sequential ? prev : null, next));
      const end = endTime();
      if (end) {
        const tick = () => {
          const left = Math.floor(end - (Date.now() + offset) / 1000);
          if (left <= 0) { stopTimer(); timerEl.textContent = "00:00"; finishNow(true); return; }
          const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");
          timerEl.textContent = `⏱ ${mm}:${ss}`;
          timerEl.classList.toggle("low", left <= 60);
        };
        tick(); timer = setInterval(tick, 1000);
      }
    }

    async function showSummary() {
      stopTimer();
      const rows = await api("quizSummary", state.accountId, attemptId, pass);
      clear(ctl.body);
      ctl.body.append(actSection("Resumen del intento"));
      const list = h("div", { class: "item-list" });
      for (const r of rows) {
        const go = !info.sequential ? () => actBusy(list, () => goto(r.page)) : null;
        list.append(h("button", { class: "item", type: "button", disabled: go ? null : "", onclick: go || null },
          h("span", { class: "item-main" }, h("b", { text: `Pregunta ${r.number}` }), h("span", { class: "muted", text: r.status })),
          r.done ? chip("Respondida", "ok") : chip("Sin responder", "warn")));
      }
      ctl.body.append(list);
      const sinResp = rows.filter(r => !r.done).length;
      if (sinResp) ctl.body.append(h("div", { class: "form-hint", text: `Te quedan ${sinResp} pregunta${sinResp === 1 ? "" : "s"} sin responder.` }));
      const back = h("button", { class: "secondary", type: "button", text: "← Volver al intento", onclick: () => actBusy(back, () => goto(cur.page)) });
      const fin = h("button", { class: "primary", type: "button", text: "Enviar todo y terminar", onclick: () => actBusy(fin, async () => {
        if (!confirm("Después de enviar no podrás cambiar tus respuestas. ¿Enviar el intento?")) return;
        await finishNow(false);
      }) });
      ctl.body.append(h("div", { class: "dialog-actions" }, back, fin));
    }

    await goto(Math.max(0, startPage || 0));
  }

  // ---- revisar un intento terminado
  async function showReview(info, a) {
    const r = await api("quizReview", state.accountId, a.id);
    clear(ctl.body);
    ctl.body.append(h("div", { class: "act-chips" }, chip(`Intento ${a.number}`), a.grade != null ? chip(`Nota: ${gradeText(a.grade, info.maxGrade)}`, "ok") : null));
    if (r.extra.length) ctl.body.append(h("div", { class: "act-extra" }, r.extra.map(x => h("div", {}, h("span", { class: "muted", text: x.title }), h("span", { text: x.content })))));
    const qs = h("div", { class: "act-questions" });
    for (const q of r.questions) qs.append(questionBlock(q, { readonly: true }));
    if (!r.questions.length) qs.append(h("div", { class: "muted pad", text: "El profesor no permite ver las preguntas de este intento." }));
    ctl.body.append(qs, h("div", { class: "dialog-actions" }, h("button", { class: "secondary", type: "button", text: "← Volver", onclick: () => showInfo() })));
  }

  showInfo();
}

// ------------------------------------------------------------------ foros
async function openForum(m, course) {
  const ctl = actDialog(`FORO · ${course.shortname || course.fullname}`, m.name);
  let info = null;
  const subscribed = new Map(); // id de debate → true/false (lo que ya sabemos)

  async function showList(page = 0, keep) {
    const first = page === 0;
    if (first) clear(ctl.body).append(h("div", { class: "muted pad", text: "Cargando…" }));
    try {
      if (!info) info = await api("forumInfo", state.accountId, course.id, m.id);
      const r = await api("forumDiscussions", state.accountId, info.forumId, page);
      const list = first ? h("div", { class: "item-list" }) : keep;
      if (first) {
        clear(ctl.body);
        if (info.intro) ctl.body.append(actText(info.intro));
        const bar = h("div", { class: "act-btns" });
        if (info.canNew) bar.append(h("button", { class: "primary small", type: "button", text: "＋ Nuevo debate", onclick: newDiscussion }));
        bar.append(browserBtn(m));
        ctl.body.append(bar, list);
      }
      for (const d of r.discussions) {
        if (typeof d.subscribed === "boolean") subscribed.set(d.id, d.subscribed);
        list.append(h("button", { class: "item", type: "button", onclick: () => showThread(d) },
          avatar(d.pic, d.author, "sm"),
          h("span", { class: "item-main" }, h("b", { text: (d.pinned ? "📌 " : "") + d.title }),
            h("span", { class: "muted", text: `${d.author} · ${fmtDate(d.modified || d.created)} · ${d.replies} respuesta${d.replies === 1 ? "" : "s"}` }),
            d.preview ? h("span", { class: "muted act-preview", text: d.preview }) : null),
          d.unread ? chip(`${d.unread} nuevo${d.unread === 1 ? "" : "s"}`, "new") : null, d.locked ? chip("Cerrado") : null));
      }
      if (first && !r.discussions.length) list.append(h("div", { class: "muted pad", text: "Todavía no hay debates en este foro." }));
      list.querySelector(".act-more")?.remove();
      if (r.more) {
        const more = h("button", { class: "secondary small act-more", type: "button", text: "Cargar más", onclick: () => actBusy(more, () => showList(page + 1, list)) });
        list.append(h("div", { class: "pad act-more" }, more));
      }
    } catch (e) { if (first) clear(ctl.body).append(actErr(e.message), browserBtn(m)); else notify(e.message); }
  }

  function composeDialog(title, withSubject, defaults, onSend) {
    const sub = withSubject ? h("input", { maxlength: "255", placeholder: "Asunto", required: "" }) : null;
    if (sub && defaults.subject) sub.value = defaults.subject;
    const text = h("textarea", { rows: "7", maxlength: "20000", placeholder: "Escribe tu mensaje…" });
    const follow = h("input", { type: "checkbox" });
    const err = h("div", { class: "form-error", hidden: "" });
    const dlg = h("dialog", { class: "act-dialog small" });
    const send = h("button", { class: "primary", type: "button", text: "Publicar", onclick: () => actBusy(send, async () => {
      err.hidden = true;
      try { await onSend(sub ? sub.value : defaults.subject, text.value, follow.checked); dlg.close(); }
      catch (e) { err.textContent = e.message; err.hidden = false; }
    }) });
    dlg.append(h("div", { class: "act-wrap" },
      h("div", { class: "dialog-head" }, h("div", {}, h("div", { class: "eyebrow", text: "FORO" }), h("h2", { text: title })), h("button", { class: "close", type: "button", text: "×", "aria-label": "Cerrar", onclick: () => dlg.close() })),
      sub && h("label", { class: "act-field" }, "Asunto", sub),
      h("label", { class: "act-field" }, "Mensaje", text),
      h("label", { class: "act-check" }, follow, h("span", { text: "Avisarme de las respuestas (suscribirme al debate)" })),
      err, h("div", { class: "dialog-actions" }, h("button", { class: "secondary", type: "button", text: "Cancelar", onclick: () => dlg.close() }), send)));
    dlg.addEventListener("close", () => dlg.remove());
    document.body.append(dlg); dlg.showModal();
  }

  function newDiscussion() {
    composeDialog("Nuevo debate", true, {}, async (subject, text, follow) => {
      await api("forumNew", state.accountId, info.forumId, subject, text, follow);
      notify("Debate creado."); showList(0);
    });
  }

  async function showThread(d) {
    clear(ctl.body).append(h("div", { class: "muted pad", text: "Cargando…" }));
    let data;
    try { data = await api("forumPosts", state.accountId, d.id); }
    catch (e) { clear(ctl.body).append(actErr(e.message), h("button", { class: "secondary small", type: "button", text: "← Debates", onclick: () => showList(0) })); return; }
    const forumId = data.forumId || info.forumId;
    clear(ctl.body);
    const subBtn = h("button", { class: "secondary small", type: "button" });
    const paintSub = () => { const s = subscribed.get(d.id); subBtn.textContent = s ? "🔔 Suscrito · dejar de seguir" : "🔔 Suscribirme"; };
    paintSub();
    subBtn.onclick = () => actBusy(subBtn, async () => {
      const now = await api("forumSubscribe", state.accountId, forumId, d.id, !subscribed.get(d.id));
      subscribed.set(d.id, now); paintSub(); notify(now ? "Te avisaremos las respuestas de este debate (por el aula)." : "Dejas de seguir este debate.");
    });
    ctl.body.append(h("div", { class: "act-btns" }, h("button", { class: "secondary small", type: "button", text: "← Debates", onclick: () => showList(0) }), subBtn, browserBtn(m)));
    ctl.body.append(h("h3", { class: "act-thread-title", text: d.title }));

    const byParent = new Map();
    for (const p of data.posts) { const k = data.posts.some(x => x.id === p.parent) ? p.parent : 0; (byParent.get(k) || byParent.set(k, []).get(k)).push(p); }
    const box = h("div", { class: "act-posts" });
    const subjectOf = p => (/^re:/i.test(p.subject) ? p.subject : `Re: ${p.subject || d.title}`).slice(0, 255);
    const drawPost = (p, depth) => {
      const reply = h("div");
      box.append(h("article", { class: "act-post" + (p.unread ? " unread" : ""), style: `margin-left:${Math.min(depth, 5) * 22}px` },
        avatar(p.pic, p.author, "sm"),
        h("div", { class: "act-post-main" },
          h("div", { class: "act-c-head" }, h("b", { text: p.author }), h("span", { class: "muted", text: fmtDate(p.time) }), p.unread ? chip("NUEVO", "new") : null),
          p.subject && depth === 0 ? null : (p.subject ? h("div", { class: "muted", text: p.subject }) : null),
          actText(p.text), actFiles(p.files),
          p.canReply && d.canReply ? h("button", { class: "secondary small", type: "button", text: "Responder", onclick: () => composeDialog("Responder", false, { subject: subjectOf(p) }, async (subject, text, follow) => {
            await api("forumReply", state.accountId, p.id, subject, text, follow);
            if (follow) subscribed.set(d.id, true);
            notify("Respuesta publicada."); showThread(d);
          }) }) : null, reply)));
      for (const c of byParent.get(p.id) || []) drawPost(c, depth + 1);
    };
    for (const p of byParent.get(0) || []) drawPost(p, 0);
    if (!data.posts.length) box.append(h("div", { class: "muted pad", text: "Este debate no tiene mensajes visibles." }));
    ctl.body.append(box);
  }

  showList(0);
}
