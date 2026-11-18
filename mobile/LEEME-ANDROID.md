# NotXunta Client para Android (APK)

La app de escritorio (Electron) **no se toca**. Esta carpeta `mobile/` la envuelve con [Capacitor](https://capacitorjs.com):
`build-web.js` copia `src/` a `mobile/www`, y `web/mobile-bridge.js` ofrece el mismo `window.notxuntaClient` que `preload.js`,
reutilizando `moodle.js`, `settings.js`, `sync.js`, etc. Así la lógica es la misma en escritorio y móvil.

## Compilar con GitHub Actions
1. Sube el repositorio (incluye `.github/workflows/android.yml` y `mobile/`).
2. **Actions → «Compilar APK de Android» → Run workflow**. Al terminar, descarga el APK en *Artifacts*.
3. Con una etiqueta `vX.Y.Z` (igual que `package.json`) el APK se adjunta además a la Release.

## Firma (importante para poder actualizar)
Sin keystore se genera un APK *debug*: se instala, pero cambia de clave en cada compilación y Android no deja actualizar encima (hay que desinstalar y se pierden los datos locales). Para evitarlo, una sola vez:
```
keytool -genkeypair -v -keystore nx.keystore -alias notxunta -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 nx.keystore        # (en Mac: base64 -i nx.keystore)
```
Guarda en *Settings → Secrets and variables → Actions*: `ANDROID_KEYSTORE_BASE64` (la salida de base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`notxunta`), `ANDROID_KEY_PASSWORD`. **Guarda una copia del keystore: si lo pierdes no podrás actualizar.**

## Inicio de sesión con Google/Discord/GitHub
En Supabase → Authentication → URL Configuration → Redirect URLs, añade: `com.notxunta.client://auth-callback`. El correo+contraseña funciona sin esto.

## Qué cambia respecto al escritorio
- Menú lateral deslizable (☰) y botón «atrás» de Android.
- **Sin segundo plano**: los avisos y sondeos solo funcionan con la app abierta (no hay notificaciones push).
- «Overlay» → el botón abre tu IA (o Google) en el navegador integrado.
- **Sin vídeo de fondo** ni zoom de interfaz (lo da Android).
- Los apuntes se descargan al pulsarlos (no se precargan, para ahorrar datos) y se abren con la app que tengas para ese tipo.
- Contraseñas y sesión cifradas con WebCrypto (AES-GCM) en el almacenamiento privado de la app; no usan el llavero de hardware.
- Actualizaciones: la app avisa si hay APK nuevo en GitHub; se instala descargándolo.

## Probar el puente sin móvil
`cd mobile && npm install && node build-web.js && node test/bridge.test.js`
