"use strict";
const audio = new Audio("../assets/notification.mp3");
audio.preload = "auto";
window.soundApi.onPlay(() => {
  try { audio.currentTime = 0; audio.play().catch(() => {}); } catch { /* sin audio */ }
});
