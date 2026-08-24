# ADR 003 — Tarjeta de crédito

**Pregunta §40.3:** Compra con TC vs pago TC.

**Decisión propuesta:** Modelo 2 pasos:
1. Compra: Transaction expense `payment_method=credit_card`, `account_id=TC`, amount $100k, date compra. Afecta balance de TC (deuda), no de cuenta corriente.
2. Pago tarjeta: Transaction type=transfer `from=checking` `to=TC` por monto pagado. Reduce deuda TC, reduce balance checking.

No doble conteo. Cuotas: misma compra pero con `installment_number/total` y `original_amount`. Cada cuota es una Transaction separada vinculada por `original_transaction_id` (futuro).

**Acción:** Confirmar si en MVP necesitas cuotas o solo categoría "Cuota" (§10).
