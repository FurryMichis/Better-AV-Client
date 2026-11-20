"use strict";
// Mensajes del aula (nueva conversación, buscar usuarios, contactos, bloqueos, borrar, grupos de Moodle),
// calendario con eventos propios y notificaciones (marcar leídas y preferencias).
// Solo usa la API de servicios web de Moodle (la misma que la app oficial). Sin Electron: se puede probar con Node.

const { htmlToText } = require("../moodle");
const { textToHtml } = require("./activities");

const num = v => Number(v) || 0;
const clip = (v, n) => String(v == null ? "" : v).slice(0, n);
const arr = v => (Array.isArray(v) ? v : []);
const toId = v => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw new Error("Identificador no válido."); return n; };

function warn(r) {
  const w = r && Array.isArray(r.warnings) && r.warnings[0];
  if (w) throw new Error(htmlToText(w.message) || "El aula rechazó la operación.");
  return r;
}

const userOf = u => ({
  id: num(u.id), name: clip(u.fullname, 120),
  pic: String(u.profileimageurlsmall || u.profileimageurl || ""),
  contact: !!u.iscontact, blocked: !!u.isblocked,
  canMessage: u.canmessage !== false || !!u.canmessageevenifblocked,
  requiresContact: !!u.requirescontact,
  online: !!u.isonline && u.showonlinestatus !== false,
  deleted: !!u.isdeleted
});

// ===================================================================== MENSAJES

async function searchUsers(c, me, term) {
  term = String(term || "").trim().slice(0, 80);
  if (term.length < 2) return { contacts: [], others: [] };
  const r = await c.call("core_message_message_search_users", { userid: toId(me), search: term, limitfrom: 0, limitnum: 30 });
  const clean = list => arr(list).map(userOf).filter(u => u.id && u.id !== me && !u.deleted);
  return { contacts: clean(r && r.contacts), others: clean(r && r.noncontacts) };
}

// id de la conversación individual que ya tienes con alguien (0 si todavía no habéis hablado).
async function conversationWith(c, me, other) {
  try {
    const r = await c.call("core_message_get_conversation_between_users", {
      userid: toId(me), otheruserid: toId(other), includecontactrequests: 0, includeprivacyinfo: 0,
      memberlimit: 0, memberoffset: 0, messagelimit: 0, messageoffset: 0, newestmessagesfirst: 1
    });
    return num(r && r.id);
  } catch { return 0; }
}

async function memberInfo(c, me, other) {
  const r = await c.call("core_message_get_member_info", { referenceuserid: toId(me), userids: [toId(other)], includecontactrequests: 1, includeprivacyinfo: 1 });
  const u = arr(r)[0];
  if (!u) throw new Error("No se encontró a esa persona.");
  const reqs = arr(u.contactrequests);
  return { ...userOf(u), requestedByMe: reqs.some(q => num(q.userid) === me), requestedToMe: reqs.some(q => num(q.requesteduserid) === me), canCreateContact: u.cancreatecontact !== false };
}

async function thread(c, me, convId) {
  const r = await c.call("core_message_get_conversation_messages", { currentuserid: toId(me), convid: toId(convId), limitnum: 80, newest: 1 });
  const members = {};
  for (const m of arr(r && r.members)) members[num(m.id)] = { name: clip(m.fullname, 120), pic: String(m.profileimageurlsmall || m.profileimageurl || "") };
  return {
    members,
    messages: arr(r && r.messages).map(m => ({ id: num(m.id), from: num(m.useridfrom), text: htmlToText(m.text).slice(0, 8000), time: num(m.timecreated) })).sort((a, b) => a.time - b.time || a.id - b.id)
  };
}

async function convMembers(c, me, convId) {
  const r = await c.call("core_message_get_conversation_members", { userid: toId(me), conversationid: toId(convId), includecontactdetails: 0, limitfrom: 0, limitnum: 150 });
  return arr(r).map(userOf).filter(u => u.id);
}

async function deleteMessage(c, me, messageId) {
  const r = await c.call("core_message_delete_message", { messageid: toId(messageId), userid: toId(me), read: 1 });
  warn(r);
  return true;
}
async function deleteConversation(c, me, convId) {
  warn(await c.call("core_message_delete_conversations_by_id", { userid: toId(me), conversationids: [toId(convId)] }));
  return true;
}
async function setMuted(c, me, convId, muted) {
  const fn = muted ? "core_message_mute_conversations" : "core_message_unmute_conversations";
  warn(await c.call(fn, { userid: toId(me), conversationids: [toId(convId)] }));
  return !!muted;
}

