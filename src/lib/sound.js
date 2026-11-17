"use strict";
// Sonido de notificación (assets/notification.mp3). Lo reproduce una ventana oculta, así suena aunque la ventana principal
// esté cerrada (app en la bandeja) y con cualquier tipo de aviso: emergente estilo Steam, notificación del sistema o aviso dentro de la app.
const { BrowserWindow } = require("electron");
const path = require("node:path");

let win = null, ready = false, pending = false, last = 0, isEnabled = () => true;

function ensure() {
  if (win && !win.isDestroyed()) return win;
  ready = false;
  win = new BrowserWindow({
    show: false, width: 1, height: 1, skipTaskbar: true, focusable: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "sound", "sound-preload.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false, autoplayPolicy: "no-user-gesture-required"
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", e => e.preventDefault());
  win.webContents.once("did-finish-load", () => {
    ready = true;
    if (pending) { pending = false; win.webContents.send("sound:play"); }
  });
  win.on("closed", () => { win = null; ready = false; });
  win.loadFile(path.join(__dirname, "..", "sound", "sound.html"));
  return win;
}

function init(enabledFn) { isEnabled = enabledFn; ensure(); } // se crea al arrancar para que el primer aviso suene al instante

// force = true ignora el ajuste (botón «Probar sonido»)
function play(force = false) {
  if (!force && !isEnabled()) return;
  const now = Date.now();
  if (now - last < 450) return; // varios avisos seguidos suenan una sola vez
  last = now;
  const w = ensure();
  if (ready) w.webContents.send("sound:play"); else pending = true;
}

function destroy() { if (win && !win.isDestroyed()) win.destroy(); }

module.exports = { init, play, destroy };
