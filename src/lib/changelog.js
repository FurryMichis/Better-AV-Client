"use strict";
// Tablón de novedades: cada versión con sus funciones. Se muestra en «Novedades» (barra lateral del lanzador).
// kind: "new" = función nueva · "fix" = arreglo · "improve" = mejora
module.exports = [
  {
    version: "0.8.4", headline: "Actualizaciones sin instalador",
    summary: "Las actualizaciones se descargan solas y se aplican en silencio: la app se cierra y se vuelve a abrir, sin asistente de instalación ni ventanas.",
    items: [
      { kind: "new", title: "Solo se reinicia la app", text: "Al pulsar «Reiniciar y actualizar» (o el aviso de actualización lista) la app se cierra, aplica la versión nueva en segundo plano y se abre sola. Ya no aparece ningún instalador." },
      { kind: "new", title: "Se aplica sola en segundo plano", text: "Si la actualización ya está descargada y la app está oculta en la bandeja o minimizada, se aplica sola sin molestarte. Si la estás usando, no te interrumpe: te avisa y eliges cuándo." },
      { kind: "improve", title: "Aviso al terminar", text: "Después de actualizar, la app te dice a qué versión has pasado. Si algo falla, no se repite en bucle y te avisa." }
    ]
  },
  {
    version: "0.8.3", headline: "Más módulos del aula y mensajes Better AV más vivos",
    summary: "Marca actividades como completadas y mira tu progreso, lee páginas, libros y enlaces dentro de la app, abre glosarios, wikis y más módulos, y los mensajes de Better AV muestran fotos, «visto» y «escribiendo…».",
    items: [
      { kind: "new", title: "Completado y progreso del curso", text: "Las actividades con seguimiento tienen una casilla: si es manual la marcas tú; si es automática se rellena sola al cumplir las condiciones. Cada curso y cada tema muestran cuántas llevas completadas." },
      { kind: "new", title: "Páginas, libros y enlaces con vista propia", text: "Las páginas y los libros (con índice de capítulos) se leen dentro de la app, y los enlaces enseñan su dirección antes de abrirse en el navegador. Ya no se descargan como archivos." },
      { kind: "new", title: "Glosarios, wikis y bases de datos", text: "Busca y lee entradas de glosarios y bases de datos, y navega por las páginas de una wiki. Para añadir o editar, la app te lleva al navegador." },
      { kind: "new", title: "Talleres, lecciones, SCORM, H5P, encuestas y feedback", text: "Ves su información, plazos, intentos y notas dentro de la app y un botón para hacerlos en el navegador, que es donde funcionan." },
      { kind: "new", title: "Videoconferencias", text: "BigBlueButton muestra si la sala está en directo y cuánta gente hay, y con BigBlueButton y Zoom entras con un botón (se abre en tu navegador)." },
      { kind: "new", title: "Foto, «visto» y «escribiendo…» en Mensajes Better AV", text: "Cada mensaje lleva la foto de quien lo escribió. Bajo tu último mensaje pone «Enviado» o «Visto» (en grupos, «Visto por…»), y arriba del cuadro se avisa de quién está escribiendo." },
      { kind: "improve", title: "Chat más rápido y sin clics", text: "La conversación abierta se actualiza cada pocos segundos sin repintarse: no pierdes lo que escribes. Puedes empezar a escribir sin pulsar antes el cuadro, y el mensaje que envías aparece al instante." },
      { kind: "improve", title: "Servidor", text: "«Escribiendo» y «Visto por» en grupos necesitan ejecutar una vez supabase/migration-0.8.3.sql en Supabase → SQL Editor. Sin ejecutarlo, el chat funciona igual (con «Visto» en chats privados)." },
      { kind: "improve", title: "Qué depende del aula", text: "Todo usa las funciones de la app oficial de Moodle. Si tu aula tiene alguna desactivada, la app lo dirá y podrás abrirlo en el navegador." }
    ]
  },
  {
    version: "0.8.2", headline: "Mensajes completos, calendario propio y avisos a tu gusto",
    summary: "Los mensajes del aula pasan a ser un chat de verdad (nuevos chats, contactos, bloqueos y grupos del aula), puedes crear tus propios eventos y controlar tus notificaciones.",
    items: [
      { kind: "new", title: "Nuevo mensaje y búsqueda", text: "Pulsa «＋ Nuevo mensaje», busca a un compañero por su nombre y escríbele aunque todavía no hayáis hablado. Si no te deja escribirle, la app te dice por qué (por ejemplo, solo acepta mensajes de sus contactos)." },
      { kind: "new", title: "Contactos y bloqueos", text: "En «Contactos» ves tus contactos, aceptas o rechazas solicitudes y gestionas a quien has bloqueado. Desde un chat puedes añadir o quitar contacto y bloquear o desbloquear." },
      { kind: "new", title: "Borrar mensajes y conversaciones", text: "Pasa el ratón por un mensaje para borrarlo, o borra la conversación entera. Solo desaparece para ti." },
      { kind: "new", title: "Grupos del aula", text: "Los chats de grupo de tu aula (los de los grupos de clase) aparecen en la lista con la etiqueta GRUPO: lees y escribes, ves quién escribe cada mensaje y la lista de miembros, y puedes silenciarlos. Los chats silenciados no te avisan ni suman en el contador. Los grupos de Better AV siguen aparte." },
      { kind: "new", title: "Eventos propios en el calendario", text: "Crea, edita y borra tus eventos con fecha, hora, duración y descripción. Ahora el calendario también muestra los eventos que creas tú, los del centro y los de tus cursos." },
      { kind: "new", title: "Notificaciones", text: "Marca avisos como leídos (uno a uno al abrirlos o todos de golpe) y ajusta por dónde quieres recibir cada tipo de aviso —en el aula, por correo o en la app móvil oficial— o desactívalos todos." },
      { kind: "improve", title: "Qué depende del aula", text: "Todo usa las funciones de la app oficial de Moodle. Si tu aula tiene alguna desactivada (por ejemplo, la búsqueda de personas o los eventos propios), la app lo dirá y podrás hacerlo en el navegador." }
    ]
  },
  {
    version: "0.8.1", headline: "Entrega tareas, haz cuestionarios y usa los foros desde la app",
    summary: "Ya no hace falta abrir el navegador para lo más habitual del aula: entregar tareas, ver la corrección, hacer cuestionarios y participar en los foros.",
    items: [
      { kind: "new", title: "Entregar tareas", text: "Pulsa una tarea para ver el enunciado y sus archivos, escribir tu texto, subir archivos, guardar el borrador, enviarlo para calificar, editarlo o borrarlo (siempre que el aula lo permita). Verás tu estado, la nota, el comentario del profesor, sus archivos de corrección y los comentarios de la entrega, y puedes escribir los tuyos." },
      { kind: "new", title: "Cuestionarios", text: "En cada tema aparecen sus cuestionarios: mira tus intentos y notas, revisa los intentos terminados y haz uno nuevo o continúa el que dejaste a medias, con cronómetro, contraseña si la pide y resumen antes de enviar. Las preguntas de arrastrar y soltar y otras especiales se avisan y se hacen en el navegador." },
      { kind: "new", title: "Foros", text: "Lee los debates y sus respuestas, descarga los adjuntos, responde, crea debates nuevos y suscríbete a un debate para recibir avisos de sus respuestas." },
      { kind: "improve", title: "Qué depende del aula", text: "Todo usa las funciones de la app oficial de Moodle. Si tu aula tiene alguna desactivada o un profesor limita algo (por ejemplo, ver las respuestas de un intento), la app lo dirá y podrás abrirlo en el navegador con un botón." }
    ]
  },
  {
    version: "0.8.0", headline: "Better AV Client y grupos de chat",
    summary: "NotXunta Client pasa a llamarse Better AV Client, y los mensajes de tu cuenta Better AV ahora admiten grupos con tus amigos.",
    items: [
      { kind: "new", title: "Grupos de chat", text: "En «Mensajes Better AV» pulsa «＋ Nuevo grupo», ponle nombre y elige a tus amigos (hasta 25 personas). Quien crea el grupo puede cambiar el nombre, añadir o quitar gente y borrarlo; cualquiera puede salirse. Los grupos avisan de mensajes nuevos y cuentan en el contador de la barra lateral." },
      { kind: "improve", title: "Nuevo nombre", text: "El cliente pasa a llamarse Better AV Client, y tu cuenta, tus mensajes y tus archivos son ahora «Better AV». Tus aulas, ajustes y sesión se conservan tal cual." },
      { kind: "improve", title: "Servidor", text: "Esta versión incluye supabase/migration-0.8.0.sql (tablas y permisos de los grupos). Ejecútalo una vez en Supabase → SQL Editor para activar los grupos." }
    ]
  },
  {
    version: "0.7.2", headline: "Perfil del aula, novedades más rápidas y cuentas más personales",
    summary: "Tu perfil dentro de la instancia enseña ahora la descripción y los datos de tu aula original, las novedades se revisan con más frecuencia y tu cuenta Better AV se puede personalizar con descripción, estado, color y banner.",
    items: [
      { kind: "new", title: "Perfil con los datos de tu aula original", text: "En «Perfil» (al abrir una instancia) ves tu descripción, intereses, ciudad, país, centro, último acceso, el resumen de tus cursos y tareas y los datos del aula. Se lee al sincronizar; si el aula oculta un dato, no aparece." },
      { kind: "improve", title: "Revisión de novedades más frecuente", text: "Por defecto se buscan novedades cada 5 minutos (antes 15) y puedes elegir desde cada 2. Los mensajes se comprueban cada 30 s, los de Better AV cada 20 s y los amigos cada 90 s. Al volver a la ventana o al despertar el equipo se comprueba todo al momento." },
      { kind: "new", title: "Personaliza tu cuenta Better AV", text: "En «Cuenta y amigos» puedes poner descripción, estado, pronombres, color de perfil y banner, con vista previa. Tus amigos lo ven al pulsar su foto o nombre. Hay que ejecutar supabase/migration-0.7.2.sql una vez en Supabase." },
      { kind: "fix", title: "Icono del gorrito", text: "«Gestor de cuentas», «Mis cursos» y el popup «Conecta tu Aula Virtual» usan ahora solo el gorrito de graduación (sin cara y sin emoji)." }
    ]
  },
  {
    version: "0.7.1", headline: "Volumen de notificación y cuenta con política de privacidad",
    summary: "Ahora puedes ajustar el volumen del aviso (por defecto más bajo) y, al crear una cuenta Better AV, lees y aceptas la política de privacidad y los términos.",
    items: [
      { kind: "new", title: "Volumen de notificación ajustable", text: "En Ajustes → «Segundo plano y avisos» hay un deslizador de 0 a 100 % y el botón «Probar sonido» usa ese volumen." },
      { kind: "improve", title: "Sonido más bajo por defecto", text: "El aviso ya no suena al máximo: por defecto está al 35 %. Puedes subirlo cuando quieras." },
      { kind: "new", title: "Popup «Crea tu cuenta Better AV»", text: "Al abrir la app sin cuenta aparece un popup con la política de privacidad y los términos en un desplazable. Hay que aceptarlos para crear la cuenta o entrar; «Ahora no» lo deja para más tarde." },
      { kind: "improve", title: "Textos siempre actualizados", text: "Los textos legales se leen de GitHub; sin conexión se muestra la última copia descargada o la incluida en la app." }
    ]
  },
  {
    version: "0.7.0", headline: "Better AV Client llega a Android",
    summary: "Ahora hay una versión para Android (APK) que usa las mismas cuentas, aulas y amigos que la de escritorio.",
    items: [
      { kind: "new", title: "App para Android", text: "Mismo aula virtual, mensajes, archivos Better AV y amigos, con menú lateral y botón «atrás» de Android. En el móvil los avisos funcionan con la app abierta y no hay vídeo de fondo." },
      { kind: "new", title: "APK con GitHub Actions", text: "El flujo «Compilar APK de Android» genera el APK y lo adjunta a la release. La versión de escritorio no cambia." }
    ]
  },
  {
    version: "0.6.9", headline: "Sonido de notificación y tutorial de bienvenida",
    summary: "Todas las notificaciones suenan con el mismo sonido de Better AV y la primera vez que abres la app en un dispositivo te la enseña un tutorial con pestañas.",
    items: [
      { kind: "new", title: "Sonido en todas las notificaciones", text: "Suena en los avisos emergentes, en las notificaciones del sistema y en los avisos dentro de la app, incluso con la ventana cerrada en la bandeja. Se puede quitar o probar en Ajustes → «Sonido de notificación»." },
      { kind: "new", title: "Tutorial de la primera vez", text: "La primera vez que se abre Better AV en un dispositivo aparece un tutorial con pestañas (cuentas, overlay, amigos, apariencia y avisos). Puedes saltarlo con «Saltar tutorial» y volver a verlo en Ajustes." }
    ]
  },
  {
    version: "0.6.8", headline: "Barra de ventana propia y scroll arreglado",
    summary: "La ventana ahora tiene su propia barra (minimizar, maximizar y cerrar) integrada en la app, las barras de desplazamiento tienen el estilo de Better AV y se arreglan los fallos al desplazarse.",
    items: [
      { kind: "new", title: "Barra de ventana integrada", text: "Se quita el marco nativo de Windows/Linux y los botones de minimizar, maximizar/restaurar y cerrar están dentro de la app. Arrastra la barra para mover la ventana y haz doble clic para maximizar." },
      { kind: "new", title: "Barras de desplazamiento de la app", text: "Las barras verticales y horizontales (también en el overlay) usan el color de acento que elijas en Apariencia." },
      { kind: "fix", title: "Barra superior y barra lateral ya no se descolocan al desplazar", text: "Ahora quedan fijas y solo se mueve el contenido. Si la ventana es baja o aumentas el tamaño de la interfaz, la barra lateral se desplaza por sí sola en vez de salirse de la ventana." },
      { kind: "improve", title: "Desplazamiento más fluido", text: "Se quita el desenfoque de las tarjetas que se desplazan, que provocaba tirones y parpadeos, sobre todo con fondo animado o vídeo." }
    ]
  },
  {
    version: "0.6.7", headline: "Jaja 67",
    summary: "67676767676767676767676767676767676767676767676767676767676767676767676767676767676767676767676767676767676767676767676767676767676767",
    items: [
      { kind: "fix", title: "Mensajes Better AV ya no se estiran sin fin", text: "La ventana de la conversación tenía una altura sin límite y crecía con cada mensaje. Ahora ocupa solo la pantalla y el historial se desplaza por dentro, con el cuadro para escribir siempre a la vista." },
      { kind: "improve", title: "Aviso de mensajes Better AV", text: "Cuando un amigo te escribe, salta una notificación (con la app en segundo plano) o un aviso dentro de la app, y el contador de «Mensajes Better AV» se actualiza solo. Se activa con «Avisar de mensajes nuevos» en Ajustes." }
    ]
  },
  {
    version: "0.6.6", headline: "Mensajes, arranque automático y fin de macOS",
    summary: "Better AV puede iniciarse con el ordenador e incluye mensajes directos entre amigos. Desde esta versión ya no hay compatibilidad con macOS.",
    items: [
      { kind: "new", title: "Inicio automático", text: "Activa desde Ajustes que Better AV se abra al iniciar sesión en Windows o Linux." },
      { kind: "new", title: "Mensajería Better AV", text: "Envía y recibe mensajes directos con tus amigos aceptados desde Cuenta Better AV. Requiere ejecutar migration-0.6.6.sql en Supabase." },
      { kind: "improve", title: "Fin de la compatibilidad con macOS", text: "Better AV Client deja de compilarse para Mac: no habrá nuevas versiones ni actualizaciones para macOS. Windows y Linux siguen con soporte completo." },
      { kind: "improve", title: "Actualizaciones", text: "Windows instalado y Linux AppImage se actualizan solos; Linux .deb usa el gestor de paquetes." }
    ]
  },
  {
    version: "0.6.5", headline: "Actualizaciones más fiables",
    summary: "Arreglos en el actualizador automático: ya no se queda en bucle y la publicación de versiones es más segura.",
    items: [
      { kind: "fix", title: "Fin del bucle de actualización", text: "Si la app se reiniciaba para instalar una versión y al volver a abrir seguía siendo la anterior, volvía a descargarla e instalarla sin parar. Ahora solo lo intenta una vez cada 24 horas y, si no ha funcionado, te lo avisa y abre la página de versiones." },
      { kind: "fix", title: "Ya no se queda parada en la pantalla de inicio", text: "Si una descarga se queda sin avanzar durante un minuto, la app se abre igualmente (y puedes seguir usándola)." },
      { kind: "improve", title: "Publicación de versiones más segura", text: "El flujo de GitHub se niega a publicar si la etiqueta (p. ej. v0.6.5) no coincide con la versión del package.json, que era lo que dejaba un latest.yml con otra versión. Además publica lo que haya aunque falle Mac o Linux, y deja la release como «Latest»." }
    ]
  },
  {
    version: "0.6.4", headline: "Actualización de seguridad",
    summary: "Revisión completa de seguridad: se cierran varios puntos débiles en descargas, inicio de sesión, datos de la nube y empaquetado. Se recomienda actualizar.",
    items: [
      { kind: "fix", title: "Archivos descargados más seguros", text: "Los apuntes y Archivos Better AV ahora se guardan en una carpeta privada de tu usuario (no en la carpeta temporal compartida), con nombres de archivo saneados. En Windows se marcan como «descargados de Internet», así Office y SmartScreen los comprueban antes de abrirlos." },
      { kind: "fix", title: "Más tipos de archivo peligroso bloqueados", text: "Programas, scripts, accesos directos, instaladores, imágenes de disco y documentos con macros (.exe, .lnk, .ps1, .docm, .iso, .app, .sh…) nunca se abren solos: solo se muestran en su carpeta." },
      { kind: "fix", title: "Inicio de sesión con Google/Discord/GitHub más blindado", text: "La pequeña página local que recibe la respuesta del inicio de sesión ahora solo acepta peticiones de tu propio equipo, con cabeceras de seguridad, y descarta cualquier otra visita." },
      { kind: "fix", title: "Datos de la nube comprobados", text: "El aspecto (fondo, color, brillo), los avisos y los ajustes que llegan de la nube se validan uno a uno antes de aplicarse, para que un dato manipulado no pueda alterar la interfaz." },
      { kind: "fix", title: "Contraseña del aula protegida", text: "Las peticiones de inicio de sesión al aula ya no siguen redirecciones, para que la contraseña no pueda acabar en otro sitio. Imágenes del aula: solo formatos normales (sin SVG) y con tope de tamaño." },
      { kind: "fix", title: "Enlaces y ventanas", text: "Los enlaces con usuario y contraseña incrustados se rechazan; ninguna ventana puede incrustar contenido externo; y la app no concede cámara, micrófono ni ubicación a nadie." },
      { kind: "improve", title: "Electron actualizado y cerrado", text: "Se pasa a Electron 43 (la 35 ya no recibe parches de seguridad) y se desactivan en el ejecutable las opciones de depuración y de ejecutar como Node. Reglas CSP más estrictas en todas las pantallas." },
      { kind: "improve", title: "Servidor", text: "Esta versión incluye supabase/migration-0.6.4.sql (límites por cuenta: aulas vinculadas y archivos). Ejecútalo una vez en Supabase → SQL Editor." }
    ]
  },
  {
    version: "0.6.2", headline: "Arreglos: Amigos y Apariencia",
    summary: "Vuelven a funcionar las pestañas «Cuenta y amigos» y «Apariencia», y los archivos pasan a ser solo los de tu cuenta Better AV.",
    items: [
      { kind: "fix", title: "La pestaña «Cuenta y amigos» salía vacía", text: "Solo se veía el título. Un error al dibujar el interruptor «Mostrar cuando estoy en línea» cortaba la pantalla entera. Ya se ve tu cuenta, tu foto y la lista de amigos con su estado en línea." },
      { kind: "fix", title: "La pestaña «Apariencia» no se abría", text: "Tenía el mismo fallo (un bloque colocado en la pantalla equivocada). Corregido." },
      { kind: "improve", title: "Si algo falla, ya no se queda en blanco", text: "Cuando una parte de «Cuenta y amigos» no se puede cargar, ahora aparece un aviso con el motivo en lugar de dejar la pantalla vacía." },
      { kind: "improve", title: "Solo Archivos Better AV", text: "Se quita la gestión de los archivos privados del aula virtual original. «Archivos» ahora muestra únicamente tus Archivos Better AV (los de tu cuenta), igual que en el menú del lanzador." }
    ]
  },
  {
    version: "0.6.1", headline: "Amigos en línea y archivos",
    summary: "Ves cuándo están conectados tus amigos y ya puedes gestionar tus archivos privados del aula y los de tu cuenta Better AV.",
    items: [
      { kind: "new", title: "Amigos en línea", text: "En «Amigos» aparece un punto verde junto a quien tiene Better AV Client abierto, o cuándo se le vio por última vez. Solo lo ven sus amigos y se puede desactivar en «Cuenta y amigos»." },
      { kind: "new", title: "Archivos privados del aula", text: "Nueva sección «Archivos»: ves, abres, subes y eliminas tus archivos privados del aula, con la barra del espacio usado y el límite que te da el aula." },
      { kind: "new", title: "Archivos Better AV", text: "Tus propios archivos privados, guardados en tu cuenta Better AV: los tienes en cualquier ordenador donde inicies sesión. También con barra de espacio." },
      { kind: "improve", title: "Servidor", text: "Esta versión necesita ejecutar supabase/migration-0.6.1.sql en Supabase (una sola vez). Sin eso la app funciona, pero el estado en línea y los Archivos Better AV avisarán de que falta." }
    ]
  },
  {
    version: "0.6.0", headline: "Ahora también para Linux y Mac",
    summary: "Better AV Client deja de ser solo para Windows: a partir de esta versión hay instaladores para Windows, Linux y macOS.",
    items: [
      { kind: "new", title: "Windows, Linux y Mac", text: "Instalador y portable para Windows, .dmg y .zip para macOS (Intel y Apple Silicon), AppImage y .deb para Linux." },
      { kind: "new", title: "Tablón de novedades", text: "Nueva sección «Novedades» con cada función y arreglo de cada versión. Aparece una marca «NUEVO» hasta que la abres." },
      { kind: "improve", title: "Atajos adaptados a cada sistema", text: "En Mac los atajos usan ⌘ en lugar de Ctrl (zoom, pestañas del overlay, ⌘+Mayús+Espacio) y la app tiene su menú de macOS." },
      { kind: "improve", title: "Contraseñas en Linux", text: "Se guardan con el llavero del sistema (GNOME Keyring / KWallet). Si no hay llavero, la app avisa en vez de guardarlas sin protección." },
      { kind: "improve", title: "Actualizaciones por sistema", text: "Windows y Linux (AppImage) se actualizan solos. En Mac y en Linux .deb la app te avisa de la versión nueva y abre la página de descarga." },
      { kind: "improve", title: "Bandeja y avisos", text: "Icono de bandeja y avisos emergentes adaptados a la barra de menú de macOS y a Linux." },
      { kind: "improve", title: "Archivos peligrosos", text: "Los apuntes con extensión de programa (.app, .sh, .AppImage, .deb, .dmg…) tampoco se abren automáticamente." },
      { kind: "new", title: "Compilación automática", text: "Flujo de GitHub Actions que genera los instaladores de los tres sistemas al publicar una versión." }
    ]
  },
  {
    version: "0.5.7", headline: "Arreglo de la cuenta",
    items: [
      { kind: "fix", title: "Cuenta y amigos sin la migración", text: "Si a Supabase le faltaba la migración 0.5.6, «Cuenta y amigos» dejaba de funcionar entero. Ahora funciona igualmente y avisa de lo que falta." }
    ]
  },
  {
    version: "0.5.6", headline: "Pantalla de inicio, foto de perfil y ajustes en la nube",
    items: [
      { kind: "new", title: "Pantalla de inicio", text: "Antes de abrir la app aparece un recuadro con el logo y «Buscando actualizaciones…», con barra de progreso y botón «Continuar sin actualizar»." },
      { kind: "new", title: "Foto de perfil", text: "Pon, cambia o quita la foto de tu cuenta Better AV; se ve en tu perfil, en la barra superior y en las listas de amigos." },
      { kind: "new", title: "Ajustes sincronizados", text: "Fondo, oscurecimiento, color, sonido, IA, avisos, segundo plano y tus aulas se suben solos y se importan en otro ordenador. Las contraseñas nunca se suben." },
      { kind: "fix", title: "Texto «false» en Amigos y Apariencia", text: "Dejó de aparecer «false» cuando una sección estaba vacía." },
      { kind: "fix", title: "Apartados duplicados", text: "En «Cuenta y amigos» los apartados ya no se duplican al volver a entrar." }
    ]
  },
  {
    version: "0.5.5", headline: "Versión pública",
    items: [
      { kind: "improve", title: "Inicio de sesión con Google, Discord y GitHub", text: "Listo para usar, con números de versión unificados." }
    ]
  },
  {
    version: "0.5.4", headline: "Inicio de sesión con proveedores",
    items: [
      { kind: "improve", title: "Aviso de proveedor desactivado", text: "Si Google, Discord o GitHub no están activados en el servidor, la app lo dice antes de abrir el navegador." },
      { kind: "new", title: "Botón «Cancelar»", text: "Puedes cancelar la espera del inicio de sesión; el puerto local se cierra limpiamente." }
    ]
  },
  {
    version: "0.5.3", headline: "Cuentas, amigos y actualizaciones automáticas",
    items: [
      { kind: "new", title: "Cuenta Better AV y amigos", text: "Cuenta propia (correo, Google, Discord o GitHub), pestaña «Participantes» en cada curso y solicitudes de amistad." },
      { kind: "new", title: "Actualizaciones automáticas", text: "La app busca versiones nuevas al abrir y cada 6 horas, y las instala al cerrar." },
      { kind: "new", title: "Overlay con pestañas", text: "Varias pestañas en el navegador del Shift+Tab (Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+L)." },
      { kind: "improve", title: "Apuntes más rápidos", text: "«Abriendo los apuntes…», descarga a disco, caché de 3 días y precarga de los documentos del tema." },
      { kind: "new", title: "Vídeo de fondo con sonido", text: "Activar/silenciar y volumen, y modo compatible para PCs donde el vídeo no se veía." },
      { kind: "fix", title: "Contador de mensajes", text: "El número de mensajes nuevos ya se quita al abrir el chat." },
      { kind: "new", title: "Avisos de mensajes", text: "Notificaciones de mensajes nuevos además de las novedades de los cursos." }
    ]
  },
  {
    version: "0.4.0", headline: "Segundo plano, overlay e iconos",
    items: [
      { kind: "new", title: "Avisos estilo Steam y segundo plano", text: "La app sigue en la bandeja y avisa de novedades con notificaciones emergentes." },
      { kind: "new", title: "Overlay con Shift+Tab", text: "Navegador a pantalla completa para Google, Gmail, tu IA y el aula original." },
      { kind: "new", title: "Iconos de instancia y tamaño de interfaz", text: "Emoji o imagen para cada cuenta y zoom de la interfaz." },
      { kind: "new", title: "Vídeo de fondo", text: "MP4/WebM como fondo, además de fondos animados, imagen o GIF." }
    ]
  },
  {
    version: "0.3.0", headline: "Better AV Client",
    items: [
      { kind: "new", title: "Aula Virtual en tu escritorio", text: "Cursos, temas, documentos, enlaces, tareas, calendario, calificaciones y mensajes del aula de la Xunta." },
      { kind: "new", title: "Apariencia", text: "Fondos estáticos y animados, color de acento y banner del curso." }
    ]
  }
];
