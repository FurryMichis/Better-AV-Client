"use strict";
// Prueba del puente Android SIN móvil: carga www/nx-modules.js + www/mobile-bridge.js en Node con un aula Moodle y plugins simulados.
// Uso: (desde mobile/) node build-web.js && node test/bridge.test.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const WWW = path.join(__dirname, "..", "www");

function makeEnv(store = new Map()) {
  const log = { opened: [], shared: [], browser: [], http: [] };
  const files = new Map(); // ruta relativa -> contenido
  const win = {};
  const kv = { get: async k => store.get(k), set: async (k, v) => { store.set(k, structuredClone(v)); }, del: async k => { store.delete(k); } };
  const moodle = { users: { alumno: "secreto" } };
  const COURSE = { id: 7, fullname: "Matemáticas", shortname: "MAT", overviewfiles: [], progress: 40 };
  const ws = {
    core_webservice_get_site_info: () => ({ userid: 99, fullname: "Ana Alumna", username: "alumno", sitename: "Aula de prueba", userpictureurl: "" }),
    core_enrol_get_users_courses: () => [COURSE],
    mod_assign_get_assignments: () => ({ courses: [{ id: 7, assignments: [{ cmid: 12, id: 5, duedate: 1900000000 }] }] }),
    core_course_get_contents: () => [{ id: 1, name: "Tema 1", modules: [
      { id: 11, name: "Apuntes", modname: "resource", url: "", uservisible: true, contents: [{ type: "file", filename: "tema1.pdf", fileurl: "https://aula.test/aula/pluginfile.php/1/mod_resource/content/1/tema1.pdf", filesize: 10, timemodified: 111 }] },
      { id: 12, name: "Entrega", modname: "assign", url: "https://aula.test/aula/mod/assign/view.php?id=12", uservisible: true, contents: [] }
    ] }],
    core_enrol_get_enrolled_users: () => [{ id: 3, fullname: "Profe Pepe", roles: [{ shortname: "editingteacher" }] }],
    mod_assign_get_submission_status: () => ({ lastattempt: { submission: { status: "submitted" } } }),
    core_message_get_conversations: () => ({ conversations: [{ id: 1, name: "", unreadcount: 2, members: [{ id: 99, fullname: "Ana" }, { id: 3, fullname: "Profe Pepe" }], messages: [{ text: "<p>Hola</p>", timecreated: 100, useridfrom: 3 }] }] })
  };
  const NXCap = {
    Capacitor: { isNativePlatform: () => true },
    CapacitorHttp: {
      async request(o) {
        log.http.push(o);
        const u = new URL(o.url);
        if (u.pathname.endsWith("/login/token.php")) {
          if (moodle.users[o.data.username] === o.data.password) return { status: 200, data: JSON.stringify({ token: "TOKEN123" }), headers: {} };
          return { status: 200, data: JSON.stringify({ error: "x", errorcode: "invalidlogin" }), headers: {} };
        }
        if (u.pathname.endsWith("/webservice/rest/server.php")) {
          assert.equal(o.data.wstoken, "TOKEN123");
          const f = ws[o.data.wsfunction];
          if (!f) return { status: 200, data: JSON.stringify({ exception: "x", message: "no " + o.data.wsfunction, errorcode: "nofn" }), headers: {} };
          return { status: 200, data: JSON.stringify(f(o.data)), headers: {} };
        }
        if (u.pathname.includes("/webservice/pluginfile.php/") && o.responseType === "blob") {
          if (u.pathname.endsWith(".png")) return { status: 200, data: Buffer.from("PNGDATA").toString("base64"), headers: { "Content-Type": "image/png" } };
          return { status: 200, data: Buffer.from("%PDF-1.4 ".repeat(600)).toString("base64"), headers: { "content-type": "application/pdf" } };
        }
        return { status: 404, data: "", headers: {} };
      }
    },
    App: { addListener: async () => ({ remove: async () => {} }), minimizeApp() {} },
    Browser: { open: async o => { log.browser.push(o.url); }, close: async () => {} },
    Directory: { Cache: "CACHE" },
    Filesystem: {
      async stat({ path: p }) { if (!files.has(p)) throw new Error("nofile"); return { size: files.get(p).length }; },
      async downloadFile({ url, path: p }) { assert.match(url, /token=TOKEN123/); assert.match(url, /\/webservice\/pluginfile\.php\//); files.set(p, "%PDF-1.4 ".repeat(600)); return { path: "/cache/" + p }; },
      async writeFile({ path: p, data }) { files.set(p, Buffer.from(data, "base64").toString()); return { uri: "file:///cache/" + p }; },
      async readFile({ path: p }) { return { data: files.get(p) }; },
      async getUri({ path: p }) { return { uri: "file:///data/cache/" + encodeURI(p) }; },
      async deleteFile({ path: p }) { files.delete(p); }, async rmdir() {}, async readdir() { return { files: [] }; }
    },
    Share: { share: async o => { log.shared.push(o); } },
    NxOpener: { open: async o => { log.opened.push(o); } }
  };
  Object.assign(win, {
    NXCap, __nxKV: kv, console, setTimeout, clearTimeout, setInterval, clearInterval,
    crypto: globalThis.crypto, btoa, atob, TextEncoder, TextDecoder, URL, URLSearchParams, AbortController, AbortSignal, DOMException, structuredClone,
    FileReader: class {}, Audio: class { play() { return Promise.resolve(); } },
    document: { hidden: false, readyState: "complete", addEventListener() {}, createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, append() {}, addEventListener() {} }), body: { append() {}, classList: { contains: () => false, toggle() {} } }, documentElement: { classList: { add() {} } }, querySelectorAll: () => [], getElementById: () => null, querySelector: () => null },
    addEventListener() {}, location: { reload() {} }, fetch: async () => { throw new Error("sin red"); }
  });
  win.window = win; win.self = win;
  vm.createContext(win);
  for (const f of ["nx-modules.js", "mobile-bridge.js"]) vm.runInContext(fs.readFileSync(path.join(WWW, f), "utf8"), win, { filename: f });
  return { win, api: win.notxuntaClient, log, files, store, moodle };
}

