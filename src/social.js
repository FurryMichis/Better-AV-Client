"use strict";
// Mensajes del aula (chats, grupos de Moodle, contactos, bloqueos), calendario con eventos propios y avisos.
// Se carga después de renderer.js y activities.js (usa sus utilidades: h, api, notify, chip, avatar, actDialog…).

const personRow = (u, ...actions) => h("div", { class: "friend-row" }, avatar(u.pic, u.name, "sm"),
  h("span", { class: "item-main" }, h("b", { text: u.name }),
    h("span", { class: "muted", text: [u.online ? "● en línea" : "", u.contact ? "Contacto" : "", u.blocked ? "Bloqueado" : "", !u.canMessage && u.requiresContact ? "Solo acepta mensajes de sus contactos" : ""].filter(Boolean).join(" · ") })),
  h("div", { class: "acts" }, actions.filter(Boolean)));

const smallBtn = (text, onclick, kind = "secondary") => {
  const b = h("button", { class: `${kind} small`, type: "button", text });
  b.addEventListener("click", () => actBusy(b, () => onclick(b)));
  return b;
};

// ------------------------------------------------------------------ mensajes
async function renderMessages(root) {
  state.convId = null;
  const acc = state.accountId, me = state.data.user.id;
  const sumUnread = list => list.reduce((n, cv) => n + (cv.muted ? 0 : cv.unread), 0);
  let convs = [], filter = "", active = null;

  const list = h("div", { class: "conv-list" });
  const thread = h("div", { class: "thread" }, h("div", { class: "muted pad", text: "Selecciona un chat o empieza uno nuevo." }));
  const search = h("input", { type: "search", placeholder: "Filtrar chats…", "aria-label": "Filtrar chats" });
  const reqBadge = h("span", { class: "chip new", hidden: "" });
  const contactsBtn = h("button", { class: "secondary small", type: "button" }, "Contactos ", reqBadge);
  root.append(pageTitle("COMUNICACIÓN", "Mensajes", "Tus chats del aula, grupos y contactos."),
    h("div", { class: "msg-toolbar" },
      h("button", { class: "primary small", type: "button", text: "＋ Nuevo mensaje", onclick: () => openNewMessage() }),
      contactsBtn, search),
    h("div", { class: "messages-layout" }, list, thread));
  contactsBtn.onclick = () => openContacts();
  search.addEventListener("input", () => { filter = search.value.trim().toLowerCase(); drawList(); });
  api("contactRequests", acc).then(r => { if (r.length) { reqBadge.textContent = String(r.length); reqBadge.hidden = false; } }).catch(() => {});

  async function loadList(keepActive) {
    convs = (await api("conversations", acc, me)).sort((a, b) => b.time - a.time);
    setUnread(sumUnread(convs));
    drawList();
    if (keepActive && active && active.id) { const cv = convs.find(x => x.id === active.id); if (cv) active = cv; }
  }

  function drawList() {
    clear(list);
    const rows = convs.filter(cv => !filter || cv.name.toLowerCase().includes(filter));
    if (!convs.length) { list.append(h("div", { class: "muted pad", text: "No tienes chats. Pulsa «＋ Nuevo mensaje» para escribir a alguien." })); return; }
    if (!rows.length) { list.append(h("div", { class: "muted pad", text: "Ningún chat coincide." })); return; }
    for (const cv of rows) {
      const unreadChip = cv.unread > 0 && !cv.muted ? chip(String(cv.unread), "new") : null;
      const btn = h("button", { class: "conv" + (active && active.id === cv.id ? " active" : "") },
        cv.type === 2 ? h("div", { class: "pic sm group-pic", text: "👥" }) : avatar(cv.pic, cv.name, "sm"),
        h("span", { class: "item-main" }, h("b", { text: cv.name }), h("span", { class: "muted", text: cv.last.slice(0, 60) })),
        cv.type === 2 ? chip("GRUPO") : null, cv.muted ? h("span", { class: "muted", title: "Silenciado", text: "🔕" }) : null, unreadChip);
      btn._chip = unreadChip;
      btn.addEventListener("click", () => openConv(cv).catch(e => notify(e.message)));
      list.append(btn);
    }
  }

  async function openConv(cv) {
    active = cv; state.convId = cv.id;
    drawList();
    clear(thread).append(h("div", { class: "muted pad", text: "Cargando…" }));
    const data = await api("msgThread", acc, cv.id);
    if (!active || active.id !== cv.id) return; // se abrió otro chat mientras cargaba
    const msgs = data.messages;
    if (cv.unread > 0) { // el chat ya está abierto: se marca como leído y desaparece el número
      cv.unread = 0; setUnread(sumUnread(convs)); drawList();
      api("markRead", acc, me, cv.id, Math.max(cv.time || 0, ...msgs.map(m => m.time))).catch(() => {});
    }
    const isGroup = cv.type === 2;
    const box = h("div", { class: "bubbles" });
    for (const m of msgs) {
      const mine = m.from === me;
      box.append(h("div", { class: `bubble ${mine ? "mine" : ""}` },
        isGroup && !mine ? h("div", { class: "bubble-from", text: (data.members[m.from] || {}).name || "Alguien" }) : null,
        h("div", { text: m.text }),
        h("small", { text: fmtDate(m.time) }),
        h("button", { class: "bubble-del", type: "button", title: "Borrar para mí", "aria-label": "Borrar mensaje", text: "🗑", onclick: async e => {
          if (!confirm("¿Borrar este mensaje? Solo desaparece para ti.")) return;
          await actBusy(e.currentTarget, async () => { await api("msgDelete", acc, m.id); await openConv(cv); });
        } })));
    }
    if (!msgs.length) box.append(h("div", { class: "muted pad", text: "Todavía no hay mensajes." }));

    const input = h("textarea", { rows: "2", placeholder: "Escribe un mensaje…", "aria-label": "Mensaje" });
    const send = h("button", { class: "primary", type: "button", text: "Enviar" });
    const doSend = async () => {
      const text = input.value.trim();
      if (!text) return;
      send.disabled = true;
      try { await api("send", acc, { convId: cv.id, text }); input.value = ""; await openConv(cv); }
      catch (e) { notify(e.message); }
      finally { send.disabled = false; }
    };
    send.onclick = doSend;
    setTimeout(() => { if (input.isConnected && !document.querySelector("dialog[open]")) input.focus(); }, 0);   // se puede escribir sin pulsar antes el cuadro
    input.addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doSend(); } });
    const blockedNote = cv.type === 1 && cv.blocked ? "Has bloqueado a esta persona. Desbloquéala para escribirle." : cv.type === 1 && !cv.canMessage ? "Esta persona solo acepta mensajes de sus contactos." : "";
    const composer = blockedNote
      ? h("div", { class: "composer" }, h("div", { class: "form-hint", style: "flex:1", text: blockedNote }))
      : h("div", { class: "composer" }, input, send);

    const acts = h("div", { class: "thread-acts" });
    const reload = async () => { await loadList(true); const again = convs.find(x => x.id === cv.id); if (again) await openConv(again); else { active = null; clear(thread).append(h("div", { class: "muted pad", text: "Selecciona un chat." })); } };
    if (cv.type === 1 && cv.otherId) {
      acts.append(
        cv.contact ? smallBtn("✓ Contacto · quitar", async () => { await api("contactRemove", acc, cv.otherId); notify("Contacto eliminado."); await reload(); })
          : smallBtn("＋ Añadir a contactos", async () => { await api("contactAdd", acc, cv.otherId); notify("Solicitud de contacto enviada."); }),
        cv.blocked ? smallBtn("Desbloquear", async () => { await api("userUnblock", acc, cv.otherId); notify("Persona desbloqueada."); await reload(); })
          : smallBtn("Bloquear", async () => { if (!confirm(`¿Bloquear a ${cv.name}? No podrá escribirte.`)) return; await api("userBlock", acc, cv.otherId); notify("Persona bloqueada."); await reload(); }, "secondary danger"));
    }
    if (cv.type === 2) acts.append(smallBtn(`👥 Miembros (${cv.members})`, () => openMembers(cv)));
    if (cv.type !== 3) acts.append(smallBtn(cv.muted ? "🔔 Activar avisos" : "🔕 Silenciar", async () => {
      await api("msgMute", acc, cv.id, !cv.muted); notify(cv.muted ? "Avisos activados." : "Chat silenciado."); await reload();
    }));
    acts.append(smallBtn("Borrar conversación", async () => {
      if (!confirm("¿Borrar esta conversación? Solo desaparece para ti.")) return;
      await api("msgDeleteConv", acc, cv.id); notify("Conversación borrada."); active = null;
      clear(thread).append(h("div", { class: "muted pad", text: "Selecciona un chat." })); await loadList();
    }, "secondary danger"));

    clear(thread).append(h("div", { class: "thread-head" }, h("span", { text: cv.name }),
      cv.type === 2 ? chip("GRUPO") : null), acts, box, composer);
    box.scrollTop = box.scrollHeight;
  }

  // Nueva conversación con alguien con quien todavía no hablas.
  function openDraft(u) {
    active = { id: 0 }; state.convId = null; drawList();
    const input = h("textarea", { rows: "3", placeholder: `Escribe tu primer mensaje a ${u.name}…`, "aria-label": "Mensaje" });
    const send = h("button", { class: "primary", type: "button", text: "Enviar", onclick: () => actBusy(send, async () => {
      const text = input.value.trim();
      if (!text) return;
      await api("send", acc, { toUserId: u.id, text });
      notify("Mensaje enviado.");
      await loadList();
      const id = await api("msgConvWith", acc, u.id);
      const cv = convs.find(x => x.id === id);
      if (cv) await openConv(cv); else clear(thread).append(h("div", { class: "muted pad", text: "Mensaje enviado. Aparecerá en la lista enseguida." }));
    }) });
    clear(thread).append(h("div", { class: "thread-head", text: `Nuevo mensaje a ${u.name}` }), h("div", { class: "bubbles" }, h("div", { class: "muted pad", text: "Aún no habéis hablado." })), h("div", { class: "composer" }, input, send));
    input.focus();
  }

  async function startWith(u) {
    const id = await api("msgConvWith", acc, u.id);
    if (id) {
      if (!convs.some(x => x.id === id)) await loadList();
      const cv = convs.find(x => x.id === id);
      if (cv) return openConv(cv);
    }
    openDraft(u);
  }

  function openMembers(cv) {
    const ctl = actDialog("GRUPO DEL AULA", cv.name);
    ctl.body.append(h("div", { class: "muted pad", text: "Cargando…" }));
    api("msgMembers", acc, cv.id).then(members => {
      clear(ctl.body);
      const box = h("div", { class: "item-list" });
      for (const u of members) {
        box.append(personRow(u, u.id === me ? chip("TÚ") : null,
          u.id !== me ? smallBtn("Mensaje", async () => { ctl.dlg.close(); await startWith(u); }) : null,
          u.id !== me && !u.contact ? smallBtn("＋ Contacto", async () => { await api("contactAdd", acc, u.id); notify("Solicitud de contacto enviada."); }) : null));
      }
      ctl.body.append(box);
    }).catch(e => { clear(ctl.body).append(actErr(e.message)); });
  }

  function openNewMessage() {
    const ctl = actDialog("MENSAJES", "Nuevo mensaje");
    const q = h("input", { type: "search", placeholder: "Busca a alguien por su nombre…", "aria-label": "Buscar personas", autofocus: "" });
    const results = h("div", { class: "act-sec" }, h("div", { class: "muted", text: "Escribe al menos 2 letras. Solo salen personas que el aula te deja encontrar (por ejemplo, de tus cursos)." }));
    ctl.body.append(q, results);
    let timer = null, seq = 0;
    const row = u => personRow(u,
      u.canMessage ? smallBtn("Mensaje", async () => { ctl.dlg.close(); await startWith(u); }, "primary") : null,
      !u.contact ? smallBtn("＋ Contacto", async () => { await api("contactAdd", acc, u.id); notify("Solicitud de contacto enviada."); }) : null);
    q.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const term = q.value.trim(), mine = ++seq;
        if (term.length < 2) { clear(results).append(h("div", { class: "muted", text: "Escribe al menos 2 letras." })); return; }
        clear(results).append(h("div", { class: "muted", text: "Buscando…" }));
        try {
          const r = await api("msgSearch", acc, term);
          if (mine !== seq) return;
          clear(results);
          if (r.contacts.length) results.append(actSection("Contactos", h("div", { class: "item-list" }, r.contacts.map(row))));
          if (r.others.length) results.append(actSection("Otras personas", h("div", { class: "item-list" }, r.others.map(row))));
          if (!r.contacts.length && !r.others.length) results.append(h("div", { class: "muted", text: "No se encontró a nadie con ese nombre." }));
        } catch (e) { if (mine === seq) clear(results).append(actErr(e.message), h("div", { class: "muted", text: "También puedes escribir desde «Participantes» dentro de un curso." })); }
      }, 350);
    });
    setTimeout(() => q.focus(), 50);
  }

  function openContacts() {
    const ctl = actDialog("MENSAJES", "Contactos");
    let tab = "contacts"; const data = { contacts: [], requests: [], blocked: [] }, failed = {};
    const tabs = h("div", { class: "act-tabs" });
    const body = h("div", { class: "act-sec" });
    ctl.body.append(tabs, body);
    const refresh = async () => {
      await Promise.all([["contacts", "contactsList"], ["requests", "contactRequests"], ["blocked", "blockedList"]].map(async ([k, fn]) => {
        try { data[k] = await api(fn, acc); failed[k] = ""; } catch (e) { data[k] = []; failed[k] = e.message; }
      }));
      draw();
    };
    const after = async msg => { if (msg) notify(msg); await refresh(); };
    function draw() {
      clear(tabs); clear(body);
      for (const [k, label] of [["contacts", "Contactos"], ["requests", "Solicitudes"], ["blocked", "Bloqueados"]]) {
        tabs.append(h("button", { class: "act-tab" + (tab === k ? " on" : ""), type: "button", text: `${label} (${data[k].length})`, onclick: () => { tab = k; draw(); } }));
      }
      if (failed[tab]) body.append(actErr(failed[tab]));
      const items = data[tab];
      if (!items.length && !failed[tab]) body.append(h("div", { class: "muted pad", text: tab === "contacts" ? "Aún no tienes contactos. Búscalos en «＋ Nuevo mensaje»." : tab === "requests" ? "No tienes solicitudes pendientes." : "No has bloqueado a nadie." }));
      const box = h("div", { class: "item-list" });
      for (const u of items) {
        if (tab === "contacts") box.append(personRow(u,
          smallBtn("Mensaje", async () => { ctl.dlg.close(); await startWith(u); }, "primary"),
          smallBtn("Quitar", async () => { await api("contactRemove", acc, u.id); await after("Contacto eliminado."); }),
          smallBtn("Bloquear", async () => { if (!confirm(`¿Bloquear a ${u.name}?`)) return; await api("userBlock", acc, u.id); await after("Persona bloqueada."); loadList(true); }, "secondary danger")));
        else if (tab === "requests") box.append(personRow(u,
          smallBtn("Aceptar", async () => { await api("contactConfirm", acc, u.id); await after(`Ahora ${u.name} es contacto tuyo.`); }, "primary"),
          smallBtn("Rechazar", async () => { await api("contactDecline", acc, u.id); await after("Solicitud rechazada."); })));
        else box.append(personRow(u, smallBtn("Desbloquear", async () => { await api("userUnblock", acc, u.id); await after("Persona desbloqueada."); loadList(true); })));
      }
      body.append(box);
      if (data.requests.length) { reqBadge.textContent = String(data.requests.length); reqBadge.hidden = false; } else reqBadge.hidden = true;
    }
    draw(); refresh();
  }

  await loadList();
}

