// Se compila con esbuild (build-web.js) a www/nx-plugins.js y deja los plugins de Capacitor en window.NXCap.
import { Capacitor, CapacitorHttp, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

// Plugin propio (native/NxOpenerPlugin.java): abre un archivo con la app que corresponda (PDF, Word…).
const NxOpener = registerPlugin("NxOpener");

window.NXCap = { Capacitor, CapacitorHttp, App, Browser, Filesystem, Directory, Share, NxOpener };
