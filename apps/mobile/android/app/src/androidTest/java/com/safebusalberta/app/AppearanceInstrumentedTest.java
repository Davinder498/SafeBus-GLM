package com.safebusalberta.app;

import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.view.WindowCompat;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Run only on a local emulator with placeholder frontend configuration. */
@RunWith(AndroidJUnit4.class)
public class AppearanceInstrumentedTest {
    private MainActivity activity;

    private String javascript(String source) throws Exception {
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
            activity.getBridge().getWebView().evaluateJavascript(source, value -> {
                result.set(value);
                done.countDown();
            })
        );
        assertTrue("WebView callback", done.await(10, TimeUnit.SECONDS));
        return result.get();
    }

    private void awaitJavascript(String condition) throws Exception {
        for (int attempt = 0; attempt < 150; attempt++) {
            if ("true".equals(javascript(condition))) return;
            Thread.sleep(100);
        }
        fail("WebView condition: " + condition);
    }

    private void launch() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Intent intent = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity = (MainActivity) InstrumentationRegistry.getInstrumentation().startActivitySync(intent);
    }

    private void select(String value) throws Exception {
        javascript("(() => { const s = document.querySelector('select[aria-label=Appearance]'); " +
            "s.value = '" + value + "'; s.dispatchEvent(new Event('change', {bubbles:true})); })()");
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        for (int attempt = 0; attempt < 100; attempt++) {
            if (value.equals(context.getSharedPreferences("safebus.appearance", Context.MODE_PRIVATE)
                .getString("safebus.theme", null))) return;
            Thread.sleep(100);
        }
        fail("Native preference was not saved: " + value);
    }

    @Test
    public void appearanceControlsNativeBarsAndSurvivesActivityRestart() throws Exception {
        assumeTrue(Build.MODEL.contains("sdk") || Build.FINGERPRINT.contains("generic"));
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        boolean placeholderBuild = false;
        for (String asset : context.getAssets().list("public/assets")) {
            if (!asset.endsWith(".js")) continue;
            try (java.io.InputStream stream = context.getAssets().open("public/assets/" + asset)) {
                placeholderBuild |= new String(stream.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8)
                    .contains("https://placeholder.supabase.co");
            }
        }
        assumeTrue("Native appearance QA requires placeholder service configuration", placeholderBuild);
        String previous = context.getSharedPreferences("safebus.appearance", Context.MODE_PRIVATE)
            .getString("safebus.theme", null);
        try {
            launch();
            awaitJavascript("!!document.querySelector('select[aria-label=Appearance]')");
            select("dark");
            awaitJavascript("document.documentElement.dataset.theme === 'dark'");
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                assertFalse(WindowCompat.getInsetsController(activity.getWindow(), activity.getWindow().getDecorView())
                    .isAppearanceLightStatusBars());
                activity.finish();
            });
            launch();
            awaitJavascript("!!document.querySelector('select[aria-label=Appearance]') && document.documentElement.dataset.theme === 'dark'");
            assertEquals("\"dark\"", javascript("document.querySelector('select[aria-label=Appearance]').value"));
            select("light");
            awaitJavascript("document.documentElement.dataset.theme === 'light'");
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                assertTrue(WindowCompat.getInsetsController(activity.getWindow(), activity.getWindow().getDecorView())
                    .isAppearanceLightStatusBars())
            );
            select("system");
            String expected = AppearancePlugin.systemDark() ? "dark" : "light";
            awaitJavascript("document.documentElement.dataset.theme === '" + expected + "'");
        } finally {
            context.getSharedPreferences("safebus.appearance", Context.MODE_PRIVATE).edit()
                .putString("safebus.theme", previous).commit();
            if (activity != null) InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.finish());
        }
    }
}