// ------------------------------------------------------------------ calendario
const pad2 = n => String(n).padStart(2, "0");
const toDateInput = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toTimeInput = d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const clockOf = ts => new Date(ts * 1000).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

async function renderCalendar(root) {
  const acc = state.accountId;
  const head = () => pageTitle("PRÓXIMOS EVENTOS", "Calendario", "Entregas y eventos de los próximos 90 días, y los tuyos propios.");
  root.append(head(), h("div", { class: "muted pad", text: "Cargando…" }));
  let events;
  try { events = (await api("calendar", acc, state.data.courses.map(c => c.id))).sort((a, b) => a.time - b.time); }
  catch { // función desactivada en el aula, sin conexión, etc.
    clear(root).append(pageTitle("PRÓXIMOS EVENTOS", "Calendario"), empty("◷", "Calendario no disponible."));
    return;
  }
  const again = () => setIView("calendar");
  clear(root).append(head(), h("div", { class: "msg-toolbar" }, h("button", { class: "primary small", type: "button", text: "＋ Nuevo evento", onclick: () => openEventEditor(null, again) })));
  if (!events.length) { root.append(empty("◷", "Sin eventos", "No hay eventos próximos en tu calendario.")); return; }
  let day = "", list;
  for (const ev of events) {
    const d = fmtDay(ev.time);
    if (d !== day) { day = d; root.append(h("h3", { class: "day-head", text: d })); list = h("div", { class: "item-list" }); root.append(list); }
    list.append(h("button", { class: "item", onclick: () => openEventDetail(ev, again) },
      h("span", { class: "item-icon", text: ev.editable ? "✎" : "◷" }),
      h("span", { class: "item-main" }, h("b", { text: ev.name }), h("span", { class: "muted", text: [ev.course, ev.editable ? "Tu evento" : ""].filter(Boolean).join(" · ") })),
      h("span", { class: "muted", text: clockOf(ev.time) })));
  }
}

