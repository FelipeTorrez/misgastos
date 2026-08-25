/**
 * Expo config plugin — Phase 6 Android NotificationListenerService §11.2
 * Solo se activa en dev-build / EAS. Expo Go lo ignora (mock).
 * Uso: en app.json -> plugins: ["./plugins/withNotificationListener"]
 */
const { withAndroidManifest, withProjectBuildGradle } = require("@expo/config-plugins");

function withNotificationListener(config) {
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    if (!manifest.application) manifest.application = [{}];
    const app = manifest.application[0];
    if (!app.service) app.service = [];
    // Registra NotificationListenerService (implementado en android/app/src/main/java/...)
    const exists = app.service.some(s => s.$?.["android:name"] === ".NotificationListener");
    if (!exists) {
      app.service.push({
        $: {
          "android:name": ".NotificationListener",
          "android:label": "MisGastos Listener",
          "android:permission": "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE",
          "android:exported": "true"
        },
        "intent-filter": [{ action: [{ $: { "android:name": "android.service.notification.NotificationListenerService" } }] }]
      });
    }
    // Permiso POST_NOTIFICATIONS para Android 13+
    if (!manifest["uses-permission"]) manifest["uses-permission"] = [];
    const hasPost = manifest["uses-permission"].some(p => p.$?.["android:name"] === "android.permission.POST_NOTIFICATIONS");
    if (!hasPost) manifest["uses-permission"].push({ $: { "android:name": "android.permission.POST_NOTIFICATIONS" } });
    return cfg;
  });
  return config;
}

module.exports = withNotificationListener;
