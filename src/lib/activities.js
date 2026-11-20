"use strict";
// Tareas (entregas), cuestionarios y foros del aula Moodle.
// Solo usa la API de servicios web (la misma que la app oficial). Sin dependencias de Electron para poder
// probarlo con Node. Todo lo que devuelve ya va normalizado y recortado: la interfaz no ve JSON "en crudo" del aula.

const { htmlToText } = require("../moodle");

const num = v => Number(v) || 0;
const clip = (v, n) => String(v == null ? "" : v).slice(0, n);
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const toId = v => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw new Error("Identificador no válido."); return n; };
const arr = v => (Array.isArray(v) ? v : []);

// Texto escrito en la app → HTML sencillo para el aula (párrafos y saltos de línea).
function textToHtml(text) {
  return String(text == null ? "" : text).replace(/\r\n?/g, "\n").trim().split(/\n{2,}/)
    .map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
}

const fileOf = f => ({ filename: clip(f.filename, 200), fileurl: String(f.fileurl || ""), filesize: num(f.filesize), timemodified: num(f.timemodified) });

function friendly(e) {
  const code = e && e.errorcode;
  if (code === "accessexception" || code === "nopermissions" || code === "requireloginerror")
    return "El aula no permite esto desde la app (o no tienes permiso). Prueba a abrirlo en el navegador.";
  if (code === "invalidrecord" || code === "invalidparameter") return "El aula no reconoce esta actividad. Sincroniza y vuelve a intentarlo.";
  return (e && e.message) || "No se pudo completar la acción.";
}

function firstWarning(r) {
  const w = r && Array.isArray(r.warnings) && r.warnings[0];
  if (w) throw new Error(htmlToText(w.message) || "El aula rechazó la operación.");
}

// ===================================================================== TAREAS

async function uploadDraft(c, files) {
  let itemid = 0;
  for (const f of files) {
    const fd = new FormData();
    fd.append("token", c.token);
    fd.append("filearea", "draft");
    fd.append("itemid", String(itemid));
    fd.append("file_1", new Blob([f.buf]), String(f.name).replace(/[\\/]/g, "_"));
    const res = await c._fetch(c.base + "/webservice/upload.php", { method: "POST", body: fd, redirect: "error", signal: AbortSignal.timeout(300000) });
    if (!res.ok) throw new Error(`No se pudo subir «${f.name}» (HTTP ${res.status}).`);
    let r;
    try { r = await res.json(); } catch { throw new Error("Respuesta inesperada del aula al subir el archivo."); }
    if (r && r.error) throw new Error(r.error);
    if (!Array.isArray(r) || !r[0] || !r[0].itemid) throw new Error("El aula no aceptó el archivo.");
    itemid = r[0].itemid;
  }
  return itemid;
}

function configOf(a) {
  const list = arr(a.configs);
  return (plugin, subtype, name) => { const x = list.find(k => k.plugin === plugin && k.subtype === subtype && k.name === name); return x ? String(x.value) : ""; };
}

function pluginsOf(holder) { return arr(holder && holder.plugins); }
function editorText(plugin) { const f = plugin && arr(plugin.editorfields)[0]; return f ? { html: String(f.text || ""), format: num(f.format) || 1 } : null; }
function areaFiles(plugin, area) {
  const fa = plugin && arr(plugin.fileareas).find(x => !area || x.area === area);
  return fa ? arr(fa.files).map(fileOf) : [];
}

