# ADR 007 — IA inputs y abstención

**Pregunta §40.7:** ¿Qué recibe Agent #1, qué nunca, cuándo abstenerse?

**Decisión CONFIRMADA 2026-08-24:** 500 chars es suficiente (confirmado). Recibe `normalized_text` truncado + parser_hints + categorías, nunca raw completo/RUT. Abstención si `amount==null` o `conf<0.6`.

**Estado:** ✅ Cerrado
