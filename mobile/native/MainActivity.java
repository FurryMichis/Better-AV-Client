package com.notxunta.client;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NxOpenerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