// Estado completo de una tarea: enunciado, ajustes de entrega, tu entrega y la corrección del profesor.
async function assignInfo(c, courseId, cmid, userId) {
  courseId = toId(courseId); cmid = toId(cmid);
  const all = await c.call("mod_assign_get_assignments", { courseids: [courseId] });
  const a = arr(all.courses && all.courses[0] && all.courses[0].assignments).find(x => num(x.cmid) === cmid);
  if (!a) throw new Error("No se encontró la tarea en el aula.");
  const cfg = configOf(a);
  const st = await c.call("mod_assign_get_submission_status", { assignid: a.id, userid: userId });
  const la = st.lastattempt || {};
  const sub = la.submission || null;
  const subPlugins = pluginsOf(sub);
  const textPlugin = subPlugins.find(p => p.type === "onlinetext");
  const filePlugin = subPlugins.find(p => p.type === "file");
  const txt = editorText(textPlugin);
  const fb = st.feedback || null;
  const fbPlugins = pluginsOf(fb);
  const fbText = editorText(fbPlugins.find(p => p.type === "comments"));
  const fileEnabled = cfg("file", "assignsubmission", "enabled") === "1";
  const textEnabled = cfg("onlinetext", "assignsubmission", "enabled") === "1";
  const status = sub && sub.status === "submitted" ? "submitted" : sub && sub.status === "draft" ? "draft" : sub && sub.status === "reopened" ? "reopened" : "new";
  return {
    assignId: num(a.id), cmid,
    name: clip(a.name, 200),
    intro: htmlToText(a.intro).slice(0, 8000),
    attachments: arr(a.introattachments).map(fileOf),
    due: num(a.duedate), cutoff: num(a.cutoffdate), from: num(a.allowsubmissionsfromdate),
    extension: num(la.extensionduedate),
    drafts: num(a.submissiondrafts) === 1,
    needStatement: num(a.requiresubmissionstatement) === 1,
    fileEnabled, textEnabled,
    maxFiles: num(cfg("file", "assignsubmission", "maxfilesubmissions")) || 20,
    maxBytes: num(cfg("file", "assignsubmission", "maxsubmissionsizebytes")),
    submission: sub ? {
      id: num(sub.id), status, time: num(sub.timemodified),
      text: txt ? htmlToText(txt.html).slice(0, 20000) : "",
      files: areaFiles(filePlugin, "submission_files")
    } : null,
    status,
    canEdit: la.canedit !== false && !la.locked && (fileEnabled || textEnabled),
    canSubmit: !!la.cansubmit,
    locked: !!la.locked,
    graded: !!la.graded || (la.gradingstatus === "graded"),
    grade: fb ? htmlToText(fb.gradefordisplay).slice(0, 80) : "",
    gradedAt: fb ? num(fb.gradeddate) : 0,
    feedbackText: fbText ? htmlToText(fbText.html).slice(0, 10000) : "",
    feedbackFiles: fbPlugins.flatMap(p => (p.type === "file" ? areaFiles(p) : []))
  };
}

// Datos «crudos» de la entrega actual (HTML original y archivos) para guardar sin perder nada.
async function assignRaw(c, assignId, userId) {
  const st = await c.call("mod_assign_get_submission_status", { assignid: toId(assignId), userid: userId });
  const sub = st.lastattempt && st.lastattempt.submission;
  const subPlugins = pluginsOf(sub);
  const txt = editorText(subPlugins.find(p => p.type === "onlinetext"));
  return { html: txt ? txt.html : "", format: txt ? txt.format : 1, files: areaFiles(subPlugins.find(p => p.type === "file"), "submission_files") };
}

// files: [{name, buf}] ya listos (los de siempre + los nuevos). text: null = no tocar el texto.
async function assignSave(c, assignId, { textHtml, files }) {
  assignId = toId(assignId);
  const plugindata = {};
  if (textHtml != null) plugindata.onlinetext_editor = { text: textHtml, format: 1, itemid: 0 };
  if (files != null) plugindata.files_filemanager = files.length ? await uploadDraft(c, files) : 1; // 1 = carpeta vacía (así el aula borra los archivos)
  if (!Object.keys(plugindata).length) throw new Error("No hay cambios que guardar.");
  firstWarning(await c.call("mod_assign_save_submission", { assignmentid: assignId, plugindata }));
  return true;
}

async function assignSubmit(c, assignId, accept) {
  firstWarning(await c.call("mod_assign_submit_for_grading", { assignmentid: toId(assignId), acceptsubmissionstatement: accept ? 1 : 0 }));
  return true;
}

async function assignRemove(c, assignId, userId) {
  firstWarning(await c.call("mod_assign_remove_submission", { userid: toId(userId), assignmentid: toId(assignId) }));
  return true;
}

const COMMENT_BASE = (cmid, subId) => ({ contextlevel: "module", instanceid: toId(cmid), component: "assignsubmission_comments", itemid: toId(subId), area: "submission_comments" });

