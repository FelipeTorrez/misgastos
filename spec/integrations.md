# Integrations Spec — Source Connectors (§11)

## Modelo Source Connector
Interface:
```ts
interface SourceConnector {
  id: string; type: string;
  ingest(event: RawEventInput): Promise<RawEvent>;
  normalize(raw: RawEvent): NormalizedEvent;
}
```

## 11.1 Gmail
- Fase 1: Reenvío selectivo a ingestion email (ej: misgastos+ingest@...) + parser. Sin OAuth, valida flujo completo.
- Fase 2: OAuth Gmail API scope `gmail.readonly` (restricted, requiere verificación Google y privacy policy). Poll via `users.messages.list` con query `from:banco` o push via Pub/Sub.
- Almacena: sender, subject, raw_content, gmail messageId como source_id (idempotente)

## 11.2 Android Notifications
- `NotificationListenerService` requiere permiso `BIND_NOTIFICATION_LISTENER_SERVICE` y opt-in usuario
- Plugin Expo: `expo-notification-listener` o módulo nativo custom (`android/src/main/java/...`)
- Flujo: Notification -> App (filtrada por package: Santander, BCI, BancoEstado, MercadoPago) -> POST /ingestion/notification -> RawEvent source=android_notification
- Limitaciones: solo texto de notificación, no accede a contenido app; usuario puede desactivar por app

## 11.3 iOS
- Asunción: SIN acceso a notificaciones de terceros. Fuentes: Gmail, PDF import, share extension, manual.
- Share Extension: usuario comparte email/PDF a la app -> RawEvent source=ios_share
- Document picker para cartolas PDF (parser local con pdf.js)

## 11.4 Manual
- Siempre disponible: + Agregar movimiento (gasto/ingreso/transferencia)
- Crea Transaction directamente con status=confirmed, sin RawEvent (o con RawEvent manual)

## PDF / Cartola (futuro)
- Parser con regex + tabla; fallback a IA si layout desconocido
