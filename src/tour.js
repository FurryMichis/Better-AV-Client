"use strict";
// Visita guiada (0.8.5): globos que señalan cada apartado de la app (resaltan el botón y explican qué hace).
// Dos recorridos: el del lanzador (cuentas, crear instancia, amigos, ajustes…) y el de dentro de un aula (cursos, calendario…).
// Se carga después de renderer.js y usa sus utilidades (h, clear, api, $).

const TOUR_LAUNCHER = [
  { sel: '.nav[data-view="accounts"]', title: "Gestor de cuentas", text: "Tu página de inicio: aquí están tus aulas y entras a cada una con un clic.", side: "right" },
  { sel: "#add-account", title: "Crea tu primera instancia", text: "Pulsa «＋ Añadir cuenta». Puedes buscar tu aula escribiendo el nombre de tu centro (sin abrir el navegador) y solo te falta poner tu usuario y contraseña.", side: "bottom" },
  { sel: "#account-grid", title: "Tus cuentas", text: "Cada tarjeta es un aula. Púlsala para entrar; pulsa su icono para ponerle un emoji o una imagen.", side: "top" },
  { sel: '.nav[data-view="instances"]', title: "Instancias", text: "Aquí gestionas las direcciones de tus aulas: cambiar el enlace, el usuario o borrar una.", side: "right" },
  { sel: '.nav[data-view="cloud"]', title: "Cuenta y amigos", text: "Crea una cuenta Better AV (gratis) para tener amigos, personalizar tu perfil y llevar tus ajustes a otros ordenadores.", side: "right" },
  { sel: '.nav[data-view="nxmessages"]', title: "Mensajes Better AV", text: "Chats privados y grupos con tus amigos, con fotos, «visto» y «escribiendo…». El número te dice cuántos tienes sin leer.", side: "right" },
  { sel: '.nav[data-view="nxfiles"]', title: "Archivos Better AV", text: "Tu espacio en la nube para subir apuntes y abrirlos desde cualquier ordenador.", side: "right" },
  { sel: '.nav[data-view="news"]', title: "Novedades", text: "Qué trae cada versión de la app. Se marca cuando hay algo nuevo que mirar.", side: "right" },
  { sel: '.nav[data-view="appearance"]', title: "Apariencia", text: "Fondos (incluso tu propio vídeo), color de acento y tamaño de la interfaz.", side: "right" },
  { sel: '.nav[data-view="settings"]', title: "Ajustes", text: "Avisos y sonido, actualizaciones, el overlay, el filtro de palabras y el tutorial. Aquí puedes volver a ver esta visita.", side: "right" },
  { sel: "#open-overlay", title: "El overlay: Shift+Tab", text: "Un navegador sobre cualquier ventana con Google, Gmail, tu aula y tu IA. Se abre y se cierra con Shift+Tab.", side: "right" }
];

const TOUR_INSTANCE = [
  { sel: '.nav[data-iview="courses"]', title: "Mis cursos", text: "Tus asignaturas. Entra en un curso para ver sus temas, el progreso y marcar actividades como completadas.", side: "right" },
  { sel: '.nav[data-iview="calendar"]', title: "Calendario", text: "Entregas y eventos del centro y de tus cursos. También puedes crear los tuyos.", side: "right" },
  { sel: '.nav[data-iview="tasks"]', title: "Tareas", text: "Todas tus tareas juntas, pendientes y entregadas. Pulsa una para entregarla desde la app.", side: "right" },
  { sel: '.nav[data-iview="grades"]', title: "Calificaciones", text: "Tus notas por asignatura.", side: "right" },
  { sel: '.nav[data-iview="messages"]', title: "Mensajes", text: "Los mensajes de tu aula: chats, contactos y grupos. El número indica los no leídos.", side: "right" },
  { sel: '.nav[data-iview="notifications"]', title: "Notificaciones", text: "Los avisos de tu aula; puedes marcarlos como leídos y elegir cuáles recibir.", side: "right" },
  { sel: '.nav[data-iview="profile"]', title: "Perfil", text: "Tu perfil del aula original y un acceso a tu cuenta Better AV.", side: "right" },
  { sel: "#sync-btn", title: "Sincronizar", text: "Vuelve a leer el aula para ver lo nuevo. Lo que es nuevo desde tu última visita sale marcado como NUEVO.", side: "bottom" },
  { sel: "#back-launcher", title: "Cambiar de cuenta", text: "Vuelve al gestor de cuentas para entrar a otra aula.", side: "right" }
];

let tourState = null;

function tourEnd(done) {
  if (!tourState) return;
  const t = tourState; tourState = null;
  document.removeEventListener("keydown", t.onKey, true);
  window.removeEventListener("resize", t.onResize);
  t.shade.remove(); t.spot.remove(); t.pop.remove();
  t.resolve(done);
}