async function assignComments(c, cmid, subId, myId) {
  const r = await c.call("core_comment_get_comments", { ...COMMENT_BASE(cmid, subId), page: 0, sortdirection: "ASC" });
  return {
    canPost: !!(r && r.canpost),
    comments: arr(r && r.comments).slice(-100).map(k => ({
      id: num(k.id), text: htmlToText(k.content).slice(0, 4000), name: clip(k.fullname, 100),
      pic: String(k.profileimageurl || ""), time: num(k.timecreated || k.time), mine: num(k.userid) === num(myId)
    }))
  };
}

async function assignComment(c, cmid, subId, text) {
  text = String(text || "").trim();
  if (!text) throw new Error("Escribe un comentario.");
  await c.call("core_comment_add_comments", { comments: [{ ...COMMENT_BASE(cmid, subId), content: text.slice(0, 4000) }] });
  return true;
}

// ===================================================================== CUESTIONARIOS

const SUPPORTED_RULES = new Set(["quizaccess_password", "quizaccess_numattempts", "quizaccess_openclosedate", "quizaccess_timelimit", "quizaccess_delaybetweenattempts", "quizaccess_ipaddress", "quizaccess_offlineattempts"]);

async function quizFind(c, courseId, cmid) {
  const r = await c.call("mod_quiz_get_quizzes_by_courses", { courseids: [toId(courseId)] });
  const q = arr(r && r.quizzes).find(x => num(x.coursemodule) === toId(cmid));
  if (!q) throw new Error("No se encontró el cuestionario en el aula.");
  return q;
}

const quizGrade = (q, sum) => (sum == null || !num(q.sumgrades) ? null : Math.round((Number(sum) / Number(q.sumgrades)) * Number(q.grade) * 100) / 100);

async function quizInfo(c, courseId, cmid, userId) {
  const q = await quizFind(c, courseId, cmid);
  const [att, best, access, attAccess] = await Promise.all([
    c.call("mod_quiz_get_user_attempts", { quizid: q.id, userid: userId, status: "all", includepreviews: 0 }),
    c.call("mod_quiz_get_user_best_grade", { quizid: q.id, userid: userId }).catch(() => null),
    c.call("mod_quiz_get_quiz_access_information", { quizid: q.id }).catch(() => null),
    c.call("mod_quiz_get_attempt_access_information", { quizid: q.id, attemptid: 0 }).catch(() => null)
  ]);
  const attempts = arr(att && att.attempts).map(a => ({
    id: num(a.id), number: num(a.attempt), state: String(a.state || ""),
    start: num(a.timestart), finish: num(a.timefinish), currentPage: num(a.currentpage),
    grade: a.state === "finished" ? quizGrade(q, a.sumgrades) : null
  })).sort((x, y) => x.number - y.number);
  const rules = arr(access && access.activerulenames);
  return {
    quizId: num(q.id), cmid: num(cmid),
    name: clip(q.name, 200), intro: htmlToText(q.intro).slice(0, 6000),
    timeOpen: num(q.timeopen), timeClose: num(q.timeclose), timeLimit: num(q.timelimit),
    maxAttempts: num(q.attempts), maxGrade: Number(q.grade) || 0,
    sequential: q.navmethod === "sequential",
    attempts,
    best: best && best.hasgrade ? Number(best.grade) : null,
    canAttempt: access ? access.canattempt !== false : true,
    reasons: [...arr(access && access.preventaccessreasons), ...arr(attAccess && attAccess.preventnewattemptreasons)].map(x => htmlToText(x)).filter(Boolean).slice(0, 6),
    rules: arr(access && access.accessrules).map(x => htmlToText(x)).filter(Boolean).slice(0, 8),
    needsPassword: rules.includes("quizaccess_password"),
    unsupported: rules.filter(r => !SUPPORTED_RULES.has(r)).length > 0
  };
}

const pre = pass => (pass ? [{ name: "quizpassword", value: String(pass).slice(0, 200) }] : []);

async function quizStart(c, quizId, password) {
  const r = await c.call("mod_quiz_start_attempt", { quizid: toId(quizId), preflightdata: pre(password) });
  firstWarning(r);
  if (!r || !r.attempt || !r.attempt.id) throw new Error("El aula no pudo empezar el intento.");
  return num(r.attempt.id);
}

const LAYOUT_PAGES = layout => Math.max(1, String(layout || "").split(",").filter(x => x === "0").length);

