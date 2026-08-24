# ADR 003 — Tarjeta de crédito / Cuotas

**Pregunta §40.3 y §10:** Compra con TC vs pago TC. ¿Cuotas en MVP?

**Decisión CONFIRMADA 2026-08-24:** **Solo categoría `crédito/cuota`** en MVP, sin módulo cuotas. Campos `installment_*` quedan en schema preparados pero no usados.

Modelo 2 pasos: 1) Compra expense `payment_method=credit_card` contra cuenta TC, 2) Pago TC = transfer `checking->TC`. Sin doble conteo.

**Estado:** ✅ Cerrado — cuotas para versión futura.
