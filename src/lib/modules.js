"use strict";
// Otros módulos del aula (0.8.3): marcar actividades como completadas y progreso del curso, páginas, libros y URL con vista propia,
// glosarios, wikis, bases de datos, talleres, lecciones, SCORM, H5P, encuestas, feedback, BigBlueButton y Zoom.
// Solo usa la API de servicios web de Moodle (la misma que la app oficial). Sin Electron: se puede probar con Node.
// Todo lo que devuelve va normalizado y recortado. El HTML que llega del aula (descripciones, páginas, entradas) lo sanea la interfaz.

const { htmlToText } = require("../moodle");

const num = v => Number(v) || 0;
const clip = (v, n) => String(v == null ? "" : v).slice(0, n);
const html = v => clip(v, 400000);
const arr = v => (Array.isArray(v) ? v : []);
const toId = v => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw new Error("Identificador no válido."); return n; };

function warn(r) {
  const w = r && Array.isArray(r.warnings) && r.warnings[0];
  if (w) throw new Error(htmlToText(w.message) || "El aula rechazó la operación.");
  return r;
}

// ===================================================================== COMPLETADO
// (el estado de cada actividad llega con la sincronización: ver completionOf en moodle.js)

// Estado de completado de un curso: { [cmid]: { mode, done, fail } }. mode: 1 manual · 2 automático.
async function courseCompletion(c, me, courseId) {
  const r = await c.call("core_completion_get_activities_completion_status", { courseid: toId(courseId), userid: toId(me) });
  const out = {};
  for (const s of arr(r && r.statuses)) {
    const mode = num(s.tracking);
    if (!mode) continue;
    out[num(s.cmid)] = { mode, done: num(s.state) === 1 || num(s.state) === 2, fail: num(s.state) === 3 };
  }
  return out;
}

async function setComplete(c, cmid, done) {
  warn(await c.call("core_completion_update_activity_completion_status_manually", { cmid: toId(cmid), completed: done ? 1 : 0 }));
  return !!done;
}

// ===================================================================== AYUDAS

async function instanceOf(c, cmid, hint) {
  if (num(hint)) return num(hint);
  const r = await c.call("core_course_get_course_module", { cmid: toId(cmid) });
  const id = num(r && r.cm && r.cm.instance);
  if (!id) throw new Error("El aula no reconoce esta actividad.");
  return id;
}

// Contenido de un solo módulo (archivos, estructura de libros…).
async function moduleContents(c, courseId, cmid) {
  const r = await c.call("core_course_get_contents", { courseid: toId(courseId), options: [{ name: "cmid", value: toId(cmid) }] });
  for (const s of arr(r)) for (const m of arr(s.modules)) if (num(m.id) === cmid) return m;
  return null;
}

// Busca la actividad entre las que devuelve la función «..._by_courses» del tipo de módulo.
async function findByCourse(c, fn, key, courseId, cmid) {
  const r = await c.call(fn, { courseids: [toId(courseId)] });
  const found = arr(r && r[key]).find(x => num(x.coursemodule) === cmid);
  if (!found) throw new Error("El aula no muestra esta actividad en la app.");
  return found;
}

// Registra que has visto la actividad (para el completado automático y los informes del profesorado). Nunca da error.
const VIEW = {
  page: ["mod_page_view_page", "pageid"], book: ["mod_book_view_book", "bookid"], url: ["mod_url_view_url", "urlid"],
  glossary: ["mod_glossary_view_glossary", "id", { mode: "letter" }], wiki: ["mod_wiki_view_wiki", "wikiid"], data: ["mod_data_view_database", "databaseid"],
  workshop: ["mod_workshop_view_workshop", "workshopid"], lesson: null, scorm: ["mod_scorm_view_scorm", "scormid"],
  h5pactivity: ["mod_h5pactivity_view_h5pactivity", "h5pactivityid"], survey: ["mod_survey_view_survey", "surveyid"],
  feedback: ["mod_feedback_view_feedback", "feedbackid"], bigbluebuttonbn: ["mod_bigbluebuttonbn_view_bigbluebuttonbn", "bigbluebuttonbnid"]
};
function logView(c, modname, instance) {
  const v = VIEW[modname];
  if (!v || !instance) return;
  c.call(v[0], { [v[1]]: instance, ...(v[2] || {}) }).catch(() => {});
}

const baseInfo = (x, extra) => ({ id: num(x.id), name: clip(x.name, 200), intro: html(x.intro), ...extra });
const when = ts => (num(ts) > 0 ? num(ts) : 0);

