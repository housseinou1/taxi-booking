package com.yala.delivery.mr;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Notification;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerDeliveryNotificationChannels();
    }

    @Override
    public void onResume() {
        super.onResume();
        allowInsecureWebSocketForLocalDev();
    }

    private void allowInsecureWebSocketForLocalDev() {
        if (getBridge() == null) {
            return;
        }
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
    }

    private void registerDeliveryNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        Uri alertSound = Uri.parse(
            "android.resource://" + getPackageName() + "/" + R.raw.delivery_request
        );

        NotificationChannel offers = new NotificationChannel(
            "yala_deliveries",
            "Yala delivery offers",
            NotificationManager.IMPORTANCE_HIGH
        );
        offers.setDescription("New delivery requests with alert sound");
        offers.enableVibration(true);
        offers.setSound(alertSound, audioAttributes);
        offers.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        offers.enableLights(true);
        manager.createNotificationChannel(offers);

        NotificationChannel updates = new NotificationChannel(
            "yala_delivery_updates",
            "Yala delivery updates",
            NotificationManager.IMPORTANCE_HIGH
        );
        updates.setDescription("Delivery status updates");
        updates.enableVibration(true);
        updates.setSound(alertSound, audioAttributes);
        manager.createNotificationChannel(updates);
    }
}
