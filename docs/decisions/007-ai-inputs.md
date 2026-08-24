# ADR 007 — IA inputs y abstención

**Pregunta §40.7:** ¿Qué recibe Agent #1, qué nunca, cuándo abstenerse?

**Decisión propuesta:**
- **Recibe:** normalized_text (lowercase, sin PII), parser_hints (amount, date, merchant_guess), categorías válidas, user_rules (merchant prefs), locale.
- **Nunca:** raw email headers completos, RUT/tarjeta completa, token, datos otro usuario, raw_content completo si >500 chars (trunca).
- **Abstención:** Si amount==null O (confidence<0.6 Y sin Rule) -> `needs_review=true`, category="otros", confidence 0.5, reason="amount_not_found" o "low_confidence".

**Justificación:** Minimiza costo, PII y errores. Parser primero (§14) ya resuelve 70% determinístico.

**Acción:** Confirmar truncado a 500 chars es suficiente (bancos chilenos suelen <300).