// ---- contactos y bloqueos
async function contacts(c, me) {
  let list;
  try { list = arr(await c.call("core_message_get_user_contacts", { userid: toId(me), limitfrom: 0, limitnum: 200 })); }
  catch (e1) {
    try { // aulas antiguas
      const r = await c.call("core_message_get_contacts", { userid: toId(me) });
      list = [...arr(r && r.online), ...arr(r && r.offline)];
    } catch { throw e1; }
  }
  return list.map(userOf).filter(u => u.id).sort((a, b) => a.name.localeCompare(b.name, "es"));
}
async function contactRequests(c, me) {
  const r = await c.call("core_message_get_contact_requests", { userid: toId(me), limitfrom: 0, limitnum: 50 });
  return arr(r).map(userOf).filter(u => u.id);
}
async function blockedUsers(c, me) {
  const r = await c.call("core_message_get_blocked_users", { userid: toId(me) });
  return arr(r && r.users).map(userOf).filter(u => u.id);
}
async function requestContact(c, me, other) { warn(await c.call("core_message_create_contact_request", { userid: toId(me), requesteduserid: toId(other) })); return true; }
// `requester` = quien envió la solicitud (no tú)
async function confirmContact(c, me, requester) { warn(await c.call("core_message_confirm_contact_request", { userid: toId(requester), requesteduserid: toId(me) })); return true; }
async function declineContact(c, me, requester) { warn(await c.call("core_message_decline_contact_request", { userid: toId(requester), requesteduserid: toId(me) })); return true; }
async function removeContact(c, me, other) { warn(await c.call("core_message_delete_contacts", { userid: toId(me), userids: [toId(other)] })); return true; }
async function blockUser(c, me, other) { warn(await c.call("core_message_block_user", { userid: toId(me), blockeduserid: toId(other) })); return true; }
async function unblockUser(c, me, other) { warn(await c.call("core_message_unblock_user", { userid: toId(me), unblockeduserid: toId(other) })); return true; }

// ===================================================================== CALENDARIO

const MIN_YEAR = 2000, MAX_YEAR = 2100;

async function calendarEvents(c, me, courseIds) {
  const now = Math.floor(Date.now() / 1000), from = now - 7 * 86400, to = now + 90 * 86400;
  const ids = arr(courseIds).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 80);
  const [action, own] = await Promise.all([
    c.call("core_calendar_get_action_events_by_timesort", { timesortfrom: from, timesortto: to, limitnum: 100 }).catch(() => null),
    // eventos propios, del centro y de tus cursos (los de «acción» no incluyen los que creas tú)
    c.call("core_calendar_get_calendar_events", { events: { courseids: ids.length ? ids : [1] }, options: { userevents: 1, siteevents: 1, timestart: from, timeend: to } }).catch(() => null)
  ]);
  if (!action && !own) throw new Error("El aula no permite consultar el calendario.");
  const map = ev => {
    const module = String(ev.modulename || "");
    const mine = String(ev.eventtype || "") === "user" && !module;
    return {
      id: num(ev.id), name: clip(ev.name, 200), time: num(ev.timestart || ev.timesort), duration: num(ev.timeduration),
      desc: htmlToText(ev.description).slice(0, 2000), type: String(ev.eventtype || ""), module,
      courseId: num(ev.courseid || (ev.course && ev.course.id)), course: clip(ev.course && ev.course.fullname, 120),
      url: String(ev.url || ""),
      editable: mine && (ev.canedit != null ? !!ev.canedit : num(ev.userid) === me || !ev.userid),
      deletable: mine && (ev.candelete != null ? !!ev.candelete : num(ev.userid) === me || !ev.userid)
    };
  };
  const byId = new Map();
  for (const ev of arr(own && own.events)) { const m = map(ev); if (m.id && m.time >= from && m.time <= to) byId.set(m.id, m); }
  for (const ev of arr(action && action.events)) { const m = map(ev); if (m.id) byId.set(m.id, { ...(byId.get(m.id) || {}), ...m }); } // los de acción traen enlace y curso
  return [...byId.values()].sort((a, b) => a.time - b.time);
}

function checkEvent(ev) {
  const name = clip(String(ev && ev.name || "").replace(/\s+/g, " ").trim(), 200);
  if (!name) throw new Error("Escribe un nombre para el evento.");
  const start = Math.floor(num(ev.start));
  const y = new Date(start * 1000).getFullYear();
  if (!start || y < MIN_YEAR || y > MAX_YEAR) throw new Error("La fecha del evento no es válida.");
  const minutes = Math.max(0, Math.min(14 * 24 * 60, Math.floor(num(ev.minutes))));
  return { name, start, minutes, desc: clip(ev.desc, 4000).trim() };
}