function normQuestion(q) {
  return {
    slot: num(q.slot), number: q.number == null ? "" : String(q.number), type: clip(q.type, 40),
    html: clip(q.html, 300000), status: htmlToText(q.status).slice(0, 80), stateclass: clip(q.stateclass || q.state, 40),
    flagged: !!q.flagged, mark: q.mark == null ? "" : String(q.mark), maxmark: q.maxmark == null ? "" : String(q.maxmark),
    blocked: !!q.blockedbyprevious
  };
}

async function quizPage(c, attemptId, page, password) {
  const r = await c.call("mod_quiz_get_attempt_data", { attemptid: toId(attemptId), page: Math.max(0, Math.floor(num(page))), preflightdata: pre(password) });
  const at = (r && r.attempt) || {};
  return {
    attempt: { id: num(at.id), state: String(at.state || ""), start: num(at.timestart), pages: LAYOUT_PAGES(at.layout) },
    page: Math.max(0, Math.floor(num(page))),
    serverNow: Math.floor((Date.now() + (c.skew || 0)) / 1000),
    nextPage: r && r.nextpage != null ? num(r.nextpage) : -1,
    messages: arr(r && r.messages).map(x => htmlToText(x)).filter(Boolean).slice(0, 5),
    questions: arr(r && r.questions).map(normQuestion)
  };
}

// data: [{name, value}] con los campos del formulario de la página.
function cleanData(data) {
  return arr(data).slice(0, 500)
    .filter(d => d && typeof d.name === "string" && /^[\w:\-.]{1,120}$/.test(d.name))
    .map(d => ({ name: d.name, value: clip(d.value, 100000) }));
}

async function quizSave(c, attemptId, data, password) {
  firstWarning(await c.call("mod_quiz_save_attempt", { attemptid: toId(attemptId), data: cleanData(data), preflightdata: pre(password) }));
  return true;
}

// finish=false: guarda y pasa de página. finish=true: entrega el intento.
async function quizProcess(c, attemptId, data, { finish, timeup, password }) {
  const r = await c.call("mod_quiz_process_attempt", {
    attemptid: toId(attemptId), data: cleanData(data), finishattempt: finish ? 1 : 0, timeup: timeup ? 1 : 0, preflightdata: pre(password)
  });
  firstWarning(r);
  return { state: String((r && r.state) || "") };
}

async function quizSummary(c, attemptId, password) {
  const r = await c.call("mod_quiz_get_attempt_summary", { attemptid: toId(attemptId), preflightdata: pre(password) });
  return arr(r && r.questions).map(q => ({
    number: q.number == null ? "" : String(q.number), page: num(q.page),
    status: htmlToText(q.status).slice(0, 80), done: /complete|answersaved|answered|saved/i.test(String(q.state || q.stateclass || "")),
    flagged: !!q.flagged
  }));
}

async function quizReview(c, attemptId) {
  const r = await c.call("mod_quiz_get_attempt_review", { attemptid: toId(attemptId), page: -1 });
  const at = (r && r.attempt) || {};
  return {
    grade: r && r.grade != null ? String(r.grade) : "",
    sum: at.sumgrades == null ? null : Number(at.sumgrades),
    extra: arr(r && r.additionaldata).map(x => ({ title: htmlToText(x.title).slice(0, 80), content: htmlToText(x.content).slice(0, 300) })).slice(0, 8),
    questions: arr(r && r.questions).map(normQuestion)
  };
}

// ===================================================================== FOROS

async function forumFind(c, courseId, cmid) {
  const r = await c.call("mod_forum_get_forums_by_courses", { courseids: [toId(courseId)] });
  const f = arr(r).find(x => num(x.cmid) === toId(cmid));
  if (!f) throw new Error("No se encontró el foro en el aula.");
  return f;
}

async function forumInfo(c, courseId, cmid) {
  const f = await forumFind(c, courseId, cmid);
  let canNew = true;
  try { const r = await c.call("mod_forum_can_add_discussion", { forumid: f.id }); canNew = !(r && r.status === false); } catch { /* si el aula no lo dice, se deja intentar */ }
  return { forumId: num(f.id), cmid: num(cmid), name: clip(f.name, 200), type: clip(f.type, 20), intro: htmlToText(f.intro).slice(0, 4000), canNew };
}

const PER_PAGE = 20;