function openEventDetail(ev, done) {
  const ctl = actDialog(ev.editable ? "TU EVENTO" : "EVENTO", ev.name);
  const end = ev.duration ? ` – ${clockOf(ev.time + ev.duration)}` : "";
  ctl.body.append(h("div", { class: "act-chips" }, chip(`${fmtDay(ev.time)} · ${clockOf(ev.time)}${end}`), ev.course ? chip(ev.course) : null));
  if (ev.desc) ctl.body.append(actText(ev.desc));
  const acts = h("div", { class: "dialog-actions" });
  if (ev.url) acts.append(h("button", { class: "secondary", type: "button", text: "Abrir en el aula", onclick: () => api("openExternal", ev.url).catch(e => notify(e.message)) }));
  if (ev.deletable) acts.append(smallBtn("Borrar", async () => {
    if (!confirm("¿Borrar este evento?")) return;
    await api("eventDelete", state.accountId, ev.id); ctl.dlg.close(); notify("Evento borrado."); done();
  }, "secondary danger"));
  if (ev.editable) acts.append(h("button", { class: "primary", type: "button", text: "Editar", onclick: () => { ctl.dlg.close(); openEventEditor(ev, done); } }));
  acts.append(h("button", { class: "secondary", type: "button", text: "Cerrar", onclick: () => ctl.dlg.close() }));
  ctl.body.append(acts);
}

