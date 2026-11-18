package com.notxunta.client;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Abre un archivo descargado (PDF, Word…) con la aplicación que Android tenga para ese tipo.
 * La interfaz lo llama como NxOpener.open({ path, mime }).
 */
@CapacitorPlugin(name = "NxOpener")
public class NxOpenerPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String path = call.getString("path");
        String mime = call.getString("mime", "*/*");
        if (path == null || path.isEmpty()) {
            call.reject("Falta la ruta del archivo.");
            return;
        }
        try {
            File file = new File(path);
            if (!file.exists()) {
                call.reject("El archivo no existe.");
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, mime);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No hay ninguna aplicación para abrir este archivo.", "NOAPP", e);
        } catch (Exception e) {
            call.reject("No se pudo abrir el archivo: " + e.getMessage(), e);
        }
    }
}