async function forumDiscussions(c, forumId, page) {
  forumId = toId(forumId); page = Math.max(0, Math.floor(num(page)));
  let r;
  try { r = await c.call("mod_forum_get_forum_discussions", { forumid: forumId, sortorder: -1, page, perpage: PER_PAGE }); }
  catch (e1) {
    try { r = await c.call("mod_forum_get_forum_discussions_paginated", { forumid: forumId, sortby: "timemodified", sortdirection: "DESC", page, perpage: PER_PAGE }); }
    catch { throw e1; }
  }
  const list = arr(r && r.discussions);
  return {
    more: list.length >= PER_PAGE,
    discussions: list.map(d => ({
      id: num(d.discussion), title: clip(d.name || d.subject, 200), preview: htmlToText(d.message).slice(0, 220),
      author: clip(d.userfullname, 100), pic: String(d.userpictureurl || ""),
      created: num(d.created), modified: num(d.timemodified), replies: num(d.numreplies), unread: num(d.numunread),
      pinned: !!d.pinned, locked: !!d.locked, canReply: d.canreply !== false,
      subscribed: typeof d.subscribed === "boolean" ? d.subscribed : null
    }))
  };
}

async function forumPosts(c, discussionId) {
  discussionId = toId(discussionId);
  let r;
  try { r = await c.call("mod_forum_get_discussion_posts", { discussionid: discussionId, sortby: "created", sortdirection: "ASC" }); }
  catch (e1) {
    try { r = await c.call("mod_forum_get_forum_discussion_posts", { discussionid: discussionId, sortby: "created", sortdirection: "ASC" }); }
    catch { throw e1; }
  }
  c.call("mod_forum_view_forum_discussion", { discussionid: discussionId }).catch(() => {}); // marca como leído (si el aula lo permite)
  return {
    forumId: num(r && r.forumid),
    posts: arr(r && r.posts).slice(0, 300).map(p => ({
      id: num(p.id), parent: num(p.parentid != null ? p.parentid : p.parent),
      subject: clip(htmlToText(p.subject), 255), text: htmlToText(p.message).slice(0, 20000),
      author: clip((p.author && p.author.fullname) || p.userfullname, 100),
      pic: String((p.author && p.author.urls && p.author.urls.profileimage) || p.userpictureurl || ""),
      time: num(p.timecreated != null ? p.timecreated : p.created), unread: !!p.unread, deleted: !!p.isdeleted,
      canReply: p.capabilities ? !!p.capabilities.reply : true,
      files: arr(p.attachments).filter(f => f && f.fileurl).map(fileOf)
    })).filter(p => !p.deleted)
  };
}

const subj = s => clip(String(s || "").replace(/\s+/g, " ").trim(), 255);

async function forumReply(c, postId, subject, text, subscribe) {
  text = String(text || "").trim();
  if (!text) throw new Error("Escribe tu respuesta.");
  const s = subj(subject) || "Re:";
  const r = await c.call("mod_forum_add_discussion_post", {
    postid: toId(postId), subject: s, message: textToHtml(text.slice(0, 20000)),
    options: [{ name: "discussionsubscribe", value: subscribe ? "1" : "0" }]
  });
  firstWarning(r);
  return num(r && r.postid);
}

async function forumNew(c, forumId, subject, text, subscribe) {
  subject = subj(subject); text = String(text || "").trim();
  if (!subject) throw new Error("Escribe un asunto.");
  if (!text) throw new Error("Escribe el mensaje.");
  const r = await c.call("mod_forum_add_discussion", {
    forumid: toId(forumId), subject, message: textToHtml(text.slice(0, 20000)),
    options: [{ name: "discussionsubscribe", value: subscribe ? "1" : "0" }]
  });
  firstWarning(r);
  return num(r && r.discussionid);
}

async function forumSubscribe(c, forumId, discussionId, state) {
  const r = await c.call("mod_forum_set_subscription_state", { forumid: toId(forumId), discussionid: toId(discussionId), targetstate: state ? 1 : 0 });
  const us = r && r.userstate;
  return us && typeof us.subscribed === "boolean" ? us.subscribed : !!state;
}

module.exports = {
  friendly, textToHtml, uploadDraft,
  assignInfo, assignRaw, assignSave, assignSubmit, assignRemove, assignComments, assignComment,
  quizInfo, quizStart, quizPage, quizSave, quizProcess, quizSummary, quizReview,
  forumInfo, forumDiscussions, forumPosts, forumReply, forumNew, forumSubscribe
};
