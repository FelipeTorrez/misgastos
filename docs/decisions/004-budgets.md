# ADR 004 — Presupuestos

**Pregunta §40.4:** ¿Presupuesto basado solo en gastos o incluye ingresos?

**Decisión propuesta:** Solo gastos por categoría/mes.

`Budget { category_id, amount, period: monthly, month }`. `spent = SUM(transactions where type=expense AND category_id=... AND date_trunc(month))`. Ingresos van a balance pero no a presupuesto. Meta ahorro futura será entidad separada.

**Justificación:** Estándar app finanzas (YNAB, etc). Incluir ingresos complica MVP.

**Acción:** ¿Quieres presupuesto global además de por categoría?