function tourShow() {
  const t = tourState; if (!t) return;
  const st = t.steps[t.i], last = t.i === t.steps.length - 1;
  const el = st.sel ? document.querySelector(st.sel) : null;
  const visible = el && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
  if (visible) el.scrollIntoView({ block: "nearest" });
  clear(t.pop).append(
    h("div", { class: "eyebrow", text: `VISITA GUIADA · ${t.i + 1} DE ${t.steps.length}` }),
    h("h3", { text: st.title }), h("p", { text: st.text }),
    h("div", { class: "tour-actions" },
      h("button", { class: "secondary small", type: "button", text: "Saltar", onclick: () => tourEnd(false) }),
      h("span", { class: "tour-spacer" }),
      h("button", { class: "secondary small", type: "button", text: "← Anterior", disabled: t.i === 0 ? "" : null, onclick: () => { t.i--; tourShow(); } }),
      h("button", { class: "primary small", type: "button", text: last ? "¡Listo!" : "Siguiente →", onclick: () => { if (last) tourEnd(true); else { t.i++; tourShow(); } } })));
  tourPlace(visible ? el : null, st.side);
  const next = t.pop.querySelector(".primary"); if (next) next.focus({ preventScroll: true });
}

function tourPlace(el, side) {
  const t = tourState; if (!t) return;
  const vw = window.innerWidth, vh = window.innerHeight, pop = t.pop, pad = 6, gap = 14;
  pop.style.left = "0px"; pop.style.top = "0px";
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let x, y;
  if (!el) {
    t.spot.hidden = true;
    x = (vw - pw) / 2; y = (vh - ph) / 2;
  } else {
    const r = el.getBoundingClientRect();
    t.spot.hidden = false;
    t.spot.style.left = `${r.left - pad}px`; t.spot.style.top = `${r.top - pad}px`;
    t.spot.style.width = `${r.width + pad * 2}px`; t.spot.style.height = `${r.height + pad * 2}px`;
    const fits = {
      right: r.right + gap + pw < vw, left: r.left - gap - pw > 0, bottom: r.bottom + gap + ph < vh, top: r.top - gap - ph > 0
    };
    const order = [side, "right", "bottom", "top", "left"].filter(Boolean);
    const use = order.find(s => fits[s]) || "bottom";
    if (use === "right") { x = r.right + gap + pad; y = r.top + r.height / 2 - ph / 2; }
    else if (use === "left") { x = r.left - gap - pad - pw; y = r.top + r.height / 2 - ph / 2; }
    else if (use === "bottom") { x = r.left + r.width / 2 - pw / 2; y = r.bottom + gap + pad; }
    else { x = r.left + r.width / 2 - pw / 2; y = r.top - gap - pad - ph; }
  }
  pop.style.left = `${Math.max(10, Math.min(vw - pw - 10, x))}px`;
  pop.style.top = `${Math.max(10, Math.min(vh - ph - 10, y))}px`;
}

// Devuelve una promesa: true = llegó al final · false = saltó la visita.
function startTour(steps) {
  tourEnd(false);
  return new Promise(resolve => {
    const shade = h("div", { class: "tour-shade" });
    const spot = h("div", { class: "tour-spot" });
    const pop = h("div", { class: "tour-pop", role: "dialog", "aria-label": "Visita guiada", "aria-live": "polite" });
    const t = { steps, i: 0, shade, spot, pop, resolve };
    t.onKey = e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); tourEnd(false); }
      else if (e.key === "ArrowRight") { e.preventDefault(); if (t.i < steps.length - 1) { t.i++; tourShow(); } else tourEnd(true); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); if (t.i > 0) { t.i--; tourShow(); } }
    };
    t.onResize = () => tourShow();
    tourState = t;
    document.body.append(shade, spot, pop);
    document.addEventListener("keydown", t.onKey, true);
    window.addEventListener("resize", t.onResize);
    tourShow();
  });
}

// La visita adecuada para donde estás: dentro de un aula o en el lanzador.
function startContextTour() {
  const inInstance = !$("#instance-shell").hidden;
  return startTour(inInstance ? TOUR_INSTANCE : TOUR_LAUNCHER).then(done => {
    api("setSettings", inInstance ? { tourInstanceDone: true } : { tourDone: true }).catch(() => {});
    return done;
  });
}

// Primera vez en el lanzador / primera vez dentro de un aula.
async function maybeTour(kind) {
  try {
    const { settings: st } = await api("getSettings");
    if (kind === "launcher" ? st.tourDone : st.tourInstanceDone) return;
    if (document.querySelector("dialog[open]")) return;
    if (kind === "launcher" ? !$("#instance-shell").hidden : $("#instance-shell").hidden) return;
    await startContextTour();
  } catch { /* se ofrecerá otra vez */ }
}
