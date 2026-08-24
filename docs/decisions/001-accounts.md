# ADR 001 — Cuentas

**Pregunta §40.1:** ¿Qué es una "cuenta"?

**Decisión propuesta:** `Account.type` enum:
- `checking` (Corriente), `vista` (Cuenta Vista/RUT), `savings` (Ahorro), `credit_card`, `cash` (Efectivo), `digital_wallet` (MercadoPago, Mach, Tenpo), `investment`

Campos: name, currency (CLP), include_in_balance (default true), credit_limit (solo credit_card), last4, icon, color.

**Justificación:** Cubre Chile (Vista/RUT es esencial), cash para gastos manuales, digital_wallet para ecosistema local. `include_in_balance=false` permite excluir cupos no disponibles.

**Alternativa rechazada:** Tabla separada por tipo — over-engineering MVP.

**Acción requerida:** Confirmar si necesitas `investment` en MVP o lo dejamos para Phase 10.
