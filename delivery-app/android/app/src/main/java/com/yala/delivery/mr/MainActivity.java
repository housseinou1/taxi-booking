package com.yala.delivery.mr;

import android.os.Build;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onStart() {
        super.onStart();
        injectTrustSignals();
    }

    private void injectTrustSignals() {
        try {
            boolean emulator = isEmulator();
            String script =
                "window.__YALA_DEVICE_TRUST__={"
                    + "isEmulator:" + emulator + ","
                    + "isRooted:false,"
                    + "isTampered:false"
                    + "};";
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                webView.post(() -> webView.evaluateJavascript(script, null));
            }
        } catch (Exception ignored) {
        }
    }

    private boolean isEmulator() {
        return Build.FINGERPRINT.startsWith("generic")
            || Build.FINGERPRINT.startsWith("unknown")
            || Build.MODEL.contains("google_sdk")
            || Build.MODEL.contains("Emulator")
            || Build.MODEL.contains("Android SDK built for x86")
            || Build.MANUFACTURER.contains("Genymotion")
            || (Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic"))
            || "google_sdk".equals(Build.PRODUCT);
    }
}