function openEventEditor(ev, done) {
  const ctl = actDialog(ev ? "EDITAR EVENTO" : "NUEVO EVENTO", ev ? ev.name : "Evento propio");
  const base = ev ? new Date(ev.time * 1000) : (() => { const d = new Date(Date.now() + 3600e3); d.setMinutes(0, 0, 0); return d; })();
  const name = h("input", { maxlength: "200", placeholder: "Nombre del evento", "aria-label": "Nombre" });
  const date = h("input", { type: "date", "aria-label": "Fecha" });
  const time = h("input", { type: "time", "aria-label": "Hora" });
  const mins = h("input", { type: "number", min: "0", max: "20160", step: "5", placeholder: "0", "aria-label": "Duración en minutos" });
  const desc = h("textarea", { rows: "4", maxlength: "4000", placeholder: "Descripción (opcional)", "aria-label": "Descripción" });
  name.value = ev ? ev.name : ""; date.value = toDateInput(base); time.value = toTimeInput(base);
  mins.value = ev && ev.duration ? String(Math.round(ev.duration / 60)) : ""; desc.value = ev ? ev.desc : "";
  const err = h("div", { class: "form-error", hidden: "" });
  const save = h("button", { class: "primary", type: "button", text: "Guardar", onclick: () => actBusy(save, async () => {
    err.hidden = true;
    const start = Math.floor(new Date(`${date.value}T${time.value || "00:00"}`).getTime() / 1000);
    if (!date.value || !Number.isFinite(start)) { err.textContent = "Elige una fecha y una hora."; err.hidden = false; return; }
    try {
      await api("eventSave", state.accountId, { id: ev ? ev.id : 0, name: name.value, start, minutes: Number(mins.value) || 0, desc: desc.value });
      ctl.dlg.close(); notify(ev ? "Evento actualizado." : "Evento creado."); done();
    } catch (e) { err.textContent = e.message; err.hidden = false; }
  }) });
  ctl.body.append(
    h("label", { class: "act-field" }, "Nombre", name),
    h("div", { class: "act-row2" }, h("label", { class: "act-field" }, "Fecha", date), h("label", { class: "act-field" }, "Hora", time), h("label", { class: "act-field" }, "Duración (min)", mins)),
    h("label", { class: "act-field" }, "Descripción", desc), err,
    h("div", { class: "dialog-actions" }, h("button", { class: "secondary", type: "button", text: "Cancelar", onclick: () => ctl.dlg.close() }), save));
  setTimeout(() => name.focus(), 50);
}

