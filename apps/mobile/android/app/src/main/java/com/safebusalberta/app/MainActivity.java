package com.safebusalberta.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.safebusalberta.app.tracking.DriverTrackingPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DriverTrackingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
