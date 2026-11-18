"use strict";
// Se ejecuta DESPUÉS de «cap add android» y «cap sync android». Ajusta el proyecto Android generado:
//  · plugin nativo para abrir archivos (NxOpenerPlugin) y MainActivity que lo registra,
//  · enlace profundo com.notxunta.client://auth-callback (inicio de sesión con Google/Discord/GitHub),
//  · sin copia de seguridad automática (allowBackup=false) y permisos de FileProvider,
//  · icono, colores de barra de estado, versión y (opcional) firma de release con tu keystore.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = __dirname;
const ANDROID = path.join(ROOT, "android");
const APP = path.join(ANDROID, "app");
const MAIN = path.join(APP, "src", "main");
const cfg = require("./capacitor.config.json");
const pkg = require("../package.json");
if (!fs.existsSync(MAIN)) throw new Error("No existe mobile/android. Ejecuta antes: npx cap add android");

const read = f => fs.readFileSync(f, "utf8");
const write = (f, s) => fs.writeFileSync(f, s);
const warn = m => console.warn("⚠ " + m);

// ---- Java
const pkgDir = path.join(MAIN, "java", ...cfg.appId.split("."));
fs.mkdirSync(pkgDir, { recursive: true });
for (const f of ["NxOpenerPlugin.java", "MainActivity.java"]) {
  write(path.join(pkgDir, f), read(path.join(ROOT, "native", f)).replace(/^package .*;/m, `package ${cfg.appId};`));
}

// ---- AndroidManifest.xml
const manifestFile = path.join(MAIN, "AndroidManifest.xml");
let manifest = read(manifestFile);
manifest = manifest.replace(/android:allowBackup="true"/, 'android:allowBackup="false"');
if (!/android:allowBackup=/.test(manifest)) manifest = manifest.replace("<application", '<application android:allowBackup="false"');
if (!manifest.includes('android:host="auth-callback"')) {
  const filter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${cfg.appId}" android:host="auth-callback" />
            </intent-filter>
`;
  if (!manifest.includes("</activity>")) throw new Error("AndroidManifest.xml sin </activity>: estructura inesperada.");
  manifest = manifest.replace("</activity>", `${filter}        </activity>`);
}
if (!manifest.includes("androidx.core.content.FileProvider")) {
  manifest = manifest.replace("</application>", `
        <provider android:name="androidx.core.content.FileProvider" android:authorities="\${applicationId}.fileprovider" android:exported="false" android:grantUriPermissions="true">
            <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/file_paths" />
        </provider>
    </application>`);
}
write(manifestFile, manifest);

// ---- file_paths.xml (caché de la app para abrir/compartir archivos descargados)
fs.mkdirSync(path.join(MAIN, "res", "xml"), { recursive: true });
write(path.join(MAIN, "res", "xml", "file_paths.xml"), `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-path name="my_images" path="." />
    <cache-path name="my_cache_images" path="." />
    <files-path name="my_files" path="." />
</paths>
`);

// ---- colores de las barras del sistema
const stylesFile = path.join(MAIN, "res", "values", "styles.xml");
if (fs.existsSync(stylesFile)) {
  let styles = read(stylesFile);
  if (!styles.includes("statusBarColor")) {
    const re = /(<style name="AppTheme\.NoActionBar"[^>]*>)/;
    if (re.test(styles)) {
      styles = styles.replace(re, `$1
        <item name="android:statusBarColor">#100e18</item>
        <item name="android:navigationBarColor">#100e18</item>
        <item name="android:windowLightStatusBar">false</item>`);
      write(stylesFile, styles);
    } else warn("No se encontró el estilo AppTheme.NoActionBar: las barras del sistema quedan con el color por defecto.");
  }
}

// ---- icono (a partir de ../build/icon.png con ImageMagick; si no está, se queda el icono por defecto)
function magick(args) {
  for (const bin of ["magick", "convert"]) {
    try { execFileSync(bin, args, { stdio: "ignore" }); return true; } catch { /* prueba el siguiente */ }
  }
  return false;
}
const icon = path.join(ROOT, "..", "build", "icon.png");
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
let iconOk = fs.existsSync(icon);
if (iconOk) {
  for (const [d, k] of Object.entries(DENS)) {
    const dir = path.join(MAIN, "res", `mipmap-${d}`);
    fs.mkdirSync(dir, { recursive: true });
    const legacy = Math.round(48 * k), full = Math.round(108 * k), inner = Math.round(full * 0.62);
    iconOk = magick([icon, "-resize", `${legacy}x${legacy}`, path.join(dir, "ic_launcher.png")])
      && magick([icon, "-resize", `${legacy}x${legacy}`, path.join(dir, "ic_launcher_round.png")])
      && magick([icon, "-resize", `${inner}x${inner}`, "-background", "none", "-gravity", "center", "-extent", `${full}x${full}`, path.join(dir, "ic_launcher_foreground.png")])
      && iconOk;
  }
  const bg = path.join(MAIN, "res", "values", "ic_launcher_background.xml");
  write(bg, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#100E18</color>\n</resources>\n`);
}
if (!iconOk) warn("No se pudo generar el icono (¿falta ImageMagick?). Se usa el icono por defecto de Capacitor.");

// ---- versión y firma en app/build.gradle
const gradleFile = path.join(APP, "build.gradle");
let gradle = read(gradleFile);
const [maj, min, pat] = String(pkg.version).split(".").map(n => parseInt(n, 10) || 0);
const versionCode = maj * 10000 + min * 100 + pat;
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`).replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}"`);
if (process.env.NX_KEYSTORE && !gradle.includes("NX_KEYSTORE")) {
  gradle += `

// Firma de release con tu keystore (variables de entorno que pone el workflow)
android {
    signingConfigs {
        nxrelease {
            storeFile file(System.getenv("NX_KEYSTORE"))
            storePassword System.getenv("NX_KS_PASS")
            keyAlias System.getenv("NX_KEY_ALIAS")
            keyPassword System.getenv("NX_KEY_PASS")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.nxrelease
        }
    }
}
`;
}
write(gradleFile, gradle);
console.log(`Proyecto Android listo · versión ${pkg.version} (code ${versionCode})${process.env.NX_KEYSTORE ? " · firma de release" : " · sin keystore (APK debug)"}`);