// ===================================================================== PÁGINAS, LIBROS Y URL

async function pageInfo(c, courseId, cmid) {
  const p = await findByCourse(c, "mod_page_get_pages_by_courses", "pages", courseId, cmid);
  logView(c, "page", num(p.id));
  return baseInfo(p, { type: "page", content: html(p.content), modified: when(p.timemodified) });
}

async function urlInfo(c, courseId, cmid, hint) {
  const u = await findByCourse(c, "mod_url_get_urls_by_courses", "urls", courseId, cmid);
  logView(c, "url", num(u.id));
  let target = clip(u.externalurl, 2048);
  if (!/^https?:\/\//i.test(target) && hint) target = clip(hint, 2048);
  return baseInfo(u, { type: "link", url: /^https?:\/\//i.test(target) ? target : "" });
}

const fileOf = f => ({ filename: clip(f.filename, 200), fileurl: String(f.fileurl || ""), filesize: num(f.filesize), timemodified: num(f.timemodified) });

// Libro: índice de capítulos (de la «estructura» que da el aula) y el HTML de cada capítulo.
function bookToc(contents) {
  const entry = arr(contents).find(x => x && x.filename === "structure" && typeof x.content === "string");
  let tree = [];
  try { tree = JSON.parse(entry.content); } catch { tree = []; }
  const out = [];
  const walk = (list, depth) => {
    for (const it of arr(list)) {
      const m = /^(\d+)\//.exec(String(it.href || ""));
      if (!m) continue;
      out.push({ id: num(m[1]), title: clip(htmlToText(it.title) || `Capítulo ${out.length + 1}`, 200), level: Math.min(depth, 3), hidden: !!it.hidden });
      if (it.subitems) walk(it.subitems, depth + 1);
    }
  };
  walk(tree, 0);
  // Si el aula no da la estructura, se deducen los capítulos de los archivos index.html
  if (!out.length) {
    const seen = new Set();
    for (const f of arr(contents)) {
      const m = /^\/(\d+)\/$/.exec(String(f.filepath || ""));
      if (m && f.filename === "index.html" && !seen.has(m[1])) { seen.add(m[1]); out.push({ id: num(m[1]), title: `Capítulo ${out.length + 1}`, level: 0, hidden: false }); }
    }
  }
  return out.filter(x => !x.hidden);
}

async function bookInfo(c, courseId, cmid) {
  const [b, mod] = await Promise.all([
    findByCourse(c, "mod_book_get_books_by_courses", "books", courseId, cmid),
    moduleContents(c, courseId, cmid).catch(() => null)
  ]);
  logView(c, "book", num(b.id));
  return baseInfo(b, { type: "book", chapters: bookToc(mod && mod.contents), numbering: num(b.numbering) });
}

async function bookChapter(c, courseId, cmid, chapterId, bookId) {
  const mod = await moduleContents(c, courseId, cmid);
  if (!mod) throw new Error("El aula no muestra este libro.");
  const cid = toId(chapterId);
  const files = arr(mod.contents).filter(f => f && f.type === "file");
  const page = files.find(f => f.filename === "index.html" && String(f.filepath || "") === `/${cid}/`);
  if (!page || !page.fileurl) throw new Error("No se encontró ese capítulo.");
  const res = await fetch(c.withToken(page.fileurl), { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error("No se pudo leer el capítulo.");
  let text = await res.text();
  // Imágenes del capítulo: «@@PLUGINFILE@@/x.png» o rutas relativas → direcciones completas del propio aula.
  const assets = new Map(files.filter(f => String(f.filepath || "").startsWith(`/${cid}/`) && f.filename !== "index.html").map(f => [decodeURIComponent(`${String(f.filepath).slice(`/${cid}/`.length)}${f.filename}`), f.fileurl]));
  text = text.replace(/@@PLUGINFILE@@\/([^"'\s)<>]+)/g, (m0, name) => { let n = name; try { n = decodeURIComponent(name); } catch { /* se deja tal cual */ } return assets.get(n) || m0; });
  if (num(bookId) > 0) c.call("mod_book_view_book", { bookid: num(bookId), chapterid: cid }).catch(() => {});   // cuenta el capítulo como visto
  return { html: html(text), base: page.fileurl };
}

// ===================================================================== GLOSARIO

async function glossaryInfo(c, courseId, cmid) {
  const g = await findByCourse(c, "mod_glossary_get_glossaries_by_courses", "glossaries", courseId, cmid);
  logView(c, "glossary", num(g.id));
  return baseInfo(g, { type: "glossary", canAdd: false });
}
const entryOf = e => ({
  id: num(e.id), concept: clip(htmlToText(e.concept), 200), definition: html(e.definition), author: clip(e.userfullname, 120),
  approved: e.approved !== 0 && e.approved !== false, time: when(e.timecreated),
  files: arr(e.attachments).map(fileOf)
});
async function glossaryEntries(c, glossaryId, { letter, query, from } = {}) {
  const id = toId(glossaryId), start = Math.max(0, num(from)), limit = 30;
  let r;
  if (query && String(query).trim().length >= 2) r = await c.call("mod_glossary_get_entries_by_search", { id, query: clip(String(query).trim(), 100), fullsearch: 1, order: "ASC", from: start, limit, options: { includenotapproved: 0 } });
  else r = await c.call("mod_glossary_get_entries_by_letter", { id, letter: /^[A-Z]$/.test(String(letter)) ? String(letter) : /^SPECIAL$/.test(String(letter)) ? "SPECIAL" : "ALL", from: start, limit, options: { includenotapproved: 0 } });
  return { total: num(r && r.count), entries: arr(r && r.entries).map(entryOf), from: start, limit };
}

// ===================================================================== WIKI (solo lectura)

async function wikiInfo(c, courseId, cmid) {
  const w = await findByCourse(c, "mod_wiki_get_wikis_by_courses", "wikis", courseId, cmid);
  logView(c, "wiki", num(w.id));
  let subwikis = [];
  try {
    const r = await c.call("mod_wiki_get_subwikis", { wikiid: num(w.id) });
    subwikis = arr(r && r.subwikis).map(s => ({ id: num(s.id), groupid: num(s.groupid), userid: num(s.userid), canedit: !!s.canedit })).slice(0, 40);
  } catch { /* se intenta con la wiki general */ }
  return baseInfo(w, { type: "wiki", mode: clip(w.wikimode, 20), firstPage: clip(w.firstpagetitle, 100), subwikis });
}
async function wikiPages(c, wikiId, sub) {
  const r = await c.call("mod_wiki_get_subwiki_pages", {
    wikiid: toId(wikiId), groupid: num(sub && sub.groupid), userid: num(sub && sub.userid),
    options: { sortby: "title", sortdirection: "ASC", includecontent: 0 }
  });
  return arr(r && r.pages).map(p => ({ id: num(p.id), title: clip(p.title, 200), modified: when(p.timemodified) })).slice(0, 300);
}
async function wikiPage(c, pageId) {
  const r = await c.call("mod_wiki_get_page_contents", { pageid: toId(pageId) });
  const p = r && r.page;
  if (!p) throw new Error("No se encontró esa página.");
  c.call("mod_wiki_view_page", { pageid: num(p.id) }).catch(() => {});
  return { id: num(p.id), title: clip(p.title, 200), html: html(p.cachedcontent), canEdit: !!p.caneditpage };
}

// ===================================================================== BASE DE DATOS (solo lectura)

async function dataInfo(c, courseId, cmid) {
  const d = await findByCourse(c, "mod_data_get_databases_by_courses", "databases", courseId, cmid);
  logView(c, "data", num(d.id));
  let fields = [];
  try { fields = arr((await c.call("mod_data_get_fields", { databaseid: num(d.id) })).fields).map(f => ({ id: num(f.id), name: clip(f.name, 100), type: clip(f.type, 30) })); } catch { /* sin campos: se muestra el texto en bruto */ }
  return baseInfo(d, { type: "data", fields, required: num(d.requiredentries), maxEntries: num(d.maxentries) });
}
async function dataEntries(c, databaseId, page) {
  const pg = Math.max(0, num(page)), per = 15;
  const r = await c.call("mod_data_get_entries", { databaseid: toId(databaseId), groupid: 0, returncontents: 1, sort: 0, order: "DESC", page: pg, perpage: per });
  const entries = arr(r && r.entries).map(e => ({
    id: num(e.id), author: clip(e.fullname, 120), time: when(e.timecreated), approved: e.approved !== 0 && e.approved !== false,
    contents: arr(e.contents).map(x => ({ field: num(x.fieldid), text: clip(htmlToText([x.content, x.content1].filter(Boolean).join(" ")), 600) })).filter(x => x.text).slice(0, 30)
  }));
  return { total: num(r && r.totalcount), entries, page: pg, per };
}

// ===================================================================== TALLER, LECCIÓN, SCORM, H5P, ENCUESTA, FEEDBACK (información y estado)

const WORKSHOP_PHASE = { 10: "Configuración", 20: "Fase de entregas", 30: "Fase de evaluación", 40: "Calificación de evaluaciones", 50: "Cerrado" };
async function workshopInfo(c, courseId, cmid) {
  const w = await findByCourse(c, "mod_workshop_get_workshops_by_courses", "workshops", courseId, cmid);
  logView(c, "workshop", num(w.id));
  let grades = null;
  try {
    const g = await c.call("mod_workshop_get_grades", { workshopid: num(w.id), userid: 0 });
    if (g && (g.submissionrawgrade != null || g.assessmentrawgrade != null)) grades = { submission: g.submissiongrade != null ? num(g.submissiongrade) : null, assessment: g.assessmentgrade != null ? num(g.assessmentgrade) : null, submissionMax: num(w.grade), assessmentMax: num(w.gradinggrade) };
  } catch { /* no se ven notas todavía */ }
  return baseInfo(w, {
    type: "workshop", phase: WORKSHOP_PHASE[num(w.phase)] || "", instructAuthors: html(w.instructauthors), instructReviewers: html(w.instructreviewers),
    submissionStart: when(w.submissionstart), submissionEnd: when(w.submissionend), assessmentStart: when(w.assessmentstart), assessmentEnd: when(w.assessmentend), grades
  });
}

async function lessonInfo(c, courseId, cmid) {
  const l = await findByCourse(c, "mod_lesson_get_lessons_by_courses", "lessons", courseId, cmid);
  let blocked = [];
  try {
    const a = await c.call("mod_lesson_get_lesson_access_information", { lessonid: num(l.id) });
    blocked = arr(a && a.preventaccessreasons).map(x => clip(htmlToText(x.message) || x.reason, 200)).slice(0, 5);
  } catch { /* sin información de acceso */ }
  return baseInfo(l, { type: "lesson", available: when(l.available), deadline: when(l.deadline), timeLimit: num(l.timelimit), maxAttempts: num(l.maxattempts), retake: !!num(l.retake), blocked });
}

async function scormInfo(c, courseId, cmid, me) {
  const s = await findByCourse(c, "mod_scorm_get_scorms_by_courses", "scorms", courseId, cmid);
  logView(c, "scorm", num(s.id));
  let attempts = null;
  try { attempts = num((await c.call("mod_scorm_get_scorm_attempt_count", { scormid: num(s.id), userid: toId(me), ignoremissingcompletion: 1 })).attemptscount); } catch { /* sin recuento */ }
  return baseInfo(s, { type: "scorm", attempts, maxAttempts: num(s.maxattempt), opens: when(s.timeopen), closes: when(s.timeclose) });
}

async function h5pInfo(c, courseId, cmid, me) {
  const a = await findByCourse(c, "mod_h5pactivity_get_h5pactivities_by_courses", "h5pactivities", courseId, cmid);
  logView(c, "h5pactivity", num(a.id));
  let attempts = [];
  try {
    const r = await c.call("mod_h5pactivity_get_attempts", { h5pactivityid: num(a.id), userids: [toId(me)] });
    const u = arr(r && r.usersattempts)[0];
    attempts = arr(u && u.attempts).slice(-20).map(t => ({ n: num(t.attempt), time: when(t.timecreated), score: t.rawscore != null ? num(t.rawscore) : null, max: t.maxscore != null ? num(t.maxscore) : null, done: num(t.completion) === 1, success: t.success == null ? null : !!num(t.success), duration: num(t.duration) }));
  } catch { /* sin intentos visibles */ }
  return baseInfo(a, { type: "h5p", attempts });
}

async function surveyInfo(c, courseId, cmid) {
  const s = await findByCourse(c, "mod_survey_get_surveys_by_courses", "surveys", courseId, cmid);
  logView(c, "survey", num(s.id));
  return baseInfo(s, { type: "survey", opens: when(s.timeopen), closes: when(s.timeclose) });
}

async function feedbackInfo(c, courseId, cmid) {
  const f = await findByCourse(c, "mod_feedback_get_feedbacks_by_courses", "feedbacks", courseId, cmid);
  logView(c, "feedback", num(f.id));
  let note = "";
  try {
    const a = await c.call("mod_feedback_get_feedback_access_information", { feedbackid: num(f.id) });
    if (a && a.cancomplete === false) note = "Ahora mismo no puedes responder este feedback.";
    else if (a && a.isempty) note = "El feedback todavía no tiene preguntas.";
    else if (a && a.isanonymous) note = "Las respuestas son anónimas.";
  } catch { /* sin información de acceso */ }
  return baseInfo(f, { type: "feedback", opens: when(f.timeopen), closes: when(f.timeclose), anonymous: num(f.anonymous) === 1, note });
}

// ===================================================================== VIDEOCONFERENCIAS

async function bbbInfo(c, courseId, cmid) {
  const b = await findByCourse(c, "mod_bigbluebuttonbn_get_bigbluebuttonbns_by_courses", "bigbluebuttonbns", courseId, cmid);
  logView(c, "bigbluebuttonbn", num(b.id));
  let live = null;
  try {
    const m = await c.call("mod_bigbluebuttonbn_meeting_info", { bigbluebuttonbnid: num(b.id), groupid: 0, updatecache: 0 });
    live = {
      running: !!m.statusrunning, closed: !!m.statusclosed, open: m.statusopen !== false, message: clip(htmlToText(m.statusmessage), 300),
      participants: num(m.participantcount), moderators: num(m.moderatorcount), startedAt: when(m.startedat), canJoin: m.canjoin !== false, isModerator: !!m.ismoderator
    };
  } catch { /* sin estado de la sala */ }
  return baseInfo(b, { type: "meeting", provider: "bigbluebutton", opens: when(b.openingtime), closes: when(b.closingtime), welcome: html(b.welcome), live });
}
async function zoomInfo(c, courseId, cmid, instanceHint) {
  let info = { id: num(instanceHint), name: "", intro: "" };
  try {
    const z = await findByCourse(c, "mod_zoom_get_zooms_by_courses", "zooms", courseId, cmid);
    info = baseInfo(z, { start: when(z.start_time), duration: num(z.duration), recurring: !!z.recurring, passwordNeeded: !!z.password });
  } catch { /* esta función puede no estar en el aula: se sigue con lo básico */ }
  return { ...info, type: "meeting", provider: "zoom" };
}

// Dirección para entrar a la videoconferencia (se abre en el navegador del sistema).
async function meetingJoinUrl(c, modname, courseId, cmid, instanceHint) {
  if (modname === "bigbluebuttonbn") {
    const r = warn(await c.call("mod_bigbluebuttonbn_get_join_url", { cmid: toId(cmid), groupid: 0 }));
    const u = clip(r && (r.join_url || r.joinurl), 2048);
    if (!/^https:\/\//i.test(u)) throw new Error("El aula no ha dado un enlace para entrar a la sala.");
    return u;
  }
  if (modname === "zoom") {
    const tries = [{ zoomid: num(instanceHint) }, { zoomid: toId(cmid) }].filter(p => p.zoomid);
    for (const p of tries) {
      try {
        const r = await c.call("mod_zoom_get_meeting_info", { ...p, include_invitation: 0 });
        const u = clip(r && (r.join_url || r.joinurl), 2048);
        if (/^https:\/\//i.test(u)) return u;
      } catch { /* se prueba la siguiente forma */ }
    }
    throw Object.assign(new Error("El aula no deja entrar a Zoom desde la app."), { errorcode: "accessexception" });
  }
  throw new Error("Este módulo no tiene sala de videoconferencia.");
}

// ===================================================================== PUNTO DE ENTRADA

async function info(c, me, modname, courseId, cmid, instanceHint, urlHint) {
  courseId = toId(courseId); cmid = toId(cmid);
  switch (modname) {
    case "page": return pageInfo(c, courseId, cmid);
    case "book": return bookInfo(c, courseId, cmid);
    case "url": return urlInfo(c, courseId, cmid, urlHint);
    case "glossary": return glossaryInfo(c, courseId, cmid);
    case "wiki": return wikiInfo(c, courseId, cmid);
    case "data": return dataInfo(c, courseId, cmid);
    case "workshop": return workshopInfo(c, courseId, cmid);
    case "lesson": return lessonInfo(c, courseId, cmid);
    case "scorm": return scormInfo(c, courseId, cmid, me);
    case "h5pactivity": return h5pInfo(c, courseId, cmid, me);
    case "survey": return surveyInfo(c, courseId, cmid);
    case "feedback": return feedbackInfo(c, courseId, cmid);
    case "bigbluebuttonbn": return bbbInfo(c, courseId, cmid);
    case "zoom": return zoomInfo(c, courseId, cmid, instanceHint);
    default: throw new Error("Este tipo de actividad se abre en el navegador.");
  }
}

module.exports = {
  courseCompletion, setComplete, info, bookToc, bookChapter,
  glossaryEntries, wikiPages, wikiPage, dataEntries, meetingJoinUrl, instanceOf
};
