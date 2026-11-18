"use strict";
const audio = new Audio("../assets/notification.mp3");
audio.preload = "auto";
window.soundApi.onPlay(vol => {
  try {
    audio.volume = Math.min(1, Math.max(0, Number(vol)));
    audio.currentTime = 0; audio.play().catch(() => {});
  } catch { /* sin audio */ }
});
