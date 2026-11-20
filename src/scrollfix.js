"use strict";
// Rueda del ratón: se puede desplazar el menú de arriba a abajo estés donde estés con el puntero
// (sobre tareas, tarjetas, listas, textos…). Si el elemento bajo el puntero no puede desplazarse en esa
// dirección, la rueda se pasa al contenedor que sí puede: el diálogo abierto o la zona principal.
(function () {
  const canScroll = (el, dy) => {
    const st = getComputedStyle(el);
    if (!/(auto|scroll)/.test(st.overflowY)) return false;
    if (el.scrollHeight <= el.clientHeight + 1) return false;
    return dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  };
  const visible = el => !!(el && el.getClientRects().length);
  const fallback = target => {
    const dlg = document.querySelector("dialog[open]");
    if (dlg) return dlg.querySelector(".act-wrap, .legal-scroll, .tut-body") || null;
    return [...document.querySelectorAll(".scroller")].find(visible) || null;
  };
  addEventListener("wheel", e => {
    if (e.defaultPrevented || e.ctrlKey || e.deltaY === 0) return;     // Ctrl+rueda = zoom, y sin movimiento vertical no hay nada que hacer
    const dy = e.deltaY;
    let el = e.target instanceof Element ? e.target : null;
    const dlg = document.querySelector("dialog[open]");
    for (; el && el !== document.documentElement; el = el.parentElement) {
      if (dlg && !dlg.contains(el)) break;
      if (el.tagName === "TEXTAREA" && canScroll(el, dy)) return;       // los textos largos se desplazan solos
      if (canScroll(el, dy)) {
        // el navegador ya lo desplaza; solo se interviene si ese elemento bloquea el encadenado (chats)
        return;
      }
    }
    const box = fallback(e.target);
    if (!box || !canScroll(box, dy)) return;
    e.preventDefault();
    const px = e.deltaMode === 1 ? dy * 40 : e.deltaMode === 2 ? dy * box.clientHeight : dy;
    box.scrollTop += px;
  }, { passive: false, capture: true });
})();
