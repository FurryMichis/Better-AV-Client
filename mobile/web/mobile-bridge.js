"use strict";
// Puente Android de NotXunta Client.
// En escritorio, la interfaz (renderer.js) habla con el proceso principal de Electron por IPC (preload.js).
// En Android no hay Electron: este archivo ofrece el MISMO objeto `window.notxuntaClient` y reimplementa
// lo que hacía main.js, reutilizando tal cual moodle.js, settings.js, sync.js, ai.js, safefile.js y changelog.js
// (se cargan con un pequeño cargador CommonJS, ver build-web.js). Las peticiones al aula (Moodle) salen por el
// HTTP nativo de Capacitor (el aula no envía cabeceras CORS) y el resto por fetch normal (Supabase sí las envía).
(function () {
  const VERSION = "__NX_VERSION__";
  const NX = window.NXCap || {};
  const IS_NATIVE = !!(NX.Capacitor && NX.Capacitor.isNativePlatform && NX.Capacitor.isNativePlatform());
  const RELEASES_URL = "https://github.com/FurryMichis/notxunta-client/releases/latest";
  const RELEASES_API = "https://api.github.com/repos/FurryMichis/notxunta-client/releases/latest";

  if (!AbortSignal.timeout) {
    AbortSignal.timeout = ms => { const c = new AbortController(); setTimeout(() => c.abort(new DOMException("Tiempo agotado", "TimeoutError")), ms); return c.signal; };
  }

  // ------------------------------------------------------------------ almacenamiento (IndexedDB) y bóveda
  function makeIdbKv() {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open("notxunta", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const tx = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction("kv", mode);
        const rq = fn(t.objectStore("kv"));
        t.oncomplete = () => res(rq ? rq.result : undefined);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    };
    return {
      get: k => tx("readonly", s => s.get(k)),
      set: (k, v) => tx("readwrite", s => s.put(v, k)),
      del: k => tx("readwrite", s => s.delete(k))
    };
  }
  const kv = window.__nxKV || (window.__nxKV = makeIdbKv());

  // Las contraseñas y la sesión de la nube se guardan cifradas con una clave AES-GCM no exportable (WebCrypto).
  // Protege ante copias del archivo de datos; no es el llavero de hardware de Android.
  const vault = window.__nxVault || (window.__nxVault = (() => {
    let keyP = null;
    const getKey = () => keyP || (keyP = (async () => {
      let k = await kv.get("vault-key");
      if (!k) {
        k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
        await kv.set("vault-key", k);
      }
      return k;
    })());
    const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    return {
      async encrypt(text) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await getKey(), new TextEncoder().encode(String(text)));
        const out = new Uint8Array(12 + ct.byteLength);
        out.set(iv); out.set(new Uint8Array(ct), 12);
        return toB64(out);
      },
      async decrypt(b64) {
        const raw = fromB64(b64);
        const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, await getKey(), raw.slice(12));
        return new TextDecoder().decode(pt);
      }
    };
  })());

  // ------------------------------------------------------------------ cargador CommonJS + shims de Node/Electron
  const defs = window.__nxDefs || (window.__nxDefs = {});
  const cache = {};
  function nxRequire(spec) {
    const name = String(spec).replace(/^node:/, "").split("/").pop().replace(/\.js$/, "");
    if (cache[name]) return cache[name].exports;
    const def = defs[name];
    if (!def) throw new Error("Módulo no disponible: " + spec);
    const module = { exports: {} };
    cache[name] = module;
    def(module, module.exports, nxRequire);
    return module.exports;
  }

  // «Archivos» de settings.json y sync-state.json: en memoria y copiados a IndexedDB (la API de fs que usan es síncrona).
  let fsMem = {};
  const persistFs = () => { kv.set("fs-all", fsMem).catch(() => {}); };
  const enoent = p => Object.assign(new Error("ENOENT: " + p), { code: "ENOENT" });
  const fsShim = {
    readFileSync(p) { if (!(p in fsMem)) throw enoent(p); return fsMem[p]; },
    writeFileSync(p, data) { fsMem[p] = String(data); persistFs(); },
    renameSync(a, b) { if (!(a in fsMem)) throw enoent(a); fsMem[b] = fsMem[a]; delete fsMem[a]; persistFs(); },
    mkdirSync() {},
    rmSync(p) { delete fsMem[p]; persistFs(); },
    unlinkSync(p) { if (!(p in fsMem)) throw enoent(p); delete fsMem[p]; persistFs(); },
    promises: {}
  };
  const pathShim = {
    join: (...p) => p.join("/").replace(/\/+/g, "/"),
    dirname: p => String(p).replace(/\/[^/]*$/, "") || "/",
    basename: (p, ext) => { let b = String(p).split("/").pop(); if (ext && b.endsWith(ext)) b = b.slice(0, -ext.length); return b; },
    extname: p => { const m = /\.[^./]*$/.exec(String(p).split("/").pop()); return m ? m[0] : ""; }
  };
  defs.fs = m => { m.exports = fsShim; };
  defs.path = m => { m.exports = pathShim; };
  defs.electron = m => { m.exports = { app: { getPath: () => "/userdata", getVersion: () => VERSION, isPackaged: true } }; };

  const moodleMod = () => nxRequire("moodle");
  const settings = nxRequire("settings");
  const { AI_LIST, aiById } = nxRequire("ai");
  const safefile = nxRequire("safefile");
  const CHANGELOG = nxRequire("changelog");
  const sync = nxRequire("sync");
  const cloud = nxRequire("cloud");

  // ------------------------------------------------------------------ utilidades
  const listeners = {};
  const on = (ev, cb) => { (listeners[ev] = listeners[ev] || new Set()).add(cb); return () => listeners[ev].delete(cb); };
  const emit = (ev, payload) => { for (const cb of [...(listeners[ev] || [])]) { try { cb(payload); } catch { /* un oyente roto no afecta al resto */ } } };

  const plain = html => String(html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  const siteKey = url => { try { const u = new URL(url); return (u.host + u.pathname.replace(/\/+$/, "")).toLowerCase(); } catch { return String(url || "").toLowerCase(); } };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
  const visible = () => !document.hidden;
  const sha1 = async s => [...new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  const MIME = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
    txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json", zip: "application/zip",
    doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet",
    odp: "application/vnd.oasis.opendocument.presentation", mp3: "audio/mpeg", mp4: "video/mp4"
  };
  const mimeOf = name => MIME[(/\.([^.]+)$/.exec(String(name)) || [])[1]?.toLowerCase()] || "*/*";

  // Sonido de notificación (assets/notification.mp3) y aviso dentro de la app.
  let audio = null;
  function playSound(force) {
    try {
      if (!force && settings.get().notifySound === false) return;
      audio = audio || new Audio("assets/notification.mp3");
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch { /* sin sonido */ }
  }
  let bannerEl = null, bannerTimer = null;
  function announce(title, body) {
    playSound(false);
    if (!settings.get().toasts) return;
    if (!bannerEl) {
      bannerEl = document.createElement("div");
      bannerEl.id = "nx-banner";
      bannerEl.addEventListener("click", () => bannerEl.classList.remove("show"));
      document.body.append(bannerEl);
    }
    bannerEl.textContent = "";
    const b = document.createElement("b"); b.textContent = String(title).slice(0, 80);
    const s = document.createElement("span"); s.textContent = String(body || "").slice(0, 140);
    bannerEl.append(b, s);
    bannerEl.classList.add("show");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => bannerEl.classList.remove("show"), 5000);
  }

  // ------------------------------------------------------------------ HTTP nativo hacia el aula
  async function moodleFetch(url, opts = {}) {
    const Http = NX.CapacitorHttp;
    if (!IS_NATIVE || !Http) { // navegador de pruebas: fetch normal
      const r = await fetch(url, { method: opts.method, headers: opts.headers, body: opts.body });
      return r;
    }
    const headers = opts.headers || {};
    let data;
    if (opts.body) data = /x-www-form-urlencoded/.test(headers["Content-Type"] || "") ? Object.fromEntries(new URLSearchParams(String(opts.body))) : opts.body;
    const r = await Http.request({
      url, method: opts.method || "GET", headers, data, responseType: "text",
      connectTimeout: 30000, readTimeout: 40000, disableRedirects: true
    });
    if ([301, 302, 303, 307, 308].includes(r.status)) throw new Error("El aula redirige a otra dirección. Usa el enlace final y completo (con https://).");
    const text = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => text };
  }

  // ------------------------------------------------------------------ cuentas y sesiones Moodle
  let accounts = [];
  const loadAccounts = () => accounts;
  const saveAccounts = list => { accounts = list; kv.set("accounts", accounts).catch(() => {}); };
  const publicAccount = a => ({ id: a.id, name: a.name, url: a.url, username: a.username, icon: a.icon || "", needsPassword: !!a.needsPassword });

  function cleanIcon(icon) {
    if (icon == null || icon === "") return "";
    icon = String(icon);
    if (icon.startsWith("data:image/")) {
      if (icon.length > 200000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(icon)) throw new Error("La imagen del icono no es válida o es demasiado grande.");
      return icon;
    }
    if ([...icon].length > 8) throw new Error("Icono no válido.");
    return icon;
  }
  function findAccount(id) {
    const acc = accounts.find(a => a.id === id);
    if (!acc) throw new Error("La cuenta ya no existe.");
    return acc;
  }

  const sessions = new Map(); // accountId -> MoodleClient (el token nunca llega a la interfaz)
  const bgBlocked = new Set();
  const newClient = url => new (moodleMod().MoodleClient)(url, { fetchImpl: moodleFetch });

  async function connect(acc) {
    if (acc.needsPassword || !acc.pw) throw Object.assign(new Error("Falta la contraseña de esta aula en este dispositivo."), { errorcode: "nopassword" });
    const client = newClient(acc.url);
    await client.login(acc.username, await vault.decrypt(acc.pw));
    sessions.set(acc.id, client);
    return client;
  }
  async function clientFor(id) { return sessions.get(id) || connect(findAccount(id)); }
  async function withClient(id, fn) {
    const client = await clientFor(id);
    try { return await fn(client); }
    catch (e) {
      if (e.errorcode === "invalidtoken") return fn(await connect(findAccount(id)));
      throw e;
    }
  }

  // ------------------------------------------------------------------ mensajes del aula: estado local, contador y avisos
  const msgStates = new Map();
  async function msgState(id) {
    if (!msgStates.has(id)) {
      const s = (await kv.get("msgstate-" + id)) || {};
      msgStates.set(id, { baselined: !!s.baselined, notified: s.notified || {}, seen: s.seen || {} });
    }
    return msgStates.get(id);
  }
  const saveMsgState = id => { kv.set("msgstate-" + id, msgStates.get(id)).catch(() => {}); };
  const userIds = new Map();
  async function userIdOf(id, c) {
    if (!userIds.has(id)) userIds.set(id, (await c.siteInfo()).userid);
    return userIds.get(id);
  }
  function mapConversations(r, userId, st) {
    return (r.conversations || []).map(cv => {
      const members = cv.members || [];
      const others = members.filter(m => m.id !== userId);
      const who = others.length ? others : members;
      const lastMsg = cv.messages && cv.messages[0];
      const time = (lastMsg && lastMsg.timecreated) || 0;
      const seen = st.seen[cv.id] || 0;
      return {
        id: cv.id,
        name: cv.name || who.map(m => m.fullname).filter(Boolean).join(", ") || "Chat",
        unread: time && time <= seen ? 0 : (cv.unreadcount || 0),
        last: plain(lastMsg && lastMsg.text),
        time,
        from: (lastMsg && lastMsg.useridfrom) || 0,
        pic: cv.imageurl || (who[0] && (who[0].profileimageurl || who[0].profileimageurlsmall)) || ""
      };
    });
  }

  let booted = false; // los ajustes se leen de IndexedDB al arrancar: hasta entonces no se sondea nada
  let msgTimer = null, msgBusy = false;
  async function pollMessages() {
    if (!booted || msgBusy || !visible() || !settings.get().msgNotify) return;
    msgBusy = true;
    try {
      for (const acc of [...accounts]) {
        if (bgBlocked.has(acc.id) || acc.needsPassword) continue;
        try {
          const st = await msgState(acc.id);
          const list = await withClient(acc.id, async c => {
            const uid = await userIdOf(acc.id, c);
            return mapConversations(await c.conversations(uid, 30), uid, st);
          });
          const uid = userIds.get(acc.id);
          const total = list.reduce((n, cv) => n + cv.unread, 0);
          const fresh = list.filter(cv => cv.unread > 0 && cv.from !== uid && cv.time > (st.notified[cv.id] || 0));
          for (const cv of fresh) st.notified[cv.id] = cv.time;
          const firstRun = !st.baselined; // la primera comprobación solo fija la referencia
          st.baselined = true;
          saveMsgState(acc.id);
          emit("msg:update", { accountId: acc.id, total, fresh: (firstRun ? [] : fresh).map(cv => ({ name: cv.name, text: cv.last.slice(0, 120) })) });
        } catch (e) {
          if (e && e.errorcode === "invalidlogin") bgBlocked.add(acc.id);
        }
      }
    } finally { msgBusy = false; }
  }
  function scheduleMessages(firstDelayMs) {
    clearTimeout(msgTimer);
    msgTimer = setTimeout(async () => { await pollMessages(); scheduleMessages(); }, firstDelayMs || 60000);
  }

  // ------------------------------------------------------------------ cuenta NotXunta (nube): vínculos, amigos, mensajes
  async function linkAccountToCloud(accountId, user) {
    try {
      if (!cloud.isSignedIn() || !user || !user.id) return;
      const st = await cloud.status();
      if (!st.profile || !st.profile.discoverable) return;
      const acc = accounts.find(a => a.id === accountId);
      if (acc) await cloud.linkMoodle(siteKey(acc.url), user.id, user.fullname || user.name || "");
    } catch { /* se reintenta en la próxima sincronización */ }
  }
  async function linkAllAccounts() {
    for (const acc of accounts) {
      const c = await kv.get("cache-" + acc.id);
      if (c && c.data && c.data.user) await linkAccountToCloud(acc.id, c.data.user);
    }
  }
  function afterCloudLogin() { cloud.invalidateProfile(); setTimeout(() => { linkAllAccounts(); pollFriends(); pollNxMessages(); beat(); }, 1500); sync.schedule(1500); }

  let knownIncoming = null, friendsTimer = null;
  const sendFriendBadge = n => emit("cloud:badge", { pending: n });
  async function pollFriends() {
    try {
      if (!cloud.configured() || !cloud.isSignedIn()) { knownIncoming = null; sendFriendBadge(0); return; }
      const st = await cloud.status();
      if (!st.profile) { sendFriendBadge(0); return; }
      const incoming = (await cloud.rpc("list_friends")).filter(r => r.status === "pending" && !r.i_requested);
      sendFriendBadge(incoming.length);
      if (knownIncoming && visible()) {
        for (const r of incoming.filter(r => !knownIncoming.has(r.friendship_id)).slice(0, 3)) {
          announce(`${r.display_name || r.username} quiere ser tu amigo`, "Abre «Amigos» para aceptar o rechazar la solicitud.");
        }
      }
      knownIncoming = new Set(incoming.map(r => r.friendship_id));
    } catch { /* sin conexión: se reintenta */ }
  }
  let presenceTimer = null;
  async function beat() {
    try {
      if (!booted || !visible() || !cloud.configured() || !cloud.isSignedIn()) return;
      await cloud.status();
      await cloud.heartbeat();
    } catch { /* se reintenta en 45 s */ }
  }
  function schedulePresence() { clearInterval(presenceTimer); setTimeout(beat, 6000); presenceTimer = setInterval(beat, 45000); }
  function scheduleFriends() { clearInterval(friendsTimer); setTimeout(() => { pollFriends(); linkAllAccounts(); }, 25000); friendsTimer = setInterval(pollFriends, 3 * 60 * 1000); }

  let nxSeen = null, nxTimer = null, nxBusy = false;
  async function nxNames() {
    const names = new Map();
    try { for (const f of (await cloud.rpc("list_friends")) || []) names.set(f.other_id, f.display_name || f.username); } catch { /* «Un amigo» */ }
    return names;
  }
  async function pollNxMessages() {
    if (!booted || nxBusy || !visible()) return;
    nxBusy = true;
    try {
      if (!cloud.configured() || !cloud.isSignedIn()) { nxSeen = null; emit("nx:update", { unread: 0, fresh: [] }); return; }
      const me = cloud.userId();
      if (!me) return;
      const rows = (await cloud.rest("GET", `/rest/v1/direct_messages?recipient_id=eq.${me}&read_at=is.null&select=id,sender_id,body,created_at&order=created_at.asc&limit=100`)) || [];
      const fresh = nxSeen ? rows.filter(r => !nxSeen.has(r.id)) : [];
      nxSeen = new Set(rows.map(r => r.id));
      let groups = [];
      if (fresh.length) {
        const names = await nxNames();
        const bySender = new Map();
        for (const r of fresh) {
          const g = bySender.get(r.sender_id) || { name: names.get(r.sender_id) || "Un amigo", count: 0, text: "" };
          g.count++; g.text = String(r.body || "").slice(0, 120);
          bySender.set(r.sender_id, g);
        }
        groups = [...bySender.values()];
      }
      emit("nx:update", { unread: rows.length, fresh: groups });
    } catch { /* sin conexión: se reintenta */ } finally { nxBusy = false; }
  }
  function scheduleNxMessages() { clearInterval(nxTimer); setTimeout(pollNxMessages, 15000); nxTimer = setInterval(pollNxMessages, 30 * 1000); }

  // ------------------------------------------------------------------ ajustes sincronizados con la cuenta NotXunta
  function dropAccountFiles(id) {
    sessions.delete(id); msgStates.delete(id); userIds.delete(id);
    kv.del("cache-" + id).catch(() => {}); kv.del("msgstate-" + id).catch(() => {});
  }
  // Las aulas nuevas llegan SIN contraseña (needsPassword); las borradas en otro dispositivo se quitan también aquí.
  function applyRemoteAccounts(remote, known) {
    const { normalizeUrl } = moodleMod();
    const knownSet = new Set(known || []);
    const remoteIds = new Set(remote.map(r => r && r.id));
    const list = accounts.slice();
    const out = list.filter(a => remoteIds.has(a.id) || !knownSet.has(a.id));
    for (const a of list) if (!out.includes(a)) dropAccountFiles(a.id);
    for (const r of remote) {
      try {
        if (!r || typeof r.id !== "string" || !/^[\w-]{8,64}$/.test(r.id)) continue;
        const url = normalizeUrl(r.url);
        const name = String(r.name || "").trim().slice(0, 60);
        const username = String(r.username || "").trim().slice(0, 100);
        if (!name || !username) continue;
        let icon = ""; try { icon = cleanIcon(r.icon); } catch { /* se ignora */ }
        let a = out.find(x => x.id === r.id)
          || out.find(x => siteKey(x.url) === siteKey(url) && String(x.username).toLowerCase() === username.toLowerCase());
        if (a) {
          if (a.id !== r.id) { sessions.delete(a.id); a.id = r.id; }
          a.name = name;
          if (icon) a.icon = icon;
          else if (!a.icon || !String(a.icon).startsWith("data:") || a.icon.length <= 30000) delete a.icon;
        } else out.push({ id: r.id, name, url, username, pw: "", needsPassword: true, ...(icon ? { icon } : {}) });
      } catch { /* aula remota no válida: se ignora */ }
    }
    saveAccounts(out);
  }

  // ------------------------------------------------------------------ sincronización y novedades
  async function doSync(id, { background = false } = {}) {
    const acc = findAccount(id);
    const progress = msg => { if (!background) emit("sync-progress", msg); };
    const prev = await kv.get("cache-" + id);

    let data;
    try {
      data = await withClient(id, c => moodleMod().syncAll(c, progress));
    } catch (e) {
      if (prev && prev.data) return { ...prev.data, unseen: prev.unseen || [], offline: true, error: e.message, errorcode: e.errorcode };
      throw e;
    }

    bgBlocked.delete(id);
    const current = new Set(data.courses.flatMap(c => c.sections.flatMap(s => s.modules.map(m => m.key))));
    const known = new Set(prev ? prev.keys : []);
    const unseen = new Set(prev ? prev.unseen : []);
    let newCount = 0;
    if (prev) { // la primera sincronización solo fija la referencia
      for (const k of current) if (!known.has(k)) { unseen.add(k); newCount++; }
    }
    for (const k of [...unseen]) if (!current.has(k)) unseen.delete(k);

    try { // contador de mensajes sin leer (opcional)
      const uid = data.user.id; userIds.set(id, uid);
      const list = mapConversations(await withClient(id, c => c.conversations(uid, 30)), uid, await msgState(id));
      data.unreadMessages = list.reduce((n, cv) => n + cv.unread, 0);
    } catch { data.unreadMessages = 0; }
    linkAccountToCloud(id, data.user);

    await kv.set("cache-" + id, { keys: [...current], unseen: [...unseen], data });
    data.unseen = [...unseen];
    data.newCount = newCount;

    if (newCount > 0 && background && visible()) {
      announce(acc.name, `${newCount} ${newCount === 1 ? "novedad" : "novedades"} en ${acc.name}`);
    }
    return data;
  }

  let bgTimer = null, bgBusy = false;
  async function backgroundSync() {
    if (!booted || bgBusy || !visible()) return;
    bgBusy = true;
    try {
      for (const acc of [...accounts]) {
        if (bgBlocked.has(acc.id) || acc.needsPassword) continue;
        try {
          const r = await doSync(acc.id, { background: true });
          if (r && r.offline && r.errorcode === "invalidlogin") bgBlocked.add(acc.id);
        } catch (e) {
          if (e && e.errorcode === "invalidlogin") bgBlocked.add(acc.id);
        }
      }
    } finally { bgBusy = false; }
  }
  function scheduleBackground(firstDelayMs) {
    clearTimeout(bgTimer);
    const s = settings.get();
    if (!s.bgSync) return;
    bgTimer = setTimeout(async () => { await backgroundSync(); scheduleBackground(); }, firstDelayMs || s.syncMinutes * 60000);
  }

  sync.init({
    getPrefs: settings.get,
    applyPrefs: patch => { settings.set(patch); scheduleBackground(); },
    getAccounts: loadAccounts,
    applyAccounts: applyRemoteAccounts,
    notifyApplied: r => emit("sync:applied", { look: r.look, prefs: r.prefs, accounts: r.accounts })
  });

  // ------------------------------------------------------------------ archivos del dispositivo (apuntes y «Archivos NotXunta»)
  const Fs = () => NX.Filesystem;
  const CACHE = () => NX.Directory.Cache;
  const uriToPath = uri => decodeURIComponent(String(uri).replace(/^file:\/\//, ""));
  const blobToBase64 = blob => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] || "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

  async function openLocal(rel, name) {
    if (safefile.DANGEROUS.test(name)) return { note: "Archivo ejecutable: se ha descargado pero no se abre automáticamente." };
    const { uri } = await Fs().getUri({ path: rel, directory: CACHE() });
    try {
      await NX.NxOpener.open({ path: uriToPath(uri), mime: mimeOf(name) });
    } catch (e) {
      if (e && /NOAPP/.test(String(e.code || e.message))) throw new Error("No hay ninguna aplicación instalada que pueda abrir este tipo de archivo.");
      await NX.Share.share({ title: name, url: uri, dialogTitle: "Abrir con…" }); // plan B: hoja de compartir de Android
    }
    return {};
  }

  const docInflight = new Map();
  async function ensureDoc(accountId, url, filename, version) {
    const rel = `docs/${await sha1(`${accountId}|${url}|${Number(version) || 0}`)}/${safefile.safeName(filename)}`;
    try { if ((await Fs().stat({ path: rel, directory: CACHE() })).size > 0) return rel; } catch { /* aún no está en caché */ }
    if (docInflight.has(rel)) return docInflight.get(rel);
    const job = withClient(accountId, async c => {
      const tokenUrl = c.withToken(url);
      try {
        await Fs().downloadFile({ url: tokenUrl, path: rel, directory: CACHE(), recursive: true });
      } catch (e) { // plan B: HTTP nativo en memoria
        const r = await NX.CapacitorHttp.request({ url: tokenUrl, method: "GET", responseType: "blob", connectTimeout: 30000, readTimeout: 180000 });
        if (r.status >= 400) throw new Error(`No se pudo descargar el archivo (HTTP ${r.status}).`);
        await Fs().writeFile({ path: rel, data: r.data, directory: CACHE(), recursive: true });
      }
      const st = await Fs().stat({ path: rel, directory: CACHE() });
      if (st.size < 4096) { // posible error del aula en lugar del archivo
        const txt = await Fs().readFile({ path: rel, directory: CACHE(), encoding: "utf8" });
        if (String(txt.data).includes('"exception"')) {
          await Fs().deleteFile({ path: rel, directory: CACHE() }).catch(() => {});
          throw new Error("El aula rechazó la descarga del archivo.");
        }
      }
      return rel;
    }).finally(() => docInflight.delete(rel));
    docInflight.set(rel, job);
    return job;
  }

  async function purgeOldDocs() { // al arrancar: se borran los apuntes en caché con más de 3 días
    try {
      const { files } = await Fs().readdir({ path: "docs", directory: CACHE() });
      for (const f of files || []) {
        const age = Date.now() - Number(f.mtime || 0);
        if (f.mtime && age > 3 * 86400000) await Fs().rmdir({ path: `docs/${f.name}`, directory: CACHE(), recursive: true }).catch(() => {});
      }
    } catch { /* sin caché */ }
  }

  function pickFiles({ accept = "", multiple = false } = {}) {
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file"; input.style.display = "none";
      if (multiple) input.multiple = true;
      if (accept) input.accept = accept;
      document.body.append(input);
      let done = false;
      const finish = files => { if (done) return; done = true; input.remove(); resolve(files); };
      input.addEventListener("change", () => finish([...input.files]));
      input.addEventListener("cancel", () => finish([]));
      window.addEventListener("focus", () => setTimeout(() => { if (!input.files || !input.files.length) finish([]); }, 3000), { once: true });
      input.click();
    });
  }

  // «Archivos NotXunta»: archivos privados en tu cuenta (Supabase Storage, bucket «nx-files»)
  const BUCKET = "nx-files";
  const mb = n => `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;
  async function storageError(res) {
    let data = null;
    try { data = await res.json(); } catch { /* sin cuerpo */ }
    const msg = String((data && (data.message || data.error)) || "");
    if (res.status === 413 || /exceeded the maximum|too large|payload/i.test(msg)) return new Error("El archivo supera el tamaño máximo permitido.");
    if (res.status === 401 || res.status === 403 || /row-level security|violates/i.test(msg)) return new Error("No se pudo guardar: has alcanzado tu límite de espacio o tu sesión no es válida.");
    if (res.status === 404 && /bucket/i.test(msg)) return new Error("Falta preparar el servidor: ejecuta supabase/migration-0.6.1.sql en el SQL Editor de Supabase.");
    return new Error(msg ? msg.slice(0, 160) : `Error del servidor (${res.status}).`);
  }
  const firstRow = r => (Array.isArray(r) ? r[0] : r) || {};
  async function nxOverview() {
    const [usage, files] = await Promise.all([cloud.rpc("nx_files_usage"), cloud.rpc("nx_files_list")]);
    const u = firstRow(usage);
    return {
      usage: { used: Number(u.used) || 0, quota: Number(u.quota) || 0, maxFile: Number(u.max_file) || 0 },
      files: (files || []).map(f => ({ id: f.id, name: f.name, mime: f.mime || "", size: Number(f.size) || 0, createdAt: f.created_at }))
    };
  }
  async function nxUploadMany(files) {
    const { usage } = await nxOverview();
    const out = { uploaded: 0, errors: [] };
    for (const file of files.slice(0, 20)) {
      const name = safefile.safeName(file.name, 180);
      try {
        if (file.size === 0) throw new Error("está vacío");
        if (usage.maxFile && file.size > usage.maxFile) throw new Error(`pesa demasiado (máximo ${mb(usage.maxFile)} por archivo)`);
        if (usage.quota && usage.used + file.size > usage.quota) throw new Error(`no cabe (te quedan ${mb(Math.max(0, usage.quota - usage.used))})`);
        const id = uuid(), uid = cloud.userId(), mime = file.type || mimeOf(name);
        await cloud.rest("POST", "/rest/v1/nx_files", { headers: { Prefer: "return=minimal" }, body: { id, user_id: uid, name, mime } });
        try {
          const res = await cloud.raw("POST", `/storage/v1/object/${BUCKET}/${uid}/${id}`, {
            body: file, timeout: 300000,
            headers: { "Content-Type": mime, "x-upsert": "false", "Cache-Control": "max-age=3600" }
          });
          if (!res.ok) throw await storageError(res);
        } catch (e) {
          await cloud.rest("DELETE", `/rest/v1/nx_files?id=eq.${id}`, { headers: { Prefer: "return=minimal" } }).catch(() => {});
          throw e;
        }
        usage.used += file.size;
        out.uploaded++;
      } catch (e) { out.errors.push(`${name}: ${e.message}`); }
    }
    return out;
  }
  async function nxDownload(id, name) {
    if (!cloud.UUID.test(String(id))) throw new Error("Archivo no válido.");
    const rel = `nx/${id}/${safefile.safeName(name, 180)}`;
    try { if ((await Fs().stat({ path: rel, directory: CACHE() })).size > 0) return rel; } catch { /* aún no está */ }
    const res = await cloud.raw("GET", `/storage/v1/object/authenticated/${BUCKET}/${cloud.userId()}/${id}`, { timeout: 300000 });
    if (!res.ok) throw res.status === 404 ? new Error("El archivo ya no existe en el servidor.") : await storageError(res);
    await Fs().writeFile({ path: rel, data: await blobToBase64(await res.blob()), directory: CACHE(), recursive: true });
    return rel;
  }

  // ------------------------------------------------------------------ comprobación de versión nueva (APK en GitHub)
  let updStatus = { state: "idle", version: "", message: "", percent: 0 };
  const setUpd = p => { updStatus = { ...updStatus, ...p }; emit("update:status", updStatus); };
  const newer = (a, b) => { const x = String(a).replace(/^v/, "").split(".").map(Number), y = String(b).replace(/^v/, "").split(".").map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
  async function checkUpdate() {
    setUpd({ state: "checking", message: "Buscando actualizaciones…" });
    try {
      const res = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rel = await res.json();
      const tag = String(rel.tag_name || "");
      if (tag && newer(tag, VERSION)) setUpd({ state: "available", version: tag.replace(/^v/, ""), message: `Hay una versión nueva (${tag.replace(/^v/, "")}). Descarga el APK desde la página de versiones e instálalo encima: se conservan tus datos.` });
      else setUpd({ state: "uptodate", message: `Estás al día (v${VERSION}).` });
    } catch (e) { setUpd({ state: "error", message: `No se pudo comprobar: ${String(e.message || "error").slice(0, 120)}` }); }
    return updStatus;
  }

  // ------------------------------------------------------------------ manejadores (equivalentes a los ipcMain.handle de main.js)
  const H = {};
  const handle = (name, fn) => { H[name] = fn; };

  handle("win:minimize", () => { try { NX.App.minimizeApp(); } catch { /* sin efecto */ } });
  handle("win:toggleMaximize", () => true);
  handle("win:close", () => { try { NX.App.minimizeApp(); } catch { /* sin efecto */ } });
  handle("win:isMaximized", () => true);
  handle("sound:play", force => { playSound(!!force); });

  handle("accounts:list", () => accounts.map(publicAccount));
  handle("accounts:add", async ({ name, url, username, password }) => {
    const { normalizeUrl } = moodleMod();
    name = String(name || "").trim(); username = String(username || "").trim();
    if (!name || !username || !password) throw new Error("Rellena todos los campos.");
    const base = normalizeUrl(url);
    const client = newClient(base);
    await client.login(username, password); // valida las credenciales antes de guardar
    const list = accounts.slice();
    const dup = list.find(a => siteKey(a.url) === siteKey(base) && String(a.username).toLowerCase() === username.toLowerCase());
    if (dup) {
      if (!dup.needsPassword) throw new Error("Esa cuenta ya está añadida.");
      dup.pw = await vault.encrypt(password); delete dup.needsPassword;
      saveAccounts(list); sessions.set(dup.id, client); bgBlocked.delete(dup.id);
      return publicAccount(dup);
    }
    const acc = { id: uuid(), name, url: base, username, pw: await vault.encrypt(password) };
    saveAccounts([...list, acc]);
    sessions.set(acc.id, client);
    sync.touch("accounts");
    return publicAccount(acc);
  });
  handle("accounts:setPassword", async (id, password) => {
    password = String(password || "");
    if (!password) throw new Error("Escribe la contraseña.");
    const list = accounts.slice();
    const acc = list.find(a => a.id === id);
    if (!acc) throw new Error("La cuenta ya no existe.");
    const client = newClient(acc.url);
    await client.login(acc.username, password);
    acc.pw = await vault.encrypt(password); delete acc.needsPassword;
    saveAccounts(list); sessions.set(acc.id, client); bgBlocked.delete(id);
    return publicAccount(acc);
  });
  handle("accounts:remove", id => {
    saveAccounts(accounts.filter(a => a.id !== id));
    dropAccountFiles(id);
    sync.touch("accounts");
    return true;
  });
  handle("accounts:setIcon", (id, icon) => {
    const icon2 = cleanIcon(icon);
    const list = accounts.slice();
    const acc = list.find(a => a.id === id);
    if (!acc) throw new Error("La cuenta ya no existe.");
    if (icon2) acc.icon = icon2; else delete acc.icon;
    saveAccounts(list);
    sync.touch("accounts");
    return publicAccount(acc);
  });

  handle("settings:get", () => ({ settings: settings.get(), ai: AI_LIST.map(({ id, name, url }) => ({ id, name, host: new URL(url).host })) }));
  handle("settings:set", patch => {
    settings.set(patch);
    if (patch && ("bgSync" in patch || "syncMinutes" in patch)) scheduleBackground();
    if (patch && sync.PREF_KEYS.some(k => k in patch)) sync.touch("prefs");
    return { settings: settings.get(), warn: "" };
  });
  // En el móvil no hay «overlay»: este botón abre tu IA (o Google) en el navegador integrado.
  handle("app:overlay", async () => {
    const ai = aiById(settings.get().ai);
    await NX.Browser.open({ url: ai ? ai.url : "https://www.google.com/" });
    return true;
  });
  handle("sync:look", (look, changed) => { sync.reportLook(look, !!changed); return true; });
  handle("sync:now", async () => { await sync.run(); return sync.getInfo(); });
  handle("sync:info", () => sync.getInfo());

  handle("cloud:status", () => cloud.status());
  handle("cloud:signUp", async (email, pw) => { const r = await cloud.signUp(email, pw); if (!r.needsConfirmation) afterCloudLogin(); return r; });
  handle("cloud:signIn", async (email, pw) => { await cloud.signIn(email, pw); afterCloudLogin(); return true; });
  handle("cloud:oauth", async provider => { await cloud.signInOAuth(provider); afterCloudLogin(); return true; });
  handle("cloud:oauthCancel", () => { cloud.cancelOAuth(); return true; });
  handle("cloud:signOut", async () => { try { await cloud.goOffline(); } catch { /* da igual */ } await cloud.signOut(); sync.forget(); knownIncoming = null; sendFriendBadge(0); return true; });
  handle("cloud:createProfile", async p => { await cloud.createProfile(p || {}); setTimeout(linkAllAccounts, 500); sync.schedule(800); return cloud.status(); });
  handle("cloud:updateProfile", async patch => {
    await cloud.updateProfile(patch || {});
    if (patch && patch.discoverable === true) setTimeout(linkAllAccounts, 300);
    if (patch && patch.show_online === true) setTimeout(beat, 300);
    return cloud.status();
  });
  handle("cloud:deleteAccount", async () => {
    try { for (const f of (await nxOverview()).files) { try { await H["nx:delete"](f.id); } catch { /* se sigue */ } } } catch { /* huérfanos en el servidor */ }
    await cloud.deleteAccount(); sync.forget(); knownIncoming = null; sendFriendBadge(0); return true;
  });
  handle("cloud:lookup", async (accountId, ids) => {
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) throw new Error("Cuenta no encontrada.");
    const list = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isSafeInteger);
    const out = {};
    for (let i = 0; i < list.length; i += 500) {
      const rows = await cloud.rpc("find_moodle_users", { p_site: siteKey(acc.url), p_ids: list.slice(i, i + 500) });
      for (const r of rows || []) out[r.moodle_user_id] = { user_id: r.user_id, username: r.username, display_name: r.display_name };
    }
    return out;
  });
  handle("participants", (accountId, courseId) => withClient(accountId, c => c.participants(Number(courseId))));

  handle("friends:list", async () => (await cloud.rpc("list_friends")) || []);
  handle("friends:find", async username => {
    const name = String(username || "").trim().toLowerCase().replace(/^@/, "");
    if (!/^[a-z0-9_]{3,20}$/.test(name)) throw new Error("Escribe un nombre de usuario válido (letras, números y _).");
    const rows = await cloud.rpc("find_user", { p_username: name });
    return (rows && rows[0]) || null;
  });
  handle("friends:request", async userId => {
    if (!cloud.UUID.test(String(userId))) throw new Error("Usuario no válido.");
    const r = await cloud.rpc("send_friend_request", { p_user: userId });
    setTimeout(pollFriends, 500);
    return r;
  });
  handle("friends:respond", async (id, accept) => { await cloud.rpc("respond_friend_request", { p_id: Number(id), p_accept: !!accept }); setTimeout(pollFriends, 300); return true; });
  handle("friends:remove", async id => { await cloud.removeFriendship(id); setTimeout(pollFriends, 300); return true; });
  handle("chat:list", async userId => {
    if (!cloud.UUID.test(String(userId))) throw new Error("Usuario no válido.");
    const me = cloud.userId();
    if (!me) throw new Error("Inicia sesión en NotXunta.");
    return (await cloud.rest("GET", `/rest/v1/direct_messages?or=(and(sender_id.eq.${me},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${me}))&select=id,sender_id,recipient_id,body,created_at,read_at&order=created_at.asc&limit=200`)) || [];
  });
  handle("chat:send", async (userId, body) => {
    if (!cloud.UUID.test(String(userId))) throw new Error("Usuario no válido.");
    body = String(body || "").trim();
    if (!body || body.length > 2000) throw new Error("El mensaje debe tener entre 1 y 2000 caracteres.");
    const me = cloud.userId(); if (!me) throw new Error("Inicia sesión en NotXunta.");
    const rows = await cloud.rest("POST", "/rest/v1/direct_messages", { body: { sender_id: me, recipient_id: userId, body }, headers: { Prefer: "return=representation" } });
    return rows && rows[0];
  });
  handle("chat:read", async userId => {
    if (!cloud.UUID.test(String(userId))) throw new Error("Usuario no válido.");
    const me = cloud.userId(); if (!me) throw new Error("Inicia sesión en NotXunta.");
    await cloud.rest("PATCH", `/rest/v1/direct_messages?sender_id=eq.${userId}&recipient_id=eq.${me}&read_at=is.null`, { body: { read_at: new Date().toISOString() }, headers: { Prefer: "return=minimal" } });
    setTimeout(pollNxMessages, 300);
    return true;
  });

  handle("update:status", () => updStatus);
  handle("update:check", () => checkUpdate());
  handle("update:install", () => { NX.Browser.open({ url: RELEASES_URL }); return false; });
  handle("update:openReleases", () => { NX.Browser.open({ url: RELEASES_URL }); return true; });
  handle("app:changelog", () => ({ versions: CHANGELOG, current: VERSION, seen: settings.get().lastSeenVersion }));
  handle("app:changelogSeen", () => { settings.set({ lastSeenVersion: VERSION }); return true; });
  handle("app:platform", () => ({ platform: "android", secure: true }));
  handle("app:relaunch", () => { setTimeout(() => location.reload(), 150); return true; });

  // El vídeo de fondo no se admite en Android (archivos enormes y decodificación variable según el móvil).
  handle("media:pickVideo", () => { throw new Error("El vídeo de fondo no está disponible en Android. Usa una imagen o uno de los fondos animados."); });
  handle("media:url", () => "");
  handle("media:clearVideo", () => true);

  handle("instance:open", id => doSync(id));
  handle("instance:sync", id => doSync(id));
  handle("instance:close", id => { sessions.delete(id); return true; });
  handle("instance:markSeen", async (id, keys) => {
    const c = await kv.get("cache-" + id);
    if (!c) return true;
    const drop = new Set(keys);
    c.unseen = c.unseen.filter(k => !drop.has(k));
    await kv.set("cache-" + id, c);
    return true;
  });

  const imageCache = new Map();
  handle("instance:image", async (id, url) => {
    const key = `${id}|${url}`;
    if (imageCache.has(key)) return imageCache.get(key);
    const data = await withClient(id, async c => {
      const r = await NX.CapacitorHttp.request({ url: c.withToken(url), method: "GET", responseType: "blob", connectTimeout: 20000, readTimeout: 30000 });
      const hdrs = r.headers || {};
      const type = String(hdrs["Content-Type"] || hdrs["content-type"] || "").split(";")[0].trim().toLowerCase();
      if (r.status >= 400 || !/^image\/(png|jpeg|jpg|gif|webp|bmp|avif)$/.test(type)) throw new Error("Imagen no disponible."); // sin SVG
      if (String(r.data || "").length * 0.75 > 8 * 1024 * 1024) throw new Error("Imagen demasiado grande.");
      return `data:${type};base64,${r.data}`;
    });
    if (imageCache.size >= 150) imageCache.delete(imageCache.keys().next().value);
    imageCache.set(key, data);
    return data;
  });

  handle("instance:openFile", async (id, url, filename, version) => openLocal(await ensureDoc(id, url, filename, version), safefile.safeName(filename)));
  // En el móvil no se precargan apuntes (gasta datos): se descargan al pulsarlos.
  handle("instance:prefetch", () => true);

  handle("nx:list", () => nxOverview());
  handle("nx:upload", async () => {
    const files = await pickFiles({ multiple: true });
    if (!files.length) return { uploaded: 0, errors: [], canceled: true };
    return nxUploadMany(files);
  });
  handle("nx:open", async (id, name) => openLocal(await nxDownload(id, name), safefile.safeName(name, 180)));
  handle("nx:save", async (id, name) => {
    const rel = await nxDownload(id, name);
    const { uri } = await Fs().getUri({ path: rel, directory: CACHE() });
    await NX.Share.share({ title: name, url: uri, dialogTitle: "Guardar o compartir" });
    return true;
  });
  handle("nx:delete", async id => {
    if (!cloud.UUID.test(String(id))) throw new Error("Archivo no válido.");
    const res = await cloud.raw("DELETE", `/storage/v1/object/${BUCKET}/${cloud.userId()}/${id}`);
    if (!res.ok && res.status !== 404) throw await storageError(res);
    await cloud.rest("DELETE", `/rest/v1/nx_files?id=eq.${id}`, { headers: { Prefer: "return=minimal" } });
    Fs().rmdir({ path: `nx/${id}`, directory: CACHE(), recursive: true }).catch(() => {});
    return true;
  });

  handle("instance:openExternal", async url => {
    if (typeof url !== "string" || url.length > 2048) throw new Error("Enlace no permitido.");
    let u;
    try { u = new URL(url); } catch { throw new Error("Enlace no permitido."); }
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Enlace no permitido.");
    if (u.username || u.password) throw new Error("Enlace no permitido (lleva usuario y contraseña incrustados).");
    await NX.Browser.open({ url: u.toString() });
    return true;
  });

  handle("api:calendar", id => withClient(id, async c => {
    const r = await c.calendar();
    return (r.events || []).map(ev => ({
      id: ev.id, name: ev.name, time: ev.timesort, url: ev.url || "",
      course: (ev.course && ev.course.fullname) || "", type: ev.modulename || ""
    }));
  }));
  handle("api:grades", (id, courseId, userId) => withClient(id, async c => {
    const r = await c.grades(courseId, userId);
    const g = (r.usergrades && r.usergrades[0]) || { gradeitems: [] };
    return g.gradeitems.map(i => ({
      name: i.itemname || (i.itemtype === "course" ? "Total del curso" : ""),
      grade: i.gradeformatted || "-", range: i.rangeformatted || "", pct: i.percentageformatted || "",
      feedback: plain(i.feedback)
    }));
  }));
  handle("api:conversations", (id, userId) => withClient(id, async c => mapConversations(await c.conversations(userId), userId, await msgState(id))));
  handle("api:markRead", (id, userId, convId, time) => withClient(id, async c => {
    const st = await msgState(id), t = Number(time) || 0;
    if (t > (st.seen[convId] || 0)) { st.seen[convId] = t; saveMsgState(id); }
    await c.markConversationRead(userId, convId).catch(() => { /* queda la marca local */ });
    return true;
  }));
  handle("api:thread", (id, userId, convId) => withClient(id, async c => {
    const r = await c.thread(userId, convId);
    return (r.messages || []).map(m => ({ id: m.id, from: m.useridfrom, text: plain(m.text), time: m.timecreated })).sort((a, b) => a.time - b.time);
  }));
  handle("api:send", (id, { toUserId, convId, text }) => withClient(id, async c => {
    text = String(text || "").trim();
    if (!text) throw new Error("Escribe un mensaje.");
    if (convId) await c.sendToConversation(convId, text);
    else await c.sendMessage(toUserId, text);
    return true;
  }));
  handle("api:notifications", (id, userId) => withClient(id, async c => {
    const r = await c.notifications(userId);
    return (r.notifications || []).map(n => ({
      id: n.id, subject: n.subject || "", text: plain(n.smallmessage || n.fullmessage),
      time: n.timecreated, read: !!n.read, url: n.contexturl || ""
    }));
  }));

  // ------------------------------------------------------------------ arranque
  const ready = (async () => {
    fsMem = (await kv.get("fs-all")) || {};
    accounts = (await kv.get("accounts")) || [];
    await cloud.init();
    booted = true;
    scheduleBackground(20000);
    scheduleMessages(8000);
    scheduleFriends();
    schedulePresence();
    scheduleNxMessages();
    if (cloud.isSignedIn()) { sync.schedule(4000); setTimeout(linkAllAccounts, 12000); }
    if (IS_NATIVE) purgeOldDocs();
    if (settings.get().autoUpdate) setTimeout(() => checkUpdate().catch(() => {}), 6000);
  })().catch(e => { console.error("Arranque del puente:", e); });

  document.addEventListener("visibilitychange", () => {
    if (!booted) return;
    if (!document.hidden) { pollMessages(); pollNxMessages(); beat(); }
    else if (cloud.isSignedIn()) { cloud.goOffline().catch(() => {}); }
  });

  // ------------------------------------------------------------------ objeto que ve la interfaz (mismo contrato que preload.js)
  const call = name => async (...args) => {
    await ready;
    try { return { ok: true, data: await H[name](...args) }; }
    catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
  };
  const sub = ev => cb => on(ev, cb);

  window.notxuntaClient = {
    version: VERSION,
    platform: "android",
    listAccounts: call("accounts:list"),
    addAccount: call("accounts:add"),
    removeAccount: call("accounts:remove"),
    setAccountIcon: call("accounts:setIcon"),
    setAccountPassword: call("accounts:setPassword"),
    getSettings: call("settings:get"),
    setSettings: call("settings:set"),
    openOverlay: call("app:overlay"),
    playSound: force => call("sound:play")(!!force),
    winMinimize: call("win:minimize"),
    winToggleMaximize: call("win:toggleMaximize"),
    winClose: call("win:close"),
    winIsMaximized: call("win:isMaximized"),
    onWinState: () => () => {},
    pickVideo: call("media:pickVideo"),
    videoUrl: call("media:url"),
    clearVideo: call("media:clearVideo"),
    setZoom: () => {}, // el tamaño de la interfaz lo gestiona Android (tamaño de fuente del sistema)
    openInstance: call("instance:open"),
    sync: call("instance:sync"),
    closeInstance: call("instance:close"),
    markSeen: call("instance:markSeen"),
    image: call("instance:image"),
    openFile: call("instance:openFile"),
    prefetchFiles: call("instance:prefetch"),
    relaunch: call("app:relaunch"),
    cloudStatus: call("cloud:status"),
    cloudSignUp: call("cloud:signUp"),
    cloudSignIn: call("cloud:signIn"),
    cloudOAuth: call("cloud:oauth"),
    cloudOAuthCancel: call("cloud:oauthCancel"),
    cloudSignOut: call("cloud:signOut"),
    cloudCreateProfile: call("cloud:createProfile"),
    cloudUpdateProfile: call("cloud:updateProfile"),
    cloudDeleteAccount: call("cloud:deleteAccount"),
    cloudLookup: call("cloud:lookup"),
    participants: call("participants"),
    friendsList: call("friends:list"),
    friendFind: call("friends:find"),
    friendRequest: call("friends:request"),
    friendRespond: call("friends:respond"),
    friendRemove: call("friends:remove"),
    chatList: call("chat:list"),
    chatSend: call("chat:send"),
    chatRead: call("chat:read"),
    syncLook: (look, changed) => call("sync:look")(look, !!changed),
    syncNow: call("sync:now"),
    syncInfo: call("sync:info"),
    onSyncApplied: sub("sync:applied"),
    onCloudBadge: sub("cloud:badge"),
    nxList: call("nx:list"),
    nxUpload: call("nx:upload"),
    nxOpen: call("nx:open"),
    nxSave: call("nx:save"),
    nxDelete: call("nx:delete"),
    updateStatus: call("update:status"),
    updateCheck: call("update:check"),
    updateInstall: call("update:install"),
    updateOpenReleases: call("update:openReleases"),
    changelog: call("app:changelog"),
    changelogSeen: call("app:changelogSeen"),
    platformInfo: call("app:platform"),
    onUpdate: sub("update:status"),
    openExternal: call("instance:openExternal"),
    calendar: call("api:calendar"),
    grades: call("api:grades"),
    conversations: call("api:conversations"),
    thread: call("api:thread"),
    send: call("api:send"),
    markRead: call("api:markRead"),
    notifications: call("api:notifications"),
    onMessages: sub("msg:update"),
    onNxMessages: sub("nx:update"),
    onNavigate: sub("app:navigate"),
    onProgress: sub("sync-progress")
  };
  window.__nxBridge = { H, emit, ready }; // para depuración y pruebas

  // ------------------------------------------------------------------ interfaz móvil: menú lateral, botón «atrás»
  function initMobileUi() {
    document.documentElement.classList.add("nx-mobile");
    const scrim = document.createElement("div");
    scrim.id = "nx-scrim";
    // Dentro de .app-body (que crea su propio contexto de apilado): así el menú (z-index 60) queda POR ENCIMA del fondo oscuro (55).
    (document.querySelector(".app-body") || document.body).append(scrim);
    const setOpen = open => document.body.classList.toggle("nx-nav-open", !!open);
    scrim.addEventListener("click", () => setOpen(false));
    document.querySelectorAll(".topbar").forEach(bar => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "nx-menu-btn"; b.setAttribute("aria-label", "Menú"); b.textContent = "☰";
      b.addEventListener("click", () => setOpen(!document.body.classList.contains("nx-nav-open")));
      bar.prepend(b);
    });
    document.addEventListener("click", e => { if (e.target.closest(".sidebar .nav")) setOpen(false); });

    // Botón «atrás» de Android: cierra menú → diálogo → sube un nivel dentro de la vista → vuelve a las cuentas → minimiza.
    if (NX.App && NX.App.addListener) {
      NX.App.addListener("backButton", () => {
        if (document.body.classList.contains("nx-nav-open")) { setOpen(false); return; }
        const dlg = [...document.querySelectorAll("dialog")].find(d => d.open);
        if (dlg) { dlg.close(); return; }
        const inView = [...document.querySelectorAll(".app-shell:not([hidden]) .view.active button")]
          .find(b => /^\s*(←|‹|volver)/i.test(b.textContent) && b.offsetParent !== null);
        if (inView) { inView.click(); return; }
        const inst = document.getElementById("instance-shell");
        if (inst && !inst.hidden) { const back = document.getElementById("back-launcher"); if (back) { back.click(); return; } }
        const accountsNav = document.querySelector('#launcher-shell .nav[data-view="accounts"]');
        if (accountsNav && !accountsNav.classList.contains("active")) { accountsNav.click(); return; }
        NX.App.minimizeApp();
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initMobileUi);
  else initMobileUi();
})();