(async () => {
  let t = 0; const ok = m => console.log(`✓ ${++t}. ${m}`);

  const env = makeEnv();
  const { api, log, files, store } = env;
  const r = await api.platformInfo();
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { ok: true, data: { platform: "android", secure: true } }); ok("platform android");
  assert.equal(api.version, "0.7.0");

  // contraseña incorrecta
  let bad = await api.addAccount({ name: "Aula", url: "https://aula.test/aula/login/index.php", username: "alumno", password: "mal" });
  assert.equal(bad.ok, false); assert.match(bad.error, /incorrectos/); ok("login incorrecto → mensaje legible");

  // alta
  let add = await api.addAccount({ name: "Aula", url: "https://aula.test/aula/login/index.php", username: "alumno", password: "secreto" });
  assert.equal(add.ok, true); assert.equal(add.data.url, "https://aula.test/aula"); assert.equal(add.data.pw, undefined);
  const saved = store.get("accounts")[0];
  assert.ok(saved.pw && !saved.pw.includes("secreto")); ok("alta de cuenta; contraseña guardada cifrada");
  const id = add.data.id;

  // sincronización
  const open = await api.openInstance(id);
  assert.equal(open.ok, true, open.error);
  assert.equal(open.data.courses[0].fullname, "Matemáticas");
  assert.equal(open.data.courses[0].teachers[0].fullname, "Profe Pepe");
  const tasks = open.data.courses[0].sections[0].modules.filter(m => m.kind === "task");
  assert.equal(tasks[0].status, "submitted"); assert.equal(open.data.unreadMessages, 2); ok("sincroniza cursos, profesor, entregas y mensajes");

  // abrir apunte
  const doc = open.data.courses[0].sections[0].modules[0].files[0];
  const o1 = await api.openFile(id, doc.fileurl, doc.filename, doc.timemodified);
  assert.equal(o1.ok, true, o1.error);
  assert.equal(log.opened.length, 1); assert.match(log.opened[0].path, /\/data\/cache\/docs\/[0-9a-f]{16}\/tema1\.pdf$/); assert.equal(log.opened[0].mime, "application/pdf"); ok("descarga y abre el PDF con NxOpener");
  await api.openFile(id, doc.fileurl, doc.filename, doc.timemodified);
  assert.equal(log.opened.length, 2); ok("segunda apertura reutiliza caché");

  // URL de otro dominio: no se envía el token
  const ev = await api.openFile(id, "https://malo.example/pluginfile.php/x.pdf", "x.pdf", 1);
  assert.equal(ev.ok, false); assert.match(ev.error, /no pertenece al aula/); ok("el token nunca se envía a otro dominio");

  // ejecutables no se abren
  const exe = await api.openFile(id, "https://aula.test/aula/pluginfile.php/1/a/virus.exe", "virus.exe", 1);
  assert.equal(exe.ok, true); assert.match(exe.data.note, /ejecutable/); assert.equal(log.opened.length, 2); ok("no abre ejecutables");

  // imagen
  const img = await api.image(id, "https://aula.test/aula/pluginfile.php/1/a/foto.png");
  assert.equal(img.ok, true, img.error); assert.match(img.data, /^data:image\/png;base64,/); ok("imágenes como data URL");

  // ajustes persistentes y sincronizables
  const s1 = await api.setSettings({ ai: "claude", msgNotify: false });
  assert.equal(s1.data.settings.ai, "claude");
  const g = await api.getSettings(); assert.equal(g.data.ai.length, 8); ok("ajustes y lista de IAs");

  // calendario / mensajes
  const conv = await api.conversations(id, 99);
  assert.equal(conv.data[0].name, "Profe Pepe"); assert.equal(conv.data[0].unread, 2); ok("conversaciones con nombre del contacto");

  // overlay → navegador
  await api.openOverlay(); assert.equal(log.browser.at(-1), "https://claude.ai/"); ok("overlay abre la IA elegida");
  const ext = await api.openExternal("https://user:pw@x.com/"); assert.equal(ext.ok, false); ok("rechaza enlaces con usuario/contraseña");

  // vídeo no soportado
  const v = await api.pickVideo(); assert.equal(v.ok, false); ok("vídeo de fondo: mensaje claro");

  // reinicio: todo persiste (nueva instancia con el mismo almacén)
  await new Promise(r => setTimeout(r, 50));
  const env2 = makeEnv(store);
  const list = await env2.api.listAccounts();
  assert.equal(list.data.length, 1); assert.equal(list.data[0].name, "Aula");
  const st = await env2.api.getSettings(); assert.equal(st.data.settings.ai, "claude"); ok("tras reiniciar: cuentas y ajustes siguen ahí");
  const again = await env2.api.openInstance(id); assert.equal(again.ok, true, again.error);
  assert.equal(again.data.courses.length, 1); ok("tras reiniciar: reconecta con la contraseña cifrada");

  // cuenta NotXunta (Supabase simulado)
  const calls = [];
  env2.win.fetch = async (url, o = {}) => {
    const u = new URL(url); calls.push(`${o.method || "GET"} ${u.pathname}${u.search.slice(0, 40)}`);
    const json = (d, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(d), json: async () => d });
    if (u.pathname === "/auth/v1/token") return json({ access_token: "AT", refresh_token: "RT", expires_in: 3600, user: { id: "11111111-1111-4111-8111-111111111111", email: "a@b.es" } });
    if (u.pathname === "/rest/v1/profiles") return json([{ id: "11111111-1111-4111-8111-111111111111", username: "ana", display_name: "Ana", discoverable: true, avatar: null, show_online: true }]);
    if (u.pathname === "/rest/v1/rpc/list_friends") return json([]);
    if (u.pathname === "/rest/v1/rpc/heartbeat") return json(null);
    if (u.pathname === "/rest/v1/user_settings") return json(o.method === "POST" ? null : []);
    return json({ message: "no " + u.pathname }, 404);
  };
  const bad2 = await env2.api.cloudSignIn("no-es-correo", "12345678"); assert.equal(bad2.ok, false);
  const li = await env2.api.cloudSignIn("a@b.es", "12345678"); assert.equal(li.ok, true, li.error);
  const cs = await env2.api.cloudStatus(); assert.equal(cs.data.signedIn, true); assert.equal(cs.data.profile.username, "ana"); ok("nube: inicio de sesión y perfil");
  await new Promise(r => setTimeout(r, 30));
  const enc = store.get("cloud-session"); assert.ok(typeof enc === "string" && !enc.includes("AT") && !enc.includes("a@b.es")); ok("nube: sesión guardada cifrada");
  const fl = await env2.api.friendsList(); assert.deepEqual(JSON.parse(JSON.stringify(fl)), { ok: true, data: [] });
  const env3 = makeEnv(store); const cs3 = await env3.api.cloudStatus().catch(e => ({ ok: false, error: String(e) }));
  assert.equal(cs3.ok, false); // sin red simulada falla al pedir el perfil, pero la sesión sí se cargó (no «Inicia sesión»)
  assert.doesNotMatch(String(cs3.error), /Inicia sesión/); ok("nube: la sesión sobrevive al reinicio");
  env2.win.fetch = async (url, o) => ({ ok: true, status: 200, text: async () => JSON.stringify({ external: { google: true } }) });
  const pending = env2.api.cloudOAuth("google");
  await new Promise(r => setTimeout(r, 50));
  await env2.api.cloudOAuthCancel();
  const ou = await pending; assert.equal(ou.ok, false); assert.match(ou.error, /cancelado/);
  assert.match(env2.log.browser.at(-1), /\/auth\/v1\/authorize\?.*redirect_to=com\.notxunta\.client/); ok("oauth: abre el navegador con el enlace profundo y se puede cancelar");

  // eliminar
  const rm = await env2.api.removeAccount(id); assert.equal(rm.ok, true);
  assert.equal((await env2.api.listAccounts()).data.length, 0); ok("eliminar cuenta");

  console.log(`\n${t} pruebas correctas`);
  process.exit(0);
})().catch(e => { console.error("FALLO:", e); process.exit(1); });
