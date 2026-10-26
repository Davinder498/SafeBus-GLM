package com.safebusalberta.app;

import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Appearance is local device state; this bridge never reads account data. */
@CapacitorPlugin(name = "SafeBusAppearance")
public class AppearancePlugin extends Plugin {
    private static final String STORE = "safebus.appearance";
    private static final String KEY = "safebus.theme";

    private static String preference(Context context) {
        return context.getSharedPreferences(STORE, Context.MODE_PRIVATE).getString(KEY, null);
    }

    private static int nightMode(String value) {
        if ("dark".equals(value)) return AppCompatDelegate.MODE_NIGHT_YES;
        return AppCompatDelegate.MODE_NIGHT_NO;
    }

    static void applyStartupTheme(Context context) {
        AppCompatDelegate.setDefaultNightMode(nightMode(preference(context)));
    }

    static void updateWindow(MainActivity activity) {
        String value = preference(activity);
        boolean dark = "dark".equals(value);
        int background = Color.parseColor(dark ? "#0F1720" : "#F2F6F7");
        // Edge-to-edge system bars show the window beneath the WebView insets.
        int chrome = Color.parseColor("#172B3A");
        activity.getWindow().setBackgroundDrawable(new ColorDrawable(chrome));
        activity.getWindow().setStatusBarColor(chrome);
        activity.getWindow().setNavigationBarColor(chrome);
        activity.getWindow().setStatusBarContrastEnforced(false);
        activity.getWindow().setNavigationBarContrastEnforced(false);
        if (activity.getBridge() != null && activity.getBridge().getWebView() != null) {
            activity.getBridge().getWebView().setBackgroundColor(background);
        }
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(
            activity.getWindow(), activity.getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);
    }

    private JSObject state() {
        JSObject result = new JSObject();
        result.put("preference", preference(getContext()) == null ? org.json.JSONObject.NULL : preference(getContext()));
        return result;
    }

    @PluginMethod
    public void getPreference(PluginCall call) {
        call.resolve(state());
    }

    @PluginMethod
    public void setPreference(PluginCall call) {
        String value = call.getString("preference", "light");
        if (!"light".equals(value) && !"dark".equals(value)) {
            call.reject("Invalid appearance preference.");
            return;
        }
        getContext().getSharedPreferences(STORE, Context.MODE_PRIVATE).edit().putString(KEY, value).apply();
        getActivity().runOnUiThread(() -> {
            AppCompatDelegate.setDefaultNightMode(nightMode(value));
            updateWindow((MainActivity) getActivity());
            call.resolve();
        });
    }

    @Override
    protected void handleOnResume() {
        updateWindow((MainActivity) getActivity());
        notifyListeners("systemThemeChanged", state());
    }

    @Override
    public void handleOnConfigurationChanged(Configuration newConfig) {
        updateWindow((MainActivity) getActivity());
        notifyListeners("systemThemeChanged", state());
    }
}
