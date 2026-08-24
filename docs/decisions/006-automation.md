# ADR 006 — Automatización vs Confirmación

**Pregunta §40.6:** ¿Qué se registra auto y qué requiere confirmación?

**Decisión propuesta:**
- Todo evento externo -> `pending_review` por defecto.
- Auto-confirm solo si: `confidence >= 0.95` Y `Rule existe` Y `amount/date parser confiable` Y user setting `auto_confirm_high_confidence=true`.
- Ingreso manual -> `confirmed` directo.
- Usuario puede cambiar setting a "todo a revisión" (recomendado inicial).

**Justificación:** Balance entre automatización (§3.1) y supervisión (§3.2). Evita errores silenciosos en finanzas.

**Acción:** ¿Prefieres auto-confirm activo desde inicio o todo a revisión las primeras 2 semanas?
