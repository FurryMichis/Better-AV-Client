"use strict";
// Versión Android de src/lib/cloud.js: misma API (la usa src/lib/sync.js tal cual), pero:
//  · la sesión se guarda cifrada con la bóveda de la app (WebCrypto) en IndexedDB,
//  · el inicio de sesión con Google/Discord/GitHub vuelve a la app mediante un enlace profundo (com.notxunta.client://auth-callback).

const config = require("./cloud-config");
const kv = window.__nxKV;
const vault = window.__nxVault;
const CAP = () => window.NXCap;

const PROVIDERS = ["google", "discord", "github"];
const REDIRECT = "com.notxunta.client://auth-callback";   // añádelo a las Redirect URLs de Supabase
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let session = null;        // { access_token, refresh_token, expires_at, user: { id, email } }
let profile;               // undefined = sin cargar · null = sin perfil · objeto = perfil
const linked = new Set();

const configured = () => /^https:\/\/.+/i.test(config.url || "") && !!config.anonKey;
const base = () => config.url.replace(/\/+$/, "");

// ------------------------------------------------------------------ sesión
async function init() {
  try {
    const enc = await kv.get("cloud-session");
    if (enc) session = JSON.parse(await vault.decrypt(enc));
  } catch { session = null; }
}
function saveSession() {
  (async () => {
    try {
      if (!session) await kv.del("cloud-session");
      else await kv.set("cloud-session", await vault.encrypt(JSON.stringify(session)));
    } catch { /* la sesión queda solo en memoria */ }
  })();
}
function setSession(r) {
  if (!r || !r.access_token || !r.user) throw new Error("Respuesta de inicio de sesión no válida.");
  session = {
    access_token: r.access_token, refresh_token: r.refresh_token,
    expires_at: r.expires_at || Math.floor(Date.now() / 1000) + (r.expires_in || 3600),
    user: { id: r.user.id, email: r.user.email || "" }
  };
  profile = undefined; linked.clear();
  saveSession();
}
function clearSession() { session = null; profile = undefined; linked.clear(); saveSession(); }

// ------------------------------------------------------------------ errores legibles
function cloudError(status, data) {
  const code = data && (data.error_code || data.code);
  const msg = data && (data.msg || data.message || data.error_description || data.error) || "";
  const map = {
    invalid_credentials: "Correo o contraseña incorrectos.",
    email_not_confirmed: "Confirma tu correo (te hemos enviado un enlace) antes de entrar.",
    user_already_exists: "Ya existe una cuenta con ese correo.",
    email_exists: "Ya existe una cuenta con ese correo.",
    weak_password: "La contraseña es demasiado débil (mínimo 8 caracteres).",
    over_email_send_rate_limit: "Se han enviado demasiados correos. Espera un poco e inténtalo de nuevo.",
    over_request_rate_limit: "Demasiados intentos. Espera un poco e inténtalo de nuevo.",
    signup_disabled: "El registro está desactivado en el servidor.",
    validation_failed: "Revisa el correo y la contraseña.",
    "23505": "Ese nombre de usuario ya está en uso.",
    "23514": "El nombre de usuario solo puede tener letras minúsculas, números y _ (3 a 20 caracteres)."
  };
  if (map[code]) return new Error(map[code]);
  if ((code === "42P01" || code === "PGRST205" || /direct_messages/i.test(msg)) && /direct_messages/i.test(msg))
    return new Error("Falta activar la mensajería: ejecuta supabase/migration-0.6.6.sql en el SQL Editor.");
  if (code === "42703" || code === "PGRST204" || code === "42P01" || code === "PGRST205" || /does not exist|schema cache/i.test(msg))
    return new Error("Falta actualizar la base de datos de Supabase: ejecuta supabase/migration-0.6.1.sql en el SQL Editor (y migration-0.5.6.sql si todavía no lo hiciste).");
  if (/provider is not enabled|Unsupported provider/i.test(msg)) return new Error("Ese método de inicio de sesión no está activado en el servidor.");
  return new Error(msg ? String(msg).slice(0, 200) : `Error del servidor (${status}).`);
}

// ------------------------------------------------------------------ peticiones
const timeoutSignal = ms => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };

async function request(method, urlPath, { body, headers, auth = true, retry = true } = {}) {
  if (!configured()) throw new Error("El servidor de cuentas todavía no está configurado en esta versión de la app.");
  if (auth && session && Date.now() / 1000 > session.expires_at - 60) await refresh();
  if (auth && !session) throw new Error("Inicia sesión en tu cuenta NotXunta.");
  let res;
  try {
    res = await fetch(base() + urlPath, {
      method,
      headers: {
        apikey: config.anonKey,
        ...(auth ? { Authorization: `Bearer ${session.access_token}` } : /^eyJ/.test(config.anonKey) ? { Authorization: `Bearer ${config.anonKey}` } : {}),
        "Content-Type": "application/json",
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: timeoutSignal(20000)
    });
  } catch { throw new Error("No se pudo conectar con el servidor de cuentas. Revisa tu conexión."); }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* sin cuerpo JSON */ }
  if (res.status === 401 && auth && retry && session) { await refresh(); return request(method, urlPath, { body, headers, auth, retry: false }); }
  if (!res.ok) throw cloudError(res.status, data);
  return data;
}

