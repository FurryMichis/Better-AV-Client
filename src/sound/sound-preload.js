const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("soundApi", {
  onPlay: cb => ipcRenderer.on("sound:play", (_e, v) => cb(v))
});