// ------------------------------------------------------------------ notificaciones
async function renderNotifications(root) {
  const acc = state.accountId;
  root.append(pageTitle("AVISOS", "Notificaciones", "Lo último que ha pasado en tu aula."));
  const items = await api("notifications", acc, state.data.user.id);
  const readAll = h("button", { class: "secondary small", type: "button", text: "✓ Marcar todas como leídas", onclick: () => actBusy(readAll, async () => {
    await api("notifReadAll", acc); notify("Todas marcadas como leídas."); setIView("notifications");
  }) });
  readAll.disabled = !items.some(n => !n.read);
  root.append(h("div", { class: "msg-toolbar" }, readAll, h("button", { class: "secondary small", type: "button", text: "⚙ Preferencias de avisos", onclick: () => openNotifPrefs() })));
  if (!items.length) { root.append(empty("⚑", "Sin notificaciones", "No tienes avisos recientes.")); return; }
  const box = h("div", { class: "item-list" });
  for (const n of items) {
    let badge = !n.read ? chip("NUEVA", "new") : null;
    const row = h("button", { class: "item", onclick: async () => {
      if (!n.read) {
        n.read = true; if (badge) { badge.remove(); badge = null; } readAll.disabled = !items.some(x => !x.read);
        api("notifRead", acc, n.id).catch(() => { n.read = false; });
      }
      if (n.url) api("openExternal", n.url).catch(e => notify(e.message));
    } }, h("span", { class: "item-icon", text: "⚑" }),
      h("span", { class: "item-main" }, h("b", { text: n.subject }), h("span", { class: "muted", text: n.text.slice(0, 140) })),
      badge, h("span", { class: "muted", text: fmtDate(n.time) }));
    box.append(row);
  }
  root.append(box);
}

