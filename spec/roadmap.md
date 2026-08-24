# Roadmap (§35)

## Phase 0 — Product Spec (ACTUAL) ✅
- Manifiesto v0.1 + /spec v0.1 completo
- Decisiones §40 cerradas con propuestas (ver docs/decisions/*)

## Phase 1 — Core Finance (PRÓXIMO, 2-3 semanas)
Sin IA. Usuarios, cuentas, categorías, transacciones, balance, presupuestos. Supabase + RLS + API + Mobile CRUD. Criterio: balance correcto con datos manuales.

## Phase 2 — Manual + Fake Data (1 semana)
Dataset 100 fixtures, valida UX y reglas. Test RLS.

## Phase 3 — Email Ingestion (1-2 semanas)
Reenvío email -> RawEvent -> Parser -> Transaction. Idempotencia.

## Phase 4 — AI Classification (1-2 semanas)
Agent #1 con Groq, JSON Schema, validación, fallback. Parser primero reduce costos.

## Phase 5 — Deduplication (1 semana)
Email + notificación sin duplicados. Ventana 10min, fuzzy merchant.

## Phase 6 — Android Notification (1 semana)
NotificationListenerService + POST ingestion.

## Phase 7 — iOS Experience (1 semana)
Share extension + PDF picker, paridad funcional.

## Phase 8 — Personal Rules (3 días)
Corrección -> Rule -> auto-apply.

## Phase 9 — Financial Advisor (post-MVP)
Agent #2 insights.

## Phase 10 — Hardening
Seguridad, performance, backups, analytics, publicación TestFlight/Play Internal.

## Hito crítico §37
INPUT "Compra $32.990 Lider tarjeta 1234" -> NORMALIZED -> AI/PARSER -> VALIDATED -> DB -> UI. Si esto funciona, el resto es agregar fuentes.