// Petición sin JSON (Storage: subir y bajar archivos). Devuelve el Response; quien llama revisa res.ok.
async function raw(method, urlPath, { body, headers, retry = true, timeout = 120000 } = {}) {
  if (!configured()) throw new Error("El servidor de cuentas todavía no está configurado en esta versión de la app.");
  if (session && Date.now() / 1000 > session.expires_at - 60) await refresh();
  if (!session) throw new Error("Inicia sesión en tu cuenta NotXunta.");
  let res;
  try {
    res = await fetch(base() + urlPath, {
      method, body,
      headers: { apikey: config.anonKey, Authorization: `Bearer ${session.access_token}`, ...headers },
      signal: timeoutSignal(timeout)
    });
  } catch { throw new Error("No se pudo conectar con el servidor de cuentas. Revisa tu conexión."); }
  if (res.status === 401 && retry && session) { await refresh(); return raw(method, urlPath, { body, headers, retry: false, timeout }); }
  return res;
}

let refreshing = null;
function refresh() {
  if (!session || !session.refresh_token) { clearSession(); return Promise.reject(new Error("La sesión ha caducado. Vuelve a entrar.")); }
  if (!refreshing) {
    refreshing = request("POST", "/auth/v1/token?grant_type=refresh_token", { auth: false, body: { refresh_token: session.refresh_token } })
      .then(setSession)
      .catch(() => { clearSession(); throw new Error("La sesión ha caducado. Vuelve a entrar."); })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

// ------------------------------------------------------------------ registro / entrada
const checkCreds = (email, password) => {
  email = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Escribe un correo válido.");
  if (String(password || "").length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
  return email;
};

async function signUp(email, password) {
  email = checkCreds(email, password);
  const r = await request("POST", "/auth/v1/signup", { auth: false, body: { email, password } });
  if (r && r.access_token) { setSession(r); return { needsConfirmation: false }; }
  return { needsConfirmation: true };
}
async function signIn(email, password) {
  email = checkCreds(email, password);
  setSession(await request("POST", "/auth/v1/token?grant_type=password", { auth: false, body: { email, password } }));
}

// Google / Discord / GitHub: se abre el navegador, y al terminar Android devuelve el control a la app con el código (PKCE).
const PROVIDER_NAMES = { google: "Google", discord: "Discord", github: "GitHub" };
let oauthAbort = null;
function cancelOAuth() { if (oauthAbort) oauthAbort(new Error("Inicio de sesión cancelado.")); }

async function signInOAuth(provider) {
  if (!PROVIDERS.includes(provider)) throw new Error("Método de inicio de sesión no válido.");
  if (!configured()) throw new Error("El servidor de cuentas todavía no está configurado en esta versión de la app.");
  cancelOAuth();
  try {
    const st = await request("GET", "/auth/v1/settings", { auth: false });
    if (st && st.external && st.external[provider] === false)
      throw new Error(`${PROVIDER_NAMES[provider]} no está activado en Supabase (Authentication → Providers → ${PROVIDER_NAMES[provider]}: actívalo y pega su Client ID y Secret).`);
  } catch (e) { if (/no está activado/.test(e.message)) throw e; }
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const cap = CAP();
  if (!cap || !cap.App) throw new Error("El inicio de sesión con proveedores solo funciona en la app de Android.");

  const code = await new Promise((resolve, reject) => {
    let handle = null, finished = false;
    const timer = setTimeout(() => finish(new Error("Se agotó el tiempo para iniciar sesión.")), 180000);
    function finish(err, c) {
      if (finished) return;
      finished = true; clearTimeout(timer); oauthAbort = null;
      if (handle) handle.remove().catch(() => {});
      try { cap.Browser.close().catch(() => {}); } catch { /* Android no lo implementa */ }
      if (err) reject(err); else resolve(c);
    }
    oauthAbort = e => finish(e);
    cap.App.addListener("appUrlOpen", ev => {
      let u;
      try { u = new URL(ev.url); } catch { return; }
      if (!String(ev.url).startsWith(REDIRECT)) return;
      const c = u.searchParams.get("code");
      const err = u.searchParams.get("error_description") || u.searchParams.get("error");
      if (c && /^[\w.~-]{8,512}$/.test(c)) finish(null, c);
      else finish(new Error(err ? String(err).slice(0, 160) : "Inicio de sesión cancelado."));
    }).then(h => { handle = h; if (finished) h.remove().catch(() => {}); });
    const q = new URLSearchParams({ provider, redirect_to: REDIRECT, code_challenge: challenge, code_challenge_method: "s256" });
    cap.Browser.open({ url: `${base()}/auth/v1/authorize?${q}` }).catch(e => finish(e));
  });
  setSession(await request("POST", "/auth/v1/token?grant_type=pkce", { auth: false, body: { auth_code: code, code_verifier: verifier } }));
}

async function signOut() {
  if (session && configured()) { try { await request("POST", "/auth/v1/logout", { retry: false }); } catch { /* da igual */ } }
  clearSession();
}

// ------------------------------------------------------------------ perfil
const cleanName = s => String(s || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40);

let schemaLevel = 2;
async function loadProfile() {
  const b = `/rest/v1/profiles?id=eq.${session.user.id}&select=id,username,display_name,discoverable`;
  const tiers = [[`${b},avatar,show_online`, 2], [`${b},avatar`, 1], [b, 0]];
  let rows, lastErr;
  for (const [url, level] of tiers) {
    try { rows = await request("GET", url); schemaLevel = level; lastErr = null; break; }
    catch (e) { lastErr = e; if (!/Falta actualizar la base de datos/.test(e.message)) throw e; }
  }
  if (lastErr) throw lastErr;
  profile = (rows && rows[0]) || null;
  return profile;
}
async function status() {
  const b = { configured: configured(), signedIn: false, email: "", profile: null };
  if (!b.configured || !session) return b;
  if (profile === undefined) await loadProfile();
  return { ...b, signedIn: true, email: session.user.email, profile, schemaOutdated: schemaLevel < 1, presenceOutdated: schemaLevel < 2, schemaLevel };
}
async function createProfile({ username, display_name, discoverable }) {
  username = String(username || "").trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new Error("El usuario solo puede tener letras minúsculas, números y _ (de 3 a 20 caracteres).");
  const rows = await request("POST", "/rest/v1/profiles", {
    headers: { Prefer: "return=representation" },
    body: { id: session.user.id, username, display_name: cleanName(display_name) || username, discoverable: discoverable !== false }
  });
  profile = (rows && rows[0]) || null;
  return profile;
}
async function updateProfile(patch) {
  if (patch.avatar !== undefined && schemaLevel < 1) throw new Error("Para usar foto de perfil falta ejecutar supabase/migration-0.5.6.sql en Supabase.");
  if (patch.show_online !== undefined && schemaLevel < 2) throw new Error("Para el estado «en línea» falta ejecutar supabase/migration-0.6.1.sql en Supabase.");
  const body = {};
  if (patch.display_name !== undefined) body.display_name = cleanName(patch.display_name);
  if (patch.discoverable !== undefined) body.discoverable = !!patch.discoverable;
  if (patch.show_online !== undefined) body.show_online = !!patch.show_online;
  if (patch.avatar !== undefined) {
    if (patch.avatar === null || patch.avatar === "") body.avatar = null;
    else if (typeof patch.avatar === "string" && patch.avatar.length <= 60000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(patch.avatar)) body.avatar = patch.avatar;
    else throw new Error("La foto no es válida o es demasiado grande.");
  }
  const rows = await request("PATCH", `/rest/v1/profiles?id=eq.${session.user.id}`, { headers: { Prefer: "return=representation" }, body });
  profile = (rows && rows[0]) || profile;
  if (body.discoverable === false) { await unlinkAll(); }
  if (body.show_online === false) { try { await rpc("go_offline"); } catch { /* se ocultará igualmente */ } }
  return profile;
}
async function deleteAccount() {
  await request("POST", "/rest/v1/rpc/delete_my_account", { body: {} });
  clearSession();
}

// ------------------------------------------------------------------ vínculos con aulas y amigos
async function linkMoodle(siteKey, moodleUserId, fullname) {
  if (!session || !profile || !profile.discoverable) return;
  const key = `${session.user.id}|${siteKey}|${moodleUserId}`;
  if (linked.has(key)) return;
  await request("POST", "/rest/v1/moodle_links?on_conflict=site_key,moodle_user_id", {
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: { site_key: siteKey, moodle_user_id: Number(moodleUserId), user_id: session.user.id, fullname: cleanName(fullname) }
  });
  linked.add(key);
}
async function unlinkAll() {
  linked.clear();
  await request("DELETE", `/rest/v1/moodle_links?user_id=eq.${session.user.id}`, { headers: { Prefer: "return=minimal" } });
}
const rpc = (fn, args) => request("POST", `/rest/v1/rpc/${fn}`, { body: args || {} });
const removeFriendship = id => request("DELETE", `/rest/v1/friendships?id=eq.${Number(id)}`, { headers: { Prefer: "return=minimal" } });

// ------------------------------------------------------------------ estado «en línea»
async function heartbeat() {
  if (!session || !profile || schemaLevel < 2 || profile.show_online === false) return false;
  await rpc("heartbeat");
  return true;
}
async function goOffline() {
  if (!session || !profile || schemaLevel < 2) return;
  await rpc("go_offline");
}

module.exports = {
  init, rest: request, raw, heartbeat, goOffline, userId: () => (session ? session.user.id : null),
  configured, status, signUp, signIn, signInOAuth, cancelOAuth, signOut,
  createProfile, updateProfile, deleteAccount, linkMoodle, unlinkAll, rpc, removeFriendship,
  isSignedIn: () => !!session, invalidateProfile: () => { profile = undefined; },
  getProfile: () => profile, UUID
};
