# ADR 001 — Cuentas

**Pregunta §40.1:** ¿Qué es una "cuenta"?

**Decisión CONFIRMADA 2026-08-24:** `Account.type` enum SIN `investment` en MVP:
- `checking` (Corriente), `vista` (Cuenta Vista/RUT), `savings` (Ahorro), `credit_card`, `cash` (Efectivo), `digital_wallet` (MercadoPago, Mach, Tenpo)

Campos: name, currency (CLP), include_in_balance (default true), credit_limit (solo credit_card), last4, icon, color.

**Justificación:** Cubre Chile (Vista/RUT es esencial), cash para gastos manuales, digital_wallet para ecosistema local. `investment` queda para Phase 10 (usuario confirmó excluir en MVP).

**Estado:** ✅ Cerrado