// Crea (id = 0) o edita un evento propio. Crear usa la función directa del aula; si no está disponible (o editando) se
// usa el mismo formulario que la app oficial.
async function eventSave(c, me, raw) {
  const ev = checkEvent(raw), id = Math.max(0, Math.floor(num(raw && raw.id)));
  if (!id) {
    try {
      const r = warn(await c.call("core_calendar_create_calendar_events", { events: [{
        name: ev.name, description: ev.desc ? textToHtml(ev.desc) : "", format: 1, eventtype: "user",
        timestart: ev.start, timeduration: ev.minutes * 60, visible: 1, repeats: 0
      }] }));
      const created = arr(r && r.events)[0];
      if (created && created.id) return num(created.id);
    } catch { /* probamos con el formulario */ }
  }
  const d = new Date(ev.start * 1000);
  const form = new URLSearchParams({
    id: String(id), userid: String(me), modulename: "", instance: "0", visible: "1", eventtype: "user", name: ev.name,
    "timestart[day]": String(d.getDate()), "timestart[month]": String(d.getMonth() + 1), "timestart[year]": String(d.getFullYear()),
    "timestart[hour]": String(d.getHours()), "timestart[minute]": String(d.getMinutes()),
    "description[text]": ev.desc ? textToHtml(ev.desc) : "", "description[format]": "1", "description[itemid]": "0",
    location: "", duration: ev.minutes ? "2" : "0", timedurationminutes: String(ev.minutes), repeat: "0", repeats: "1",
    [`_qf__core_calendar_local_event_forms_${id ? "update" : "create"}`]: "1"
  });
  const r = warn(await c.call("core_calendar_submit_create_update_form", { formdata: form.toString() }));
  if (r && r.validationerror) throw new Error("El aula no aceptó los datos del evento. Revisa el nombre y las fechas.");
  const saved = r && r.event;
  if (!saved || !saved.id) throw new Error("El aula no confirmó el evento.");
  return num(saved.id);
}

async function eventDelete(c, eventId) {
  warn(await c.call("core_calendar_delete_calendar_events", { events: [{ eventid: toId(eventId), repeat: 0 }] }));
  return true;
}

// ===================================================================== NOTIFICACIONES

async function notifRead(c, id) {
  await c.call("core_message_mark_notification_read", { notificationid: toId(id), timeread: Math.floor(Date.now() / 1000) });
  return true;
}
async function notifReadAll(c, me) {
  await c.call("core_message_mark_all_notifications_as_read", { useridto: toId(me) });
  return true;
}

const PROC_LABEL = { popup: "Aviso en el aula", email: "Correo", airnotifier: "App móvil oficial" };

async function notifPrefs(c, me) {
  const r = await c.call("core_message_get_user_notification_preferences", { userid: toId(me) });
  const p = (r && r.preferences) || {};
  const processors = arr(p.processors).map(x => ({ name: clip(x.name, 40), label: PROC_LABEL[x.name] || clip(x.displayname, 60) || clip(x.name, 40) })).filter(x => x.name);
  const groups = arr(p.components).map(cmp => ({
    label: clip(cmp.displayname, 100),
    items: arr(cmp.notifications).map(n => ({
      key: String(n.preferencekey || ""), label: clip(n.displayname, 140),
      procs: Object.fromEntries(arr(n.processors).map(pr => [clip(pr.name, 40), {
        on: !!(pr.loggedin && pr.loggedin.checked) || !!(pr.loggedoff && pr.loggedoff.checked),
        locked: !!pr.locked,
        inOn: !!(pr.loggedin && pr.loggedin.checked), offOn: !!(pr.loggedoff && pr.loggedoff.checked)
      }]))
    })).filter(n => /^message_provider_\w+$/.test(n.key))
  })).filter(g => g.items.length);
  return { disableAll: !!p.disableall, processors, groups };
}

// changes: [{ key, procs: { popup: true, email: false } }]. Solo se toca lo que ya existe en el aula y no está bloqueado.
async function notifPrefsSave(c, me, { disableAll, changes }) {
  const cur = await notifPrefs(c, me);
  const known = new Map(cur.groups.flatMap(g => g.items).map(i => [i.key, i]));
  const prefs = [];
  for (const ch of arr(changes).slice(0, 200)) {
    const item = known.get(String(ch && ch.key));
    if (!item) continue;
    for (const state of ["loggedin", "loggedoff"]) {
      const names = Object.entries(item.procs).filter(([name, pr]) => {
        if (pr.locked || !(ch.procs && name in ch.procs)) return state === "loggedin" ? pr.inOn : pr.offOn;
        return !!ch.procs[name];
      }).map(([name]) => name);
      prefs.push({ name: `${item.key}_${state}`, value: names.length ? names.join(",") : "none" });
    }
  }
  const changeAll = typeof disableAll === "boolean" && disableAll !== cur.disableAll;
  if (!prefs.length && !changeAll) return true;
  try {
    const params = { userid: toId(me), preferences: prefs.map(p => ({ type: p.name, value: p.value })) };
    if (changeAll) params.emailstop = disableAll ? 1 : 0;
    warn(await c.call("core_user_update_user_preferences", params));
  } catch (e1) {
    if (!prefs.length) throw e1;
    try { warn(await c.call("core_user_set_user_preferences", { preferences: prefs.map(p => ({ name: p.name, value: p.value, userid: toId(me) })) })); }
    catch { throw e1; }
  }
  return true;
}

module.exports = {
  searchUsers, conversationWith, memberInfo, thread, convMembers, deleteMessage, deleteConversation, setMuted,
  contacts, contactRequests, blockedUsers, requestContact, confirmContact, declineContact, removeContact, blockUser, unblockUser,
  calendarEvents, eventSave, eventDelete, notifRead, notifReadAll, notifPrefs, notifPrefsSave
};
