"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");
const { aiById } = require("./ai");

const DEFAULTS = {
  ai: null,               // IA elegida para el overlay (id) o null
  aiAsked: false,         // ya se mostró el selector de la primera vez
  overlayKey: "focus",    // focus | global-safe | global-shift-tab
  keepBackground: true,   // al cerrar la ventana, seguir en la bandeja
  launchAtStartup: false, // iniciar sesión al arrancar el sistema
  bgSync: true,           // buscar novedades en segundo plano
  syncMinutes: 5,         // cada cuántos minutos se buscan novedades en las aulas (0.7.2: antes 15)
  freqV2: false,          // marca interna: la frecuencia por defecto subió de 15 a 5 min en la 0.7.2 (se aplica una sola vez)
  toasts: true,           // avisos estilo Steam
  notifySound: true,      // sonido en todas las notificaciones
  notifyVolume: 35,       // volumen del sonido de notificación (0–100)
  legalAccepted: "",      // fecha (ISO) en que se aceptaron la política de privacidad y los términos; vacío = no aceptados
  accountPrompted: false, // ya se mostró el popup de inicio «Crea tu cuenta Better AV»
  wordFilter: true,       // 0.8.5: tapa con asteriscos insultos y tacos fuertes en mensajes y perfiles de Better AV
  tourDone: false,        // 0.8.5: visita guiada del lanzador ya vista
  tourInstanceDone: false,// 0.8.5: visita guiada dentro de un aula ya vista
  tutorialDone: false,    // el tutorial de la primera vez ya se vio (o se saltó) en este dispositivo
  msgNotify: true,        // avisar de mensajes nuevos (se comprueba cada minuto)
  autoUpdate: true,       // buscar e instalar actualizaciones automáticamente
  lastSeenVersion: "",   // última versión cuyo tablón de novedades ya se abrió
  videoCompat: false      // modo compatible del vídeo de fondo (sin decodificación por hardware; requiere reiniciar)
};
const OVERLAY_KEYS = ["focus", "global-safe", "global-shift-tab"];
const SYNC_CHOICES = [2, 5, 10, 15, 30, 60];

const file = () => path.join(app.getPath("userData"), "settings.json");
let cache = null;

function load() {
  if (cache) return cache;
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(file(), "utf8")); } catch { /* primera vez */ }
  // 0.7.2: quien seguía con los 15 minutos de antes pasa a los 5 nuevos (una sola vez; si luego elige otro valor, se respeta)
  if (!raw.freqV2) { if (raw.syncMinutes === undefined || Number(raw.syncMinutes) === 15) raw.syncMinutes = DEFAULTS.syncMinutes; raw.freqV2 = true; }
  cache = sanitize({ ...DEFAULTS, ...raw });
  return cache;
}

function sanitize(s) {
  return {
    ai: aiById(s.ai) ? s.ai : null,
    aiAsked: !!s.aiAsked,
    overlayKey: OVERLAY_KEYS.includes(s.overlayKey) ? s.overlayKey : DEFAULTS.overlayKey,
    keepBackground: !!s.keepBackground,
    launchAtStartup: !!s.launchAtStartup,
    bgSync: !!s.bgSync,
    syncMinutes: SYNC_CHOICES.includes(Number(s.syncMinutes)) ? Number(s.syncMinutes) : DEFAULTS.syncMinutes,
    toasts: !!s.toasts,
    notifySound: s.notifySound !== false,
    notifyVolume: Number.isFinite(Number(s.notifyVolume)) ? Math.min(100, Math.max(0, Math.round(Number(s.notifyVolume)))) : DEFAULTS.notifyVolume,
    legalAccepted: typeof s.legalAccepted === "string" && !Number.isNaN(Date.parse(s.legalAccepted)) ? s.legalAccepted.slice(0, 40) : "",
    accountPrompted: !!s.accountPrompted,
    tutorialDone: !!s.tutorialDone,
    wordFilter: s.wordFilter !== false,
    tourDone: !!s.tourDone,
    tourInstanceDone: !!s.tourInstanceDone,
    freqV2: true,
    msgNotify: !!s.msgNotify,
    autoUpdate: s.autoUpdate !== false,
    videoCompat: !!s.videoCompat,
    lastSeenVersion: typeof s.lastSeenVersion === "string" ? s.lastSeenVersion.slice(0, 20) : ""
  };
}

function save() {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    const tmp = file() + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(cache));
    fs.renameSync(tmp, file());
  } catch { /* si no se puede guardar, se mantiene en memoria */ }
}

function get() { return { ...load() }; }

function set(patch) {
  const next = { ...load() };
  for (const k of Object.keys(DEFAULTS)) if (k in (patch || {})) next[k] = patch[k];
  cache = sanitize(next);
  save();
  return get();
}

module.exports = { get, set, DEFAULTS };