function openNotifPrefs() {
  const acc = state.accountId;
  const ctl = actDialog("AVISOS", "Preferencias de avisos");
  ctl.dlg.classList.add("wide");
  ctl.body.append(h("div", { class: "muted pad", text: "Cargando…" }));
  api("notifPrefs", acc).then(prefs => {
    clear(ctl.body);
    const state0 = new Map(); // key → { proc: bool }
    const all = h("input", { type: "checkbox" });
    all.checked = prefs.disableAll;
    ctl.body.append(h("label", { class: "act-check" }, all, h("span", { text: "Desactivar todos los avisos del aula (no recibirás ninguno)" })),
      h("div", { class: "form-hint", text: "Marca por dónde quieres recibir cada tipo de aviso. «Aviso en el aula» es el que ves en Notificaciones; los que el aula bloquea no se pueden cambiar." }));
    const grid = h("div", { class: "np" });
    const head = h("div", { class: "np-row np-head" }, h("span", { text: "" }), ...prefs.processors.map(p => h("span", { text: p.label })));
    grid.append(head);
    for (const g of prefs.groups) {
      const det = h("details", { class: "np-group" }, h("summary", { text: g.label }));
      for (const it of g.items) {
        const cells = prefs.processors.map(p => {
          const info = it.procs[p.name];
          if (!info) return h("span", { class: "muted", text: "—" });
          const cb = h("input", { type: "checkbox" }); cb.checked = info.on; cb.disabled = info.locked;
          cb.title = info.locked ? "El aula no deja cambiar esto" : p.label;
          cb.setAttribute("aria-label", `${it.label} · ${p.label}`);
          cb.addEventListener("change", () => { const cur = state0.get(it.key) || {}; cur[p.name] = cb.checked; state0.set(it.key, cur); });
          return cb;
        });
        det.append(h("div", { class: "np-row" }, h("span", { text: it.label }), ...cells));
      }
      grid.append(det);
    }
    ctl.body.append(grid);
    const err = h("div", { class: "form-error", hidden: "" });
    const save = h("button", { class: "primary", type: "button", text: "Guardar", onclick: () => actBusy(save, async () => {
      err.hidden = true;
      try {
        await api("notifPrefsSave", acc, { disableAll: all.checked, changes: [...state0].map(([key, procs]) => ({ key, procs })) });
        ctl.dlg.close(); notify("Preferencias guardadas.");
      } catch (e) { err.textContent = e.message; err.hidden = false; }
    }) });
    ctl.body.append(err, h("div", { class: "dialog-actions" }, h("button", { class: "secondary", type: "button", text: "Cancelar", onclick: () => ctl.dlg.close() }), save));
  }).catch(e => clear(ctl.body).append(actErr(e.message), h("div", { class: "muted", text: "Puede que el aula no permita cambiar estas preferencias desde la app: hazlo en Preferencias → Notificaciones de tu aula." })));
}
