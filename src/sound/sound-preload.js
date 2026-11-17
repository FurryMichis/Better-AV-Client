const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("soundApi", {
  onPlay: cb => ipcRenderer.on("sound:play", () => cb())
});
