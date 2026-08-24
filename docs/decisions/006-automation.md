# ADR 006 — Automatización vs Confirmación

**Pregunta §40.6:** ¿Qué se registra auto y qué requiere confirmación?

**Decisión CONFIRMADA 2026-08-24:** **Todo a revisión la primera semana**, luego se evalúa auto-confirm. Todo evento externo -> `pending_review`. Ingreso manual -> `confirmed`. Auto-confirm (`confidence>=0.95` + Rule) desactivado inicialmente.

**Estado:** ✅ Cerrado
